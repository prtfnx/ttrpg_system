import random
import re
from dataclasses import dataclass
from typing import Optional


@dataclass
class DiceRollResult:
    total: int
    rolls: list[int]
    modifier: int
    formula: str
    is_critical: bool = False
    is_fumble: bool = False
    advantage: Optional[str] = None
    dropped_roll: Optional[int] = None

    def to_dict(self) -> dict:
        return {
            'total': self.total, 'rolls': self.rolls, 'modifier': self.modifier,
            'formula': self.formula, 'is_critical': self.is_critical,
            'is_fumble': self.is_fumble, 'advantage': self.advantage,
            'dropped_roll': self.dropped_roll,
        }


MAX_FORMULA_LENGTH = 200
MAX_FORMULA_TERMS = 10
MAX_DICE_PER_ROLL = 100
MAX_DIE_SIDES = 1000
MAX_ROLL_MODIFIER = 1_000_000
_FORMULA_RE = re.compile(r'[+-]?(?:\d*d\d+|\d+)(?:[+-](?:\d*d\d+|\d+))*')
_TERM_RE = re.compile(r'([+-]?)(?:(\d*)d(\d+)|(\d+))')


def validate_dice_formula(formula: str) -> tuple[tuple[tuple[int, int], ...], int]:
    """Parse a complete bounded expression without rolling or allocating dice."""
    if not isinstance(formula, str) or not 1 <= len(formula) <= MAX_FORMULA_LENGTH:
        raise ValueError('Dice formula must contain 1-200 characters')
    normalized = re.sub(r'\s+', '', formula).lower()
    if not _FORMULA_RE.fullmatch(normalized):
        raise ValueError('Dice formula must contain dice and integer modifiers joined by + or -')
    groups: list[tuple[int, int]] = []
    modifier = dice_count = term_count = 0
    for term in _TERM_RE.finditer(normalized):
        term_count += 1
        if term_count > MAX_FORMULA_TERMS:
            raise ValueError('Dice formula exceeds 10 terms')
        sign, count, sides, constant = term.groups()
        if sides is not None:
            count_value, sides_value = int(count or '1'), int(sides)
            if sign == '-' or not 1 <= count_value <= MAX_DICE_PER_ROLL:
                raise ValueError('Dice groups require 1-100 positive dice')
            if not 1 <= sides_value <= MAX_DIE_SIDES:
                raise ValueError('Die sides must be between 1 and 1000')
            dice_count += count_value
            if dice_count > MAX_DICE_PER_ROLL:
                raise ValueError('Dice formula exceeds 100 total dice')
            groups.append((count_value, sides_value))
        else:
            value = int(constant)
            if value > MAX_ROLL_MODIFIER:
                raise ValueError('Dice modifier exceeds 1000000')
            modifier += -value if sign == '-' else value
            if abs(modifier) > MAX_ROLL_MODIFIER:
                raise ValueError('Total dice modifier exceeds 1000000')
    return tuple(groups), modifier


def _parse_rolls(formula: str) -> tuple[list[int], int, int | None]:
    """Return rolls, modifier and the first d20's index after complete validation."""
    rolls: list[int] = []
    groups, mod = validate_dice_formula(formula)
    first_d20 = None
    for count, sides in groups:
        if sides == 20 and first_d20 is None:
            first_d20 = len(rolls)
        rolls.extend(random.randint(1, sides) for _ in range(count))
    return rolls, mod, first_d20


class DiceEngine:
    @staticmethod
    def roll(formula: str) -> DiceRollResult:
        rolls, mod, first_d20 = _parse_rolls(formula)
        total = sum(rolls) + mod
        # Check critical/fumble on first d20 group
        is_crit = is_fum = False
        if first_d20 is not None:
            is_crit = rolls[first_d20] == 20
            is_fum = rolls[first_d20] == 1
        return DiceRollResult(total=total, rolls=rolls, modifier=mod,
                              formula=formula, is_critical=is_crit, is_fumble=is_fum)

    @staticmethod
    def roll_with_advantage(formula: str) -> DiceRollResult:
        r1, r2 = DiceEngine.roll(formula), DiceEngine.roll(formula)
        winner, loser = (r1, r2) if r1.total >= r2.total else (r2, r1)
        winner.advantage = 'advantage'
        winner.dropped_roll = loser.total
        return winner

    @staticmethod
    def roll_with_disadvantage(formula: str) -> DiceRollResult:
        r1, r2 = DiceEngine.roll(formula), DiceEngine.roll(formula)
        winner, loser = (r1, r2) if r1.total <= r2.total else (r2, r1)
        winner.advantage = 'disadvantage'
        winner.dropped_roll = loser.total
        return winner

    @staticmethod
    def apply_critical(
        result: DiceRollResult, rule: str = 'double_dice', *, is_critical: bool | None = None,
    ) -> DiceRollResult:
        """Double the damage dice portion for a critical hit."""
        if not (result.is_critical if is_critical is None else is_critical):
            return result
        if rule not in {'double_dice', 'max_dice', 'double_total'}:
            raise ValueError('Unsupported critical hit rule')
        groups, _ = validate_dice_formula(result.formula)
        result.is_critical = True
        if rule == 'double_dice':
            extra = [random.randint(1, sides) for count, sides in groups for _ in range(count)]
            result.rolls.extend(extra)
            result.total += sum(extra)
        elif rule == 'max_dice':
            result.total = result.modifier + sum(count * sides for count, sides in groups)
        elif rule == 'double_total':
            result.total *= 2
        return result
