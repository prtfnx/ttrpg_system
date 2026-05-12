"""
Tests for the _SpritesMixin protocol handlers.

Focus: user-visible behaviour — correct response types, permission gates,
validation errors, and broadcast calls. Implementation details (DB rows,
WASM state) are intentionally not asserted.
"""
from unittest.mock import AsyncMock, MagicMock

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
        resp = await proto.handle_create_sprite(Message(MessageType.SPRITE_CREATE, {}), "c1")
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


# ---------------------------------------------------------------------------
# handle_scale_sprite
# ---------------------------------------------------------------------------

@pytest.mark.unit
class TestScaleSprite:
    async def test_missing_data_returns_error(self):
        proto = _ProtoStub(role="owner")
        resp = await proto.handle_scale_sprite(Message(MessageType.SPRITE_SCALE, {}), "c1")
        assert resp.type == MessageType.ERROR

    async def test_missing_dimensions_returns_error(self):
        proto = _ProtoStub(role="owner")
        msg = Message(MessageType.SPRITE_SCALE, {"sprite_id": "sp-1", "table_id": "t1"})
        resp = await proto.handle_scale_sprite(msg, "c1")
        assert resp.type == MessageType.ERROR

    async def test_spectator_cannot_scale(self):
        proto = _ProtoStub(role="spectator")
        msg = Message(MessageType.SPRITE_SCALE, {"sprite_id": "sp-1", "width": 2.0, "height": 2.0})
        resp = await proto.handle_scale_sprite(msg, "c1")
        assert resp.type == MessageType.ERROR
        assert "spectator" in resp.data["error"].lower()

    async def test_successful_scale_returns_sprite_response(self):
        proto = _ProtoStub(role="owner")
        proto.actions.update_sprite = AsyncMock(return_value=_ok_result())
        msg = Message(MessageType.SPRITE_SCALE, {"sprite_id": "sp-1", "table_id": "t1", "width": 2.0, "height": 3.0})
        resp = await proto.handle_scale_sprite(msg, "c1")
        assert resp.type == MessageType.SPRITE_RESPONSE
        assert resp.data["width"] == 2.0

    async def test_failed_scale_returns_error(self):
        proto = _ProtoStub(role="owner")
        proto.actions.update_sprite = AsyncMock(return_value=_fail_result("no such sprite"))
        msg = Message(MessageType.SPRITE_SCALE, {"sprite_id": "sp-1", "table_id": "t1", "width": 1.0, "height": 1.0})
        resp = await proto.handle_scale_sprite(msg, "c1")
        assert resp.type == MessageType.ERROR


# ---------------------------------------------------------------------------
# handle_rotate_sprite
# ---------------------------------------------------------------------------

@pytest.mark.unit
class TestRotateSprite:
    async def test_missing_rotation_returns_error(self):
        proto = _ProtoStub(role="owner")
        msg = Message(MessageType.SPRITE_ROTATE, {"sprite_id": "sp-1"})
        resp = await proto.handle_rotate_sprite(msg, "c1")
        assert resp.type == MessageType.ERROR

    async def test_spectator_cannot_rotate(self):
        proto = _ProtoStub(role="spectator")
        msg = Message(MessageType.SPRITE_ROTATE, {"sprite_id": "sp-1", "rotation": 45.0})
        resp = await proto.handle_rotate_sprite(msg, "c1")
        assert resp.type == MessageType.ERROR

    async def test_successful_rotate_returns_sprite_response(self):
        proto = _ProtoStub(role="owner")
        proto.actions.rotate_sprite = AsyncMock(return_value=_ok_result())
        msg = Message(MessageType.SPRITE_ROTATE, {"sprite_id": "sp-1", "table_id": "t1", "rotation": 90.0})
        resp = await proto.handle_rotate_sprite(msg, "c1")
        assert resp.type == MessageType.SPRITE_RESPONSE
        assert resp.data["rotation"] == 90.0

    async def test_failed_rotate_returns_error(self):
        proto = _ProtoStub(role="owner")
        proto.actions.rotate_sprite = AsyncMock(return_value=_fail_result())
        msg = Message(MessageType.SPRITE_ROTATE, {"sprite_id": "sp-1", "table_id": "t1", "rotation": 0.0})
        resp = await proto.handle_rotate_sprite(msg, "c1")
        assert resp.type == MessageType.ERROR


# ---------------------------------------------------------------------------
# preview handlers (no DB write, just broadcast)
# ---------------------------------------------------------------------------

