"""
Demo System Router
===================

Provides unauthenticated users a way to experience the platform without creating an account.
Demo sessions are read-only/limited-interaction pregenerated scenarios.

Security measures:
- IP-based rate limiting (3 demos per IP per hour)
- Short session TTL (30 minutes)
- No persistent state (changes discarded)
- Spectator role with limited permissions
"""

from fastapi import APIRouter, Request, HTTPException, Depends
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session
from datetime import datetime, timedelta
import logging
from typing import Optional

from server_host.database.database import SessionLocal
from server_host.database import models
from server_host.routers.users import create_access_token
from server_host.utils.rate_limiter import RateLimiter
from server_host.config import Settings

router = APIRouter()
logger = logging.getLogger(__name__)
settings = Settings()

# Rate limiter for demo access (3 per hour)
demo_limiter = RateLimiter()

DEMO_SESSION_CODE = "DEMO2026"
DEMO_JWT_EXPIRY_MINUTES = 30


def get_client_ip(request: Request) -> str:
    """Extract client IP from request headers or connection"""
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def get_or_create_demo_session(db: Session) -> models.GameSession:
    """Get or create the demo game session"""
    demo_session = db.query(models.GameSession).filter(
        models.GameSession.session_code == DEMO_SESSION_CODE,
        models.GameSession.is_demo == True
    ).first()
    
    if not demo_session:
        # Create demo user if doesn't exist
        demo_user = db.query(models.User).filter(
            models.User.username == "demo_host"
        ).first()
        
        if not demo_user:
            from passlib.context import CryptContext
            pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
            
            demo_user = models.User(
                username="demo_host",
                hashed_password=pwd_context.hash("demo_password_not_used"),
                email="demo@ttrpg-system.local"
            )
            db.add(demo_user)
            db.commit()
            db.refresh(demo_user)
        
        # Create demo session
        demo_session = models.GameSession(
            name="Demo Adventure - Tavern Encounter",
            session_code=DEMO_SESSION_CODE,
            owner_id=demo_user.id,
            is_demo=True,
            is_active=True
        )
        db.add(demo_session)
        db.commit()
        db.refresh(demo_session)
        
        logger.info(f"Created demo session: {DEMO_SESSION_CODE}")
    
    return demo_session


@router.get("/demo")
async def start_demo(request: Request):
    """
    Start a demo session for unauthenticated users.
    
    Creates a temporary JWT with demo flag and redirects to the demo game session.
    """
    client_ip = get_client_ip(request)
    
    # Rate limiting check (3 demos per hour)
    if not demo_limiter.is_allowed(client_ip, max_requests=3, window_minutes=60):
        raise HTTPException(
            status_code=429,
            detail="Demo rate limit exceeded. Please try again later or create a free account for unlimited access."
        )
    
    db = SessionLocal()
    try:
        # Get or create demo session
        demo_session = get_or_create_demo_session(db)
        
        # Create temporary demo JWT
        demo_token_data = {
            "sub": f"demo_user_{client_ip.replace('.', '_')}",
            "is_demo": True,
            "session_code": DEMO_SESSION_CODE,
            "role": "spectator"
        }
        
        demo_token = create_access_token(
            data=demo_token_data,
            expires_delta=timedelta(minutes=DEMO_JWT_EXPIRY_MINUTES)
        )
        
        # Log demo access
        logger.info(f"Demo session started from IP: {client_ip}")
        
        # Redirect to demo session with token
        response = RedirectResponse(
            url=f"/game/session/{DEMO_SESSION_CODE}",
            status_code=302
        )
        
        response.set_cookie(
            key="token",
            value=demo_token,
            httponly=True,
            max_age=DEMO_JWT_EXPIRY_MINUTES * 60,
            samesite="lax",
            secure=settings.ENVIRONMENT == "production"
        )
        
        return response
        
    finally:
        db.close()


@router.get("/demo/info")
async def demo_info():
    """
    Information endpoint about the demo system.
    """
    return {
        "demo_session_code": DEMO_SESSION_CODE,
        "demo_duration_minutes": DEMO_JWT_EXPIRY_MINUTES,
        "rate_limit": "3 demos per IP per hour",
        "features": {
            "view_maps": True,
            "move_tokens": False,
            "create_content": False,
            "chat": False,
            "role": "spectator"
        },
        "message": "Demo provides read-only access to a sample game session. Create a free account for full features."
    }
