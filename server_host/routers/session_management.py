"""
Session Management API Router
"""
from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import datetime
from pydantic import BaseModel
import json

from server_host.database.database import get_db
from server_host.database import models, schemas, crud
from server_host.routers.users import get_current_user
from server_host.middleware.session_permissions import (
    require_session_role,
    get_player_in_session
)
from server_host.utils.permissions import SessionPermission, get_permission_diff, get_role_permissions
from server_host.utils.logger import setup_logger
from server_host.service.game_session import ConnectionManager
from net.protocol import Message, MessageType

logger = setup_logger(__name__)
router = APIRouter(prefix="/game/session", tags=["session-management"])

# WebSocket manager for real-time events
connection_manager = ConnectionManager()

class PlayerResponse(BaseModel):
    id: int
    user_id: int
    username: str
    character_name: Optional[str]
    role: str
    is_connected: bool
    joined_at: datetime
    permissions: List[str]
    
    class Config:
        from_attributes = True

class RoleChangeRequest(BaseModel):
    new_role: str

class RoleChangeResponse(BaseModel):
    success: bool
    old_role: str
    new_role: str
    permissions_gained: List[str]
    permissions_lost: List[str]

class PermissionGrantRequest(BaseModel):
    permission: str

@router.get("/{session_code}/players", response_model=List[PlayerResponse])
async def get_session_players(
    session_code: str,
    player: models.GamePlayer = Depends(require_session_role("spectator")),
    db: Session = Depends(get_db)
):
    session = crud.get_game_session_by_code(db, session_code)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    players = db.query(models.GamePlayer).filter(
        models.GamePlayer.session_id == session.id
    ).all()
    
    response = []
    for p in players:
        user = db.query(models.User).filter(models.User.id == p.user_id).first()
        perms = list(get_role_permissions(p.role))
        
        response.append(PlayerResponse(
            id=p.id,
            user_id=p.user_id,
            username=user.username if user else "Unknown",
            character_name=p.character_name,
            role=p.role,
            is_connected=p.is_connected,
            joined_at=p.joined_at,
            permissions=perms
        ))
    
    return response

@router.post(
    "/{session_code}/players/{target_user_id}/role",
    response_model=RoleChangeResponse
)
async def change_player_role(
    session_code: str,
    target_user_id: int,
    role_request: RoleChangeRequest,
    request: Request,
    player: models.GamePlayer = Depends(require_session_role("owner")),
    current_user: schemas.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    new_role = role_request.new_role
    
    valid_roles = ["co_dm", "trusted_player", "player", "spectator"]
    if new_role not in valid_roles:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid role. Must be one of: {', '.join(valid_roles)}"
        )
    
    session = crud.get_game_session_by_code(db, session_code)
    target_player = db.query(models.GamePlayer).filter(
        models.GamePlayer.session_id == session.id,
        models.GamePlayer.user_id == target_user_id
    ).first()
    
    if not target_player:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Player not found in session"
        )
    
    if target_player.role == "owner":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cannot change owner's role"
        )
    
    old_role = target_player.role
    perm_diff = get_permission_diff(old_role, new_role)
    
    target_player.role = new_role
    target_player.role_updated_at = datetime.utcnow()
    target_player.role_updated_by = current_user.id
    
    audit_entry = models.AuditLog(
        event_type="ROLE_CHANGE",
        session_code=session_code,
        user_id=current_user.id,
        target_user_id=target_user_id,
        details=json.dumps({
            "old_role": old_role,
            "new_role": new_role,
            "permissions_gained": list(perm_diff["gained"]),
            "permissions_lost": list(perm_diff["lost"])
        }),
        ip_address=request.client.host if request.client else None
    )
    db.add(audit_entry)
    db.commit()
    
    logger.info(
        f"Role changed: session={session_code} target_user={target_user_id} "
        f"{old_role} -> {new_role} by user={current_user.id}"
    )
    
    # Broadcast WebSocket event to all clients
    try:
        message = Message(
            type=MessageType.CUSTOM,
            data={
                "event": "PLAYER_ROLE_CHANGED",
                "user_id": target_user_id,
                "old_role": old_role,
                "new_role": new_role,
                "permissions_gained": list(perm_diff["gained"]),
                "permissions_lost": list(perm_diff["lost"])
            }
        )
        await connection_manager.broadcast_to_session(session_code, message)
    except Exception as e:
        logger.error(f"Failed to broadcast role change: {e}")
    
    return RoleChangeResponse(
        success=True,
        old_role=old_role,
        new_role=new_role,
        permissions_gained=list(perm_diff["gained"]),
        permissions_lost=list(perm_diff["lost"])
    )

