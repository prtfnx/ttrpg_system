"""Unit tests for _CombatMixin protocol handlers.

CombatEngine is patched for all tests — we verify permission gates,
validation, and correct MessageType in responses.
"""
from unittest.mock import MagicMock, patch

import pytest
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


# ---------------------------------------------------------------------------
# handle_combat_state_request
# ---------------------------------------------------------------------------

@pytest.mark.unit
class TestCombatStateRequest:
    @patch("service.combat_engine.CombatEngine")
    async def test_no_combat_returns_null_combat(self, mock_engine):
        mock_engine.get_state.return_value = None
        proto = _ProtoStub(role="player")
        resp = await proto.handle_combat_state_request(Message(MessageType.COMBAT_STATE_REQUEST, {}), "c1")
        assert resp.type == MessageType.COMBAT_STATE
        assert resp.data["combat"] is None

    @patch("service.combat_engine.CombatEngine")
    async def test_dm_gets_full_state(self, mock_engine):
        mock_engine.get_state.return_value = _combat_state()
        proto = _ProtoStub(role="owner")
        resp = await proto.handle_combat_state_request(Message(MessageType.COMBAT_STATE_REQUEST, {}), "c1")
        assert resp.type == MessageType.COMBAT_STATE

    @patch("service.combat_engine.CombatEngine")
    async def test_player_gets_player_state(self, mock_engine):
        mock_engine.get_state.return_value = _combat_state()
        proto = _ProtoStub(role="player")
        resp = await proto.handle_combat_state_request(Message(MessageType.COMBAT_STATE_REQUEST, {}), "c1")
        assert resp.type == MessageType.COMBAT_STATE


# ---------------------------------------------------------------------------
# handle_initiative_set / add / remove
# ---------------------------------------------------------------------------

@pytest.mark.unit
class TestInitiativeSet:
    async def test_player_cannot_set(self):
        proto = _ProtoStub(role="player")
        resp = await proto.handle_initiative_set(
            Message(MessageType.INITIATIVE_SET, {"combatant_id": "c1", "value": 10}), "c1"
        )
        assert resp.type == MessageType.ERROR

    async def test_missing_fields_returns_error(self):
        proto = _ProtoStub(role="owner")
        resp = await proto.handle_initiative_set(Message(MessageType.INITIATIVE_SET, {}), "c1")
        assert resp.type == MessageType.ERROR

    @patch("service.combat_engine.CombatEngine")
    async def test_success_returns_initiative_order(self, mock_engine):
        mock_engine.set_initiative.return_value = True
        mock_engine.get_state.return_value = _combat_state()
        proto = _ProtoStub(role="owner")
        resp = await proto.handle_initiative_set(
            Message(MessageType.INITIATIVE_SET, {"combatant_id": "c1", "value": 18}), "c1"
        )
        assert resp.type == MessageType.INITIATIVE_ORDER


@pytest.mark.unit
class TestInitiativeAdd:
    async def test_player_cannot_add(self):
        proto = _ProtoStub(role="player")
        resp = await proto.handle_initiative_add(
            Message(MessageType.INITIATIVE_ADD, {"entity_id": "e1"}), "c1"
        )
        assert resp.type == MessageType.ERROR

    async def test_missing_entity_id_returns_error(self):
        proto = _ProtoStub(role="owner")
        resp = await proto.handle_initiative_add(Message(MessageType.INITIATIVE_ADD, {}), "c1")
        assert resp.type == MessageType.ERROR

    @patch("service.combat_engine.CombatEngine")
    async def test_no_combat_returns_error(self, mock_engine):
        mock_engine.add_combatant.return_value = None
        proto = _ProtoStub(role="owner")
        resp = await proto.handle_initiative_add(
            Message(MessageType.INITIATIVE_ADD, {"entity_id": "e1"}), "c1"
        )
        assert resp.type == MessageType.ERROR


@pytest.mark.unit
class TestInitiativeRemove:
    async def test_player_cannot_remove(self):
        proto = _ProtoStub(role="player")
        resp = await proto.handle_initiative_remove(
            Message(MessageType.INITIATIVE_REMOVE, {"combatant_id": "c1"}), "c1"
        )
        assert resp.type == MessageType.ERROR

    @patch("service.combat_engine.CombatEngine")
    async def test_successful_remove_returns_order(self, mock_engine):
        mock_engine.remove_combatant.return_value = True
        mock_engine.get_state.return_value = _combat_state()
        proto = _ProtoStub(role="owner")
        resp = await proto.handle_initiative_remove(
            Message(MessageType.INITIATIVE_REMOVE, {"combatant_id": "c1"}), "c1"
        )
        assert resp.type == MessageType.INITIATIVE_ORDER


