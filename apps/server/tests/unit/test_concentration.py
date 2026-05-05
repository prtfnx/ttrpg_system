"""Tests for concentration auto-break mechanic."""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '../..'))

from unittest.mock import patch

import pytest
from core_table.dice import DiceRollResult
from service.combat_engine import CombatEngine


@pytest.fixture(autouse=True)
def clean():
    CombatEngine._active.clear()
    yield
    CombatEngine._active.clear()


def _concentrating(session='s', hp=20, spell='Bless'):
    state = CombatEngine.start_combat(session, 't', ['e'])
    c = state.combatants[0]
    c.hp = hp
    c.max_hp = hp
    c.concentration_spell = spell
    return state, c.combatant_id


def test_concentration_save_triggered_on_damage():
    _, cid = _concentrating()
    with patch('service.combat_engine.DiceEngine.roll') as mock:
        # con roll of 12 >= dc 5 (10 damage // 2) → save success
        mock.return_value = DiceRollResult(total=12, rolls=[12], modifier=0, formula='1d20')
        result = CombatEngine.apply_damage('s', cid, 10)
    # concentration_broken should not be in result if save passed
    assert 'concentration_broken' not in result


def test_concentration_breaks_on_failed_save():
    _, cid = _concentrating()
    with patch('service.combat_engine.DiceEngine.roll') as mock:
        # con roll of 3 < dc 5 (10 // 2) → fails
        mock.return_value = DiceRollResult(total=3, rolls=[3], modifier=0, formula='1d20')
        result = CombatEngine.apply_damage('s', cid, 10)
    assert result.get('concentration_broken') == 'Bless'
    state = CombatEngine.get_state('s')
    assert state is not None
    assert state.combatants[0].concentration_spell is None


def test_concentration_maintained_on_pass():
    _, cid = _concentrating()
    with patch('service.combat_engine.DiceEngine.roll') as mock:
        mock.return_value = DiceRollResult(total=20, rolls=[20], modifier=0, formula='1d20')
        result = CombatEngine.apply_damage('s', cid, 4)
    assert 'concentration_broken' not in result
    state = CombatEngine.get_state('s')
    assert state is not None
    assert state.combatants[0].concentration_spell == 'Bless'


def test_concentration_dc_minimum_10():
    _, cid = _concentrating()
    # 1 damage → dc should be max(10, 1//2=0) = 10
    with patch('service.combat_engine.DiceEngine.roll') as mock:
        mock.return_value = DiceRollResult(total=9, rolls=[9], modifier=0, formula='1d20')
        result = CombatEngine.apply_damage('s', cid, 1)
    # Roll 9 < dc 10 → breaks
    assert result.get('concentration_broken') == 'Bless'


def test_no_concentration_no_check():
    state = CombatEngine.start_combat('s', 't', ['e'])
    state.combatants[0].hp = 20
    state.combatants[0].max_hp = 20
    cid = state.combatants[0].combatant_id
    result = CombatEngine.apply_damage('s', cid, 5)
    assert 'concentration_broken' not in result
