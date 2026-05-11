"""
Tests for the _TablesMixin protocol handlers.

Focus: user-visible behaviour — permission gates, validation errors, and
correct response message types. DB and WASM side-effects are mocked.
"""
from unittest.mock import AsyncMock, MagicMock

import pytest
from core_table.protocol import Message, MessageType
from service.protocol.tables import _TablesMixin

# ---------------------------------------------------------------------------
# Stub
# ---------------------------------------------------------------------------

class _ProtoStub(_TablesMixin):
    def __init__(self, role="owner"):
        self._role = role
        self.actions = MagicMock()
        self.table_manager = MagicMock()
        self.clients = {}
        self._rules_cache = {}

    def _get_client_role(self, client_id):
        return self._role

    def _get_session_id(self, msg):
        return 1

    def _get_session_code(self, msg=None):
        return "TST"

    def _get_user_id(self, msg, client_id=None):
        return 1

    def _get_client_info(self, client_id):
        return {"user_id": 1, "role": self._role}

    async def broadcast_to_session(self, message, client_id):
        pass

    async def broadcast_filtered(self, message, layer, client_id):
        pass

    async def send_to_client(self, message, client_id):
        pass

    async def _broadcast_error(self, client_id, error_message):
        pass

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
    r.data = {}
    r.message = message
    return r


# ---------------------------------------------------------------------------
# handle_delete_table
# ---------------------------------------------------------------------------

@pytest.mark.unit
class TestDeleteTable:
    """Only DMs can delete tables; table_id is required."""

    async def test_player_cannot_delete_table(self):
        proto = _ProtoStub(role="player")
        msg = Message(MessageType.TABLE_DELETE, {"table_id": "t1"})
        resp = await proto.handle_delete_table(msg, "c1")
        assert resp.type == MessageType.ERROR
        assert "dm" in resp.data["error"].lower()

    async def test_missing_data_returns_error(self):
        proto = _ProtoStub(role="owner")
        resp = await proto.handle_delete_table(Message(MessageType.TABLE_DELETE, {}), "c1")
        assert resp.type == MessageType.ERROR

    async def test_missing_table_id_returns_error(self):
        proto = _ProtoStub(role="owner")
        msg = Message(MessageType.TABLE_DELETE, {"other": "field"})
        resp = await proto.handle_delete_table(msg, "c1")
        assert resp.type == MessageType.ERROR

    async def test_successful_delete_returns_success(self):
        proto = _ProtoStub(role="owner")
        proto.actions.delete_table = AsyncMock(return_value=_ok_result())
        msg = Message(MessageType.TABLE_DELETE, {"table_id": "t1"})
        resp = await proto.handle_delete_table(msg, "c1")
        assert resp.type == MessageType.SUCCESS
        assert resp.data["table_id"] == "t1"

    async def test_failed_delete_returns_error(self):
        proto = _ProtoStub(role="owner")
        proto.actions.delete_table = AsyncMock(return_value=_fail_result("table not found"))
        msg = Message(MessageType.TABLE_DELETE, {"table_id": "missing"})
        resp = await proto.handle_delete_table(msg, "c1")
        assert resp.type == MessageType.ERROR
        assert "table not found" in resp.data["error"]


# ---------------------------------------------------------------------------
# handle_table_list_request
# ---------------------------------------------------------------------------

@pytest.mark.unit
class TestTableListRequest:
    """Any connected client can request the table list."""

    async def test_returns_table_list_response(self):
        proto = _ProtoStub(role="player")
        tables = [{"id": "t1", "name": "Map 1"}, {"id": "t2", "name": "Map 2"}]
        proto.actions.get_all_tables = AsyncMock(return_value=_ok_result(tables=tables))
        resp = await proto.handle_table_list_request(Message(MessageType.TABLE_LIST_REQUEST, {}), "c1")
        assert resp.type == MessageType.TABLE_LIST_RESPONSE
        assert len(resp.data["tables"]) == 2
        assert resp.data["count"] == 2

    async def test_empty_table_list_is_valid(self):
        proto = _ProtoStub()
        proto.actions.get_all_tables = AsyncMock(return_value=_ok_result(tables=[]))
        resp = await proto.handle_table_list_request(Message(MessageType.TABLE_LIST_REQUEST, {}), "c1")
        assert resp.type == MessageType.TABLE_LIST_RESPONSE
        assert resp.data["count"] == 0

    async def test_action_failure_returns_error(self):
        proto = _ProtoStub()
        proto.actions.get_all_tables = AsyncMock(return_value=_fail_result("db error"))
        resp = await proto.handle_table_list_request(Message(MessageType.TABLE_LIST_REQUEST, {}), "c1")
        assert resp.type == MessageType.ERROR


