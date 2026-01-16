"""
Comprehensive tests for Admin Panel API
Tests all admin endpoints with proper access control and validation
"""
import pytest
import json
import sys
from pathlib import Path
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from datetime import datetime
from unittest.mock import patch

# Add project root to path
project_root = Path(__file__).parent.parent.parent
sys.path.insert(0, str(project_root))

from server_host.main import app
from server_host.database.database import Base, get_db
from server_host.database import models

SQLALCHEMY_TEST_DATABASE_URL = "sqlite:///./test_admin_panel.db"
engine = create_engine(SQLALCHEMY_TEST_DATABASE_URL, connect_args={"check_same_thread": False})
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


@pytest.fixture
def db():
    """Create test database"""
    Base.metadata.create_all(bind=engine)
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()
        Base.metadata.drop_all(bind=engine)


@pytest.fixture
def client(db):
    """Create test client with database override"""
    def override_get_db():
        try:
            yield db
        finally:
            pass
    app.dependency_overrides[get_db] = override_get_db
    return TestClient(app)


@pytest.fixture
def test_users(db):
    """Create test users"""
    owner = models.User(
        username="owner_user",
        email="owner@test.com",
        hashed_password="hashed_password",
        tier="premium"
    )
    co_dm = models.User(
        username="codm_user",
        email="codm@test.com",
        hashed_password="hashed_password",
        tier="free"
    )
    player1 = models.User(
        username="player1",
        email="player1@test.com",
        hashed_password="hashed_password",
        tier="free"
    )
    player2 = models.User(
        username="player2",
        email="player2@test.com",
        hashed_password="hashed_password",
        tier="free"
    )
    spectator = models.User(
        username="spectator",
        email="spectator@test.com",
        hashed_password="hashed_password",
        tier="free"
    )
    
    db.add_all([owner, co_dm, player1, player2, spectator])
    db.commit()
    db.refresh(owner)
    db.refresh(co_dm)
    db.refresh(player1)
    db.refresh(player2)
    db.refresh(spectator)
    
    return {
        "owner": owner,
        "co_dm": co_dm,
        "player1": player1,
        "player2": player2,
        "spectator": spectator
    }


@pytest.fixture
def test_session(db, test_users):
    """Create test session with game_data"""
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
    
    # Create game players
    players = [
        models.GamePlayer(
            session_id=session.id,
            user_id=test_users["owner"].id,
            role="owner",
            is_connected=True
        ),
        models.GamePlayer(
            session_id=session.id,
            user_id=test_users["co_dm"].id,
            role="co_dm",
            is_connected=True
        ),
        models.GamePlayer(
            session_id=session.id,
            user_id=test_users["player1"].id,
            role="player",
            is_connected=False
        ),
        models.GamePlayer(
            session_id=session.id,
            user_id=test_users["player2"].id,
            role="trusted_player",
            is_connected=True
        ),
        models.GamePlayer(
            session_id=session.id,
            user_id=test_users["spectator"].id,
            role="spectator",
            is_connected=False
        ),
    ]
    db.add_all(players)
    db.commit()
    
    return session


@pytest.fixture
def mock_current_user_owner(test_users):
    """Mock authentication for owner"""
    def mock_get_current_user():
        return test_users["owner"]
    return mock_get_current_user


@pytest.fixture
def mock_current_user_codm(test_users):
    """Mock authentication for co_dm"""
    def mock_get_current_user():
        return test_users["co_dm"]
    return mock_get_current_user


@pytest.fixture
def mock_current_user_player(test_users):
    """Mock authentication for player"""
    def mock_get_current_user():
        return test_users["player1"]
    return mock_get_current_user


