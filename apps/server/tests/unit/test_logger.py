import json
import logging
import sys

from utils.logger import (
    ExceptionContextFilter,
    JsonFormatter,
    bind_log_context,
    reset_log_context,
    sanitize_log_value,
)


def test_nested_sensitive_fields_are_redacted():
    value = sanitize_log_value({"headers": {"Authorization": "Bearer top-secret"}, "ok": True})
    assert value["headers"]["Authorization"] == "[REDACTED]"
    assert value["ok"] is True


def test_strings_redact_jwts_and_prevent_log_injection():
    token = "eyJabcdefghijk.abcdefghijk.abcdefghijk"
    value = sanitize_log_value(f"value={token}\r\nforged")
    assert token not in value
    assert "\n" not in value
    assert "\\r\\n" in value


def test_json_formatter_includes_context_and_exception(monkeypatch):
    monkeypatch.setenv("SERVICE_VERSION", "abc123")
    formatter = JsonFormatter()
    context_token = bind_log_context(request_id="request-123")
    try:
        try:
            raise ValueError("safe failure")
        except ValueError:
            record = logging.getLogger("test").makeRecord(
                "test",
                logging.ERROR,
                __file__,
                1,
                "failed",
                (),
                sys.exc_info(),
                extra={"event_name": "test.failed", "authorization": "Bearer secret"},
            )
        payload = json.loads(formatter.format(record))
    finally:
        reset_log_context(context_token)

    assert payload["request_id"] == "request-123"
    assert payload["service.version"] == "abc123"
    assert payload["event.name"] == "test.failed"
    assert payload["authorization"] == "[REDACTED]"
    assert payload["error.type"] == "ValueError"
    assert "ValueError: safe failure" in payload["error.stack"]


def test_error_filter_preserves_active_exception_for_legacy_error_call():
    formatter = JsonFormatter()
    try:
        raise RuntimeError("bounded failure")
    except RuntimeError:
        record = logging.getLogger("test").makeRecord(
            "test", logging.ERROR, __file__, 1, "operation failed", (), None
        )
        assert ExceptionContextFilter().filter(record)

    payload = json.loads(formatter.format(record))
    assert payload["error.type"] == "RuntimeError"
    assert "RuntimeError: bounded failure" in payload["error.stack"]
