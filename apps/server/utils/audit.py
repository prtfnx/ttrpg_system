"""Versioned security audit events that participate in caller transactions."""

from __future__ import annotations

import json
import os
import uuid
from typing import Any, Dict, Optional

from database import models
from database.database import SessionLocal
from .logger import current_log_context, sanitize_log_value, setup_logger
from .rate_limiter import RateLimiter, get_client_ip

logger = setup_logger(__name__)

_HTTP_SECURITY_ACTIONS = {
    401: "authentication.http_denied",
    403: "authorization.http_denied",
    429: "rate_limit.http_rejected",
}
_security_audit_by_client = RateLimiter("security_audit", max_identifiers=10_000)
_security_audit_global = RateLimiter("security_audit", max_identifiers=1)


def extract_client_info(
    request, *, trust_proxy_headers: bool | None = None
) -> Dict[str, Optional[str]]:
    ip_address = None
    if request is not None:
        resolved = get_client_ip(request, trust_proxy_headers=trust_proxy_headers)
        ip_address = resolved if resolved != "unknown" else None
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
    if not action or getattr(request.state, "security_decision_audited", False):
        return
    client_ip = get_client_ip(request)
    if not _security_audit_global.is_allowed("global", max_requests=500, window_minutes=1):
        return
    identity = f"{status_code}:{route}:{client_ip}"
    if not _security_audit_by_client.is_allowed(
        identity, max_requests=20, window_minutes=5
    ):
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


def persist_operational_event(
    action: str,
    outcome: str,
    *,
    target_type: str,
    details: Dict[str, Any] | None = None,
    fail_closed: bool = True,
) -> bool:
    """Persist a privileged operator event outside a request transaction."""
    db = SessionLocal()
    try:
        db.add(audit_event(
            action,
            outcome=outcome,
            target_type=target_type,
            details=details,
        ))
        db.commit()
        return True
    except Exception:
        db.rollback()
        logger.exception(
            "Operational audit persistence failed",
            extra={
                "event_name": "audit.operation.failed",
                "audit_action": action,
                "outcome": "error",
            },
        )
        if fail_closed:
            raise RuntimeError("Operational audit persistence failed")
        return False
    finally:
        db.close()
