"""
Tests for GameSessionProtocolService.

Focus: client lifecycle (add/remove/ban), message dispatch routing,
broadcast behaviour, and session stats. No real DB or WebSocket — all mocked.
"""
import json
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from core_table.protocol import Message, MessageType


def _make_service(session_code="TST"):
    """Build a GameSessionProtocolService with no DB (test-table mode)."""
    from service.game_session_protocol import GameSessionProtocolService
    with patch("service.game_session_protocol.TableManager"), \
         patch("service.game_session_protocol.ServerProtocol") as mock_sp, \
         patch("service.game_session_protocol.get_server_asset_manager"):
        mock_sp.return_value.handlers = {}
        mock_sp.return_value.handle_client = AsyncMock()
        svc = GameSessionProtocolService.__new__(GameSessionProtocolService)
        svc.session_code = session_code
        svc.db_session = None
        svc.game_session_db_id = None
        svc.clients = {}
        svc.client_info = {}
        svc.websocket_to_client = {}
        svc.table_manager = MagicMock()
        svc.table_manager.tables = {}
        svc.server_protocol = mock_sp.return_value
        svc.asset_manager = MagicMock()
    return svc


def _ws():
    ws = AsyncMock()
    ws.send_text = AsyncMock()
    return ws


# ---------------------------------------------------------------------------
# add_client / remove_client
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
class TestClientLifecycle:
    async def test_add_client_sends_welcome(self):
        svc = _make_service()
        ws = _ws()
        await svc.add_client(ws, "c1", {"user_id": 1, "username": "Alice", "role": "player"})
        assert "c1" in svc.clients
        ws.send_text.assert_awaited_once()
        payload = json.loads(ws.send_text.call_args[0][0])
        assert payload["type"] == MessageType.WELCOME.value

    async def test_add_client_stores_info(self):
        svc = _make_service()
        ws = _ws()
        await svc.add_client(ws, "c1", {"user_id": 42, "username": "Bob", "role": "owner"})
        assert svc.client_info["c1"]["username"] == "Bob"
        assert svc.websocket_to_client[ws] == "c1"

    async def test_remove_client_cleans_up(self):
        svc = _make_service()
        ws = _ws()
        await svc.add_client(ws, "c1", {"user_id": 1, "username": "Alice", "role": "player"})
        await svc.remove_client(ws)
        assert "c1" not in svc.clients
        assert "c1" not in svc.client_info
        assert ws not in svc.websocket_to_client

    async def test_remove_unknown_websocket_is_noop(self):
        svc = _make_service()
        ws = _ws()  # never added
        await svc.remove_client(ws)  # should not raise

    async def test_banned_player_raises(self):
        svc = _make_service()
        svc.db_session = MagicMock()
        svc.game_session_db_id = 1
        game_session = MagicMock()
        game_session.ban_list = json.dumps([{"player_id": "7", "reason": "cheating"}])
        svc.db_session.get.return_value = game_session
        ws = _ws()
        with pytest.raises(PermissionError, match="Banned"):
            await svc.add_client(ws, "c1", {"user_id": 7, "username": "Cheater", "role": "player"})