# ---------------------------------------------------------------------------
# handle_new_table_request
# ---------------------------------------------------------------------------

@pytest.mark.unit
class TestNewTableRequest:
    """Only DMs can create tables."""

    async def test_player_cannot_create_table(self):
        proto = _ProtoStub(role="player")
        msg = Message(MessageType.NEW_TABLE_REQUEST, {"table_name": "My Map"})
        resp = await proto.handle_new_table_request(msg, "c1")
        assert resp.type == MessageType.ERROR
        assert "dm" in resp.data["error"].lower()

    async def test_missing_data_returns_error(self):
        proto = _ProtoStub(role="owner")
        resp = await proto.handle_new_table_request(Message(MessageType.NEW_TABLE_REQUEST, {}), "c1")
        assert resp.type == MessageType.ERROR

    async def test_successful_create_returns_table_response(self):
        proto = _ProtoStub(role="owner")
        table_mock = MagicMock()
        table_mock.to_dict.return_value = {"id": "t-new", "name": "Dungeon", "layers": {}}
        result = MagicMock()
        result.success = True
        result.data = {"table": table_mock}
        result.message = "ok"
        proto.actions.create_table = AsyncMock(return_value=result)
        proto.actions.set_active_table = AsyncMock(return_value=_ok_result())
        msg = Message(MessageType.NEW_TABLE_REQUEST, {"table_name": "Dungeon"})
        resp = await proto.handle_new_table_request(msg, "c1")
        assert resp.type != MessageType.ERROR


# ---------------------------------------------------------------------------
# handle_table_request
# ---------------------------------------------------------------------------

@pytest.mark.unit
class TestTableRequest:
    async def test_missing_data_returns_error(self):
        proto = _ProtoStub()
        resp = await proto.handle_table_request(Message(MessageType.TABLE_REQUEST, {}), "c1")
        assert resp.type == MessageType.ERROR

    async def test_action_failure_returns_error(self):
        proto = _ProtoStub()
        proto.actions.get_table = AsyncMock(return_value=_fail_result("not found"))
        msg = Message(MessageType.TABLE_REQUEST, {"table_id": "t1"})
        resp = await proto.handle_table_request(msg, "c1")
        assert resp.type == MessageType.ERROR

    async def test_successful_request_returns_table_response(self):
        proto = _ProtoStub(role="owner")
        table_mock = MagicMock()
        table_mock.to_dict.return_value = {"table_id": "t1", "layers": {}}
        table_mock.walls = {}
        result = MagicMock()
        result.success = True
        result.data = {"table": table_mock}
        proto.actions.get_table = AsyncMock(return_value=result)
        msg = Message(MessageType.TABLE_REQUEST, {"table_id": "t1"})
        resp = await proto.handle_table_request(msg, "c1")
        assert resp.type == MessageType.TABLE_RESPONSE

    async def test_player_gets_layer_filtered_response(self):
        """Player role should have layers filtered to visible subset."""
        proto = _ProtoStub(role="player")
        table_mock = MagicMock()
        table_mock.to_dict.return_value = {
            "table_id": "t1",
            "layers": {"tokens": {}, "dungeon_master": {}, "fog_of_war": {}},
        }
        table_mock.walls = {}
        result = MagicMock()
        result.success = True
        result.data = {"table": table_mock}
        proto.actions.get_table = AsyncMock(return_value=result)
        msg = Message(MessageType.TABLE_REQUEST, {"table_id": "t1"})
        resp = await proto.handle_table_request(msg, "c1")
        assert resp.type == MessageType.TABLE_RESPONSE
        # DM-only layers should be stripped for players
        assert "dungeon_master" not in resp.data.get("table_data", {}).get("layers", {})


# ---------------------------------------------------------------------------
# handle_table_settings_update
# ---------------------------------------------------------------------------

