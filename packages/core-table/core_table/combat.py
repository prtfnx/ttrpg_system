from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass, field
from enum import Enum
from typing import Optional

from .conditions import INCAPACITATING, ActiveCondition


class CombatPhase(str, Enum):
    INACTIVE = "inactive"
    SETUP = "setup"
    ROLLING = "rolling"
    ACTIVE = "active"
    PAUSED = "paused"
    ENDED = "ended"


class DamageType(str, Enum):
    ACID = "acid"
    BLUDGEONING = "bludgeoning"
    COLD = "cold"
    FIRE = "fire"
    FORCE = "force"
    LIGHTNING = "lightning"
    NECROTIC = "necrotic"
    PIERCING = "piercing"
    POISON = "poison"
    PSYCHIC = "psychic"
    RADIANT = "radiant"
    SLASHING = "slashing"
    THUNDER = "thunder"


class ActionCost(str, Enum):
    ACTION = "action"
    BONUS_ACTION = "bonus_action"
    REACTION = "reaction"
    MOVEMENT = "movement"
    FREE = "free"
    LEGENDARY = "legendary"
    LAIR = "lair"


@dataclass
class Combatant:
    combatant_id: str
    entity_id: str
    character_id: Optional[str] = None
    name: str = ""
    initiative: Optional[float] = None
    initiative_modifier: int = 0
    has_action: bool = True
    has_bonus_action: bool = True
    has_reaction: bool = True
    has_movement: bool = True
    movement_remaining: float = 30
    movement_speed: float = 30
    hp: int = 0
    max_hp: int = 0
    temp_hp: int = 0
    armor_class: int = 10
    conditions: list[ActiveCondition] = field(default_factory=list)
    concentration_spell: Optional[str] = None
    is_npc: bool = False
    is_hidden: bool = False
    is_defeated: bool = False
    controlled_by: list[str] = field(default_factory=list)
    ai_enabled: bool = False
    ai_behavior: str = "tactical"
    death_save_successes: int = 0
    death_save_failures: int = 0
    damage_resistances: list[str] = field(default_factory=list)
    damage_vulnerabilities: list[str] = field(default_factory=list)
    damage_immunities: list[str] = field(default_factory=list)
    surprised: bool = False

    def is_alive(self) -> bool:
        return not self.is_defeated

    def is_conscious(self) -> bool:
        return self.hp > 0

    def can_act(self) -> bool:
        return not any(c.condition_type.value in INCAPACITATING for c in self.conditions)

    def condition_types(self) -> set[str]:
        return {c.condition_type.value for c in self.conditions}

    def to_dict(self) -> dict:
        return {
            'combatant_id': self.combatant_id, 'entity_id': self.entity_id,
            'character_id': self.character_id, 'name': self.name,
            'initiative': self.initiative, 'initiative_modifier': self.initiative_modifier,
            'has_action': self.has_action, 'has_bonus_action': self.has_bonus_action,
            'has_reaction': self.has_reaction, 'has_movement': self.has_movement,
            'movement_remaining': self.movement_remaining, 'movement_speed': self.movement_speed,
            'hp': self.hp, 'max_hp': self.max_hp, 'temp_hp': self.temp_hp,
            'armor_class': self.armor_class,
            'conditions': [c.to_dict() for c in self.conditions],
            'concentration_spell': self.concentration_spell,
            'is_npc': self.is_npc, 'is_hidden': self.is_hidden, 'is_defeated': self.is_defeated,
            'controlled_by': self.controlled_by, 'ai_enabled': self.ai_enabled,
            'ai_behavior': self.ai_behavior,
            'death_save_successes': self.death_save_successes,
            'death_save_failures': self.death_save_failures,
            'damage_resistances': self.damage_resistances,
            'damage_vulnerabilities': self.damage_vulnerabilities,
            'damage_immunities': self.damage_immunities,
            'surprised': self.surprised,
        }

    def to_dict_for_player(self, hp_visibility: str) -> dict:
        d = self.to_dict()
        if self.is_npc:
            if hp_visibility == 'none':
                d.pop('hp')
                d.pop('max_hp')
                d.pop('temp_hp')
            elif hp_visibility == 'descriptor':
                pct = (self.hp / self.max_hp) if self.max_hp else 0
                d['hp_descriptor'] = (
                    'dead' if self.hp <= 0 else
                    'bloodied' if pct <= 0.5 else
                    'wounded' if pct <= 0.75 else
                    'healthy'
                )
                d.pop('hp')
                d.pop('max_hp')
                d.pop('temp_hp')
            d.pop('ai_enabled')
            d.pop('ai_behavior')
            d.pop('controlled_by')
        return d

    @classmethod
    def from_dict(cls, data: dict) -> 'Combatant':
        c = cls(**{k: v for k, v in data.items() if k != 'conditions'})
        c.conditions = [ActiveCondition.from_dict(x) for x in data.get('conditions', [])]
        return c


