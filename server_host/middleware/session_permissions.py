"""
Session permission middleware
"""
from fastapi import HTTPException, Depends, Request, status
from sqlalchemy.orm import Session
from typing import Callable

from server_host.database.database import get_db
from server_host.database import models, schemas
from server_host.routers.users import get_current_user
from server_host.utils.permissions import SessionPermission, ROLE_PERMISSIONS
from server_host.utils.logger import setup_logger

logger = setup_logger(__name__)

class SessionPermissionDenied(HTTPException):
    def __init__(self, permission: str, session_code: str):
        super().__init__(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Permission '{permission}' denied in session '{session_code}'"
        )

async def get_player_in_session(
    session_code: str,
    user: schemas.User,
    db: Session
) -> models.GamePlayer:
    from server_host.database.crud import get_game_session_by_code
    
    session = get_game_session_by_code(db, session_code)
    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Session '{session_code}' not found"
        )
    
    player = db.query(models.GamePlayer).filter(
        models.GamePlayer.session_id == session.id,
        models.GamePlayer.user_id == user.id
    ).first()
    
    if not player:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"User not in session '{session_code}'"
        )
    
    return player

async def require_session_permission(
    session_code: str,
    permission: SessionPermission,
    user: schemas.User = Depends(get_current_user),
    db: Session = Depends(get_db)
) -> models.GamePlayer:
    player = await get_player_in_session(session_code, user, db)
    
    role_perms = ROLE_PERMISSIONS.get(player.role, set())
    
    custom_perms = db.query(models.SessionPermission).filter(
        models.SessionPermission.session_id == player.session_id,
        models.SessionPermission.user_id == user.id,
        models.SessionPermission.is_active == True
    ).all()
    
    custom_perm_set = {p.permission for p in custom_perms}
    all_perms = role_perms | custom_perm_set
    
    if permission.value not in all_perms:
        logger.warning(
            f"Permission denied: user={user.id} session={session_code} "
            f"permission={permission} role={player.role}"
        )
        raise SessionPermissionDenied(permission.value, session_code)
    
    return player

def require_session_role(required_role: str):
    async def role_checker(
        request: Request,
        user: schemas.User = Depends(get_current_user),
        db: Session = Depends(get_db)
    ) -> models.GamePlayer:
        session_code = request.path_params.get("session_code")
        if not session_code:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="session_code required in path"
            )
        
        player = await get_player_in_session(session_code, user, db)
        
        role_hierarchy = {
            "spectator": 0,
            "player": 1,
            "trusted_player": 2,
            "co_dm": 3,
            "owner": 4
        }
        
        player_level = role_hierarchy.get(player.role, 0)
        required_level = role_hierarchy.get(required_role, 99)
        
        if player_level < required_level:
            logger.warning(
                f"Role check failed: user={user.id} session={session_code} "
                f"has_role={player.role} required_role={required_role}"
            )
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Role '{required_role}' or higher required"
            )
        
        return player
    
    return role_checker
