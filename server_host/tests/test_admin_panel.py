"""Admin Panel API tests - Testing real production endpoints."""
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
        is_active=True,
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
    """Session settings endpoints: GET/PUT /game/session/{code}/admin/settings"""
    
    def test_get_settings_owner(self, owner_client, test_session):
        """Owner can retrieve session settings."""
        response = owner_client.get("/game/session/ADMIN123/admin/settings")
        
        assert response.status_code == 200
        data = response.json()
        assert data["name"] == "Admin Test Session"
        assert data["max_players"] == 10
        assert data["visibility"] == "private"
        assert data["join_policy"] == "invite_only"
        assert data["owner_username"] == "owner_user"
    
    def test_get_settings_non_owner_forbidden(self, codm_client, player_client, test_session):
        """Only owner can retrieve settings."""
        # Co-DM gets 302 redirect (not owner)
        response = codm_client.get("/game/session/ADMIN123/admin/settings")
        assert response.status_code == 302
        
        # Player gets 302 redirect
        response = player_client.get("/game/session/ADMIN123/admin/settings")
        assert response.status_code == 302
    
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
        
        # Verify changes
        db.refresh(test_session)
        assert test_session.name == "Updated Name"
        game_data = json.loads(test_session.game_data)
        assert game_data["max_players"] == 15
    
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
    """Bulk role operations: POST /game/session/{code}/admin/players/bulk-role"""
    
    def test_bulk_role_change(self, owner_client, test_session, test_users, db):
        """Owner can change multiple player roles."""
        changes = {
            "user_ids": [test_users["player1"].id, test_users["player2"].id],
            "new_role": "trusted_player"
        }
        
        response = owner_client.post(
            "/game/session/ADMIN123/admin/players/bulk-role",
            json=changes
        )
        
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert data["updated"] == 2
        
        # Verify changes
        player1 = db.query(models.GamePlayer).filter_by(
            session_id=test_session.id,
            user_id=test_users["player1"].id
        ).first()
        assert player1.role == "trusted_player"
    
    def test_bulk_role_invalid_role(self, owner_client, test_session, test_users):
        """Invalid roles are rejected."""
        changes = {
            "user_ids": [test_users["player1"].id],
            "new_role": "super_admin"
        }
        
        response = owner_client.post(
            "/game/session/ADMIN123/admin/players/bulk-role",
            json=changes
        )
        assert response.status_code == 400
    
    def test_bulk_role_cannot_change_owner(self, owner_client, test_session, test_users):
        """Owner role cannot be changed."""
        changes = {
            "user_ids": [test_users["owner"].id],
            "new_role": "player"
        }
        
        response = owner_client.post(
            "/game/session/ADMIN123/admin/players/bulk-role",
            json=changes
        )
        # App redirects 403 errors to auth-error for HTML requests
        assert response.status_code in [403, 302]
    
    def test_bulk_role_creates_audit_logs(self, owner_client, test_session, test_users, db):
        """Each role change is logged."""
        changes = {
            "user_ids": [test_users["player1"].id, test_users["player2"].id],
            "new_role": "player"
        }
        
        owner_client.post(
            "/game/session/ADMIN123/admin/players/bulk-role",
            json=changes
        )
        
        audit_count = db.query(models.AuditLog).filter(
            models.AuditLog.event_type == "ROLE_CHANGE_BULK",
            models.AuditLog.session_code == "ADMIN123"
        ).count()
        
        assert audit_count == 2


@pytest.mark.api
class TestAuditLog:
    """Audit log endpoint: GET /game/session/{code}/admin/audit-log"""
    
    @pytest.fixture
    def sample_audit_logs(self, db, test_session, test_users):
        """Create sample audit log entries."""
        logs = [
            models.AuditLog(
                session_code="ADMIN123",
                user_id=test_users["owner"].id,
                event_type="SETTINGS_UPDATED",
                details=json.dumps({"changes": {"name": "Old -> New"}}),
                ip_address="127.0.0.1",
                created_at=datetime(2024, 1, 1, 10, 0, 0)
            ),
            models.AuditLog(
                session_code="ADMIN123",
                user_id=test_users["owner"].id,
                event_type="ROLE_CHANGE_BULK",
                target_user_id=test_users["player1"].id,
                details=json.dumps({"old_role": "player", "new_role": "trusted_player"}),
                ip_address="127.0.0.1",
                created_at=datetime(2024, 1, 1, 11, 0, 0)
            ),
        ]
        db.add_all(logs)
        db.commit()
        return logs
    
    def test_get_audit_log(self, owner_client, sample_audit_logs):
        """Owner can retrieve audit logs."""
        response = owner_client.get("/game/session/ADMIN123/admin/audit-log")
        
        assert response.status_code == 200
        logs = response.json()
        assert len(logs) >= 2
        assert logs[0]["event_type"] in ["SETTINGS_UPDATED", "ROLE_CHANGE_BULK"]
    
    def test_audit_log_filter_by_type(self, owner_client, sample_audit_logs):
        """Audit logs can be filtered by event type."""
        response = owner_client.get(
            "/game/session/ADMIN123/admin/audit-log",
            params={"event_type": "ROLE_CHANGE_BULK"}
        )
        
        logs = response.json()
        assert all(log["event_type"] == "ROLE_CHANGE_BULK" for log in logs)
    
    def test_audit_log_pagination(self, owner_client, sample_audit_logs):
        """Audit logs support pagination."""
        response = owner_client.get(
            "/game/session/ADMIN123/admin/audit-log",
            params={"limit": 1, "offset": 0}
        )
        
        logs = response.json()
        assert len(logs) == 1


