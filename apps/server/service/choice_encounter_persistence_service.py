from __future__ import annotations

import json
from typing import Any, Callable

from database.database import SessionLocal
from database.models import ChoiceEncounter, ChoiceEncounterEvent, GameSession
from sqlalchemy.exc import SQLAlchemyError
from utils.time import utc_now


class ChoiceEncounterPersistenceError(RuntimeError):
    """Raised when an accepted encounter transition cannot be stored."""


class ChoiceEncounterPersistenceService:
    """Persist choice snapshots/events; staging borrows transaction ownership."""

    def __init__(self, session_factory: Callable = SessionLocal):
        self._session_factory = session_factory

    def load_active(self, session_code: str, encounter_id: str | None = None) -> dict[str, Any] | None:
        try:
            with self._session_factory() as db:
                query = db.query(ChoiceEncounter).filter(
                    ChoiceEncounter.session_code == session_code, ChoiceEncounter.ended_at.is_(None))
                if encounter_id:
                    query = query.filter(ChoiceEncounter.encounter_id == encounter_id)
                encounter = query.order_by(ChoiceEncounter.id.desc()).first()
                return json.loads(encounter.state_json) if encounter else None
        except SQLAlchemyError as exc:
            raise ChoiceEncounterPersistenceError('Could not load the active choice encounter') from exc

    def save_snapshot(self, **kwargs) -> None:
        try:
            with self._session_factory() as db:
                self.stage_snapshot(db, **kwargs)
                db.commit()
        except SQLAlchemyError as exc:
            raise ChoiceEncounterPersistenceError('Could not persist the choice encounter transition') from exc

    def stage_snapshot(self, db, *, session_code: str, encounter: dict[str, Any], event_type: str,
                       actor_id: str | None, payload: dict[str, Any], created_by: int | None = None) -> None:
        """Flush source and event without committing or rolling back the caller."""
        session = db.query(GameSession).filter_by(session_code=session_code, is_active=True).first()
        if session is None:
            raise ChoiceEncounterPersistenceError(f'Active game session not found: {session_code}')
        encounter_id = str(encounter['encounter_id'])
        stored = db.query(ChoiceEncounter).filter_by(encounter_id=encounter_id).first()
        if stored and stored.session_id != session.id:
            raise ChoiceEncounterPersistenceError('Encounter belongs to a different game session')
        if not stored:
            stored = ChoiceEncounter(encounter_id=encounter_id, session_id=session.id, session_code=session_code)
            db.add(stored)
        version = int(encounter.get('version') or 0)
        stored.table_id = encounter.get('table_id') or None
        stored.title = encounter.get('title') or 'Encounter'
        stored.description = encounter.get('description') or ''
        stored.phase = encounter.get('phase') or 'presenting'
        stored.state_json = json.dumps(encounter, allow_nan=False)
        stored.participants_json = json.dumps(encounter.get('participants', []))
        stored.choices_json = json.dumps(encounter.get('choices', []))
        stored.dm_notes = encounter.get('dm_notes') or ''
        stored.created_by = stored.created_by or created_by
        stored.version = version
        stored.ended_at = utc_now() if stored.phase == 'completed' else None
        db.add(ChoiceEncounterEvent(encounter_id=encounter_id, sequence=version + 1,
            event_type=event_type, actor_id=actor_id, payload_json=json.dumps(payload, allow_nan=False)))
        db.flush()