@pytest.mark.unit
class TestTableSettingsUpdate:
    def _table_stub(self):
        t = MagicMock()
        t.dynamic_lighting_enabled = False
        t.fog_exploration_mode = "current_only"
        t.ambient_light_level = 1.0
        t.grid_cell_px = 50.0
        t.cell_distance = 5.0
        t.distance_unit = "ft"
        t.grid_enabled = True
        t.snap_to_grid = True
        t.grid_color_hex = "#ffffff"
        t.background_color_hex = "#2a3441"
        return t

    def _proto(self, role="owner"):
        p = _ProtoStub(role=role)
        t = self._table_stub()
        p.table_manager.tables_id = {"t1": t}
        p.table_manager.tables = {}
        return p

    async def test_player_cannot_change_settings(self):
        proto = self._proto("player")
        msg = Message(MessageType.TABLE_SETTINGS_CHANGED, {"table_id": "t1", "dynamic_lighting_enabled": True})
        resp = await proto.handle_table_settings_update(msg, "c1")
        assert resp.type == MessageType.ERROR

    async def test_missing_table_id_returns_error(self):
        proto = self._proto()
        resp = await proto.handle_table_settings_update(Message(MessageType.TABLE_SETTINGS_CHANGED, {}), "c1")
        assert resp.type == MessageType.ERROR

    async def test_table_not_found_returns_error(self):
        proto = self._proto()
        proto.table_manager.tables_id = {}
        msg = Message(MessageType.TABLE_SETTINGS_CHANGED, {"table_id": "unknown"})
        resp = await proto.handle_table_settings_update(msg, "c1")
        assert resp.type == MessageType.ERROR

    async def test_invalid_fog_mode_returns_error(self):
        proto = self._proto()
        msg = Message(MessageType.TABLE_SETTINGS_CHANGED, {"table_id": "t1", "fog_exploration_mode": "invalid"})
        resp = await proto.handle_table_settings_update(msg, "c1")
        assert resp.type == MessageType.ERROR

    async def test_ambient_out_of_range_returns_error(self):
        proto = self._proto()
        msg = Message(MessageType.TABLE_SETTINGS_CHANGED, {"table_id": "t1", "ambient_light_level": 2.5})
        resp = await proto.handle_table_settings_update(msg, "c1")
        assert resp.type == MessageType.ERROR

    async def test_invalid_hex_color_returns_error(self):
        proto = self._proto()
        msg = Message(MessageType.TABLE_SETTINGS_CHANGED, {"table_id": "t1", "grid_color_hex": "not-a-color"})
        resp = await proto.handle_table_settings_update(msg, "c1")
        assert resp.type == MessageType.ERROR

    async def test_valid_settings_applied_and_broadcast(self):
        proto = self._proto()
        broadcasts = []
        proto.broadcast_to_session = AsyncMock(side_effect=lambda m, c: broadcasts.append(m))
        msg = Message(MessageType.TABLE_SETTINGS_CHANGED, {
            "table_id": "t1",
            "dynamic_lighting_enabled": True,
            "fog_exploration_mode": "persist_dimmed",
            "ambient_light_level": 0.5,
        })
        resp = await proto.handle_table_settings_update(msg, "c1")
        assert resp.type == MessageType.TABLE_SETTINGS_CHANGED
        assert resp.data["dynamic_lighting_enabled"] is True
        assert len(broadcasts) == 1


# ---------------------------------------------------------------------------
# handle_table_scale
# ---------------------------------------------------------------------------

@pytest.mark.unit
class TestTableScale:
    async def test_missing_data_returns_error(self):
        proto = _ProtoStub()
        resp = await proto.handle_table_scale(Message(MessageType.TABLE_UPDATE, {}), "c1")
        assert resp.type == MessageType.ERROR

    async def test_missing_scale_returns_error(self):
        proto = _ProtoStub()
        msg = Message(MessageType.TABLE_UPDATE, {"table_id": "t1"})
        resp = await proto.handle_table_scale(msg, "c1")
        assert resp.type == MessageType.ERROR

    async def test_successful_scale_returns_success(self):
        proto = _ProtoStub()
        proto.actions.scale_table = AsyncMock(return_value=_ok_result())
        msg = Message(MessageType.TABLE_UPDATE, {"table_id": "t1", "scale": 1.5})
        resp = await proto.handle_table_scale(msg, "c1")
        assert resp.type == MessageType.SUCCESS

    async def test_failed_scale_returns_error(self):
        proto = _ProtoStub()
        proto.actions.scale_table = AsyncMock(return_value=_fail_result("bad table"))
        msg = Message(MessageType.TABLE_UPDATE, {"table_id": "t1", "scale": 1.0})
        resp = await proto.handle_table_scale(msg, "c1")
        assert resp.type == MessageType.ERROR


