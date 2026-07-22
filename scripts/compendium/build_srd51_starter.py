"""Build the bundled 2014-rules compendium from a pinned CC SRD 5.1 conversion."""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import tempfile
import urllib.request
from pathlib import Path
from typing import Any

SOURCE_COMMIT = "c05c0438ea6c638bb7cb25224d97c9bd0e187c49"
DOCUMENT_NAME = "SRD5.1-CCBY4.0License-TT.json"
MONSTERS_NAME = "Monsters-SRD5.1-CCBY4.0License-TT.json"
SOURCE_ROOT = f"https://raw.githubusercontent.com/Tabyltop/CC-SRD/{SOURCE_COMMIT}"
DOCUMENT_URL = f"{SOURCE_ROOT}/{DOCUMENT_NAME}"
MONSTERS_URL = f"{SOURCE_ROOT}/{MONSTERS_NAME}"
SOURCE_HASHES = {
    DOCUMENT_NAME: "bf6a8e2a81393f036f65c858771f8dd4c92527c4d8d2cfe864322f87fc2839ff",
    MONSTERS_NAME: "ef546a65894535c1d83a848df742cc2711c778de952b4e54a9db295dd37d8acf",
}
ATTRIBUTION = (
    "This work includes material taken from the System Reference Document 5.1 "
    "(\u201cSRD 5.1\u201d) by Wizards of the Coast LLC and available at "
    "https://dnd.wizards.com/resources/systems-reference-document. The SRD 5.1 "
    "is licensed under the Creative Commons Attribution 4.0 International "
    "License available at https://creativecommons.org/licenses/by/4.0/legalcode."
)
LICENSE = {
    "id": "CC-BY-4.0",
    "url": "https://creativecommons.org/licenses/by/4.0/legalcode",
    "attribution": ATTRIBUTION,
}
ARTIFACT_VERSION = "srd51-starter-c05c0438-v1"
OUTPUT_FILES = {
    "character_data.json": DOCUMENT_URL,
    "spellbook_optimized.json": DOCUMENT_URL,
    "equipment_data.json": DOCUMENT_URL,
    "bestiary_optimized.json": MONSTERS_URL,
    "feats_data.json": DOCUMENT_URL,
}

RACES: dict[str, dict[str, Any]] = {
    "Dwarf": {
        "name": "Hill Dwarf",
        "size": "Medium",
        "speed": 25,
        "ability_score_increases": [("Constitution", 2), ("Wisdom", 1)],
        "languages": ["Common", "Dwarvish"],
        "darkvision": 60,
        "damage_resistances": ["poison"],
    },
    "Elf": {
        "name": "High Elf",
        "size": "Medium",
        "speed": 30,
        "ability_score_increases": [("Dexterity", 2), ("Intelligence", 1)],
        "languages": ["Common", "Elvish", "One language of your choice"],
        "darkvision": 60,
        "skill_proficiencies": ["Perception"],
        "spell_ability": "Intelligence",
    },
    "Halfling": {
        "name": "Lightfoot Halfling",
        "size": "Small",
        "speed": 25,
        "ability_score_increases": [("Dexterity", 2), ("Charisma", 1)],
        "languages": ["Common", "Halfling"],
    },
    "Human": {
        "name": "Human",
        "size": "Medium",
        "speed": 30,
        "ability_score_increases": [
            (ability, 1) for ability in ("Strength", "Dexterity", "Constitution", "Intelligence", "Wisdom", "Charisma")
        ],
        "languages": ["Common", "One language of your choice"],
    },
    "Dragonborn": {
        "name": "Dragonborn",
        "size": "Medium",
        "speed": 30,
        "ability_score_increases": [("Strength", 2), ("Charisma", 1)],
        "languages": ["Common", "Draconic"],
    },
    "Gnome": {
        "name": "Rock Gnome",
        "size": "Small",
        "speed": 25,
        "ability_score_increases": [("Intelligence", 2), ("Constitution", 1)],
        "languages": ["Common", "Gnomish"],
        "darkvision": 60,
    },
    "Half-Elf": {
        "name": "Half-Elf",
        "size": "Medium",
        "speed": 30,
        "ability_score_increases": [("Charisma", 2), ("Two other ability scores", 1)],
        "languages": ["Common", "Elvish", "One language of your choice"],
        "darkvision": 60,
        "skill_proficiencies": ["Two skills of your choice"],
    },
    "Half-Orc": {
        "name": "Half-Orc",
        "size": "Medium",
        "speed": 30,
        "ability_score_increases": [("Strength", 2), ("Constitution", 1)],
        "languages": ["Common", "Orc"],
        "darkvision": 60,
        "skill_proficiencies": ["Intimidation"],
    },
    "Tiefling": {
        "name": "Tiefling",
        "size": "Medium",
        "speed": 30,
        "ability_score_increases": [("Charisma", 2), ("Intelligence", 1)],
        "languages": ["Common", "Infernal"],
        "darkvision": 60,
        "damage_resistances": ["fire"],
        "spell_ability": "Charisma",
    },
}

