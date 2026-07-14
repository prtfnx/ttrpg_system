"""Low-cardinality service metrics and optional OpenTelemetry tracing."""

from __future__ import annotations

import functools
import time
from collections.abc import Callable
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

_KNOWN_MESSAGE_TYPES: set[str] | None = None


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


def configure_tracing(app: Any, engine: Any, settings: Any) -> bool:
    """Configure OTLP tracing only when an exporter endpoint is explicitly supplied."""
    if not settings.OTEL_EXPORTER_OTLP_ENDPOINT:
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
    return True
