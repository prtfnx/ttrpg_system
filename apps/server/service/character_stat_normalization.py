"""Deterministic proposals for canonical character stats; never write on read."""
from __future__ import annotations

import re
from copy import deepcopy
from typing import Any

from service.character_schema import validate_character_document

STAT_ALIASES = {"hp": ("hp", "current_hp"), "maxHp": ("maxHp", "max_hp", "hit_points"),
                "ac": ("ac", "armor_class")}
_HP = re.compile(r"\s*(\d+)\s*(?:\(\s*\d+d\d+(?:\s*[+−-]\s*\d+)?\s*\))?\s*", re.IGNORECASE)


def _stat(value: Any, name: str) -> int | None:
    if value is None:
        return None
    if isinstance(value, str):
        match = _HP.fullmatch(value) if name in {"hp", "maxHp"} else re.fullmatch(r"\s*(\d+)\s*", value)
        if match:
            value = int(match.group(1))
    if isinstance(value, bool) or not isinstance(value, int) or not 0 <= value <= (100 if name == "ac" else 1_000_000):
        raise ValueError(f"Invalid legacy {name}; choose a canonical whole number or null explicitly")
    return value


def normalize_character_stats(document: dict[str, Any], *, character_id: str) -> dict[str, Any]:
    """Canonical fields win; conflicting legacy candidates require a decision.

    Known legacy aliases are removed after their values are resolved. All other
    fields, including monster abilities/actions and unknown feature data, survive.
    Missing max HP is never guessed from current HP for an existing character.
    """
    result = deepcopy(document)
    if result.get("character_id", character_id) != character_id:
        raise ValueError("Character document identity differs from its source row")
    result["character_id"] = character_id
    data = result.setdefault("data", {})
    root_stats = result.get("stats", {})
    if not isinstance(data, dict) or not isinstance(root_stats, dict):
        raise ValueError("Character data and legacy stats must be objects")
    stats = data.get("stats")
    if stats is None:
        stats = {}
    if not isinstance(stats, dict):
        raise ValueError("Character data.stats must be an object or null")
    locations = [result, root_stats, data]
    canonical = deepcopy(stats)
    for name, aliases in STAT_ALIASES.items():
        if name in stats:
            value = _stat(stats[name], name)
        else:
            candidates = [_stat(location[alias], name) for location in [*locations, stats]
                          for alias in aliases if alias in location]
            if name == "hp" and not candidates:
                candidates = [_stat(location["hit_points"], name) for location in locations if "hit_points" in location]
            if not candidates:
                continue
            if any(candidate != candidates[0] for candidate in candidates):
                raise ValueError(f"Conflicting legacy {name}; choose data.stats.{name} explicitly")
            value = candidates[0]
        canonical[name] = value
    for location in locations:
        for alias in {alias for aliases in STAT_ALIASES.values() for alias in aliases}:
            location.pop(alias, None)
    for alias in ("max_hp", "current_hp", "hit_points", "armor_class"):
        canonical.pop(alias, None)
    if canonical or "stats" in data:
        data["stats"] = canonical
    return validate_character_document(result)


def compendium_npc_document(monster: dict[str, Any], *, character_id: str) -> dict[str, Any]:
    raw = monster.get("raw", {})
    if not isinstance(raw, dict):
        raise ValueError("Monster raw data must be an object")
    # Raw content stays inside data and cannot supply document identity/sharing.
    document = {"character_id": character_id, "name": monster.get("name") or raw.get("name") or "Unknown",
                "type": "npc", "npc": True, "data": {**deepcopy(raw), "npc": True,
                "compendium": deepcopy(raw), "monster_type": monster.get("type", ""),
                "challenge_rating": monster.get("challenge_rating", "")}}
    result = normalize_character_stats(document, character_id=character_id)
    stats = result["data"].setdefault("stats", {})
    if "hp" not in stats and "maxHp" in stats:
        stats["hp"] = stats["maxHp"]
    if "maxHp" not in stats and "hp" in stats:
        stats["maxHp"] = stats["hp"]  # A new NPC starts at its initial HP.
    if "hp" not in stats or "ac" not in stats:
        raise ValueError("Monster requires HP and armor class")
    return validate_character_document(result)