CLASSES: dict[str, dict[str, Any]] = {
    "Barbarian": {"primary": ["Strength"], "spell": None, "skills": 2, "subclass": "Path of the Berserker"},
    "Bard": {"primary": ["Charisma"], "spell": "Charisma", "skills": 3, "subclass": "College of Lore"},
    "Cleric": {"primary": ["Wisdom"], "spell": "Wisdom", "skills": 2, "subclass": "Life Domain"},
    "Druid": {"primary": ["Wisdom"], "spell": "Wisdom", "skills": 2, "subclass": "Circle of the Land"},
    "Fighter": {"primary": ["Strength", "Dexterity"], "spell": None, "skills": 2, "subclass": "Champion"},
    "Monk": {"primary": ["Dexterity", "Wisdom"], "spell": None, "skills": 2, "subclass": "Way of the Open Hand"},
    "Paladin": {"primary": ["Strength", "Charisma"], "spell": "Charisma", "skills": 2, "subclass": "Oath of Devotion"},
    "Ranger": {"primary": ["Dexterity", "Wisdom"], "spell": "Wisdom", "skills": 3, "subclass": "Hunter"},
    "Rogue": {"primary": ["Dexterity"], "spell": None, "skills": 4, "subclass": "Thief"},
    "Sorcerer": {"primary": ["Charisma"], "spell": "Charisma", "skills": 2, "subclass": "Draconic Bloodline"},
    "Warlock": {"primary": ["Charisma"], "spell": "Charisma", "skills": 2, "subclass": "The Fiend"},
    "Wizard": {"primary": ["Intelligence"], "spell": "Intelligence", "skills": 2, "subclass": "School of Evocation"},
}

STARTER_SPELLS = {
    "Acid Splash",
    "Chill Touch",
    "Dancing Lights",
    "Druidcraft",
    "Eldritch Blast",
    "Fire Bolt",
    "Guidance",
    "Light",
    "Mage Hand",
    "Mending",
    "Message",
    "Minor Illusion",
    "Poison Spray",
    "Prestidigitation",
    "Produce Flame",
    "Ray of Frost",
    "Resistance",
    "Sacred Flame",
    "Shillelagh",
    "Shocking Grasp",
    "Spare the Dying",
    "Thaumaturgy",
    "True Strike",
    "Vicious Mockery",
    "Bless",
    "Burning Hands",
    "Charm Person",
    "Command",
    "Cure Wounds",
    "Detect Magic",
    "Disguise Self",
    "Divine Favor",
    "Entangle",
    "Faerie Fire",
    "False Life",
    "Feather Fall",
    "Find Familiar",
    "Fog Cloud",
    "Goodberry",
    "Guiding Bolt",
    "Healing Word",
    "Heroism",
    "Hideous Laughter",
    "Hunter's Mark",
    "Identify",
    "Inflict Wounds",
    "Mage Armor",
    "Magic Missile",
    "Protection from Evil and Good",
    "Purify Food and Drink",
    "Sanctuary",
    "Shield",
    "Silent Image",
    "Sleep",
    "Speak with Animals",
    "Thunderwave",
}
ALL_SKILLS = [
    "Acrobatics",
    "Animal Handling",
    "Arcana",
    "Athletics",
    "Deception",
    "History",
    "Insight",
    "Intimidation",
    "Investigation",
    "Medicine",
    "Nature",
    "Perception",
    "Performance",
    "Persuasion",
    "Religion",
    "Sleight of Hand",
    "Stealth",
    "Survival",
]
SPELL_CLASS_FALLBACKS = {
    "hunter's mark": ["Ranger"],
    "identify": ["Bard", "Wizard"],
    "spare the dying": ["Cleric"],
    "thaumaturgy": ["Cleric"],
}


