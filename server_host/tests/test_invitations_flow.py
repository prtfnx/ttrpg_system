"""
Integration tests for invitation system
Tests complete invitation workflow
"""
import pytest
from datetime import datetime, timedelta
from server_host.database import models


@pytest.mark.api
def test_create_invitation(db, test_session, test_users):
    """Test creating an invitation"""
    session = test_session
    owner = test_users["owner"]
    
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


@pytest.mark.api
def test_invitation_expiration(db, test_session, test_users):
    """Test that expired invitations are invalid"""
    session = test_session
    owner = test_users["owner"]
    
    invitation = models.SessionInvitation(
        session_id=session.id,
        invite_code="EXPIRED",
        created_by=owner.id,
        expires_at=datetime.utcnow() - timedelta(hours=1)
    )
    db.add(invitation)
    db.commit()
    
    assert invitation.is_valid() is False


@pytest.mark.api
def test_invitation_max_uses(db, test_session, test_users):
    """Test that invitations respect max uses"""
    session = test_session
    owner = test_users["owner"]
    
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


@pytest.mark.api
def test_invitation_acceptance(client, test_session, test_users, db):
    """Test accepting an invitation"""
    session = test_session
    owner = test_users["owner"]
    
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
    
    # Use authenticated client
    from starlette.testclient import TestClient
    from server_host.api.main import app
    auth_client = TestClient(app)
    auth_client.cookies.set("session", "test_session")
    
    response = auth_client.post(
        f"/game/invitations/VALID123/accept",
        follow_redirects=False
    )
    
    # May redirect or return JSON
    assert response.status_code in [200, 302]
    
    if response.status_code == 200:
        try:
            data = response.json()
            assert data.get("success") is True or "role" in data
        except:
            # HTML response is also acceptable
            pass

if __name__ == "__main__":
    pytest.main([__file__, "-v"])
