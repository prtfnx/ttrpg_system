from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Optional

from core_table.dice import DiceEngine, DiceRollResult


class EncounterPhase(str, Enum):
    PRESENTING = "presenting"
    AWAITING_CHOICE = "awaiting_choice"
    AWAITING_ROLL = "awaiting_roll"
    COMPLETED = "completed"


@dataclass
class EncounterChoice:
    choice_id: str
    text: str
    requires_roll: bool = False
    roll_ability: Optional[str] = None
    roll_dc: Optional[int] = None
    roll_skill: Optional[str] = None

    @classmethod
    def from_payload(cls, payload: dict[str, Any]) -> "EncounterChoice":
        """Build a choice from the canonical encounter DTO."""
        raw_dc = payload.get("roll_dc")
        return cls(
            choice_id=str(payload.get("choice_id") or uuid.uuid4()),
            text=str(payload["text"]),
            requires_roll=bool(payload.get("requires_roll", False)),
            roll_ability=payload.get("roll_ability"),
            roll_dc=int(raw_dc) if raw_dc is not None and raw_dc != "" else None,
            roll_skill=payload.get("roll_skill"),
        )

    def to_dict(self) -> dict:
        return {
            "choice_id": self.choice_id,
            "text": self.text,
            "requires_roll": self.requires_roll,
            "roll_ability": self.roll_ability,
            "roll_dc": self.roll_dc,
            "roll_skill": self.roll_skill,
        }


@dataclass
class EncounterRollResult:
    player_id: str
    choice_id: str | None
    ability: str
    roll: DiceRollResult | dict
    dc: int
    success: bool

    def to_dict(self) -> dict:
        roll_dict = self.roll.to_dict() if hasattr(self.roll, "to_dict") else dict(self.roll)
        return {
            "player_id": self.player_id,
            "choice_id": self.choice_id,
            "ability": self.ability,
            "roll": roll_dict,
            "dc": self.dc,
            "success": self.success,
        }


@dataclass
class EncounterState:
    encounter_id: str
    session_id: str
    title: str
    description: str
    table_id: str = ""
    phase: EncounterPhase = EncounterPhase.PRESENTING
    choices: list[EncounterChoice] = field(default_factory=list)
    participants: list[str] = field(default_factory=list)
    roll_results: list[EncounterRollResult] = field(default_factory=list)
    player_choices: dict[str, str] = field(default_factory=dict)
    pending_rolls: dict[str, dict] = field(default_factory=dict)
    dm_notes: str = ""
    version: int = 0

    def to_dict(self, dm: bool = False) -> dict:
        return {
            "encounter_id": self.encounter_id,
            "session_id": self.session_id,
            "table_id": self.table_id,
            "title": self.title,
            "description": self.description,
            "phase": self.phase.value,
            "choices": [c.to_dict() for c in self.choices],
            "participants": self.participants,
            "player_choices": self.player_choices,
            "pending_rolls": self.pending_rolls,
            "roll_results": [r.to_dict() for r in self.roll_results],
            "dm_notes": self.dm_notes if dm else "",
            "version": self.version,
        }


