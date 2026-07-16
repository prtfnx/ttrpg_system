"""Owner/DM-scoped security audit inspection."""

from __future__ import annotations

from typing import Annotated

from database import crud, models
from database.database import get_db
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from database.schemas import User
from routers.users import get_current_active_user
from sqlalchemy import desc
from sqlalchemy.orm import Session
from utils.audit import audit_event
from utils.roles import is_dm

router = APIRouter(prefix="/api/sessions", tags=["audit"])


def _audit_response(row: models.AuditLog) -> dict:
    """Return the stable audit envelope without exposing legacy duplicate fields."""
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
        "details": row.details_json or row.details,
    }


@router.get("/{session_code}/audit-logs")
def read_session_audit_logs(
    session_code: str,
    request: Request,
    current_user: Annotated[User, Depends(get_current_active_user)],
    db: Session = Depends(get_db),
    action: str | None = Query(default=None, max_length=80),
    outcome: str | None = Query(default=None, pattern="^(success|failure|denied)$"),
    limit: int = Query(default=50, ge=1, le=100),
    offset: int = Query(default=0, ge=0, le=100_000),
):
    """Read security events for a session and audit the read itself."""
    session = crud.get_game_session_by_code(db, session_code)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    membership = db.query(models.GamePlayer).filter(
        models.GamePlayer.session_id == session.id,
        models.GamePlayer.user_id == current_user.id,
    ).first()
    if not membership or not is_dm(membership.role):
        if membership:
            db.add(audit_event(
                "audit.read",
                outcome="denied",
                session_code=session_code,
                user_id=current_user.id,
                target_type="audit_log",
                request=request,
                details={"reason": "insufficient_role"},
            ))
            db.commit()
        raise HTTPException(status_code=403, detail="Audit access required")

    query = db.query(models.AuditLog).filter(models.AuditLog.session_code == session_code)
    if action:
        query = query.filter(models.AuditLog.action == action.strip().lower())
    if outcome:
        query = query.filter(models.AuditLog.outcome == outcome)
    total = query.count()
    rows = query.order_by(desc(models.AuditLog.timestamp), desc(models.AuditLog.id)).offset(offset).limit(limit).all()

    db.add(audit_event(
        "audit.read",
        session_code=session_code,
        user_id=current_user.id,
        target_type="audit_log",
        request=request,
        details={"action": action.strip().lower() if action else None, "outcome": outcome, "limit": limit, "offset": offset},
    ))
    db.commit()
    return {"items": [_audit_response(row) for row in rows], "total": total, "limit": limit, "offset": offset}
