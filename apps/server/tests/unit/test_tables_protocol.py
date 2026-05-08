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
