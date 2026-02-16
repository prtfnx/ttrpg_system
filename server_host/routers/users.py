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
import jwt

from ..database.database import get_db
from ..database import crud
from ..database import schemas
from ..models import auth as auth_models
from ..utils.rate_limiter import registration_limiter, login_limiter, get_client_ip
from ..utils.logger import setup_logger
from functools import lru_cache

logger = setup_logger(__name__)

router = APIRouter(prefix="/users", tags=["users"])
templates = Jinja2Templates(directory="templates")
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
    except Exception as e:
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
        
        return templates.TemplateResponse("profile.html", {
            "request": request,
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
        data={"sub": user.username}, expires_delta=access_token_expires
    )
    return auth_models.Token(access_token=access_token, token_type="bearer")

@router.get("/me/items/")
async def read_own_items(
    current_user: Annotated[schemas.User, Depends(get_current_active_user)],
):
    return [{"item_id": "Foo", "owner": current_user.username}]

@router.get("/login")
def login_page(request: Request):
    """Login page with optional registration success message"""
    # Check if user just registered
    registered = request.query_params.get("registered")
    success_message = "Registration successful! Please log in with your credentials." if registered else None
    
    return templates.TemplateResponse("login.html", {
        "request": request,
        "success": success_message
    })

@router.post("/login")
async def login(
    request: Request,
    form_data: Annotated[OAuth2PasswordRequestForm, Depends()],
    db: Session = Depends(get_db)
):
    """Login with rate limiting protection"""
    client_ip = get_client_ip(request)
    
    # Rate limiting check - 10 login attempts per 5 minutes per IP
    if not login_limiter.is_allowed(client_ip, max_requests=10, window_minutes=5):
        time_until_reset = login_limiter.get_time_until_reset(client_ip, window_minutes=5)
        return templates.TemplateResponse("login.html", {
            "request": request,
            "error": f"Too many login attempts. Please try again in {time_until_reset} seconds."
        }, status_code=429)  # 429 Too Many Requests
    
    # Validate input lengths
    if len(form_data.username) < 4:
        return templates.TemplateResponse("login.html", {
            "request": request,
            "error": "Username must be at least 4 characters long"
        }, status_code=400)  # 400 Bad Request
    
    if len(form_data.password) < 4:
        return templates.TemplateResponse("login.html", {
            "request": request,
            "error": "Password must be at least 4 characters long"
        }, status_code=400)  # 400 Bad Request
    
    try:
        token = await login_for_access_token(form_data, db)
        if not token:
            return templates.TemplateResponse("login.html", {
                "request": request,
                "error": "Incorrect username or password"
            }, status_code=401)  # 401 Unauthorized

        response = RedirectResponse(url="/users/dashboard", status_code=status.HTTP_302_FOUND)
        response.set_cookie(
            key="token", 
            value=token.access_token, 
            httponly=True, 
            max_age=ACCESS_TOKEN_EXPIRE_MINUTES * 60,
            samesite="lax",
            secure=False,  # Set to True in production with HTTPS
            path="/"
        )
        return response
    except HTTPException:
        return templates.TemplateResponse("login.html", {
            "request": request,
            "error": "Incorrect username or password"
        }, status_code=401)  # 401 Unauthorized

@router.get("/dashboard")
async def dashboard(
    request: Request,
    current_user: Annotated[schemas.User, Depends(get_current_active_user)],
    db: Session = Depends(get_db)
):
    # Check if this is an API request (JSON) vs web request (HTML)
    accept_header = request.headers.get("accept", "")
    
    # Get user's game sessions
    user_sessions = crud.get_user_game_sessions(db, current_user.id)
    
    if "application/json" in accept_header:
        # Return JSON for API requests
        sessions_data = []
        for session in user_sessions:
            sessions_data.append({
                "session_code": session.session_code,
                "session_name": session.name,
                "role": "dm" if session.owner_id == current_user.id else "player",
                "created_at": session.created_at.isoformat() if hasattr(session, 'created_at') else None
            })
        return {"sessions": sessions_data}
    else:
        # Return HTML page for browser requests
        # Extract session objects from tuples for template
        sessions_for_template = [session for session, role in user_sessions]
        return templates.TemplateResponse("dashboard.html", {
            "request": request,
            "user": current_user,
            "sessions": sessions_for_template
        })

@router.get("/register")
def register_page(request: Request):
    return templates.TemplateResponse("register.html", {"request": request})

@router.post("/register")
def register_user_view(
    request: Request, 
    username: str = Form(...), 
    password: str = Form(...),
    db: Session = Depends(get_db)
):
    """Register a new user with validation and rate limiting"""
    client_ip = get_client_ip(request)
    
    # Rate limiting check - 5 registration attempts per 10 minutes per IP
    if not registration_limiter.is_allowed(client_ip, max_requests=5, window_minutes=10):
        time_until_reset = registration_limiter.get_time_until_reset(client_ip, window_minutes=10)
        return templates.TemplateResponse("register.html", {
            "request": request,
            "error": f"Too many registration attempts. Please try again in {time_until_reset} seconds.",
            "username": username  # Preserve username in form
        }, status_code=429)  # 429 Too Many Requests
    
    # Additional basic validation (the main validation is in crud.py)
    if not username or not password:
        return templates.TemplateResponse("register.html", {
            "request": request,
            "error": "Username and password are required",
            "username": username
        }, status_code=400)  # 400 Bad Request
    
    # Attempt to register user
    result = crud.register_user(db, username, password)
    
    # Handle the new return format (user_or_none, message)
    if isinstance(result, tuple):
        user, message = result
        if user is None:
            # Registration failed - determine if it's a conflict or validation error
            status_code = 409 if "already exists" in message.lower() or "already taken" in message.lower() else 400
            return templates.TemplateResponse("register.html", {
                "request": request,
                "error": message,
                "username": username
            }, status_code=status_code)  # 409 Conflict or 400 Bad Request
        # Registration successful
        return RedirectResponse(url="/users/login?registered=1", status_code=status.HTTP_302_FOUND)
    else:
        # Handle old format for backward compatibility
        if not result:
            return templates.TemplateResponse("register.html", {
                "request": request,
                "error": "Registration failed. Username may already exist.",
                "username": username
            }, status_code=409)  # 409 Conflict
        return RedirectResponse(url="/users/login?registered=1", status_code=status.HTTP_302_FOUND)

@router.get("/edit")
async def edit_profile_page(
    request: Request,
    current_user: Annotated[schemas.User, Depends(get_current_active_user)]
):
    """Edit profile page (placeholder - you can create edit.html template)"""
    return templates.TemplateResponse("profile.html", {
        "request": request,
        "user": current_user,
        "edit_mode": True
    })

@router.post("/edit")
async def update_profile(
    request: Request,
    current_user: Annotated[schemas.User, Depends(get_current_active_user)],
    db: Session = Depends(get_db),
    character_name: str = Form(None)
):
    """Update user profile"""
    # Update character name if provided
    if character_name:
        # You'll need to add this function to your crud.py
        # crud.update_user_character_name(db, current_user.id, character_name)
        pass    
    return RedirectResponse(url="/users/me", status_code=status.HTTP_302_FOUND)

@router.get("/auth-error")
async def auth_error_page(request: Request):
    """Authentication error page"""
    return templates.TemplateResponse("auth_error.html", {"request": request})

@router.get("/logout")
def logout():
    """Logout by redirecting and clearing cookie"""
    response = RedirectResponse(url="/users/login", status_code=status.HTTP_302_FOUND)
    response.delete_cookie(key="token", path="/", samesite="lax")
    return response
