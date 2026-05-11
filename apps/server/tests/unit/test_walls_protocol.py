"""
Tests for _WallsMixin protocol handlers.

Focus: permission gates, validation errors, and correct response types.
actions is mocked — no real DB or wall storage.
"""
from unittest.mock import AsyncMock, MagicMock

import pytest
from core_table.protocol import Message, MessageType
from service.protocol.walls import _WallsMixin

# ---------------------------------------------------------------------------
# Stub
# ---------------------------------------------------------------------------

class _ProtoStub(_WallsMixin):
    def __init__(self, role="owner", user_id=1):
        self._role = role
        self._user_id = user_id
        self.actions = MagicMock()
        self.table_manager = MagicMock()
        self.clients = {}
        self._rules_cache = {}

    def _get_client_role(self, client_id): return self._role
    def _get_session_id(self, msg): return 1
    def _get_session_code(self, msg=None): return "TST"
    def _get_user_id(self, msg, client_id=None): return self._user_id
    def _get_client_info(self, client_id): return {"role": self._role}
    def _has_kick_permission(self, client_info): return False
    def _has_ban_permission(self, client_info): return False

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
# handle_wall_create
# ---------------------------------------------------------------------------

@pytest.mark.unit
@pytest.mark.asyncio
class TestWallCreate:
    async def test_player_cannot_create(self):
        proto = _ProtoStub(role="player")
        resp = await proto.handle_wall_create(
            Message(MessageType.WALL_CREATE, {"table_id": "t1", "wall_data": {"x": 0}}), "c1"
        )
        assert resp.type == MessageType.ERROR

    async def test_no_data_returns_error(self):
        proto = _ProtoStub(role="owner")
        resp = await proto.handle_wall_create(Message(MessageType.WALL_CREATE, {}), "c1")
        assert resp.type == MessageType.ERROR

    async def test_missing_table_id_returns_error(self):
        proto = _ProtoStub(role="owner")
        resp = await proto.handle_wall_create(
            Message(MessageType.WALL_CREATE, {"wall_data": {"x": 0}}), "c1"
        )
        assert resp.type == MessageType.ERROR

    async def test_missing_wall_data_returns_error(self):
        proto = _ProtoStub(role="owner")
        resp = await proto.handle_wall_create(
            Message(MessageType.WALL_CREATE, {"table_id": "t1"}), "c1"
        )
        assert resp.type == MessageType.ERROR

    async def test_success_returns_wall_data(self):
        proto = _ProtoStub(role="owner")
        proto.actions.create_wall = AsyncMock(return_value={"wall_id": "w1"})
        resp = await proto.handle_wall_create(
            Message(MessageType.WALL_CREATE, {"table_id": "t1", "wall_data": {"x": 0, "y": 0}}), "c1"
        )
        assert resp.type == MessageType.WALL_DATA
        assert resp.data["operation"] == "create"

    async def test_action_exception_returns_error(self):
        proto = _ProtoStub(role="owner")
        proto.actions.create_wall = AsyncMock(side_effect=ValueError("DB error"))
        resp = await proto.handle_wall_create(
            Message(MessageType.WALL_CREATE, {"table_id": "t1", "wall_data": {"x": 0}}), "c1"
        )
        assert resp.type == MessageType.ERROR


# ---------------------------------------------------------------------------
# handle_wall_update
# ---------------------------------------------------------------------------

@pytest.mark.unit
@pytest.mark.asyncio
class TestWallUpdate:
    async def test_player_cannot_update(self):
        proto = _ProtoStub(role="player")
        resp = await proto.handle_wall_update(
            Message(MessageType.WALL_UPDATE, {"table_id": "t1", "wall_id": "w1"}), "c1"
        )
        assert resp.type == MessageType.ERROR

    async def test_missing_wall_id_returns_error(self):
        proto = _ProtoStub(role="owner")
        resp = await proto.handle_wall_update(
            Message(MessageType.WALL_UPDATE, {"table_id": "t1"}), "c1"
        )
        assert resp.type == MessageType.ERROR

    async def test_success_returns_wall_data(self):
        proto = _ProtoStub(role="owner")
        proto.actions.update_wall = AsyncMock(return_value={"wall_id": "w1", "blocking": False})
        resp = await proto.handle_wall_update(
            Message(MessageType.WALL_UPDATE, {"table_id": "t1", "wall_id": "w1", "updates": {"blocking": False}}), "c1"
        )
        assert resp.type == MessageType.WALL_DATA
        assert resp.data["operation"] == "update"


# ---------------------------------------------------------------------------
# handle_wall_remove
# ---------------------------------------------------------------------------

@pytest.mark.unit
@pytest.mark.asyncio
class TestWallRemove:
    async def test_player_cannot_remove(self):
        proto = _ProtoStub(role="player")
        resp = await proto.handle_wall_remove(
            Message(MessageType.WALL_REMOVE, {"table_id": "t1", "wall_id": "w1"}), "c1"
        )
        assert resp.type == MessageType.ERROR

    async def test_success_returns_wall_data(self):
        proto = _ProtoStub(role="owner")
        proto.actions.delete_wall = AsyncMock(return_value=None)
        resp = await proto.handle_wall_remove(
            Message(MessageType.WALL_REMOVE, {"table_id": "t1", "wall_id": "w1"}), "c1"
        )
        assert resp.type == MessageType.WALL_DATA
        assert resp.data["operation"] == "remove"
        assert resp.data["wall_id"] == "w1"