@pytest.mark.unit
class TestSpritePreviewHandlers:
    async def test_drag_preview_broadcasts(self):
        proto = _ProtoStub(role="owner")
        broadcasts = []
        proto.broadcast_to_session = AsyncMock(side_effect=lambda m, c: broadcasts.append(m))
        msg = Message(MessageType.SPRITE_DRAG_PREVIEW, {"id": "sp-1", "x": 5.0, "y": 3.0})
        await proto.handle_sprite_drag_preview(msg, "c1")
        assert len(broadcasts) == 1
        assert broadcasts[0].type == MessageType.SPRITE_DRAG_PREVIEW

    async def test_drag_preview_missing_coords_is_noop(self):
        proto = _ProtoStub(role="owner")
        proto.broadcast_to_session = AsyncMock()
        msg = Message(MessageType.SPRITE_DRAG_PREVIEW, {"id": "sp-1"})
        await proto.handle_sprite_drag_preview(msg, "c1")
        proto.broadcast_to_session.assert_not_called()

    async def test_resize_preview_broadcasts(self):
        proto = _ProtoStub(role="owner")
        broadcasts = []
        proto.broadcast_to_session = AsyncMock(side_effect=lambda m, c: broadcasts.append(m))
        msg = Message(MessageType.SPRITE_RESIZE_PREVIEW, {"id": "sp-1", "width": 2.0, "height": 2.0})
        await proto.handle_sprite_resize_preview(msg, "c1")
        assert broadcasts[0].type == MessageType.SPRITE_RESIZE_PREVIEW

    async def test_rotate_preview_broadcasts(self):
        proto = _ProtoStub(role="owner")
        broadcasts = []
        proto.broadcast_to_session = AsyncMock(side_effect=lambda m, c: broadcasts.append(m))
        msg = Message(MessageType.SPRITE_ROTATE_PREVIEW, {"id": "sp-1", "rotation": 45.0})
        await proto.handle_sprite_rotate_preview(msg, "c1")
        assert broadcasts[0].type == MessageType.SPRITE_ROTATE_PREVIEW

    async def test_player_without_ownership_drag_preview_is_silent(self):
        proto = _ProtoStub(role="player")
        proto._can_control_sprite = AsyncMock(return_value=False)
        proto.broadcast_to_session = AsyncMock()
        msg = Message(MessageType.SPRITE_DRAG_PREVIEW, {"id": "sp-other", "x": 0.0, "y": 0.0})
        await proto.handle_sprite_drag_preview(msg, "c1")
        proto.broadcast_to_session.assert_not_called()


# ---------------------------------------------------------------------------
# handle_sprite_update
# ---------------------------------------------------------------------------

@pytest.mark.unit
class TestSpriteUpdate:
    async def test_missing_data_returns_error(self):
        proto = _ProtoStub(role="owner")
        resp = await proto.handle_sprite_update(Message(MessageType.SPRITE_UPDATE, {}), "c1")
        assert resp.type == MessageType.ERROR

    async def test_missing_sprite_id_returns_error(self):
        proto = _ProtoStub(role="owner")
        msg = Message(MessageType.SPRITE_UPDATE, {"table_id": "t1", "hp": 10})
        resp = await proto.handle_sprite_update(msg, "c1")
        assert resp.type == MessageType.ERROR

    async def test_player_without_ownership_denied(self):
        proto = _ProtoStub(role="player")
        proto._can_control_sprite = AsyncMock(return_value=False)
        msg = Message(MessageType.SPRITE_UPDATE, {"sprite_id": "sp-1", "hp": 5})
        resp = await proto.handle_sprite_update(msg, "c1")
        assert resp.type == MessageType.ERROR
        assert "permission" in resp.data["error"].lower()

    async def test_dm_can_update_any_sprite(self):
        proto = _ProtoStub(role="owner")
        proto.actions.update_sprite = AsyncMock(return_value=_ok_result())
        msg = Message(MessageType.SPRITE_UPDATE, {"sprite_id": "sp-1", "table_id": "t1", "hp": 5})
        resp = await proto.handle_sprite_update(msg, "c1")
        assert resp.type != MessageType.ERROR

    async def test_hp_update_broadcasts_sprite_update(self):
        """HP change is applied and broadcast to session so other clients sync."""
        proto = _ProtoStub(role="owner")
        proto.actions.update_sprite = AsyncMock(return_value=_ok_result())
        proto.actions.update_character = AsyncMock(return_value=_ok_result())
        broadcasts = []
        proto.broadcast_to_session = AsyncMock(side_effect=lambda m, c: broadcasts.append(m))

        msg = Message(MessageType.SPRITE_UPDATE, {
            "sprite_id": "sp-1", "table_id": "t1", "hp": 7, "character_id": "char-1",
        })
        resp = await proto.handle_sprite_update(msg, "c1")

        assert resp.type == MessageType.SUCCESS
        # Should have broadcasted at least one SPRITE_UPDATE
        sprite_broadcasts = [m for m in broadcasts if m.type == MessageType.SPRITE_UPDATE]
        assert sprite_broadcasts, "Expected a SPRITE_UPDATE broadcast"
        assert sprite_broadcasts[0].data["updates"]["hp"] == 7

    async def test_controlled_by_change_ignored_for_non_dm(self):
        """Players cannot reassign controlled_by — field is silently dropped."""
        proto = _ProtoStub(role="player")
        proto._can_control_sprite = AsyncMock(return_value=True)
        proto.actions.update_sprite = AsyncMock(return_value=_ok_result())
        broadcasts = []
        proto.broadcast_to_session = AsyncMock(side_effect=lambda m, c: broadcasts.append(m))

        msg = Message(MessageType.SPRITE_UPDATE, {
            "sprite_id": "sp-1", "table_id": "t1", "controlled_by": "[99]",
        })
        await proto.handle_sprite_update(msg, "c1")

        # update_sprite must NOT have been called with controlled_by
        if proto.actions.update_sprite.called:
            call_kwargs = proto.actions.update_sprite.call_args[1]
            assert "controlled_by" not in call_kwargs


