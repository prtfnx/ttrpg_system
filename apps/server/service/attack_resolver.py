from __future__ import annotations
from dataclasses import dataclass, field
from typing import Optional

from core_table.combat import Combatant, CombatState, DamageType
from core_table.dice import DiceEngine, DiceRollResult
from core_table.session_rules import SessionRules


@dataclass
class AttackResult:
    hit: bool
    is_critical: bool = False
    is_fumble: bool = False
    attack_roll: Optional[DiceRollResult] = None
    damage_roll: Optional[DiceRollResult] = None
    damage_dealt: int = 0
    reason: str = ""


@dataclass
class SaveResult:
    success: bool
    roll: Optional[DiceRollResult] = None
    dc: int = 0


INCAPACITATING_COND = {'paralyzed', 'unconscious'}


class AttackResolver:
    def __init__(self, rules: SessionRules):
        self.rules = rules

    def resolve_attack(
        self, attacker: Combatant, target: Combatant,
        attack_bonus: int, damage_formula: str,
        damage_type: str = 'bludgeoning',
        advantage: bool = False, disadvantage: bool = False,
        combat: Optional[CombatState] = None,
    ) -> AttackResult:
        # Advantage/disadvantage from conditions
        conds = attacker.condition_types()
        target_conds = target.condition_types()
        if 'poisoned' in conds or 'frightened' in conds:
            disadvantage = True
        if 'blinded' in conds:
            disadvantage = True
        if 'invisible' in conds:
            advantage = True
        # Prone: melee has advantage, ranged has disadvantage
        if 'prone' in target_conds:
            advantage = True  # simplified: assume melee

        # Roll attack
        formula = f'1d20+{attack_bonus}' if attack_bonus >= 0 else f'1d20{attack_bonus}'
        if advantage and not disadvantage:
            roll = DiceEngine.roll_with_advantage(formula)
        elif disadvantage and not advantage:
            roll = DiceEngine.roll_with_disadvantage(formula)
        else:
            roll = DiceEngine.roll(formula)

        if roll.is_fumble and not (advantage and not disadvantage):
            return AttackResult(hit=False, is_fumble=True, attack_roll=roll, reason="Natural 1")

        hit = roll.is_critical or (roll.total >= target.armor_class)
        if not hit:
            return AttackResult(hit=False, attack_roll=roll, reason=f"Miss ({roll.total} vs AC {target.armor_class})")

        # Incapacitated targets: crits at melee
        is_crit = roll.is_critical or any(t in target_conds for t in INCAPACITATING_COND)
        dmg_roll = DiceEngine.roll(damage_formula)
        if is_crit:
            dmg_roll = DiceEngine.apply_critical(dmg_roll, self.rules.critical_hit_rule)

        return AttackResult(
            hit=True, is_critical=is_crit, attack_roll=roll,
            damage_roll=dmg_roll, damage_dealt=max(0, dmg_roll.total),
        )

    def resolve_saving_throw(
        self, combatant: Combatant, ability: str, dc: int,
        bonus: int = 0
    ) -> SaveResult:
        roll = DiceEngine.roll(f'1d20+{bonus}')
        return SaveResult(success=roll.total >= dc, roll=roll, dc=dc)
