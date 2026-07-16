"""Validation contract for incomplete character-wizard drafts."""

from __future__ import annotations

import json
from copy import deepcopy
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, ValidationError

CURRENT_DRAFT_SCHEMA_VERSION = 1
MAX_DRAFT_BYTES = 512 * 1024


class DraftSpells(BaseModel):
    model_config = ConfigDict(extra="forbid")

    cantrips: list[str] = Field(default_factory=list, max_length=200)
    knownSpells: list[str] = Field(default_factory=list, max_length=500)
    preparedSpells: list[str] = Field(default_factory=list, max_length=500)


class DraftWizardData(BaseModel):
    """Partial by design: finalization applies the strict character schema."""

    model_config = ConfigDict(extra="allow")

    name: str | None = Field(default=None, max_length=100)
    race: str | None = Field(default=None, max_length=100)
    subrace: str | None = Field(default=None, max_length=100)
    class_name: str | None = Field(default=None, alias="class", max_length=100)
    background: str | None = Field(default=None, max_length=100)
    alignment: str | None = Field(default=None, max_length=100)
    bio: str | None = Field(default=None, max_length=4_000)
    image: str | None = Field(default=None, max_length=2_048)
    level: int | None = Field(default=None, ge=1, le=20)
    strength: int | None = Field(default=None, ge=3, le=30)
    dexterity: int | None = Field(default=None, ge=3, le=30)
    constitution: int | None = Field(default=None, ge=3, le=30)
    intelligence: int | None = Field(default=None, ge=3, le=30)
    wisdom: int | None = Field(default=None, ge=3, le=30)
    charisma: int | None = Field(default=None, ge=3, le=30)
    skills: list[str] | None = Field(default=None, max_length=100)
    spells: DraftSpells | None = None


class CharacterDraftDocument(BaseModel):
    model_config = ConfigDict(extra="forbid")

    schemaVersion: Literal[1]
    data: DraftWizardData


def validate_character_draft(payload: dict[str, Any]) -> dict[str, Any]:
    """Validate a lossless, partial wizard snapshot and bound its storage cost."""
    if not isinstance(payload, dict):
        raise ValueError("Character draft must be an object")
    document = {
        "schemaVersion": CURRENT_DRAFT_SCHEMA_VERSION,
        "data": deepcopy(payload),
    }
    try:
        CharacterDraftDocument.model_validate(document)
        serialized = json.dumps(payload, separators=(",", ":"), allow_nan=False)
    except ValidationError as exc:
        first = exc.errors(include_url=False)[0]
        location = ".".join(str(part) for part in first.get("loc", ())) or "draft"
        raise ValueError(f"Invalid draft field {location}: {first['msg']}") from exc
    except (TypeError, ValueError) as exc:
        raise ValueError("Character draft must contain valid JSON values") from exc
    if len(serialized.encode("utf-8")) > MAX_DRAFT_BYTES:
        raise ValueError("Character draft exceeds the 512 KiB limit")
    return document["data"]
