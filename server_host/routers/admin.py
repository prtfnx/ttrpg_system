"""
Session Administration API Router
Production-ready admin panel for session owners and co-DMs
"""
from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session
from sqlalchemy import func, and_
from typing import List, Optional
from datetime import datetime
from pydantic import BaseModel, Field
import json

from server_host.database.database import get_db
from server_host.database import models, schemas, crud
from server_host.routers.users import get_current_user
from server_host.middleware.session_permissions import require_session_role
from server_host.utils.logger import setup_logger

logger = setup_logger(__name__)
router = APIRouter(prefix="/game/session/{session_code}/admin", tags=["admin"])

# === Schemas ===

class SessionSettingsUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    description: Optional[str] = Field(None, max_length=500)
    max_players: Optional[int] = Field(None, ge=1, le=50)
    visibility: Optional[str] = Field(None, pattern="^(public|private|unlisted)$")
    join_policy: Optional[str] = Field(None, pattern="^(open|invite_only|closed)$")

class SessionSettings(BaseModel):
    name: str
    description: Optional[str]
    max_players: int
    visibility: str
    join_policy: str
    created_at: datetime
    owner_username: str
    
    class Config:
        from_attributes = True

class BulkRoleChange(BaseModel):
    user_ids: List[int]
    new_role: str

class AuditLogEntry(BaseModel):
    id: int
    event_type: str
    user_id: Optional[int]
    username: Optional[str]
    target_user_id: Optional[int]
    target_username: Optional[str]
    details: Optional[dict]
    ip_address: Optional[str]
    created_at: datetime
    
    class Config:
        from_attributes = True

class SessionStats(BaseModel):
    total_players: int
    online_players: int
    roles_distribution: dict
    total_sessions_duration: Optional[int]
    last_activity: Optional[datetime]

# === Endpoints ===

@router.get("/settings", response_model=SessionSettings)
async def get_session_settings(
    session_code: str,
    player: models.GamePlayer = Depends(require_session_role("owner")),
    db: Session = Depends(get_db)
):
    """Get session configuration (owner only)"""
    session = crud.get_game_session_by_code(db, session_code)
    if not session:
        raise HTTPException(404, "Session not found")
    
    owner = db.query(models.User).filter(models.User.id == session.owner_id).first()
    
    # Get or set defaults for new fields
    game_data = json.loads(session.game_data) if session.game_data else {}
    
    return SessionSettings(
        name=session.name,
        description=game_data.get("description"),
        max_players=game_data.get("max_players", 8),
        visibility=game_data.get("visibility", "private"),
        join_policy=game_data.get("join_policy", "invite_only"),
        created_at=session.created_at,
        owner_username=owner.username if owner else "Unknown"
    )

