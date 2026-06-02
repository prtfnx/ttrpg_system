"""Tests for CombatEngine."""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '../..'))

from unittest.mock import MagicMock, patch

import pytest
from core_table.combat import CombatPhase
from service.attack_resolver import AttackResult
from service.combat_engine import CombatEngine


@pytest.fixture(autouse=True)
def clean_state():
    CombatEngine._active.clear()
    yield
    CombatEngine._active.clear()


def test_start_combat_creates_state():
    state = CombatEngine.start_combat('sess1', 't1', ['e1', 'e2'])
    assert state.phase == CombatPhase.ACTIVE
    assert len(state.combatants) == 2
    assert CombatEngine.get_state('sess1') is state


def test_end_combat_removes_state():
    CombatEngine.start_combat('sess1', 't1', ['e1'])
    ended = CombatEngine.end_combat('sess1')
    assert ended is not None
    assert ended.phase == CombatPhase.ENDED
    assert CombatEngine.get_state('sess1') is None


def test_end_combat_no_active():
    result = CombatEngine.end_combat('no_session')
    assert result is None


def test_turn_advancement():
    state = CombatEngine.start_combat('sess1', 't1', ['e1', 'e2'])
    c0 = state.get_current_combatant()
    assert c0 is not None
    combatant_id = c0.combatant_id
    ok = CombatEngine.end_turn('sess1', combatant_id)
    assert ok
    c1 = state.get_current_combatant()
    assert c1 is not None
    assert c1.combatant_id != combatant_id


def test_end_turn_wrong_combatant():
    CombatEngine.start_combat('sess1', 't1', ['e1', 'e2'])
    ok = CombatEngine.end_turn('sess1', 'wrong-id')
    assert not ok


def test_apply_damage():
    state = CombatEngine.start_combat('sess1', 't1', ['e1'])
    state.combatants[0].hp = 20
    state.combatants[0].max_hp = 20
    cid = state.combatants[0].combatant_id
    result = CombatEngine.apply_damage('sess1', cid, 8)
    assert result['new_hp'] == 12
    assert not result['defeated']


def test_apply_damage_defeats():
    state = CombatEngine.start_combat('sess1', 't1', ['e1'])
    state.settings.death_saves_enabled = False  # NPCs / no death saves → immediate defeat
    state.combatants[0].hp = 5
    cid = state.combatants[0].combatant_id
    result = CombatEngine.apply_damage('sess1', cid, 10)
    assert result['new_hp'] == 0
    assert result['defeated']


def test_apply_damage_absorbs_temp_hp():
    state = CombatEngine.start_combat('sess1', 't1', ['e1'])
    state.combatants[0].hp = 10
    state.combatants[0].temp_hp = 5
    cid = state.combatants[0].combatant_id
    result = CombatEngine.apply_damage('sess1', cid, 8)
    assert result['absorbed'] == 5
    assert result['new_hp'] == 7  # 5 temp absorbed, 3 real damage


def test_apply_healing():
    state = CombatEngine.start_combat('sess1', 't1', ['e1'])
    state.combatants[0].hp = 5
    state.combatants[0].max_hp = 20
    cid = state.combatants[0].combatant_id
    result = CombatEngine.apply_healing('sess1', cid, 8)
    assert result['new_hp'] == 13


def test_dm_set_hp():
    state = CombatEngine.start_combat('sess1', 't1', ['e1'])
    state.combatants[0].max_hp = 20
    cid = state.combatants[0].combatant_id
    assert CombatEngine.dm_set_hp('sess1', cid, 15)
    assert state.combatants[0].hp == 15


def test_dm_grant_resource_action():
    state = CombatEngine.start_combat('sess1', 't1', ['e1'])
    cid = state.combatants[0].combatant_id
    state.combatants[0].has_action = False
    assert CombatEngine.dm_grant_resource('sess1', cid, 'action')
    assert state.combatants[0].has_action


def test_set_initiative():
    state = CombatEngine.start_combat('sess1', 't1', ['e1', 'e2'])
    cid = state.combatants[0].combatant_id
    assert CombatEngine.set_initiative('sess1', cid, 18.0)
    assert state.combatants[0].initiative == 18.0


