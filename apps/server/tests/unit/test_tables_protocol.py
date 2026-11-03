"""
Tests for the _TablesMixin protocol handlers.

Focus: user-visible behaviour — permission gates, validation errors, and
correct response message types. DB and WASM side-effects are mocked.
"""
import asyncio
import time
import uuid
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from core_table.protocol import Message, MessageType
from core_table.server import TableManager
from core_table.table import VirtualTable
from service.protocol.tables import _TablesMixin
from service.session_operation_receipts import OperationRejected
from service.table_creation_service import TableCreationAccepted
from service.table_deletion_service import TableDeletionAccepted
from service.table_settings_service import TableSettingsAccepted

# ---------------------------------------------------------------------------
# Stub
# ---------------------------------------------------------------------------

class _ProtoStub(_TablesMixin):
    def __init__(self, role="owner"):
        self._role = role
        self.actions = MagicMock()
        self.table_manager = TableManager()
        self.actions._dirty_tables = {}
        self.actions._add_to_history = AsyncMock()
        self.creation = MagicMock()
        self._table_creation_service = lambda: self.creation
        self.deletion = MagicMock()
        self._table_deletion_service = lambda: self.deletion
        self.actions.discard_deleted_table = AsyncMock()
        self.settings = MagicMock()
        self._table_settings_service = lambda: self.settings
        self.clients = {}
        self._rules_cache = {}

    def _get_client_role(self, client_id):
        return self._role

    def _get_session_id(self, msg: Message) -> int | None:
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


@pytest.mark.asyncio
@pytest.mark.parametrize("operation", ["scale", "move"])
@pytest.mark.parametrize("role", ["player", "trusted_player", "spectator", "owner", "co_dm"])
async def test_table_transforms_require_dm_and_pass_session(operation, role):
    proto = _ProtoStub(role)
    action = AsyncMock(return_value=_ok_result())
    setattr(proto.actions, f"{operation}_table", action)
    proto.broadcast_to_session = AsyncMock()
    response = await getattr(proto, f"handle_table_{operation}")(
        Message(MessageType.TABLE_UPDATE, {"table_id": "t1", "scale": 2, "x_moved": 10, "y_moved": 20}),
        "c1",
    )
    if role in ("owner", "co_dm"):
        assert response.type == MessageType.SUCCESS
        assert action.call_args.kwargs["session_id"] == 1
        proto.broadcast_to_session.assert_awaited_once()
    else:
        assert response.type == MessageType.ERROR
        action.assert_not_awaited()
        proto.broadcast_to_session.assert_not_awaited()


