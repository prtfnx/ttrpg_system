"""
Tests for the _SpritesMixin protocol handlers.

Focus: user-visible behaviour — correct response types, permission gates,
validation errors, and broadcast calls. Implementation details (DB rows,
WASM state) are intentionally not asserted.
"""
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from core_table.protocol import Message, MessageType

from service.protocol.sprites import _SpritesMixin


# ---------------------------------------------------------------------------
# Stub — minimal concrete class satisfying _ProtocolBase interface
# ---------------------------------------------------------------------------

class _ProtoStub(_SpritesMixin):
    def __init__(self, role="owner", user_id=1):
        self._role = role
        self._user_id = user_id
        self.actions = MagicMock()
        self.table_manager = MagicMock()
        self.session_manager = MagicMock()
        self.clients = {}
        self._rules_cache = {}

    # ── _ProtocolBase stubs ──────────────────────────────────────────────────
    def _get_client_role(self, client_id):
        return self._role

    def _get_session_id(self, msg):
        return 1

    def _get_session_code(self, msg=None):
        return "TST"

    def _get_user_id(self, msg, client_id=None):
        return self._user_id

    def _get_client_info(self, client_id):
        return {"user_id": self._user_id, "role": self._role}

    async def broadcast_to_session(self, message, client_id):
        pass

    async def broadcast_filtered(self, message, layer, client_id):
        pass

    async def send_to_client(self, message, client_id):
        pass

    async def _broadcast_error(self, client_id, error_message):
        pass

    async def _can_control_sprite(self, sprite_id, user_id):
        return True

    async def ensure_assets_in_r2(self, table_data, session_code, user_id):
        return table_data

    async def add_asset_hashes_to_table(self, table_data, session_code, user_id):
        return table_data

    async def _get_player_active_table(self, user_id, session_code):
        return None

    async def _set_player_active_table(self, user_id, session_code, table_id):
        return True


def _ok_result(**data):
    r = MagicMock()
    r.success = True
    r.data = data
    r.message = "ok"
    return r


def _fail_result(message="failed"):
    r = MagicMock()
    r.success = False
    r.data = None
    r.message = message
    return r


# ---------------------------------------------------------------------------
# handle_create_sprite
# ---------------------------------------------------------------------------

@pytest.mark.unit
class TestCreateSprite:
    """DM and players can create sprites; spectators and missing data cannot."""

    async def test_missing_data_returns_error(self):
        proto = _ProtoStub()
        resp = await proto.handle_create_sprite(Message(MessageType.SPRITE_CREATE, None), "c1")
        assert resp.type == MessageType.ERROR

    async def test_missing_sprite_data_field_returns_error(self):
        proto = _ProtoStub()
        msg = Message(MessageType.SPRITE_CREATE, {"table_id": "t1"})
        resp = await proto.handle_create_sprite(msg, "c1")
        assert resp.type == MessageType.ERROR
        assert "sprite data" in resp.data["error"].lower()

    async def test_spectator_cannot_create_sprite(self):
        proto = _ProtoStub(role="spectator")
        msg = Message(MessageType.SPRITE_CREATE, {"sprite_data": {"x": 0, "y": 0}})
        resp = await proto.handle_create_sprite(msg, "c1")
        assert resp.type == MessageType.ERROR
        assert "permission" in resp.data["error"].lower()

    async def test_player_blocked_from_dm_layer(self):
        proto = _ProtoStub(role="player")
        msg = Message(MessageType.SPRITE_CREATE, {
            "sprite_data": {"layer": "dungeon_master", "x": 0, "y": 0}
        })
        resp = await proto.handle_create_sprite(msg, "c1")
        assert resp.type == MessageType.ERROR

    async def test_successful_create_returns_sprite_response(self):
        proto = _ProtoStub(role="owner")
        proto.actions.create_sprite = AsyncMock(return_value=_ok_result(
            sprite_data={"sprite_id": "sp-1", "x": 10, "y": 20, "layer": "tokens"}
        ))
        msg = Message(MessageType.SPRITE_CREATE, {"sprite_data": {"x": 10, "y": 20, "layer": "tokens"}})
        resp = await proto.handle_create_sprite(msg, "c1")
        assert resp.type == MessageType.SPRITE_RESPONSE
        assert resp.data["sprite_id"] == "sp-1"

    async def test_failed_action_returns_error(self):
        proto = _ProtoStub(role="owner")
        proto.actions.create_sprite = AsyncMock(return_value=_fail_result())
        msg = Message(MessageType.SPRITE_CREATE, {"sprite_data": {"x": 0, "y": 0}})
        resp = await proto.handle_create_sprite(msg, "c1")
        assert resp.type == MessageType.ERROR

    async def test_character_id_is_canonicalised(self):
        """character_id at top-level data gets embedded into sprite_data."""
        proto = _ProtoStub(role="owner")
        captured = {}

        async def _capture(**kwargs):
            captured.update(kwargs.get("sprite_data", {}))
            return _ok_result(sprite_data={"sprite_id": "sp-x", "x": 0, "y": 0, "layer": "tokens"})

        proto.actions.create_sprite = _capture
        msg = Message(MessageType.SPRITE_CREATE, {
            "character_id": "char-42",
            "sprite_data": {"x": 0, "y": 0},
        })
        await proto.handle_create_sprite(msg, "c1")
        assert captured.get("character_id") == "char-42"