def _text(element: dict[str, Any]) -> str:
    return "".join(part.get("text", "") for part in element.get("subelements", [])).strip()


def _key(value: str) -> str:
    return re.sub(r"\s+", " ", value.replace("\u2019", "'").replace("\u2018", "'")).strip().casefold()


def _find_heading(data: list[dict[str, Any]], heading_type: str, title: str, start: int = 0) -> int:
    wanted = _key(title)
    for index in range(start, len(data)):
        if data[index].get("type") == heading_type and _key(_text(data[index])) == wanted:
            return index
    raise ValueError(f"missing {heading_type} heading: {title}")


def _next_heading(data: list[dict[str, Any]], start: int, types: set[str]) -> int:
    for index in range(start + 1, len(data)):
        if data[index].get("type") in types:
            return index
    return len(data)


def _paragraphs(data: list[dict[str, Any]], start: int, end: int) -> list[str]:
    return [_text(element) for element in data[start:end] if element.get("type") == "paragraph" and _text(element)]


def _traits(data: list[dict[str, Any]], start: int, end: int) -> list[dict[str, str]]:
    traits: list[dict[str, str]] = []
    for element in data[start:end]:
        if element.get("type") != "paragraph" or not element.get("subelements"):
            continue
        first = element["subelements"][0]
        attributes = set(first.get("attributes", []))
        label = first.get("text", "").strip()
        if "bold" not in attributes or not label.endswith("."):
            continue
        full_text = _text(element)
        description = full_text[len(label) :].strip()
        if description:
            traits.append({"name": label.rstrip(". "), "description": description, "source": "SRD 5.1"})
    return traits


