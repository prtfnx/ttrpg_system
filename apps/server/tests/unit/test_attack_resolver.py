"""Tests for AttackResolver."""
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '../..'))

import pytest
from unittest.mock import patch
from core_table.session_rules import SessionRules
from core_table.combat import Combatant
from core_table.conditions import ActiveCondition, ConditionType
from core_table.dice import DiceRollResult
from service.attack_resolver import AttackResolver


@pytest.fixture
def rules():
    return SessionRules.defaults('test')


@pytest.fixture
def resolver(rules):
    return AttackResolver(rules)


def make_attacker(**kw) -> Combatant:
    return Combatant(
        combatant_id='att', entity_id='e_att', name='Attacker',
        hp=30, max_hp=30, armor_class=14, movement_speed=30, movement_remaining=30,
        **kw,
    )


def make_target(ac: int = 14, **kw) -> Combatant:
    return Combatant(
        combatant_id='tgt', entity_id='e_tgt', name='Target',
        hp=20, max_hp=20, armor_class=ac, movement_speed=30, movement_remaining=30,
        **kw,
    )


def test_attack_hit_or_miss(resolver):
    attacker = make_attacker()
    target = make_target(ac=10)
    # Pin dice: roll 10 on d20 (total=20 beats AC 10), then roll damage
    with patch('service.attack_resolver.DiceEngine.roll', side_effect=[
        DiceRollResult(total=20, rolls=[10], modifier=10, formula='1d20+10'),
        DiceRollResult(total=6,  rolls=[3],  modifier=3,  formula='1d6+3'),
    ]):
        result = resolver.resolve_attack(attacker=attacker, target=target, attack_bonus=10, damage_formula='1d6+3')
    assert result.hit is True
    assert result.damage_dealt == 6


def test_attack_auto_miss_on_one(resolver):
    attacker = make_attacker()
    target = make_target(ac=1)
    # Force a natural 1 by checking a large sample
    import random
    random.seed(1)
    misses = 0
    for _ in range(100):
        r = resolver.resolve_attack(attacker=attacker, target=target, attack_bonus=100, damage_formula='1d6')
        if not r.hit:
            misses += 1
    assert misses > 0  # Some should be natural 1s


def test_incapacitated_target_auto_crit(resolver):
    import uuid
    attacker = make_attacker()
    target = make_target()
    target.conditions.append(ActiveCondition(
        condition_id=str(uuid.uuid4()),
        condition_type=ConditionType.PARALYZED,
        source='dm', duration_type='permanent',
    ))
    result = resolver.resolve_attack(attacker=attacker, target=target, attack_bonus=100, damage_formula='1d6')
    assert result.is_critical


def test_saving_throw_success(resolver):
    target = make_target()
    result = resolver.resolve_saving_throw(combatant=target, ability='dex', dc=1, bonus=100)
    assert result.success


def test_saving_throw_failure(resolver):
    target = make_target()
    result = resolver.resolve_saving_throw(combatant=target, ability='dex', dc=30, bonus=-100)
    assert not result.success