# ---------------------------------------------------------------------------
# handle_move_sprite — success and failure
# ---------------------------------------------------------------------------

@pytest.mark.unit
class TestMoveSpriteResult:
    """Success path broadcasts SPRITE_MOVE; failure returns ERROR."""

    def _proto(self, role="owner"):
        proto = _ProtoStub(role=role)
        # No table → movement validation skipped
        proto.table_manager.tables_id = {}
        proto.table_manager.tables = {}
        return proto

    async def test_successful_move_broadcasts_and_returns_sprite_response(self):
        proto = self._proto()
        proto.actions.move_sprite = AsyncMock(return_value=_ok_result())
        broadcasts = []
        proto.broadcast_to_session = AsyncMock(side_effect=lambda m, c: broadcasts.append(m))

        msg = Message(MessageType.SPRITE_MOVE, {
            "sprite_id": "sp-1", "table_id": "t1",
            "from": {"x": 0, "y": 0}, "to": {"x": 50, "y": 50},
        })
        resp = await proto.handle_move_sprite(msg, "c1")

        assert resp.type == MessageType.SPRITE_RESPONSE
        assert resp.data["operation"] == "move"
        assert any(m.type == MessageType.SPRITE_MOVE for m in broadcasts)

    async def test_failed_move_returns_error(self):
        proto = self._proto()
        proto.actions.move_sprite = AsyncMock(return_value=_fail_result("wall blocked"))

        msg = Message(MessageType.SPRITE_MOVE, {
            "sprite_id": "sp-1", "table_id": "t1",
            "from": {"x": 0, "y": 0}, "to": {"x": 50, "y": 50},
        })
        resp = await proto.handle_move_sprite(msg, "c1")

        assert resp.type == MessageType.ERROR

    async def test_action_id_included_in_confirmation(self):
        """action_id echoed back for client-side confirmation matching."""
        proto = self._proto()
        proto.actions.move_sprite = AsyncMock(return_value=_ok_result())
        proto.broadcast_to_session = AsyncMock()

        msg = Message(MessageType.SPRITE_MOVE, {
            "sprite_id": "sp-1", "table_id": "t1",
            "from": {"x": 0, "y": 0}, "to": {"x": 10, "y": 10},
            "action_id": "act-99",
        })
        resp = await proto.handle_move_sprite(msg, "c1")

        assert resp.data.get("action_id") == "act-99"

    async def test_player_blocked_when_not_owner(self):
        proto = self._proto(role="player")
        proto._can_control_sprite = AsyncMock(return_value=False)

        msg = Message(MessageType.SPRITE_MOVE, {
            "sprite_id": "sp-other", "table_id": "t1",
            "from": {"x": 0, "y": 0}, "to": {"x": 10, "y": 10},
        })
        resp = await proto.handle_move_sprite(msg, "c1")

        assert resp.type == MessageType.ERROR
        assert "control" in resp.data["error"].lower()


# ---------------------------------------------------------------------------
# handle_compendium_sprite_add
# ---------------------------------------------------------------------------

