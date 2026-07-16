"""Low-cardinality service metrics and optional OpenTelemetry tracing."""

from __future__ import annotations

import functools
import json
import time
from collections.abc import Callable
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from prometheus_client import Counter, Gauge, Histogram


HTTP_REQUESTS = Counter(
    "ttrpg_http_requests_total",
    "Completed HTTP requests.",
    ("method", "route", "status_class"),
)
HTTP_DURATION = Histogram(
    "ttrpg_http_request_duration_seconds",
    "HTTP request duration.",
    ("method", "route"),
)
WS_CONNECTIONS = Counter(
    "ttrpg_websocket_connections_total",
    "WebSocket connection outcomes.",
    ("outcome", "reason"),
)
WS_ACTIVE = Gauge("ttrpg_websocket_active_connections", "Active WebSocket connections.")
WS_DURATION = Histogram(
    "ttrpg_websocket_connection_duration_seconds", "WebSocket connection duration."
)
WS_MESSAGES = Counter(
    "ttrpg_websocket_messages_total",
    "WebSocket message outcomes.",
    ("direction", "message_type", "outcome"),
)
WS_MESSAGE_DURATION = Histogram(
    "ttrpg_websocket_message_duration_seconds",
    "WebSocket message handling duration.",
    ("message_type",),
)
ASSET_OPERATIONS = Counter(
    "ttrpg_asset_operations_total",
    "Asset operation outcomes.",
    ("operation", "outcome"),
)
ASSET_OPERATION_DURATION = Histogram(
    "ttrpg_asset_operation_duration_seconds",
    "Asset operation duration.",
    ("operation",),
)
BROWSER_ERRORS = Counter(
    "ttrpg_browser_errors_total",
    "Accepted browser error reports.",
    ("event_type", "release"),
)
DB_OPERATIONS = Counter(
    "ttrpg_database_operations_total",
    "Database operation outcomes.",
    ("operation", "outcome"),
)
DB_OPERATION_DURATION = Histogram(
    "ttrpg_database_operation_duration_seconds",
    "Database operation duration.",
    ("operation",),
)
DB_TRANSACTIONS = Counter(
    "ttrpg_database_transactions_total",
    "Database transaction outcomes.",
    ("outcome",),
)
DB_TRANSACTION_DURATION = Histogram(
    "ttrpg_database_transaction_duration_seconds",
    "Database transaction duration.",
    ("outcome",),
)
DB_POOL_CONNECTIONS = Gauge(
    "ttrpg_database_pool_connections",
    "Application database pool connections by bounded state.",
    ("state",),
)
AUTH_OPERATIONS = Counter(
    "ttrpg_auth_operations_total",
    "Authentication operation outcomes.",
    ("operation", "outcome", "reason"),
)
RATE_LIMIT_DECISIONS = Counter(
    "ttrpg_rate_limit_decisions_total",
    "Rate-limit decisions.",
    ("limiter", "outcome"),
)
EMAIL_DELIVERIES = Counter(
    "ttrpg_email_deliveries_total",
    "Email delivery outcomes.",
    ("operation", "outcome"),
)
BACKGROUND_JOBS = Counter(
    "ttrpg_background_jobs_total",
    "Background and operational job outcomes.",
    ("job", "outcome"),
)
BACKGROUND_JOB_DURATION = Histogram(
    "ttrpg_background_job_duration_seconds",
    "Background and operational job duration.",
    ("job",),
)
BACKGROUND_JOB_LAST_SUCCESS = Gauge(
    "ttrpg_background_job_last_success_timestamp_seconds",
    "Unix timestamp of the latest successful in-process job run.",
    ("job",),
)
PENDING_UPLOADS = Gauge(
    "ttrpg_pending_uploads",
    "Durable asset upload intents awaiting confirmation.",
)
PENDING_UPLOAD_OLDEST_AGE = Gauge(
    "ttrpg_pending_upload_oldest_age_seconds",
    "Age of the oldest durable upload intent awaiting confirmation.",
)
BACKUP_LAST_SUCCESS = Gauge(
    "ttrpg_backup_last_success_timestamp_seconds",
    "Creation time of the newest local verified-backup manifest, or zero if absent.",
)
OBSERVABILITY_EXPORTER_CONFIGURED = Gauge(
    "ttrpg_observability_exporter_configured",
    "Whether an observability exporter is configured.",
    ("exporter",),
)
METRIC_REFRESHES = Counter(
    "ttrpg_metric_refreshes_total",
    "Durable metric refresh outcomes.",
    ("outcome",),
)