def build_characters(data: list[dict[str, Any]]) -> dict[str, Any]:
    races: list[dict[str, Any]] = []
    for source_name, settings in RACES.items():
        start = _find_heading(data, "h2", source_name)
        end = _next_heading(data, start, {"h1", "h2"})
        race = {
            "name": settings["name"],
            "size": settings["size"],
            "speed": settings["speed"],
            "ability_score_increases": [
                {"ability": ability, "increase": increase} for ability, increase in settings["ability_score_increases"]
            ],
            "spell_ability": settings.get("spell_ability"),
            "skill_proficiencies": settings.get("skill_proficiencies", []),
            "traits": _traits(data, start, end),
            "languages": settings["languages"],
            "source": "SRD 5.1",
            "darkvision": settings.get("darkvision", 0),
            "damage_resistances": settings.get("damage_resistances", []),
            "damage_immunities": [],
            "condition_immunities": [],
        }
        races.append(race)

    classes: list[dict[str, Any]] = []
    for class_name, settings in CLASSES.items():
        start = _find_heading(data, "h1", class_name)
        end = _next_heading(data, start, {"h1"})
        hit_die_match = next(
            (
                re.search(r"Hit Dice:\s*1d(\d+)", line)
                for line in _paragraphs(data, start, end)
                if line.startswith("Hit Dice:")
            ),
            None,
        )
        if hit_die_match is None:
            raise ValueError(f"missing hit die for {class_name}")
        values: dict[str, str] = {}
        for line in _paragraphs(data, start, end):
            label, separator, value = line.partition(":")
            if separator and label in {"Armor", "Weapons", "Tools", "Saving Throws", "Skills"}:
                values.setdefault(label, value.strip())

        def split_value(label: str) -> list[str]:
            value = values.get(label, "")
            if label == "Skills" and value.casefold().startswith("choose any three"):
                return ALL_SKILLS
            if label == "Skills" and " from " in value:
                value = value.split(" from ", 1)[1]
            return [
                part.strip().removeprefix("and ")
                for part in re.split(r",|\bor\b", value)
                if part.strip() and part.strip() != "None"
            ]

        classes.append(
            {
                "name": class_name,
                "hit_die": int(hit_die_match.group(1)),
                "description": f"SRD 5.1 {class_name.lower()} class.",
                "primary_abilities": settings["primary"],
                "saving_throw_proficiencies": split_value("Saving Throws"),
                "skill_proficiencies": split_value("Skills"),
                "num_skills": settings["skills"],
                "spell_ability": settings["spell"],
                "armor_proficiencies": split_value("Armor"),
                "weapon_proficiencies": split_value("Weapons"),
                "tool_proficiencies": split_value("Tools"),
                "starting_wealth": "",
                "features": {},
                "spell_slots": {},
                "source": "SRD 5.1",
                "subclasses": [
                    {
                        "name": settings["subclass"],
                        "short_name": settings["subclass"],
                        "source": "SRD 5.1",
                        "features": {},
                    }
                ],
            }
        )

    acolyte = _find_heading(data, "h3", "Acolyte")
    feature = _find_heading(data, "h4", "Feature: Shelter of the Faithful", acolyte)
    suggested = _find_heading(data, "h4", "Suggested Characteristics", feature)
    background = {
        "name": "Acolyte",
        "skill_proficiencies": ["Insight", "Religion"],
        "language_proficiencies": ["Two languages of your choice"],
        "tool_proficiencies": [],
        "equipment": [
            "Holy symbol",
            "Prayer book or prayer wheel",
            "5 sticks of incense",
            "Vestments",
            "Common clothes",
            "Pouch containing 15 gp",
        ],
        "features": [
            {
                "name": "Description",
                "description": "\n\n".join(_paragraphs(data, acolyte + 1, feature)[:2]),
                "feature_type": "description",
            },
            {
                "name": "Shelter of the Faithful",
                "description": "\n\n".join(_paragraphs(data, feature + 1, suggested)),
                "feature_type": "feature",
            },
        ],
        "source": "SRD 5.1",
    }
    return {
        "metadata": {"format_version": "1.0", "ruleset": "dnd5e-2014-v1", "source": "SRD 5.1"},
        "races": races,
        "classes": classes,
        "backgrounds": [background],
    }


def _spell_classes(data: list[dict[str, Any]]) -> dict[str, list[str]]:
    result: dict[str, list[str]] = {}
    spell_lists = _find_heading(data, "h2", "Spell Lists")
    descriptions = _find_heading(data, "h2", "Spell Descriptions", spell_lists)
    headings = [
        index
        for index in range(spell_lists, descriptions)
        if data[index].get("type") == "h3" and _text(data[index]).endswith(" Spells")
    ]
    for position, start in enumerate(headings):
        end = headings[position + 1] if position + 1 < len(headings) else descriptions
        class_name = _text(data[start]).removesuffix(" Spells")
        for name in _paragraphs(data, start + 1, end):
            result.setdefault(_key(name), []).append(class_name)
    return result


def _duration_and_description(value: str) -> tuple[str, str]:
    value = re.sub(r"^Duration:\s*", "", value, flags=re.IGNORECASE)
    duration_pattern = re.compile(
        r"^(Concentration,?\s*up to\s+\d+\s+(?:round|minute|hour|day)s?|"
        r"Up to\s+\d+\s+(?:round|minute|hour|day)s?|"
        r"\d+\s+(?:round|minute|hour|day)s?|Instantaneous|Until dispelled(?: or triggered)?|Special)"
        r"(?=\s|[A-Z]|$)",
        flags=re.IGNORECASE,
    )
    match = duration_pattern.match(value)
    if not match:
        raise ValueError(f"cannot parse spell duration: {value[:100]}")
    return match.group(1).strip(), value[match.end() :].strip()


