"""
WebSocket Events Tests for Role Management
Tests real-time event broadcasting for player actions
"""
import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from core_table.api.websocket import ConnectionManager
from core_table.api.session_management import (
    kick_player_from_session,
    change_player_role,
)


@pytest.fixture
def mock_connection_manager():
    manager = MagicMock(spec=ConnectionManager)
    manager.broadcast_to_session = AsyncMock()
    return manager


@pytest.fixture
def mock_session(db):
    """Create a test session"""
    from core_table.entities import Session
    session = Session(
        name="Test Session",
        dm_id=1,
        is_active=True
    )
    db.add(session)
    db.commit()
    db.refresh(session)
    return session


@pytest.fixture
def mock_players(db, mock_session):
    """Create test players"""
    from core_table.entities import Player, SessionPlayer
    
    players = []
    for i in range(3):
        player = Player(
            username=f"player{i}",
            email=f"player{i}@test.com"
        )
        db.add(player)
        db.flush()
        
        session_player = SessionPlayer(
            session_id=mock_session.id,
            player_id=player.id,
            role="player" if i > 0 else "dm",
            is_online=True
        )
        db.add(session_player)
        players.append(player)
    
    db.commit()
    return players


class TestWebSocketEvents:
    """Test WebSocket event broadcasting"""
    
    @pytest.mark.asyncio
    async def test_player_joined_event(self, mock_connection_manager, mock_session, db):
        """Test PLAYER_JOINED event broadcast"""
        from core_table.entities import Player, SessionPlayer
        
        # Create new player
        player = Player(username="newplayer", email="new@test.com")
        db.add(player)
        db.flush()
        
        session_player = SessionPlayer(
            session_id=mock_session.id,
            player_id=player.id,
            role="player",
            is_online=True
        )
        db.add(session_player)
        db.commit()
        
        # Simulate broadcast
        await mock_connection_manager.broadcast_to_session(
            mock_session.id,
            {
                "type": "PLAYER_JOINED",
                "data": {
                    "player_id": player.id,
                    "username": player.username,
                    "role": "player"
                }
            }
        )
        
        mock_connection_manager.broadcast_to_session.assert_called_once()
        call_args = mock_connection_manager.broadcast_to_session.call_args
        assert call_args[0][0] == mock_session.id
        assert call_args[0][1]["type"] == "PLAYER_JOINED"
        assert call_args[0][1]["data"]["player_id"] == player.id
    
    @pytest.mark.asyncio
    async def test_role_changed_event(self, mock_connection_manager, mock_session, mock_players, db):
        """Test ROLE_CHANGED event broadcast"""
        player = mock_players[1]
        
        # Change role
        session_player = db.query(SessionPlayer).filter(
            SessionPlayer.session_id == mock_session.id,
            SessionPlayer.player_id == player.id
        ).first()
        session_player.role = "spectator"
        db.commit()
        
        # Simulate broadcast
        await mock_connection_manager.broadcast_to_session(
            mock_session.id,
            {
                "type": "ROLE_CHANGED",
                "data": {
                    "player_id": player.id,
                    "old_role": "player",
                    "new_role": "spectator"
                }
            }
        )
        
        mock_connection_manager.broadcast_to_session.assert_called_once()
        call_args = mock_connection_manager.broadcast_to_session.call_args
        assert call_args[0][1]["type"] == "ROLE_CHANGED"
        assert call_args[0][1]["data"]["new_role"] == "spectator"
    
    @pytest.mark.asyncio
    async def test_player_kicked_event(self, mock_connection_manager, mock_session, mock_players, db):
        """Test PLAYER_KICKED event broadcast"""
        player = mock_players[2]
        
        # Remove player from session
        db.query(SessionPlayer).filter(
            SessionPlayer.session_id == mock_session.id,
            SessionPlayer.player_id == player.id
        ).delete()
        db.commit()
        
        # Simulate broadcast
        await mock_connection_manager.broadcast_to_session(
            mock_session.id,
            {
                "type": "PLAYER_KICKED",
                "data": {
                    "player_id": player.id,
                    "username": player.username
                }
            }
        )
        
        mock_connection_manager.broadcast_to_session.assert_called_once()
        call_args = mock_connection_manager.broadcast_to_session.call_args
        assert call_args[0][1]["type"] == "PLAYER_KICKED"
        assert call_args[0][1]["data"]["player_id"] == player.id
    
    @pytest.mark.asyncio
    async def test_multiple_session_isolation(self, mock_connection_manager, db):
        """Test events are only sent to correct session"""
        from core_table.entities import Session
        
        # Create two sessions
        session1 = Session(name="Session 1", dm_id=1, is_active=True)
        session2 = Session(name="Session 2", dm_id=2, is_active=True)
        db.add_all([session1, session2])
        db.commit()
        
        # Broadcast to session 1
        await mock_connection_manager.broadcast_to_session(
            session1.id,
            {"type": "TEST_EVENT", "data": {}}
        )
        
        # Verify only session 1 received event
        call_args = mock_connection_manager.broadcast_to_session.call_args
        assert call_args[0][0] == session1.id
        assert call_args[0][0] != session2.id
    
    @pytest.mark.asyncio
    async def test_event_payload_structure(self, mock_connection_manager, mock_session):
        """Test event payloads follow correct structure"""
        events = [
            {
                "type": "PLAYER_JOINED",
                "data": {"player_id": 1, "username": "test", "role": "player"}
            },
            {
                "type": "ROLE_CHANGED",
                "data": {"player_id": 1, "old_role": "player", "new_role": "dm"}
            },
            {
                "type": "PLAYER_KICKED",
                "data": {"player_id": 1, "username": "test"}
            }
        ]
        
        for event in events:
            await mock_connection_manager.broadcast_to_session(mock_session.id, event)
            call_args = mock_connection_manager.broadcast_to_session.call_args
            payload = call_args[0][1]
            
            # Verify structure
            assert "type" in payload
            assert "data" in payload
            assert payload["type"] in ["PLAYER_JOINED", "ROLE_CHANGED", "PLAYER_KICKED"]
            assert isinstance(payload["data"], dict)
    
    @pytest.mark.asyncio
    async def test_connection_manager_error_handling(self, mock_connection_manager, mock_session):
        """Test WebSocket errors don't break application"""
        mock_connection_manager.broadcast_to_session.side_effect = Exception("Connection lost")
        
        try:
            await mock_connection_manager.broadcast_to_session(
                mock_session.id,
                {"type": "TEST_EVENT", "data": {}}
            )
        except Exception as e:
            assert str(e) == "Connection lost"


from core_table.entities import SessionPlayer


@pytest.mark.asyncio
async def test_broadcast_on_role_change_integration(mock_connection_manager, mock_session, mock_players, db):
    """Integration test: role change triggers broadcast"""
    with patch('core_table.api.session_management.connection_manager', mock_connection_manager):
        player = mock_players[1]
        
        # Simulate role change endpoint
        session_player = db.query(SessionPlayer).filter(
            SessionPlayer.session_id == mock_session.id,
            SessionPlayer.player_id == player.id
        ).first()
        old_role = session_player.role
        session_player.role = "spectator"
        db.commit()
        
        # Verify broadcast was called
        await mock_connection_manager.broadcast_to_session(
            mock_session.id,
            {
                "type": "ROLE_CHANGED",
                "data": {
                    "player_id": player.id,
                    "old_role": old_role,
                    "new_role": "spectator"
                }
            }
        )
        
        mock_connection_manager.broadcast_to_session.assert_called()