class TestAdminSettings:
    """Test session settings endpoints"""
    
    def test_get_settings_as_owner(self, client, test_session, test_users, db):
        """Test owner can retrieve session settings"""
        with patch('server_host.routers.admin.get_current_user') as mock_auth:
            mock_auth.return_value = test_users["owner"]
            
            response = client.get("/game/session/ADMIN123/admin/settings")
            
            assert response.status_code == 200
            data = response.json()
            assert data["name"] == "Admin Test Session"
            assert data["max_players"] == 10
            assert data["visibility"] == "private"
            assert data["join_policy"] == "invite_only"
            assert data["owner_username"] == "owner_user"
    
    def test_get_settings_as_codm(self, client, test_session, test_users, db):
        """Test co_dm can retrieve session settings"""
        with patch('server_host.routers.admin.get_current_user') as mock_auth:
            mock_auth.return_value = test_users["co_dm"]
            
            response = client.get("/game/session/ADMIN123/admin/settings")
            
            assert response.status_code == 200
            data = response.json()
            assert data["name"] == "Admin Test Session"
    
    def test_get_settings_as_player_forbidden(self, client, test_session, test_users, db):
        """Test player cannot access settings"""
        with patch('server_host.routers.admin.get_current_user') as mock_auth:
            mock_auth.return_value = test_users["player1"]
            
            response = client.get("/game/session/ADMIN123/admin/settings")
            
            assert response.status_code == 403
    
    def test_update_settings_as_owner(self, client, test_session, test_users, db):
        """Test owner can update session settings"""
        with patch('server_host.routers.admin.get_current_user') as mock_auth:
            mock_auth.return_value = test_users["owner"]
            
            update_data = {
                "name": "Updated Session Name",
                "description": "New description",
                "max_players": 15,
                "visibility": "public"
            }
            
            response = client.put(
                "/game/session/ADMIN123/admin/settings",
                json=update_data
            )
            
            assert response.status_code == 200
            data = response.json()
            assert data["success"] is True
            assert "updated successfully" in data["message"].lower()
            
            # Verify changes in database
            db.refresh(test_session)
            assert test_session.name == "Updated Session Name"
            game_data = json.loads(test_session.game_data)
            assert game_data["description"] == "New description"
            assert game_data["max_players"] == 15
            assert game_data["visibility"] == "public"
    
    def test_update_settings_as_codm_forbidden(self, client, test_session, test_users, db):
        """Test co_dm cannot update settings (owner only)"""
        with patch('server_host.routers.admin.get_current_user') as mock_auth:
            mock_auth.return_value = test_users["co_dm"]
            
            response = client.put(
                "/game/session/ADMIN123/admin/settings",
                json={"name": "Should Fail"}
            )
            
            assert response.status_code == 403
    
    def test_update_settings_creates_audit_log(self, client, test_session, test_users, db):
        """Test that settings updates create audit log entries"""
        with patch('server_host.routers.admin.get_current_user') as mock_auth:
            mock_auth.return_value = test_users["owner"]
            
            response = client.put(
                "/game/session/ADMIN123/admin/settings",
                json={"name": "Logged Update"}
            )
            
            assert response.status_code == 200
            
            # Check audit log
            audit_entry = db.query(models.AuditLog).filter(
                models.AuditLog.event_type == "SETTINGS_UPDATED",
                models.AuditLog.session_code == "ADMIN123"
            ).first()
            
            assert audit_entry is not None
            assert audit_entry.user_id == test_users["owner"].id
    
    def test_update_settings_validation(self, client, test_session, test_users, db):
        """Test settings validation"""
        with patch('server_host.routers.admin.get_current_user') as mock_auth:
            mock_auth.return_value = test_users["owner"]
            
            # Invalid max_players (too high)
            response = client.put(
                "/game/session/ADMIN123/admin/settings",
                json={"max_players": 100}
            )
            assert response.status_code == 422
            
            # Invalid visibility
            response = client.put(
                "/game/session/ADMIN123/admin/settings",
                json={"visibility": "invalid_value"}
            )
            assert response.status_code == 422