@pytest.mark.asyncio
@pytest.mark.parametrize("operation, field, value", [
    ("scale", "scale", 0), ("scale", "scale", -1),
    ("scale", "scale", float("nan")), ("scale", "scale", float("inf")),
    ("scale", "scale", True), ("scale", "scale", "2"),
    ("move", "x_moved", float("nan")), ("move", "y_moved", float("inf")),
    ("move", "x_moved", True), ("move", "y_moved", "2"),
])
async def test_table_transforms_reject_invalid_numbers(operation, field, value):
    proto = _ProtoStub()
    action = AsyncMock()
    setattr(proto.actions, f"{operation}_table", action)
    proto.broadcast_to_session = AsyncMock()
    data = {"table_id": "t1", "scale": 2, "x_moved": 10, "y_moved": 20, field: value}
    response = await getattr(proto, f"handle_table_{operation}")(Message(MessageType.TABLE_UPDATE, data), "c1")
    assert response.type == MessageType.ERROR
    action.assert_not_awaited()
    proto.broadcast_to_session.assert_not_awaited()


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
        table_id = str(uuid.uuid4())
        proto.deletion.execute.return_value = TableDeletionAccepted({'table_id': table_id, 'operation': 'delete'}, False)
        msg = Message(MessageType.TABLE_DELETE, {"table_id": table_id})
        resp = await proto.handle_delete_table(msg, "c1")
        assert resp.type == MessageType.SUCCESS
        assert resp.data["table_id"] == table_id
        proto.actions.discard_deleted_table.assert_awaited_once_with(table_id)

    async def test_failed_delete_returns_error(self):
        proto = _ProtoStub(role="owner")
        proto.deletion.execute.side_effect = OperationRejected('table not found', 'forbidden')
        msg = Message(MessageType.TABLE_DELETE, {"table_id": str(uuid.uuid4())})
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

    async def test_dm_list_includes_preview_metadata_without_image_bytes(self):
        proto = _ProtoStub(role="owner")
        tables = {
            "t1": {"table_id": "t1", "table_name": "Map 1"},
            "t2": {"table_id": "t2", "table_name": "Map 2"},
        }
        proto.actions.get_all_tables = AsyncMock(return_value=_ok_result(tables=tables))
        metadata = {
            "t1": {
                "has_preview": True,
                "preview_etag": "abc123",
                "preview_updated_at": "2026-09-28T10:00:00",
            },
        }

        with patch(
            "service.protocol.tables.run_blocking",
            new=AsyncMock(return_value=metadata),
        ) as load:
            resp = await proto.handle_table_list_request(
                Message(MessageType.TABLE_LIST_REQUEST, {}), "c1"
            )

        load.assert_awaited_once()
        assert resp.data["tables"]["t1"]["preview_etag"] == "abc123"
        assert resp.data["tables"]["t1"]["has_preview"] is True
        assert resp.data["tables"]["t2"]["has_preview"] is False

    async def test_player_list_does_not_load_dm_preview_metadata(self):
        proto = _ProtoStub(role="player")
        tables = [{"table_id": "t1", "table_name": "Map 1"}]
        proto.actions.get_all_tables = AsyncMock(return_value=_ok_result(tables=tables))

        with patch("service.protocol.tables.run_blocking", new=AsyncMock()) as load:
            resp = await proto.handle_table_list_request(
                Message(MessageType.TABLE_LIST_REQUEST, {}), "c1"
            )

        load.assert_not_awaited()
        assert "has_preview" not in resp.data["tables"][0]

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

    @pytest.mark.parametrize("field,value", [
        ("width", -1),
        ("width", 499),
        ("width", 10_001),
        ("width", 1000.5),
        ("width", "2000"),
        ("height", True),
    ])
    async def test_invalid_dimensions_are_rejected_before_allocation(self, field, value):
        proto = _ProtoStub(role="owner")
        proto.actions.create_table = AsyncMock()
        data = {"table_name": "Dungeon", "width": 2000, "height": 2000, field: value}

        resp = await proto.handle_new_table_request(Message(MessageType.NEW_TABLE_REQUEST, data), "c1")

        assert resp.type == MessageType.ERROR
        assert "between 500 and 10000" in resp.data["error"]
        proto.actions.create_table.assert_not_awaited()

    async def test_create_normalizes_name_and_commits_before_metadata_announcement(self):
        proto = _ProtoStub()
        proto.broadcast_to_session = AsyncMock()
        table = VirtualTable('Dungeon', 2000, 2000)
        table.add_entity({'name': 'Secret', 'layer': 'dungeon_master', 'metadata': 'DM notes'})

        def accept(intent, *args):
            table.table_id = uuid.UUID(intent.table_id)
            return TableCreationAccepted({'table_id': intent.table_id, 'name': intent.name,
                'operation_id': intent.identity.operation_id, 'local_table_id': intent.local_id}, table.to_dict(), False)

        proto.creation.execute.side_effect = accept
        response = await proto.handle_new_table_request(Message(MessageType.NEW_TABLE_REQUEST,
            {'table_name': '  Dungeon  ', 'local_table_id': 'draft'}), 'c1')
        assert response.type == MessageType.NEW_TABLE_RESPONSE
        assert response.data['local_table_id'] == 'draft'
        intent = proto.creation.execute.call_args.args[0]
        assert (intent.name, intent.width, intent.height) == ('Dungeon', 2000, 2000)
        assert proto.broadcast_to_session.await_args is not None
        broadcast = proto.broadcast_to_session.await_args.args[0]
        assert set(broadcast.data['table_data']) == {'table_id', 'table_name', 'width', 'height'}
        assert 'Secret' not in broadcast.to_json() and 'DM notes' not in broadcast.to_json()
        assert proto.table_manager.tables_id[intent.table_id].find_entity_by_sprite_id(
            next(iter(table.entities.values())).sprite_id) is not None

    async def test_missing_session_id_is_rejected_before_creation(self):
        proto = _ProtoStub()
        proto._get_session_id = MagicMock(return_value=None)
        response = await proto.handle_new_table_request(Message(MessageType.NEW_TABLE_REQUEST,
            {'table_name': 'Dungeon'}), 'c1')
        assert response.type == MessageType.ERROR and 'session context' in response.data['error']
        proto.creation.execute.assert_not_called()

    async def test_import_rejects_excessive_entity_metadata(self):
        proto = _ProtoStub()
        response = await proto.handle_new_table_request(Message(MessageType.NEW_TABLE_REQUEST,
            {'table_name': 'Import', 'table_data': {'layers': {'tokens': [{}] * 5001}}}), 'c1')
        assert response.type == MessageType.ERROR and '5000' in response.data['error']
        proto.creation.execute.assert_not_called()


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

    async def test_slow_hydration_does_not_block_event_loop(self, monkeypatch):
        proto = _ProtoStub(role="owner")
        table_mock = MagicMock()
        table_mock.to_dict.return_value = {"table_id": "t1", "layers": {}}
        table_mock.walls = {}
        proto.actions.get_table = AsyncMock(return_value=_ok_result(table=table_mock))

        def slow_hydration(_table_id):
            time.sleep(0.05)
            return SimpleNamespace(walls=[], layer_settings={})

        monkeypatch.setattr("service.protocol.tables.load_table_hydration", slow_hydration)
        marker = asyncio.Event()
        asyncio.get_running_loop().call_later(0.01, marker.set)

        response = await proto.handle_table_request(
            Message(MessageType.TABLE_REQUEST, {"table_id": "t1"}),
            "c1",
        )

        assert response.type == MessageType.TABLE_RESPONSE
        assert marker.is_set(), "table hydration blocked the event loop"

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
    table_id = '550e8400-e29b-41d4-a716-446655440000'

    def _proto(self, role='owner', *, changed=True):
        proto = _ProtoStub(role)
        table = VirtualTable('Settings', 1000, 1000, table_id=self.table_id)
        proto.table_manager.add_table(table)
        values = {name: getattr(table, name) for name in (
            'dynamic_lighting_enabled', 'fog_exploration_mode', 'ambient_light_level',
            'grid_cell_px', 'cell_distance', 'distance_unit', 'grid_enabled', 'snap_to_grid',
            'grid_color_hex', 'background_color_hex')}
        proto.settings.execute.return_value = TableSettingsAccepted(
            {'table_id': self.table_id, 'operation_id': 'original', 'changed': changed},
            {**values, 'grid_cell_px': 75 if changed else 50, 'settings_revision': 1 if changed else 0}, False)
        table.settings_revision = 0
        proto.broadcast_to_session = AsyncMock()
        return proto, table

    async def test_current_patch_is_installed_and_published_after_acceptance(self):
        proto, table = self._proto()
        response = await proto.handle_table_settings_update(Message(MessageType.TABLE_SETTINGS_UPDATE,
            {'table_id': self.table_id, 'grid_cell_px': 75}), 'c1')
        assert response.type == MessageType.TABLE_SETTINGS_CHANGED
        assert table.grid_cell_px == 75 and table.settings_revision == 1
        proto.broadcast_to_session.assert_awaited_once()

    async def test_identical_settings_have_receipt_without_peer_broadcast(self):
        proto, _ = self._proto(changed=False)
        response = await proto.handle_table_settings_update(Message(MessageType.TABLE_SETTINGS_UPDATE,
            {'table_id': self.table_id, 'grid_cell_px': 50}), 'c1')
        assert response.type == MessageType.TABLE_SETTINGS_CHANGED
        proto.settings.execute.assert_called_once()
        proto.broadcast_to_session.assert_not_awaited()

    async def test_denied_storage_does_not_install_or_publish(self):
        proto, table = self._proto()
        proto.settings.execute.side_effect = OperationRejected('Save rejected', 'persistence_failed')
        response = await proto.handle_table_settings_update(Message(MessageType.TABLE_SETTINGS_UPDATE,
            {'table_id': self.table_id, 'grid_cell_px': 75}), 'c1')
        assert response.type == MessageType.ERROR and response.data['code'] == 'persistence_failed'
        assert table.grid_cell_px == 50
        proto.broadcast_to_session.assert_not_awaited()

    @pytest.mark.parametrize('role', ['player', 'spectator', 'trusted_player'])
    async def test_only_dm_may_change_settings(self, role):
        proto, _ = self._proto(role)
        assert (await proto.handle_table_settings_update(Message(MessageType.TABLE_SETTINGS_UPDATE,
            {'table_id': self.table_id, 'grid_enabled': False}), 'c1')).type == MessageType.ERROR
        proto.settings.execute.assert_not_called()

    async def test_missing_session_rejects_before_storage(self):
        proto, _ = self._proto()
        proto._get_session_id = lambda _: None
        assert (await proto.handle_table_settings_update(Message(MessageType.TABLE_SETTINGS_UPDATE,
            {'table_id': self.table_id, 'grid_enabled': False}), 'c1')).type == MessageType.ERROR
        proto.settings.execute.assert_not_called()


