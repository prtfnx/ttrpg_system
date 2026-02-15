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
from ..database import crud, schemas, models
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
    """Redirect to dashboard"""
    return RedirectResponse(url="/users/dashboard", status_code=302)

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
            "sessions": [session for session, role in crud.get_user_game_sessions(db, current_user.id)],
            "error": "Game session not found"
        })
    
    # Join the session
    player = crud.join_game_session(db, session_code, current_user.id, character_name)
    if not player:
        return templates.TemplateResponse("game_lobby.html", {
            "request": request,
            "user": current_user,
            "sessions": [session for session, role in crud.get_user_game_sessions(db, current_user.id)],
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

@router.get("/session/{session_code}/settings")
async def session_settings(
    session_code: str,
    request: Request,
    current_user: Annotated[schemas.User, Depends(get_current_active_user)],
    db: Session = Depends(get_db)
):
    """Session settings page for owners"""
    session = crud.get_game_session_by_code(db, session_code)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    if session.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Only the session owner can access settings")
    
    players = db.query(models.GamePlayer, models.User).join(
        models.User, models.GamePlayer.user_id == models.User.id
    ).filter(models.GamePlayer.session_id == session.id).all()
    
    invitations = db.query(models.SessionInvitation).filter(
        models.SessionInvitation.session_id == session.id,
        models.SessionInvitation.is_active == True
    ).all()
    
    return templates.TemplateResponse("session_settings.html", {
        "request": request,
        "user": current_user,
        "session": session,
        "players": players,
        "invitations": invitations
    })

@router.post("/session/{session_code}/settings")
async def update_session_settings(
    session_code: str,
    request: Request,
    name: str = Form(...),
    current_user: Annotated[schemas.User, Depends(get_current_active_user)] = None,
    db: Session = Depends(get_db)
):
    """Update session settings"""
    session = crud.get_game_session_by_code(db, session_code)
    if not session or session.owner_id != current_user.id:
        raise HTTPException(status_code=403)
    
    session.name = name
    db.commit()
    
    return RedirectResponse(
        url=f"/game/session/{session_code}/settings",
        status_code=302
    )

@router.post("/session/{session_code}/delete")
async def delete_session(
    session_code: str,
    current_user: Annotated[schemas.User, Depends(get_current_active_user)] = None,
    db: Session = Depends(get_db)
):
    """Delete session"""
    session = crud.get_game_session_by_code(db, session_code)
    if not session or session.owner_id != current_user.id:
        raise HTTPException(status_code=403)
    
    db.delete(session)
    db.commit()
    
    return RedirectResponse(url="/users/dashboard", status_code=302)

@router.get("/session/{session_code}/admin")
async def game_session_admin(
    session_code: str,
    request: Request,
    current_user: Annotated[schemas.User, Depends(get_current_active_user)],
    db: Session = Depends(get_db)
):
    """Game session admin panel for DMs"""
    logger.debug(f"game_session_admin: Entering with session_code: {session_code}")
    
    game_session = crud.get_game_session_by_code(db, session_code)
    if not game_session:
        raise HTTPException(status_code=404, detail="Game session not found")
    
    # Check if user is the DM/owner of this session
    if game_session.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Only the DM can access the admin panel")
    
    # Render admin template
    return templates.TemplateResponse("admin_panel.html", {
        "request": request,
        "user": current_user,
        "session": game_session,
        "session_code": session_code
    })

@router.get("/api/sessions/{session_code}/players")
async def get_session_players(
    session_code: str,
    current_user: Annotated[schemas.User, Depends(get_current_active_user)],
    db: Session = Depends(get_db)
):
    """Get session players with role-based access control"""
    session = crud.get_game_session_by_code(db, session_code)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    player = db.query(models.GamePlayer).filter(
        models.GamePlayer.session_id == session.id,
        models.GamePlayer.user_id == current_user.id
    ).first()
    
    if not player:
        raise HTTPException(status_code=403, detail="Access denied")
    
    players_data = db.query(models.GamePlayer).filter(
        models.GamePlayer.session_id == session.id
    ).all()
    
    return [{
        "id": p.user_id,
        "user_id": p.user_id,
        "username": p.user.username,
        "role": p.role,
        "is_connected": p.is_connected,
        "joined_at": p.joined_at.isoformat() if p.joined_at else None,
        "permissions": get_role_permissions(p.role)
    } for p in players_data]

@router.post("/api/sessions/{session_code}/players/{user_id}/role")
async def change_player_role(
    session_code: str, 
    user_id: int, 
    role_data: schemas.RoleChangeRequest,
    current_user: Annotated[schemas.User, Depends(get_current_active_user)],
    db: Session = Depends(get_db)
):
    """Change player role (owner/co_dm only)"""
    session = crud.get_game_session_by_code(db, session_code)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    requester = db.query(models.GamePlayer).filter(
        models.GamePlayer.session_id == session.id,
        models.GamePlayer.user_id == current_user.id
    ).first()
    
    if not requester or requester.role not in ['owner', 'co_dm']:
        raise HTTPException(status_code=403, detail="Owner/Co-DM access required")
    
    target_player = db.query(models.GamePlayer).filter(
        models.GamePlayer.session_id == session.id,
        models.GamePlayer.user_id == user_id
    ).first()
    
    if not target_player:
        raise HTTPException(status_code=404, detail="Player not found")
    
    if target_player.role == 'owner' and role_data.role != 'owner':
        raise HTTPException(status_code=400, detail="Cannot change owner role")
    
    old_role = target_player.role
    target_player.role = role_data.role
    
    audit = models.AuditLog(
        event_type="PLAYER_ROLE_CHANGED",
        session_code=session_code,
        user_id=current_user.id,
        details=f'{{"target_user": {user_id}, "old_role": "{old_role}", "new_role": "{role_data.role}"}}'
    )
    db.add(audit)
    db.commit()
    
    logger.info(f"Role changed: user {user_id} from {old_role} to {role_data.role} in session {session_code}")
    
    return {"success": True, "message": f"Player role changed to {role_data.role}"}

@router.delete("/api/sessions/{session_code}/players/{user_id}")
async def kick_player(
    session_code: str, 
    user_id: int,
    current_user: Annotated[schemas.User, Depends(get_current_active_user)],
    db: Session = Depends(get_db)
):
    """Kick player from session (owner/co_dm only)"""
    session = crud.get_game_session_by_code(db, session_code)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
        
    requester = db.query(models.GamePlayer).filter(
        models.GamePlayer.session_id == session.id,
        models.GamePlayer.user_id == current_user.id
    ).first()
    
    if not requester or requester.role not in ['owner', 'co_dm']:
        raise HTTPException(status_code=403, detail="Owner/Co-DM access required")
    
    target = db.query(models.GamePlayer).filter(
        models.GamePlayer.session_id == session.id,
        models.GamePlayer.user_id == user_id
    ).first()
    
    if not target:
        raise HTTPException(status_code=404, detail="Player not found")
    
    if target.role == 'owner':
        raise HTTPException(status_code=400, detail="Cannot kick session owner")
    
    if target.user_id == current_user.id:
        raise HTTPException(status_code=400, detail="Cannot kick yourself")
    
    db.delete(target)
    
    audit = models.AuditLog(
        event_type="PLAYER_KICKED", 
        session_code=session_code,
        user_id=current_user.id,
        details=f'{{"kicked_user": {user_id}, "kicked_username": "{target.user.username}"}}'
    )
    db.add(audit)
    db.commit()
    
    logger.info(f"Player kicked: user {user_id} from session {session_code}")
    
    return {"success": True, "message": "Player kicked successfully"}

def get_role_permissions(role: str) -> list:
    """Get permissions for a given role"""
    role_permissions = {
        'owner': ['all'],
        'co_dm': ['compendium:read', 'compendium:write', 'table:admin', 'character:write', 'player:manage'],
        'trusted_player': ['compendium:read', 'character:write', 'sprite:create'],
        'player': ['compendium:read', 'character:read', 'sprite:create'],
        'spectator': ['compendium:read']
    }
    return role_permissions.get(role, [])

@router.get("/api/sessions", response_model=List[game_models.GameSession])
async def get_user_sessions(
    current_user: Annotated[schemas.User, Depends(get_current_active_user)],
    db: Session = Depends(get_db)
):
    """API endpoint to get user's game sessions"""
    sessions_data = crud.get_user_game_sessions(db, current_user.id)
    return [
        {
            "id": session.id,
            "name": session.name,
            "session_code": session.session_code,
            "owner_id": session.owner_id,
            "is_active": session.is_active,
            "created_at": session.created_at,
            "user_role": role
        }
        for session, role in sessions_data
    ]
