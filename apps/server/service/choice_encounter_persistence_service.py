from __future__ import annotations

import json
from typing import Any, Callable

from database.database import SessionLocal
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from utils.logger import setup_logger

logger = setup_logger(__name__)


class ChoiceEncounterPersistenceService:
    """Persist choice encounter snapshots and an append-only domain event log."""

    def __init__(self, session_factory: Callable = SessionLocal):
        self._session_factory = session_factory

    def load_active(self, session_code: str, encounter_id: str | None = None) -> dict[str, Any] | None:
        try:
            with self._session_factory() as db:
                params: dict[str, Any] = {"session_code": session_code}
                filter_sql = "session_code = :session_code AND ended_at IS NULL"
                if encounter_id:
                    filter_sql += " AND encounter_id = :encounter_id"
                    params["encounter_id"] = encounter_id
                row = db.execute(text(f"""
                    SELECT state_json
                    FROM choice_encounters
                    WHERE {filter_sql}
                    ORDER BY id DESC
                    LIMIT 1
                """), params).mappings().first()
                return json.loads(row["state_json"]) if row else None
        except SQLAlchemyError as exc:
            logger.warning(f"Choice encounter load skipped: {exc}")
            return None

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
                session = db.execute(text("""
                    SELECT id
                    FROM game_sessions
                    WHERE session_code = :session_code AND is_active = 1
                    LIMIT 1
                """), {"session_code": session_code}).mappings().first()
                if not session:
                    return

                encounter_id = str(encounter["encounter_id"])
                state_json = json.dumps(encounter)
                participants_json = json.dumps(encounter.get("participants", []))
                choices_json = json.dumps(encounter.get("choices", []))
                ended_at_sql = "CURRENT_TIMESTAMP" if encounter.get("phase") == "completed" else "NULL"

                db.execute(text(f"""
                    INSERT INTO choice_encounters (
                        encounter_id, session_id, session_code, table_id, title,
                        description, phase, state_json, participants_json,
                        choices_json, dm_notes, created_by, version, ended_at
                    )
                    VALUES (
                        :encounter_id, :session_id, :session_code, :table_id, :title,
                        :description, :phase, :state_json, :participants_json,
                        :choices_json, :dm_notes, :created_by, :version, {ended_at_sql}
                    )
                    ON CONFLICT(encounter_id) DO UPDATE SET
                        table_id = excluded.table_id,
                        title = excluded.title,
                        description = excluded.description,
                        phase = excluded.phase,
                        state_json = excluded.state_json,
                        participants_json = excluded.participants_json,
                        choices_json = excluded.choices_json,
                        dm_notes = excluded.dm_notes,
                        updated_at = CURRENT_TIMESTAMP,
                        version = excluded.version,
                        ended_at = {ended_at_sql}
                """), {
                    "encounter_id": encounter_id,
                    "session_id": session["id"],
                    "session_code": session_code,
                    "table_id": encounter.get("table_id") or "",
                    "title": encounter.get("title") or "Encounter",
                    "description": encounter.get("description") or "",
                    "phase": encounter.get("phase") or "presenting",
                    "state_json": state_json,
                    "participants_json": participants_json,
                    "choices_json": choices_json,
                    "dm_notes": encounter.get("dm_notes") or "",
                    "created_by": created_by,
                    "version": int(encounter.get("version") or 0),
                })

                sequence = db.execute(text("""
                    SELECT COALESCE(MAX(sequence), 0) + 1
                    FROM choice_encounter_events
                    WHERE encounter_id = :encounter_id
                """), {"encounter_id": encounter_id}).scalar_one()
                db.execute(text("""
                    INSERT INTO choice_encounter_events (
                        encounter_id, sequence, event_type, actor_id, payload_json
                    )
                    VALUES (
                        :encounter_id, :sequence, :event_type, :actor_id, :payload_json
                    )
                """), {
                    "encounter_id": encounter_id,
                    "sequence": sequence,
                    "event_type": event_type,
                    "actor_id": actor_id,
                    "payload_json": json.dumps(payload),
                })
                db.commit()
        except SQLAlchemyError as exc:
            logger.warning(f"Choice encounter persistence skipped: {exc}")
