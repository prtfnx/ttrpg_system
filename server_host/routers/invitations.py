"""
Session Invitation API Router
Handles invite link creation, validation, and usage
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from datetime import datetime, timedelta
from typing import List, Optional
import secrets
import string
import os

from server_host.database.database import get_db
from server_host.database import models, schemas, crud
from server_host.routers.users import get_current_user
from server_host.middleware.session_permissions import require_session_role
from server_host.utils.logger import setup_logger
from server_host.service.game_session import ConnectionManager
from net.protocol import Message, MessageType

logger = setup_logger(__name__)
router = APIRouter(prefix="/game/invitations", tags=["invitations"])

# WebSocket manager for real-time events
connection_manager = ConnectionManager()

class InvitationCreate(schemas.BaseModel):
    session_code: str
    pre_assigned_role: str = "player"
    expires_hours: Optional[int] = 24
    max_uses: int = 1

class InvitationResponse(schemas.BaseModel):
    id: int
    invite_code: str
    session_code: str
    pre_assigned_role: str
    created_at: datetime
    expires_at: Optional[datetime]
    max_uses: int
    uses_count: int
    is_active: bool
    is_valid: bool
    invite_url: str

    class Config:
        from_attributes = True

def generate_invite_code() -> str:
    """Generate secure random invite code"""
    alphabet = string.ascii_letters + string.digits
    return ''.join(secrets.choice(alphabet) for _ in range(32))

@router.post("/create", response_model=InvitationResponse)
async def create_invitation(
    invite_data: InvitationCreate,
    current_user: schemas.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Create session invitation link (requires INVITE_PLAYERS permission)"""
    logger.info(f"Creating invitation: session_code={invite_data.session_code}, role={invite_data.pre_assigned_role}")
    
    session = crud.get_game_session_by_code(db, invite_data.session_code)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    player = db.query(models.GamePlayer).filter(
        models.GamePlayer.session_id == session.id,
        models.GamePlayer.user_id == current_user.id
    ).first()

    if not player:
        raise HTTPException(status_code=403, detail="Not in session")

    if not player.has_permission("invite_players"):
        raise HTTPException(status_code=403, detail="No invite permission")

    valid_roles = ["co_dm", "trusted_player", "player", "spectator"]
    if invite_data.pre_assigned_role not in valid_roles:
        raise HTTPException(status_code=400, detail="Invalid role")

    invite_code = generate_invite_code()
    expires_at = None
    if invite_data.expires_hours:
        expires_at = datetime.utcnow() + timedelta(hours=invite_data.expires_hours)

    invitation = models.SessionInvitation(
        session_id=session.id,
        invite_code=invite_code,
        pre_assigned_role=invite_data.pre_assigned_role,
        created_by=current_user.id,
        expires_at=expires_at,
        max_uses=invite_data.max_uses
    )
    db.add(invitation)

    audit = models.AuditLog(
        event_type="INVITATION_CREATED",
        session_code=invite_data.session_code,
        user_id=current_user.id,
        details=f'{{"role": "{invite_data.pre_assigned_role}", "max_uses": {invite_data.max_uses}}}'
    )
    db.add(audit)
    db.commit()
    db.refresh(invitation)

    logger.info(f"Invitation created: code={invite_code[:8]}... session={invite_data.session_code} role={invitation.pre_assigned_role} (requested: {invite_data.pre_assigned_role})")

    # Get base URL from environment or use default
    base_url = os.environ.get("BASE_URL", "http://127.0.0.1:12345")
    
    return InvitationResponse(
        id=invitation.id,
        invite_code=invitation.invite_code,
        session_code=invite_data.session_code,
        pre_assigned_role=invitation.pre_assigned_role,
        created_at=invitation.created_at,
        expires_at=invitation.expires_at,
        max_uses=invitation.max_uses,
        uses_count=invitation.uses_count,
        is_active=invitation.is_active,
        is_valid=invitation.is_valid(),
        invite_url=f"{base_url}/invite/{invitation.invite_code}"
    )

@router.get("/{invite_code}", response_model=InvitationResponse)
async def get_invitation(invite_code: str, db: Session = Depends(get_db)):
    """Get invitation details"""
    invitation = db.query(models.SessionInvitation).filter(
        models.SessionInvitation.invite_code == invite_code
    ).first()

    if not invitation:
        raise HTTPException(status_code=404, detail="Invitation not found")

    session = db.query(models.GameSession).filter(
        models.GameSession.id == invitation.session_id
    ).first()

    base_url = os.environ.get("BASE_URL", "http://127.0.0.1:12345")
    
    return InvitationResponse(
        id=invitation.id,
        invite_code=invitation.invite_code,
        session_code=session.session_code if session else "",
        pre_assigned_role=invitation.pre_assigned_role,
        created_at=invitation.created_at,
        expires_at=invitation.expires_at,
        max_uses=invitation.max_uses,
        uses_count=invitation.uses_count,
        is_active=invitation.is_active,
        is_valid=invitation.is_valid(),
        invite_url=f"{base_url}/invite/{invitation.invite_code}"
    )