def test_add_combatant():
    CombatEngine.start_combat('sess1', 't1', ['e1'])
    c = CombatEngine.add_combatant('sess1', 'e2', name='Orc')
    assert c is not None
    assert c.entity_id == 'e2'


def test_remove_combatant():
    state = CombatEngine.start_combat('sess1', 't1', ['e1', 'e2'])
    cid = state.combatants[1].combatant_id
    removed = CombatEngine.remove_combatant('sess1', cid)
    assert removed
    assert len(state.combatants) == 1


def test_dm_revert_last_action():
    state = CombatEngine.start_combat('sess1', 't1', ['e1'])
    cid = state.combatants[0].combatant_id
    state.combatants[0].hp = 10
    import time

    from core_table.combat import CombatAction
    action = CombatAction(  # type: ignore[call-arg]
        action_id='a1', combat_id=state.combat_id, round_number=1,
        turn_index=0, actor_id=cid, action_type='attack',
        action_cost='action', damage_dealt=5,
        state_before={'combatant_id': cid, 'hp': 15},
        timestamp=time.time(),
    )
    CombatEngine.log_action('sess1', action)
    result = CombatEngine.dm_revert_last_action('sess1')
    assert result
    assert state.combatants[0].hp == 15


def test_new_round_ticks_conditions():
    import uuid

    from core_table.conditions import ActiveCondition, ConditionType
    state = CombatEngine.start_combat('sess1', 't1', ['e1', 'e2'])
    state.combatants[0].conditions.append(
        ActiveCondition(  # type: ignore[call-arg]
            condition_id=str(uuid.uuid4()), condition_type=ConditionType.POISONED,
            source='dm', duration_type='rounds', duration_remaining=1,
        )
    )
    # End both combatants' turns to trigger new round
    cids = [c.combatant_id for c in state.combatants]
    CombatEngine.end_turn('sess1', cids[0])
    CombatEngine.end_turn('sess1', cids[1])
    # Condition should have been ticked off
    assert not state.combatants[0].conditions


# ── execute_attack ────────────────────────────────────────────────────────────

def _make_hit(damage=8):
    from core_table.dice import DiceRollResult
    roll = DiceRollResult(formula='1d20+5', rolls=[10], modifier=5, total=15)
    return AttackResult(hit=True, damage_dealt=damage, attack_roll=roll)


def _make_miss():
    from core_table.dice import DiceRollResult
    roll = DiceRollResult(formula='1d20+5', rolls=[3], modifier=5, total=8)
    return AttackResult(hit=False, damage_dealt=0, attack_roll=roll, reason='Miss (8 vs AC 15)')


@pytest.fixture()
def two_combatant_state():
    state = CombatEngine.start_combat('s1', 't1', ['att', 'def'])
    state.combatants[0].hp = 20
    state.combatants[0].max_hp = 20
    state.combatants[1].hp = 20
    state.combatants[1].max_hp = 20
    state.combatants[1].armor_class = 15
    return state


def test_execute_attack_hit(two_combatant_state):
    state = two_combatant_state
    atk_id = state.combatants[0].combatant_id
    def_id = state.combatants[1].combatant_id

    with patch('service.attack_resolver.AttackResolver') as MockAR:
        MockAR.return_value.resolve_attack.return_value = _make_hit(8)
        result = CombatEngine.execute_attack('s1', atk_id, def_id, 5, '1d8', 'slashing')

    assert result['hit'] is True
    assert result['damage_dealt'] == 8
    assert state.combatants[1].hp == 12
    assert not state.combatants[0].has_action  # action consumed


def test_execute_attack_miss(two_combatant_state):
    state = two_combatant_state
    atk_id = state.combatants[0].combatant_id
    def_id = state.combatants[1].combatant_id

    with patch('service.attack_resolver.AttackResolver') as MockAR:
        MockAR.return_value.resolve_attack.return_value = _make_miss()
        result = CombatEngine.execute_attack('s1', atk_id, def_id, 5, '1d8', 'slashing')

    assert result['hit'] is False
    assert state.combatants[1].hp == 20  # no damage
    assert not state.combatants[0].has_action  # action still consumed