# ---------------------------------------------------------------------------
# handle_protocol_message
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
class TestHandleProtocolMessage:
    async def test_invalid_json_sends_error(self):
        svc = _make_service()
        ws = _ws()
        await svc.handle_protocol_message(ws, "not-json{{{")
        ws.send_text.assert_awaited_once()
        payload = json.loads(ws.send_text.call_args[0][0])
        assert payload["type"] == MessageType.ERROR.value

    async def test_unregistered_client_sends_error(self):
        svc = _make_service()
        ws = _ws()
        msg = Message(MessageType.PING, {})
        await svc.handle_protocol_message(ws, msg.to_json())
        ws.send_text.assert_awaited_once()
        payload = json.loads(ws.send_text.call_args[0][0])
        assert payload["type"] == MessageType.ERROR.value

    async def test_known_message_type_dispatches_to_handler(self):
        svc = _make_service()
        ws = _ws()
        await svc.add_client(ws, "c1", {"user_id": 1, "username": "Alice", "role": "player"})
        ws.send_text.reset_mock()

        svc.server_protocol.handlers = {MessageType.PING: AsyncMock()}
        svc.server_protocol.handle_client = AsyncMock()

        msg = Message(MessageType.PING, {})
        await svc.handle_protocol_message(ws, msg.to_json())
        svc.server_protocol.handle_client.assert_awaited_once()

    async def test_unknown_message_type_sends_error(self):
        svc = _make_service()
        ws = _ws()
        await svc.add_client(ws, "c1", {"user_id": 1, "username": "Alice", "role": "player"})
        ws.send_text.reset_mock()

        svc.server_protocol.handlers = {}
        msg = Message(MessageType.PING, {})
        await svc.handle_protocol_message(ws, msg.to_json())
        ws.send_text.assert_awaited_once()
        payload = json.loads(ws.send_text.call_args[0][0])
        assert payload["type"] == MessageType.ERROR.value


# ---------------------------------------------------------------------------
# broadcast_to_session / broadcast_filtered / send_to_client
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
class TestBroadcast:
    async def _setup_two_clients(self):
        svc = _make_service()
        ws1, ws2 = _ws(), _ws()
        await svc.add_client(ws1, "c1", {"user_id": 1, "username": "Alice", "role": "owner"})
        await svc.add_client(ws2, "c2", {"user_id": 2, "username": "Bob", "role": "player"})
        ws1.send_text.reset_mock()
        ws2.send_text.reset_mock()
        return svc, ws1, ws2

    async def test_broadcast_reaches_all_except_sender(self):
        svc, ws1, ws2 = await self._setup_two_clients()
        await svc.broadcast_to_session(Message(MessageType.PING, {}), exclude_client="c1")
        ws1.send_text.assert_not_awaited()
        ws2.send_text.assert_awaited_once()

    async def test_broadcast_filtered_skips_hidden_layer(self):
        svc, ws1, ws2 = await self._setup_two_clients()
        # dungeon_master layer not visible to "player"
        await svc.broadcast_filtered(
            Message(MessageType.PING, {}), "dungeon_master", exclude_client=None
        )
        ws1.send_text.assert_awaited_once()  # owner can see DM layer
        ws2.send_text.assert_not_awaited()  # player cannot

    async def test_send_to_client_delivers_message(self):
        svc, ws1, _ = await self._setup_two_clients()
        await svc.send_to_client(Message(MessageType.PING, {}), "c1")
        ws1.send_text.assert_awaited_once()

    async def test_send_to_unknown_client_logs_warning(self):
        svc = _make_service()
        # Should not raise
        await svc.send_to_client(Message(MessageType.PING, {}), "nobody")


# ---------------------------------------------------------------------------
# get_session_stats / has_clients / auto_save
# ---------------------------------------------------------------------------

class TestSessionUtils:
    def test_stats_reflect_connected_clients(self):
        svc = _make_service()
        ws = _ws()
        svc.clients["c1"] = ws
        svc.client_info["c1"] = {"username": "Alice", "connected_at": 0.0, "last_ping": 0.0}
        stats = svc.get_session_stats()
        assert stats["connected_clients"] == 1
        assert "c1" in stats["client_ids"]

    def test_has_clients_false_when_empty(self):
        svc = _make_service()
        assert svc.has_clients() is False

    def test_has_clients_true_when_connected(self):
        svc = _make_service()
        svc.clients["c1"] = _ws()
        assert svc.has_clients() is True

    def test_auto_save_skips_when_no_db(self):
        svc = _make_service()
        svc.auto_save()  # should not raise

    def test_force_save_returns_false_without_db(self):
        svc = _make_service()
        assert svc.force_save() is False
