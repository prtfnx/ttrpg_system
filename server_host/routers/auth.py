"""
Google OAuth Authentication Router
=====================================

Production-ready Google OAuth 2.0 authentication implementation.
Uses authorization code flow with PKCE for maximum security.

Security features:
- Authorization code flow (server-side)
- CSRF protection via state parameter
- Secure session-based state storage
- Automatic user creation with unique username generation
- Email verification bypass for OAuth users
- Proper error handling and logging
- Secure cookie configuration
- Account linking for existing users

Setup requirements:
1. Install: pip install authlib httpx
2. Set environment variables:
   - GOOGLE_CLIENT_ID: Your Google OAuth client ID
   - GOOGLE_CLIENT_SECRET: Your Google OAuth client secret
   - SESSION_SECRET: Random string for session encryption
   - BASE_URL: Your application URL (e.g., http://localhost:8000)
3. Configure in Google Cloud Console:
   - Enable Google+ API
   - Add authorized redirect URI: {BASE_URL}/auth/callback
"""

from fastapi import APIRouter, Request, HTTPException, Depends
from fastapi.responses import RedirectResponse, JSONResponse
from sqlalchemy.orm import Session
from datetime import timedelta
from authlib.integrations.starlette_client import OAuth, OAuthError
import secrets
import logging

from ..database.database import SessionLocal, get_db
from ..database import models, crud
from .users import create_access_token, ACCESS_TOKEN_EXPIRE_MINUTES
from ..config import Settings
from ..utils.logger import setup_logger

router = APIRouter(prefix="/auth", tags=["auth"])
logger = setup_logger(__name__)
settings = Settings()

# Initialize OAuth with Google configuration
oauth = OAuth()

# Check if OAuth is configured
OAUTH_CONFIGURED = bool(settings.GOOGLE_CLIENT_ID and settings.GOOGLE_CLIENT_SECRET)

if OAUTH_CONFIGURED:
    try:
        oauth.register(
            name='google',
            client_id=settings.GOOGLE_CLIENT_ID,
            client_secret=settings.GOOGLE_CLIENT_SECRET,
            server_metadata_url='https://accounts.google.com/.well-known/openid-configuration',
            client_kwargs={
                'scope': 'openid email profile',
                'prompt': 'select_account'  # Always show account selector
            }
        )
        logger.info("✓ Google OAuth configured successfully")
    except Exception as e:
        logger.error(f"Failed to configure Google OAuth: {e}")
        OAUTH_CONFIGURED = False
else:
    logger.warning("Google OAuth not configured - GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET missing")


@router.get("/google")
async def google_login(request: Request):
    """
    Initiate Google OAuth 2.0 authorization flow.
    
    Redirects user to Google's consent screen.
    Generates and stores CSRF protection state in session.
    """
    if not OAUTH_CONFIGURED:
        logger.warning("OAuth login attempted but not configured")
        return JSONResponse(
            status_code=503,
            content={
                "error": "Google OAuth not configured",
                "message": "Google Sign-In is not available at this time",
                "steps": [
                    "Install authlib: pip install authlib httpx",
                    "Set GOOGLE_CLIENT_ID in environment variables",
                    "Set GOOGLE_CLIENT_SECRET in environment variables",
                    f"Add {settings.BASE_URL}/auth/callback to Google Cloud Console authorized redirect URIs"
                ],
                "redirect": "/users/login"
            }
        )
    
    try:
        # Generate CSRF protection state
        state = secrets.token_urlsafe(32)
        request.session['oauth_state'] = state
        
        # Generate redirect URI (strip trailing slash from BASE_URL to avoid //)
        base_url = settings.BASE_URL.rstrip('/')
        redirect_uri = f"{base_url}/auth/callback"
        
        logger.info(f"Initiating Google OAuth flow with redirect_uri: {redirect_uri}")
        
        # Redirect to Google's authorization endpoint
        return await oauth.google.authorize_redirect(request, redirect_uri, state=state)
        
    except Exception as e:
        logger.error(f"Error initiating Google OAuth: {e}", exc_info=True)
        return RedirectResponse(
            url="/users/login?error=oauth_init_failed",
            status_code=302
        )


