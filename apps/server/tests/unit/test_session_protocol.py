"""Unit tests for _SessionMixin protocol handlers.

Tests focus on user-visible behaviour: permission gates, validation,
and correct response MessageType. DB calls are patched out.
"""
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from core_table.protocol import Message, MessageType
from service.protocol.session import _SessionMixin

# ---------------------------------------------------------------------------
# Shared stub
# ---------------------------------------------------------------------------

class _ProtoStub(_SessionMixin):
    def __init__(self, role="owner"):
        self._role = role
        self.session_manager = MagicMock()
        self._rules_cache = {}

    def _get_client_role(self, client_id):
        return self._role

    def _get_session_code(self, msg=None):
        return "TST"

    def _get_session_id(self, msg):
        return 1

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


# ---------------------------------------------------------------------------
# handle_layer_settings_update
# ---------------------------------------------------------------------------

@pytest.mark.unit
class TestLayerSettingsUpdate:
    """DMs can update layer settings; players cannot."""

    @patch("service.protocol.session.SessionLocal")
    async def test_player_cannot_update_layer_settings(self, _mock_db):
        proto = _ProtoStub(role="player")
        msg = Message(MessageType.LAYER_SETTINGS_UPDATE, {
            "table_id": "t1", "layer": "ground", "settings": {}
        })
        resp = await proto.handle_layer_settings_update(msg, "c1")
        assert resp.type == MessageType.ERROR
        assert "dm" in resp.data["error"].lower()

    @patch("service.protocol.session.SessionLocal")
    async def test_missing_data_returns_error(self, _mock_db):
        proto = _ProtoStub(role="owner")
        resp = await proto.handle_layer_settings_update(
            Message(MessageType.LAYER_SETTINGS_UPDATE, {}), "c1"
        )
        assert resp.type == MessageType.ERROR

    @patch("service.protocol.session.SessionLocal")
    async def test_missing_table_id_returns_error(self, _mock_db):
        proto = _ProtoStub(role="owner")
        msg = Message(MessageType.LAYER_SETTINGS_UPDATE, {"layer": "ground", "settings": {}})
        resp = await proto.handle_layer_settings_update(msg, "c1")
        assert resp.type == MessageType.ERROR

    @patch("service.protocol.session.SessionLocal")
    async def test_successful_update_returns_layer_settings_update(self, mock_db):
        mock_db.return_value.__enter__ = MagicMock(return_value=MagicMock())
        mock_db.return_value.__exit__ = MagicMock(return_value=False)
        proto = _ProtoStub(role="owner")
        msg = Message(MessageType.LAYER_SETTINGS_UPDATE, {
            "table_id": "t1", "layer": "ground", "settings": {"opacity": 0.5}
        })
        resp = await proto.handle_layer_settings_update(msg, "c1")
        assert resp.type == MessageType.LAYER_SETTINGS_UPDATE
        assert resp.data["table_id"] == "t1"


# ---------------------------------------------------------------------------
# handle_game_mode_change
# ---------------------------------------------------------------------------

