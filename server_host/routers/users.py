"""
User authentication and management router
"""
from fastapi import APIRouter, Request, Depends, Form, HTTPException, status, Cookie
from fastapi.responses import RedirectResponse
from fastapi.templating import Jinja2Templates
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from typing import Annotated
from datetime import datetime, timedelta, timezone
from jwt.exceptions import InvalidTokenError
import hashlib
import jwt
import secrets

from ..database.database import get_db
from ..database import crud
from ..database import schemas
from ..database import models
from ..models import auth as auth_models
from ..utils.rate_limiter import registration_limiter, login_limiter, password_reset_limiter, get_client_ip
from ..utils.logger import setup_logger
from ..service.email import send_password_reset, send_password_changed, send_email_change_verify, send_email_change_notify
from functools import lru_cache
import os

logger = setup_logger(__name__)

router = APIRouter(prefix="/users", tags=["users"])
templates_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), "templates")
templates = Jinja2Templates(directory=templates_dir)
from .. import config

@lru_cache
def get_settings():
    return config.Settings()
ACCESS_TOKEN_EXPIRE_MINUTES = 360
SECRET_KEY = get_settings().SECRET_KEY
ALGORITHM = get_settings().ALGORITHM


def create_access_token(data: dict, expires_delta: timedelta | None = None):
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        expire = datetime.now(timezone.utc) + timedelta(minutes=15)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

async def get_current_user(request: Request, db: Session = Depends(get_db)):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    
    # Try to get token from cookie first (manual reading for reliability)
    token = request.cookies.get("token")
    logger.debug(f"get_current_user: token from cookie: {token}")
    
    # If no token in cookie, try Authorization header
    if not token:
        authorization = request.headers.get("Authorization")
        if authorization and authorization.startswith("Bearer "):
            token = authorization.split(" ")[1]
            logger.debug(f"get_current_user: token from Authorization header: {token}")
    
    if not token:
        logger.debug("get_current_user: No token found, raising credentials_exception")
        raise credentials_exception
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username = payload.get("sub")
        if username is None:
            logger.debug("get_current_user: No username in payload")
            raise credentials_exception
        logger.debug(f"get_current_user: Successfully decoded token for username: {username}")
    except InvalidTokenError as e:
        logger.debug(f"get_current_user: Token validation failed: {e}")
        raise credentials_exception
    
    user = crud.get_user_by_username(db, username=username)
    if user is None:
        logger.debug(f"get_current_user: User {username} not found in database")
        raise credentials_exception
    if (user.session_version or 0) != payload.get("sv", 0):
        raise credentials_exception
    logger.debug(f"get_current_user: User {username} found and authenticated")
    return user

async def get_current_user_optional(request: Request, db: Session = Depends(get_db)):
    """
    Optional authentication - returns user if authenticated, None if not.
    Does not raise exceptions for missing/invalid tokens.
    """
    try:
        # Try to get token from cookie first
        token = request.cookies.get("token")
        
        # If no token in cookie, try Authorization header
        if not token:
            authorization = request.headers.get("Authorization")
            if authorization and authorization.startswith("Bearer "):
                token = authorization.split(" ")[1]
        
        if not token:
            return None
        
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username = payload.get("sub")
        if username is None:
            return None
        
        user = crud.get_user_by_username(db, username=username)
        return user
    except (InvalidTokenError, Exception) as e:
        logger.debug(f"get_current_user_optional: Authentication failed: {e}")
        return None

async def get_current_active_user(current_user: Annotated[schemas.User, Depends(get_current_user)]):
    if current_user.disabled:
        raise HTTPException(status_code=400, detail="Inactive user")
    return current_user

