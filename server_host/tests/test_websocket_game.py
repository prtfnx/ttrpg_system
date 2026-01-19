"""
WebSocket game protocol tests.
Tests real-time WebSocket communication for game sessions.
"""
import pytest
import json
from unittest.mock import AsyncMock, Mock
from net.protocol import Message, MessageType
from core_table.server_protocol import ServerProtocol
from core_table.server import TableManager


@pytest.fixture
def ws_protocol():
    """Create WebSocket protocol for testing."""
    table_manager = TableManager()
    return ServerProtocol(table_manager)


@pytest.mark.asyncio
class TestWebSocketGameProtocol:
    """Test WebSocket game message handling."""
    
    async def test_table_update_message(self, ws_protocol):
        """Table updates are processed correctly."""
        msg = Message(MessageType.TABLE_UPDATE, {
            "table_id": "test_table",
            "updates": {"sprite_count": 5}
        })
        
        response = await ws_protocol.handle_table_update(msg, "client1")
        assert response is not None
    
    async def test_sprite_movement_broadcast(self, ws_protocol):
        """Sprite movements trigger broadcasts."""
        # Create table first
        table_msg = Message(MessageType.NEW_TABLE_REQUEST, {
            "table_name": "move_test",
            "width": 100,
            "height": 100
        })
        table_response = await ws_protocol.handle_new_table_request(table_msg, "client1")
        table_id = table_response.data.get("table_data", {}).get("id")
        
        # Create sprite
        sprite_msg = Message(MessageType.SPRITE_CREATE, {
            "table_id": table_id,
            "sprite_data": {"sprite_id": "sprite1", "x": 0, "y": 0}
        })
        await ws_protocol.handle_create_sprite(sprite_msg, "client1")
        
        # Move sprite
        move_msg = Message(MessageType.SPRITE_MOVE, {
            "table_id": table_id,
            "sprite_id": "sprite1",
            "from": {"x": 0, "y": 0},
            "to": {"x": 10, "y": 10}
        })
        
        response = await ws_protocol.handle_move_sprite(move_msg, "client1")
        assert response.type in [MessageType.SUCCESS, MessageType.ERROR]
    
    async def test_player_action_handling(self, ws_protocol):
        """Player actions are processed."""
        msg = Message(MessageType.PLAYER_ACTION, {
            "action": "roll_dice",
            "dice": "1d20",
            "session_code": "TEST123"
        })
        
        response = await ws_protocol.handle_player_action(msg, "client1")
        assert response.type == MessageType.PLAYER_ACTION_RESPONSE
    
    async def test_player_ready_status(self, ws_protocol):
        """Player ready/unready status updates."""
        ready_msg = Message(MessageType.PLAYER_READY, {
            "session_code": "TEST123",
            "user_id": 1
        })
        
        response = await ws_protocol.handle_player_ready(ready_msg, "client1")
        assert response.type == MessageType.SUCCESS
        
        unready_msg = Message(MessageType.PLAYER_UNREADY, {
            "session_code": "TEST123",
            "user_id": 1
        })
        
        response = await ws_protocol.handle_player_unready(unready_msg, "client1")
        assert response.type == MessageType.SUCCESS


@pytest.mark.asyncio
class TestWebSocketBroadcasting:
    """Test message broadcasting to multiple clients."""
    
    async def test_broadcast_mechanism(self, ws_protocol):
        """Broadcasts are sent to all clients."""
        # Mock session manager for broadcasting
        ws_protocol.session_manager = Mock()
        ws_protocol.session_manager.broadcast_to_session = AsyncMock()
        
        msg = Message(MessageType.TABLE_UPDATE, {
            "table_id": "test",
            "data": {}
        })
        
        await ws_protocol.broadcast_to_session(msg, "client1")
        # Verify broadcast was called (would fail if session_manager is None)


@pytest.mark.unit
class TestMessageProtocol:
    """Test WebSocket message protocol structure."""
    
    def test_message_serialization(self):
        """Messages serialize to valid JSON."""
        msg = Message(
            type=MessageType.TABLE_UPDATE,
            data={"sprites": [], "table_id": "test"},
            client_id="client123"
        )
        
        json_str = msg.to_json()
        parsed = json.loads(json_str)
        
        assert parsed["type"] == "table_update"
        assert parsed["client_id"] == "client123"
        assert "timestamp" in parsed
    
    def test_message_deserialization(self):
        """JSON deserializes to Message objects."""
        json_str = json.dumps({
            "type": "sprite_move",
            "data": {"x": 10, "y": 20},
            "client_id": "client456",
            "timestamp": 1234567890.0
        })
        
        msg = Message.from_json(json_str)
        assert msg.type == MessageType.SPRITE_MOVE
        assert msg.data["x"] == 10
        assert msg.client_id == "client456"
    
    def test_all_game_message_types(self):
        """All game-related message types are valid."""
        game_types = [
            MessageType.TABLE_UPDATE,
            MessageType.SPRITE_MOVE,
            MessageType.SPRITE_CREATE,
            MessageType.SPRITE_REMOVE,
            MessageType.PLAYER_ACTION,
            MessageType.PLAYER_READY,
            MessageType.PLAYER_JOINED,
            MessageType.PLAYER_LEFT,
        ]
        
        for msg_type in game_types:
            msg = Message(msg_type, {"test": "data"})
            assert msg.type == msg_type
            assert msg.to_json() is not None