@router.put("/settings")
async def update_session_settings(
    session_code: str,
    settings: SessionSettingsUpdate,
    request: Request,
    player: models.GamePlayer = Depends(require_session_role("owner")),
    current_user: schemas.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Update session settings (owner only)"""
    session = crud.get_game_session_by_code(db, session_code)
    if not session:
        raise HTTPException(404, "Session not found")
    
    game_data = json.loads(session.game_data) if session.game_data else {}
    changes = {}
    
    if settings.name is not None:
        changes["name"] = session.name
        session.name = settings.name
    
    if settings.description is not None:
        changes["description"] = game_data.get("description")
        game_data["description"] = settings.description
    
    if settings.max_players is not None:
        changes["max_players"] = game_data.get("max_players")
        game_data["max_players"] = settings.max_players
    
    if settings.visibility is not None:
        changes["visibility"] = game_data.get("visibility")
        game_data["visibility"] = settings.visibility
    
    if settings.join_policy is not None:
        changes["join_policy"] = game_data.get("join_policy")
        game_data["join_policy"] = settings.join_policy
    
    session.game_data = json.dumps(game_data)
    
    # Audit log
    audit_entry = models.AuditLog(
        event_type="SETTINGS_UPDATED",
        session_code=session_code,
        user_id=current_user.id,
        details=json.dumps({"changes": changes}),
        ip_address=request.client.host if request.client else None
    )
    db.add(audit_entry)
    db.commit()
    
    logger.info(f"Session settings updated: {session_code} by user {current_user.id}")
    
    return {"success": True, "message": "Settings updated"}

@router.post("/players/bulk-role")
async def bulk_role_change(
    session_code: str,
    bulk_change: BulkRoleChange,
    request: Request,
    player: models.GamePlayer = Depends(require_session_role("owner")),
    current_user: schemas.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Change roles for multiple players at once (owner only)"""
    session = crud.get_game_session_by_code(db, session_code)
    if not session:
        raise HTTPException(404, "Session not found")
    
    valid_roles = ["co_dm", "trusted_player", "player", "spectator"]
    if bulk_change.new_role not in valid_roles:
        raise HTTPException(400, f"Invalid role: {bulk_change.new_role}")
    
    if not bulk_change.user_ids:
        raise HTTPException(400, "No users specified")
    
    # Prevent changing owner role or self
    owner_id = session.owner_id
    if owner_id in bulk_change.user_ids:
        raise HTTPException(403, "Cannot change owner role")
    
    updated_count = 0
    failed_users = []
    
    for user_id in bulk_change.user_ids:
        target_player = db.query(models.GamePlayer).filter(
            models.GamePlayer.session_id == session.id,
            models.GamePlayer.user_id == user_id
        ).first()
        
        if not target_player:
            failed_users.append(user_id)
            continue
        
        if target_player.role == "owner":
            failed_users.append(user_id)
            continue
        
        old_role = target_player.role
        target_player.role = bulk_change.new_role
        target_player.role_updated_at = datetime.utcnow()
        target_player.role_updated_by = current_user.id
        
        # Individual audit entry for each change
        audit_entry = models.AuditLog(
            event_type="ROLE_CHANGE_BULK",
            session_code=session_code,
            user_id=current_user.id,
            target_user_id=user_id,
            details=json.dumps({"old_role": old_role, "new_role": bulk_change.new_role}),
            ip_address=request.client.host if request.client else None
        )
        db.add(audit_entry)
        updated_count += 1
    
    db.commit()
    
    logger.info(
        f"Bulk role change: {session_code} updated={updated_count} "
        f"failed={len(failed_users)} by user {current_user.id}"
    )
    
    return {
        "success": True,
        "updated": updated_count,
        "failed": failed_users,
        "message": f"Updated {updated_count} players to {bulk_change.new_role}"
    }

@router.get("/audit-log", response_model=List[AuditLogEntry])
async def get_audit_log(
    session_code: str,
    event_type: Optional[str] = None,
    limit: int = 100,
    offset: int = 0,
    player: models.GamePlayer = Depends(require_session_role("owner")),
    db: Session = Depends(get_db)
):
    """Get session audit log with filtering (owner and co_dm)"""
    query = db.query(models.AuditLog).filter(
        models.AuditLog.session_code == session_code
    )
    
    if event_type:
        query = query.filter(models.AuditLog.event_type == event_type)
    
    logs = query.order_by(models.AuditLog.created_at.desc()).offset(offset).limit(limit).all()
    
    result = []
    for log in logs:
        user = db.query(models.User).filter(models.User.id == log.user_id).first() if log.user_id else None
        target_user = db.query(models.User).filter(models.User.id == log.target_user_id).first() if log.target_user_id else None
        
        try:
            details = json.loads(log.details) if log.details else None
        except:
            details = None
        
        result.append(AuditLogEntry(
            id=log.id,
            event_type=log.event_type,
            user_id=log.user_id,
            username=user.username if user else None,
            target_user_id=log.target_user_id,
            target_username=target_user.username if target_user else None,
            details=details,
            ip_address=log.ip_address,
            created_at=log.created_at
        ))
    
    return result

@router.get("/stats", response_model=SessionStats)
async def get_session_stats(
    session_code: str,
    player: models.GamePlayer = Depends(require_session_role("co_dm")),
    db: Session = Depends(get_db)
):
    """Get session statistics (owner and co_dm)"""
    session = crud.get_game_session_by_code(db, session_code)
    if not session:
        raise HTTPException(404, "Session not found")
    
    players = db.query(models.GamePlayer).filter(
        models.GamePlayer.session_id == session.id
    ).all()
    
    online_count = sum(1 for p in players if p.is_connected)
    
    roles_distribution = {}
    for p in players:
        roles_distribution[p.role] = roles_distribution.get(p.role, 0) + 1
    
    # Get last activity from audit log
    last_activity_log = db.query(models.AuditLog).filter(
        models.AuditLog.session_code == session_code
    ).order_by(models.AuditLog.created_at.desc()).first()
    
    return SessionStats(
        total_players=len(players),
        online_players=online_count,
        roles_distribution=roles_distribution,
        total_sessions_duration=None,  # Could track session duration if needed
        last_activity=last_activity_log.created_at if last_activity_log else session.created_at
    )

@router.delete("/delete-session")
async def delete_session(
    session_code: str,
    confirmation_name: str,
    request: Request,
    player: models.GamePlayer = Depends(require_session_role("owner")),
    current_user: schemas.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Delete session (owner only, requires typing session name)"""
    session = crud.get_game_session_by_code(db, session_code)
    if not session:
        raise HTTPException(404, "Session not found")
    
    if confirmation_name != session.name:
        raise HTTPException(
            400, 
            "Confirmation failed. Type the exact session name to confirm deletion."
        )
    
    # Audit log before deletion
    audit_entry = models.AuditLog(
        event_type="SESSION_DELETED",
        session_code=session_code,
        user_id=current_user.id,
        details=json.dumps({"session_name": session.name}),
        ip_address=request.client.host if request.client else None
    )
    db.add(audit_entry)
    db.flush()
    
    # Soft delete
    session.is_active = False
    db.commit()
    
    logger.warning(f"Session deleted: {session_code} by user {current_user.id}")
    
    return {"success": True, "message": "Session deleted"}