@router.get("/me")
async def users_me(
    request: Request,
    current_user: Annotated[schemas.User, Depends(get_current_active_user)],
    db: Session = Depends(get_db)
):
    """User profile - returns JSON for API requests, HTML page for browser requests"""
    # Check if this is an API request (JSON) vs web request (HTML)
    accept_header = request.headers.get("accept", "")
    if "application/json" in accept_header:
        # Determine user role based on session ownership
        user_sessions = crud.get_user_game_sessions(db, current_user.id)
        is_dm = any(session.owner_id == current_user.id for session, role in user_sessions)
        
        # Determine permissions based on role
        user_role = "dm" if is_dm else "player"
        permissions = []
        
        if user_role == "dm":
            # DM gets comprehensive permissions
            permissions = [
                "compendium:read",
                "compendium:write", 
                "table:admin",
                "character:write",
                "sprite:create",
                "sprite:delete",
                "game:manage",
                "player:manage"
            ]
        else:
            # Players get basic permissions
            permissions = [
                "compendium:read",
                "character:read",
                "sprite:create"
            ]
        
        # Return JSON for API requests with additional fields needed by client
        return {
            "id": current_user.id,
            "username": current_user.username,
            "email": getattr(current_user, 'email', None),
            "disabled": current_user.disabled,
            "role": user_role,  # Dynamic role based on session ownership
            "permissions": permissions,  # Dynamic permissions based on role
            "created_at": getattr(current_user, 'created_at', None)
        }
    else:
        # Return HTML page for browser requests
        # Get user stats (you can expand this based on your database schema)
        user_sessions = crud.get_user_game_sessions(db, current_user.id)
        
        # Calculate stats
        games_played = len(user_sessions)
        victories = sum(1 for session, role in user_sessions if getattr(session, 'status', None) == 'won')
        
        # Add calculated stats to user object for template
        profile_data = {
            'user': current_user,
            'games_played': games_played,
            'victories': victories,
            'monsters_defeated': getattr(current_user, 'monsters_defeated', 2156),
            'gold_earned': getattr(current_user, 'gold_earned', 45892),
            'level': getattr(current_user, 'level', 42)
        }
        
        return templates.TemplateResponse(request, "profile.html", {
            **profile_data
        })

@router.post("/token")
async def login_for_access_token(
    form_data: Annotated[OAuth2PasswordRequestForm, Depends()],
    db: Session = Depends(get_db)
) -> auth_models.Token:
    user = crud.authenticate_user(db, form_data.username, form_data.password)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": user.username, "sv": user.session_version or 0},
        expires_delta=access_token_expires
    )
    return auth_models.Token(access_token=access_token, token_type="bearer")

@router.get("/me/items/")
async def read_own_items(
    current_user: Annotated[schemas.User, Depends(get_current_active_user)],
):
    return [{"item_id": "Foo", "owner": current_user.username}]

@router.get("/login")
def login_page(request: Request):
    """Login page with optional registration/verification success messages"""
    registered = request.query_params.get("registered")
    verify = request.query_params.get("verify")
    verified = request.query_params.get("verified")
    invite_code = request.query_params.get("invite")
    next_url = request.query_params.get("next")
    
    success_message = None
    if registered and verify:
        success_message = "Registration successful! Please check your console logs for the verification link, then log in."
    elif registered:
        success_message = "Registration successful! Please log in with your credentials."
    elif verified:
        success_message = "Email verified successfully! You can now log in."

    msg = request.query_params.get("msg")
    if msg == "password_reset_success":
        success_message = "Password reset successful. Please log in with your new password."
    elif msg == "account_deleted":
        success_message = "Your account has been deactivated."
    
    return templates.TemplateResponse(request, "login.html", {
        "success": success_message,
        "invite_code": invite_code,
        "next_url": next_url
    })

