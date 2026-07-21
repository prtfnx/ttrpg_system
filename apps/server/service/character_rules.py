"""Versioned character-advancement rules shared by HTTP and WebSocket paths."""

from __future__ import annotations

from typing import Any

RULESET_VERSION = "dnd5e-2014-v1"

XP_THRESHOLDS = (
    0,
    300,
    900,
    2_700,
    6_500,
    14_000,
    23_000,
    34_000,
    48_000,
    64_000,
    85_000,
    100_000,
    120_000,
    140_000,
    165_000,
    195_000,
    225_000,
    265_000,
    305_000,
    355_000,
)

PROFICIENCY_BONUSES = (2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 6, 6, 6, 6)

ASI_LEVELS = {
    "fighter": [4, 6, 8, 12, 14, 16, 19],
    "rogue": [4, 8, 10, 12, 16, 19],
    "default": [4, 8, 12, 16, 19],
}

MULTICLASS_DATA: dict[str, dict[str, Any]] = {
    "barbarian": {
        "prerequisites": {"strength": 13},
        "proficiencies": ["shields", "simple_weapons", "martial_weapons"],
        "spellcasting_type": "none",
    },
    "bard": {
        "prerequisites": {"charisma": 13},
        "proficiencies": ["light_armor", "one_musical_instrument"],
        "spellcasting_type": "full",
    },
    "cleric": {
        "prerequisites": {"wisdom": 13},
        "proficiencies": ["light_armor", "medium_armor", "shields"],
        "spellcasting_type": "full",
    },
    "druid": {
        "prerequisites": {"wisdom": 13},
        "proficiencies": ["light_armor", "medium_armor", "shields"],
        "spellcasting_type": "full",
    },
    "fighter": {
        "prerequisites": {"strength_or_dexterity": 13},
        "proficiencies": ["light_armor", "medium_armor", "shields", "simple_weapons", "martial_weapons"],
        "spellcasting_type": "none",
    },
    "monk": {
        "prerequisites": {"dexterity": 13, "wisdom": 13},
        "proficiencies": ["simple_weapons", "shortswords"],
        "spellcasting_type": "none",
    },
    "paladin": {
        "prerequisites": {"strength": 13, "charisma": 13},
        "proficiencies": ["light_armor", "medium_armor", "shields", "simple_weapons", "martial_weapons"],
        "spellcasting_type": "half",
    },
    "ranger": {
        "prerequisites": {"dexterity": 13, "wisdom": 13},
        "proficiencies": ["light_armor", "medium_armor", "shields", "simple_weapons", "martial_weapons"],
        "spellcasting_type": "half",
    },
    "rogue": {
        "prerequisites": {"dexterity": 13},
        "proficiencies": [
            "light_armor",
            "simple_weapons",
            "hand_crossbows",
            "longswords",
            "rapiers",
            "shortswords",
            "thieves_tools",
        ],
        "spellcasting_type": "none",
    },
    "sorcerer": {"prerequisites": {"charisma": 13}, "proficiencies": [], "spellcasting_type": "full"},
    "warlock": {
        "prerequisites": {"charisma": 13},
        "proficiencies": ["light_armor", "simple_weapons"],
        "spellcasting_type": "half",
    },
    "wizard": {"prerequisites": {"intelligence": 13}, "proficiencies": [], "spellcasting_type": "full"},
}


def level_for_xp(experience: int) -> int:
    """Return a 1-based level from the pinned XP table."""
    return next(level for level in range(len(XP_THRESHOLDS), 0, -1) if experience >= XP_THRESHOLDS[level - 1])


def multiclass_prerequisites(class_name: str) -> dict[str, int] | None:
    data = MULTICLASS_DATA.get(class_name.lower())
    return dict(data["prerequisites"]) if data else None
