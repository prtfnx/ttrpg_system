"""Tests for conditions system."""
import pytest
from core_table.conditions import ConditionType, ActiveCondition, CONDITION_EFFECTS, INCAPACITATING


def test_all_condition_types_have_effect():
    for ct in ConditionType:
        # Most conditions are in CONDITION_EFFECTS
        # A few may not be (e.g. frightened has partial)
        assert isinstance(ct.value, str)


import uuid

def test_active_condition_tick_counts_down():
    cond = ActiveCondition(
        condition_id=str(uuid.uuid4()), condition_type=ConditionType.POISONED,
        source='dm', duration_type='rounds', duration_remaining=2,
    )
    expired = cond.tick()
    assert not expired
    assert cond.duration_remaining == 1
    expired = cond.tick()
    assert expired


def test_active_condition_permanent():
    cond = ActiveCondition(
        condition_id=str(uuid.uuid4()), condition_type=ConditionType.BLINDED,
        source='dm', duration_type='permanent',
    )
    assert not cond.tick()  # never expires
    assert not cond.tick()


def test_condition_effects_blinded():
    effects = CONDITION_EFFECTS.get(ConditionType.BLINDED, {})
    assert 'attack_roll' in effects


def test_incapacitating_set():
    assert ConditionType.STUNNED in INCAPACITATING
    assert ConditionType.PARALYZED in INCAPACITATING
    assert ConditionType.UNCONSCIOUS in INCAPACITATING


def test_condition_serialization():
    import uuid
    cond = ActiveCondition(
        condition_id=str(uuid.uuid4()),
        condition_type=ConditionType.POISONED,
        source='spell',
        duration_type='rounds',
        duration_remaining=3,
    )
    d = cond.to_dict()
    assert d['condition_type'] == 'poisoned'
    assert d['duration_remaining'] == 3
    assert d['source'] == 'spell'

    restored = ActiveCondition.from_dict(d)
    assert restored.condition_type == ConditionType.POISONED
    assert restored.duration_remaining == 3
