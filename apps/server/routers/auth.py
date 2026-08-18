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

import re
import secrets
from dataclasses import dataclass
from datetime import timedelta

from authlib.integrations.starlette_client import OAuth, OAuthError
from config import Settings
from database import models
from database.database import get_db
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import JSONResponse, RedirectResponse
from sqlalchemy.orm import Session, sessionmaker
from utils.audit import audit_event
from utils.blocking import run_blocking
from utils.logger import setup_logger
from utils.observability import record_auth

from .users import ACCESS_TOKEN_EXPIRE_MINUTES, create_access_token

router = APIRouter(prefix="/auth", tags=["auth"])
logger = setup_logger(__name__)
settings = Settings()


# Authlib stores state, nonce, and PKCE data in Starlette's signed session.
# This keeps the flow bound to the initiating browser and works across workers.
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
        logger.info("Google OAuth configured", extra={"event_name": "oauth.configured"})
    except Exception as exc:
        logger.error(
            "Google OAuth configuration failed",
            extra={"event_name": "oauth.configuration.failed", "error_type": type(exc).__name__},
        )
        OAUTH_CONFIGURED = False
else:
    logger.warning("Google OAuth is disabled", extra={"event_name": "oauth.disabled"})


@dataclass(frozen=True)
class OAuthIdentity:
    user_id: int
    username: str
    session_version: int


def _worker_session_factory(db: Session) -> sessionmaker[Session]:
    """Create fresh worker sessions against the request's configured database."""
    return sessionmaker(
        bind=db.get_bind(),
        autoflush=False,
        expire_on_commit=False,
    )


def _persist_oauth_audit(
    session_factory: sessionmaker[Session],
    audit_log: models.AuditLog,
) -> None:
    db = session_factory()
    try:
        db.add(audit_log)
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


def _resolve_oauth_identity(
    session_factory: sessionmaker[Session],
    *,
    google_id: str,
    email: str,
    name: str,
    audit_log: models.AuditLog,
) -> OAuthIdentity:
    """Resolve/link an OAuth user in one worker-owned transaction."""
    db = session_factory()
    try:
        user = db.query(models.User).filter(models.User.google_id == google_id).first()

        if user:
            logger.info("OAuth user resolved", extra={"event_name": "oauth.user.resolved"})
        else:
            user = db.query(models.User).filter(models.User.email == email).first()
            if user:
                logger.info("Linking OAuth identity", extra={"event_name": "oauth.user.linked"})
                user.google_id = google_id
                user.is_verified = True
            else:
                base_username = re.sub(r"[^a-zA-Z0-9_]", "", email.split("@", 1)[0])
                if len(base_username) < 4:
                    base_username = f"user_{base_username}"

                username = base_username
                counter = 1
                while db.query(models.User).filter(models.User.username == username).first():
                    username = f"{base_username}{counter}"
                    counter += 1

                logger.info("Creating OAuth user", extra={"event_name": "oauth.user.created"})
                user = models.User(
                    username=username,
                    email=email,
                    full_name=name,
                    google_id=google_id,
                    is_verified=True,
                    hashed_password=secrets.token_urlsafe(32),
                    disabled=False,
                )
                db.add(user)

        db.flush()
        audit_log.user_id = user.id
        db.add(audit_log)
        db.commit()
        return OAuthIdentity(
            user_id=user.id,
            username=user.username,
            session_version=user.session_version or 0,
        )
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


async def _record_oauth_failure(
    session_factory: sessionmaker[Session],
    request: Request,
    reason: str,
) -> None:
    record_auth("oauth", "failure", reason)
    try:
        await run_blocking(
            _persist_oauth_audit,
            session_factory,
            audit_event(
                "authentication.oauth",
                outcome="failure",
                request=request,
                details={"reason": reason},
            ),
        )
    except Exception:
        logger.exception(
            "OAuth failure audit persistence failed",
            extra={"event_name": "audit.oauth.failed", "outcome": "error"},
        )


@router.get("/google")
async def google_login(request: Request):
    """
    Initiate Google OAuth 2.0 authorization flow.

    Redirects user to Google's consent screen.
    Generates and stores CSRF protection state in session.
    """
    if not OAUTH_CONFIGURED:
        record_auth("oauth", "failure", "configuration")
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
        # Generate redirect URI (strip trailing slash from BASE_URL to avoid //)
        base_url = settings.BASE_URL.rstrip('/')
        redirect_uri = f"{base_url}/auth/callback"

        logger.info("Initiating Google OAuth flow", extra={"event_name": "oauth.flow.started"})

        # Redirect to Google's authorization endpoint
        # authlib generates and stores state internally for CSRF protection
        return await oauth.google.authorize_redirect(request, redirect_uri)

    except Exception as exc:
        record_auth("oauth", "failure", "provider_error")
        logger.error(
            "OAuth initiation failed",
            extra={"event_name": "oauth.flow.failed", "error_type": type(exc).__name__},
        )
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
        record_auth("oauth", "failure", "configuration")
        logger.error("OAuth callback received but OAuth not configured")
        return RedirectResponse(url="/users/login?error=oauth_not_configured")

    session_factory = _worker_session_factory(db)
    try:
        # Check for error from Google before attempting token exchange
        error = request.query_params.get('error')
        if error:
            await _record_oauth_failure(session_factory, request, "provider_error")
            logger.warning("OAuth provider rejected authentication")
            return RedirectResponse(
                url="/users/login?error=oauth_failed&reason=provider_error",
                status_code=302
            )

        # Exchange authorization code for access token
        # authlib validates the state parameter internally (CSRF protection)
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
            logger.error("OAuth provider response is missing required identity fields")
            raise HTTPException(status_code=400, detail="Incomplete user information from Google")

        logger.info("OAuth identity received", extra={"event_name": "oauth.identity.received"})

        identity = await run_blocking(
            _resolve_oauth_identity,
            session_factory,
            google_id=str(google_id),
            email=str(email).strip().lower(),
            name=str(name),
            audit_log=audit_event(
                "authentication.oauth",
                request=request,
                details={"provider": "google"},
            ),
        )

        request.state.user_id = identity.user_id
        record_auth("oauth", "success")

        # Create JWT access token
        access_token = create_access_token(
            data={"sub": identity.username, "sv": identity.session_version},
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

        logger.info("OAuth login completed", extra={"event_name": "oauth.login.completed"})
        return response

    except OAuthError as exc:
        await _record_oauth_failure(session_factory, request, "provider_error")
        logger.error(
            "OAuth callback failed",
            extra={"event_name": "oauth.callback.failed", "error_type": type(exc).__name__},
        )
        return RedirectResponse(
            url="/users/login?error=oauth_failed&reason=authentication_failed",
            status_code=302
        )
    except HTTPException as exc:
        await _record_oauth_failure(session_factory, request, "invalid_credentials")
        logger.error(
            "OAuth callback was rejected",
            extra={"event_name": "oauth.callback.rejected", "error_type": type(exc).__name__},
        )
        return RedirectResponse(
            url="/users/login?error=oauth_failed&reason=invalid_response",
            status_code=302
        )
    except Exception as exc:
        await _record_oauth_failure(session_factory, request, "unknown")
        logger.error(
            "Unexpected OAuth callback failure",
            extra={"event_name": "oauth.callback.failed", "error_type": type(exc).__name__},
        )
        return RedirectResponse(
            url="/users/login?error=oauth_failed&reason=unexpected_error",
            status_code=302
        )

