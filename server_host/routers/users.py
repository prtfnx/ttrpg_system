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
from functools import lru_cache

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

async def get_current_user(request: Request, db: Session = Depends(get_db), token: str = Cookie(None, alias="token")):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    
    # Try cookie first, then Authorization header
    if not token:
        authorization = request.headers.get("Authorization")
        if authorization and authorization.startswith("Bearer "):
            token = authorization.split(" ")[1]
    
    if not token:
        raise credentials_exception
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username = payload.get("sub")
        if username is None:
            raise credentials_exception
    except InvalidTokenError:
        raise credentials_exception
    
    user = crud.get_user_by_username(db, username=username)
    if user is None:
        raise credentials_exception
    return user

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
        # Return JSON for API requests
        return current_user
    else:
        # Return HTML page for browser requests
        # Get user stats (you can expand this based on your database schema)
        user_sessions = crud.get_user_game_sessions(db, current_user.id)
        
        # Calculate stats
        games_played = len(user_sessions)
        victories = sum(1 for session in user_sessions if getattr(session, 'status', None) == 'won')
        
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
    return templates.TemplateResponse("login.html", {"request": request})

@router.post("/login")
async def login(
    form_data: Annotated[OAuth2PasswordRequestForm, Depends()],
    db: Session = Depends(get_db)
) -> RedirectResponse:
    token = await login_for_access_token(form_data, db)
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

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

@router.get("/dashboard")
async def dashboard(
    request: Request,
    current_user: Annotated[schemas.User, Depends(get_current_active_user)],
    db: Session = Depends(get_db)
):
    # Get user's game sessions
    user_sessions = crud.get_user_game_sessions(db, current_user.id)
    return templates.TemplateResponse("dashboard.html", {
        "request": request,
        "user": current_user,
        "sessions": user_sessions
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
    user = crud.register_user(db, username, password)
    if not user:
        return templates.TemplateResponse("register.html", {
            "request": request,
            "error": "User already exists"
        })    
    return RedirectResponse(url="/users/login", status_code=status.HTTP_302_FOUND)

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
