from dataclasses import dataclass, field, asdict
from typing import Optional
import json


@dataclass
class SessionRules:
    """Per-session game rules. DM edits via Settings UI. Persisted as JSON in game_sessions."""

    session_id: str

    # Movement
    obstacles_block_movement: bool = True
    walls_block_movement: bool = True
    enforce_movement_speed: bool = True
    diagonal_movement_rule: str = "standard"  # "standard" | "alternate" (5-10-5) | "realistic"
    default_movement_speed: float = 30.0

    # Turn economy
    turn_order: str = "initiative"  # "none" | "concurrent" | "initiative" | "dm_assigned"
    actions_per_turn: int = 1
    bonus_actions_per_turn: int = 1
    reactions_per_turn: int = 1
    free_actions_per_turn: int = 1
    allow_player_end_turn: bool = True

    # Explore mode
    explore_movement_per_round: float = 30.0
    explore_actions_per_round: int = 1
    explore_auto_advance: bool = False
    explore_round_timer: Optional[int] = None  # seconds; None = manual

    # Combat
    auto_roll_npc_initiative: bool = True
    auto_sort_initiative: bool = True
    skip_defeated_combatants: bool = True
    group_npc_initiative: bool = False
    death_saves_enabled: bool = True
    massive_damage_rule: bool = True

    # Display (what players see)
    show_npc_hp_to_players: str = "descriptor"  # "exact" | "descriptor" | "none"
    show_npc_ac_to_players: bool = False
    show_npc_conditions: bool = True

    # Attacks & spells
    enforce_line_of_sight: bool = True
    enforce_range: bool = True
    enforce_spell_slots: bool = True
    enforce_spell_components: bool = False
    critical_hit_rule: str = "double_dice"  # "double_dice" | "max_dice" | "double_total"

    # NPC AI
    ai_enabled: bool = False
    ai_auto_act: bool = False
    default_ai_behavior: str = "tactical"

    # Performance & validation
    # "cell" = grid-snapped movement (fight/explore default, cheaper server-side)
    # "free" = pixel-precise (free_roam default)
    movement_mode: str = "cell"
    # Server collision validation tier:
    # "trust_client" = ownership + bounds only (fastest, no collision)
    # "lightweight"  = segment checks only, no A* (default - good for Render free tier)
    # "full"         = server runs own A* pathfinding (most accurate, most CPU)
    server_validation_tier: str = "lightweight"

    # Extensible
    custom_rules: dict = field(default_factory=dict)

    def validate(self) -> list[str]:
        errors = []
        if self.default_movement_speed <= 0:
            errors.append("default_movement_speed must be > 0")
        if self.actions_per_turn < 0:
            errors.append("actions_per_turn must be >= 0")
        if self.bonus_actions_per_turn < 0:
            errors.append("bonus_actions_per_turn must be >= 0")
        if self.explore_movement_per_round < 0:
            errors.append("explore_movement_per_round must be >= 0")
        valid_diagonal = {"standard", "alternate", "realistic"}
        if self.diagonal_movement_rule not in valid_diagonal:
            errors.append(f"diagonal_movement_rule must be one of {valid_diagonal}")
        valid_turn_order = {"none", "concurrent", "initiative", "dm_assigned"}
        if self.turn_order not in valid_turn_order:
            errors.append(f"turn_order must be one of {valid_turn_order}")
        valid_hp_display = {"exact", "descriptor", "none"}
        if self.show_npc_hp_to_players not in valid_hp_display:
            errors.append(f"show_npc_hp_to_players must be one of {valid_hp_display}")
        if self.movement_mode not in {"cell", "free"}:
            errors.append("movement_mode must be 'cell' or 'free'")
        if self.server_validation_tier not in {"trust_client", "lightweight", "full"}:
            errors.append("server_validation_tier must be 'trust_client', 'lightweight', or 'full'")
        return errors

    def to_dict(self) -> dict:
        d = asdict(self)
        return d

    @classmethod
    def from_dict(cls, data: dict) -> "SessionRules":
        known = {f.name for f in cls.__dataclass_fields__.values()}  # type: ignore[attr-defined]
        filtered = {k: v for k, v in data.items() if k in known}
        return cls(**filtered)

    @classmethod
    def defaults(cls, session_id: str) -> "SessionRules":
        return cls(session_id=session_id)