@dataclass
class CombatAction:
    action_id: str
    combat_id: str
    round_number: int
    turn_index: int
    actor_id: str
    action_type: str
    action_cost: str
    target_ids: list[str] = field(default_factory=list)
    rolls: list[dict] = field(default_factory=list)
    outcome: str = ""
    damage_dealt: int = 0
    healing_done: int = 0
    conditions_applied: list[str] = field(default_factory=list)
    conditions_removed: list[str] = field(default_factory=list)
    state_before: dict = field(default_factory=dict)
    timestamp: float = 0
    is_dm_override: bool = False

    def to_dict(self) -> dict:
        return self.__dict__.copy()

    @classmethod
    def from_dict(cls, data: dict) -> 'CombatAction':
        return cls(**data)


@dataclass
class CombatSettings:
    auto_roll_npc_initiative: bool = True
    auto_sort_initiative: bool = True
    skip_defeated: bool = True
    allow_player_end_turn: bool = True
    show_npc_hp_to_players: str = "descriptor"
    show_npc_ac_to_players: bool = False
    group_initiative: bool = False
    ai_auto_act: bool = False
    death_saves_enabled: bool = True
    critical_hit_rule: str = "double_dice"

    def to_dict(self) -> dict:
        return self.__dict__.copy()

    @classmethod
    def from_dict(cls, data: dict) -> 'CombatSettings':
        return cls(**{k: v for k, v in data.items() if k in cls.__dataclass_fields__})


@dataclass
class CombatState:
    combat_id: str
    session_id: str
    table_id: str
    phase: CombatPhase = CombatPhase.INACTIVE
    round_number: int = 0
    current_turn_index: int = 0
    combatants: list[Combatant] = field(default_factory=list)
    action_log: list[CombatAction] = field(default_factory=list)
    started_at: Optional[float] = None
    settings: CombatSettings = field(default_factory=CombatSettings)
    state_hash: str = ""

    def active_combatants(self) -> list[Combatant]:
        if self.settings.skip_defeated:
            return [c for c in self.combatants if not c.is_defeated]
        return self.combatants

    def get_current_combatant(self) -> Optional[Combatant]:
        active = self.active_combatants()
        if not active:
            return None
        return active[self.current_turn_index % len(active)]

    def get_next_combatant(self) -> Optional[Combatant]:
        active = self.active_combatants()
        if not active:
            return None
        return active[(self.current_turn_index + 1) % len(active)]

    def is_combatant_turn(self, combatant_id: str) -> bool:
        current = self.get_current_combatant()
        return current is not None and current.combatant_id == combatant_id

    def compute_hash(self) -> str:
        data = json.dumps({
            'phase': self.phase, 'round': self.round_number,
            'turn': self.current_turn_index,
            'combatants': [c.combatant_id for c in self.combatants],
        }, sort_keys=True)
        return hashlib.md5(data.encode()).hexdigest()[:8]

    def to_dict(self) -> dict:
        return {
            'combat_id': self.combat_id, 'session_id': self.session_id,
            'table_id': self.table_id, 'phase': self.phase.value,
            'round_number': self.round_number, 'current_turn_index': self.current_turn_index,
            'combatants': [c.to_dict() for c in self.combatants],
            'action_log': [a.to_dict() for a in self.action_log[-50:]],  # last 50
            'started_at': self.started_at,
            'settings': self.settings.to_dict(),
            'state_hash': self.compute_hash(),
        }

    def to_dict_for_player(self, rules_hp_vis: str = 'descriptor') -> dict:
        d = self.to_dict()
        d['combatants'] = [c.to_dict_for_player(rules_hp_vis) for c in self.combatants]
        return d

    @classmethod
    def from_dict(cls, data: dict) -> 'CombatState':
        cs = cls(
            combat_id=data['combat_id'], session_id=data['session_id'],
            table_id=data['table_id'], phase=CombatPhase(data.get('phase', 'inactive')),
            round_number=data.get('round_number', 0),
            current_turn_index=data.get('current_turn_index', 0),
            started_at=data.get('started_at'),
            settings=CombatSettings.from_dict(data.get('settings', {})),
            state_hash=data.get('state_hash', ''),
        )
        cs.combatants = [Combatant.from_dict(x) for x in data.get('combatants', [])]
        cs.action_log = [CombatAction.from_dict(x) for x in data.get('action_log', [])]
        return cs
