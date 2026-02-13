import pytest
import json
from unittest.mock import patch
from fastapi.testclient import TestClient

from server_host.routers.users import get_current_user
from server_host import main
from server_host.database import crud, schemas, models

# Import the invitation fixtures 
from ..utils.invitation_fixtures import *

@pytest.mark.integration
class TestSessionPlayerManagement:
    """Test session player listing and management"""
    
    def test_get_session_players_success(self, auth_client, game_session_with_players, test_user, co_dm_user, player_user):
        """Test retrieving session players list as owner"""
        response = auth_client.get(
            f"/game/api/sessions/{game_session_with_players.session_code}/players"
        )
        
        assert response.status_code == 200
        data = response.json()
        
        # Should have owner + co_dm + player = 3 players
        assert len(data) >= 3
        
        # Find players by username
        players_by_username = {p["username"]: p for p in data}
        
        assert test_user.username in players_by_username
        assert co_dm_user.username in players_by_username  
        assert player_user.username in players_by_username
        
        # Verify roles
        assert players_by_username[test_user.username]["role"] == "owner"
        assert players_by_username[co_dm_user.username]["role"] == "co_dm"
        assert players_by_username[player_user.username]["role"] == "player"
        
    def test_get_session_players_unauthorized(self, client, game_session_with_players):
        """Test getting session players without authentication"""
        response = client.get(
            f"/game/api/sessions/{game_session_with_players.session_code}/players"
        )
        
        assert response.status_code == 401
        
    def test_get_session_players_not_member(self, test_db, game_session_with_players):
        """Test getting session players as non-member"""
        # Create a user who is not part of the session
        outsider_user = crud.create_user(
            test_db,
            schemas.UserCreate(
                username="outsider",
                email="outsider@example.com",
                password="outsider123"
            )
        )
        
        async def override_get_current_user():
            return outsider_user
            
        main.app.dependency_overrides[get_current_user] = override_get_current_user
        
        client = TestClient(main.app)
        
        response = client.get(
            f"/game/api/sessions/{game_session_with_players.session_code}/players"
        )
        
        assert response.status_code == 403
        
        # Clean up override
        main.app.dependency_overrides.pop(get_current_user, None)
        
    def test_get_session_players_invalid_session(self, auth_client):
        """Test getting players for non-existent session"""
        response = auth_client.get("/game/api/sessions/INVALID/players")
        
        assert response.status_code == 404

@pytest.mark.integration
class TestRoleManagement:
    """Test changing player roles in sessions"""
    
    def test_change_player_role_success(self, auth_client, test_db, game_session_with_players, player_user):
        """Test successfully changing a player's role as owner"""
        role_data = {"new_role": "co_dm"}
        
        response = auth_client.post(
            f"/game/api/sessions/{game_session_with_players.session_code}/players/{player_user.id}/role",
            json=role_data
        )
        
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert data["message"] == "Role changed to co_dm"
        
        # Verify role was actually changed in database
        game_player = test_db.query(models.GamePlayer).filter_by(
            user_id=player_user.id,
            session_id=game_session_with_players.id
        ).first()
        
        assert game_player.role == "co_dm"
        
    def test_change_role_unauthorized(self, client, game_session_with_players, player_user):
        """Test changing role without authentication"""
        role_data = {"new_role": "co_dm"}
        
        response = client.post(
            f"/game/api/sessions/{game_session_with_players.session_code}/players/{player_user.id}/role",
            json=role_data
        )
        
        assert response.status_code == 401
        
    def test_change_role_insufficient_permissions(self, test_db, game_session_with_players, co_dm_user, player_user):
        """Test that regular players cannot change roles"""
        # Override to be regular player
        async def override_get_current_user():
            return player_user
            
        main.app.dependency_overrides[get_current_user] = override_get_current_user
        
        client = TestClient(main.app)
        
        role_data = {"new_role": "co_dm"}
        
        response = client.post(
            f"/game/api/sessions/{game_session_with_players.session_code}/players/{co_dm_user.id}/role",
            json=role_data
        )
        
        assert response.status_code == 403
        
        # Clean up override
        main.app.dependency_overrides.pop(get_current_user, None)
        
    def test_co_dm_can_manage_players(self, test_db, game_session_with_players, co_dm_user, player_user):
        """Test that co-DMs can change player roles"""
        # Override to be co-dm
        async def override_get_current_user():
            return co_dm_user
            
        main.app.dependency_overrides[get_current_user] = override_get_current_user
        
        client = TestClient(main.app)
        
        role_data = {"new_role": "co_dm"}
        
        response = client.post(
            f"/game/api/sessions/{game_session_with_players.session_code}/players/{player_user.id}/role",
            json=role_data
        )
        
        assert response.status_code == 200
        
        # Clean up override
        main.app.dependency_overrides.pop(get_current_user, None)
        
    def test_cannot_change_owner_role(self, auth_client, game_session_with_players, test_user):
        """Test that owner role cannot be changed"""
        role_data = {"new_role": "player"}
        
        response = auth_client.post(
            f"/game/api/sessions/{game_session_with_players.session_code}/players/{test_user.id}/role",
            json=role_data
        )
        
        assert response.status_code == 400  # Bad request - cannot change owner role
        
    def test_invalid_role_value(self, auth_client, game_session_with_players, player_user):
        """Test changing to an invalid role"""
        role_data = {"new_role": "super_admin"}  # Invalid role
        
        response = auth_client.post(
            f"/game/api/sessions/{game_session_with_players.session_code}/players/{player_user.id}/role",
            json=role_data
        )
        
        assert response.status_code == 422  # Validation error

