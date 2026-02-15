"""
Google OAuth Authentication Router
=====================================

Handles Google OAuth 2.0 authentication flow.
Uses standard authorization code flow with client secret (server-side flow).

Security features:
- State parameter for CSRF protection
- Secure cookie handling
- Automatic user creation/linking
- Email verification bypass for OAuth users
"""

from fastapi import APIRouter, Request, HTTPException, Depends
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session
from datetime import timedelta
import secrets
import logging

from server_host.database.database import SessionLocal
from server_host.database import models
from server_host.routers.users import create_access_token
from server_host.config import Settings
from passlib.context import CryptContext

router = APIRouter(prefix="/auth", tags=["auth"])
logger = logging.getLogger(__name__)
settings = Settings()
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# OAuth configuration would require authlib
# For now, provide a placeholder that explains setup
@router.get("/google")
async def google_login(request: Request):
    """
    Initiate Google OAuth flow.
    
    NOTE: This endpoint requires Google OAuth credentials and authlib library.
    
    Setup required:
    1. pip install authlib
    2. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env
    3. Configure redirect URI in Google Cloud Console
    """
    return {
        "error": "Google OAuth not configured",
        "message": "To enable Google OAuth:",
        "steps": [
            "Install authlib: pip install authlib",
            "Set GOOGLE_CLIENT_ID in environment",
            "Set GOOGLE_CLIENT_SECRET in environment",
            "Add http://localhost:8000/auth/callback to Google Cloud Console authorized redirect URIs"
        ],
        "redirect": "/users/login"
    }

@router.get("/callback")
async def google_callback(request: Request):
    """Google OAuth callback endpoint"""
    return RedirectResponse(url="/users/login?error=oauth_not_configured")


# Full implementation reference for when authlib is installed:
"""
from authlib.integr ations.starlette_client import OAuth

oauth = OAuth()
oauth.register(
    name='google',
    client_id=settings.GOOGLE_CLIENT_ID,
    client_secret=settings.GOOGLE_CLIENT_SECRET,
    server_metadata_url='https://accounts.google.com/.well-known/openid-configuration',
    client_kwargs={'scope': 'openid email profile'},
)

@router.get("/google")
async def google_login(request: Request):
    # Generate CSRF state
    state = secrets.token_urlsafe(32)
    request.session['oauth_state'] = state
    
    redirect_uri = f"{settings.BASE_URL}/auth/callback"
    return await oauth.google.authorize_redirect(request, redirect_uri, state=state)

@router.get("/callback")
async def google_callback(request: Request):
    # Verify state
    if request.query_params.get('state') != request.session.get('oauth_state'):
        raise HTTPException(status_code=400, detail="Invalid state parameter")
    
    # Exchange code for tokens
    token = await oauth.google.authorize_access_token(request)
    userinfo = token.get('userinfo')
    
    db = SessionLocal()
    try:
        # Find or create user
        user = db.query(models.User).filter(
            models.User.google_id == userinfo['sub']
        ).first()
        
        if not user:
            user = db.query(models.User).filter(
                models.User.email == userinfo['email']
            ).first()
            
            if user:
                # Link existing account
                user.google_id = userinfo['sub']
                user.is_verified = True
            else:
                # Create new user
                user = models.User(
                    username=userinfo['email'].split('@')[0],
                    email=userinfo['email'],
                    google_id=userinfo['sub'],
                    is_verified=True,
                    hashed_password=""  # No password for OAuth users
                )
                db.add(user)
            
            db.commit()
        
        # Create JWT
        access_token = create_access_token(
            data={"sub": user.username},
            expires_delta=timedelta(hours=6)
        )
        
        response = RedirectResponse(url="/users/dashboard")
        response.set_cookie(
            key="token",
            value=access_token,
            httponly=True,
            samesite="lax",
            secure=settings.ENVIRONMENT == "production",
            max_age=21600
        )
        return response
        
    finally:
        db.close()
"""