@router.post("/login")
async def login(
    request: Request,
    form_data: Annotated[OAuth2PasswordRequestForm, Depends()],
    invite_code: str = Form(None),
    next_url: str = Form(None),
    db: Session = Depends(get_db)
):
    """Login with rate limiting protection"""
    client_ip = get_client_ip(request)
    
    # Rate limiting check - 10 login attempts per 5 minutes per IP
    if not login_limiter.is_allowed(client_ip, max_requests=10, window_minutes=5):
        time_until_reset = login_limiter.get_time_until_reset(client_ip, window_minutes=5)
        return templates.TemplateResponse(request, "login.html", {
            "error": f"Too many login attempts. Please try again in {time_until_reset} seconds."
        }, status_code=429)  # 429 Too Many Requests
    
    # Validate input lengths
    if len(form_data.username) < 4:
        return templates.TemplateResponse(request, "login.html", {
            "error": "Username must be at least 4 characters long"
        }, status_code=400)  # 400 Bad Request
    
    if len(form_data.password) < 8:
        return templates.TemplateResponse(request, "login.html", {
            "error": "Password must be at least 8 characters long"
        }, status_code=400)  # 400 Bad Request
    
    try:
        token = await login_for_access_token(form_data, db)
        if not token:
            return templates.TemplateResponse(request, "login.html", {
                "error": "Incorrect username or password"
            }, status_code=401)

        # Handle invite code - redirect to invitation page to auto-accept
        if invite_code and next_url:
            response = RedirectResponse(url=next_url, status_code=302)
        elif invite_code:
            # Auto-accept invitation
            user = crud.get_user_by_username(db, form_data.username)
            invitation = db.query(models.SessionInvitation).filter(
                models.SessionInvitation.invite_code == invite_code
            ).first()
            
            if invitation and invitation.is_valid():
                session = db.query(models.GameSession).filter(
                    models.GameSession.id == invitation.session_id
                ).first()
                
                if not session:
                    # Session referenced by invitation does not exist
                    response = RedirectResponse(url="/users/dashboard", status_code=302)
                else:
                    existing = db.query(models.GamePlayer).filter(
                        models.GamePlayer.session_id == session.id,
                        models.GamePlayer.user_id == user.id
                    ).first()
                    
                    if not existing:
                        new_player = models.GamePlayer(
                            session_id=session.id,
                            user_id=user.id,
                            role=invitation.pre_assigned_role,
                            joined_at=datetime.utcnow()
                        )
                        db.add(new_player)
                        
                        invitation.uses_count += 1
                        if invitation.max_uses > 0 and invitation.uses_count >= invitation.max_uses:
                            invitation.is_active = False
                        
                        db.commit()
                    
                    response = RedirectResponse(
                        url=f"/game/session/{session.session_code}",
                        status_code=302
                    )
            else:
                response = RedirectResponse(url="/users/dashboard", status_code=302)
        else:
            response = RedirectResponse(url="/users/dashboard", status_code=302)
        
        settings = get_settings()
        response.set_cookie(
            key="token", 
            value=token.access_token, 
            httponly=True, 
            max_age=ACCESS_TOKEN_EXPIRE_MINUTES * 60,
            samesite="lax",
            secure=settings.ENVIRONMENT == "production",
            path="/"
        )
        return response
    except HTTPException:
        return templates.TemplateResponse(request, "login.html", {
            "error": "Incorrect username or password"
        }, status_code=401)  # 401 Unauthorized

@router.get("/verify")
async def verify_email(
    request: Request,
    token: str,
    db: Session = Depends(get_db)
):
    """Verify user email address using token from verification email"""
    
    # Find verification token
    email_token = db.query(models.EmailVerificationToken).filter(
        models.EmailVerificationToken.token == token
    ).first()
    
    if not email_token:
        return templates.TemplateResponse(request, "auth_error.html", {
            "error_message": "Invalid verification link. The token may have expired or been used already."
        }, status_code=400)
    
    # Check if token is valid
    if not email_token.is_valid():
        return templates.TemplateResponse(request, "auth_error.html", {
            "error_message": "This verification link has expired or was already used. Please request a new one."
        }, status_code=400)
    
    # Mark token as used
    email_token.used_at = datetime.utcnow()
    
    # Update user verification status
    user = db.query(models.User).filter(models.User.id == email_token.user_id).first()
    if user:
        user.is_verified = True
        db.commit()
        
        logger.info(f"Email verified for user: {user.username}")
        
        return RedirectResponse(
            url="/users/login?verified=1",
            status_code=status.HTTP_302_FOUND
        )
    else:
        return templates.TemplateResponse(request, "auth_error.html", {
            "error_message": "User not found."
        }, status_code=404)

