"""Versioned security audit events that participate in caller transactions."""

from __future__ import annotations

import json
import os
import uuid
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional

from database import models
from sqlalchemy.orm import Session

from .logger import current_log_context, sanitize_log_value, setup_logger

logger = setup_logger(__name__)


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


def create_audit_log(
    db: Session,
    event_type: str,
    session_code: Optional[str] = None,
    user_id: Optional[int] = None,
    ip_address: Optional[str] = None,
    user_agent: Optional[str] = None,
    details: Optional[str] = None,
    additional_data: Optional[Dict[str, Any]] = None,
    *,
    commit: bool = False,
) -> models.AuditLog:
    data: Dict[str, Any] = dict(additional_data or {})
    if details:
        data["note"] = details
    row = audit_event(
        event_type,
        session_code=session_code,
        user_id=user_id,
        details=data,
    )
    if ip_address:
        row.ip_address = ip_address[:45]
    if user_agent:
        row.user_agent = user_agent[:512]
    db.add(row)
    if commit:
        try:
            db.commit()
        except Exception:
            db.rollback()
            logger.exception(
                "Audit event persistence failed",
                extra={"event_name": "audit.persistence.failed", "action": row.action},
            )
            raise
    return row


def filter_audit_logs(
    logs: List[Dict[str, Any]],
    event_types: Optional[List[str]] = None,
    session_code: Optional[str] = None,
    user_id: Optional[int] = None,
    start_date: Optional[datetime] = None,
    end_date: Optional[datetime] = None,
) -> List[Dict[str, Any]]:
    filtered = list(logs)
    if event_types:
        filtered = [item for item in filtered if item.get("event_type") in event_types]
    if session_code:
        filtered = [item for item in filtered if item.get("session_code") == session_code]
    if user_id is not None:
        filtered = [item for item in filtered if item.get("user_id") == user_id]
    if start_date:
        filtered = [
            item for item in filtered
            if item.get("timestamp")
            and datetime.fromisoformat(item["timestamp"].replace("Z", "+00:00")) >= start_date
        ]
    if end_date:
        filtered = [
            item for item in filtered
            if item.get("timestamp")
            and datetime.fromisoformat(item["timestamp"].replace("Z", "+00:00")) <= end_date
        ]
    return filtered


def get_audit_summary(db: Session, session_code: str, days: int = 30) -> Dict[str, Any]:
    cutoff_date = datetime.utcnow() - timedelta(days=days)
    logs = db.query(models.AuditLog).filter(
        models.AuditLog.session_code == session_code,
        models.AuditLog.timestamp >= cutoff_date,
    ).all()
    event_counts: Dict[str, int] = {}
    users = set()
    for row in logs:
        event_counts[row.event_type] = event_counts.get(row.event_type, 0) + 1
        if row.user_id:
            users.add(row.user_id)
    return {
        "total_events": len(logs),
        "event_types": event_counts,
        "unique_users": len(users),
        "date_range_days": days,
        "session_code": session_code,
    }


def log_invitation_event(
    db: Session, event_type: str, invitation: models.SessionInvitation,
    user_id: int, request=None, additional_details: str = "",
) -> None:
    db.add(audit_event(
        event_type,
        session_code=invitation.session.session_code if invitation.session else None,
        user_id=user_id,
        target_type="invitation",
        target_id=invitation.id,
        request=request,
        details={"role": invitation.pre_assigned_role, "note": additional_details},
    ))


def log_session_management_event(
    db: Session, event_type: str, session_code: str, target_user_id: int,
    admin_user_id: int, request=None, additional_details: str = "",
) -> None:
    db.add(audit_event(
        event_type,
        session_code=session_code,
        user_id=admin_user_id,
        target_type="user",
        target_id=target_user_id,
        request=request,
        details={"note": additional_details},
    ))