def test_execute_attack_no_action(two_combatant_state):
    state = two_combatant_state
    atk_id = state.combatants[0].combatant_id
    def_id = state.combatants[1].combatant_id
    state.combatants[0].has_action = False
    state.combatants[0].attacks_used_this_action = 1

    result = CombatEngine.execute_attack('s1', atk_id, def_id, 5, '1d8', 'slashing')
    assert 'error' in result


def test_execute_attack_target_defeated(two_combatant_state):
    state = two_combatant_state
    atk_id = state.combatants[0].combatant_id
    def_id = state.combatants[1].combatant_id
    state.combatants[1].is_defeated = True

    result = CombatEngine.execute_attack('s1', atk_id, def_id, 5, '1d8', 'slashing')
    assert 'error' in result


def test_execute_attack_missing_session():
    result = CombatEngine.execute_attack('no_sess', 'a', 'b', 5, '1d6', 'slashing')
    assert result.get('error') == 'No active combat'


# ── execute_utility ───────────────────────────────────────────────────────────

def test_execute_utility_dash(two_combatant_state):
    state = two_combatant_state
    cid = state.combatants[0].combatant_id
    state.combatants[0].movement_speed = 30
    state.combatants[0].movement_remaining = 30

    result = CombatEngine.execute_utility('s1', cid, 'dash')
    assert 'error' not in result
    assert state.combatants[0].movement_remaining == 60
    assert not state.combatants[0].has_action


def test_execute_utility_dodge(two_combatant_state):
    state = two_combatant_state
    cid = state.combatants[0].combatant_id

    result = CombatEngine.execute_utility('s1', cid, 'dodge')
    assert 'error' not in result
    assert state.combatants[0].is_dodging is True
    assert not state.combatants[0].has_action


def test_execute_utility_disengage(two_combatant_state):
    state = two_combatant_state
    cid = state.combatants[0].combatant_id

    result = CombatEngine.execute_utility('s1', cid, 'disengage')
    assert 'error' not in result
    assert state.combatants[0].is_disengaging is True


def test_execute_utility_no_action(two_combatant_state):
    state = two_combatant_state
    cid = state.combatants[0].combatant_id
    state.combatants[0].has_action = False

    result = CombatEngine.execute_utility('s1', cid, 'dash')
    assert 'error' in result


def test_next_turn_resets_dodge_flags(two_combatant_state):
    state = two_combatant_state
    cid0 = state.combatants[0].combatant_id
    state.combatants[0].is_dodging = True
    state.combatants[0].is_disengaging = True
    state.combatants[0].attacks_used_this_action = 2

    CombatEngine.end_turn('s1', cid0)
    # Move back to combatant 0 to test reset on their next turn
    cid1 = state.combatants[1].combatant_id
    CombatEngine.end_turn('s1', cid1)

    assert state.combatants[0].is_dodging is False
    assert state.combatants[0].is_disengaging is False
    assert state.combatants[0].attacks_used_this_action == 0


# ── Persistence ───────────────────────────────────────────────────────────────

def test_persist_called_on_start_combat():
    with patch.object(CombatEngine, 'persist') as mock_persist:
        CombatEngine.start_combat('ps1', 't1', ['e1'])
        mock_persist.assert_called_once_with('ps1')


def test_persist_called_on_new_round():
    state = CombatEngine.start_combat('ps2', 't1', ['e1', 'e2'])
    cid0 = state.combatants[0].combatant_id
    cid1 = state.combatants[1].combatant_id

    with patch.object(CombatEngine, 'persist') as mock_persist:
        CombatEngine.end_turn('ps2', cid0)  # turn 1→2, no new round
        CombatEngine.end_turn('ps2', cid1)  # turn 2→0, new round → persist
        mock_persist.assert_called_once_with('ps2')