_KNOWN_MESSAGE_TYPES: set[str] | None = None
_DATABASE_METRICS_INSTALLED = False

_DATABASE_OPERATIONS = {"select", "insert", "update", "delete", "pragma", "ddl"}
_AUTH_OPERATIONS = {"password", "token", "oauth", "logout", "unknown"}
_AUTH_OUTCOMES = {"success", "failure", "denied"}
_AUTH_REASONS = {
    "none", "invalid_credentials", "invalid_token", "inactive", "rate_limit",
    "provider_error", "configuration", "unknown",
}
_LIMITERS = {"login", "registration", "password_reset", "browser_telemetry", "demo", "unknown"}
_EMAIL_OPERATIONS = {"password_reset", "password_changed", "email_change_verify", "email_change_notify", "unknown"}
_JOB_NAMES = {"rate_limit_cleanup", "audit_retention", "database_backup", "database_restore", "r2_smoke", "r2_orphan_audit", "r2_backup", "r2_restore", "migration", "unknown"}


def _message_type(value: Any) -> str:
    """Bound metric labels to the protocol enum; never accept arbitrary client labels."""
    global _KNOWN_MESSAGE_TYPES
    if _KNOWN_MESSAGE_TYPES is None:
        from core_table.protocol import MessageType

        _KNOWN_MESSAGE_TYPES = {item.value for item in MessageType}
    candidate = str(value or "unknown")
    return candidate if candidate in _KNOWN_MESSAGE_TYPES else "unknown"


def observe_http(method: str, route: str, status_code: int, duration: float) -> None:
    route_label = route if route.startswith("/") and "http" not in route else "unmatched"
    method_label = method.upper() if method.upper() in {"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"} else "OTHER"
    HTTP_REQUESTS.labels(method_label, route_label, f"{status_code // 100}xx").inc()
    HTTP_DURATION.labels(method_label, route_label).observe(duration)


def record_ws_connection(outcome: str, reason: str = "none") -> None:
    allowed_outcomes = {"opened", "closed", "rejected", "error"}
    allowed_reasons = {
        "none", "origin", "authentication", "session_not_found", "not_member",
        "banned", "rate_limit", "message_too_large", "server_error",
    }
    WS_CONNECTIONS.labels(
        outcome if outcome in allowed_outcomes else "error",
        reason if reason in allowed_reasons else "server_error",
    ).inc()


def record_ws_message(direction: str, message_type: Any, outcome: str, duration: float | None = None) -> None:
    type_label = _message_type(message_type)
    WS_MESSAGES.labels(
        direction if direction in {"inbound", "outbound"} else "inbound",
        type_label,
        outcome if outcome in {"success", "rejected", "error"} else "error",
    ).inc()
    if duration is not None:
        WS_MESSAGE_DURATION.labels(type_label).observe(duration)


def track_asset_operation(operation: str) -> Callable:
    """Measure an async asset boundary without asset/user/session label cardinality."""
    def decorator(func: Callable) -> Callable:
        @functools.wraps(func)
        async def wrapped(*args: Any, **kwargs: Any) -> Any:
            started = time.perf_counter()
            outcome = "error"
            try:
                result = await func(*args, **kwargs)
                outcome = "success" if getattr(result, "success", True) else "rejected"
                return result
            finally:
                ASSET_OPERATIONS.labels(operation, outcome).inc()
                ASSET_OPERATION_DURATION.labels(operation).observe(time.perf_counter() - started)

        return wrapped

    return decorator


