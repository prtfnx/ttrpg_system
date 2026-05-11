"""
Tests for _HelpersMixin helpers in service/protocol/helpers.py.
Focus: _get_session_code, _get_session_id, _get_user_id, _can_control_sprite.
"""
from unittest.mock import AsyncMock, MagicMock, patch
import json

import pytest
from core_table.protocol import Message, MessageType
from service.protocol.helpers import _HelpersMixin


class _Stub(_HelpersMixin):
    """Concrete subclass — implements all _ProtocolBase abstract methods
    except the ones under test which come from _HelpersMixin."""
    def __init__(self):
        self.clients = {}
        self.session_manager = MagicMock()
        self.table_manager = MagicMock()
        self.session_manager.session_code = "TST"
        self.session_manager.game_session_db_id = None

    def _get_client_info(self, client_id):
        return self.clients.get(client_id, {})

    def _get_client_role(self, client_id):
        return "player"

    def _has_kick_permission(self, info):
        return False

    def _has_ban_permission(self, info):
        return False

    async def ensure_assets_in_r2(self, table_data, session_code, user_id):
        return table_data

    async def add_asset_hashes_to_table(self, table_data, session_code, user_id):
        return table_data

    async def _get_player_active_table(self, user_id, session_code):
        return None

    async def _set_player_active_table(self, user_id, session_code, table_id):
        return True


# ---------------------------------------------------------------------------
# _get_session_code
# ---------------------------------------------------------------------------

class TestGetSessionCode:
    def test_returns_from_session_manager(self):
        s = _Stub()
        s.session_manager.session_code = "GAME1"
        assert s._get_session_code() == "GAME1"

    def test_falls_back_to_message_data(self):
        s = _Stub()
        s.session_manager.session_code = None
        msg = Message(MessageType.SUCCESS, {"session_code": "MSG_CODE"})
        assert s._get_session_code(msg) == "MSG_CODE"

    def test_returns_empty_string_when_nothing_available(self):
        s = _Stub()
        s.session_manager.session_code = None
        assert s._get_session_code() == ""

    def test_no_session_manager_falls_back_to_message(self):
        s = _Stub()
        s.session_manager = None
        msg = Message(MessageType.SUCCESS, {"session_code": "FALLBACK"})
        assert s._get_session_code(msg) == "FALLBACK"


# ---------------------------------------------------------------------------
# _get_session_id
# ---------------------------------------------------------------------------

class TestGetSessionId:
    def test_returns_from_session_manager(self):
        s = _Stub()
        s.session_manager.game_session_db_id = 42
        msg = Message(MessageType.SUCCESS, {})
        assert s._get_session_id(msg) == 42

    def test_falls_back_to_message_session_code(self):
        s = _Stub()
        s.session_manager.game_session_db_id = None
        game_session_mock = MagicMock()
        game_session_mock.id = 7
        with patch("service.protocol.helpers.SessionLocal") as mock_sl:
            db = MagicMock()
            db.__enter__ = lambda self: db
            db.__exit__ = MagicMock(return_value=False)
            db.query.return_value.filter_by.return_value.first.return_value = game_session_mock
            mock_sl.return_value = db
            msg = Message(MessageType.SUCCESS, {"session_code": "X"})
            result = s._get_session_id(msg)
            assert result == 7

    def test_returns_none_when_session_code_not_found(self):
        s = _Stub()
        s.session_manager.game_session_db_id = None
        with patch("service.protocol.helpers.SessionLocal") as mock_sl:
            db = MagicMock()
            db.__enter__ = lambda self: db
            db.__exit__ = MagicMock(return_value=False)
            db.query.return_value.filter_by.return_value.first.return_value = None
            mock_sl.return_value = db
            msg = Message(MessageType.SUCCESS, {"session_code": "GONE"})
            assert s._get_session_id(msg) is None

    def test_returns_none_when_no_data(self):
        s = _Stub()
        s.session_manager.game_session_db_id = None
        msg = Message(MessageType.SUCCESS, {})
        assert s._get_session_id(msg) is None


# ---------------------------------------------------------------------------
# _get_user_id
# ---------------------------------------------------------------------------

class TestGetUserId:
    def test_returns_from_client_info(self):
        s = _Stub()
        s.clients["c1"] = {"user_id": 99}
        msg = Message(MessageType.SUCCESS, {})
        assert s._get_user_id(msg, "c1") == 99

    def test_falls_back_to_message_data(self):
        s = _Stub()
        msg = Message(MessageType.SUCCESS, {"user_id": 5})
        assert s._get_user_id(msg) == 5

    def test_returns_none_when_no_info(self):
        s = _Stub()
        msg = Message(MessageType.SUCCESS, {})
        assert s._get_user_id(msg) is None

    def test_prefers_client_info_over_message(self):
        s = _Stub()
        s.clients["c1"] = {"user_id": 10}
        msg = Message(MessageType.SUCCESS, {"user_id": 999})
        assert s._get_user_id(msg, "c1") == 10


# ---------------------------------------------------------------------------
# _can_control_sprite
# ---------------------------------------------------------------------------

class TestCanControlSprite:
    async def test_denies_when_no_user_id(self):
        s = _Stub()
        assert await s._can_control_sprite("sp-1", None) is False

    async def test_allows_when_in_memory_entity_has_user_in_controlled_by(self):
        s = _Stub()
        entity = MagicMock()
        entity.controlled_by = [42]
        table = MagicMock()
        table.find_entity_by_sprite_id.return_value = entity
        s.table_manager.tables = {"t1": table}
        assert await s._can_control_sprite("sp-1", 42) is True

    async def test_denies_when_controlled_by_empty_dm_only(self):
        s = _Stub()
        entity = MagicMock()
        entity.controlled_by = []
        table = MagicMock()
        table.find_entity_by_sprite_id.return_value = entity
        s.table_manager.tables = {"t1": table}
        assert await s._can_control_sprite("sp-1", 1) is False

    async def test_denies_when_user_not_in_controlled_by(self):
        s = _Stub()
        entity = MagicMock()
        entity.controlled_by = [10, 20]
        table = MagicMock()
        table.find_entity_by_sprite_id.return_value = entity
        s.table_manager.tables = {"t1": table}
        assert await s._can_control_sprite("sp-1", 99) is False

    async def test_handles_json_string_controlled_by(self):
        s = _Stub()
        entity = MagicMock()
        entity.controlled_by = json.dumps([5])
        table = MagicMock()
        table.find_entity_by_sprite_id.return_value = entity
        s.table_manager.tables = {"t1": table}
        assert await s._can_control_sprite("sp-1", 5) is True

    async def test_denies_when_sprite_not_found_anywhere(self):
        s = _Stub()
        table = MagicMock()
        table.find_entity_by_sprite_id.return_value = None
        s.table_manager.tables = {"t1": table}
        s.table_manager.db_session = None
        assert await s._can_control_sprite("ghost", 1) is False

    async def test_exception_fails_closed(self):
        s = _Stub()
        s.table_manager.tables = MagicMock(side_effect=RuntimeError("boom"))
        assert await s._can_control_sprite("sp-1", 1) is False
