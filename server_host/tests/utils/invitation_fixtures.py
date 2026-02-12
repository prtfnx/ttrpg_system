import pytest
import time
from datetime import datetime, timedelta
from unittest.mock import patch

@pytest.fixture
def invitation_factory(test_db, test_user, test_game_session):
    """Factory fixture for creating test invitations"""
    def _create_invitation(**kwargs):
        from server_host.database import models
        defaults = {
            "invite_code": f"INV{int(time.time())}{test_user.id}",
            "session_id": test_game_session.id,
            "pre_assigned_role": "player",
            "created_by": test_user.id,
            "max_uses": 1,
            "uses_count": 0,
            "is_active": True,
            "expires_at": datetime.utcnow() + timedelta(hours=24)
        }
        defaults.update(kwargs)
        
        invitation = models.SessionInvitation(**defaults)
        test_db.add(invitation)
        test_db.commit()
        test_db.refresh(invitation)
        return invitation
    return _create_invitation

@pytest.fixture  
def admin_user(test_db):
    """Create a user with admin privileges"""
    from server_host.database import crud, schemas
    user_data = schemas.UserCreate(
        username="admin_user",
        email="admin@example.com", 
        password="admin123"
    )
    return crud.create_user(test_db, user_data)

@pytest.fixture
def co_dm_user(test_db):
    """Create a user with co-dm privileges"""
    from server_host.database import crud, schemas
    user_data = schemas.UserCreate(
        username="codm_user",
        email="codm@example.com",
        password="codm123"
    )
    return crud.create_user(test_db, user_data)

@pytest.fixture
def player_user(test_db):
    """Create a regular player user"""
    from server_host.database import crud, schemas
    user_data = schemas.UserCreate(
        username="player_user",
        email="player@example.com",
        password="player123"
    )
    return crud.create_user(test_db, user_data)

@pytest.fixture
def game_session_with_players(test_db, test_user, co_dm_user, player_user, test_game_session):
    """Create a game session with multiple players with different roles"""
    from server_host.database import models
    
    # Owner (test_user) is already associated via test_game_session
    
    # Add co-dm
    co_dm_player = models.GamePlayer(
        user_id=co_dm_user.id,
        session_id=test_game_session.id,
        role="co_dm"
    )
    test_db.add(co_dm_player)
    
    # Add regular player
    regular_player = models.GamePlayer(
        user_id=player_user.id,
        session_id=test_game_session.id, 
        role="player"
    )
    test_db.add(regular_player)
    
    test_db.commit()
    return test_game_session

@pytest.fixture
def audit_log_factory(test_db):
    """Factory fixture for creating test audit logs"""
    def _create_audit_log(**kwargs):
        from server_host.database import models
        defaults = {
            "event_type": "test_event",
            "session_code": "TEST01", 
            "user_id": 1,
            "ip_address": "127.0.0.1",
            "user_agent": "pytest-client",
            "details": "Test audit log entry"
        }
        defaults.update(kwargs)
        
        audit_log = models.AuditLog(**defaults)
        test_db.add(audit_log)
        test_db.commit()
        test_db.refresh(audit_log)
        return audit_log
    return _create_audit_log

@pytest.fixture
def mock_request_ip():
    """Mock request with IP address for audit logging"""
    from unittest.mock import Mock
    request = Mock()
    request.client.host = "192.168.1.100"
    request.headers = {"user-agent": "Test-Browser/1.0"}
    return request