# ---------------------------------------------------------------------------
# handle_table_move
# ---------------------------------------------------------------------------

@pytest.mark.unit
class TestTableMove:
    async def test_missing_coords_returns_error(self):
        proto = _ProtoStub()
        msg = Message(MessageType.TABLE_UPDATE, {"table_id": "t1"})
        resp = await proto.handle_table_move(msg, "c1")
        assert resp.type == MessageType.ERROR

    async def test_successful_move_returns_success(self):
        proto = _ProtoStub()
        proto.actions.move_table = AsyncMock(return_value=_ok_result())
        msg = Message(MessageType.TABLE_UPDATE, {"table_id": "t1", "x_moved": 10.0, "y_moved": 5.0})
        resp = await proto.handle_table_move(msg, "c1")
        assert resp.type == MessageType.SUCCESS


# ---------------------------------------------------------------------------
# handle_table_active_request / set / set_all
# ---------------------------------------------------------------------------

@pytest.mark.unit
class TestTableActiveHandlers:
    async def test_active_request_returns_table_id(self):
        proto = _ProtoStub()
        proto._get_player_active_table = AsyncMock(return_value="t-active")
        msg = Message(MessageType.TABLE_ACTIVE_RESPONSE, {})
        resp = await proto.handle_table_active_request(msg, "c1")
        assert resp.type == MessageType.TABLE_ACTIVE_RESPONSE
        assert resp.data["table_id"] == "t-active"

    async def test_active_request_without_user_returns_error_data(self):
        proto = _ProtoStub()
        proto._get_user_id = lambda msg, cid=None: None
        msg = Message(MessageType.TABLE_ACTIVE_RESPONSE, {})
        resp = await proto.handle_table_active_request(msg, "c1")
        assert resp.data.get("success") is False

    async def test_active_set_updates_and_returns_success(self):
        proto = _ProtoStub()
        proto._set_player_active_table = AsyncMock(return_value=True)
        msg = Message(MessageType.TABLE_ACTIVE_SET, {"table_id": "t1"})
        resp = await proto.handle_table_active_set(msg, "c1")
        assert resp.type == MessageType.SUCCESS

    async def test_active_set_failure_returns_error(self):
        proto = _ProtoStub()
        proto._set_player_active_table = AsyncMock(return_value=False)
        msg = Message(MessageType.TABLE_ACTIVE_SET, {"table_id": "t1"})
        resp = await proto.handle_table_active_set(msg, "c1")
        assert resp.type == MessageType.ERROR

    async def test_active_set_all_player_denied(self):
        proto = _ProtoStub(role="player")
        msg = Message(MessageType.TABLE_ACTIVE_SET_ALL, {"table_id": "t1"})
        resp = await proto.handle_table_active_set_all(msg, "c1")
        assert resp.type == MessageType.ERROR

    async def test_active_set_all_missing_table_id_returns_error(self):
        proto = _ProtoStub(role="owner")
        resp = await proto.handle_table_active_set_all(Message(MessageType.TABLE_ACTIVE_SET_ALL, {}), "c1")
        assert resp.type == MessageType.ERROR

    async def test_active_set_all_broadcasts_and_succeeds(self):
        proto = _ProtoStub(role="owner")
        proto.table_manager.tables_id = {}  # empty — skip validation
        proto.session_manager = None
        broadcasts = []
        proto.broadcast_to_session = AsyncMock(side_effect=lambda m, c: broadcasts.append(m))
        msg = Message(MessageType.TABLE_ACTIVE_SET_ALL, {"table_id": "t1"})
        resp = await proto.handle_table_active_set_all(msg, "c1")
        assert resp.type == MessageType.SUCCESS
        assert len(broadcasts) == 1
