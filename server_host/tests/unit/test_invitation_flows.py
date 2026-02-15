import pytest
from datetime import datetime, timedelta

@pytest.mark.unit
class TestInvitationFlow:
    def test_registration_with_invite_auto_accepts(self, client, test_db, test_game_session):
        """Registration with invite code auto-accepts invitation"""
        from server_host.database import models
        
        # Create invitation
        invite = models.SessionInvitation(
            invite_code="TESTINV123",
            session_id=test_game_session.id,
            pre_assigned_role="player",
            max_uses=5,
            uses_count=0,
            expires_at=datetime.utcnow() + timedelta(days=7),
            is_active=True
        )
        test_db.add(invite)
        test_db.commit()
        
        # Register with invite code
        response = client.post("/users/register", data={
            "username": "inviteduser",
            "email": "invited@example.com",
            "password": "SecurePass1",
            "confirm_password": "SecurePass1",
            "invite_code": "TESTINV123"
        }, follow_redirects=False)
        
        assert response.status_code == 302
        assert test_game_session.session_code in response.headers["location"]
        
        # Check user was added to session
        user = test_db.query(models.User).filter(
            models.User.username == "inviteduser"
        ).first()
        
        player = test_db.query(models.GamePlayer).filter(
            models.GamePlayer.user_id == user.id,
            models.GamePlayer.session_id == test_game_session.id
        ).first()
        
        assert player is not None
        assert player.role == "player"
        
        # Check invite usage incremented
        test_db.refresh(invite)
        assert invite.uses_count == 1
    
    def test_login_with_invite_auto_accepts(self, client, test_db, test_user, test_game_session):
        """Login with invite code auto-accepts invitation"""
        from server_host.database import models
        
        # Create invitation
        invite = models.SessionInvitation(
            invite_code="TESTINV456",
            session_id=test_game_session.id,
            pre_assigned_role="player",
            max_uses=5,
            uses_count=0,
            expires_at=datetime.utcnow() + timedelta(days=7),
            is_active=True
        )
        test_db.add(invite)
        test_db.commit()
        
        # Login with invite code
        response = client.post("/users/login", data={
            "username": test_user.username,
            "password": "pass123",
            "invite_code": "TESTINV456"
        }, follow_redirects=False)
        
        assert response.status_code == 302
        assert test_game_session.session_code in response.headers["location"]
        
        # Check user was added to session
        player = test_db.query(models.GamePlayer).filter(
            models.GamePlayer.user_id == test_user.id,
            models.GamePlayer.session_id == test_game_session.id
        ).first()
        
        assert player is not None
        
        # Check invite usage incremented
        test_db.refresh(invite)
        assert invite.uses_count == 1
    
    def test_invitation_page_shows_details(self, client, test_db, test_game_session):
        """Invitation page displays session details"""
        from server_host.database import models
        
        invite = models.SessionInvitation(
            invite_code="TESTINV789",
            session_id=test_game_session.id,
            pre_assigned_role="co-dm",
            max_uses=3,
            uses_count=1,
            expires_at=datetime.utcnow() + timedelta(days=7),
            is_active=True
        )
        test_db.add(invite)
        test_db.commit()
        
        response = client.get("/invite/TESTINV789")
        
        assert response.status_code == 200
        assert test_game_session.name.encode() in response.content
        assert b"co-dm" in response.content.lower()
        assert b"1 / 3" in response.content
    
    def test_expired_invitation_shows_error(self, client, test_db, test_game_session):
        """Expired invitation shows appropriate error"""
        from server_host.database import models
        
        invite = models.SessionInvitation(
            invite_code="EXPIREDINV",
            session_id=test_game_session.id,
            pre_assigned_role="player",
            max_uses=5,
            uses_count=0,
            expires_at=datetime.utcnow() - timedelta(hours=1),
            is_active=True
        )
        test_db.add(invite)
        test_db.commit()
        
        response = client.get("/invite/EXPIREDINV")
        
        assert response.status_code == 200
        assert b"expired" in response.content.lower() or b"no longer valid" in response.content.lower()
    
    def test_invite_max_uses_deactivates(self, client, test_db, test_game_session):
        """Invitation deactivates after max uses"""
        from server_host.database import models
        
        invite = models.SessionInvitation(
            invite_code="MAXUSESINV",
            session_id=test_game_session.id,
            pre_assigned_role="player",
            max_uses=1,
            uses_count=0,
            expires_at=datetime.utcnow() + timedelta(days=7),
            is_active=True
        )
        test_db.add(invite)
        test_db.commit()
        
        # Register with invite code
        client.post("/users/register", data={
            "username": "maxuseuser",
            "email": "maxuse@example.com",
            "password": "SecurePass1",
            "confirm_password": "SecurePass1",
            "invite_code": "MAXUSESINV"
        })
        
        # Check invitation is now inactive
        test_db.refresh(invite)
        assert invite.uses_count == 1
        assert invite.is_active == False