class TestBulkRoleChange:
    """Test bulk role change endpoint"""
    
    def test_bulk_role_change_as_owner(self, client, test_session, test_users, db):
        """Test owner can bulk change roles"""
        with patch('server_host.routers.admin.get_current_user') as mock_auth:
            mock_auth.return_value = test_users["owner"]
            
            bulk_data = {
                "user_ids": [test_users["player1"].id, test_users["player2"].id],
                "new_role": "trusted_player"
            }
            
            response = client.post(
                "/game/session/ADMIN123/admin/players/bulk-role",
                json=bulk_data
            )
            
            assert response.status_code == 200
            data = response.json()
            assert data["success"] is True
            assert data["updated"] == 2
            assert len(data["failed"]) == 0
            
            # Verify roles updated in database
            player1_game = db.query(models.GamePlayer).filter(
                models.GamePlayer.session_id == test_session.id,
                models.GamePlayer.user_id == test_users["player1"].id
            ).first()
            assert player1_game.role == "trusted_player"
    
    def test_bulk_role_change_cannot_change_owner(self, client, test_session, test_users, db):
        """Test that bulk change cannot affect owner"""
        with patch('server_host.routers.admin.get_current_user') as mock_auth:
            mock_auth.return_value = test_users["owner"]
            
            bulk_data = {
                "user_ids": [test_users["owner"].id, test_users["player1"].id],
                "new_role": "player"
            }
            
            response = client.post(
                "/game/session/ADMIN123/admin/players/bulk-role",
                json=bulk_data
            )
            
            # Should fail with 403
            assert response.status_code == 403
    
    def test_bulk_role_change_as_codm_forbidden(self, client, test_session, test_users, db):
        """Test co_dm cannot bulk change roles (owner only)"""
        with patch('server_host.routers.admin.get_current_user') as mock_auth:
            mock_auth.return_value = test_users["co_dm"]
            
            response = client.post(
                "/game/session/ADMIN123/admin/players/bulk-role",
                json={"user_ids": [test_users["player1"].id], "new_role": "player"}
            )
            
            assert response.status_code == 403
    
    def test_bulk_role_change_invalid_role(self, client, test_session, test_users, db):
        """Test validation of role names"""
        with patch('server_host.routers.admin.get_current_user') as mock_auth:
            mock_auth.return_value = test_users["owner"]
            
            response = client.post(
                "/game/session/ADMIN123/admin/players/bulk-role",
                json={"user_ids": [test_users["player1"].id], "new_role": "invalid_role"}
            )
            
            assert response.status_code == 400
    
    def test_bulk_role_change_creates_audit_logs(self, client, test_session, test_users, db):
        """Test that bulk changes create individual audit logs"""
        with patch('server_host.routers.admin.get_current_user') as mock_auth:
            mock_auth.return_value = test_users["owner"]
            
            bulk_data = {
                "user_ids": [test_users["player1"].id, test_users["spectator"].id],
                "new_role": "player"
            }
            
            response = client.post(
                "/game/session/ADMIN123/admin/players/bulk-role",
                json=bulk_data
            )
            
            assert response.status_code == 200
            
            # Check audit logs
            audit_entries = db.query(models.AuditLog).filter(
                models.AuditLog.event_type == "ROLE_CHANGE_BULK",
                models.AuditLog.session_code == "ADMIN123"
            ).all()
            
            assert len(audit_entries) == 2
    
    def test_bulk_role_change_partial_success(self, client, test_session, test_users, db):
        """Test bulk change with some invalid users"""
        with patch('server_host.routers.admin.get_current_user') as mock_auth:
            mock_auth.return_value = test_users["owner"]
            
            bulk_data = {
                "user_ids": [test_users["player1"].id, 9999],  # 9999 doesn't exist
                "new_role": "player"
            }
            
            response = client.post(
                "/game/session/ADMIN123/admin/players/bulk-role",
                json=bulk_data
            )
            
            assert response.status_code == 200
            data = response.json()
            assert data["updated"] == 1
            assert 9999 in data["failed"]