# ---------------------------------------------------------------------------
# handle_turn_end / turn_skip
# ---------------------------------------------------------------------------

@pytest.mark.unit
class TestTurnEnd:
    async def test_missing_combatant_id_returns_error(self):
        proto = _ProtoStub(role="owner")
        resp = await proto.handle_turn_end(Message(MessageType.TURN_END, {}), "c1")
        assert resp.type == MessageType.ERROR

    @patch("service.combat_engine.CombatEngine")
    async def test_no_combat_returns_error(self, mock_engine):
        mock_engine.get_state.return_value = None
        proto = _ProtoStub(role="owner")
        resp = await proto.handle_turn_end(
            Message(MessageType.TURN_END, {"combatant_id": "c1"}), "c1"
        )
        assert resp.type == MessageType.ERROR

    @patch("service.combat_engine.CombatEngine")
    async def test_player_not_current_combatant_returns_error(self, mock_engine):
        state = _combat_state()
        state.get_current_combatant.return_value = MagicMock(combatant_id="other")
        state.settings.allow_player_end_turn = True
        mock_engine.get_state.return_value = state
        proto = _ProtoStub(role="player")
        resp = await proto.handle_turn_end(
            Message(MessageType.TURN_END, {"combatant_id": "mine"}), "c1"
        )
        assert resp.type == MessageType.ERROR

    @patch("service.combat_engine.CombatEngine")
    async def test_successful_end_turn_returns_turn_start(self, mock_engine):
        state = _combat_state()
        state.round_number = 2
        next_combatant = MagicMock()
        next_combatant.to_dict.return_value = {"combatant_id": "next", "name": "Alice"}
        state.get_current_combatant.return_value = next_combatant
        mock_engine.get_state.return_value = state
        mock_engine.end_turn.return_value = True
        proto = _ProtoStub(role="owner")
        resp = await proto.handle_turn_end(
            Message(MessageType.TURN_END, {"combatant_id": "c1"}), "c1"
        )
        assert resp.type == MessageType.TURN_START
        assert resp.data["round_number"] == 2


@pytest.mark.unit
class TestTurnSkip:
    async def test_player_cannot_skip(self):
        proto = _ProtoStub(role="player")
        resp = await proto.handle_turn_skip(Message(MessageType.TURN_SKIP, {}), "c1")
        assert resp.type == MessageType.ERROR

    @patch("service.combat_engine.CombatEngine")
    async def test_no_combat_returns_error(self, mock_engine):
        mock_engine.next_turn.return_value = None
        proto = _ProtoStub(role="owner")
        resp = await proto.handle_turn_skip(Message(MessageType.TURN_SKIP, {}), "c1")
        assert resp.type == MessageType.ERROR

    @patch("service.combat_engine.CombatEngine")
    async def test_success_returns_turn_start(self, mock_engine):
        mock_engine.next_turn.return_value = {"current_combatant_id": "c2"}
        mock_engine.get_state.return_value = _combat_state()
        proto = _ProtoStub(role="owner")
        resp = await proto.handle_turn_skip(Message(MessageType.TURN_SKIP, {}), "c1")
        assert resp.type == MessageType.TURN_START


# ---------------------------------------------------------------------------
# DM-only HP / damage / revert / resource handlers
# ---------------------------------------------------------------------------

@pytest.mark.unit
class TestDmSetHp:
    async def test_player_blocked(self):
        proto = _ProtoStub(role="player")
        resp = await proto.handle_dm_set_hp(
            Message(MessageType.DM_SET_HP, {"combatant_id": "c1", "hp": 10}), "c1"
        )
        assert resp.type == MessageType.ERROR

    async def test_missing_fields_returns_error(self):
        proto = _ProtoStub(role="owner")
        resp = await proto.handle_dm_set_hp(Message(MessageType.DM_SET_HP, {}), "c1")
        assert resp.type == MessageType.ERROR

    @patch("service.combat_engine.CombatEngine")
    async def test_success_returns_combat_state(self, mock_engine):
        mock_engine.dm_set_hp.return_value = True
        mock_engine.get_state.return_value = _combat_state()
        proto = _ProtoStub(role="owner")
        resp = await proto.handle_dm_set_hp(
            Message(MessageType.DM_SET_HP, {"combatant_id": "c1", "hp": 25}), "c1"
        )
        assert resp.type == MessageType.COMBAT_STATE


