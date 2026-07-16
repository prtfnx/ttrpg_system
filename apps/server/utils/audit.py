"""Versioned security audit events that participate in caller transactions."""

from __future__ import annotations

import json
import os
import uuid
from typing import Any, Dict, Optional

from database import models
from database.database import SessionLocal
from .logger import current_log_context, sanitize_log_value, setup_logger

logger = setup_logger(__name__)

_HTTP_SECURITY_ACTIONS = {
    401: "authentication.http_denied",
    403: "authorization.http_denied",
    429: "rate_limit.http_rejected",
}


def extract_client_info(request) -> Dict[str, Optional[str]]:
    ip_address = None
    if request is not None and hasattr(request, "headers"):
        forwarded = request.headers.get("x-forwarded-for")
        if forwarded:
            ip_address = forwarded.split(",", 1)[0].strip()[:45]
    if not ip_address and request is not None and getattr(request, "client", None):
        ip_address = request.client.host[:45]
    user_agent = None
    if request is not None and hasattr(request, "headers"):
        user_agent = request.headers.get("user-agent")
    return {
        "ip_address": ip_address,
        "user_agent": user_agent[:512] if user_agent else None,
    }


def format_audit_details(event_type: str, event_data: Dict[str, Any]) -> str:
    return json.dumps(
        {"event": event_type, "data": sanitize_log_value(event_data)},
        separators=(",", ":"),
        sort_keys=True,
        default=str,
    )


def audit_event(
    action: str,
    *,
    outcome: str = "success",
    session_code: str | None = None,
    user_id: int | None = None,
    target_type: str | None = None,
    target_id: str | int | None = None,
    request=None,
    details: Dict[str, Any] | None = None,
) -> models.AuditLog:
    """Build a normalized audit row; the caller adds/commits it with business state."""
    context = current_log_context()
    client = extract_client_info(request)
    normalized_action = action.strip().lower()[:80]
    detail_json = format_audit_details(normalized_action, details or {})
    return models.AuditLog(
        event_id=str(uuid.uuid4()),
        event_type=action,
        action=normalized_action,
        outcome=outcome if outcome in {"success", "failure", "denied"} else "failure",
        session_code=session_code,
        user_id=user_id,
        target_type=target_type,
        target_id=str(target_id)[:100] if target_id is not None else None,
        ip_address=client["ip_address"],
        user_agent=client["user_agent"],
        details=detail_json,
        details_json=detail_json,
        request_id=context.get("request_id"),
        trace_id=context.get("trace_id"),
        source_service=os.getenv("SERVICE_NAME", "ttrpg-server"),
        service_version=os.getenv(
            "SERVICE_VERSION", os.getenv("RENDER_GIT_COMMIT", "development")
        ),
        schema_version=1,
    )


def persist_http_security_decision(request: Any, status_code: int, route: str) -> None:
    """Persist denied HTTP decisions independently of a rolled-back request transaction."""
    action = _HTTP_SECURITY_ACTIONS.get(status_code)
    if not action:
        return
    db = SessionLocal()
    try:
        db.add(audit_event(
            action,
            outcome="denied",
            user_id=getattr(request.state, "user_id", None),
            target_type="http_route",
            target_id=route,
            request=request,
            details={"method": request.method, "status_code": status_code},
        ))
        db.commit()
    except Exception:
        db.rollback()
        logger.exception(
            "Security decision audit persistence failed",
            extra={"event_name": "audit.security_decision.failed", "outcome": "error"},
        )
    finally:
        db.close()