def build_spells(data: list[dict[str, Any]]) -> dict[str, Any]:
    descriptions = _find_heading(data, "h2", "Spell Descriptions")
    traps = _find_heading(data, "h2", "Traps", descriptions)
    class_map = _spell_classes(data)
    selected = {_key(name): name for name in STARTER_SPELLS}
    spells: dict[str, dict[str, Any]] = {}
    for index in range(descriptions + 1, traps):
        element = data[index]
        if element.get("type") != "h4" or _key(_text(element)) not in selected:
            continue
        name = _text(element).replace("\u2019", "'")
        end = _next_heading(data, index, {"h2", "h4"})
        lines = _paragraphs(data, index + 1, end)
        if len(lines) < 5:
            raise ValueError(f"incomplete spell: {name}")
        meta = lines[0]
        cantrip = re.fullmatch(r"([A-Za-z]+) cantrip(?: \(ritual\))?", meta, flags=re.IGNORECASE)
        leveled = re.fullmatch(r"(\d+)(?:st|nd|rd|th)-level ([A-Za-z]+)(?: \(ritual\))?", meta, flags=re.IGNORECASE)
        if cantrip:
            level, school = 0, cantrip.group(1).title()
        elif leveled:
            level, school = int(leveled.group(1)), leveled.group(2).title()
        else:
            raise ValueError(f"cannot parse spell metadata for {name}: {meta}")
        casting_time = re.sub(r"^Casting Time:\s*", "", lines[1], flags=re.IGNORECASE)
        spell_range = re.sub(r"^Range:\s*", "", lines[2], flags=re.IGNORECASE)
        components_text = re.sub(r"^Components:\s*", "", lines[3], flags=re.IGNORECASE)
        duration, opening = _duration_and_description(lines[4])
        body = ([opening] if opening else []) + lines[5:]
        higher = [line for line in body if line.startswith("At Higher Levels.")]
        description = "\n\n".join(line for line in body if not line.startswith("At Higher Levels."))
        material_match = re.search(r"M\s*\((.*)\)", components_text, flags=re.IGNORECASE)
        classes = class_map.get(_key(name), SPELL_CLASS_FALLBACKS.get(_key(name), []))
        if not classes:
            raise ValueError(f"no class association found for starter spell: {name}")
        spells[name] = {
            "name": name,
            "level": level,
            "school": school,
            "ritual": "(ritual)" in meta.casefold(),
            "casting_time": casting_time,
            "range": spell_range,
            "duration": duration,
            "concentration": duration.casefold().startswith("concentration"),
            "components": {
                "verbal": bool(re.search(r"(?:^|,\s*)V(?:,|$)", components_text)),
                "somatic": bool(re.search(r"(?:^|,\s*)S(?:,|$)", components_text)),
                "material": material_match is not None,
                "material_description": material_match.group(1) if material_match else "",
                "material_consumed": False,
                "material_cost": None,
            },
            "classes": classes,
            "description": description,
            "higher_levels": "\n\n".join(higher),
            "source": "SRD 5.1",
        }
    missing = sorted(set(selected) - {_key(name) for name in spells})
    if missing:
        raise ValueError(f"starter spells missing from source: {missing}")
    ordered = {name: spells[name] for name in sorted(spells)}
    return {
        "metadata": {
            "format_version": "1.0",
            "ruleset": "dnd5e-2014-v1",
            "spell_count": len(ordered),
            "scope": "starter levels 0-1",
            "source": "SRD 5.1",
        },
        "spells": ordered,
    }


def _row_text(row: list[dict[str, Any]]) -> list[str]:
    return [_text(cell) for cell in row]


