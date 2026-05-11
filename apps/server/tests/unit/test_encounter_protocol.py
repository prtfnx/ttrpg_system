"""
Tests for _EncounterMixin protocol handlers.

Focus: permission gates, validation errors, and correct response types.
EncounterEngine (in-function import) is patched at the module level.
"""
from unittest.mock import MagicMock, patch

import pytest
from core_table.protocol import Message, MessageType
from service.protocol.encounter import _EncounterMixin

# ---------------------------------------------------------------------------
# Stub
# ---------------------------------------------------------------------------

class _ProtoStub(_EncounterMixin):
    def __init__(self, role="owner", user_id=1):
        self._role = role
        self._user_id = user_id
        self.session_manager = MagicMock()
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


def _mock_encounter(**kwargs):
    enc = MagicMock()
    enc.encounter_id = kwargs.get("encounter_id", "enc-1")
    enc.player_choices = kwargs.get("player_choices", {})
    enc.to_dict.return_value = {"encounter_id": enc.encounter_id, "title": "Test"}
    return enc


# ---------------------------------------------------------------------------
# handle_encounter_start
# ---------------------------------------------------------------------------

@pytest.mark.unit
@pytest.mark.asyncio
class TestEncounterStart:
    async def test_player_cannot_start(self):
        proto = _ProtoStub(role="player")
        msg = Message(MessageType.ENCOUNTER_START, {"choices": ["a", "b"]})
        resp = await proto.handle_encounter_start(msg, "c1")
        assert resp.type == MessageType.ERROR
        assert "dm" in resp.data["error"].lower()

    async def test_missing_choices_returns_error(self):
        proto = _ProtoStub(role="owner")
        msg = Message(MessageType.ENCOUNTER_START, {"title": "Test"})
        resp = await proto.handle_encounter_start(msg, "c1")
        assert resp.type == MessageType.ERROR
        assert "choices" in resp.data["error"].lower()

    @patch("service.encounter_engine.EncounterEngine")
    async def test_owner_creates_encounter_and_returns_dm_view(self, mock_engine):
        mock_engine.create.return_value = _mock_encounter()
        proto = _ProtoStub(role="owner")
        msg = Message(MessageType.ENCOUNTER_START, {
            "title": "Trap Room", "choices": ["run", "fight"], "participants": []
        })
        resp = await proto.handle_encounter_start(msg, "c1")
        assert resp.type == MessageType.ENCOUNTER_STATE


# ---------------------------------------------------------------------------
# handle_encounter_end
# ---------------------------------------------------------------------------

@pytest.mark.unit
@pytest.mark.asyncio
class TestEncounterEnd:
    async def test_player_cannot_end(self):
        proto = _ProtoStub(role="player")
        resp = await proto.handle_encounter_end(Message(MessageType.ENCOUNTER_END, {}), "c1")
        assert resp.type == MessageType.ERROR

    @patch("service.encounter_engine.EncounterEngine")
    async def test_no_active_encounter_returns_error(self, mock_engine):
        mock_engine.end_encounter.return_value = None
        proto = _ProtoStub(role="owner")
        resp = await proto.handle_encounter_end(Message(MessageType.ENCOUNTER_END, {}), "c1")
        assert resp.type == MessageType.ERROR

    @patch("service.encounter_engine.EncounterEngine")
    async def test_successful_end_returns_result(self, mock_engine):
        mock_engine.end_encounter.return_value = _mock_encounter(encounter_id="enc-42", player_choices={})
        proto = _ProtoStub(role="owner")
        resp = await proto.handle_encounter_end(Message(MessageType.ENCOUNTER_END, {}), "c1")
        assert resp.type == MessageType.ENCOUNTER_RESULT
        assert resp.data["encounter_id"] == "enc-42"


# ---------------------------------------------------------------------------
# handle_encounter_choice
# ---------------------------------------------------------------------------

@pytest.mark.unit
@pytest.mark.asyncio
class TestEncounterChoice:
    async def test_missing_choice_id_returns_error(self):
        proto = _ProtoStub()
        msg = Message(MessageType.ENCOUNTER_CHOICE, {})
        resp = await proto.handle_encounter_choice(msg, "c1")
        assert resp.type == MessageType.ERROR
        assert "choice_id" in resp.data["error"].lower()

    @patch("service.encounter_engine.EncounterEngine")
    async def test_engine_error_propagated(self, mock_engine):
        mock_engine.submit_choice.return_value = {"error": "No active encounter"}
        proto = _ProtoStub()
        msg = Message(MessageType.ENCOUNTER_CHOICE, {"choice_id": "run"})
        resp = await proto.handle_encounter_choice(msg, "c1")
        assert resp.type == MessageType.ERROR

    @patch("service.encounter_engine.EncounterEngine")
    async def test_valid_choice_returns_result(self, mock_engine):
        mock_engine.submit_choice.return_value = {"selected": "run", "resolved": False}
        proto = _ProtoStub()
        msg = Message(MessageType.ENCOUNTER_CHOICE, {"choice_id": "run"})
        resp = await proto.handle_encounter_choice(msg, "c1")
        assert resp.type == MessageType.ENCOUNTER_RESULT


# ---------------------------------------------------------------------------
# handle_encounter_roll
# ---------------------------------------------------------------------------

@pytest.mark.unit
@pytest.mark.asyncio
class TestEncounterRoll:
    @patch("service.encounter_engine.EncounterEngine")
    async def test_engine_error_propagated(self, mock_engine):
        mock_engine.submit_roll.return_value = {"error": "No active encounter"}
        proto = _ProtoStub()
        resp = await proto.handle_encounter_roll(Message(MessageType.ENCOUNTER_ROLL, {}), "c1")
        assert resp.type == MessageType.ERROR

    @patch("service.encounter_engine.EncounterEngine")
    async def test_roll_returns_result(self, mock_engine):
        mock_engine.submit_roll.return_value = {"roll": 15, "total": 17}
        proto = _ProtoStub()
        msg = Message(MessageType.ENCOUNTER_ROLL, {"bonus": 2})
        resp = await proto.handle_encounter_roll(msg, "c1")
        assert resp.type == MessageType.ENCOUNTER_RESULT
        assert resp.data["roll"] == 15
