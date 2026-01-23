"""
Game session management router
"""
from fastapi import APIRouter, Request, Depends, Form, HTTPException, status
from fastapi.responses import RedirectResponse
from fastapi.templating import Jinja2Templates
from sqlalchemy.orm import Session
from typing import Annotated, List
import secrets
import string
from ..database.database import get_db
from ..database import crud, schemas
from ..models import game as game_models
from ..utils.logger import setup_logger
from .users import get_current_active_user

logger = setup_logger(__name__)
router = APIRouter(prefix="/game", tags=["game"])
templates = Jinja2Templates(directory="templates")

def generate_session_code(length: int = 6) -> str:
    """Generate a short, unique session code"""
    # Use uppercase letters and digits for clarity
    characters = string.ascii_uppercase + string.digits
    # Exclude confusing characters: 0, O, 1, I, L
    characters = characters.replace('0', '').replace('O', '').replace('1', '').replace('I', '').replace('L', '')
    return ''.join(secrets.choice(characters) for _ in range(length))

def generate_unique_session_code(db: Session, length: int = 6, max_attempts: int = 10) -> str:
    """Generate a unique session code that doesn't exist in database"""
    for _ in range(max_attempts):
        code = generate_session_code(length)
        # Check if code already exists
        existing = crud.get_game_session_by_code(db, code)
        if not existing:
            return code
        
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
    session_code = generate_unique_session_code(db)
    game_session = crud.create_game_session(db, session_data, current_user.id, session_code)
    
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
    """Game session page with React web client"""
    logger.debug(f"game_session_page: Entering with session_code: {session_code}")
    logger.debug(f"game_session_page: current_user: {current_user.username}")
    
    game_session = crud.get_game_session_by_code(db, session_code)
    if not game_session:
        logger.debug(f"game_session_page: Game session {session_code} not found")
        raise HTTPException(status_code=404, detail="Game session not found")
    
    logger.debug(f"game_session_page: Game session found: {game_session.name}")
    
    # Check if user is part of this session
    player = crud.join_game_session(db, session_code, current_user.id)
    logger.debug(f"game_session_page: Player join result: {player}")
    if not player:
        logger.debug(f"game_session_page: Failed to join session")
        raise HTTPException(status_code=403, detail="Not authorized to join this session")
    
    # Determine user role - DM if they own the session, otherwise player
    # Debug: Check what we actually have
    logger.debug(f"game_session: {game_session}")
    logger.debug(f"game_session type: {type(game_session)}")
    logger.debug(f"game_session.__dict__: {game_session.__dict__}")
    
    # Try accessing using getattr safely
    session_owner_id = getattr(game_session, 'owner_id', None)
    current_user_id = getattr(current_user, 'id', None)
    
    logger.debug(f"session_owner_id: {session_owner_id}, type: {type(session_owner_id)}")
    logger.debug(f"current_user_id: {current_user_id}, type: {type(current_user_id)}")
    
    user_role = "dm" if session_owner_id == current_user_id else "player"
    
    logger.debug(f"user_role determined: {user_role}")
    
    # Serve the React web client - user is already authenticated
    # The existing token cookie from their login will be used by the React client
    # Log the final injection values for client-side debugging
    try:
        safe_session = {
            'session_code': getattr(game_session, 'session_code', None),
            'session_name': getattr(game_session, 'name', None),
            'owner_id': getattr(game_session, 'owner_id', None)
        }
        logger.info(f"Rendering game_client.html with session_code={session_code} safe_session={safe_session}")
    except Exception:
        logger.exception("Failed to build safe_session debug info")
    return templates.TemplateResponse("game_client.html", {
        "request": request,
        "user": current_user,
        "session": game_session,
        "session_code": session_code,
        "user_role": user_role
    })

@router.get("/api/sessions", response_model=List[game_models.GameSession])
async def get_user_sessions(
    current_user: Annotated[schemas.User, Depends(get_current_active_user)],
    db: Session = Depends(get_db)
):
    """API endpoint to get user's game sessions"""
    return crud.get_user_game_sessions(db, current_user.id)
