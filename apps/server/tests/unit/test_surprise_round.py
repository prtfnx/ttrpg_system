"""Tests for surprise round mechanic."""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '../..'))

import pytest
from service.combat_engine import CombatEngine


@pytest.fixture(autouse=True)
def clean():
    CombatEngine._active.clear()
    yield
    CombatEngine._active.clear()


def test_set_surprised_marks_combatant():
    state = CombatEngine.start_combat('s', 't', ['e1', 'e2'])
    cid = state.combatants[0].combatant_id
    result = CombatEngine.set_surprised('s', [cid], surprised=True)
    assert result is not None
    assert cid in result['updated']
    assert state.combatants[0].surprised is True


def test_set_surprised_false_clears():
    state = CombatEngine.start_combat('s', 't', ['e1'])
    state.combatants[0].surprised = True
    cid = state.combatants[0].combatant_id
    CombatEngine.set_surprised('s', [cid], surprised=False)
    assert state.combatants[0].surprised is False


def test_surprised_combatant_skipped_round1():
    state = CombatEngine.start_combat('s', 't', ['e1', 'e2'])
    # Mark the second combatant surprised — they receive the next turn when next_turn() is called
    second = state.combatants[1]
    second.surprised = True
    CombatEngine.next_turn('s')
    # The skipped combatant should no longer be surprised
    assert second.surprised is False


def test_not_surprised_acts_normally():
    state = CombatEngine.start_combat('s', 't', ['e1', 'e2'])
    cid = state.combatants[0].combatant_id
    result = CombatEngine.end_turn('s', cid)
    assert result is True


def test_surprised_clears_after_round1():
    state = CombatEngine.start_combat('s', 't', ['e1'])
    state.combatants[0].surprised = True
    # Simulate round advancing to round 2 (index wraps to 0)
    state.round_number = 1
    CombatEngine.next_turn('s')  # wraps back to index 0 → round 2
    assert state.combatants[0].surprised is False