@router.get("/dashboard")
async def dashboard(
    request: Request,
    current_user: Annotated[schemas.User, Depends(get_current_active_user)],
    db: Session = Depends(get_db)
):
    accept_header = request.headers.get("accept", "")
    user_sessions = crud.get_user_game_sessions(db, current_user.id)
    
    if "application/json" in accept_header:
        sessions_data = []
        for session, role in user_sessions:
            sessions_data.append({
                "session_code": session.session_code,
                "session_name": session.name,
                "role": role,
                "created_at": session.created_at.isoformat() if hasattr(session, 'created_at') else None
            })
        return {"sessions": sessions_data}
    else:
        return templates.TemplateResponse(request, "dashboard.html", {
            "user": current_user,
            "sessions": user_sessions
        })

@router.get("/register")
def register_page(request: Request):
    invite_code = request.query_params.get("invite")
    return templates.TemplateResponse(request, "register.html", {
        "invite_code": invite_code
    })

@router.post("/register")
def register_user_view(
    request: Request, 
    username: str = Form(...), 
    email: str = Form(...),
    password: str = Form(...),
    confirm_password: str = Form(...),
    invite_code: str = Form(None),
    db: Session = Depends(get_db)
):
    """Register a new user with email verification"""
    client_ip = get_client_ip(request)
    
    # Rate limiting check - 5 registration attempts per 10 minutes per IP
    if not registration_limiter.is_allowed(client_ip, max_requests=5, window_minutes=10):
        time_until_reset = registration_limiter.get_time_until_reset(client_ip, window_minutes=10)
        return templates.TemplateResponse(request, "register.html", {
            "error": f"Too many registration attempts. Please try again in {time_until_reset} seconds.",
            "username": username,
            "email": email
        }, status_code=429)
    
    # Basic validation
    if not username or not password or not email:
        return templates.TemplateResponse(request, "register.html", {
            "error": "All fields are required",
            "username": username,
            "email": email
        }, status_code=400)
    
    # Password confirmation check
    if password != confirm_password:
        return templates.TemplateResponse(request, "register.html", {
            "error": "Passwords do not match",
            "username": username,
            "email": email
        }, status_code=400)
    
    # Attempt to register user
    result = crud.register_user(db, username, password, email=email)
    
    if isinstance(result, tuple):
        user, message = result
        if user is None:
            status_code = 409 if "already exists" in message.lower() or "already" in message.lower() else 400
            return templates.TemplateResponse(request, "register.html", {
                "error": message,
                "username": username,
                "email": email
            }, status_code=status_code)
        
        # Registration successful - create verification token
        verification_token = secrets.token_urlsafe(32)
        expires_at = datetime.utcnow() + timedelta(hours=24)
        
        email_token = models.EmailVerificationToken(
            token=verification_token,
            user_id=user.id,
            expires_at=expires_at
        )
        db.add(email_token)
        db.commit()
        
        # Log verification URL (in production, send email)
        verification_url = f"/users/verify?token={verification_token}"
        logger.info(f"Email verification URL for {username}: {verification_url}")
        
        # Handle invite code - auto-accept after registration
        if invite_code:
            invitation = db.query(models.SessionInvitation).filter(
                models.SessionInvitation.invite_code == invite_code
            ).first()
            
            if invitation and invitation.is_valid():
                session = db.query(models.GameSession).filter(
                    models.GameSession.id == invitation.session_id
                ).first()
                
                # Ensure the session still exists before proceeding
                if session:
                    # Avoid creating duplicate membership rows
                    existing_player = db.query(models.GamePlayer).filter(
                        models.GamePlayer.session_id == session.id,
                        models.GamePlayer.user_id == user.id,
                    ).first()
                    
                    if not existing_player:
                        new_player = models.GamePlayer(
                            session_id=session.id,
                            user_id=user.id,
                            role=invitation.pre_assigned_role,
                            joined_at=datetime.utcnow()
                        )
                        db.add(new_player)
                        
                        invitation.uses_count += 1
                        if invitation.max_uses > 0 and invitation.uses_count >= invitation.max_uses:
                            invitation.is_active = False
                        
                        db.commit()
                    
                    # Log in and redirect to session
                    access_token = create_access_token(
                        data={"sub": user.username, "sv": user.session_version or 0},
                        expires_delta=timedelta(hours=6)
                    )
                    response = RedirectResponse(
                        url=f"/game/session/{session.session_code}",
                        status_code=302
                    )
                    response.set_cookie(
                        key="token",
                        value=access_token,
                        httponly=True,
                        max_age=21600,
                        samesite="lax",
                        secure=get_settings().ENVIRONMENT == "production"
                    )
                    return response
        
        return RedirectResponse(
            url="/users/login?registered=1&verify=1",
            status_code=status.HTTP_302_FOUND
        )
    else:
        return templates.TemplateResponse(request, "register.html", {
            "error": "Registration failed. Please try again.",
            "username": username,
            "email": email
        }, status_code=500)