@router.delete("/{session_code}/players/{target_user_id}")
async def kick_player(
    session_code: str,
    target_user_id: int,
    request: Request,
    player: models.GamePlayer = Depends(require_session_role("co_dm")),
    current_user: schemas.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    session = crud.get_game_session_by_code(db, session_code)
    
    target_player = db.query(models.GamePlayer).filter(
        models.GamePlayer.session_id == session.id,
        models.GamePlayer.user_id == target_user_id
    ).first()
    
    if not target_player:
        raise HTTPException(status_code=404, detail="Player not found")
    
    if target_player.role == "owner":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cannot kick session owner"
        )
    
    if target_user_id == current_user.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot kick yourself"
        )
    
    db.delete(target_player)
    
    audit_entry = models.AuditLog(
        event_type="PLAYER_KICKED",
        session_code=session_code,
        user_id=current_user.id,
        target_user_id=target_user_id,
        details=json.dumps({"role": target_player.role}),
        ip_address=request.client.host if request.client else None
    )
    db.add(audit_entry)
    db.commit()
    
    logger.info(
        f"Player kicked: session={session_code} target={target_user_id} "
        f"by={current_user.id}"
    )
    
    # Broadcast WebSocket event
    try:
        message = Message(
            type=MessageType.CUSTOM,
            data={
                "event": "PLAYER_KICKED",
                "user_id": target_user_id,
                "kicked_by": current_user.id
            }
        )
        await connection_manager.broadcast_to_session(session_code, message)
    except Exception as e:
        logger.error(f"Failed to broadcast player kick: {e}")
    
    return {"success": True, "message": "Player kicked"}

@router.post("/{session_code}/players/{target_user_id}/permissions")
async def grant_custom_permission(
    session_code: str,
    target_user_id: int,
    perm_request: PermissionGrantRequest,
    request: Request,
    player: models.GamePlayer = Depends(require_session_role("owner")),
    current_user: schemas.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    session = crud.get_game_session_by_code(db, session_code)
    
    try:
        SessionPermission(perm_request.permission)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid permission: {perm_request.permission}"
        )
    
    existing = db.query(models.SessionPermission).filter(
        models.SessionPermission.session_id == session.id,
        models.SessionPermission.user_id == target_user_id,
        models.SessionPermission.permission == perm_request.permission,
        models.SessionPermission.is_active == True
    ).first()
    
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Permission already granted"
        )
    
    new_perm = models.SessionPermission(
        session_id=session.id,
        user_id=target_user_id,
        permission=perm_request.permission,
        granted_by=current_user.id
    )
    db.add(new_perm)
    
    audit_entry = models.AuditLog(
        event_type="PERMISSION_GRANTED",
        session_code=session_code,
        user_id=current_user.id,
        target_user_id=target_user_id,
        details=json.dumps({"permission": perm_request.permission}),
        ip_address=request.client.host if request.client else None
    )
    db.add(audit_entry)
    db.commit()
    
    logger.info(
        f"Custom permission granted: session={session_code} user={target_user_id} "
        f"permission={perm_request.permission} by={current_user.id}"
    )
    
    return {"success": True, "message": "Permission granted"}

@router.get("/{session_code}/players/{user_id}/permissions")
async def get_player_permissions(
    session_code: str,
    user_id: int,
    player: models.GamePlayer = Depends(require_session_role("spectator")),
    db: Session = Depends(get_db)
):
    session = crud.get_game_session_by_code(db, session_code)
    target_player = db.query(models.GamePlayer).filter(
        models.GamePlayer.session_id == session.id,
        models.GamePlayer.user_id == user_id
    ).first()
    
    if not target_player:
        raise HTTPException(status_code=404, detail="Player not found")
    
    role_perms = list(get_role_permissions(target_player.role))
    
    custom_perms = db.query(models.SessionPermission).filter(
        models.SessionPermission.session_id == session.id,
        models.SessionPermission.user_id == user_id,
        models.SessionPermission.is_active == True
    ).all()
    
    custom_perm_list = [p.permission for p in custom_perms]
    all_perms = list(set(role_perms + custom_perm_list))
    
    return {
        "role": target_player.role,
        "role_permissions": role_perms,
        "custom_permissions": custom_perm_list,
        "all_permissions": all_perms
    }
