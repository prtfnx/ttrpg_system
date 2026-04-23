"""Tests for damage resistance, vulnerability, and immunity."""
import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '../..'))

import pytest
from service.combat_engine import CombatEngine


@pytest.fixture(autouse=True)
def clean():
    CombatEngine._active.clear()
    yield
    CombatEngine._active.clear()


def _state_with_combatant(hp=20):
    state = CombatEngine.start_combat('s', 't', ['e'])
    c = state.combatants[0]
    c.hp = hp
    c.max_hp = hp
    return state, c.combatant_id


def test_resistance_halves_damage():
    state, cid = _state_with_combatant(20)
    state.combatants[0].damage_resistances = ['fire']
    result = CombatEngine.apply_damage('s', cid, 10, damage_type='fire')
    assert result['new_hp'] == 15  # 10 // 2 = 5 damage


def test_vulnerability_doubles_damage():
    state, cid = _state_with_combatant(20)
    state.combatants[0].damage_vulnerabilities = ['cold']
    result = CombatEngine.apply_damage('s', cid, 6, damage_type='cold')
    assert result['new_hp'] == 8  # 6 * 2 = 12 damage


def test_immunity_negates_damage():
    state, cid = _state_with_combatant(20)
    state.combatants[0].damage_immunities = ['poison']
    result = CombatEngine.apply_damage('s', cid, 15, damage_type='poison')
    assert result['new_hp'] == 20
    assert result.get('immune') is True


def test_no_dtype_applies_full_damage():
    state, cid = _state_with_combatant(20)
    state.combatants[0].damage_resistances = ['fire']
    result = CombatEngine.apply_damage('s', cid, 10)  # no dtype
    assert result['new_hp'] == 10  # full damage


def test_multiple_resistances():
    state, cid = _state_with_combatant(20)
    state.combatants[0].damage_resistances = ['fire', 'cold']
    CombatEngine.apply_damage('s', cid, 4, damage_type='fire')
    result = CombatEngine.apply_damage('s', cid, 4, damage_type='cold')
    # 20 - 2 (fire) - 2 (cold) = 16
    assert result['new_hp'] == 16


def test_set_resistances():
    state, cid = _state_with_combatant(20)
    result = CombatEngine.set_resistances('s', cid, resistances=['fire'], immunities=['poison'])
    assert result is not None
    assert 'fire' in result['damage_resistances']
    assert 'poison' in result['damage_immunities']