def _cost(value: str) -> dict[str, float]:
    result = {"copper": 0, "silver": 0, "electrum": 0, "gold": 0, "platinum": 0}
    match = re.fullmatch(r"([\d,.]+)\s*(cp|sp|ep|gp|pp)", value.strip(), flags=re.IGNORECASE)
    if match:
        names = {"cp": "copper", "sp": "silver", "ep": "electrum", "gp": "gold", "pp": "platinum"}
        result[names[match.group(2).casefold()]] = float(match.group(1).replace(",", ""))
    return result


def _weight(value: str) -> float:
    match = re.search(r"([\d.]+)\s*lb", value, flags=re.IGNORECASE)
    return float(match.group(1)) if match else 0


def build_equipment(data: list[dict[str, Any]]) -> dict[str, Any]:
    equipment: dict[str, list[dict[str, Any]]] = {"armor": [], "weapons": [], "adventuring_gear": []}
    armor_category = ""
    for table_index in (1418, 1419):
        for row in data[table_index]["rows"]:
            cells = _row_text(row)
            if len(cells) == 1:
                armor_category = cells[0]
            elif len(cells) == 6 and cells[0] != "Armor":
                equipment["armor"].append(
                    {
                        "name": cells[0],
                        "description": "",
                        "item_type": "armor",
                        "armor_category": armor_category,
                        "armor_class": cells[2],
                        "strength_requirement": cells[3],
                        "stealth": cells[4],
                        "weight": _weight(cells[5]),
                        "cost": _cost(cells[1]),
                        "cost_display": cells[1],
                        "properties": [],
                        "source": "SRD 5.1",
                    }
                )
    weapon_category = ""
    for table_index in (1464, 1465):
        for row in data[table_index]["rows"]:
            cells = _row_text(row)
            if len(cells) == 1:
                weapon_category = cells[0]
            elif len(cells) == 5 and cells[0] != "Name":
                damage = cells[2].split(maxsplit=1)
                equipment["weapons"].append(
                    {
                        "name": cells[0],
                        "description": "",
                        "item_type": "weapon",
                        "weapon_category": weapon_category,
                        "damage_roll": damage[0],
                        "damage_type": damage[1] if len(damage) > 1 else "",
                        "weight": _weight(cells[3]),
                        "cost": _cost(cells[1]),
                        "cost_display": cells[1],
                        "properties": [part.strip() for part in cells[4].split(",") if part.strip()],
                        "source": "SRD 5.1",
                    }
                )
    descriptions: dict[str, str] = {}
    for element in data[1466:1515]:
        if element.get("type") != "paragraph" or not element.get("subelements"):
            continue
        first = element["subelements"][0]
        if "bold" in first.get("attributes", []) and first.get("text", "").strip().endswith("."):
            label = first["text"].strip().rstrip(".")
            descriptions[_key(label)] = _text(element)[len(first["text"].strip()) :].strip()
    for row in data[1515]["rows"]:
        cells = _row_text(row)
        if len(cells) == 3 and cells[0] != "Item":
            equipment["adventuring_gear"].append(
                {
                    "name": cells[0],
                    "description": descriptions.get(_key(cells[0]), ""),
                    "item_type": "adventuring_gear",
                    "weight": _weight(cells[2]),
                    "cost": _cost(cells[1]),
                    "cost_display": cells[1],
                    "properties": [],
                    "source": "SRD 5.1",
                }
            )
    for items in equipment.values():
        items.sort(key=lambda item: item["name"])
    return {
        "metadata": {
            "format_version": "1.0",
            "ruleset": "dnd5e-2014-v1",
            "item_count": sum(len(items) for items in equipment.values()),
            "source": "SRD 5.1",
        },
        "equipment": equipment,
    }


def _bonuses(value: Any) -> dict[str, int]:
    if not isinstance(value, str):
        return {}
    result: dict[str, int] = {}
    for name, bonus in re.findall(r"([A-Za-z ]+?)\s+([+-]\d+)(?:,|$)", value):
        result[name.strip()] = int(bonus)
    return result


def _list_value(value: Any) -> list[str]:
    if isinstance(value, list):
        return [str(item).strip() for item in value if str(item).strip()]
    if isinstance(value, str) and value.strip() not in {"", "-"}:
        return [part.strip() for part in value.split(",") if part.strip()]
    return []


