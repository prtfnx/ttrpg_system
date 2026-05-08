"""Unit tests for _SessionMixin protocol handlers.

Tests focus on user-visible behaviour: permission gates, validation,
and correct response MessageType. DB calls are patched out.
"""
from unittest.mock import MagicMock, patch

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
