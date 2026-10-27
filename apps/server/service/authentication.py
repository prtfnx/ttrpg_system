"""Shared access-token authentication for HTTP and WebSocket entry points."""

from __future__ import annotations

import math
from dataclasses import dataclass

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


@dataclass(frozen=True)
class AuthenticatedAccount:
    user: models.User
    expires_at: float


def resolve_active_account_from_token(token: str, db: Session) -> AuthenticatedAccount:
    """Return account authority and its validated credential deadline.

    Callers may log ``AccessTokenRejected.reason`` but must never log ``token``.
    Tokens without an ``sv`` claim retain the legacy version-zero behavior.
    """
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM], options={"require": ["exp"]})
    except jwt.ExpiredSignatureError as exc:
        raise AccessTokenRejected("expired") from exc
    except (jwt.InvalidTokenError, ValueError, OverflowError, TypeError) as exc:
        raise AccessTokenRejected("invalid") from exc

    expiration = payload["exp"]
    if isinstance(expiration, bool) or not isinstance(expiration, (int, float)):
        raise AccessTokenRejected("invalid_expiration")
    try:
        expires_at = float(expiration)
    except OverflowError as exc:
        raise AccessTokenRejected("invalid_expiration") from exc
    if not math.isfinite(expires_at):
        raise AccessTokenRejected("invalid_expiration")

    username = payload.get("sub")
    if not isinstance(username, str) or not username:
        raise AccessTokenRejected("missing_subject")

    user = crud.get_user_by_username(db, username=username)
    if user is None:
        raise AccessTokenRejected("user_not_found")

    if (user.session_version or 0) != payload.get("sv", 0):
        raise AccessTokenRejected("revoked")

    if getattr(user, "guest_expires_at", None) is not None:
        raise AccessTokenRejected("guest_scope")

    if user.disabled:
        raise AccessTokenRejected("inactive")

    return AuthenticatedAccount(user=user, expires_at=expires_at)


def resolve_active_user_from_token(token: str, db: Session) -> models.User:
    """Preserve the HTTP user contract while sharing credential validation."""
    return resolve_active_account_from_token(token, db).user
