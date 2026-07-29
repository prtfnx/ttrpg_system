"""Shared access-token authentication for HTTP and WebSocket entry points."""

from __future__ import annotations

import jwt
from config import Settings
from database import crud, models
from sqlalchemy.orm import Session

_settings = Settings()
SECRET_KEY = _settings.SECRET_KEY
ALGORITHM = _settings.ALGORITHM


class AccessTokenRejected(Exception):
    """A safe, structured reason for rejecting an access token."""

    def __init__(self, reason: str) -> None:
        super().__init__(reason)
        self.reason = reason


def resolve_active_user_from_token(token: str, db: Session) -> models.User:
    """Return the active user represented by a valid, non-revoked access token.

    Callers may log ``AccessTokenRejected.reason`` but must never log ``token``.
    Tokens without an ``sv`` claim retain the legacy version-zero behavior.
    """
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    except jwt.ExpiredSignatureError as exc:
        raise AccessTokenRejected("expired") from exc
    except jwt.InvalidTokenError as exc:
        raise AccessTokenRejected("invalid") from exc

    username = payload.get("sub")
    if not isinstance(username, str) or not username:
        raise AccessTokenRejected("missing_subject")

    user = crud.get_user_by_username(db, username=username)
    if user is None:
        raise AccessTokenRejected("user_not_found")

    if (user.session_version or 0) != payload.get("sv", 0):
        raise AccessTokenRejected("revoked")

    if user.disabled:
        raise AccessTokenRejected("inactive")

    return user