@router.get("/edit")
async def edit_profile_redirect(request: Request):
    return RedirectResponse("/users/settings", status_code=301)


@router.post("/edit")
async def edit_post_redirect(request: Request):
    return RedirectResponse("/users/settings", status_code=301)

@router.get("/auth-error")
async def auth_error_page(request: Request):
    return templates.TemplateResponse(request, "auth_error.html", {
        "error_message": "Authentication failed. Please try again."
    })


# ─── Forgot / Reset Password ─────────────────────────────────────────────────

@router.get("/forgot-password")
def forgot_password_page(request: Request):
    return templates.TemplateResponse(request, "forgot_password.html", {})


@router.post("/forgot-password")
async def forgot_password_submit(
    request: Request,
    email: str = Form(...),
    db: Session = Depends(get_db),
):
    client_ip = get_client_ip(request)
    if not password_reset_limiter.is_allowed(client_ip, max_requests=3, window_minutes=5):
        return templates.TemplateResponse(request, "forgot_password.html", {
            "error": "Too many requests. Please try again later."
        }, status_code=429)

    user = db.query(models.User).filter(models.User.email == email.strip()).first()
    if user:
        # Invalidate existing unused tokens
        db.query(models.PasswordResetToken).filter(
            models.PasswordResetToken.user_id == user.id,
            models.PasswordResetToken.used == False,
        ).delete()

        raw = secrets.token_urlsafe(32)
        db.add(models.PasswordResetToken(
            user_id=user.id,
            token_hash=hashlib.sha256(raw.encode()).hexdigest(),
            expires_at=datetime.utcnow() + timedelta(minutes=15),
        ))
        db.commit()

        base_url = get_settings().BASE_URL.rstrip("/")
        send_password_reset(user.email, f"{base_url}/users/reset-password?token={raw}")
    else:
        # Timing equalisation — prevent enumeration via response time delta
        crud.get_password_hash("timing-dummy")

    # Always show the same page regardless of whether email exists
    return templates.TemplateResponse(request, "forgot_password_sent.html", {})


@router.get("/reset-password")
def reset_password_page(request: Request, token: str = "", db: Session = Depends(get_db)):
    if not token:
        return RedirectResponse("/users/forgot-password", status_code=302)

    record = db.query(models.PasswordResetToken).filter(
        models.PasswordResetToken.token_hash == hashlib.sha256(token.encode()).hexdigest(),
        models.PasswordResetToken.used == False,
        models.PasswordResetToken.expires_at > datetime.utcnow(),
    ).first()

    if not record:
        return templates.TemplateResponse(request, "auth_error.html", {
            "error_message": "This reset link is invalid or has expired. Please request a new one."
        }, status_code=400)

    return templates.TemplateResponse(request, "reset_password.html", {"token": token})


