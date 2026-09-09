"""Public demo entry with separate, expiring spectator credentials."""
import logging
import secrets
import uuid
from datetime import UTC, timedelta

import bcrypt
from config import Settings
from database import models, schemas
from database.database import get_db
from fastapi import APIRouter, Depends, HTTPException, Request, Response
from fastapi.responses import RedirectResponse
from service.demo_guests import (
    DEMO_COOKIE,
    DEMO_JWT_EXPIRY_MINUTES,
    DEMO_SESSION_CODE,
    get_demo_guest,
    issue_demo_token,
)
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from utils.rate_limiter import RateLimiter, get_client_ip
from utils.time import utc_now

router = APIRouter()
logger = logging.getLogger(__name__)
settings = Settings()
demo_limiter = RateLimiter("demo")


def _unusable_password() -> str:
    return bcrypt.hashpw(secrets.token_bytes(32), bcrypt.gensalt()).decode()


def get_or_create_demo_session(db: Session) -> models.GameSession:
    """Stage the demo once; callers commit it with guest membership."""
    session = db.query(models.GameSession).filter(
        models.GameSession.session_code == DEMO_SESSION_CODE,
    ).first()
    if session:
        if not session.is_demo or not session.is_active:
            raise HTTPException(status_code=503, detail="Demo is unavailable")
        return session

    host = models.User(
        username="_demo_host_" + uuid.uuid4().hex,
        hashed_password=_unusable_password(), disabled=True,
    )
    db.add(host)
    db.flush()
    session = models.GameSession(
        name="Demo Adventure - Tavern Encounter", session_code=DEMO_SESSION_CODE,
        owner_id=host.id, is_demo=True, is_active=True,
    )
    db.add(session)
    db.flush()
    db.add(models.VirtualTable(
        table_id=str(uuid.uuid4()), name="Tavern Encounter",
        width=2000, height=2000, session_id=session.id,
    ))
    return session


@router.get("/demo")
def start_demo(request: Request, db: Session = Depends(get_db)):
    if not demo_limiter.is_allowed(get_client_ip(request), max_requests=3, window_minutes=60):
        raise HTTPException(status_code=429, detail="Demo rate limit exceeded. Please try again later.")

    # A unique session code arbitrates concurrent first visits across processes.
    for attempt in range(2):
        try:
            session = get_or_create_demo_session(db)
            guest = models.User(
                username="guest_" + uuid.uuid4().hex, hashed_password=_unusable_password(),
                guest_expires_at=utc_now().replace(microsecond=0) + timedelta(minutes=DEMO_JWT_EXPIRY_MINUTES),
            )
            db.add(guest)
            db.flush()
            first_table = db.query(models.VirtualTable).filter_by(session_id=session.id).first()
            db.add(models.GamePlayer(
                session_id=session.id, user_id=guest.id, role="spectator",
                active_table_id=first_table.table_id if first_table else None,
            ))
            db.commit()
            break
        except IntegrityError:
            db.rollback()
            if attempt:
                raise
        except Exception:
            db.rollback()
            raise

    response = RedirectResponse(url="/demo/session", status_code=302)
    response.set_cookie(
        key=DEMO_COOKIE, value=issue_demo_token(guest), httponly=True,
        max_age=DEMO_JWT_EXPIRY_MINUTES * 60, samesite="lax",
        secure=settings.ENVIRONMENT == "production",
    )
    response.headers["Cache-Control"] = "no-store"
    return response


@router.get("/demo/session")
def demo_session_page(
    request: Request, user: models.User = Depends(get_demo_guest), db: Session = Depends(get_db),
):
    from routers.game import game_session_page

    response = game_session_page(DEMO_SESSION_CODE, request, schemas.User.model_validate(user), db)
    response.headers["Cache-Control"] = "no-store"
    return response


@router.get("/demo/players")
def demo_players(user: models.User = Depends(get_demo_guest), db: Session = Depends(get_db)):
    from routers.game import get_session_players

    return get_session_players(DEMO_SESSION_CODE, schemas.User.model_validate(user), db)


@router.get("/demo/membership")
def demo_membership(user: models.User = Depends(get_demo_guest), db: Session = Depends(get_db)):
    from routers.game import get_session_membership

    return get_session_membership(DEMO_SESSION_CODE, schemas.User.model_validate(user), db)


@router.get("/demo/me")
def demo_me(response: Response, user: models.User = Depends(get_demo_guest)):
    response.headers["Cache-Control"] = "no-store"
    assert user.guest_expires_at is not None
    return {
        "id": user.id, "username": user.username, "is_guest": True,
        "expires_at": user.guest_expires_at.replace(tzinfo=UTC).isoformat(),
        "sessions": [{
            "session_code": DEMO_SESSION_CODE, "session_name": "Demo Adventure - Tavern Encounter",
            "role": "spectator", "created_at": user.created_at,
        }],
    }


@router.get("/demo/logout")
def leave_demo():
    response = RedirectResponse(url="/", status_code=302)
    response.delete_cookie(DEMO_COOKIE, httponly=True, samesite="lax",
                           secure=settings.ENVIRONMENT == "production")
    response.headers["Cache-Control"] = "no-store"
    return response


@router.get("/demo/info")
async def demo_info():
    return {
        "demo_session_code": DEMO_SESSION_CODE,
        "demo_duration_minutes": DEMO_JWT_EXPIRY_MINUTES,
        "rate_limit": "3 demos per IP per hour",
        "features": {"view_maps": True, "move_tokens": False, "create_content": False,
                     "chat": False, "role": "spectator"},
        "message": "Demo provides read-only access. Create a free account for full features.",
    }
