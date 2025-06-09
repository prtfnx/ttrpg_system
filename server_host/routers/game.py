"""
Game session management router
"""
from fastapi import APIRouter, Request, Depends, Form, HTTPException, status
from fastapi.responses import RedirectResponse
from fastapi.templating import Jinja2Templates
from sqlalchemy.orm import Session
from typing import Annotated, List

from ..database.database import get_db
from ..database import crud, schemas
from ..models import game as game_models
from .users import get_current_active_user

router = APIRouter(prefix="/game", tags=["game"])
templates = Jinja2Templates(directory="templates")

@router.get("/")
async def game_lobby(
    request: Request,
    current_user: Annotated[schemas.User, Depends(get_current_active_user)],
    db: Session = Depends(get_db)
):
    """Main game lobby - choose or create game sessions"""
    user_sessions = crud.get_user_game_sessions(db, current_user.id)
    return templates.TemplateResponse("game_lobby.html", {
        "request": request,
        "user": current_user,
        "sessions": user_sessions
    })

@router.post("/create")
async def create_game_session(
    request: Request,
    game_name: str = Form(...),
    current_user: Annotated[schemas.User, Depends(get_current_active_user)] = None,
    db: Session = Depends(get_db)
):
    """Create a new game session"""
    session_data = game_models.GameSessionCreate(name=game_name)
    game_session = crud.create_game_session(db, session_data, current_user.id)
    
    return RedirectResponse(
        url=f"/game/session/{game_session.session_code}",
        status_code=status.HTTP_302_FOUND
    )

@router.post("/join")
async def join_game_session(
    request: Request,
    session_code: str = Form(...),
    character_name: str = Form(None),
    current_user: Annotated[schemas.User, Depends(get_current_active_user)] = None,
    db: Session = Depends(get_db)
):
    """Join an existing game session"""
    game_session = crud.get_game_session_by_code(db, session_code)
    if not game_session:
        return templates.TemplateResponse("game_lobby.html", {
            "request": request,
            "user": current_user,
            "sessions": crud.get_user_game_sessions(db, current_user.id),
            "error": "Game session not found"
        })
    
    # Join the session
    player = crud.join_game_session(db, session_code, current_user.id, character_name)
    if not player:
        return templates.TemplateResponse("game_lobby.html", {
            "request": request,
            "user": current_user,
            "sessions": crud.get_user_game_sessions(db, current_user.id),
            "error": "Could not join game session"
        })
    
    return RedirectResponse(
        url=f"/game/session/{session_code}",
        status_code=status.HTTP_302_FOUND
    )

@router.get("/session/{session_code}")
async def game_session_page(
    session_code: str,
    request: Request,
    current_user: Annotated[schemas.User, Depends(get_current_active_user)],
    db: Session = Depends(get_db)
):
    """Game session page with WebSocket connection"""
    game_session = crud.get_game_session_by_code(db, session_code)
    if not game_session:
        raise HTTPException(status_code=404, detail="Game session not found")
    
    # Check if user is part of this session
    player = crud.join_game_session(db, session_code, current_user.id)
    if not player:
        raise HTTPException(status_code=403, detail="Not authorized to join this session")
    
    players = crud.get_session_players(db, game_session.id)
    
    return templates.TemplateResponse("game_session.html", {
        "request": request,
        "user": current_user,
        "session": game_session,
        "players": players,
        "session_code": session_code
    })

@router.get("/api/sessions", response_model=List[game_models.GameSession])
async def get_user_sessions(
    current_user: Annotated[schemas.User, Depends(get_current_active_user)],
    db: Session = Depends(get_db)
):
    """API endpoint to get user's game sessions"""
    return crud.get_user_game_sessions(db, current_user.id)
