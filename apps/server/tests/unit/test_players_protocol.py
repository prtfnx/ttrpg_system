"""
Tests for _PlayersMixin protocol handlers.

Focus: user-visible behaviour — correct response types, permission gates,
and validation errors. Implementation details are intentionally not asserted.
"""
from unittest.mock import AsyncMock, create_autospec

import pytest
from core_table.protocol import Message, MessageType
from service.game_session_protocol import GameSessionProtocolService
from service.protocol.players import _PlayersMixin

# ---------------------------------------------------------------------------
# Stub — minimal concrete class satisfying _ProtocolBase interface
# ---------------------------------------------------------------------------

class _ProtoStub(_PlayersMixin):
    def __init__(self, role="owner", user_id=1, client_id="c1"):
        self._user_id = user_id
        self.session_manager = create_autospec(
            GameSessionProtocolService,
            instance=True,
        )
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
            {
                "client_id": "c1",
                "user_id": 1,
                "username": "Alice",
                "role": "owner",
                "ready": True,
                "connected_at": 1.0,
                "last_ping": 2.0,
            },
            {
                "client_id": "c2",
                "user_id": 2,
                "username": "Bob",
                "role": "player",
                "ready": False,
                "connected_at": 3.0,
                "last_ping": 4.0,
            },
        ]
        msg = Message(MessageType.PLAYER_LIST_REQUEST, {})
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

    async def test_response_uses_authoritative_session_code(self):
        proto = _ProtoStub()
        proto.session_manager.get_session_players.return_value = []
        msg = Message(MessageType.PLAYER_LIST_REQUEST, {})
        resp = await proto.handle_player_list_request(msg, "c1")
        assert resp.data["session_code"] == "TST"


# ---------------------------------------------------------------------------
# handle_player_kick_request
# ---------------------------------------------------------------------------

@pytest.mark.unit
@pytest.mark.asyncio
class TestPlayerKickRequest:
    async def test_no_data_returns_error(self):
        proto = _ProtoStub()
        msg = Message(MessageType.PLAYER_KICK_REQUEST, {})
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
        msg = Message(MessageType.PLAYER_KICK_REQUEST, {"player_id": 2})
        resp = await proto.handle_player_kick_request(msg, "c1")
        assert resp.type == MessageType.ERROR
        assert "permission" in resp.data["error"].lower()

    async def test_owner_kick_returns_kick_response(self):
        proto = _ProtoStub(role="owner")
        proto.session_manager.kick_player.return_value = True
        msg = Message(MessageType.PLAYER_KICK_REQUEST, {
            "player_id": 2, "username": "Bob"
        })
        resp = await proto.handle_player_kick_request(msg, "c1")
        assert resp.type == MessageType.PLAYER_KICK_RESPONSE
        assert resp.data["success"] is True
        assert resp.data["kicked_player"] == "Bob"
        proto.session_manager.kick_player.assert_awaited_once_with(
            2,
            "Bob",
            "No reason provided",
            "c1",
        )

    async def test_kick_failure_returns_error(self):
        proto = _ProtoStub(role="owner")
        proto.session_manager.kick_player.return_value = False
        msg = Message(MessageType.PLAYER_KICK_REQUEST, {"player_id": 2})
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
        msg = Message(MessageType.PLAYER_BAN_REQUEST, {})
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
        proto.session_manager.ban_player.return_value = True
        msg = Message(MessageType.PLAYER_BAN_REQUEST, {
            "player_id": 2, "username": "BadPlayer"
        })
        resp = await proto.handle_player_ban_request(msg, "c1")
        assert resp.type == MessageType.PLAYER_BAN_RESPONSE
        assert resp.data["success"] is True
        assert resp.data["banned_player"] == "BadPlayer"
        proto.session_manager.ban_player.assert_awaited_once_with(
            2,
            "BadPlayer",
            "No reason provided",
            "permanent",
            "c1",
        )


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
        assert proto.session_manager.client_info["c1"]["ready"] is True
        assert isinstance(proto.session_manager.client_info["c1"]["last_action"], float)

    async def test_unready_clears_client_flag(self):
        proto = _ProtoStub()
        proto.session_manager.client_info["c1"]["ready"] = True
        await proto.handle_player_unready(Message(MessageType.PLAYER_UNREADY, {}), "c1")
        assert proto.session_manager.client_info["c1"]["ready"] is False

    @pytest.mark.parametrize(
        ("handler_name", "message_type", "expected_ready"),
        [
            ("handle_player_ready", MessageType.PLAYER_READY, True),
            ("handle_player_unready", MessageType.PLAYER_UNREADY, False),
        ],
    )
    async def test_broadcasts_normalized_status_change(
        self,
        handler_name,
        message_type,
        expected_ready,
    ):
        proto = _ProtoStub()
        proto.broadcast_to_session = AsyncMock()

        await getattr(proto, handler_name)(Message(message_type, {}), "c1")

        broadcast_call = proto.broadcast_to_session.await_args
        assert broadcast_call is not None
        broadcast, excluded_client_id = broadcast_call.args
        assert broadcast.type == MessageType.PLAYER_STATUS_CHANGED
        assert broadcast.data["client_id"] == "c1"
        assert broadcast.data["status"]["ready"] is expected_ready
        assert isinstance(broadcast.data["status"]["last_action"], float)
        assert excluded_client_id == "c1"

    async def test_unknown_client_does_not_create_phantom_readiness_state(self):
        proto = _ProtoStub()

        resp = await proto.handle_player_ready(
            Message(MessageType.PLAYER_READY, {}),
            "unknown",
        )

        assert resp.type == MessageType.ERROR
        assert "unknown" not in proto.session_manager.client_info


# ---------------------------------------------------------------------------
# handle_player_status_request
# ---------------------------------------------------------------------------

@pytest.mark.unit
@pytest.mark.asyncio
class TestPlayerStatusRequest:
    async def test_unknown_client_returns_error(self):
        proto = _ProtoStub()
        msg = Message(MessageType.PLAYER_STATUS_REQUEST, {"client_id": "unknown"})
        resp = await proto.handle_player_status_request(msg, "c1")
        assert resp.type == MessageType.ERROR

    async def test_known_client_returns_status(self):
        proto = _ProtoStub()
        proto.session_manager.client_info["c1"]["ready"] = True
        # No data → defaults to own client_id
        resp = await proto.handle_player_status_request(
            Message(MessageType.PLAYER_STATUS_REQUEST, {}),
            "c1",
        )
        assert resp.type == MessageType.PLAYER_STATUS_RESPONSE
        assert resp.data["status"] == {"ready": True}

    async def test_connected_client_defaults_to_not_ready(self):
        proto = _ProtoStub()
        resp = await proto.handle_player_status_request(
            Message(MessageType.PLAYER_STATUS_REQUEST, {}),
            "c1",
        )
        assert resp.data["client_id"] == "c1"
        assert resp.data["status"] == {"ready": False}

    async def test_status_returns_last_action_without_connection_metadata(self):
        proto = _ProtoStub()
        proto.session_manager.client_info["c1"].update({
            "connection_id": "private-connection-id",
            "last_action": 42.5,
            "ready": True,
        })

        resp = await proto.handle_player_status_request(
            Message(MessageType.PLAYER_STATUS_REQUEST, {}),
            "c1",
        )

        assert resp.data["status"] == {"ready": True, "last_action": 42.5}