@router.post("/reset-password")
async def reset_password_submit(
    request: Request,
    token: str = Form(...),
    new_password: str = Form(...),
    confirm_password: str = Form(...),
    db: Session = Depends(get_db),
):
    if new_password != confirm_password:
        return templates.TemplateResponse(request, "reset_password.html", {
            "token": token, "error": "Passwords do not match"
        }, status_code=400)

    pw_ok, pw_err = crud.validate_password(new_password)
    if not pw_ok:
        return templates.TemplateResponse(request, "reset_password.html", {
            "token": token, "error": pw_err
        }, status_code=400)

    record = db.query(models.PasswordResetToken).filter(
        models.PasswordResetToken.token_hash == hashlib.sha256(token.encode()).hexdigest(),
        models.PasswordResetToken.used == False,
        models.PasswordResetToken.expires_at > datetime.utcnow(),
    ).first()

    if not record:
        return templates.TemplateResponse(request, "auth_error.html", {
            "error_message": "This reset link is invalid or has expired."
        }, status_code=400)

    record.used = True
    record.user.hashed_password = crud.get_password_hash(new_password)
    record.user.password_set_at = datetime.utcnow()
    record.user.session_version = (record.user.session_version or 0) + 1

    db.add(models.AuditLog(
        event_type="password_reset",
        user_id=record.user.id,
        ip_address=get_client_ip(request),
        details='{"method":"email_token"}',
    ))
    db.commit()

    if record.user.email:
        send_password_changed(record.user.email)

    return RedirectResponse("/users/login?msg=password_reset_success", status_code=302)


# ─── User Settings ────────────────────────────────────────────────────────────

@router.get("/settings")
async def settings_page(
    request: Request,
    current_user: Annotated[schemas.User, Depends(get_current_active_user)],
):
    return templates.TemplateResponse(request, "settings.html", {
        "user": current_user,
        "tab": request.query_params.get("tab", "profile"),
        "msg": request.query_params.get("msg"),
        "error": request.query_params.get("error"),
        "has_password": current_user.password_set_at is not None,
        "has_google": current_user.google_id is not None,
    })


@router.post("/settings/profile")
async def settings_profile(
    request: Request,
    full_name: str = Form(""),
    current_user: Annotated[schemas.User, Depends(get_current_active_user)] = None,
    db: Session = Depends(get_db),
):
    user = db.query(models.User).filter(models.User.id == current_user.id).first()
    user.full_name = full_name.strip() or None
    db.commit()
    return RedirectResponse("/users/settings?tab=profile&msg=profile_updated", status_code=302)


@router.post("/settings/password")
async def settings_password(
    request: Request,
    current_password: str = Form(""),
    new_password: str = Form(...),
    confirm_password: str = Form(...),
    current_user: Annotated[schemas.User, Depends(get_current_active_user)] = None,
    db: Session = Depends(get_db),
):
    has_password = current_user.password_set_at is not None

    if has_password and not crud.verify_password(current_password, current_user.hashed_password):
        return RedirectResponse("/users/settings?tab=security&error=Current+password+is+incorrect", status_code=302)

    if new_password != confirm_password:
        return RedirectResponse("/users/settings?tab=security&error=Passwords+do+not+match", status_code=302)

    pw_ok, pw_err = crud.validate_password(new_password)
    if not pw_ok:
        return RedirectResponse(f"/users/settings?tab=security&error={pw_err.replace(' ', '+')}", status_code=302)

    if has_password and crud.verify_password(new_password, current_user.hashed_password):
        return RedirectResponse("/users/settings?tab=security&error=New+password+must+differ+from+current", status_code=302)

    user = db.query(models.User).filter(models.User.id == current_user.id).first()
    user.hashed_password = crud.get_password_hash(new_password)
    user.password_set_at = datetime.utcnow()
    user.session_version = (user.session_version or 0) + 1

    db.add(models.AuditLog(event_type="password_change", user_id=user.id, ip_address=get_client_ip(request)))
    db.commit()

    if user.email:
        send_password_changed(user.email)

    # Re-issue JWT with new session_version so user stays logged in
    access_token = create_access_token(
        data={"sub": user.username, "sv": user.session_version},
        expires_delta=timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES),
    )
    response = RedirectResponse("/users/settings?tab=security&msg=password_changed", status_code=302)
    response.set_cookie(
        key="token",
        value=access_token,
        httponly=True,
        samesite="lax",
        secure=get_settings().ENVIRONMENT == "production",
        max_age=ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        path="/",
    )
    return response


