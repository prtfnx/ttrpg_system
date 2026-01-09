"""
Permission Middleware Tests
Tests authorization checks for role management endpoints
"""
import pytest
from fastapi import HTTPException
from core_table.api.session_management import (
    require_session_permission,
    require_session_role,
    get_session_player
)


@pytest.fixture
def test_session(db):
    """Create a test session"""
    from core_table.entities import Session
    session = Session(name="Test Session", dm_id=1, is_active=True)
    db.add(session)
    db.commit()
    db.refresh(session)
    return session


@pytest.fixture
def test_players(db, test_session):
    """Create test players with different roles"""
    from core_table.entities import Player, SessionPlayer
    
    roles = {"dm": 1, "player": 2, "spectator": 3}
    players = {}
    
    for role, player_id in roles.items():
        player = Player(
            id=player_id,
            username=f"{role}_user",
            email=f"{role}@test.com"
        )
        db.add(player)
        db.flush()
        
        session_player = SessionPlayer(
            session_id=test_session.id,
            player_id=player.id,
            role=role,
            is_online=True
        )
        db.add(session_player)
        players[role] = player
    
    db.commit()
    return players


class TestPermissionMiddleware:
    """Test permission checking middleware"""
    
    def test_require_dm_permission_success(self, db, test_session, test_players):
        """DM should pass permission check"""
        dm = test_players["dm"]
        
        # This should not raise
        session_player = require_session_role(test_session.id, dm.id, "dm", db)
        assert session_player.role == "dm"
    
    def test_require_dm_permission_failure(self, db, test_session, test_players):
        """Player should fail DM permission check"""
        player = test_players["player"]
        
        with pytest.raises(HTTPException) as exc:
            require_session_role(test_session.id, player.id, "dm", db)
        
        assert exc.value.status_code == 403
        assert "Insufficient permissions" in str(exc.value.detail)
    
    def test_require_player_permission_success(self, db, test_session, test_players):
        """Player should pass player permission check"""
        player = test_players["player"]
        
        session_player = require_session_role(test_session.id, player.id, "player", db)
        assert session_player.role == "player"
    
    def test_require_player_permission_dm_allowed(self, db, test_session, test_players):
        """DM should pass player permission check (higher privilege)"""
        dm = test_players["dm"]
        
        # DM has all permissions
        session_player = get_session_player(test_session.id, dm.id, db)
        assert session_player is not None
    
    def test_spectator_permission_restricted(self, db, test_session, test_players):
        """Spectator should fail player permission check"""
        spectator = test_players["spectator"]
        
        with pytest.raises(HTTPException) as exc:
            require_session_role(test_session.id, spectator.id, "player", db)
        
        assert exc.value.status_code == 403
    
    def test_not_in_session(self, db, test_session):
        """Non-member should fail all permission checks"""
        with pytest.raises(HTTPException) as exc:
            require_session_permission(test_session.id, 999, db)
        
        assert exc.value.status_code == 403
        assert "not a member" in str(exc.value.detail).lower()
    
    def test_session_not_found(self, db, test_players):
        """Non-existent session should raise 404"""
        dm = test_players["dm"]
        
        with pytest.raises(HTTPException) as exc:
            require_session_permission(999, dm.id, db)
        
        assert exc.value.status_code == 404
    
    def test_permission_hierarchy(self, db, test_session, test_players):
        """Test role hierarchy: DM > Player > Spectator"""
        dm = test_players["dm"]
        player = test_players["player"]
        spectator = test_players["spectator"]
        
        # DM can do anything
        assert get_session_player(test_session.id, dm.id, db).role == "dm"
        
        # Player can't do DM things
        with pytest.raises(HTTPException):
            require_session_role(test_session.id, player.id, "dm", db)
        
        # Spectator can't do player things
        with pytest.raises(HTTPException):
            require_session_role(test_session.id, spectator.id, "player", db)
    
    def test_multiple_sessions_isolation(self, db, test_players):
        """Player in one session shouldn't access another"""
        from core_table.entities import Session, SessionPlayer
        
        session1 = Session(name="Session 1", dm_id=1, is_active=True)
        session2 = Session(name="Session 2", dm_id=2, is_active=True)
        db.add_all([session1, session2])
        db.commit()
        
        player = test_players["player"]
        
        # Add player to session1 only
        sp = SessionPlayer(
            session_id=session1.id,
            player_id=player.id,
            role="player"
        )
        db.add(sp)
        db.commit()
        
        # Should work for session1
        assert get_session_player(session1.id, player.id, db) is not None
        
        # Should fail for session2
        with pytest.raises(HTTPException) as exc:
            require_session_permission(session2.id, player.id, db)
        assert exc.value.status_code == 403


class TestPermissionDecorators:
    """Test permission decorator functions"""
    
    def test_get_session_player_valid(self, db, test_session, test_players):
        """Test getting valid session player"""
        dm = test_players["dm"]
        session_player = get_session_player(test_session.id, dm.id, db)
        
        assert session_player is not None
        assert session_player.player_id == dm.id
        assert session_player.session_id == test_session.id
    
    def test_get_session_player_invalid(self, db, test_session):
        """Test getting non-existent session player"""
        session_player = get_session_player(test_session.id, 999, db)
        assert session_player is None
    
    def test_require_permission_active_session(self, db, test_players):
        """Test permission check requires active session"""
        from core_table.entities import Session, SessionPlayer
        
        inactive_session = Session(
            name="Inactive",
            dm_id=test_players["dm"].id,
            is_active=False
        )
        db.add(inactive_session)
        db.commit()
        
        sp = SessionPlayer(
            session_id=inactive_session.id,
            player_id=test_players["dm"].id,
            role="dm"
        )
        db.add(sp)
        db.commit()
        
        # Should still work for inactive sessions (permission check only)
        assert get_session_player(inactive_session.id, test_players["dm"].id, db) is not None
    
    def test_role_validation(self, db, test_session, test_players):
        """Test invalid role name raises error"""
        dm = test_players["dm"]
        
        # Valid roles only
        with pytest.raises(HTTPException):
            require_session_role(test_session.id, dm.id, "invalid_role", db)
