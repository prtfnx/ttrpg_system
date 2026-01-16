"""Admin Panel API tests with role-based access control."""
import pytest
import json
from datetime import datetime

from server_host.database import models


pytestmark = pytest.mark.admin


@pytest.fixture
def test_session(db, test_users):
    """Create test session with players."""
    session = models.GameSession(
        session_code="ADMIN123",
        name="Admin Test Session",
        owner_id=test_users["owner"].id,
        game_data=json.dumps({
            "description": "Test session for admin panel",
            "max_players": 10,
            "visibility": "private",
            "join_policy": "invite_only"
        })
    )
    db.add(session)
    db.commit()
    db.refresh(session)
    
    players = [
        models.GamePlayer(session_id=session.id, user_id=test_users["owner"].id, 
                         role="owner", is_connected=True),
        models.GamePlayer(session_id=session.id, user_id=test_users["co_dm"].id, 
                         role="co_dm", is_connected=True),
        models.GamePlayer(session_id=session.id, user_id=test_users["player1"].id, 
                         role="player", is_connected=False),
        models.GamePlayer(session_id=session.id, user_id=test_users["player2"].id, 
                         role="trusted_player", is_connected=True),
        models.GamePlayer(session_id=session.id, user_id=test_users["spectator"].id, 
                         role="spectator", is_connected=False),
    ]
    db.add_all(players)
    db.commit()
    
    return session


@pytest.mark.api
class TestAdminSettings:
    """Session settings retrieval and updates."""
    
    @pytest.mark.parametrize("client_fixture,expected_status", [
        ("owner_client", 200),
        ("codm_client", 200),
        ("player_client", 302),  # Redirect to auth_error
    ])
    def test_get_settings_by_role(self, client_fixture, expected_status, test_session, request):
        """Admin settings access is role-based."""
        client = request.getfixturevalue(client_fixture)
        response = client.get("/game/session/ADMIN123/admin/settings")
        assert response.status_code == expected_status
    
    def test_get_settings_content(self, owner_client, test_session):
        """Settings include all session configuration."""
        response = owner_client.get("/game/session/ADMIN123/admin/settings")
        
        data = response.json()
        assert data["name"] == "Admin Test Session"
        assert data["max_players"] == 10
        assert data["visibility"] == "private"
        assert data["join_policy"] == "invite_only"
        assert data["owner_username"] == "owner_user"
    
    def test_update_settings(self, owner_client, test_session, db):
        """Owner can update session settings."""
        update_data = {
            "name": "Updated Name",
            "description": "New description",
            "max_players": 15,
            "visibility": "public"
        }
        
        response = owner_client.put("/game/session/ADMIN123/admin/settings", json=update_data)
        
        assert response.status_code == 200
        assert response.json()["success"] is True
        
        db.refresh(test_session)
        assert test_session.name == "Updated Name"
        game_data = json.loads(test_session.game_data)
        assert game_data["max_players"] == 15
    
    def test_update_settings_owner_only(self, codm_client, test_session):
        """Only owner can modify settings."""
        response = codm_client.put(
            "/game/session/ADMIN123/admin/settings",
            json={"name": "Should Fail"}
        )
        assert response.status_code == 302
    
    def test_update_creates_audit_log(self, owner_client, test_session, db):
        """Settings changes are logged."""
        owner_client.put(
            "/game/session/ADMIN123/admin/settings",
            json={"name": "Logged Update"}
        )
        
        audit = db.query(models.AuditLog).filter(
            models.AuditLog.event_type == "SETTINGS_UPDATED",
            models.AuditLog.session_code == "ADMIN123"
        ).first()
        
        assert audit is not None
        assert audit.user_id == test_session.owner_id