@pytest.mark.unit
class TestGameModeChange:
    """DMs can change game mode; invalid modes are rejected."""

    @patch("service.protocol.session.SessionLocal")
    async def test_player_cannot_change_game_mode(self, _mock_db):
        proto = _ProtoStub(role="player")
        msg = Message(MessageType.GAME_MODE_STATE, {"game_mode": "fight"})
        resp = await proto.handle_game_mode_change(msg, "c1")
        assert resp.type == MessageType.ERROR
        assert "dm" in resp.data["error"].lower()

    @patch("service.protocol.session.SessionLocal")
    async def test_missing_game_mode_returns_error(self, _mock_db):
        proto = _ProtoStub(role="owner")
        resp = await proto.handle_game_mode_change(
            Message(MessageType.GAME_MODE_STATE, {}), "c1"
        )
        assert resp.type == MessageType.ERROR

    @patch("service.protocol.session.SessionLocal")
    async def test_invalid_game_mode_returns_error(self, _mock_db):
        proto = _ProtoStub(role="owner")
        msg = Message(MessageType.GAME_MODE_STATE, {"game_mode": "invalid_mode"})
        resp = await proto.handle_game_mode_change(msg, "c1")
        assert resp.type == MessageType.ERROR
        assert "invalid" in resp.data["error"].lower()

    @patch("service.protocol.session.SessionLocal")
    async def test_valid_game_mode_returns_game_mode_state(self, mock_db):
        mock_db.return_value.__enter__ = MagicMock(return_value=MagicMock())
        mock_db.return_value.__exit__ = MagicMock(return_value=False)
        proto = _ProtoStub(role="owner")
        msg = Message(MessageType.GAME_MODE_STATE, {"game_mode": "fight"})
        resp = await proto.handle_game_mode_change(msg, "c1")
        assert resp.type == MessageType.GAME_MODE_STATE
        assert resp.data["game_mode"] == "fight"


# ---------------------------------------------------------------------------
# handle_session_rules_update
# ---------------------------------------------------------------------------

@pytest.mark.unit
class TestSessionRulesUpdate:
    """DMs can update session rules; missing payload is rejected."""

    @patch("service.protocol.session.SessionLocal")
    async def test_player_cannot_update_rules(self, _mock_db):
        proto = _ProtoStub(role="player")
        msg = Message(MessageType.SESSION_RULES_UPDATE, {"rules": {"hp": True}})
        resp = await proto.handle_session_rules_update(msg, "c1")
        assert resp.type == MessageType.ERROR
        assert "dm" in resp.data["error"].lower()

    @patch("service.protocol.session.SessionLocal")
    async def test_missing_rules_payload_returns_error(self, _mock_db):
        proto = _ProtoStub(role="owner")
        resp = await proto.handle_session_rules_update(
            Message(MessageType.SESSION_RULES_UPDATE, {}), "c1"
        )
        assert resp.type == MessageType.ERROR

    @patch("service.protocol.session.SessionLocal")
    async def test_successful_update_returns_session_rules_update(self, mock_db):
        mock_db.return_value.__enter__ = MagicMock(return_value=MagicMock())
        mock_db.return_value.__exit__ = MagicMock(return_value=False)
        proto = _ProtoStub(role="owner")
        msg = Message(MessageType.SESSION_RULES_UPDATE, {"rules": {"max_hp_roll": True}})
        resp = await proto.handle_session_rules_update(msg, "c1")
        assert resp.type == MessageType.SESSION_RULES_CHANGED


# ---------------------------------------------------------------------------
# handle_session_rules_request
# ---------------------------------------------------------------------------

@pytest.mark.unit
class TestSessionRulesRequest:
    """handle_session_rules_request sends current rules back to caller."""

    @patch("database.crud.get_game_mode", return_value="fight")
    @patch("database.crud.get_session_rules_json", return_value='{"max_hp_roll": true}')
    @patch("service.protocol.session.SessionLocal")
    async def test_returns_current_rules_to_caller(self, _mock_db, _mock_rules, _mock_mode):
        proto = _ProtoStub(role="player")
        resp = await proto.handle_session_rules_request(
            Message(MessageType.SESSION_RULES_REQUEST, {}), "c1"
        )
        assert resp.type == MessageType.SESSION_RULES_CHANGED
        assert resp.data["mode"] == "fight"
        assert resp.data["rules"] == {"max_hp_roll": True}

    @patch("service.protocol.session.SessionLocal", side_effect=Exception("DB down"))
    async def test_db_failure_falls_back_to_defaults(self, _mock_db):
        proto = _ProtoStub(role="player")
        resp = await proto.handle_session_rules_request(
            Message(MessageType.SESSION_RULES_REQUEST, {}), "c1"
        )
        assert resp.type == MessageType.SESSION_RULES_CHANGED
        assert resp.data["mode"] == "free_roam"