def build_monsters(source: dict[str, Any]) -> dict[str, Any]:
    monsters: dict[str, dict[str, Any]] = {}
    for raw in source["monsters"]:
        challenge = str(raw.get("challenge", "0"))
        cr_match = re.match(r"([^\s(]+)", challenge)
        xp_match = re.search(r"\(([\d,]+)\s+XP\)", challenge, flags=re.IGNORECASE)
        armor = str(raw.get("armor_class", "10"))
        armor_match = re.match(r"(\d+)", armor)
        hit_points = str(raw.get("hit_points", "1"))
        dice_match = re.search(r"\(([^)]+)\)", hit_points)
        stats = {
            key.lower(): int(re.match(r"-?\d+", str(value)).group()) for key, value in raw.get("stats", {}).items()
        }
        senses_text = str(raw.get("senses", ""))
        passive_match = re.search(r"passive Perception\s+(\d+)", senses_text, flags=re.IGNORECASE)
        actions = []
        for action in raw.get("actions", []):
            converted = {
                "name": str(action.get("name", "")).rstrip("."),
                "description": action.get("description", ""),
            }
            if action.get("damage_dice"):
                converted.update(
                    {
                        "damage": True,
                        "damage_dice": action["damage_dice"],
                        "damage_type": action.get("damage_type", ""),
                        "attack_bonus": int(str(action.get("to_hit", "0")).replace("+", "") or 0),
                    }
                )
            actions.append(converted)
        monster_type = str(raw.get("type", ""))
        subtype_match = re.search(r"\(([^)]+)\)", monster_type)
        type_name = re.sub(r"\s*\([^)]+\)", "", monster_type).strip()
        monster = {
            "name": raw["name"],
            "size": raw.get("size", "Medium"),
            "type": type_name,
            "subtype": subtype_match.group(1) if subtype_match else "",
            "alignment": raw.get("alignment", "neutral"),
            "armor_class": int(armor_match.group(1)) if armor_match else 10,
            "armor_desc": armor,
            "hit_points": hit_points,
            "hit_dice": dice_match.group(1) if dice_match else "",
            "speed": raw.get("speed", "30 ft."),
            "strength": stats.get("str", 10),
            "dexterity": stats.get("dex", 10),
            "constitution": stats.get("con", 10),
            "intelligence": stats.get("int", 10),
            "wisdom": stats.get("wis", 10),
            "charisma": stats.get("cha", 10),
            "stats": {key.upper(): value for key, value in stats.items()},
            "saving_throws": _bonuses(raw.get("saving_throws")),
            "skills": _bonuses(raw.get("skills")),
            "damage_resistances": _list_value(raw.get("damage_resistances")),
            "damage_vulnerabilities": _list_value(raw.get("damage_vulnerabilities")),
            "damage_immunities": _list_value(raw.get("damage_immunities")),
            "condition_immunities": _list_value(raw.get("condition_immunities")),
            "senses": _list_value(senses_text),
            "passive_perception": int(passive_match.group(1)) if passive_match else 10,
            "languages": _list_value(raw.get("languages")),
            "challenge_rating": cr_match.group(1) if cr_match else "0",
            "experience_points": int(xp_match.group(1).replace(",", "")) if xp_match else 0,
            "traits": [
                {"name": str(trait.get("name", "")).rstrip("."), "description": trait.get("description", "")}
                for trait in raw.get("abilities", [])
            ],
            "actions": actions,
            "legendary_actions": [],
            "spells": {},
            "spell_slots": {},
            "environment": [],
            "source": "SRD 5.1",
        }
        monsters[raw["name"]] = monster
    ordered = {name: monsters[name] for name in sorted(monsters)}
    return {
        "metadata": {
            "format_version": "1.0",
            "ruleset": "dnd5e-2014-v1",
            "monster_count": len(ordered),
            "source": "SRD 5.1",
        },
        "monsters": ordered,
    }