@pytest.mark.api
class TestBulkRoleChange:
    """Bulk role assignment operations."""
    
    def test_bulk_role_change(self, owner_client, test_session, test_users, db):
        """Owner can change multiple player roles."""
        changes = [
            {"user_id": test_users["player1"].id, "new_role": "trusted_player"},
            {"user_id": test_users["player2"].id, "new_role": "player"}
        ]
        
        response = owner_client.post(
            "/game/session/ADMIN123/admin/bulk-role-change",
            json={"changes": changes}
        )
        
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert data["updated_count"] == 2
        
        # Verify changes
        player1 = db.query(models.GamePlayer).filter_by(
            session_id=test_session.id,
            user_id=test_users["player1"].id
        ).first()
        assert player1.role == "trusted_player"
    
    def test_bulk_role_change_invalid_role(self, owner_client, test_session, test_users):
        """Invalid roles are rejected."""
        changes = [{"user_id": test_users["player1"].id, "new_role": "invalid_role"}]
        
        response = owner_client.post(
            "/game/session/ADMIN123/admin/bulk-role-change",
            json={"changes": changes}
        )
        assert response.status_code == 400
    
    def test_bulk_role_change_codm_forbidden(self, codm_client, test_users):
        """Only owner can bulk change roles."""
        changes = [{"user_id": test_users["player1"].id, "new_role": "trusted_player"}]
        
        response = codm_client.post(
            "/game/session/ADMIN123/admin/bulk-role-change",
            json={"changes": changes}
        )
        assert response.status_code == 302
    
    def test_bulk_role_creates_audit_logs(self, owner_client, test_session, test_users, db):
        """Each role change is logged."""
        changes = [
            {"user_id": test_users["player1"].id, "new_role": "trusted_player"},
            {"user_id": test_users["player2"].id, "new_role": "player"}
        ]
        
        owner_client.post(
            "/game/session/ADMIN123/admin/bulk-role-change",
            json={"changes": changes}
        )
        
        audit_count = db.query(models.AuditLog).filter(
            models.AuditLog.event_type == "ROLE_CHANGED",
            models.AuditLog.session_code == "ADMIN123"
        ).count()
        
        assert audit_count == 2


@pytest.mark.api
class TestAuditLog:
    """Audit log retrieval and filtering."""
    
    @pytest.fixture
    def sample_audit_logs(self, db, test_session, test_users):
        """Create sample audit log entries."""
        logs = [
            models.AuditLog(
                session_code="ADMIN123",
                user_id=test_users["owner"].id,
                event_type="SETTINGS_UPDATED",
                details=json.dumps({"field": "name", "old": "Old", "new": "New"}),
                ip_address="127.0.0.1",
                created_at=datetime(2024, 1, 1, 10, 0, 0)
            ),
            models.AuditLog(
                session_code="ADMIN123",
                user_id=test_users["owner"].id,
                event_type="ROLE_CHANGED",
                details=json.dumps({"user_id": test_users["player1"].id, "role": "trusted_player"}),
                ip_address="127.0.0.1",
                created_at=datetime(2024, 1, 1, 11, 0, 0)
            ),
            models.AuditLog(
                session_code="ADMIN123",
                user_id=test_users["co_dm"].id,
                event_type="PLAYER_KICKED",
                details=json.dumps({"user_id": test_users["player2"].id}),
                ip_address="127.0.0.2",
                created_at=datetime(2024, 1, 1, 12, 0, 0)
            ),
        ]
        db.add_all(logs)
        db.commit()
        return logs
    
    def test_get_audit_log(self, owner_client, test_session, sample_audit_logs):
        """Admins can retrieve audit logs."""
        response = owner_client.get("/game/session/ADMIN123/admin/audit-log")
        
        assert response.status_code == 200
        data = response.json()
        assert len(data["logs"]) == 3
    
    def test_audit_log_filter_by_type(self, owner_client, sample_audit_logs):
        """Audit logs can be filtered by event type."""
        response = owner_client.get(
            "/game/session/ADMIN123/admin/audit-log",
            params={"event_type": "ROLE_CHANGED"}
        )
        
        data = response.json()
        assert len(data["logs"]) == 1
        assert data["logs"][0]["event_type"] == "ROLE_CHANGED"
    
    def test_audit_log_filter_by_user(self, owner_client, test_users, sample_audit_logs):
        """Audit logs can be filtered by user."""
        response = owner_client.get(
            "/game/session/ADMIN123/admin/audit-log",
            params={"user_id": test_users["co_dm"].id}
        )
        
        data = response.json()
        assert len(data["logs"]) == 1
        assert data["logs"][0]["event_type"] == "PLAYER_KICKED"
    
    def test_audit_log_pagination(self, owner_client, sample_audit_logs):
        """Audit logs support pagination."""
        response = owner_client.get(
            "/game/session/ADMIN123/admin/audit-log",
            params={"limit": 2, "offset": 1}
        )
        
        data = response.json()
        assert len(data["logs"]) == 2
    
    def test_audit_log_player_forbidden(self, player_client):
        """Players cannot access audit logs."""
        response = player_client.get("/game/session/ADMIN123/admin/audit-log")
        assert response.status_code == 302


