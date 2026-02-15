import pytest

@pytest.mark.unit
class TestSessionSettings:
    def test_settings_requires_ownership(self, auth_client, test_db, test_game_session, test_user):
        """Non-owners cannot access settings"""
        from server_host.database import models
        
        # Create different owner
        other_user = models.User(
            username="otheruser",
            email="other@example.com",
            hashed_password="hashed",
            disabled=False
        )
        test_db.add(other_user)
        test_db.commit()
        
        # Set session owner to other user
        test_game_session.owner_id = other_user.id
        test_db.commit()
        
        response = auth_client.get(
            f"/game/session/{test_game_session.session_code}/settings",
            follow_redirects=False
        )
        
        assert response.status_code == 403
    
    def test_owner_can_access_settings(self, auth_client, test_db, test_user):
        """Owners can access settings"""
        from server_host.database import models
        
        session = models.GameSession(
            name="Test Session",
            session_code="TESTSESS",
            owner_id=test_user.id
        )
        test_db.add(session)
        test_db.commit()
        
        response = auth_client.get(f"/game/session/TESTSESS/settings")
        
        assert response.status_code == 200
        assert b"Session Settings" in response.content
        assert b"TESTSESS" in response.content
    
    def test_update_session_name(self, auth_client, test_db, test_user):
        """Owner can update session name"""
        from server_host.database import models
        
        session = models.GameSession(
            name="Old Name",
            session_code="UPDTSESS",
            owner_id=test_user.id
        )
        test_db.add(session)
        test_db.commit()
        
        response = auth_client.post(
            f"/game/session/UPDTSESS/settings",
            data={"name": "New Name"},
            follow_redirects=False
        )
        
        assert response.status_code == 302
        
        test_db.refresh(session)
        assert session.name == "New Name"
    
    def test_settings_shows_players(self, auth_client, test_db, test_user):
        """Settings page shows player list"""
        from server_host.database import models
        
        session = models.GameSession(
            name="Test Session",
            session_code="PLAYSESS",
            owner_id=test_user.id
        )
        test_db.add(session)
        
        player = models.GamePlayer(
            session_id=session.id,
            user_id=test_user.id,
            role="dm"
        )
        test_db.add(player)
        test_db.commit()
        
        response = auth_client.get(f"/game/session/PLAYSESS/settings")
        
        assert response.status_code == 200
        assert b"Players" in response.content
        assert test_user.username.encode() in response.content
    
    def test_settings_shows_invitations(self, auth_client, test_db, test_user):
        """Settings page shows active invitations"""
        from server_host.database import models
        from datetime import datetime, timedelta
        
        session = models.GameSession(
            name="Test Session",
            session_code="INVSESS1",
            owner_id=test_user.id
        )
        test_db.add(session)
        test_db.commit()
        
        invite = models.SessionInvitation(
            invite_code="SETTSINV",
            session_id=session.id,
            pre_assigned_role="player",
            max_uses=5,
            uses_count=2,
            expires_at=datetime.utcnow() + timedelta(days=7),
            is_active=True
        )
        test_db.add(invite)
        test_db.commit()
        
        response = auth_client.get(f"/game/session/INVSESS1/settings")
        
        assert response.status_code == 200
        assert b"Active Invitations" in response.content
        assert b"2/5" in response.content
    
    def test_delete_session(self, auth_client, test_db, test_user):
        """Owner can delete session"""
        from server_host.database import models
        
        session = models.GameSession(
            name="To Delete",
            session_code="DELSESS1",
            owner_id=test_user.id
        )
        test_db.add(session)
        test_db.commit()
        
        response = auth_client.post(
            f"/game/session/DELSESS1/delete",
            follow_redirects=False
        )
        
        assert response.status_code == 302
        assert response.headers["location"] == "/users/dashboard"
        
        deleted = test_db.query(models.GameSession).filter(
            models.GameSession.session_code == "DELSESS1"
        ).first()
        assert deleted is None
    
    def test_non_owner_cannot_delete(self, auth_client, test_db, test_user):
        """Non-owners cannot delete session"""
        from server_host.database import models
        
        other_user = models.User(
            username="owner",
            email="owner@example.com",
            hashed_password="hashed",
            disabled=False
        )
        test_db.add(other_user)
        test_db.commit()
        
        session = models.GameSession(
            name="Protected",
            session_code="PROTSESS",
            owner_id=other_user.id
        )
        test_db.add(session)
        test_db.commit()
        
        response = auth_client.post(
            f"/game/session/PROTSESS/delete",
            follow_redirects=False
        )
        
        assert response.status_code == 403
