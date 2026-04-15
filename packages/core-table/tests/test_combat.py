"""Tests for combat data models and CombatFSM."""
import pytest
from typing import Any
from core_table.combat import (
    CombatPhase, CombatState, CombatSettings, Combatant, CombatAction, DamageType
)
from core_table.combat_fsm import CombatFSM
from core_table.conditions import ActiveCondition, ConditionType


def make_combatant(**kwargs: Any) -> Combatant:
    defaults: dict[str, Any] = dict(combatant_id='c1', entity_id='e1', name='Hero', initiative=15.0,
                    hp=30, max_hp=30, armor_class=14, movement_speed=30, movement_remaining=30)
    defaults.update(kwargs)
    return Combatant(**defaults)


def make_state() -> CombatState:
    c1 = make_combatant(combatant_id='c1', entity_id='e1', name='Fighter', initiative=20.0)
    c2 = make_combatant(combatant_id='c2', entity_id='e2', name='Goblin', initiative=12.0, is_npc=True)
    state = CombatState(
        combat_id='test-id', session_id='sess1', table_id='t1',
        phase=CombatPhase.ACTIVE, round_number=1,
        combatants=[c1, c2],
    )
    return state


def test_combatant_serialization():
    c = make_combatant()
    d = c.to_dict()
    restored = Combatant.from_dict(d)
    assert restored.combatant_id == c.combatant_id
    assert restored.hp == c.hp


def test_combatant_hp_visibility_descriptor():
    c = make_combatant(is_npc=True, hp=10, max_hp=20)
    d = c.to_dict_for_player('descriptor')
    assert 'hp_descriptor' in d
    assert d.get('hp') is None  # hidden


def test_combatant_hp_visibility_full():
    c = make_combatant(is_npc=True, hp=10, max_hp=20)
    d = c.to_dict_for_player('full')
    assert d['hp'] == 10


def test_combat_state_active_combatants_skips_defeated():
    state = make_state()
    state.combatants[1].is_defeated = True
    active = state.active_combatants()
    assert len(active) == 1
    assert active[0].combatant_id == 'c1'


def test_combat_state_get_current():
    state = make_state()
    current = state.get_current_combatant()
    assert current is not None
    assert current.combatant_id == state.combatants[0].combatant_id


def test_combat_state_serialization():
    state = make_state()
    d = state.to_dict()
    restored = CombatState.from_dict(d)
    assert restored.combat_id == state.combat_id
    assert len(restored.combatants) == 2


def test_combat_fsm_transition_to_active():
    state = make_state()
    state.phase = CombatPhase.SETUP
    fsm = CombatFSM(state)
    fsm.transition(CombatPhase.ACTIVE, state.settings)
    assert state.phase == CombatPhase.ACTIVE


def test_combat_fsm_invalid_transition():
    state = make_state()
    state.phase = CombatPhase.INACTIVE
    fsm = CombatFSM(state)
    result = fsm.transition(CombatPhase.ENDED)  # not valid from INACTIVE
    assert result is False
    assert state.phase == CombatPhase.INACTIVE  # unchanged


def test_combat_fsm_force_end():
    state = make_state()
    state.phase = CombatPhase.ACTIVE
    fsm = CombatFSM(state)
    fsm.force_end()
    assert state.phase == CombatPhase.INACTIVE  # force_end goes to INACTIVE


def _make_cond(ctype: ConditionType) -> ActiveCondition:
    import uuid
    return ActiveCondition(
        condition_id=str(uuid.uuid4()), condition_type=ctype,
        source='dm', duration_type='permanent',
    )


def test_conditions_on_combatant():
    c = make_combatant()
    c.conditions.append(_make_cond(ConditionType.POISONED))
    assert ConditionType.POISONED.value in c.condition_types()
    assert c.can_act()  # poisoned doesn't incapacitate


def test_incapacitated_cannot_act():
    c = make_combatant()
    c.conditions.append(_make_cond(ConditionType.STUNNED))
    assert not c.can_act()
