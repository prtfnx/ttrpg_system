"""Unit tests for _CombatMixin protocol handlers.

CombatEngine is patched for all tests — we verify permission gates,
validation, and correct MessageType in responses.
"""
import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from core_table.protocol import Message, MessageType

from service.protocol.combat import _CombatMixin


# ---------------------------------------------------------------------------
# Shared stub
# ---------------------------------------------------------------------------

class _ProtoStub(_CombatMixin):
    def __init__(self, role="owner"):
        self._role = role
        self.session_manager = MagicMock()

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


def _combat_state():
    state = MagicMock()
    state.to_dict.return_value = {"active": True, "combatants": []}
    state.to_dict_for_player.return_value = {"active": True, "combatants": []}
    state.combatants = []
    state.settings.show_npc_hp_to_players = False
    return state


# ---------------------------------------------------------------------------
# handle_combat_start
# ---------------------------------------------------------------------------

@pytest.mark.unit
class TestCombatStart:
    async def test_player_cannot_start_combat(self):
        proto = _ProtoStub(role="player")
        msg = Message(MessageType.COMBAT_START, {"table_id": "t1"})
        resp = await proto.handle_combat_start(msg, "c1")
        assert resp.type == MessageType.ERROR
        assert "dm" in resp.data["error"].lower()

    async def test_missing_table_id_returns_error(self):
        proto = _ProtoStub(role="owner")
        msg = Message(MessageType.COMBAT_START, {})
        resp = await proto.handle_combat_start(msg, "c1")
        assert resp.type == MessageType.ERROR
        assert "table_id" in resp.data["error"]

    @patch("service.combat_engine.CombatEngine")
    async def test_successful_start_returns_combat_state(self, mock_engine):
        mock_engine.start_combat.return_value = _combat_state()
        proto = _ProtoStub(role="owner")
        msg = Message(MessageType.COMBAT_START, {"table_id": "t1"})
        resp = await proto.handle_combat_start(msg, "c1")
        assert resp.type == MessageType.COMBAT_STATE
        assert resp.data["combat"] == {"active": True, "combatants": []}


# ---------------------------------------------------------------------------
# handle_combat_end
# ---------------------------------------------------------------------------

@pytest.mark.unit
class TestCombatEnd:
    async def test_player_cannot_end_combat(self):
        proto = _ProtoStub(role="player")
        resp = await proto.handle_combat_end(Message(MessageType.COMBAT_END, {}), "c1")
        assert resp.type == MessageType.ERROR

    @patch("service.combat_engine.CombatEngine")
    async def test_no_active_combat_returns_error(self, mock_engine):
        mock_engine.end_combat.return_value = None
        proto = _ProtoStub(role="owner")
        resp = await proto.handle_combat_end(Message(MessageType.COMBAT_END, {}), "c1")
        assert resp.type == MessageType.ERROR
        assert "no active combat" in resp.data["error"].lower()

    @patch("service.combat_engine.CombatEngine")
    async def test_successful_end_returns_combat_state(self, mock_engine):
        mock_engine.end_combat.return_value = _combat_state()
        proto = _ProtoStub(role="owner")
        resp = await proto.handle_combat_end(Message(MessageType.COMBAT_END, {}), "c1")
        assert resp.type == MessageType.COMBAT_STATE
        assert resp.data["ended"] is True


# ---------------------------------------------------------------------------
# handle_initiative_roll
# ---------------------------------------------------------------------------

@pytest.mark.unit
class TestInitiativeRoll:
    async def test_missing_combatant_id_returns_error(self):
        proto = _ProtoStub(role="owner")
        resp = await proto.handle_initiative_roll(Message(MessageType.INITIATIVE_ROLL, {}), "c1")
        assert resp.type == MessageType.ERROR
        assert "combatant_id" in resp.data["error"]

    @patch("service.combat_engine.CombatEngine")
    async def test_unknown_combatant_returns_error(self, mock_engine):
        mock_engine.roll_initiative.return_value = None
        proto = _ProtoStub(role="owner")
        msg = Message(MessageType.INITIATIVE_ROLL, {"combatant_id": "ghost"})
        resp = await proto.handle_initiative_roll(msg, "c1")
        assert resp.type == MessageType.ERROR

    @patch("service.combat_engine.CombatEngine")
    async def test_successful_roll_returns_initiative_order(self, mock_engine):
        mock_engine.roll_initiative.return_value = 15
        mock_engine.get_state.return_value = _combat_state()
        proto = _ProtoStub(role="player")
        msg = Message(MessageType.INITIATIVE_ROLL, {"combatant_id": "c-1"})
        resp = await proto.handle_initiative_roll(msg, "c1")
        assert resp.type == MessageType.INITIATIVE_ORDER
        assert resp.data["value"] == 15