# ---------------------------------------------------------------------------
# _get_player_active_table / _set_player_active_table
# ---------------------------------------------------------------------------

@pytest.mark.unit
class TestPlayerActiveTable:
    """DB utility methods return correct values; exceptions handled gracefully."""

    @patch("service.protocol.session.SessionLocal")
    async def test_get_returns_table_id_when_player_found(self, mock_sl):
        proto = _ProtoStub()
        player_mock = MagicMock()
        player_mock.active_table_id = "t-42"

        db_mock = MagicMock()
        db_mock.query.return_value.join.return_value.filter.return_value.first.return_value = player_mock
        mock_sl.return_value = db_mock

        result = await proto._get_player_active_table(1, "TST")
        assert result == "t-42"

    @patch("service.protocol.session.SessionLocal")
    async def test_get_returns_none_when_player_not_found(self, mock_sl):
        proto = _ProtoStub()
        db_mock = MagicMock()
        db_mock.query.return_value.join.return_value.filter.return_value.first.return_value = None
        mock_sl.return_value = db_mock

        result = await proto._get_player_active_table(99, "TST")
        assert result is None

    @patch("service.protocol.session.SessionLocal", side_effect=Exception("DB offline"))
    async def test_get_returns_none_on_exception(self, _mock_sl):
        proto = _ProtoStub()
        result = await proto._get_player_active_table(1, "TST")
        assert result is None

    @patch("service.protocol.session.SessionLocal")
    async def test_set_returns_true_when_player_found(self, mock_sl):
        proto = _ProtoStub()
        player_mock = MagicMock()
        player_mock.active_table_id = "old"

        db_mock = MagicMock()
        db_mock.query.return_value.join.return_value.filter.return_value.first.return_value = player_mock
        mock_sl.return_value = db_mock

        result = await proto._set_player_active_table(1, "TST", "t-new")
        assert result is True
        assert player_mock.active_table_id == "t-new"

    @patch("service.protocol.session.SessionLocal")
    async def test_set_returns_false_when_player_not_found(self, mock_sl):
        proto = _ProtoStub()
        db_mock = MagicMock()
        db_mock.query.return_value.join.return_value.filter.return_value.first.return_value = None
        mock_sl.return_value = db_mock

        result = await proto._set_player_active_table(1, "TST", "t-new")
        assert result is False

    @patch("service.protocol.session.SessionLocal", side_effect=Exception("DB offline"))
    async def test_set_returns_false_on_exception(self, _mock_sl):
        proto = _ProtoStub()
        result = await proto._set_player_active_table(1, "TST", "t-new")
        assert result is False


# ---------------------------------------------------------------------------
# handle_layer_settings_update — DB update path
# ---------------------------------------------------------------------------

@pytest.mark.unit
class TestLayerSettingsDbUpdate:
    """When table is found in DB the layer settings are merged and saved."""

    @patch("database.crud.update_virtual_table")
    @patch("database.crud.get_virtual_table_by_id")
    @patch("database.database.SessionLocal")
    async def test_merges_settings_when_table_exists(self, mock_sl, mock_get, mock_update):
        table_mock = MagicMock()
        table_mock.layer_settings = '{"ground": {"opacity": 0.8}}'
        mock_get.return_value = table_mock

        db_mock = MagicMock()
        mock_sl.return_value = db_mock

        proto = _ProtoStub(role="owner")
        proto.broadcast_to_session = AsyncMock()

        msg = Message(MessageType.LAYER_SETTINGS_UPDATE, {
            "table_id": "t1", "layer": "tokens", "settings": {"opacity": 0.3}
        })
        resp = await proto.handle_layer_settings_update(msg, "dm1")

        assert resp.type == MessageType.LAYER_SETTINGS_UPDATE
        # update_virtual_table was invoked with merged settings
        mock_update.assert_called_once()
        updated_settings = mock_update.call_args[0][2].layer_settings
        assert "tokens" in updated_settings
