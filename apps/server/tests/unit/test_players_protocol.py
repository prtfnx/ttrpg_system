"""
Tests for _PlayersMixin protocol handlers.

Focus: user-visible behaviour — correct response types, permission gates,
and validation errors. Implementation details are intentionally not asserted.
"""
from unittest.mock import AsyncMock, MagicMock

import pytest
from core_table.protocol import Message, MessageType
from service.protocol.players import _PlayersMixin


# ---------------------------------------------------------------------------
# Stub — minimal concrete class satisfying _ProtocolBase interface
# ---------------------------------------------------------------------------

class _ProtoStub(_PlayersMixin):
    def __init__(self, role="owner", user_id=1, client_id="c1"):
        self._user_id = user_id
        self.session_manager = MagicMock()
        self.session_manager.client_info = {client_id: {"role": role, "username": "tester"}}
        self.clients = {}
        self._rules_cache = {}

    # ── _ProtocolBase stubs ──────────────────────────────────────────────────
    def _get_session_id(self, msg): return 1
    def _get_session_code(self, msg=None): return "TST"
    def _get_user_id(self, msg, client_id=None): return self._user_id

    async def broadcast_to_session(self, message, client_id): pass
    async def broadcast_filtered(self, message, layer, client_id): pass
    async def send_to_client(self, message, client_id): pass
    async def _broadcast_error(self, client_id, error_message): pass
    async def _can_control_sprite(self, sprite_id, user_id): return True
    async def ensure_assets_in_r2(self, table_data, session_code, user_id): return table_data
    async def add_asset_hashes_to_table(self, table_data, session_code, user_id): return table_data
    async def _get_player_active_table(self, user_id, session_code): return None
    async def _set_player_active_table(self, user_id, session_code, table_id): return True


# ---------------------------------------------------------------------------
# handle_player_list_request
# ---------------------------------------------------------------------------

@pytest.mark.unit
@pytest.mark.asyncio
class TestPlayerListRequest:
    async def test_returns_players_from_session_manager(self):
        proto = _ProtoStub()
        proto.session_manager.get_session_players.return_value = [
            {"user_id": 1, "username": "Alice"},
            {"user_id": 2, "username": "Bob"},
        ]
        msg = Message(MessageType.PLAYER_LIST_REQUEST, {"session_code": "TST"})
        resp = await proto.handle_player_list_request(msg, "c1")
        assert resp.type == MessageType.PLAYER_LIST_RESPONSE
        assert resp.data["count"] == 2
        assert len(resp.data["players"]) == 2

    async def test_no_session_manager_returns_empty_list(self):
        proto = _ProtoStub()
        proto.session_manager = None
        msg = Message(MessageType.PLAYER_LIST_REQUEST, {})
        resp = await proto.handle_player_list_request(msg, "c1")
        assert resp.type == MessageType.PLAYER_LIST_RESPONSE
        assert resp.data["players"] == []
        assert resp.data["count"] == 0

    async def test_session_code_echoed_in_response(self):
        proto = _ProtoStub()
        proto.session_manager.get_session_players.return_value = []
        msg = Message(MessageType.PLAYER_LIST_REQUEST, {"session_code": "ABC"})
        resp = await proto.handle_player_list_request(msg, "c1")
        assert resp.data["session_code"] == "ABC"


# ---------------------------------------------------------------------------
# handle_player_kick_request
# ---------------------------------------------------------------------------