@pytest.mark.unit
class TestCompendiumSpriteAdd:
    def _proto(self, role="owner"):
        proto = _ProtoStub(role=role)
        proto.broadcast_to_session = AsyncMock()
        return proto

    async def test_missing_data_returns_error(self):
        proto = self._proto()
        resp = await proto.handle_compendium_sprite_add(Message(MessageType.SPRITE_CREATE, {}), "c1")
        assert resp.type == MessageType.ERROR

    async def test_spectator_blocked(self):
        proto = self._proto(role="spectator")
        msg = Message(MessageType.SPRITE_CREATE, {
            "sprite_data": {"x": 0, "y": 0},
        })
        resp = await proto.handle_compendium_sprite_add(msg, "c1")
        assert resp.type == MessageType.ERROR
        assert "permission" in resp.data["error"].lower()

    async def test_missing_sprite_data_returns_error(self):
        proto = self._proto()
        msg = Message(MessageType.SPRITE_CREATE, {"table_id": "t1"})
        resp = await proto.handle_compendium_sprite_add(msg, "c1")
        assert resp.type == MessageType.ERROR

    async def test_success_broadcasts_and_returns_sprite_response(self):
        proto = self._proto()
        proto.actions.create_sprite_from_data = AsyncMock(return_value=_ok_result(
            sprite_data={"sprite_id": "sp-new", "x": 5, "y": 5}
        ))

        msg = Message(MessageType.SPRITE_CREATE, {
            "table_id": "t1",
            "sprite_data": {"x": 5, "y": 5, "client_temp_id": "tmp-1"},
        })
        resp = await proto.handle_compendium_sprite_add(msg, "c1")

        assert resp.type == MessageType.SPRITE_RESPONSE
        assert resp.data["sprite_id"] == "sp-new"
        proto.broadcast_to_session.assert_awaited_once()


# ---------------------------------------------------------------------------
# handle_compendium_sprite_remove
# ---------------------------------------------------------------------------

@pytest.mark.unit
class TestCompendiumSpriteRemove:
    async def test_missing_sprite_id_returns_error(self):
        proto = _ProtoStub()
        msg = Message(MessageType.SPRITE_REMOVE, {"table_id": "t1"})
        resp = await proto.handle_compendium_sprite_remove(msg, "c1")
        assert resp.type == MessageType.ERROR
        assert "sprite_id" in resp.data["error"].lower()

    async def test_success_broadcasts_and_returns_sprite_response(self):
        proto = _ProtoStub()
        proto.actions.delete_sprite = AsyncMock(return_value=_ok_result())
        broadcasts = []
        proto.broadcast_to_session = AsyncMock(side_effect=lambda m, c: broadcasts.append(m))

        msg = Message(MessageType.SPRITE_REMOVE, {"sprite_id": "sp-1", "table_id": "t1"})
        resp = await proto.handle_compendium_sprite_remove(msg, "c1")

        assert resp.type == MessageType.SPRITE_RESPONSE
        assert resp.data["operation"] == "delete"
        assert any(m.type == MessageType.SPRITE_UPDATE for m in broadcasts)

    async def test_failed_delete_returns_error(self):
        proto = _ProtoStub()
        proto.actions.delete_sprite = AsyncMock(return_value=_fail_result("not found"))

        msg = Message(MessageType.SPRITE_REMOVE, {"sprite_id": "sp-x", "table_id": "t1"})
        resp = await proto.handle_compendium_sprite_remove(msg, "c1")

        assert resp.type == MessageType.ERROR


# ---------------------------------------------------------------------------
# handle_sprite_request
# ---------------------------------------------------------------------------

@pytest.mark.unit
class TestSpriteRequest:
    async def test_missing_ids_returns_error(self):
        proto = _ProtoStub()
        msg = Message(MessageType.SPRITE_REQUEST, {"table_id": "t1"})  # no sprite_id
        resp = await proto.handle_sprite_request(msg, "c1")
        assert resp.type == MessageType.ERROR

    async def test_table_not_found_returns_error(self):
        proto = _ProtoStub()
        proto.table_manager.get_table = MagicMock(return_value=None)

        msg = Message(MessageType.SPRITE_REQUEST, {"sprite_id": "sp-1", "table_id": "t1"})
        resp = await proto.handle_sprite_request(msg, "c1")

        assert resp.type == MessageType.ERROR
        assert "table" in resp.data["error"].lower()

    async def test_sprite_not_found_returns_error(self):
        proto = _ProtoStub()
        table_mock = MagicMock()
        table_mock.layers = {}  # empty, no sprites
        proto.table_manager.get_table = MagicMock(return_value=table_mock)

        msg = Message(MessageType.SPRITE_REQUEST, {"sprite_id": "sp-1", "table_id": "t1"})
        resp = await proto.handle_sprite_request(msg, "c1")

        assert resp.type == MessageType.ERROR
        assert "not found" in resp.data["error"].lower()

    async def test_sprite_found_returns_sprite_data(self):
        proto = _ProtoStub()
        sprite_mock = MagicMock()
        sprite_mock.sprite_id = "sp-1"
        sprite_mock.to_dict.return_value = {"sprite_id": "sp-1", "x": 10, "y": 20}

        table_mock = MagicMock()
        table_mock.layers = {"tokens": [sprite_mock]}
        proto.table_manager.get_table = MagicMock(return_value=table_mock)

        msg = Message(MessageType.SPRITE_REQUEST, {"sprite_id": "sp-1", "table_id": "t1"})
        resp = await proto.handle_sprite_request(msg, "c1")

        assert resp.type == MessageType.SPRITE_DATA
        assert resp.data["sprite_data"]["sprite_id"] == "sp-1"