# ---------------------------------------------------------------------------
# handle_table_update
# ---------------------------------------------------------------------------

@pytest.mark.unit
class TestTableUpdate:
    async def test_missing_table_id_is_rejected(self):
        proto = _ProtoStub()
        resp = await proto.handle_table_update(
            Message(MessageType.TABLE_UPDATE_REQUEST, {
                "category": "table",
                "type": "table_update",
                "data": {},
            }),
            "c1",
        )
        assert resp.type == MessageType.ERROR
        assert "table_id" in resp.data["error"]

    async def test_sprite_category_is_rejected(self):
        proto = _ProtoStub()
        proto.actions.update_sprite = AsyncMock()

        resp = await proto.handle_table_update(
            Message(MessageType.TABLE_UPDATE_REQUEST, {
                "category": "sprite",
                "type": "sprite_move",
                "data": {
                    "table_id": "t1",
                    "sprite_id": "sp-1",
                    "from": {"x": 0, "y": 0},
                    "to": {"x": 10, "y": 10},
                },
            }),
            "c1",
        )

        assert resp.type == MessageType.ERROR
        assert "no longer supported" in resp.data["error"]
        proto.actions.update_sprite.assert_not_awaited()

    async def test_maps_protocol_fields_and_broadcasts_after_success(self):
        proto = _ProtoStub()
        proto.actions.update_table_from_data = AsyncMock(return_value=_ok_result())
        proto.broadcast_to_session = AsyncMock()
        proto.send_to_client = AsyncMock()
        msg = Message(MessageType.TABLE_UPDATE_REQUEST, {
            "category": "table",
            "type": "table_update",
            "data": {
                "table_id": "t1",
                "table_name": "Updated map",
                "width": 2400,
                "grid_size": 75,
                "grid_enabled": False,
            },
        })

        resp = await proto.handle_table_update(msg, "c1")

        assert resp.type == MessageType.SUCCESS
        proto.actions.update_table_from_data.assert_awaited_once_with(
            {
                "table_id": "t1",
                "display_name": "Updated map",
                "width": 2400,
                "grid_cell_px": 75,
                "grid_enabled": False,
            },
            session_id=1,
        )
        proto.broadcast_to_session.assert_awaited_once()
        assert proto.broadcast_to_session.await_args is not None
        broadcast = proto.broadcast_to_session.await_args.kwargs["message"]
        assert broadcast.type == MessageType.TABLE_UPDATE
        assert broadcast.data == msg.data
        assert proto.broadcast_to_session.await_args.kwargs["client_id"] == "c1"
        proto.send_to_client.assert_not_awaited()

    async def test_action_failure_is_returned_without_broadcast(self):
        proto = _ProtoStub()
        proto.actions.update_table_from_data = AsyncMock(
            return_value=_fail_result("table not found")
        )
        proto.broadcast_to_session = AsyncMock()
        proto.send_to_client = AsyncMock()
        msg = Message(MessageType.TABLE_UPDATE_REQUEST, {
            "category": "table",
            "type": "table_update",
            "data": {"table_id": "missing", "grid_enabled": False},
        })

        resp = await proto.handle_table_update(msg, "c1")

        assert resp.type == MessageType.ERROR
        assert resp.data["error"] == "table not found"
        proto.broadcast_to_session.assert_not_awaited()
        proto.send_to_client.assert_not_awaited()

    @pytest.mark.parametrize("updates", [
        {"width": -1},
        {"height": "2000"},
        {"grid_size": float("nan")},
        {"grid_enabled": "false"},
        {"entities": {}},
        {"table_name": " "},
    ])
    async def test_rejects_invalid_or_unsafe_table_fields(self, updates):
        proto = _ProtoStub()
        proto.actions.update_table_from_data = AsyncMock(return_value=_ok_result())

        resp = await proto.handle_table_update(
            Message(MessageType.TABLE_UPDATE_REQUEST, {
                "category": "table",
                "type": "table_update",
                "data": {"table_id": "t1", **updates},
            }),
            "c1",
        )

        assert resp.type == MessageType.ERROR
        proto.actions.update_table_from_data.assert_not_awaited()


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
        proto._get_user_id = lambda msg, client_id=None: None  # type: ignore[method-assign]
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