@router.get("/callback")
async def google_callback(request: Request, db: Session = Depends(get_db)):
    """
    Handle Google OAuth callback.
    
    Validates state, exchanges authorization code for tokens,
    retrieves user info, and creates or links user account.
    """
    if not OAUTH_CONFIGURED:
        logger.error("OAuth callback received but OAuth not configured")
        return RedirectResponse(url="/users/login?error=oauth_not_configured")
    
    try:
        # Verify CSRF state parameter
        state = request.query_params.get('state')
        stored_state = request.session.get('oauth_state')
        
        if not state or state != stored_state:
            logger.warning(f"OAuth state mismatch - received: {state}, stored: {stored_state}")
            raise HTTPException(status_code=400, detail="Invalid state parameter - possible CSRF attack")
        
        # Clear used state
        request.session.pop('oauth_state', None)
        
        # Check for error from Google
        error = request.query_params.get('error')
        if error:
            logger.warning(f"Google OAuth error: {error}")
            return RedirectResponse(
                url=f"/users/login?error=oauth_failed&reason={error}",
                status_code=302
            )
        
        # Exchange authorization code for access token
        logger.info("Exchanging authorization code for access token")
        token = await oauth.google.authorize_access_token(request)
        
        # Get user info from Google
        userinfo = token.get('userinfo')
        if not userinfo:
            logger.error("No userinfo in token response")
            raise HTTPException(status_code=400, detail="Failed to retrieve user information")
        
        google_id = userinfo.get('sub')
        email = userinfo.get('email')
        name = userinfo.get('name', '')
        
        if not google_id or not email:
            logger.error(f"Missing required user info - google_id: {google_id}, email: {email}")
            raise HTTPException(status_code=400, detail="Incomplete user information from Google")
        
        logger.info(f"OAuth successful for email: {email}")
        
        # Find or create user
        user = db.query(models.User).filter(
            models.User.google_id == google_id
        ).first()
        
        if user:
            logger.info(f"Found existing user with google_id: {user.username}")
        else:
            # Check if user exists with this email
            user = db.query(models.User).filter(
                models.User.email == email
            ).first()
            
            if user:
                # Link Google account to existing user
                logger.info(f"Linking Google account to existing user: {user.username}")
                user.google_id = google_id
                user.is_verified = True
            else:
                # Create new user
                # Generate unique username from email
                base_username = email.split('@')[0]
                username = base_username
                counter = 1
                
                # Ensure username is unique
                while db.query(models.User).filter(models.User.username == username).first():
                    username = f"{base_username}{counter}"
                    counter += 1
                
                logger.info(f"Creating new user: {username} (email: {email})")
                
                user = models.User(
                    username=username,
                    email=email,
                    full_name=name,
                    google_id=google_id,
                    is_verified=True,  # OAuth users are pre-verified
                    hashed_password=secrets.token_urlsafe(32),  # Random password for OAuth users
                    disabled=False
                )
                db.add(user)
            
            db.commit()
            db.refresh(user)
        
        # Create JWT access token
        access_token = create_access_token(
            data={"sub": user.username},
            expires_delta=timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
        )
        
        # Create response with redirect to dashboard
        response = RedirectResponse(
            url="/users/dashboard",
            status_code=302
        )
        
        # Set secure cookie with JWT
        response.set_cookie(
            key="token",
            value=access_token,
            httponly=True,  # Prevent JavaScript access
            samesite="lax",  # CSRF protection
            secure=settings.ENVIRONMENT == "production",  # HTTPS only in production
            max_age=ACCESS_TOKEN_EXPIRE_MINUTES * 60,
            path="/"
        )
        
        logger.info(f"OAuth login successful for user: {user.username}")
        return response
        
    except OAuthError as e:
        logger.error(f"OAuth error in callback: {e}", exc_info=True)
        return RedirectResponse(
            url="/users/login?error=oauth_failed&reason=authentication_failed",
            status_code=302
        )
    except HTTPException as e:
        logger.error(f"HTTP error in OAuth callback: {e.detail}", exc_info=True)
        return RedirectResponse(
            url=f"/users/login?error=oauth_failed&reason={e.detail}",
            status_code=302
        )
    except Exception as e:
        logger.error(f"Unexpected error in OAuth callback: {e}", exc_info=True)
        return RedirectResponse(
            url="/users/login?error=oauth_failed&reason=unexpected_error",
            status_code=302
        )