# ---------------------------------------------------------------------------
# handle_delete_sprite
# ---------------------------------------------------------------------------

@pytest.mark.unit
class TestDeleteSprite:
    """Only DMs can delete sprites; missing IDs are rejected."""

    async def test_player_cannot_delete_sprite(self):
        proto = _ProtoStub(role="player")
        msg = Message(MessageType.SPRITE_REMOVE, {"sprite_id": "sp-1"})
        resp = await proto.handle_delete_sprite(msg, "c1")
        assert resp.type == MessageType.ERROR
        assert "dm" in resp.data["error"].lower()

    async def test_missing_sprite_id_returns_error(self):
        proto = _ProtoStub(role="owner")
        msg = Message(MessageType.SPRITE_REMOVE, {"table_id": "t1"})
        resp = await proto.handle_delete_sprite(msg, "c1")
        assert resp.type == MessageType.ERROR

    async def test_successful_delete_returns_sprite_response(self):
        proto = _ProtoStub(role="owner")
        proto.actions.delete_sprite = AsyncMock(return_value=_ok_result())
        msg = Message(MessageType.SPRITE_REMOVE, {"sprite_id": "sp-1", "table_id": "t1"})
        resp = await proto.handle_delete_sprite(msg, "c1")
        assert resp.type == MessageType.SPRITE_RESPONSE
        assert resp.data["operation"] == "remove"

    async def test_failed_delete_returns_error(self):
        proto = _ProtoStub(role="owner")
        proto.actions.delete_sprite = AsyncMock(return_value=_fail_result("not found"))
        msg = Message(MessageType.SPRITE_REMOVE, {"sprite_id": "sp-x", "table_id": "t1"})
        resp = await proto.handle_delete_sprite(msg, "c1")
        assert resp.type == MessageType.ERROR


# ---------------------------------------------------------------------------
# handle_move_sprite
# ---------------------------------------------------------------------------

@pytest.mark.unit
class TestMoveSprite:
    """Spectators blocked; missing position fields rejected."""

    async def test_spectator_cannot_move_sprite(self):
        proto = _ProtoStub(role="spectator")
        msg = Message(MessageType.SPRITE_MOVE, {
            "sprite_id": "sp-1",
            "from": {"x": 0, "y": 0},
            "to": {"x": 10, "y": 10},
        })
        resp = await proto.handle_move_sprite(msg, "c1")
        assert resp.type == MessageType.ERROR

    async def test_missing_position_fields_returns_error(self):
        proto = _ProtoStub(role="dm")
        msg = Message(MessageType.SPRITE_MOVE, {"sprite_id": "sp-1"})
        resp = await proto.handle_move_sprite(msg, "c1")
        assert resp.type == MessageType.ERROR

    async def test_missing_sprite_id_returns_error(self):
        proto = _ProtoStub(role="dm")
        proto.table_manager.tables_id = {}
        proto.table_manager.tables = {}
        msg = Message(MessageType.SPRITE_MOVE, {
            "from": {"x": 0, "y": 0},
            "to": {"x": 10, "y": 10},
        })
        resp = await proto.handle_move_sprite(msg, "c1")
        assert resp.type == MessageType.ERROR