@pytest.mark.unit
@pytest.mark.asyncio
class TestPlayerKickRequest:
    async def test_no_data_returns_error(self):
        proto = _ProtoStub()
        msg = Message(MessageType.PLAYER_KICK_REQUEST, None)
        resp = await proto.handle_player_kick_request(msg, "c1")
        assert resp.type == MessageType.ERROR

    async def test_missing_player_id_and_username_returns_error(self):
        proto = _ProtoStub()
        msg = Message(MessageType.PLAYER_KICK_REQUEST, {"reason": "test"})
        resp = await proto.handle_player_kick_request(msg, "c1")
        assert resp.type == MessageType.ERROR
        assert "required" in resp.data["error"].lower()

    async def test_player_role_cannot_kick(self):
        proto = _ProtoStub(role="player")
        msg = Message(MessageType.PLAYER_KICK_REQUEST, {"player_id": 2, "session_code": "TST"})
        resp = await proto.handle_player_kick_request(msg, "c1")
        assert resp.type == MessageType.ERROR
        assert "permission" in resp.data["error"].lower()

    async def test_owner_kick_returns_kick_response(self):
        proto = _ProtoStub(role="owner")
        proto.session_manager.kick_player = AsyncMock(return_value=True)
        msg = Message(MessageType.PLAYER_KICK_REQUEST, {
            "player_id": 2, "username": "Bob", "session_code": "TST"
        })
        resp = await proto.handle_player_kick_request(msg, "c1")
        assert resp.type == MessageType.PLAYER_KICK_RESPONSE
        assert resp.data["success"] is True
        assert resp.data["kicked_player"] == "Bob"

    async def test_kick_failure_returns_error(self):
        proto = _ProtoStub(role="owner")
        proto.session_manager.kick_player = AsyncMock(return_value=False)
        msg = Message(MessageType.PLAYER_KICK_REQUEST, {"player_id": 2, "session_code": "TST"})
        resp = await proto.handle_player_kick_request(msg, "c1")
        assert resp.type == MessageType.ERROR


# ---------------------------------------------------------------------------
# handle_player_ban_request
# ---------------------------------------------------------------------------

@pytest.mark.unit
@pytest.mark.asyncio
class TestPlayerBanRequest:
    async def test_no_data_returns_error(self):
        proto = _ProtoStub()
        msg = Message(MessageType.PLAYER_BAN_REQUEST, None)
        resp = await proto.handle_player_ban_request(msg, "c1")
        assert resp.type == MessageType.ERROR

    async def test_missing_target_returns_error(self):
        proto = _ProtoStub()
        msg = Message(MessageType.PLAYER_BAN_REQUEST, {"reason": "test"})
        resp = await proto.handle_player_ban_request(msg, "c1")
        assert resp.type == MessageType.ERROR

    async def test_player_role_cannot_ban(self):
        proto = _ProtoStub(role="player")
        msg = Message(MessageType.PLAYER_BAN_REQUEST, {"player_id": 2})
        resp = await proto.handle_player_ban_request(msg, "c1")
        assert resp.type == MessageType.ERROR
        assert "permission" in resp.data["error"].lower()

    async def test_owner_ban_returns_ban_response(self):
        proto = _ProtoStub(role="owner")
        proto.session_manager.ban_player = AsyncMock(return_value=True)
        msg = Message(MessageType.PLAYER_BAN_REQUEST, {
            "player_id": 2, "username": "BadPlayer", "session_code": "TST"
        })
        resp = await proto.handle_player_ban_request(msg, "c1")
        assert resp.type == MessageType.PLAYER_BAN_RESPONSE
        assert resp.data["success"] is True
        assert resp.data["banned_player"] == "BadPlayer"


# ---------------------------------------------------------------------------
# handle_connection_status_request
# ---------------------------------------------------------------------------

@pytest.mark.unit
@pytest.mark.asyncio
class TestConnectionStatusRequest:
    async def test_with_session_manager_returns_connected(self):
        proto = _ProtoStub()
        proto.session_manager.get_connection_status.return_value = {"latency": 10}
        msg = Message(MessageType.CONNECTION_STATUS_REQUEST, {"session_code": "TST"})
        resp = await proto.handle_connection_status_request(msg, "c1")
        assert resp.type == MessageType.CONNECTION_STATUS_RESPONSE
        assert resp.data["connected"] is True

    async def test_no_session_manager_returns_disconnected(self):
        proto = _ProtoStub()
        proto.session_manager = None
        msg = Message(MessageType.CONNECTION_STATUS_REQUEST, {})
        resp = await proto.handle_connection_status_request(msg, "c1")
        assert resp.type == MessageType.CONNECTION_STATUS_RESPONSE
        assert resp.data["connected"] is False


# ---------------------------------------------------------------------------
# handle_player_action
# ---------------------------------------------------------------------------

