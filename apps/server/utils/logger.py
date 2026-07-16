"""Application-wide structured logging with context propagation and redaction."""

from __future__ import annotations

import contextlib
import contextvars
import json
import logging
import os
import re
import sys
import traceback
from datetime import datetime, timezone
from typing import Any, Iterator, Mapping


_LOG_CONTEXT: contextvars.ContextVar[dict[str, Any]] = contextvars.ContextVar(
    "log_context", default={}
)
_CONFIGURED = False
_HANDLER_MARKER = "_ttrpg_handler"
_RESERVED = set(logging.makeLogRecord({}).__dict__) | {"message", "asctime"}
_SENSITIVE_KEY = re.compile(
    r"(?:authorization|cookie|password|passwd|secret|token|credential|api[_-]?key|"
    r"presigned|upload_url|session_id)",
    re.IGNORECASE,
)
_BEARER = re.compile(r"(?i)\bBearer\s+[A-Za-z0-9._~+/-]+=*")
_JWT = re.compile(r"\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b")
_SECRET_QUERY = re.compile(
    r"(?i)([?&](?:token|access_token|code|signature|x-amz-signature)=)[^&#\s]+"
)


def _configured_level() -> int:
    default = "INFO" if os.getenv("ENVIRONMENT", "development").lower() == "production" else "DEBUG"
    name = os.getenv("LOG_LEVEL", default).upper()
    return getattr(logging, name, logging.INFO)


def _configured_format() -> str:
    default = "json" if os.getenv("ENVIRONMENT", "development").lower() == "production" else "text"
    value = os.getenv("LOG_FORMAT", default).lower()
    return value if value in {"json", "text"} else default


def _sanitize_string(value: str) -> str:
    value = value.replace("\r", "\\r").replace("\n", "\\n")
    value = _BEARER.sub("Bearer [REDACTED]", value)
    value = _JWT.sub("[REDACTED_JWT]", value)
    value = _SECRET_QUERY.sub(r"\1[REDACTED]", value)
    return value if len(value) <= 4096 else f"{value[:4096]}...[TRUNCATED]"


def sanitize_log_value(value: Any, *, key: str = "", depth: int = 0) -> Any:
    """Return a bounded JSON-safe value with sensitive fields removed."""
    if _SENSITIVE_KEY.search(key):
        return "[REDACTED]"
    if depth >= 6:
        return "[MAX_DEPTH]"
    if value is None or isinstance(value, (bool, int, float)):
        return value
    if isinstance(value, str):
        return _sanitize_string(value)
    if isinstance(value, Mapping):
        return {
            _sanitize_string(str(item_key)): sanitize_log_value(
                item_value, key=str(item_key), depth=depth + 1
            )
            for item_key, item_value in list(value.items())[:100]
        }
    if isinstance(value, (list, tuple, set)):
        return [sanitize_log_value(item, depth=depth + 1) for item in list(value)[:100]]
    return _sanitize_string(str(value))


def current_log_context() -> dict[str, Any]:
    return dict(_LOG_CONTEXT.get())


def bind_log_context(**fields: Any) -> contextvars.Token:
    context = current_log_context()
    context.update({key: value for key, value in fields.items() if value is not None})
    return _LOG_CONTEXT.set(context)


def reset_log_context(token: contextvars.Token) -> None:
    _LOG_CONTEXT.reset(token)


@contextlib.contextmanager
def log_context(**fields: Any) -> Iterator[None]:
    token = bind_log_context(**fields)
    try:
        yield
    finally:
        reset_log_context(token)


class JsonFormatter(logging.Formatter):
    """Stable JSON event schema suitable for stdout log collection."""

    def format(self, record: logging.LogRecord) -> str:
        event: dict[str, Any] = {
            "timestamp": datetime.fromtimestamp(record.created, timezone.utc).isoformat(
                timespec="milliseconds"
            ).replace("+00:00", "Z"),
            "severity": record.levelname,
            "service.name": os.getenv("SERVICE_NAME", "ttrpg-server"),
            "service.version": os.getenv(
                "SERVICE_VERSION", os.getenv("RENDER_GIT_COMMIT", "development")
            ),
            "deployment.environment": os.getenv("ENVIRONMENT", "development"),
            "logger": record.name,
            "event.name": getattr(record, "event_name", record.getMessage()),
            "message": sanitize_log_value(record.getMessage()),
        }
        instance_id = os.getenv("SERVICE_INSTANCE_ID", os.getenv("RENDER_INSTANCE_ID", ""))
        if instance_id:
            event["service.instance.id"] = sanitize_log_value(instance_id)
        event.update(sanitize_log_value(current_log_context()))
        extras = {
            key: value
            for key, value in record.__dict__.items()
            if key not in _RESERVED and not key.startswith("_") and key != "event_name"
        }
        event.update(sanitize_log_value(extras))
        if record.exc_info:
            exc_type, exc_value, exc_tb = record.exc_info
            event["error.type"] = exc_type.__name__ if exc_type else "Exception"
            event["error.message"] = sanitize_log_value(str(exc_value))
            event["error.stack"] = sanitize_log_value(
                "".join(traceback.format_exception(exc_type, exc_value, exc_tb))
            )
        return json.dumps(event, separators=(",", ":"), ensure_ascii=False, default=str)


class TextFormatter(logging.Formatter):
    converter = lambda *args: datetime.now(timezone.utc).timetuple()  # noqa: E731

    def __init__(self) -> None:
        super().__init__("%(asctime)sZ - %(name)s - %(levelname)s - %(message)s")

    def format(self, record: logging.LogRecord) -> str:
        original_msg, original_args = record.msg, record.args
        record.msg, record.args = sanitize_log_value(record.getMessage()), ()
        try:
            return super().format(record)
        finally:
            record.msg, record.args = original_msg, original_args


class ExceptionContextFilter(logging.Filter):
    """Preserve active exception context for legacy error calls during migration."""

    def filter(self, record: logging.LogRecord) -> bool:
        active_exception = sys.exc_info()
        if (
            record.levelno >= logging.ERROR
            and not record.exc_info
            and active_exception[0] is not None
        ):
            record.exc_info = active_exception
        return True


def configure_logging(*, level: str | int | None = None, log_format: str | None = None) -> None:
    """Configure one root stdout handler; safe to call more than once."""
    global _CONFIGURED
    resolved_level = (
        getattr(logging, level.upper(), logging.INFO)
        if isinstance(level, str)
        else level if isinstance(level, int) else _configured_level()
    )
    resolved_format = (log_format or _configured_format()).lower()
    root = logging.getLogger()
    handler = next(
        (item for item in root.handlers if getattr(item, _HANDLER_MARKER, False)), None
    )
    if handler is None:
        handler = logging.StreamHandler(sys.stdout)
        setattr(handler, _HANDLER_MARKER, True)
        root.addHandler(handler)
    handler.setLevel(resolved_level)
    if not any(isinstance(item, ExceptionContextFilter) for item in handler.filters):
        handler.addFilter(ExceptionContextFilter())
    handler.setFormatter(JsonFormatter() if resolved_format == "json" else TextFormatter())
    root.setLevel(resolved_level)
    logging.captureWarnings(True)
    _CONFIGURED = True


def setup_logger(name: str = "ttrpg", level: int | None = None) -> logging.Logger:
    """Return a named logger that inherits the application-wide configuration."""
    if not _CONFIGURED:
        configure_logging(level=level)
    logger = logging.getLogger(name)
    logger.setLevel(logging.NOTSET)
    return logger
