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


_DICE_RE = re.compile(r'(\d+)d(\d+)')
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


def _parse_rolls(formula: str) -> tuple[list[int], int]:
    """Return (all rolls combined, total modifier) for a formula like '2d6+1d8+3'."""
    rolls: list[int] = []
    groups, mod = validate_dice_formula(formula)
    for count, sides in groups:
        rolls.extend(random.randint(1, sides) for _ in range(count))
    return rolls, mod


class DiceEngine:
    @staticmethod
    def roll(formula: str) -> DiceRollResult:
        rolls, mod = _parse_rolls(formula)
        total = sum(rolls) + mod
        # Check critical/fumble on first d20 group
        is_crit = is_fum = False
        d20_match = re.search(r'(\d+)d20', formula)
        if d20_match and rolls:
            is_crit = rolls[0] == 20
            is_fum = rolls[0] == 1
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
    def apply_critical(result: DiceRollResult, rule: str = 'double_dice') -> DiceRollResult:
        """Double the damage dice portion for a critical hit."""
        if not result.is_critical:
            return result
        if rule == 'double_dice':
            extra = sum(result.rolls)
            result.total += extra
        elif rule == 'max_dice':
            result.total = max(result.total, result.modifier + sum(
                int(m.group(1)) * int(m.group(2))
                for m in _DICE_RE.finditer(result.formula)
            ))
        elif rule == 'double_total':
            result.total *= 2
        return result