def build_feats(data: list[dict[str, Any]]) -> dict[str, Any]:
    start = _find_heading(data, "h3", "Grappler")
    lines = _paragraphs(data, start + 1, _next_heading(data, start, {"h1", "h2", "h3"}))
    prerequisite, _, description = lines[0].partition(" You")
    return {
        "metadata": {"format_version": "1.0", "ruleset": "dnd5e-2014-v1", "source": "SRD 5.1"},
        "feats": [
            {
                "name": "Grappler",
                "source": "SRD 5.1",
                "description": f"You{description}" if description else lines[0],
                "prerequisite": prerequisite.removeprefix("Prerequisite:").strip(),
                "benefits": [line.lstrip("\u2022 ") for line in lines[1:]],
                "asi": None,
            }
        ],
    }


def _read_json(path: Path, expected_hash: str) -> Any:
    raw = path.read_bytes()
    actual_hash = hashlib.sha256(raw).hexdigest()
    if actual_hash != expected_hash:
        raise ValueError(f"source checksum mismatch for {path.name}: {actual_hash}")
    return json.loads(raw.decode("utf-8-sig"))


def _download(url: str, destination: Path) -> None:
    request = urllib.request.Request(url, headers={"User-Agent": "ttrpg-system-compendium-builder/1"})
    with urllib.request.urlopen(request, timeout=60) as response:  # noqa: S310 - pinned HTTPS URL and checksum
        destination.write_bytes(response.read())


def _write_json(path: Path, value: Any) -> bytes:
    raw = (json.dumps(value, ensure_ascii=False, indent=2, sort_keys=True) + "\n").encode()
    path.write_bytes(raw)
    return raw


def build(document_path: Path, monsters_path: Path, output: Path) -> None:
    document = _read_json(document_path, SOURCE_HASHES[DOCUMENT_NAME])
    monster_source = _read_json(monsters_path, SOURCE_HASHES[MONSTERS_NAME])
    output.mkdir(parents=True, exist_ok=True)
    generated = {
        "character_data.json": build_characters(document),
        "spellbook_optimized.json": build_spells(document),
        "equipment_data.json": build_equipment(document),
        "bestiary_optimized.json": build_monsters(monster_source),
        "feats_data.json": build_feats(document),
    }
    manifest_files: dict[str, Any] = {}
    for filename, value in generated.items():
        raw = _write_json(output / filename, value)
        manifest_files[filename] = {
            "sha256": hashlib.sha256(raw).hexdigest(),
            "bytes": len(raw),
            "source": {
                "name": "Tabyltop CC-SRD conversion of SRD 5.1",
                "url": OUTPUT_FILES[filename],
                "version": SOURCE_COMMIT,
            },
            "license": LICENSE,
        }
    _write_json(
        output / "manifest.json",
        {
            "schema_version": 1,
            "artifact_version": ARTIFACT_VERSION,
            "ruleset": "dnd5e-2014-v1",
            "scope": "starter",
            "files": manifest_files,
        },
    )


def main() -> None:
    repository = Path(__file__).resolve().parents[2]
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--document", type=Path, help=f"Pinned {DOCUMENT_NAME} path")
    parser.add_argument("--monsters", type=Path, help=f"Pinned {MONSTERS_NAME} path")
    parser.add_argument(
        "--output",
        type=Path,
        default=repository / "packages/core-table/core_table/compendiums/bundled_srd51",
    )
    args = parser.parse_args()
    if bool(args.document) != bool(args.monsters):
        parser.error("--document and --monsters must be supplied together")
    if args.document:
        build(args.document, args.monsters, args.output)
        return
    with tempfile.TemporaryDirectory(prefix="ttrpg-srd51-") as temporary:
        directory = Path(temporary)
        document = directory / DOCUMENT_NAME
        monsters = directory / MONSTERS_NAME
        _download(DOCUMENT_URL, document)
        _download(MONSTERS_URL, monsters)
        build(document, monsters, args.output)


if __name__ == "__main__":
    main()