def test_persist_silently_ignores_db_errors():
    CombatEngine.start_combat('ps3', 't1', ['e1'])
    with patch('database.database.SessionLocal', side_effect=Exception('DB down')):
        CombatEngine.persist('ps3')  # must not raise


def test_restore_returns_none_when_no_db_record():
    mock_db = MagicMock()
    mock_ctx = MagicMock()
    mock_ctx.__enter__ = MagicMock(return_value=mock_db)
    mock_ctx.__exit__ = MagicMock(return_value=False)
    with patch('database.database.SessionLocal', return_value=mock_ctx):
        with patch('database.crud.load_active_combat_encounter', return_value=None):
            result = CombatEngine.restore('nonexistent_sess')
    assert result is None


def test_restore_returns_in_memory_state_without_db():
    state = CombatEngine.start_combat('rs1', 't1', ['e1'])
    # Already in memory — should never touch DB
    with patch('database.database.SessionLocal') as MockSL:
        result = CombatEngine.restore('rs1')
        MockSL.assert_not_called()
    assert result is state


# --- Multiattack / Extra Attack ---

def _two_combatant(session: str = 'ma'):
    CombatEngine._active.pop(session, None)
    state = CombatEngine.start_combat(session, 't', ['a', 'b'])
    a, b = state.combatants[0], state.combatants[1]
    a.hp = 50
    a.max_hp = 50
    b.hp = 50
    b.max_hp = 50
    return state, a, b

_ATTACK_HIT = AttackResult(hit=True, damage_dealt=5)


def test_multiattack_action_not_consumed_after_first_hit():
    state, a, b = _two_combatant('ma1')
    a.attacks_per_action = 2
    a.has_action = True

    with patch.object(CombatEngine, 'apply_damage', return_value={}):
        with patch('service.attack_resolver.AttackResolver') as MockAR:
            MockAR.return_value.resolve_attack.return_value = _ATTACK_HIT
            CombatEngine.execute_attack('ma1', a.combatant_id, b.combatant_id, 0, '1d6', 'slashing')

    assert a.has_action is True  # still has action after 1 of 2 attacks
    assert a.attacks_used_this_action == 1


def test_multiattack_action_consumed_after_all_attacks():
    state, a, b = _two_combatant('ma2')
    a.attacks_per_action = 2
    a.has_action = True

    with patch.object(CombatEngine, 'apply_damage', return_value={}):
        with patch('service.attack_resolver.AttackResolver') as MockAR:
            MockAR.return_value.resolve_attack.return_value = _ATTACK_HIT
            CombatEngine.execute_attack('ma2', a.combatant_id, b.combatant_id, 0, '1d6', 'slashing')
            CombatEngine.execute_attack('ma2', a.combatant_id, b.combatant_id, 0, '1d6', 'slashing')

    assert a.has_action is False  # action consumed after 2nd attack
    assert a.attacks_used_this_action == 2


def test_multiattack_third_attack_blocked():
    state, a, b = _two_combatant('ma3')
    a.attacks_per_action = 2
    a.has_action = True

    with patch.object(CombatEngine, 'apply_damage', return_value={}):
        with patch('service.attack_resolver.AttackResolver') as MockAR:
            MockAR.return_value.resolve_attack.return_value = _ATTACK_HIT
            CombatEngine.execute_attack('ma3', a.combatant_id, b.combatant_id, 0, '1d6', 'slashing')
            CombatEngine.execute_attack('ma3', a.combatant_id, b.combatant_id, 0, '1d6', 'slashing')
            result = CombatEngine.execute_attack('ma3', a.combatant_id, b.combatant_id, 0, '1d6', 'slashing')

    assert 'error' in result


def test_attacks_reset_on_new_turn():
    state, a, b = _two_combatant('ma4')
    a.attacks_per_action = 2
    a.attacks_used_this_action = 2
    a.has_action = False
    # Simulate next_turn cycling back to a's turn
    state.current_turn_index = 0
    state.combatants = [a, b]
    CombatEngine.next_turn('ma4')
    # Turn moved to b; now move to a again
    state.current_turn_index = 1
    CombatEngine.next_turn('ma4')
    assert a.attacks_used_this_action == 0