# ---------------------------------------------------------------------------
# handle_wall_batch_create
# ---------------------------------------------------------------------------

@pytest.mark.unit
@pytest.mark.asyncio
class TestWallBatchCreate:
    async def test_player_cannot_batch_create(self):
        proto = _ProtoStub(role="player")
        resp = await proto.handle_wall_batch_create(
            Message(MessageType.WALL_BATCH_CREATE, {"table_id": "t1", "walls": []}), "c1"
        )
        assert resp.type == MessageType.ERROR

    async def test_missing_table_id_returns_error(self):
        proto = _ProtoStub(role="owner")
        resp = await proto.handle_wall_batch_create(
            Message(MessageType.WALL_BATCH_CREATE, {"walls": [{"x": 0}]}), "c1"
        )
        assert resp.type == MessageType.ERROR

    async def test_success_returns_batch_result(self):
        proto = _ProtoStub(role="owner")
        proto.actions.create_wall = AsyncMock(side_effect=[{"wall_id": "w1"}, {"wall_id": "w2"}])
        resp = await proto.handle_wall_batch_create(
            Message(MessageType.WALL_BATCH_CREATE, {
                "table_id": "t1",
                "walls": [{"x": 0, "y": 0}, {"x": 1, "y": 1}]
            }), "c1"
        )
        assert resp.type == MessageType.WALL_DATA
        assert resp.data["operation"] == "batch_create"
        assert len(resp.data["walls"]) == 2

    async def test_failed_walls_skipped_rest_created(self):
        proto = _ProtoStub(role="owner")
        proto.actions.create_wall = AsyncMock(
            side_effect=[ValueError("bad"), {"wall_id": "w2"}]
        )
        resp = await proto.handle_wall_batch_create(
            Message(MessageType.WALL_BATCH_CREATE, {
                "table_id": "t1",
                "walls": [{"x": 0}, {"x": 1}]
            }), "c1"
        )
        assert resp.type == MessageType.WALL_DATA
        assert len(resp.data["walls"]) == 1  # only 1 succeeded


# ---------------------------------------------------------------------------
# handle_door_toggle
# ---------------------------------------------------------------------------

@pytest.mark.unit
@pytest.mark.asyncio
class TestDoorToggle:
    def _door_wall(self, is_door=True, door_state="closed"):
        w = MagicMock()
        w.is_door = is_door
        w.door_state = door_state
        return w

    async def test_spectator_cannot_toggle(self):
        proto = _ProtoStub(role="spectator")
        resp = await proto.handle_door_toggle(
            Message(MessageType.WALL_UPDATE, {"table_id": "t1", "wall_id": "w1"}), "c1"
        )
        assert resp.type == MessageType.ERROR

    async def test_no_data_returns_error(self):
        proto = _ProtoStub(role="player")
        resp = await proto.handle_door_toggle(Message(MessageType.WALL_UPDATE, {}), "c1")
        assert resp.type == MessageType.ERROR

    async def test_table_not_found_returns_error(self):
        proto = _ProtoStub(role="player")
        proto.table_manager.tables_id.get.return_value = None
        proto.table_manager.tables.get.return_value = None
        resp = await proto.handle_door_toggle(
            Message(MessageType.WALL_UPDATE, {"table_id": "t1", "wall_id": "w1"}), "c1"
        )
        assert resp.type == MessageType.ERROR

    async def test_wall_not_a_door_returns_error(self):
        proto = _ProtoStub(role="player")
        table = MagicMock()
        table.get_wall.return_value = self._door_wall(is_door=False)
        proto.table_manager.tables_id.get.return_value = table
        resp = await proto.handle_door_toggle(
            Message(MessageType.WALL_UPDATE, {"table_id": "t1", "wall_id": "w1"}), "c1"
        )
        assert resp.type == MessageType.ERROR

    async def test_locked_door_blocked_for_player(self):
        proto = _ProtoStub(role="player")
        table = MagicMock()
        table.get_wall.return_value = self._door_wall(is_door=True, door_state="locked")
        proto.table_manager.tables_id.get.return_value = table
        resp = await proto.handle_door_toggle(
            Message(MessageType.WALL_UPDATE, {"table_id": "t1", "wall_id": "w1"}), "c1"
        )
        assert resp.type == MessageType.ERROR
        assert "locked" in resp.data["error"].lower()

    async def test_owner_can_open_locked_door(self):
        proto = _ProtoStub(role="owner")
        table = MagicMock()
        table.get_wall.return_value = self._door_wall(is_door=True, door_state="locked")
        proto.table_manager.tables_id.get.return_value = table
        proto.actions.update_wall = AsyncMock(return_value={"wall_id": "w1", "door_state": "open"})
        resp = await proto.handle_door_toggle(
            Message(MessageType.WALL_UPDATE, {"table_id": "t1", "wall_id": "w1"}), "c1"
        )
        assert resp.type == MessageType.WALL_DATA

    async def test_player_can_toggle_unlocked_door(self):
        proto = _ProtoStub(role="player")
        table = MagicMock()
        table.get_wall.return_value = self._door_wall(is_door=True, door_state="closed")
        proto.table_manager.tables_id.get.return_value = table
        proto.actions.update_wall = AsyncMock(return_value={"wall_id": "w1", "door_state": "open"})
        resp = await proto.handle_door_toggle(
            Message(MessageType.WALL_UPDATE, {"table_id": "t1", "wall_id": "w1"}), "c1"
        )
        assert resp.type == MessageType.WALL_DATA
