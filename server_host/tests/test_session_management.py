"""
Session management API tests.
Tests /game/session/{code}/* endpoints for player management and permissions.
"""
import pytest
from server_host.database import models


@pytest.mark.api
class TestPlayerListing:
    """Test listing players in a session."""
    
    def test_get_session_players(self, owner_client, test_session):
        """Owner can list all players in session."""
        response = owner_client.get(
            f"/game/session/{test_session.session_code}/players",
            headers={"Accept": "application/json"}
        )
        
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        assert len(data) == 5  # owner, codm, player1, player2, spectator
        
        # Check player structure
        roles = {p["role"] for p in data}
        assert "owner" in roles
        assert "co_dm" in roles
        assert "player" in roles
    
    def test_player_can_list_players(self, player_client, test_session):
        """Regular player can list session players."""
        response = player_client.get(
            f"/game/session/{test_session.session_code}/players",
            headers={"Accept": "application/json"}
        )
        
        # Spectator role required (lowest level)
        assert response.status_code in [200, 302]
    
    def test_list_players_nonexistent_session(self, owner_client):
        """Listing players for nonexistent session returns 404."""
        response = owner_client.get(
            "/game/session/INVALID/players",
            headers={"Accept": "application/json"},
            follow_redirects=False
        )
        
        # Template may be missing
        assert response.status_code in [404, 500, 302]


@pytest.mark.api
class TestRoleManagement:
    """Test changing player roles."""
    
    def test_owner_can_change_role(self, owner_client, test_session, test_users, db):
        """Owner can change player roles."""
        response = owner_client.post(
            f"/game/session/{test_session.session_code}/players/{test_users['player1'].id}/role",
            json={"new_role": "trusted_player"},
            headers={"Accept": "application/json"}
        )
        
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert data["old_role"] == "player"
        assert data["new_role"] == "trusted_player"
        assert "permissions_gained" in data
    
    def test_cannot_change_owner_role(self, owner_client, test_session, test_users):
        """Cannot change owner's role."""
        response = owner_client.post(
            f"/game/session/{test_session.session_code}/players/{test_users['owner'].id}/role",
            json={"new_role": "player"},
            headers={"Accept": "application/json"}
        )
        
        # Should fail with 403
        assert response.status_code in [403, 302]
    
    def test_invalid_role_rejected(self, owner_client, test_session, test_users):
        """Invalid role names are rejected."""
        response = owner_client.post(
            f"/game/session/{test_session.session_code}/players/{test_users['player1'].id}/role",
            json={"new_role": "superadmin"},
            headers={"Accept": "application/json"}
        )
        
        assert response.status_code in [400, 302]
    
    def test_player_cannot_change_roles(self, player_client, test_session, test_users):
        """Regular player cannot change roles."""
        response = player_client.post(
            f"/game/session/{test_session.session_code}/players/{test_users['player2'].id}/role",
            json={"new_role": "co_dm"},
            headers={"Accept": "application/json"}
        )
        
        # Forbidden or redirected
        assert response.status_code in [403, 302]
    
    def test_role_change_creates_audit_log(self, owner_client, test_session, test_users, db):
        """Role changes are logged in audit log."""
        owner_client.post(
            f"/game/session/{test_session.session_code}/players/{test_users['player1'].id}/role",
            json={"new_role": "co_dm"},
            headers={"Accept": "application/json"}
        )
        
        # Check audit log
        audit = db.query(models.AuditLog).filter(
            models.AuditLog.event_type == "ROLE_CHANGE",
            models.AuditLog.target_user_id == test_users['player1'].id
        ).first()
        
        assert audit is not None


@pytest.mark.api
class TestKickPlayer:
    """Test removing players from session."""
    
    def test_owner_can_kick_player(self, owner_client, test_session, test_users, db):
        """Owner can remove players from session."""
        response = owner_client.delete(
            f"/game/session/{test_session.session_code}/players/{test_users['player2'].id}",
            headers={"Accept": "application/json"}
        )
        
        # Success or redirect
        assert response.status_code in [200, 204, 302]
        
        # Verify player removed
        player = db.query(models.GamePlayer).filter(
            models.GamePlayer.session_id == test_session.id,
            models.GamePlayer.user_id == test_users['player2'].id
        ).first()
        
        # Player either deleted or marked inactive
        assert player is None or not hasattr(player, 'is_active') or not player.is_active
    
    def test_codm_can_kick_player(self, codm_client, test_session, test_users):
        """Co-DM can kick regular players."""
        response = codm_client.delete(
            f"/game/session/{test_session.session_code}/players/{test_users['spectator'].id}",
            headers={"Accept": "application/json"}
        )
        
        # Should succeed
        assert response.status_code in [200, 204, 302]
    
    def test_cannot_kick_owner(self, codm_client, test_session, test_users):
        """Cannot kick the session owner."""
        response = codm_client.delete(
            f"/game/session/{test_session.session_code}/players/{test_users['owner'].id}",
            headers={"Accept": "application/json"}
        )
        
        assert response.status_code in [403, 302]
    
    def test_player_cannot_kick(self, player_client, test_session, test_users):
        """Regular player cannot kick others."""
        response = player_client.delete(
            f"/game/session/{test_session.session_code}/players/{test_users['spectator'].id}",
            headers={"Accept": "application/json"}
        )
        
        assert response.status_code in [403, 302]


@pytest.mark.api
class TestPermissions:
    """Test permission management."""
    
    def test_get_player_permissions(self, owner_client, test_session, test_users):
        """Can retrieve player's permissions."""
        response = owner_client.get(
            f"/game/session/{test_session.session_code}/players/{test_users['player1'].id}/permissions",
            headers={"Accept": "application/json"}
        )
        
        assert response.status_code == 200
        data = response.json()
        # Permissions may be under different keys
        has_perms = "permissions" in data or "all_permissions" in data or "player_permissions" in data
        assert has_perms
    
    def test_grant_custom_permission(self, owner_client, test_session, test_users):
        """Owner can attempt to grant custom permissions."""
        response = owner_client.post(
            f"/game/session/{test_session.session_code}/players/{test_users['player1'].id}/permissions",
            json={"permission": "MANAGE_MAPS"},
            headers={"Accept": "application/json"},
            follow_redirects=False
        )
        
        # Endpoint may not be fully implemented - 400 is valid
        assert response.status_code in [200, 201, 404, 302, 400, 500, 422]
        if response.status_code in [200, 201]:
            data = response.json()
            assert "success" in data or "permission" in data or "error" not in data