@pytest.mark.unit
class TestDmApplyDamage:
    async def test_player_blocked(self):
        proto = _ProtoStub(role="player")
        resp = await proto.handle_dm_apply_damage(
            Message(MessageType.DM_APPLY_DAMAGE, {"combatant_id": "c1", "amount": 5}), "c1"
        )
        assert resp.type == MessageType.ERROR

    @patch("service.combat_engine.CombatEngine")
    async def test_success_returns_combat_state(self, mock_engine):
        mock_engine.apply_damage.return_value = {"damage_dealt": 5}
        mock_engine.get_state.return_value = _combat_state()
        proto = _ProtoStub(role="owner")
        resp = await proto.handle_dm_apply_damage(
            Message(MessageType.DM_APPLY_DAMAGE, {"combatant_id": "c1", "amount": 5}), "c1"
        )
        assert resp.type == MessageType.COMBAT_STATE


@pytest.mark.unit
class TestDmRevertAction:
    async def test_player_blocked(self):
        proto = _ProtoStub(role="player")
        resp = await proto.handle_dm_revert_action(
            Message(MessageType.DM_REVERT_ACTION, {}), "c1"
        )
        assert resp.type == MessageType.ERROR

    @patch("service.combat_engine.CombatEngine")
    async def test_nothing_to_revert_returns_error(self, mock_engine):
        mock_engine.dm_revert_last_action.return_value = False
        proto = _ProtoStub(role="owner")
        resp = await proto.handle_dm_revert_action(
            Message(MessageType.DM_REVERT_ACTION, {}), "c1"
        )
        assert resp.type == MessageType.ERROR


@pytest.mark.unit
class TestDmAddAction:
    async def test_player_blocked(self):
        proto = _ProtoStub(role="player")
        resp = await proto.handle_dm_add_action(
            Message(MessageType.DM_ADD_ACTION, {"combatant_id": "c1"}), "c1"
        )
        assert resp.type == MessageType.ERROR

    @patch("service.combat_engine.CombatEngine")
    async def test_success_returns_combat_state(self, mock_engine):
        mock_engine.dm_grant_resource.return_value = None
        mock_engine.get_state.return_value = _combat_state()
        proto = _ProtoStub(role="owner")
        resp = await proto.handle_dm_add_action(
            Message(MessageType.DM_ADD_ACTION, {"combatant_id": "c1"}), "c1"
        )
        assert resp.type == MessageType.COMBAT_STATE


# ---------------------------------------------------------------------------
# handle_condition_add / condition_remove
# ---------------------------------------------------------------------------

@pytest.mark.unit
class TestConditionAdd:
    async def test_player_blocked(self):
        proto = _ProtoStub(role="player")
        resp = await proto.handle_condition_add(
            Message(MessageType.CONDITION_ADD, {"combatant_id": "c1", "condition_type": "poisoned"}), "c1"
        )
        assert resp.type == MessageType.ERROR

    async def test_missing_fields_returns_error(self):
        proto = _ProtoStub(role="owner")
        resp = await proto.handle_condition_add(Message(MessageType.CONDITION_ADD, {}), "c1")
        assert resp.type == MessageType.ERROR

    @patch("service.combat_engine.CombatEngine")
    async def test_no_combat_returns_error(self, mock_engine):
        mock_engine.get_state.return_value = None
        proto = _ProtoStub(role="owner")
        resp = await proto.handle_condition_add(
            Message(MessageType.CONDITION_ADD, {"combatant_id": "c1", "condition_type": "poisoned"}), "c1"
        )
        assert resp.type == MessageType.ERROR

    @patch("service.combat_engine.CombatEngine")
    async def test_invalid_condition_returns_error(self, mock_engine):
        state = _combat_state()
        combatant = MagicMock()
        combatant.combatant_id = "c1"
        combatant.conditions = []
        state.combatants = [combatant]
        mock_engine.get_state.return_value = state
        proto = _ProtoStub(role="owner")
        resp = await proto.handle_condition_add(
            Message(MessageType.CONDITION_ADD, {"combatant_id": "c1", "condition_type": "notareal_condition"}), "c1"
        )
        assert resp.type == MessageType.ERROR

    @patch("service.combat_engine.CombatEngine")
    async def test_valid_condition_returns_conditions_sync(self, mock_engine):
        state = _combat_state()
        combatant = MagicMock()
        combatant.combatant_id = "c1"
        combatant.conditions = []
        state.combatants = [combatant]
        mock_engine.get_state.return_value = state
        proto = _ProtoStub(role="owner")
        resp = await proto.handle_condition_add(
            Message(MessageType.CONDITION_ADD, {"combatant_id": "c1", "condition_type": "poisoned"}), "c1"
        )
        assert resp.type == MessageType.CONDITIONS_SYNC


