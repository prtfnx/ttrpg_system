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


def test_apply_critical_rolls_extra_dice_without_doubling_modifier(monkeypatch):
    rolls = iter([2, 5])
    monkeypatch.setattr('core_table.dice.random.randint', lambda *_args: next(rolls))
    result = DiceEngine.roll('1d6+3')
    crit = DiceEngine.apply_critical(result, 'double_dice', is_critical=True)
    assert crit.rolls == [2, 5]
    assert crit.total == 10
    assert crit.modifier == 3
    assert crit.is_critical


@pytest.mark.parametrize(('rule', 'total'), [('max_dice', 9), ('double_total', 10)])
def test_critical_rule_totals(monkeypatch, rule, total):
    monkeypatch.setattr('core_table.dice.random.randint', lambda *_args: 2)
    result = DiceEngine.apply_critical(DiceEngine.roll('1d6+3'), rule, is_critical=True)
    assert result.total == total


@pytest.mark.parametrize('formula', ['d20', '1D20', '1d20+3'])
def test_supported_d20_spelling_retains_natural_critical_flags(monkeypatch, formula):
    monkeypatch.setattr('core_table.dice.random.randint', lambda *_args: 20)
    assert DiceEngine.roll(formula).is_critical


def test_is_fumble():
    DiceEngine.roll('1d20')
    # force a 1
    from core_table.dice import DiceRollResult
    r = DiceRollResult(total=1, rolls=[1], modifier=0, formula='1d20', is_critical=False, is_fumble=True)
    assert r.is_fumble is True


def test_roll_zero_modifier():
    result = DiceEngine.roll('1d4')
    assert result.modifier == 0
    assert 1 <= result.total <= 4


@pytest.mark.parametrize('formula', [
    '1000000000d6', '51d6+50d8', '1d0', '1d1001', '0d6', '1d6junk',
    '1d6+-2', '1d6-1d4', '', '1d6+1000001', '1d6+600000+600000',
    '+'.join(['1d6'] * 11), '1' * 201,
])
def test_invalid_or_excessive_formula_is_rejected_before_rng(monkeypatch, formula):
    def forbidden(*_args):
        pytest.fail('invalid formulas must not roll any dice')

    monkeypatch.setattr('core_table.dice.random.randint', forbidden)
    with pytest.raises(ValueError):
        DiceEngine.roll(formula)


@pytest.mark.parametrize(('formula', 'dice_count', 'modifier'), [
    ('100d1000', 100, 0), ('2d6 + 1d8 - 3 + 2', 3, -1),
    ('d6+0', 1, 0), ('4', 0, 4), ('1D20-3', 1, -3),
])
def test_complete_bounded_formula_contract(formula, dice_count, modifier):
    result = DiceEngine.roll(formula)
    assert len(result.rolls) == dice_count
    assert result.modifier == modifier
    assert result.total == sum(result.rolls) + modifier