@pytest.mark.unit
@pytest.mark.asyncio
class TestPlayerAction:
    async def test_no_data_returns_error(self):
        proto = _ProtoStub()
        msg = Message(MessageType.PLAYER_ACTION, None)
        resp = await proto.handle_player_action(msg, "c1")
        assert resp.type == MessageType.ERROR

    async def test_returns_action_response_with_type(self):
        proto = _ProtoStub()
        msg = Message(MessageType.PLAYER_ACTION, {"action_type": "move", "action_data": {}})
        resp = await proto.handle_player_action(msg, "c1")
        assert resp.type == MessageType.PLAYER_ACTION_RESPONSE
        assert resp.data["action_type"] == "move"


# ---------------------------------------------------------------------------
# handle_player_ready / handle_player_unready
# ---------------------------------------------------------------------------

@pytest.mark.unit
@pytest.mark.asyncio
class TestPlayerReadyState:
    async def test_ready_returns_success(self):
        proto = _ProtoStub()
        resp = await proto.handle_player_ready(Message(MessageType.PLAYER_READY, {}), "c1")
        assert resp.type == MessageType.SUCCESS

    async def test_unready_returns_success(self):
        proto = _ProtoStub()
        resp = await proto.handle_player_unready(Message(MessageType.PLAYER_UNREADY, {}), "c1")
        assert resp.type == MessageType.SUCCESS

    async def test_ready_sets_client_flag(self):
        proto = _ProtoStub()
        await proto.handle_player_ready(Message(MessageType.PLAYER_READY, {}), "c1")
        assert proto.clients["c1"]["ready"] is True

    async def test_unready_clears_client_flag(self):
        proto = _ProtoStub()
        proto.clients["c1"] = {"ready": True}
        await proto.handle_player_unready(Message(MessageType.PLAYER_UNREADY, {}), "c1")
        assert proto.clients["c1"]["ready"] is False


# ---------------------------------------------------------------------------
# handle_player_status
# ---------------------------------------------------------------------------

@pytest.mark.unit
@pytest.mark.asyncio
class TestPlayerStatus:
    async def test_unknown_client_returns_error(self):
        proto = _ProtoStub()
        msg = Message(MessageType.PLAYER_STATUS, {"client_id": "unknown"})
        resp = await proto.handle_player_status(msg, "c1")
        assert resp.type == MessageType.ERROR

    async def test_known_client_returns_status(self):
        proto = _ProtoStub()
        proto.clients["c1"] = {"ready": True}
        # No data → defaults to own client_id
        resp = await proto.handle_player_status(Message(MessageType.PLAYER_STATUS, None), "c1")
        assert resp.type == MessageType.PLAYER_STATUS

    async def test_status_data_contains_client_id(self):
        proto = _ProtoStub()
        proto.clients["c1"] = {"ready": False}
        resp = await proto.handle_player_status(Message(MessageType.PLAYER_STATUS, None), "c1")
        assert resp.data["client_id"] == "c1"


# ---------------------------------------------------------------------------
# handle_file_data
# ---------------------------------------------------------------------------

@pytest.mark.unit
@pytest.mark.asyncio
class TestFileData:
    async def test_no_data_returns_error(self):
        proto = _ProtoStub()
        msg = Message(MessageType.FILE_DATA, None)
        resp = await proto.handle_file_data(msg, "c1")
        assert resp.type == MessageType.ERROR

    async def test_missing_file_id_returns_error(self):
        proto = _ProtoStub()
        msg = Message(MessageType.FILE_DATA, {"chunk_data": "abc=="})
        resp = await proto.handle_file_data(msg, "c1")
        assert resp.type == MessageType.ERROR

    async def test_missing_chunk_data_returns_error(self):
        proto = _ProtoStub()
        msg = Message(MessageType.FILE_DATA, {"file_id": "f1"})
        resp = await proto.handle_file_data(msg, "c1")
        assert resp.type == MessageType.ERROR

    async def test_valid_chunk_acknowledged(self):
        proto = _ProtoStub()
        msg = Message(MessageType.FILE_DATA, {
            "file_id": "f1", "chunk_data": "abc==", "chunk_index": 0, "total_chunks": 3
        })
        resp = await proto.handle_file_data(msg, "c1")
        assert resp.type == MessageType.SUCCESS
        assert resp.data["file_id"] == "f1"