class TestAuditLog:
    """Test audit log endpoint"""
    
    def test_get_audit_log_as_owner(self, client, test_session, test_users, db):
        """Test owner can retrieve audit log"""
        # Create some audit entries
        audit1 = models.AuditLog(
            event_type="ROLE_CHANGE",
            session_code="ADMIN123",
            user_id=test_users["owner"].id,
            target_user_id=test_users["player1"].id,
            details=json.dumps({"old_role": "player", "new_role": "trusted_player"})
        )
        audit2 = models.AuditLog(
            event_type="SETTINGS_UPDATED",
            session_code="ADMIN123",
            user_id=test_users["owner"].id,
            details=json.dumps({"changes": {"name": "old_name"}})
        )
        db.add_all([audit1, audit2])
        db.commit()
        
        with patch('server_host.routers.admin.get_current_user') as mock_auth:
            mock_auth.return_value = test_users["owner"]
            
            response = client.get("/game/session/ADMIN123/admin/audit-log")
            
            assert response.status_code == 200
            data = response.json()
            assert len(data) >= 2
            assert any(e["event_type"] == "ROLE_CHANGE" for e in data)
            assert any(e["event_type"] == "SETTINGS_UPDATED" for e in data)
    
    def test_get_audit_log_filtering(self, client, test_session, test_users, db):
        """Test audit log event type filtering"""
        # Create different event types
        events = [
            models.AuditLog(
                event_type="ROLE_CHANGE",
                session_code="ADMIN123",
                user_id=test_users["owner"].id
            ),
            models.AuditLog(
                event_type="PLAYER_KICKED",
                session_code="ADMIN123",
                user_id=test_users["owner"].id
            ),
            models.AuditLog(
                event_type="ROLE_CHANGE",
                session_code="ADMIN123",
                user_id=test_users["owner"].id
            ),
        ]
        db.add_all(events)
        db.commit()
        
        with patch('server_host.routers.admin.get_current_user') as mock_auth:
            mock_auth.return_value = test_users["owner"]
            
            response = client.get(
                "/game/session/ADMIN123/admin/audit-log?event_type=ROLE_CHANGE"
            )
            
            assert response.status_code == 200
            data = response.json()
            assert all(e["event_type"] == "ROLE_CHANGE" for e in data)
    
    def test_get_audit_log_pagination(self, client, test_session, test_users, db):
        """Test audit log pagination"""
        # Create multiple entries
        for i in range(15):
            audit = models.AuditLog(
                event_type="TEST_EVENT",
                session_code="ADMIN123",
                user_id=test_users["owner"].id
            )
            db.add(audit)
        db.commit()
        
        with patch('server_host.routers.admin.get_current_user') as mock_auth:
            mock_auth.return_value = test_users["owner"]
            
            # Get first page
            response = client.get("/game/session/ADMIN123/admin/audit-log?limit=10&offset=0")
            assert response.status_code == 200
            data1 = response.json()
            assert len(data1) == 10
            
            # Get second page
            response = client.get("/game/session/ADMIN123/admin/audit-log?limit=10&offset=10")
            assert response.status_code == 200
            data2 = response.json()
            assert len(data2) >= 5


class TestSessionStats:
    """Test session statistics endpoint"""
    
    def test_get_stats_as_owner(self, client, test_session, test_users, db):
        """Test owner can retrieve session statistics"""
        with patch('server_host.routers.admin.get_current_user') as mock_auth:
            mock_auth.return_value = test_users["owner"]
            
            response = client.get("/game/session/ADMIN123/admin/stats")
            
            assert response.status_code == 200
            data = response.json()
            assert data["total_players"] == 5
            assert data["online_players"] == 3  # owner, co_dm, player2
            assert "roles_distribution" in data
            assert data["roles_distribution"]["owner"] == 1
            assert data["roles_distribution"]["co_dm"] == 1
            assert data["roles_distribution"]["player"] == 1
            assert data["roles_distribution"]["trusted_player"] == 1
            assert data["roles_distribution"]["spectator"] == 1
    
    def test_get_stats_as_codm(self, client, test_session, test_users, db):
        """Test co_dm can retrieve statistics"""
        with patch('server_host.routers.admin.get_current_user') as mock_auth:
            mock_auth.return_value = test_users["co_dm"]
            
            response = client.get("/game/session/ADMIN123/admin/stats")
            
            assert response.status_code == 200


