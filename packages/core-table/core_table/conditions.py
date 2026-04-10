from __future__ import annotations
from dataclasses import dataclass, field
from enum import Enum
from typing import Optional


class ConditionType(str, Enum):
    BLINDED = "blinded"
    CHARMED = "charmed"
    DEAFENED = "deafened"
    EXHAUSTION = "exhaustion"
    FRIGHTENED = "frightened"
    GRAPPLED = "grappled"
    INCAPACITATED = "incapacitated"
    INVISIBLE = "invisible"
    PARALYZED = "paralyzed"
    PETRIFIED = "petrified"
    POISONED = "poisoned"
    PRONE = "prone"
    RESTRAINED = "restrained"
    STUNNED = "stunned"
    UNCONSCIOUS = "unconscious"
    CONCENTRATION = "concentration"


# Per-condition mechanical effects applied during attack/save resolution
CONDITION_EFFECTS: dict[str, dict] = {
    "blinded":       {"attack_roll": -5, "attack_against": +5, "auto_fail_dex": False},
    "charmed":       {},  # can't attack charmer; advantage on charmer social
    "deafened":      {},  # fails hearing-based perception
    "frightened":    {"attack_roll": -5, "check_roll": -5},  # while source visible
    "grappled":      {"speed": 0},
    "incapacitated": {"no_actions": True},
    "invisible":     {"attack_roll": +5, "attack_against": -5},
    "paralyzed":     {"no_actions": True, "auto_fail_str_dex": True, "melee_attack_crit": True},
    "petrified":     {"no_actions": True, "auto_fail_str_dex": True, "damage_resistance": True},
    "poisoned":      {"attack_roll": -5, "check_roll": -5},
    "prone":         {"attack_roll": -5, "melee_attack_against": +5, "ranged_attack_against": -5},
    "restrained":    {"attack_roll": -5, "dex_save": -5, "attack_against": +5},
    "stunned":       {"no_actions": True, "auto_fail_str_dex": True},
    "unconscious":   {"no_actions": True, "auto_fail_str_dex": True, "melee_attack_crit": True},
    "concentration": {},  # broken by damage (con save)
    "exhaustion":    {},  # 6 levels, handled separately
}

# Conditions that prevent all actions
INCAPACITATING = {"incapacitated", "paralyzed", "petrified", "stunned", "unconscious"}


@dataclass
class ActiveCondition:
    condition_id: str
    condition_type: ConditionType
    source: str
    duration_type: str  # "rounds" | "minutes" | "until_save" | "permanent"
    duration_remaining: Optional[int] = None
    save_dc: Optional[int] = None
    save_ability: Optional[str] = None
    extra_data: dict = field(default_factory=dict)

    def to_dict(self) -> dict:
        return {
            'condition_id': self.condition_id, 'condition_type': self.condition_type.value,
            'source': self.source, 'duration_type': self.duration_type,
            'duration_remaining': self.duration_remaining, 'save_dc': self.save_dc,
            'save_ability': self.save_ability, 'extra_data': self.extra_data,
        }

    @classmethod
    def from_dict(cls, data: dict) -> 'ActiveCondition':
        return cls(
            condition_id=data['condition_id'],
            condition_type=ConditionType(data['condition_type']),
            source=data.get('source', ''),
            duration_type=data.get('duration_type', 'permanent'),
            duration_remaining=data.get('duration_remaining'),
            save_dc=data.get('save_dc'),
            save_ability=data.get('save_ability'),
            extra_data=data.get('extra_data', {}),
        )

    def tick(self) -> bool:
        """Decrement duration. Returns True if condition should be removed."""
        if self.duration_type == 'rounds' and self.duration_remaining is not None:
            self.duration_remaining -= 1
            return self.duration_remaining <= 0
        return False

    def effects(self) -> dict:
        return CONDITION_EFFECTS.get(self.condition_type.value, {})