@pytest.mark.integration 
class TestPlayerRemoval:
    """Test removing players from sessions"""
    
    def test_kick_player_success(self, auth_client, test_db, game_session_with_players, player_user):
        """Test successfully kicking a player as owner"""
        response = auth_client.delete(
            f"/game/api/sessions/{game_session_with_players.session_code}/players/{player_user.id}"
        )
        
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert "kicked" in data["message"].lower()
        
        # Verify player was removed from database
        game_player = test_db.query(models.GamePlayer).filter_by(
            user_id=player_user.id,
            session_id=game_session_with_players.id
        ).first()
        
        assert game_player is None  # Should be deleted
        
    def test_kick_player_unauthorized(self, client, game_session_with_players, player_user):
        """Test kicking player without authentication"""
        response = client.delete(
            f"/game/api/sessions/{game_session_with_players.session_code}/players/{player_user.id}"
        )
        
        assert response.status_code == 401
        
    def test_kick_player_insufficient_permissions(self, test_db, game_session_with_players, player_user, co_dm_user):
        """Test that regular players cannot kick others"""
        async def override_get_current_user():
            return player_user
            
        main.app.dependency_overrides[get_current_user] = override_get_current_user
        
        client = TestClient(main.app)
        
        response = client.delete(
            f"/game/api/sessions/{game_session_with_players.session_code}/players/{co_dm_user.id}"
        )
        
        assert response.status_code == 403
        
        # Clean up override
        main.app.dependency_overrides.pop(get_current_user, None)
        
    def test_cannot_kick_owner(self, test_db, game_session_with_players, co_dm_user, test_user):
        """Test that owner cannot be kicked"""
        async def override_get_current_user():
            return co_dm_user
            
        main.app.dependency_overrides[get_current_user] = override_get_current_user
        
        client = TestClient(main.app)
        
        response = client.delete(
            f"/game/api/sessions/{game_session_with_players.session_code}/players/{test_user.id}"
        )
        
        assert response.status_code == 400  # Bad request - cannot kick owner
        
        # Clean up override
        main.app.dependency_overrides.pop(get_current_user, None)
        
    def test_kick_nonexistent_player(self, auth_client, game_session_with_players):
        """Test kicking a player who is not in the session"""
        nonexistent_user_id = 99999
        
        response = auth_client.delete(
            f"/game/api/sessions/{game_session_with_players.session_code}/players/{nonexistent_user_id}"
        )
        
        assert response.status_code == 404

@pytest.mark.integration
class TestUserSessions:
    """Test getting user's session list with roles"""
    
    def test_get_user_sessions(self, auth_client, test_user, game_session_with_players):
        """Test getting user's sessions with role information"""
        response = auth_client.get("/game/api/sessions")
        
        assert response.status_code == 200
        data = response.json()
        
        assert len(data) >= 1
        
        # Find our test session
        test_session = None
        for session in data:
            if session["session_code"] == game_session_with_players.session_code:
                test_session = session
                break
        
        assert test_session is not None
        assert test_session["role"] == "owner"
        assert test_session["name"] == game_session_with_players.name
        
    def test_get_user_sessions_unauthorized(self, client):
        """Test getting sessions without authentication"""
        response = client.get("/game/api/sessions")
        
        assert response.status_code == 401
        
    def test_get_user_sessions_multiple_roles(self, test_db, co_dm_user, game_session_with_players):
        """Test getting sessions shows correct role for co-dm"""
        async def override_get_current_user():
            return co_dm_user
            
        main.app.dependency_overrides[get_current_user] = override_get_current_user
        
        client = TestClient(main.app)
        
        response = client.get("/game/api/sessions")
        
        assert response.status_code == 200
        data = response.json()
        
        # Find our test session
        test_session = next(
            (s for s in data if s["session_code"] == game_session_with_players.session_code),
            None
        )
        
        assert test_session is not None
        assert test_session["role"] == "co_dm"
        
        # Clean up override
        main.app.dependency_overrides.pop(get_current_user, None)

