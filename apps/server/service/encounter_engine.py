from __future__ import annotations
import uuid
from dataclasses import dataclass, field
from enum import Enum
from typing import Optional

from core_table.dice import DiceEngine, DiceRollResult


class EncounterPhase(str, Enum):
    SETUP = "setup"
    PRESENTING = "presenting"
    AWAITING_CHOICE = "awaiting_choice"
    AWAITING_ROLL = "awaiting_roll"
    RESOLVING = "resolving"
    COMPLETED = "completed"


@dataclass
class EncounterChoice:
    choice_id: str
    text: str
    requires_roll: bool = False
    roll_ability: Optional[str] = None
    roll_dc: Optional[int] = None
    roll_skill: Optional[str] = None
    visible_to: list[str] = field(default_factory=list)

    def to_dict(self, dm: bool = False) -> dict:
        d = {'choice_id': self.choice_id, 'text': self.text,
             'requires_roll': self.requires_roll, 'roll_ability': self.roll_ability,
             'roll_dc': self.roll_dc if dm else None, 'roll_skill': self.roll_skill}
        return d


@dataclass
class EncounterRollResult:
    player_id: str
    choice_id: str | None
    ability: str
    roll: DiceRollResult
    dc: int
    success: bool


@dataclass
class EncounterState:
    encounter_id: str
    session_id: str
    title: str
    description: str
    phase: EncounterPhase = EncounterPhase.SETUP
    choices: list[EncounterChoice] = field(default_factory=list)
    participants: list[str] = field(default_factory=list)
    roll_results: list[EncounterRollResult] = field(default_factory=list)
    player_choices: dict[str, str] = field(default_factory=dict)  # player_id → choice_id
    dm_notes: str = ""

    def to_dict(self, dm: bool = False) -> dict:
        return {
            'encounter_id': self.encounter_id, 'session_id': self.session_id,
            'title': self.title, 'description': self.description,
            'phase': self.phase.value,
            'choices': [c.to_dict(dm=dm) for c in self.choices],
            'participants': self.participants,
            'player_choices': self.player_choices,
            'roll_results': [
                {'player_id': r.player_id, 'choice_id': r.choice_id,
                 'success': r.success, 'roll': r.roll.to_dict()}
                for r in self.roll_results
            ],
        }


class EncounterEngine:
    _active: dict[str, EncounterState] = {}

    @classmethod
    def create(cls, session_id: str, title: str, description: str,
               choices: list[dict], participants: list[str],
               dm_notes: str = "") -> EncounterState:
        enc = EncounterState(
            encounter_id=str(uuid.uuid4()), session_id=session_id,
            title=title, description=description, participants=participants,
            dm_notes=dm_notes,
        )
        for c in choices:
            enc.choices.append(EncounterChoice(
                choice_id=c.get('choice_id', str(uuid.uuid4())),
                text=c['text'],
                requires_roll=c.get('requires_roll', False),
                roll_ability=c.get('roll_ability'),
                roll_dc=c.get('roll_dc'),
                roll_skill=c.get('roll_skill'),
            ))
        enc.phase = EncounterPhase.PRESENTING
        cls._active[session_id] = enc
        return enc

    @classmethod
    def get(cls, session_id: str) -> EncounterState | None:
        return cls._active.get(session_id)

    @classmethod
    def submit_choice(cls, session_id: str, player_id: str, choice_id: str) -> dict:
        enc = cls._active.get(session_id)
        if not enc or enc.phase not in (EncounterPhase.PRESENTING, EncounterPhase.AWAITING_CHOICE):
            return {'error': 'no active encounter'}
        choice = next((c for c in enc.choices if c.choice_id == choice_id), None)
        if not choice:
            return {'error': 'invalid choice'}
        enc.player_choices[player_id] = choice_id
        if choice.requires_roll:
            enc.phase = EncounterPhase.AWAITING_ROLL
            return {'status': 'roll_required', 'ability': choice.roll_ability, 'dc': choice.roll_dc}
        return {'status': 'choice_recorded'}

    @classmethod
    def submit_roll(cls, session_id: str, player_id: str, bonus: int = 0) -> dict:
        enc = cls._active.get(session_id)
        if not enc or enc.phase != EncounterPhase.AWAITING_ROLL:
            return {'error': 'no roll expected'}
        choice_id = enc.player_choices.get(player_id)
        choice = next((c for c in enc.choices if c.choice_id == choice_id), None)
        if not choice or not choice.roll_dc:
            return {'error': 'invalid state'}
        roll = DiceEngine.roll(f'1d20+{bonus}')
        success = roll.total >= choice.roll_dc
        enc.roll_results.append(EncounterRollResult(
            player_id=player_id, choice_id=choice_id,
            ability=choice.roll_ability or '', roll=roll, dc=choice.roll_dc, success=success,
        ))
        return {'roll': roll.to_dict(), 'success': success, 'dc': choice.roll_dc}

    @classmethod
    def end_encounter(cls, session_id: str) -> EncounterState | None:
        enc = cls._active.pop(session_id, None)
        if enc:
            enc.phase = EncounterPhase.COMPLETED
        return enc
