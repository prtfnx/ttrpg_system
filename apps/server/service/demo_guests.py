"""Expiring demo principals, isolated from normal account authentication."""
from datetime import UTC, timedelta
from typing import Any

import jwt
from core_table.protocol import MessageType
from database import models
from database.database import SessionLocal, get_db
from fastapi import Depends, HTTPException, Request
from service.authentication import ALGORITHM, SECRET_KEY, AccessTokenRejected
from sqlalchemy import delete, select
from sqlalchemy.orm import Session
from utils.time import utc_now

DEMO_SESSION_CODE = "DEMO2026"
DEMO_JWT_EXPIRY_MINUTES = 30
DEMO_COOKIE = "demo_token"
DEMO_AUDIENCE = "ttrpg-demo"

# Content reads and the guest's own selected-table preference only.
# Adding a new protocol handler never grants guest writes.
_DEMO_READS = frozenset(kind.value for kind in (
    MessageType.PING, MessageType.TABLE_REQUEST, MessageType.TABLE_LIST_REQUEST,
    MessageType.TABLE_ACTIVE_REQUEST, MessageType.TABLE_ACTIVE_SET,
    MessageType.PLAYER_STATUS_REQUEST,
    MessageType.PLAYER_LIST_REQUEST, MessageType.SPRITE_REQUEST,
    MessageType.SESSION_RULES_REQUEST, MessageType.COMBAT_STATE_REQUEST,
    MessageType.ASSET_DOWNLOAD_REQUEST, MessageType.ASSET_LIST_REQUEST,
    MessageType.ASSET_HASH_CHECK,
))


def demo_message_allowed(message: dict[str, Any]) -> bool:
    if not isinstance(message.get("type"), str):
        return False
    if message.get("type") in _DEMO_READS:
        return True
    if message.get("type") != MessageType.BATCH_REQUEST.value:
        return False
    data = message.get("data")
    children = data.get("messages") if isinstance(data, dict) else None
    # The transport limiter already caps batch size. Disallow nested batches.
    return isinstance(children, list) and all(
        isinstance(child, dict) and isinstance(child.get("type"), str)
        and child.get("type") in _DEMO_READS
        for child in children
    )


def issue_demo_token(user: models.User) -> str:
    assert user.guest_expires_at is not None
    return jwt.encode({
        "sub": user.username, "aud": DEMO_AUDIENCE,
        "session_code": DEMO_SESSION_CODE, "sv": user.session_version or 0,
        "iat": utc_now().replace(tzinfo=UTC),
        "exp": user.guest_expires_at.replace(tzinfo=UTC),
    }, SECRET_KEY, algorithm=ALGORITHM)


def resolve_demo_guest(token: str, db: Session, session_code: str = DEMO_SESSION_CODE) -> models.User:
    try:
        claims = jwt.decode(
            token, SECRET_KEY, algorithms=[ALGORITHM], audience=DEMO_AUDIENCE,
            options={"require": ["exp", "iat", "sub", "aud", "sv", "session_code"]},
        )
    except jwt.InvalidTokenError as exc:
        raise AccessTokenRejected("invalid_demo_token") from exc
    if session_code != DEMO_SESSION_CODE or claims["session_code"] != session_code:
        raise AccessTokenRejected("guest_scope")
    user = db.query(models.User).filter(models.User.username == claims["sub"]).first()
    if (
        user is None or user.disabled or user.guest_expires_at is None
        or user.guest_expires_at <= utc_now()
        or user.session_version != claims["sv"]
    ):
        raise AccessTokenRejected("expired_or_revoked_guest")
    membership = db.query(models.GamePlayer).join(models.GameSession).filter(
        models.GamePlayer.user_id == user.id, models.GamePlayer.role == "spectator",
        models.GameSession.session_code == session_code,
        models.GameSession.is_demo.is_(True), models.GameSession.is_active.is_(True),
    ).first()
    if membership is None:
        raise AccessTokenRejected("guest_membership")
    return user


def get_demo_guest(request: Request, db: Session = Depends(get_db)) -> models.User:
    try:
        user = resolve_demo_guest(request.cookies.get(DEMO_COOKIE, ""), db)
    except AccessTokenRejected as exc:
        raise HTTPException(status_code=401, detail="Demo expired. Start a new demo.") from exc
    request.state.user_id = user.id
    request.state.is_demo = True
    return user


def cleanup_expired_guests() -> int:
    """Delete a bounded batch after socket expiry, using a worker-owned session."""
    with SessionLocal() as db:
        cutoff = utc_now() - timedelta(minutes=5)
        ids = list(db.scalars(select(models.User.id).where(
            models.User.guest_expires_at < cutoff,
        ).limit(500)))
        if not ids:
            return 0
        db.execute(delete(models.GamePlayer).where(models.GamePlayer.user_id.in_(ids)))
        db.execute(delete(models.User).where(models.User.id.in_(ids)))
        db.commit()
        return len(ids)