@pytest.mark.integration
class TestAdminAuditLogging:
    """Test audit logging for admin actions"""
    
    @patch('server_host.routers.game.Request')
    def test_role_change_audit_log(self, mock_request, auth_client, test_db, game_session_with_players, player_user):
        """Test that role changes are properly audited"""
        mock_request.client.host = "10.0.0.1"
        mock_request.headers = {"user-agent": "Admin-Panel/1.0"}
        
        role_data = {"new_role": "co_dm"}
        
        response = auth_client.post(
            f"/game/api/sessions/{game_session_with_players.session_code}/players/{player_user.id}/role",
            json=role_data
        )
        
        assert response.status_code == 200
        
        # Check audit log was created
        audit_logs = test_db.query(models.AuditLog).filter_by(
            event_type="role_changed"
        ).all()
        
        assert len(audit_logs) >= 1
        latest_log = audit_logs[-1]
        assert latest_log.session_code == game_session_with_players.session_code
        assert "role changed" in latest_log.details.lower()
        assert str(player_user.id) in latest_log.details
        
    @patch('server_host.routers.game.Request')
    def test_player_kick_audit_log(self, mock_request, auth_client, test_db, game_session_with_players, player_user):
        """Test that player kicks are properly audited"""
        mock_request.client.host = "172.16.0.1" 
        mock_request.headers = {"user-agent": "Session-Manager/2.0"}
        
        response = auth_client.delete(
            f"/game/api/sessions/{game_session_with_players.session_code}/players/{player_user.id}"
        )
        
        assert response.status_code == 200
        
        # Check audit log was created
        audit_logs = test_db.query(models.AuditLog).filter_by(
            event_type="player_kicked"
        ).all()
        
        assert len(audit_logs) >= 1
        latest_log = audit_logs[-1]
        assert latest_log.session_code == game_session_with_players.session_code
        assert "kicked" in latest_log.details.lower()
        assert str(player_user.id) in latest_log.details

@pytest.mark.integration
class TestAdminSecurityValidation:
    """Test security aspects of admin functionality"""
    
    def test_sql_injection_protection_session_code(self, auth_client):
        """Test that session codes are properly sanitized against SQL injection"""
        malicious_session_code = "TEST01'; DROP TABLE game_sessions; --"
        
        response = auth_client.get(
            f"/game/api/sessions/{malicious_session_code}/players"
        )
        
        # Should return 404, not cause a SQL error
        assert response.status_code == 404
        
    def test_session_isolation(self, test_db, auth_client):
        """Test that users can only access sessions they're members of"""
        # Create another user and session
        
        other_user = crud.create_user(
            test_db,
            schemas.UserCreate(
                username="other_user",
                email="other@example.com", 
                password="other123"
            )
        )
        
        other_session_data = schemas.GameSessionCreate(name="Other Session")
        other_session = crud.create_game_session(
            test_db, other_session_data, other_user.id, "OTHER1"
        )
        
        # Try to access other user's session
        response = auth_client.get(f"/game/api/sessions/{other_session.session_code}/players")
        
        assert response.status_code == 403  # Should be forbidden
        
    def test_rate_limiting_simulation(self, auth_client, game_session_with_players, player_user):
        """Test behavior under rapid requests (simulating rate limiting scenarios)"""
        # Make multiple rapid requests
        responses = []
        for i in range(10):
            response = auth_client.get(
                f"/game/api/sessions/{game_session_with_players.session_code}/players"
            )
            responses.append(response.status_code)
        
        # All requests should succeed (no rate limiting implemented yet, but test structure is ready)
        successful_requests = sum(1 for code in responses if code == 200)
        assert successful_requests > 0  # At least some should succeed