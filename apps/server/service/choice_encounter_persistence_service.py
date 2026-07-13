from __future__ import annotations

import json
from datetime import datetime
from typing import Any, Callable

from database.database import SessionLocal
from database.models import (
    ChoiceEncounter,
    ChoiceEncounterEvent,
    GameSession,
)
from sqlalchemy.exc import SQLAlchemyError


class ChoiceEncounterPersistenceError(RuntimeError):
    """Raised when an accepted encounter transition cannot be stored."""


class ChoiceEncounterPersistenceService:
    """Persist choice encounter snapshots and an append-only domain event log."""

    def __init__(self, session_factory: Callable = SessionLocal):
        self._session_factory = session_factory

    def load_active(self, session_code: str, encounter_id: str | None = None) -> dict[str, Any] | None:
        try:
            with self._session_factory() as db:
                query = db.query(ChoiceEncounter).filter(
                    ChoiceEncounter.session_code == session_code,
                    ChoiceEncounter.ended_at.is_(None),
                )
                if encounter_id:
                    query = query.filter(ChoiceEncounter.encounter_id == encounter_id)
                encounter = query.order_by(ChoiceEncounter.id.desc()).first()
                return json.loads(encounter.state_json) if encounter else None
        except SQLAlchemyError as exc:
            raise ChoiceEncounterPersistenceError(
                "Could not load the active choice encounter"
            ) from exc

    def save_snapshot(
        self,
        *,
        session_code: str,
        encounter: dict[str, Any],
        event_type: str,
        actor_id: str | None,
        payload: dict[str, Any],
        created_by: int | None = None,
    ) -> None:
        try:
            with self._session_factory() as db:
                session = db.query(GameSession).filter(
                    GameSession.session_code == session_code,
                    GameSession.is_active.is_(True),
                ).first()
                if not session:
                    raise ChoiceEncounterPersistenceError(
                        f"Active game session not found: {session_code}"
                    )

                encounter_id = str(encounter["encounter_id"])
                stored = db.query(ChoiceEncounter).filter(
                    ChoiceEncounter.encounter_id == encounter_id
                ).first()
                if stored and stored.session_id != session.id:
                    raise ChoiceEncounterPersistenceError(
                        "Encounter belongs to a different game session"
                    )
                if not stored:
                    stored = ChoiceEncounter(
                        encounter_id=encounter_id,
                        session_id=session.id,
                        session_code=session_code,
                    )
                    db.add(stored)

                version = int(encounter.get("version") or 0)
                stored.table_id = encounter.get("table_id") or None
                stored.title = encounter.get("title") or "Encounter"
                stored.description = encounter.get("description") or ""
                stored.phase = encounter.get("phase") or "presenting"
                stored.state_json = json.dumps(encounter)
                stored.participants_json = json.dumps(encounter.get("participants", []))
                stored.choices_json = json.dumps(encounter.get("choices", []))
                stored.dm_notes = encounter.get("dm_notes") or ""
                stored.created_by = stored.created_by or created_by
                stored.version = version
                stored.ended_at = datetime.utcnow() if stored.phase == "completed" else None

                db.add(ChoiceEncounterEvent(
                    encounter_id=encounter_id,
                    sequence=version + 1,
                    event_type=event_type,
                    actor_id=actor_id,
                    payload_json=json.dumps(payload),
                ))
                db.commit()
        except SQLAlchemyError as exc:
            raise ChoiceEncounterPersistenceError(
                "Could not persist the choice encounter transition"
            ) from exc
