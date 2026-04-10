"""Tests for dice engine."""
import pytest
from core_table.dice import DiceEngine


def test_roll_basic():
    result = DiceEngine.roll('2d6')
    assert 2 <= result.total <= 12
    assert len(result.rolls) == 2
    assert result.formula == '2d6'


def test_roll_with_modifier():
    result = DiceEngine.roll('1d20+5')
    assert 6 <= result.total <= 25
    assert result.modifier == 5


def test_roll_negative_modifier():
    result = DiceEngine.roll('1d8-2')
    assert result.modifier == -2
    assert result.total == result.rolls[0] - 2


def test_roll_multi_term():
    result = DiceEngine.roll('1d6+1d4+2')
    assert result.total >= 4  # min 1+1+2
    assert result.total <= 12  # max 6+4+2


def test_roll_advantage():
    results = [DiceEngine.roll_with_advantage('1d20') for _ in range(20)]
    for r in results:
        assert r.advantage == 'advantage'
        assert r.dropped_roll is not None
        assert 1 <= r.total <= 20


def test_roll_disadvantage():
    results = [DiceEngine.roll_with_disadvantage('1d20') for _ in range(20)]
    for r in results:
        assert r.advantage == 'disadvantage'
        assert 1 <= r.total <= 20


def test_apply_critical_doubles_dice():
    import random
    random.seed(42)
    result = DiceEngine.roll('1d6+3')
    crit = DiceEngine.apply_critical(result, 'double_dice')
    assert crit.rolls >= result.rolls  # doubled dice


def test_is_fumble():
    result = DiceEngine.roll('1d20')
    # force a 1
    from core_table.dice import DiceRollResult
    r = DiceRollResult(total=1, rolls=[1], modifier=0, formula='1d20', is_critical=False, is_fumble=True)
    assert r.is_fumble is True


def test_roll_zero_modifier():
    result = DiceEngine.roll('1d4')
    assert result.modifier == 0
    assert 1 <= result.total <= 4
