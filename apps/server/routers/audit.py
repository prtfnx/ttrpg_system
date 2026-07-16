"""Owner-scoped, paginated security audit inspection."""

from __future__ import annotations

import json
from datetime import datetime
from typing import Annotated, Any

from database import crud, models
from database.database import get_db
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from database.schemas import User
from pydantic import BaseModel
from routers.users import get_current_active_user
from sqlalchemy import desc
from sqlalchemy.orm import Session
from utils.audit import audit_event
from utils.logger import setup_logger

router = APIRouter(prefix="/api/sessions", tags=["audit"])
logger = setup_logger(__name__)


class AuditEventResponse(BaseModel):
    event_id: str
    timestamp: datetime | None
    action: str
    outcome: str
    actor_user_id: int | None
    target_type: str | None
    target_id: str | None
    request_id: str | None
    trace_id: str | None
    source_service: str
    service_version: str
    schema_version: int
    details: dict[str, Any] | None


class AuditPageResponse(BaseModel):
    items: list[AuditEventResponse]
    limit: int
    has_more: bool
    next_cursor: str | None


def _audit_response(row: models.AuditLog) -> dict:
    """Return the stable audit envelope without exposing legacy duplicate fields."""
    details = None
    if row.details_json:
        try:
            details = json.loads(row.details_json)
        except (TypeError, json.JSONDecodeError):
            details = None
    return {
        "event_id": row.event_id,
        "timestamp": row.timestamp.isoformat() if row.timestamp else None,
        "action": row.action,
        "outcome": row.outcome,
        "actor_user_id": row.user_id,
        "target_type": row.target_type,
        "target_id": row.target_id,
        "request_id": row.request_id,
        "trace_id": row.trace_id,
        "source_service": row.source_service,
        "service_version": row.service_version,
        "schema_version": row.schema_version,
        "details": details,
    }


def _commit_audit_access(db: Session, request: Request) -> None:
    """Fail closed when an audit-log access event cannot be persisted."""
    try:
        db.commit()
        request.state.security_decision_audited = True
    except Exception:
        db.rollback()
        logger.exception(
            "Audit-log access persistence failed",
            extra={"event_name": "audit.access.failed", "outcome": "error"},
        )
        raise HTTPException(status_code=503, detail="Audit service unavailable")


@router.get("/{session_code}/audit-logs", response_model=AuditPageResponse)
def read_session_audit_logs(
    session_code: str,
    request: Request,
    current_user: Annotated[User, Depends(get_current_active_user)],
    db: Session = Depends(get_db),
    action: str | None = Query(default=None, pattern=r"^[A-Za-z0-9_.-]{1,80}$"),
    outcome: str | None = Query(default=None, pattern="^(success|failure|denied)$"),
    limit: int = Query(default=50, ge=1, le=100),
    cursor: str | None = Query(default=None, pattern=r"^[0-9A-Fa-f-]{32,36}$"),
):
    """Read security events for a session and audit the read itself."""
    session = crud.get_game_session_by_code(db, session_code)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    if session.owner_id != current_user.id:
        db.add(audit_event(
            "audit.read",
            outcome="denied",
            session_code=session_code,
            user_id=current_user.id,
            target_type="audit_log",
            request=request,
            details={"reason": "owner_required"},
        ))
        _commit_audit_access(db, request)
        raise HTTPException(status_code=403, detail="Audit access required")

    query = db.query(models.AuditLog).filter(models.AuditLog.session_code == session_code)
    if action:
        query = query.filter(models.AuditLog.action == action.strip().lower())
    if outcome:
        query = query.filter(models.AuditLog.outcome == outcome)
    if cursor:
        cursor_row = db.query(models.AuditLog.id).filter(
            models.AuditLog.session_code == session_code,
            models.AuditLog.event_id == cursor,
        ).first()
        if not cursor_row:
            raise HTTPException(status_code=400, detail="Invalid audit cursor")
        query = query.filter(models.AuditLog.id < cursor_row[0])
    page = query.order_by(desc(models.AuditLog.id)).limit(limit + 1).all()
    has_more = len(page) > limit
    rows = page[:limit]

    db.add(audit_event(
        "audit.read",
        session_code=session_code,
        user_id=current_user.id,
        target_type="audit_log",
        request=request,
        details={
            "action": action.strip().lower() if action else None,
            "outcome": outcome,
            "limit": limit,
            "cursor": cursor,
            "returned": len(rows),
        },
    ))
    _commit_audit_access(db, request)
    return {
        "items": [_audit_response(row) for row in rows],
        "limit": limit,
        "has_more": has_more,
        "next_cursor": rows[-1].event_id if has_more and rows else None,
    }
