"""Unit tests for _SessionMixin protocol handlers.

Tests focus on user-visible behaviour: permission gates, validation,
and correct response MessageType. DB calls are patched out.
"""
import threading
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from core_table.protocol import Message, MessageType
from database import models
from service.protocol import session as session_module
from service.protocol.session import _SessionMixin
from sqlalchemy.orm import sessionmaker

# ---------------------------------------------------------------------------
# Shared stub
# ---------------------------------------------------------------------------

class _ProtoStub(_SessionMixin):
    def __init__(self, role="owner", *, session_id=1, session_code="TST"):
        self._role = role
        self._session_id = session_id
        self._session_code = session_code
        self.session_manager = MagicMock()
        self._rules_cache = {}

    def _get_client_role(self, client_id):
        return self._role

    def _get_session_code(self, msg=None):
        return self._session_code

    def _get_session_id(self, msg):
        return self._session_id

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
        table = MagicMock()
        table.layer_settings = "{}"
        mock_db.return_value.query.return_value.filter.return_value.first.return_value = table
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

    @patch("service.protocol.session.crud.update_virtual_table")
    @patch("service.protocol.session.SessionLocal")
    async def test_merges_settings_when_table_exists(self, mock_sl, mock_update):
        table_mock = MagicMock()
        table_mock.layer_settings = '{"ground": {"opacity": 0.8}}'

        db_mock = MagicMock()
        db_mock.query.return_value.filter.return_value.first.return_value = table_mock
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

    async def test_foreign_session_table_is_rejected(
        self,
        monkeypatch,
        test_db,
        test_game_session,
        test_user,
    ):
        foreign_session = models.GameSession(
            name="Foreign",
            session_code="FOREIGN",
            owner_id=test_user.id,
        )
        test_db.add(foreign_session)
        test_db.flush()
        foreign_table = models.VirtualTable(
            table_id="foreign-table",
            name="Foreign",
            width=100,
            height=100,
            session_id=foreign_session.id,
        )
        test_db.add(foreign_table)
        test_db.commit()
        worker_sessions = sessionmaker(
            autocommit=False,
            autoflush=False,
            bind=test_db.get_bind(),
        )
        monkeypatch.setattr(session_module, "SessionLocal", worker_sessions)
        proto = _ProtoStub(role="owner", session_id=test_game_session.id)
        proto.broadcast_to_session = AsyncMock()

        response = await proto.handle_layer_settings_update(
            Message(MessageType.LAYER_SETTINGS_UPDATE, {
                "table_id": foreign_table.table_id,
                "layer": "tokens",
                "settings": {"opacity": 0.3},
            }),
            "dm",
        )

        assert response.type == MessageType.ERROR
        proto.broadcast_to_session.assert_not_awaited()
        test_db.refresh(foreign_table)
        assert foreign_table.layer_settings is None

    async def test_persistence_failure_is_not_broadcast(self, monkeypatch):
        monkeypatch.setattr(
            session_module,
            "_persist_layer_settings",
            lambda **_kwargs: "database unavailable",
        )
        proto = _ProtoStub(role="owner")
        proto.broadcast_to_session = AsyncMock()

        response = await proto.handle_layer_settings_update(
            Message(MessageType.LAYER_SETTINGS_UPDATE, {
                "table_id": "table-1",
                "layer": "tokens",
                "settings": {"opacity": 0.3},
            }),
            "dm",
        )

        assert response.type == MessageType.ERROR
        proto.broadcast_to_session.assert_not_awaited()


@pytest.mark.unit
async def test_session_database_operations_run_off_event_loop(monkeypatch):
    proto = _ProtoStub(role="owner")
    event_loop_thread = threading.get_ident()
    worker_threads = {}

    def recording(name, result):
        def operation(**_kwargs):
            worker_threads[name] = threading.get_ident()
            return result

        return operation

    replacements = {
        "_persist_layer_settings": None,
        "_persist_game_mode": None,
        "_persist_session_rules": None,
        "_load_session_rules": ('{}', 'free_roam'),
        "_load_player_active_table": "table-1",
        "_persist_player_active_table": True,
    }
    for name, result in replacements.items():
        monkeypatch.setattr(session_module, name, recording(name, result))

    await proto.handle_layer_settings_update(
        Message(MessageType.LAYER_SETTINGS_UPDATE, {
            "table_id": "table-1",
            "layer": "tokens",
            "settings": {"opacity": 0.5},
        }),
        "client",
    )
    await proto.handle_game_mode_change(
        Message(MessageType.GAME_MODE_CHANGE, {"game_mode": "fight"}),
        "client",
    )
    await proto.handle_session_rules_update(
        Message(MessageType.SESSION_RULES_UPDATE, {"rules": {"max_hp_roll": True}}),
        "client",
    )
    await proto.handle_session_rules_request(
        Message(MessageType.SESSION_RULES_REQUEST, {}),
        "client",
    )
    await proto._get_player_active_table(1, "TST")
    await proto._set_player_active_table(1, "TST", "table-1")

    assert set(worker_threads) == set(replacements)
    assert all(thread_id != event_loop_thread for thread_id in worker_threads.values())