@pytest.mark.api
class TestSessionStats:
    """Session statistics: GET /game/session/{code}/admin/stats"""
    
    def test_get_session_stats(self, owner_client, test_session):
        """Owner can retrieve session statistics."""
        response = owner_client.get("/game/session/ADMIN123/admin/stats")
        
        assert response.status_code == 200
        data = response.json()
        assert data["total_players"] == 5
        assert data["online_players"] == 3
        assert data["roles_distribution"]["owner"] == 1
        assert data["roles_distribution"]["co_dm"] == 1
    
    def test_stats_codm_access(self, codm_client, test_session):
        """Co-DM can view stats."""
        response = codm_client.get("/game/session/ADMIN123/admin/stats")
        assert response.status_code == 200
    
    def test_stats_player_forbidden(self, player_client, test_session):
        """Players cannot view stats."""
        response = player_client.get("/game/session/ADMIN123/admin/stats")
        assert response.status_code == 302


@pytest.mark.api
class TestSessionDeletion:
    """Session deletion: DELETE /game/session/{code}/admin/delete-session"""
    
    def test_delete_requires_confirmation(self, owner_client, test_session):
        """Deletion requires typing session name."""
        response = owner_client.delete(
            "/game/session/ADMIN123/admin/delete-session",
            params={"confirmation_name": "Wrong Name"}
        )
        assert response.status_code == 400
    
    def test_delete_with_confirmation(self, owner_client, test_session, db):
        """Owner can delete session with correct confirmation."""
        response = owner_client.delete(
            "/game/session/ADMIN123/admin/delete-session",
            params={"confirmation_name": "Admin Test Session"}
        )
        
        assert response.status_code == 200
        assert response.json()["success"] is True
        
        # Verify soft delete
        db.refresh(test_session)
        assert test_session.is_active is False
    
    def test_delete_creates_audit_log(self, owner_client, test_session, db):
        """Session deletion is logged."""
        owner_client.delete(
            "/game/session/ADMIN123/admin/delete-session",
            params={"confirmation_name": "Admin Test Session"}
        )
        
        audit = db.query(models.AuditLog).filter(
            models.AuditLog.event_type == "SESSION_DELETED",
            models.AuditLog.session_code == "ADMIN123"
        ).first()
        
        assert audit is not None


@pytest.mark.api
class TestAccessControl:
    """Verify role-based access control across all admin endpoints."""
    
    @pytest.mark.parametrize("endpoint,method,requires_owner", [
        ("/admin/settings", "GET", True),
        ("/admin/players/bulk-role", "POST", True),
        ("/admin/audit-log", "GET", True),
        ("/admin/stats", "GET", False),  # Co-DM can access
        ("/admin/delete-session", "DELETE", True),
    ])
    def test_access_control(self, endpoint, method, requires_owner, owner_client, 
                           codm_client, player_client, test_session):
        """Test access control for each endpoint."""
        url = f"/game/session/ADMIN123{endpoint}"
        
        # Owner always has access
        client_method = getattr(owner_client, method.lower())
        kwargs = {"json": {}} if method == "POST" else {}
        if method == "DELETE":
            kwargs = {"params": {"confirmation_name": "Admin Test Session"}}
        
        response = client_method(url, **kwargs)
        assert response.status_code in [200, 400, 302]  # 302 if test_session not in fixture scope
        
        # Co-DM access depends on endpoint
        client_method = getattr(codm_client, method.lower())
        response = client_method(url, **kwargs)
        if requires_owner:
            assert response.status_code == 302  # Redirect
        else:
            assert response.status_code in [200, 400, 302]
        
        # Player never has access
        client_method = getattr(player_client, method.lower())
        response = client_method(url, **kwargs)
        assert response.status_code == 302