def record_auth(operation: str, outcome: str, reason: str = "none") -> None:
    AUTH_OPERATIONS.labels(
        operation if operation in _AUTH_OPERATIONS else "unknown",
        outcome if outcome in _AUTH_OUTCOMES else "failure",
        reason if reason in _AUTH_REASONS else "unknown",
    ).inc()


def record_rate_limit(limiter: str, allowed: bool) -> None:
    RATE_LIMIT_DECISIONS.labels(
        limiter if limiter in _LIMITERS else "unknown",
        "allowed" if allowed else "rejected",
    ).inc()


def record_email(operation: str, outcome: str) -> None:
    EMAIL_DELIVERIES.labels(
        operation if operation in _EMAIL_OPERATIONS else "unknown",
        outcome if outcome in {"success", "error", "disabled"} else "error",
    ).inc()


def record_job(job: str, outcome: str, duration: float) -> None:
    job_label = job if job in _JOB_NAMES else "unknown"
    outcome_label = outcome if outcome in {"success", "error"} else "error"
    BACKGROUND_JOBS.labels(job_label, outcome_label).inc()
    BACKGROUND_JOB_DURATION.labels(job_label).observe(max(duration, 0.0))
    if outcome_label == "success":
        BACKGROUND_JOB_LAST_SUCCESS.labels(job_label).set(time.time())


def _database_operation(statement: str) -> str:
    token = statement.lstrip().split(None, 1)[0].lower() if statement.strip() else "other"
    if token in {"create", "alter", "drop"}:
        return "ddl"
    return token if token in _DATABASE_OPERATIONS else "other"


def install_database_metrics(engine: Any, session_factory: Any) -> None:
    """Attach low-cardinality SQLAlchemy engine, pool, and transaction metrics once."""
    global _DATABASE_METRICS_INSTALLED
    if _DATABASE_METRICS_INSTALLED:
        return

    from sqlalchemy import event

    @event.listens_for(engine, "before_cursor_execute")
    def before_cursor_execute(conn, cursor, statement, parameters, context, executemany):
        context._ttrpg_metric_started = time.perf_counter()

    @event.listens_for(engine, "after_cursor_execute")
    def after_cursor_execute(conn, cursor, statement, parameters, context, executemany):
        operation = _database_operation(statement)
        DB_OPERATIONS.labels(operation, "success").inc()
        started = getattr(context, "_ttrpg_metric_started", time.perf_counter())
        DB_OPERATION_DURATION.labels(operation).observe(time.perf_counter() - started)

    @event.listens_for(engine, "handle_error")
    def handle_error(exception_context):
        context = exception_context.execution_context
        statement = exception_context.statement or ""
        operation = _database_operation(statement)
        DB_OPERATIONS.labels(operation, "error").inc()
        started = getattr(context, "_ttrpg_metric_started", None) if context else None
        if started is not None:
            DB_OPERATION_DURATION.labels(operation).observe(time.perf_counter() - started)

    def refresh_pool() -> None:
        pool = engine.pool
        for state, method in (
            ("size", "size"),
            ("checked_out", "checkedout"),
            ("overflow", "overflow"),
        ):
            value = getattr(pool, method, None)
            if callable(value):
                DB_POOL_CONNECTIONS.labels(state).set(max(value(), 0))

    @event.listens_for(engine, "checkout")
    def pool_checkout(dbapi_connection, connection_record, connection_proxy):
        refresh_pool()

    @event.listens_for(engine, "checkin")
    def pool_checkin(dbapi_connection, connection_record):
        refresh_pool()

    @event.listens_for(session_factory, "after_begin")
    def transaction_started(session, transaction, connection):
        if not transaction.nested:
            session.info.setdefault("_ttrpg_transaction_started", time.perf_counter())

    def transaction_finished(session: Any, outcome: str) -> None:
        started = session.info.pop("_ttrpg_transaction_started", None)
        DB_TRANSACTIONS.labels(outcome).inc()
        if started is not None:
            DB_TRANSACTION_DURATION.labels(outcome).observe(time.perf_counter() - started)

    @event.listens_for(session_factory, "after_commit")
    def transaction_committed(session):
        transaction_finished(session, "commit")

    @event.listens_for(session_factory, "after_rollback")
    def transaction_rolled_back(session):
        transaction_finished(session, "rollback")

    refresh_pool()
    _DATABASE_METRICS_INSTALLED = True


