"""Tests for CombatEngine."""
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '../..'))

import pytest
from core_table.combat import CombatPhase, CombatSettings
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
    from core_table.combat import CombatAction
    import time
    action = CombatAction(
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
    from core_table.conditions import ActiveCondition, ConditionType
    import uuid
    state = CombatEngine.start_combat('sess1', 't1', ['e1', 'e2'])
    state.combatants[0].conditions.append(
        ActiveCondition(
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
