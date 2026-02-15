import pytest

@pytest.mark.unit
class TestDashboard:
    def test_dashboard_requires_auth(self, client):
        """Dashboard redirects unauthenticated users"""
        response = client.get("/users/dashboard", follow_redirects=False)
        assert response.status_code in [302, 401]
    
    def test_dashboard_shows_user_sessions(self, auth_client, test_db, test_user, test_game_session):
        """Dashboard displays user's sessions"""
        from server_host.database import models
        
        # Add user to session
        player = models.GamePlayer(
            session_id=test_game_session.id,
            user_id=test_user.id,
            role="player"
        )
        test_db.add(player)
        test_db.commit()
        
        response = auth_client.get("/users/dashboard")
        
        assert response.status_code == 200
        assert test_game_session.name.encode() in response.content
        assert test_game_session.session_code.encode() in response.content
    
    def test_dashboard_shows_create_join_forms(self, auth_client):
        """Dashboard includes create and join session forms"""
        response = auth_client.get("/users/dashboard")
        
        assert response.status_code == 200
        assert b"Create Session" in response.content
        assert b"Join Session" in response.content
        assert b'action="/game/create"' in response.content
        assert b'action="/game/join"' in response.content
    
    def test_create_session_from_dashboard(self, auth_client, test_db):
        """Creating session from dashboard redirects to session"""
        response = auth_client.post("/game/create", data={
            "game_name": "New Adventure"
        }, follow_redirects=False)
        
        assert response.status_code == 302
        assert "/game/session/" in response.headers["location"]
        
        from server_host.database import models
        session = test_db.query(models.GameSession).filter(
            models.GameSession.name == "New Adventure"
        ).first()
        assert session is not None
    
    def test_join_session_from_dashboard(self, auth_client, test_db, test_game_session):
        """Joining session from dashboard redirects to session"""
        response = auth_client.post("/game/join", data={
            "session_code": test_game_session.session_code,
            "character_name": "Test Character"
        }, follow_redirects=False)
        
        assert response.status_code == 302
        assert test_game_session.session_code in response.headers["location"]
    
    def test_dashboard_shows_owner_settings_link(self, auth_client, test_db, test_user):
        """Dashboard shows settings link for owned sessions"""
        from server_host.database import models
        
        # Create session owned by test_user
        session = models.GameSession(
            name="Owned Session",
            session_code="OWNSESS1",
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
        
        response = auth_client.get("/users/dashboard")
        
        assert response.status_code == 200
        assert b"Settings" in response.content
        assert b"/settings" in response.content
