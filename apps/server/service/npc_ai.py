from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Optional

from core_table.combat import Combatant, CombatState


@dataclass
class AIDecision:
    action_type: str          # "attack" | "move" | "flee" | "heal" | "dodge" | "skip"
    target_id: Optional[str] = None
    move_to: Optional[tuple] = None
    reasoning: str = ""


def _distance(a: dict, b: dict) -> float:
    return math.hypot(a.get('x', 0) - b.get('x', 0), a.get('y', 0) - b.get('y', 0))


def _nearest_enemy(combatant: Combatant, combat: CombatState) -> Optional[Combatant]:
    enemies = [c for c in combat.combatants
               if c.combatant_id != combatant.combatant_id
               and c.is_npc != combatant.is_npc  # opposite side
               and not c.is_defeated]
    if not enemies:
        return None
    return min(enemies, key=lambda c: (c.initiative or 0))  # simplified: first in order


def _most_wounded_ally(combatant: Combatant, combat: CombatState) -> Optional[Combatant]:
    allies = [
        c for c in combat.combatants
        if c.combatant_id != combatant.combatant_id
        and c.is_npc == combatant.is_npc
        and not c.is_defeated and c.max_hp > 0 and c.hp < c.max_hp
    ]
    if not allies:
        return None
    return min(allies, key=lambda c: c.hp / c.max_hp)


class NPCAIEngine:
    @staticmethod
    def decide_action(
        combatant: Combatant, combat: CombatState, behavior: str = "tactical"
    ) -> AIDecision:
        hp_ratio = (combatant.hp / combatant.max_hp) if combatant.max_hp else 1.0

        if behavior == "cowardly" and hp_ratio < 0.5:
            return AIDecision("flee", reasoning="Low HP, fleeing")

        if behavior == "berserker":
            target = _nearest_enemy(combatant, combat)
            return AIDecision("attack", target_id=target.combatant_id if target else None,
                              reasoning="Berserker: attack anything")

        if behavior == "support":
            ally = _most_wounded_ally(combatant, combat)
            if ally and ally.hp / ally.max_hp < 0.5:
                return AIDecision("heal", target_id=ally.combatant_id,
                                  reasoning=f"Healing {ally.name}")

        if behavior == "defensive" and hp_ratio < 0.5:
            return AIDecision("dodge", reasoning="Defensive: dodge when hurt")

        # tactical / aggressive: attack nearest enemy
        target = _nearest_enemy(combatant, combat)
        if not target:
            return AIDecision("skip", reasoning="No valid targets")

        # Tactical: prefer most wounded
        if behavior == "tactical":
            enemies = [c for c in combat.combatants
                       if c.is_npc != combatant.is_npc and not c.is_defeated]
            wounded = [e for e in enemies if e.max_hp and e.hp / e.max_hp < 0.75]
            if wounded:
                target = min(wounded, key=lambda c: c.hp / c.max_hp)

        return AIDecision("attack", target_id=target.combatant_id,
                          reasoning=f"{behavior}: attacking {target.name}")