@router.post("/{invite_code}/accept")
async def accept_invitation(
    invite_code: str,
    current_user: schemas.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Accept invitation and join session"""
    invitation = db.query(models.SessionInvitation).filter(
        models.SessionInvitation.invite_code == invite_code
    ).first()

    if not invitation:
        raise HTTPException(status_code=404, detail="Invitation not found")

    if not invitation.is_valid():
        raise HTTPException(status_code=400, detail="Invitation expired or used up")

    session = db.query(models.GameSession).filter(
        models.GameSession.id == invitation.session_id
    ).first()

    existing = db.query(models.GamePlayer).filter(
        models.GamePlayer.session_id == session.id,
        models.GamePlayer.user_id == current_user.id
    ).first()

    if existing:
        raise HTTPException(status_code=400, detail="Already in session")

    new_player = models.GamePlayer(
        session_id=session.id,
        user_id=current_user.id,
        role=invitation.pre_assigned_role,
        joined_at=datetime.utcnow()
    )
    db.add(new_player)

    invitation.uses_count += 1
    if invitation.max_uses > 0 and invitation.uses_count >= invitation.max_uses:
        invitation.is_active = False

    audit = models.AuditLog(
        event_type="INVITATION_ACCEPTED",
        session_code=session.session_code,
        user_id=current_user.id,
        details=f'{{"invite_code": "{invite_code[:8]}...", "role": "{invitation.pre_assigned_role}"}}'
    )
    db.add(audit)
    db.commit()

    logger.info(f"Invitation accepted: user={current_user.id} session={session.session_code}")

    # Broadcast WebSocket event for new player joining
    try:
        message = Message(
            type=MessageType.CUSTOM,
            data={
                "event": "PLAYER_JOINED",
                "user_id": current_user.id,
                "username": current_user.username,
                "role": invitation.pre_assigned_role
            }
        )
        await connection_manager.broadcast_to_session(session.session_code, message)
    except Exception as e:
        logger.error(f"Failed to broadcast player join: {e}")

    return {
        "success": True,
        "session_code": session.session_code,
        "role": invitation.pre_assigned_role
    }

@router.get("/session/{session_code}", response_model=List[InvitationResponse])
async def list_session_invitations(
    session_code: str,
    current_user: schemas.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """List all invitations for a session"""
    session = crud.get_game_session_by_code(db, session_code)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    player = db.query(models.GamePlayer).filter(
        models.GamePlayer.session_id == session.id,
        models.GamePlayer.user_id == current_user.id
    ).first()

    if not player:
        raise HTTPException(status_code=403, detail="Not in session")

    invitations = db.query(models.SessionInvitation).filter(
        models.SessionInvitation.session_id == session.id
    ).order_by(models.SessionInvitation.created_at.desc()).all()

    base_url = os.environ.get("BASE_URL", "http://127.0.0.1:12345")
    
    return [
        InvitationResponse(
            id=inv.id,
            invite_code=inv.invite_code,
            session_code=session_code,
            pre_assigned_role=inv.pre_assigned_role,
            created_at=inv.created_at,
            expires_at=inv.expires_at,
            max_uses=inv.max_uses,
            uses_count=inv.uses_count,
            is_active=inv.is_active,
            is_valid=inv.is_valid(),
            invite_url=f"{base_url}/invite/{inv.invite_code}"
        )
        for inv in invitations
    ]

@router.delete("/{invitation_id}")
async def revoke_invitation(
    invitation_id: int,
    current_user: schemas.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Revoke invitation (owner only)"""
    invitation = db.query(models.SessionInvitation).filter(
        models.SessionInvitation.id == invitation_id
    ).first()

    if not invitation:
        raise HTTPException(status_code=404, detail="Invitation not found")

    session = db.query(models.GameSession).filter(
        models.GameSession.id == invitation.session_id
    ).first()

    player = db.query(models.GamePlayer).filter(
        models.GamePlayer.session_id == session.id,
        models.GamePlayer.user_id == current_user.id
    ).first()

    if not player or player.role not in ["owner", "co_dm"]:
        raise HTTPException(status_code=403, detail="Owner/Co-DM only")

    invitation.is_active = False
    db.commit()

    logger.info(f"Invitation revoked: id={invitation_id} by user={current_user.id}")

    return {"success": True, "message": "Invitation revoked"}
