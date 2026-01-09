"""
Integration tests for invitation system
Tests complete invitation workflow
"""
import pytest
from datetime import datetime, timedelta
from server_host.database import models

def test_create_invitation(db, test_data):
    """Test creating an invitation"""
    session = test_data["session"]
    owner = test_data["owner"]
    
    invitation = models.SessionInvitation(
        session_id=session.id,
        invite_code="ABC123XYZ",
        pre_assigned_role="player",
        created_by=owner.id,
        expires_at=datetime.utcnow() + timedelta(hours=24),
        max_uses=5
    )
    db.add(invitation)
    db.commit()
    
    assert invitation.id is not None
    assert invitation.is_valid() is True

def test_invitation_expiration(db, test_data):
    """Test that expired invitations are invalid"""
    session = test_data["session"]
    owner = test_data["owner"]
    
    invitation = models.SessionInvitation(
        session_id=session.id,
        invite_code="EXPIRED",
        created_by=owner.id,
        expires_at=datetime.utcnow() - timedelta(hours=1)
    )
    db.add(invitation)
    db.commit()
    
    assert invitation.is_valid() is False

def test_invitation_max_uses(db, test_data):
    """Test that invitations respect max uses"""
    session = test_data["session"]
    owner = test_data["owner"]
    
    invitation = models.SessionInvitation(
        session_id=session.id,
        invite_code="MAXED",
        created_by=owner.id,
        max_uses=1,
        uses_count=1
    )
    db.add(invitation)
    db.commit()
    
    assert invitation.is_valid() is False

def test_invitation_acceptance(client, test_data, db):
    """Test accepting an invitation"""
    session = test_data["session"]
    owner = test_data["owner"]
    
    invitation = models.SessionInvitation(
        session_id=session.id,
        invite_code="VALID123",
        pre_assigned_role="trusted_player",
        created_by=owner.id,
        max_uses=5
    )
    db.add(invitation)
    db.commit()
    
    new_user = models.User(
        username="newplayer",
        email="new@test.com",
        hashed_password="hash"
    )
    db.add(new_user)
    db.commit()
    
    response = client.post(f"/game/invitations/VALID123/accept")
    
    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    assert data["role"] == "trusted_player"
    
    db.refresh(invitation)
    assert invitation.uses_count == 1
    
    new_player = db.query(models.GamePlayer).filter(
        models.GamePlayer.user_id == new_user.id,
        models.GamePlayer.session_id == session.id
    ).first()
    assert new_player is not None
    assert new_player.role == "trusted_player"

if __name__ == "__main__":
    pytest.main([__file__, "-v"])