@router.post("/settings/email")
async def settings_email(
    request: Request,
    new_email: str = Form(...),
    password: str = Form(...),
    current_user: Annotated[schemas.User, Depends(get_current_active_user)] = None,
    db: Session = Depends(get_db),
):
    if current_user.password_set_at and not crud.verify_password(password, current_user.hashed_password):
        return RedirectResponse("/users/settings?tab=security&error=Incorrect+password", status_code=302)

    new_email = new_email.strip().lower()
    if crud.get_user_by_email(db, new_email):
        return RedirectResponse("/users/settings?tab=security&error=Email+already+in+use", status_code=302)

    # Invalidate existing pending changes for this user
    db.query(models.PendingEmailChange).filter(
        models.PendingEmailChange.user_id == current_user.id,
        models.PendingEmailChange.used == False,
    ).delete()

    raw = secrets.token_urlsafe(32)
    db.add(models.PendingEmailChange(
        user_id=current_user.id,
        new_email=new_email,
        token_hash=hashlib.sha256(raw.encode()).hexdigest(),
        expires_at=datetime.utcnow() + timedelta(hours=24),
    ))
    db.commit()

    base_url = get_settings().BASE_URL.rstrip("/")
    send_email_change_verify(new_email, f"{base_url}/users/verify-email-change?token={raw}")
    if current_user.email:
        send_email_change_notify(current_user.email)

    return RedirectResponse("/users/settings?tab=security&msg=verification_email_sent", status_code=302)


@router.get("/verify-email-change")
def verify_email_change(request: Request, token: str = "", db: Session = Depends(get_db)):
    if not token:
        return RedirectResponse("/users/login", status_code=302)

    record = db.query(models.PendingEmailChange).filter(
        models.PendingEmailChange.token_hash == hashlib.sha256(token.encode()).hexdigest(),
        models.PendingEmailChange.used == False,
        models.PendingEmailChange.expires_at > datetime.utcnow(),
    ).first()

    if not record:
        return templates.TemplateResponse(request, "auth_error.html", {
            "error_message": "This verification link is invalid or has expired."
        }, status_code=400)

    if crud.get_user_by_email(db, record.new_email):
        return templates.TemplateResponse(request, "auth_error.html", {
            "error_message": "This email is already in use by another account."
        }, status_code=400)

    record.used = True
    user = db.query(models.User).filter(models.User.id == record.user_id).first()
    user.email = record.new_email

    db.add(models.AuditLog(
        event_type="email_change",
        user_id=user.id,
        ip_address=get_client_ip(request),
        details=f'{{"new_email":"{record.new_email}"}}',
    ))
    db.commit()

    return RedirectResponse("/users/settings?tab=security&msg=email_changed", status_code=302)


@router.post("/settings/delete")
async def settings_delete(
    request: Request,
    username_confirm: str = Form(...),
    password: str = Form(...),
    current_user: Annotated[schemas.User, Depends(get_current_active_user)] = None,
    db: Session = Depends(get_db),
):
    if username_confirm != current_user.username:
        return RedirectResponse("/users/settings?tab=account&error=Username+does+not+match", status_code=302)

    if current_user.password_set_at and not crud.verify_password(password, current_user.hashed_password):
        return RedirectResponse("/users/settings?tab=account&error=Incorrect+password", status_code=302)

    user = db.query(models.User).filter(models.User.id == current_user.id).first()
    user.disabled = True
    user.session_version = (user.session_version or 0) + 1

    db.add(models.AuditLog(event_type="account_delete", user_id=user.id, ip_address=get_client_ip(request)))
    db.commit()

    response = RedirectResponse("/users/login?msg=account_deleted", status_code=302)
    response.delete_cookie(key="token", path="/", samesite="lax")
    return response


@router.get("/logout")
def logout():
    response = RedirectResponse(url="/users/login", status_code=status.HTTP_302_FOUND)
    response.delete_cookie(key="token", path="/", samesite="lax")
    return response
