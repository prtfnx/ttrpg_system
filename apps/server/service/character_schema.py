"""Versioned validation and deterministic migration for character documents."""

from __future__ import annotations

from copy import deepcopy
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, ValidationError, field_validator

CURRENT_CHARACTER_SCHEMA_VERSION = 1
_ABILITY_KEYS = {
    "str", "dex", "con", "int", "wis", "cha",
    "strength", "dexterity", "constitution", "intelligence", "wisdom", "charisma",
}


class DeathSaves(BaseModel):
    model_config = ConfigDict(extra="forbid")

    successes: int = Field(default=0, ge=0, le=3)
    failures: int = Field(default=0, ge=0, le=3)


class CharacterStats(BaseModel):
    model_config = ConfigDict(extra="allow")

    hp: int | None = Field(default=None, ge=0, le=1_000_000)
    max_hp: int | None = Field(default=None, alias="maxHp", ge=0, le=1_000_000)
    temp_hp: int | None = Field(default=None, alias="tempHp", ge=0, le=1_000_000)
    ac: int | None = Field(default=None, ge=0, le=100)
    speed: float | None = Field(default=None, ge=0, le=10_000)
    death_saves: DeathSaves | None = Field(default=None, alias="deathSaves")


class CharacterClass(BaseModel):
    model_config = ConfigDict(extra="allow")

    name: str = Field(min_length=1, max_length=100)
    level: int = Field(ge=1, le=20)
    subclass: str | None = Field(default=None, max_length=100)


class CharacterData(BaseModel):
    model_config = ConfigDict(extra="allow", populate_by_name=True)

    level: int | None = Field(default=None, ge=1, le=20)
    experience: int | None = Field(default=None, ge=0, le=1_000_000_000)
    proficiency_bonus: int | None = Field(default=None, alias="proficiencyBonus", ge=0, le=10)
    stats: CharacterStats | None = None
    ability_scores: dict[str, int] | None = Field(default=None, alias="abilityScores")
    spell_slots_used: dict[str, int] | None = Field(default=None, alias="spellSlotsUsed")
    classes: list[CharacterClass] | None = Field(default=None, max_length=20)

    @field_validator("ability_scores")
    @classmethod
    def validate_ability_scores(cls, value: dict[str, int] | None):
        if value is None:
            return value
        for ability, score in value.items():
            if ability.lower() not in _ABILITY_KEYS:
                raise ValueError(f"Unsupported ability score: {ability}")
            if isinstance(score, bool) or not 1 <= score <= 30:
                raise ValueError(f"Ability score {ability} must be between 1 and 30")
        return value

    @field_validator("spell_slots_used")
    @classmethod
    def validate_spell_slots_used(cls, value: dict[str, int] | None):
        if value is None:
            return value
        for level, used in value.items():
            try:
                numeric_level = int(level)
            except (TypeError, ValueError) as exc:
                raise ValueError("Spell-slot levels must be integers") from exc
            if not 0 <= numeric_level <= 9 or isinstance(used, bool) or not 0 <= used <= 99:
                raise ValueError("Spell-slot usage is out of range")
        return value


class CharacterDocument(BaseModel):
    """Stable envelope; unknown feature fields remain available to newer clients."""

    model_config = ConfigDict(extra="allow", populate_by_name=True)

    schema_version: Literal[1] = Field(alias="schemaVersion")
    character_id: str = Field(min_length=1, max_length=64)
    name: str = Field(min_length=1, max_length=100)
    controlled_by: list[int] = Field(default_factory=list, alias="controlledBy", max_length=100)
    data: CharacterData = Field(default_factory=CharacterData)
    compendium_version: str | None = Field(default=None, alias="compendiumVersion", max_length=128)

    @field_validator("controlled_by")
    @classmethod
    def validate_controllers(cls, value: list[int]):
        if any(isinstance(user_id, bool) or user_id <= 0 for user_id in value):
            raise ValueError("controlledBy must contain positive user ids")
        if len(value) != len(set(value)):
            raise ValueError("controlledBy must not contain duplicate user ids")
        return value


def migrate_character_document(payload: dict[str, Any]) -> dict[str, Any]:
    """Migrate one character document to the current schema without data loss."""
    if not isinstance(payload, dict):
        raise ValueError("Character payload must be an object")
    migrated = deepcopy(payload)
    camel_version = migrated.get("schemaVersion")
    snake_version = migrated.pop("schema_version", None)
    if camel_version is not None and snake_version is not None and camel_version != snake_version:
        raise ValueError("Character schema version fields disagree")
    version = camel_version if camel_version is not None else snake_version
    if version is None:
        version = 0
    if isinstance(version, bool) or not isinstance(version, int):
        raise ValueError("Character schema version must be an integer")
    if version == 0:
        migrated["schemaVersion"] = CURRENT_CHARACTER_SCHEMA_VERSION
    elif version == CURRENT_CHARACTER_SCHEMA_VERSION:
        migrated["schemaVersion"] = version
    else:
        raise ValueError(f"Unsupported character schema version: {version}")
    migrated.setdefault("name", "Unnamed Character")
    migrated.setdefault("data", {})
    return migrated


def validate_character_document(payload: dict[str, Any]) -> dict[str, Any]:
    """Migrate and validate, returning the lossless migrated representation."""
    migrated = migrate_character_document(payload)
    try:
        CharacterDocument.model_validate(migrated)
    except ValidationError as exc:
        first = exc.errors(include_url=False)[0]
        location = ".".join(str(part) for part in first.get("loc", ())) or "character"
        raise ValueError(f"Invalid character field {location}: {first['msg']}") from exc
    return migrated