class EncounterEngine:
    _active: dict[str, EncounterState] = {}

    @classmethod
    def create(
        cls,
        session_id: str,
        title: str,
        description: str,
        choices: list[dict],
        participants: list[str],
        dm_notes: str = "",
        table_id: str = "",
    ) -> EncounterState:
        enc = EncounterState(
            encounter_id=str(uuid.uuid4()),
            session_id=session_id,
            table_id=table_id,
            title=title,
            description=description,
            participants=[str(p) for p in participants],
            dm_notes=dm_notes,
        )
        enc.choices = [EncounterChoice.from_payload(c) for c in choices]
        enc.phase = EncounterPhase.PRESENTING
        cls._active[session_id] = enc
        return enc

    @classmethod
    def get(cls, session_id: str) -> EncounterState | None:
        return cls._active.get(session_id)

    @classmethod
    def restore(cls, encounter_dict: dict[str, Any]) -> EncounterState:
        enc = EncounterState(
            encounter_id=str(encounter_dict["encounter_id"]),
            session_id=str(encounter_dict["session_id"]),
            table_id=str(encounter_dict.get("table_id") or ""),
            title=str(encounter_dict.get("title") or "Encounter"),
            description=str(encounter_dict.get("description") or ""),
            phase=EncounterPhase(encounter_dict.get("phase", EncounterPhase.PRESENTING.value)),
            participants=[str(p) for p in encounter_dict.get("participants", [])],
            player_choices={str(k): str(v) for k, v in encounter_dict.get("player_choices", {}).items()},
            pending_rolls={
                str(k): dict(v)
                for k, v in encounter_dict.get("pending_rolls", {}).items()
                if isinstance(v, dict)
            },
            dm_notes=str(encounter_dict.get("dm_notes") or ""),
            version=int(encounter_dict.get("version") or 0),
        )
        enc.choices = [EncounterChoice.from_payload(c) for c in encounter_dict.get("choices", [])]
        enc.roll_results = [
            EncounterRollResult(
                player_id=str(r.get("player_id")),
                choice_id=r.get("choice_id"),
                ability=str(r.get("ability") or ""),
                roll=dict(r.get("roll") or {}),
                dc=int(r.get("dc") or 0),
                success=bool(r.get("success")),
            )
            for r in encounter_dict.get("roll_results", [])
            if isinstance(r, dict)
        ]
        cls._active[enc.session_id] = enc
        return enc

    @classmethod
    def submit_choice(
        cls,
        session_id: str,
        player_id: str,
        choice_id: str,
        encounter_id: str | None = None,
    ) -> dict:
        enc = cls._active.get(session_id)
        if not enc or enc.phase == EncounterPhase.COMPLETED:
            return {"error": "no active encounter"}
        if encounter_id and enc.encounter_id != encounter_id:
            return {"error": "stale encounter"}
        allowed_error = cls._actor_error(enc, player_id)
        if allowed_error:
            return allowed_error
        if player_id in enc.player_choices or player_id in enc.pending_rolls:
            return {"error": "choice already submitted"}

        choice = next((c for c in enc.choices if c.choice_id == choice_id), None)
        if not choice:
            return {"error": "invalid choice"}

        enc.player_choices[player_id] = choice_id
        if choice.requires_roll:
            enc.phase = EncounterPhase.AWAITING_ROLL
            pending_roll = {
                "choice_id": choice.choice_id,
                "roll_ability": choice.roll_ability,
                "roll_skill": choice.roll_skill,
                "roll_dc": choice.roll_dc,
            }
            enc.pending_rolls[player_id] = pending_roll
            cls._touch(enc)
            return {
                "status": "roll_required",
                "pending_roll": pending_roll,
                "encounter": enc.to_dict(dm=True),
            }

        enc.phase = EncounterPhase.AWAITING_CHOICE
        cls._touch(enc)
        return {"status": "choice_recorded", "encounter": enc.to_dict(dm=True)}

    @classmethod
    def submit_roll(
        cls,
        session_id: str,
        player_id: str,
        bonus: int = 0,
        encounter_id: str | None = None,
    ) -> dict:
        enc = cls._active.get(session_id)
        if not enc or enc.phase == EncounterPhase.COMPLETED:
            return {"error": "no roll expected"}
        if encounter_id and enc.encounter_id != encounter_id:
            return {"error": "stale encounter"}
        allowed_error = cls._actor_error(enc, player_id)
        if allowed_error:
            return allowed_error

        pending_roll = enc.pending_rolls.get(player_id)
        if not pending_roll:
            return {"error": "no roll expected"}
        choice_id = pending_roll.get("choice_id")
        choice = next((c for c in enc.choices if c.choice_id == choice_id), None)
        if not choice or choice.roll_dc is None:
            return {"error": "invalid state"}

        dc = int(choice.roll_dc)
        roll = DiceEngine.roll(f"1d20+{bonus}")
        success = roll.total >= dc
        enc.roll_results.append(EncounterRollResult(
            player_id=player_id,
            choice_id=choice_id,
            ability=choice.roll_ability or "",
            roll=roll,
            dc=dc,
            success=success,
        ))
        enc.pending_rolls.pop(player_id, None)
        enc.phase = EncounterPhase.AWAITING_ROLL if enc.pending_rolls else EncounterPhase.AWAITING_CHOICE
        cls._touch(enc)
        return {
            "roll": roll.to_dict(),
            "success": success,
            "dc": dc,
            "encounter": enc.to_dict(dm=True),
        }

    @classmethod
    def end_encounter(cls, session_id: str, encounter_id: str | None = None) -> EncounterState | None:
        enc = cls._active.get(session_id)
        if encounter_id and enc and enc.encounter_id != encounter_id:
            return None
        enc = cls._active.pop(session_id, None)
        if enc:
            enc.phase = EncounterPhase.COMPLETED
            cls._touch(enc)
        return enc

    @staticmethod
    def _actor_error(enc: EncounterState, player_id: str) -> dict | None:
        if enc.participants and str(player_id) not in enc.participants:
            return {"error": "player is not a participant"}
        return None

    @staticmethod
    def _touch(enc: EncounterState) -> None:
        enc.version += 1
