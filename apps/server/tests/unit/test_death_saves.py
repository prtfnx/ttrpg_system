"""Tests for death saving throws in CombatEngine."""
import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '../..'))

import pytest
from unittest.mock import patch
from service.combat_engine import CombatEngine
from core_table.combat import CombatSettings


@pytest.fixture(autouse=True)
def clean():
    CombatEngine._active.clear()
    yield
    CombatEngine._active.clear()


def _downed(session='s', entity='e1', max_hp=10):
    state = CombatEngine.start_combat(session, 't', [entity])
    c = state.combatants[0]
    c.max_hp = max_hp
    c.hp = 0
    return state, c.combatant_id


def test_dst_triggered_on_downed_combatant():
    _, cid = _downed()
    result = CombatEngine.roll_death_save('s', cid)
    assert result is not None
    assert 'result' in result


def test_dst_not_triggered_when_above_zero_hp():
    state = CombatEngine.start_combat('s', 't', ['e'])
    state.combatants[0].hp = 5
    cid = state.combatants[0].combatant_id
    result = CombatEngine.roll_death_save('s', cid)
    assert result is None


def test_dst_3_successes_stabilize():
    _, cid = _downed()
    with patch('service.combat_engine.DiceEngine.roll') as mock:
        from core_table.dice import DiceRollResult
        mock.return_value = DiceRollResult(total=15, rolls=[15], modifier=0, formula='1d20')
        CombatEngine.roll_death_save('s', cid)
        CombatEngine.roll_death_save('s', cid)
        result = CombatEngine.roll_death_save('s', cid)
    assert result is not None
    assert result['result'] == 'stable'
    state = CombatEngine.get_state('s')
    assert state is not None
    c = state.combatants[0]
    assert c.death_save_successes == 0
    assert c.death_save_failures == 0


def test_dst_3_failures_kill():
    _, cid = _downed()
    with patch('service.combat_engine.DiceEngine.roll') as mock:
        from core_table.dice import DiceRollResult
        mock.return_value = DiceRollResult(total=5, rolls=[5], modifier=0, formula='1d20')
        CombatEngine.roll_death_save('s', cid)
        CombatEngine.roll_death_save('s', cid)
        result = CombatEngine.roll_death_save('s', cid)
    assert result is not None
    assert result['result'] == 'dead'
    state = CombatEngine.get_state('s')
    assert state is not None
    assert state.combatants[0].is_defeated


def test_dst_nat20_heals_to_1hp():
    _, cid = _downed()
    with patch('service.combat_engine.DiceEngine.roll') as mock:
        from core_table.dice import DiceRollResult
        mock.return_value = DiceRollResult(total=20, rolls=[20], modifier=0, formula='1d20')
        result = CombatEngine.roll_death_save('s', cid)
    assert result is not None
    assert result['result'] == 'stabilized'
    state = CombatEngine.get_state('s')
    assert state is not None
    assert state.combatants[0].hp == 1


def test_dst_nat1_counts_as_two_failures():
    _, cid = _downed()
    with patch('service.combat_engine.DiceEngine.roll') as mock:
        from core_table.dice import DiceRollResult
        mock.return_value = DiceRollResult(total=1, rolls=[1], modifier=0, formula='1d20')
        CombatEngine.roll_death_save('s', cid)
    state = CombatEngine.get_state('s')
    assert state is not None
    assert state.combatants[0].death_save_failures == 2


def test_dst_disabled_by_session_rules():
    state = CombatEngine.start_combat('s', 't', ['e'])
    state.settings.death_saves_enabled = False
    state.combatants[0].hp = 0
    cid = state.combatants[0].combatant_id
    result = CombatEngine.roll_death_save('s', cid)
    assert result is None
