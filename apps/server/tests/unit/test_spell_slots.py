"""Tests for spell slot tracking in CombatEngine / SpellResolver."""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..'))

from service.combat_engine import CombatEngine


def _caster(session: str = 'sp', spell_slots: dict | None = None):
    """Start a combat and return (state, combatant_id) with spell slots configured."""
    CombatEngine._active.pop(session, None)
    state = CombatEngine.start_combat(session, 'table', ['e'])
    c = state.combatants[0]
    c.hp = 30
    c.max_hp = 30
    c.has_action = True
    slots = spell_slots if spell_slots is not None else {1: 2, 2: 1}
    c.spell_slots = dict(slots)
    c.spell_slots_max = dict(slots)
    return state, c.combatant_id


# --- SpellResolver slot enforcement ---

def test_spell_slot_consumed_on_cast():
    state, cid = _caster('sc1', {1: 2})
    result = CombatEngine.execute_spell('sc1', cid, 'Magic Missile', 1, [])
    assert 'error' not in result
    c = state.combatants[0]
    assert c.spell_slots[1] == 1  # one consumed


def test_no_slots_returns_error():
    state, cid = _caster('sc2', {1: 0})
    result = CombatEngine.execute_spell('sc2', cid, 'Magic Missile', 1, [])
    assert 'error' in result
    assert 'slot' in result['error'].lower()


def test_cantrip_level_0_never_consumes_slots():
    state, cid = _caster('sc3', {})  # no slots at all
    result = CombatEngine.execute_spell('sc3', cid, 'Fire Bolt', 0, [])
    assert 'error' not in result


def test_slots_remaining_returned_in_result():
    state, cid = _caster('sc4', {2: 3})
    result = CombatEngine.execute_spell('sc4', cid, 'Hold Person', 2, [], is_concentration=True)
    assert result.get('slots_remaining') == 2  # 3 - 1


def test_consecutive_casts_deplete_slots():
    state, cid = _caster('sc5', {1: 2})
    CombatEngine.execute_spell('sc5', cid, 'Sleep', 1, [])
    state.combatants[0].has_action = True  # re-grant action for test
    CombatEngine.execute_spell('sc5', cid, 'Sleep', 1, [])
    state.combatants[0].has_action = True
    result = CombatEngine.execute_spell('sc5', cid, 'Sleep', 1, [])
    assert 'error' in result  # 3rd cast fails


def test_no_action_blocks_spell():
    state, cid = _caster('sc6', {1: 1})
    state.combatants[0].has_action = False
    result = CombatEngine.execute_spell('sc6', cid, 'Magic Missile', 1, [])
    assert result.get('error') == 'No action remaining'


# --- DM restore_spell_slot ---

def test_dm_restore_spell_slot():
    state, cid = _caster('sr1', {1: 0})
    state.combatants[0].spell_slots_max = {1: 2}
    result = CombatEngine.restore_spell_slot('sr1', cid, 1)
    assert result.get('slots_remaining') == 1
    assert state.combatants[0].spell_slots[1] == 1


def test_dm_restore_capped_at_max():
    state, cid = _caster('sr2', {1: 2})
    state.combatants[0].spell_slots_max = {1: 2}
    result = CombatEngine.restore_spell_slot('sr2', cid, 1)
    assert result.get('slots_remaining') == 2  # already max, stays at 2


def test_dm_restore_unknown_level_returns_error():
    state, cid = _caster('sr3', {})
    result = CombatEngine.restore_spell_slot('sr3', cid, 5)
    assert 'error' in result


def test_dm_restore_no_combat_returns_error():
    CombatEngine._active.pop('sr4', None)
    result = CombatEngine.restore_spell_slot('sr4', 'x', 1)
    assert result.get('error') == 'No active combat'


# --- Concentration set on spell cast ---

def test_concentration_set_on_spell():
    state, cid = _caster('sc7', {1: 1})  # level-1 slot for Bless
    CombatEngine.execute_spell('sc7', cid, 'Bless', 1, [], is_concentration=True)
    assert state.combatants[0].concentration_spell == 'Bless'


def test_concentration_dropped_when_new_concentration_spell():
    state, cid = _caster('sc8', {1: 2})
    state.combatants[0].concentration_spell = 'Bless'
    state.combatants[0].has_action = True
    # cast a different concentration spell
    result = CombatEngine.execute_spell('sc8', cid, 'Hold Person', 1, [], is_concentration=True)
    assert 'error' not in result
    assert state.combatants[0].concentration_spell == 'Hold Person'