@pytest.mark.api
class TestSessionStats:
    """Session statistics aggregation."""
    
    def test_get_session_stats(self, owner_client, test_session):
        """Admins can retrieve session statistics."""
        response = owner_client.get("/game/session/ADMIN123/admin/stats")
        
        assert response.status_code == 200
        data = response.json()
        assert data["total_players"] == 5
        assert data["connected_players"] == 3
        assert data["player_breakdown"]["owner"] == 1
        assert data["player_breakdown"]["co_dm"] == 1
        assert data["player_breakdown"]["player"] == 1
    
    def test_stats_codm_access(self, codm_client, test_session):
        """Co-DM can view stats."""
        response = codm_client.get("/game/session/ADMIN123/admin/stats")
        assert response.status_code == 200
    
    def test_stats_player_forbidden(self, player_client):
        """Players cannot view detailed stats."""
        response = player_client.get("/game/session/ADMIN123/admin/stats")
        assert response.status_code == 302


@pytest.mark.api
class TestSessionDeletion:
    """Session deletion with confirmation."""
    
    def test_delete_session_without_confirmation(self, owner_client):
        """Deletion requires confirmation."""
        response = owner_client.delete("/game/session/ADMIN123/admin/delete")
        assert response.status_code == 400
    
    def test_delete_session_with_confirmation(self, owner_client, test_session, db):
        """Owner can delete session with confirmation."""
        response = owner_client.delete(
            "/game/session/ADMIN123/admin/delete",
            params={"confirm": "true"}
        )
        
        assert response.status_code == 200
        assert response.json()["success"] is True
        
        # Verify deletion
        session = db.query(models.GameSession).filter_by(
            session_code="ADMIN123"
        ).first()
        assert session is None
    
    def test_delete_session_codm_forbidden(self, codm_client):
        """Only owner can delete session."""
        response = codm_client.delete(
            "/game/session/ADMIN123/admin/delete",
            params={"confirm": "true"}
        )
        assert response.status_code == 302
    
    def test_delete_creates_audit_log(self, owner_client, test_session, db):
        """Session deletion is logged."""
        owner_client.delete(
            "/game/session/ADMIN123/admin/delete",
            params={"confirm": "true"}
        )
        
        audit = db.query(models.AuditLog).filter(
            models.AuditLog.event_type == "SESSION_DELETED",
            models.AuditLog.session_code == "ADMIN123"
        ).first()
        
        assert audit is not None


@pytest.mark.api
class TestAccessControl:
    """Verify role-based access control."""
    
    @pytest.mark.parametrize("endpoint,method", [
        ("/admin/settings", "GET"),
        ("/admin/bulk-role-change", "POST"),
        ("/admin/audit-log", "GET"),
        ("/admin/stats", "GET"),
    ])
    def test_spectator_forbidden(self, spectator_client, endpoint, method):
        """Spectators have no admin access."""
        url = f"/game/session/ADMIN123{endpoint}"
        client_method = getattr(spectator_client, method.lower())
        
        response = client_method(url, json={} if method == "POST" else None)
        assert response.status_code == 302
    
    def test_nonexistent_session(self, owner_client):
        """Access to non-existent session fails."""
        response = owner_client.get("/game/session/INVALID/admin/settings")
        assert response.status_code == 404


@pytest.mark.api
class TestErrorHandling:
    """Edge cases and error conditions."""
    
    def test_invalid_session_code(self, owner_client):
        """Invalid session code returns 404."""
        response = owner_client.get("/game/session/INVALID123/admin/settings")
        assert response.status_code == 404
    
    def test_malformed_bulk_role_payload(self, owner_client):
        """Malformed payload is rejected."""
        response = owner_client.post(
            "/game/session/ADMIN123/admin/bulk-role-change",
            json={"invalid": "data"}
        )
        assert response.status_code in [400, 422]
    
    def test_update_settings_invalid_data(self, owner_client):
        """Invalid settings data is rejected."""
        response = owner_client.put(
            "/game/session/ADMIN123/admin/settings",
            json={"max_players": -1}
        )
        assert response.status_code in [400, 422]
    
    def test_unauthorized_access(self, client):
        """Unauthenticated requests are rejected."""
        response = client.get("/game/session/ADMIN123/admin/settings")
        assert response.status_code == 302
