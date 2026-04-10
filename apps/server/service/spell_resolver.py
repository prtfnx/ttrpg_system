from __future__ import annotations
import uuid
from dataclasses import dataclass, field
from typing import Optional

from core_table.combat import Combatant, CombatState
from core_table.dice import DiceEngine, DiceRollResult
from core_table.session_rules import SessionRules
from .attack_resolver import AttackResolver, SaveResult


@dataclass
class SpellResult:
    success: bool
    slot_used: int = 0
    targets_hit: list[str] = field(default_factory=list)
    damage_results: list[dict] = field(default_factory=list)
    save_results: list[SaveResult] = field(default_factory=list)
    concentration_dropped: Optional[str] = None
    reason: str = ""


class SpellResolver:
    def __init__(self, rules: SessionRules):
        self.rules = rules
        self._resolver = AttackResolver(rules)

    def resolve_spell(
        self,
        caster: Combatant,
        spell_name: str,
        spell_level: int,
        targets: list[Combatant],
        damage_formula: str = "",
        save_ability: str = "",
        save_dc: int = 0,
        damage_type: str = "fire",
        requires_attack_roll: bool = False,
        attack_bonus: int = 0,
    ) -> SpellResult:
        result = SpellResult(success=True, slot_used=spell_level)

        # Drop concentration if replacing
        if caster.concentration_spell and caster.concentration_spell != spell_name:
            result.concentration_dropped = caster.concentration_spell
            caster.concentration_spell = None

        for target in targets:
            if requires_attack_roll:
                attack = self._resolver.resolve_attack(
                    caster, target, attack_bonus, damage_formula, damage_type
                )
                if attack.hit:
                    result.targets_hit.append(target.combatant_id)
                    result.damage_results.append({
                        'target_id': target.combatant_id,
                        'damage': attack.damage_dealt,
                        'critical': attack.is_critical,
                    })
            elif save_ability and damage_formula:
                save = self._resolver.resolve_saving_throw(target, save_ability, save_dc)
                result.save_results.append(save)
                dmg_roll = DiceEngine.roll(damage_formula)
                dmg = dmg_roll.total if not save.success else dmg_roll.total // 2
                result.targets_hit.append(target.combatant_id)
                result.damage_results.append({
                    'target_id': target.combatant_id,
                    'damage': dmg, 'saved': save.success,
                })

        return result