@pytest.mark.unit
class TestConditionRemove:
    async def test_player_blocked(self):
        proto = _ProtoStub(role="player")
        resp = await proto.handle_condition_remove(
            Message(MessageType.CONDITION_REMOVE, {"combatant_id": "c1", "condition_type": "poisoned"}), "c1"
        )
        assert resp.type == MessageType.ERROR

    @patch("service.combat_engine.CombatEngine")
    async def test_combatant_not_found_returns_error(self, mock_engine):
        state = _combat_state()
        state.combatants = []
        mock_engine.get_state.return_value = state
        proto = _ProtoStub(role="owner")
        resp = await proto.handle_condition_remove(
            Message(MessageType.CONDITION_REMOVE, {"combatant_id": "ghost", "condition_type": "poisoned"}), "c1"
        )
        assert resp.type == MessageType.ERROR


# ---------------------------------------------------------------------------
# handle_death_save_roll
# ---------------------------------------------------------------------------

@pytest.mark.unit
class TestDeathSaveRoll:
    async def test_missing_combatant_id_returns_error(self):
        proto = _ProtoStub(role="owner")
        resp = await proto.handle_death_save_roll(Message(MessageType.DEATH_SAVE_ROLL, {}), "c1")
        assert resp.type == MessageType.ERROR

    @patch("service.combat_engine.CombatEngine")
    async def test_no_combat_returns_error(self, mock_engine):
        mock_engine.get_state.return_value = None
        proto = _ProtoStub(role="player")
        resp = await proto.handle_death_save_roll(
            Message(MessageType.DEATH_SAVE_ROLL, {"combatant_id": "c1"}), "c1"
        )
        assert resp.type == MessageType.ERROR

    @patch("service.combat_engine.CombatEngine")
    async def test_player_cannot_roll_other_combatant(self, mock_engine):
        state = _combat_state()
        combatant = MagicMock()
        combatant.combatant_id = "c1"
        combatant.controlled_by = ["99"]  # different user
        state.combatants = [combatant]
        mock_engine.get_state.return_value = state
        proto = _ProtoStub(role="player")  # user_id=1 by default
        resp = await proto.handle_death_save_roll(
            Message(MessageType.DEATH_SAVE_ROLL, {"combatant_id": "c1"}), "c1"
        )
        assert resp.type == MessageType.ERROR

    @patch("service.combat_engine.CombatEngine")
    async def test_successful_roll_returns_death_save_result(self, mock_engine):
        state = _combat_state()
        combatant = MagicMock()
        combatant.combatant_id = "c1"
        combatant.controlled_by = ["1"]
        state.combatants = [combatant]
        mock_engine.get_state.return_value = state
        mock_engine.roll_death_save.return_value = {"success": True, "total": 15}
        proto = _ProtoStub(role="player")
        resp = await proto.handle_death_save_roll(
            Message(MessageType.DEATH_SAVE_ROLL, {"combatant_id": "c1"}), "c1"
        )
        assert resp.type == MessageType.DEATH_SAVE_RESULT


# ---------------------------------------------------------------------------
# handle_action_commit — empty action list
# ---------------------------------------------------------------------------

@pytest.mark.unit
class TestActionCommit:
    async def test_empty_actions_returns_rejected(self):
        proto = _ProtoStub(role="player")
        resp = await proto.handle_action_commit(
            Message(MessageType.ACTION_COMMIT, {"actions": [], "sequence_id": 1}), "c1"
        )
        assert resp.type == MessageType.ACTION_REJECTED
        assert resp.data["sequence_id"] == 1
