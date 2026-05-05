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
_MOD_RE = re.compile(r'([+-]\d+)$')


def _parse_rolls(formula: str) -> tuple[list[int], int]:
    """Return (all rolls combined, total modifier) for a formula like '2d6+1d8+3'."""
    rolls: list[int] = []
    mod = 0
    for m in _MOD_RE.finditer(formula):
        mod += int(m.group(1))
    for m in _DICE_RE.finditer(formula):
        count, sides = int(m.group(1)), int(m.group(2))
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