def refresh_durable_metrics(db: Any, backup_root: str | Path) -> None:
    """Refresh bounded DB/disk gauges only when the protected metrics endpoint is scraped."""
    try:
        from database.models import AssetUploadIntent

        pending = db.query(AssetUploadIntent).filter(
            AssetUploadIntent.status == "awaiting_upload"
        )
        count = pending.count()
        oldest = pending.order_by(AssetUploadIntent.created_at.asc()).first()
        PENDING_UPLOADS.set(count)
        oldest_age = 0.0
        if oldest and oldest.created_at:
            created_at = oldest.created_at
            if created_at.tzinfo is None:
                created_at = created_at.replace(tzinfo=timezone.utc)
            oldest_age = max((datetime.now(timezone.utc) - created_at).total_seconds(), 0.0)
        PENDING_UPLOAD_OLDEST_AGE.set(oldest_age)

        latest_backup = 0.0
        root = Path(backup_root)
        if root.is_dir():
            for manifest_path in root.glob("*/manifest.json"):
                try:
                    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
                    if manifest.get("schema_version") != 1:
                        continue
                    created_at = datetime.fromisoformat(str(manifest["created_at"]).replace("Z", "+00:00"))
                    latest_backup = max(latest_backup, created_at.timestamp())
                except (OSError, ValueError, KeyError, TypeError, json.JSONDecodeError):
                    continue
        BACKUP_LAST_SUCCESS.set(latest_backup)
        METRIC_REFRESHES.labels("success").inc()
    except Exception:
        METRIC_REFRESHES.labels("error").inc()
        raise


def configure_tracing(app: Any, engine: Any, settings: Any) -> bool:
    """Configure OTLP tracing only when an exporter endpoint is explicitly supplied."""
    if not settings.OTEL_EXPORTER_OTLP_ENDPOINT:
        OBSERVABILITY_EXPORTER_CONFIGURED.labels("otlp_traces").set(0)
        return False

    from opentelemetry import trace
    from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
    from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor
    from opentelemetry.instrumentation.sqlalchemy import SQLAlchemyInstrumentor
    from opentelemetry.sdk.resources import Resource
    from opentelemetry.sdk.trace import TracerProvider
    from opentelemetry.sdk.trace.export import BatchSpanProcessor
    from opentelemetry.sdk.trace.sampling import ParentBased, TraceIdRatioBased

    headers = {}
    for item in settings.OTEL_EXPORTER_OTLP_HEADERS.split(","):
        if "=" in item:
            key, value = item.split("=", 1)
            headers[key.strip()] = value.strip()
    provider = TracerProvider(
        resource=Resource.create(
            {
                "service.name": settings.SERVICE_NAME,
                "service.version": settings.SERVICE_VERSION,
                "deployment.environment.name": settings.ENVIRONMENT,
            }
        ),
        sampler=ParentBased(TraceIdRatioBased(settings.OTEL_TRACES_SAMPLER_ARG)),
    )
    provider.add_span_processor(
        BatchSpanProcessor(
            OTLPSpanExporter(endpoint=settings.OTEL_EXPORTER_OTLP_ENDPOINT, headers=headers)
        )
    )
    trace.set_tracer_provider(provider)
    FastAPIInstrumentor.instrument_app(app, tracer_provider=provider)
    SQLAlchemyInstrumentor().instrument(engine=engine, tracer_provider=provider)
    OBSERVABILITY_EXPORTER_CONFIGURED.labels("otlp_traces").set(1)
    return True
