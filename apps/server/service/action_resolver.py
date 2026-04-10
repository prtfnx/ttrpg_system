from __future__ import annotations
from core_table.combat import ActionCost, Combatant, CombatState
from core_table.session_rules import SessionRules


class ActionResolver:
    """Tracks and enforces per-turn action economy."""

    def __init__(self, rules: SessionRules):
        self.rules = rules

    def get_available_actions(self, combatant: Combatant) -> dict:
        """Returns dict of available resources for this combatant."""
        return {
            'action': combatant.has_action,
            'bonus_action': combatant.has_bonus_action,
            'reaction': combatant.has_reaction,
            'movement_remaining': combatant.movement_remaining,
            'can_act': combatant.can_act(),
        }

    def consume(self, combatant: Combatant, cost: ActionCost, movement_ft: float = 0) -> bool:
        """Deduct a resource. Returns False if already consumed."""
        if not combatant.can_act():
            return False
        if cost == ActionCost.ACTION:
            if not combatant.has_action:
                return False
            combatant.has_action = False
        elif cost == ActionCost.BONUS_ACTION:
            if not combatant.has_bonus_action:
                return False
            combatant.has_bonus_action = False
        elif cost == ActionCost.REACTION:
            if not combatant.has_reaction:
                return False
            combatant.has_reaction = False
        elif cost == ActionCost.MOVEMENT:
            if combatant.movement_remaining < movement_ft:
                return False
            combatant.movement_remaining -= movement_ft
        return True

    def reset_turn(self, combatant: Combatant):
        combatant.has_action = True
        combatant.has_bonus_action = True
        combatant.has_reaction = True
        combatant.movement_remaining = combatant.movement_speed

    def snapshot(self, combatant: Combatant) -> dict:
        """Snapshot for undo."""
        return {
            'combatant_id': combatant.combatant_id,
            'hp': combatant.hp, 'temp_hp': combatant.temp_hp,
            'has_action': combatant.has_action,
            'has_bonus_action': combatant.has_bonus_action,
            'has_reaction': combatant.has_reaction,
            'movement_remaining': combatant.movement_remaining,
        }