class TestSessionDeletion:
    """Test session deletion endpoint"""
    
    def test_delete_session_as_owner(self, client, test_session, test_users, db):
        """Test owner can delete session"""
        with patch('server_host.routers.admin.get_current_user') as mock_auth:
            mock_auth.return_value = test_users["owner"]
            
            response = client.delete(
                "/game/session/ADMIN123/admin/session",
                json={"confirmation": "ADMIN123"}
            )
            
            assert response.status_code == 200
            
            # Verify session marked as inactive
            db.refresh(test_session)
            assert test_session.is_active is False
    
    def test_delete_session_requires_confirmation(self, client, test_session, test_users, db):
        """Test deletion requires correct confirmation code"""
        with patch('server_host.routers.admin.get_current_user') as mock_auth:
            mock_auth.return_value = test_users["owner"]
            
            response = client.delete(
                "/game/session/ADMIN123/admin/session",
                json={"confirmation": "WRONG_CODE"}
            )
            
            assert response.status_code == 400
    
    def test_delete_session_as_codm_forbidden(self, client, test_session, test_users, db):
        """Test co_dm cannot delete session (owner only)"""
        with patch('server_host.routers.admin.get_current_user') as mock_auth:
            mock_auth.return_value = test_users["co_dm"]
            
            response = client.delete(
                "/game/session/ADMIN123/admin/session",
                json={"confirmation": "ADMIN123"}
            )
            
            assert response.status_code == 403
    
    def test_delete_session_creates_audit_log(self, client, test_session, test_users, db):
        """Test deletion creates audit log"""
        with patch('server_host.routers.admin.get_current_user') as mock_auth:
            mock_auth.return_value = test_users["owner"]
            
            response = client.delete(
                "/game/session/ADMIN123/admin/session",
                json={"confirmation": "ADMIN123"}
            )
            
            assert response.status_code == 200
            
            # Check audit log
            audit_entry = db.query(models.AuditLog).filter(
                models.AuditLog.event_type == "SESSION_DELETED",
                models.AuditLog.session_code == "ADMIN123"
            ).first()
            
            assert audit_entry is not None


class TestAccessControl:
    """Test role-based access control across all endpoints"""
    
    def test_admin_page_access_owner(self, client, test_session, test_users, db):
        """Test owner can access admin page"""
        with patch('server_host.routers.game.get_current_active_user') as mock_auth:
            mock_auth.return_value = test_users["owner"]
            
            response = client.get("/game/session/ADMIN123/admin")
            
            assert response.status_code == 200
            assert b"admin-root" in response.content
    
    def test_admin_page_access_codm(self, client, test_session, test_users, db):
        """Test co_dm can access admin page"""
        with patch('server_host.routers.game.get_current_active_user') as mock_auth:
            mock_auth.return_value = test_users["co_dm"]
            
            response = client.get("/game/session/ADMIN123/admin")
            
            assert response.status_code == 200
    
    def test_admin_page_access_player_forbidden(self, client, test_session, test_users, db):
        """Test player cannot access admin page"""
        with patch('server_host.routers.game.get_current_active_user') as mock_auth:
            mock_auth.return_value = test_users["player1"]
            
            response = client.get("/game/session/ADMIN123/admin")
            
            assert response.status_code == 403


class TestErrorHandling:
    """Test error handling and edge cases"""
    
    def test_nonexistent_session(self, client, test_users, db):
        """Test accessing admin for non-existent session"""
        with patch('server_host.routers.admin.get_current_user') as mock_auth:
            mock_auth.return_value = test_users["owner"]
            
            response = client.get("/game/session/NONEXISTENT/admin/settings")
            
            assert response.status_code == 404
    
    def test_empty_bulk_role_change(self, client, test_session, test_users, db):
        """Test bulk role change with empty user list"""
        with patch('server_host.routers.admin.get_current_user') as mock_auth:
            mock_auth.return_value = test_users["owner"]
            
            response = client.post(
                "/game/session/ADMIN123/admin/players/bulk-role",
                json={"user_ids": [], "new_role": "player"}
            )
            
            assert response.status_code == 400


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
