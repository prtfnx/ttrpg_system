"""
Secure session invitation management endpoints
"""
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session
from typing import Annotated, List
from datetime import datetime, timedelta
import secrets
import string

from server_host.database.database import get_db
from server_host.database import crud, schemas, models
from server_host.routers.users import get_current_active_user
from server_host.utils.logger import setup_logger

router = APIRouter()
logger = setup_logger(__name__)

def generate_invite_code(length: int = 12) -> str:
    """Generate cryptographically secure invite code (64+ bits entropy)"""
    alphabet = string.ascii_letters + string.digits
    return ''.join(secrets.choice(alphabet) for _ in range(length))

@router.post("/create", response_model=schemas.InvitationResponse)
async def create_invitation(
    invite_data: schemas.CreateInvitationRequest,
    current_user: Annotated[schemas.User, Depends(get_current_active_user)],
    db: Session = Depends(get_db)
):
    """Create secure session invitation (owner/co_dm only)"""
    session = crud.get_game_session_by_code(db, invite_data.session_code)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    player = db.query(models.GamePlayer).filter(
        models.GamePlayer.session_id == session.id,
        models.GamePlayer.user_id == current_user.id
    ).first()
    
    if not player or player.role not in ['owner', 'co_dm']:
        raise HTTPException(status_code=403, detail="Owner/Co-DM access required")
    
    invite_code = generate_invite_code()
    expires_at = datetime.utcnow() + timedelta(hours=invite_data.expires_hours)
    
    invitation = models.SessionInvitation(
        invite_code=invite_code,
        session_id=session.id,
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
    
    logger.info(f"Invitation created: code={invite_code[:8]}... session={invite_data.session_code}")
    
    return schemas.InvitationResponse.from_orm(invitation)

@router.get("/session/{session_code}", response_model=List[schemas.InvitationResponse])
async def list_session_invitations(
    session_code: str,
    current_user: Annotated[schemas.User, Depends(get_current_active_user)],
    db: Session = Depends(get_db)
):
    """List session invitations with access control"""
    session = crud.get_game_session_by_code(db, session_code)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    player = db.query(models.GamePlayer).filter(
        models.GamePlayer.session_id == session.id,
        models.GamePlayer.user_id == current_user.id
    ).first()
    
    if not player:
        raise HTTPException(status_code=403, detail="Access denied")
    
    invitations = db.query(models.SessionInvitation).filter(
        models.SessionInvitation.session_id == session.id
    ).order_by(models.SessionInvitation.created_at.desc()).all()
    
    return [schemas.InvitationResponse.from_orm(inv) for inv in invitations]

@router.delete("/{invitation_id}")
async def revoke_invitation(
    invitation_id: int,
    current_user: Annotated[schemas.User, Depends(get_current_active_user)],
    db: Session = Depends(get_db)
):
    """Revoke invitation (owner/co_dm only)"""
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
    
    if not player or player.role not in ['owner', 'co_dm']:
        raise HTTPException(status_code=403, detail="Owner/Co-DM access required")
    
    invitation.is_active = False
    
    audit = models.AuditLog(
        event_type="INVITATION_REVOKED",
        session_code=session.session_code,
        user_id=current_user.id,
        details=f'{{"invitation_id": {invitation_id}}}'
    )
    db.add(audit)
    db.commit()
    
    logger.info(f"Invitation revoked: id={invitation_id} by user={current_user.id}")
    return {"success": True, "message": "Invitation revoked"}

@router.get("/{invite_code}")
async def get_invitation(invite_code: str, db: Session = Depends(get_db)):
    """Get invitation details"""
    invitation = db.query(models.SessionInvitation).filter(
        models.SessionInvitation.invite_code == invite_code
    ).first()
    
    if not invitation:
        raise HTTPException(status_code=404, detail="Invitation not found")
    
    return schemas.InvitationResponse.from_orm(invitation)

@router.post("/{invite_code}/accept")
async def accept_invitation(
    invite_code: str,
    request: Request,
    current_user: Annotated[schemas.User, Depends(get_current_active_user)],
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
        accept_header = request.headers.get("accept", "")
        if "text/html" in accept_header:
            return RedirectResponse(
                url=f"/game/session/{session.session_code}",
                status_code=302
            )
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
    
    accept_header = request.headers.get("accept", "")
    if "text/html" in accept_header:
        return RedirectResponse(
            url=f"/game/session/{session.session_code}",
            status_code=302
        )
    
    return {
        "success": True,
        "session_code": session.session_code,
        "role": invitation.pre_assigned_role
    }