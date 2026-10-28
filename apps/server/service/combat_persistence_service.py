from __future__ import annotations

import json
from copy import deepcopy
from dataclasses import dataclass
from typing import Any, Callable

from database.database import SessionLocal
from database.models import CombatActionJournal, CombatEncounter, GameSession
from service.combat_movement import CombatSpriteMovement, stage_combat_movements
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from utils.time import utc_now


@dataclass(frozen=True)
class PersistedCombatCommand:
    result: dict[str, Any]
    state_version: int
    duplicate: bool = False


@dataclass(frozen=True)
class CombatJournalEntry:
    command_type: str
    state_before: dict[str, Any]
    state_version: int


class CombatCommitOutcomeUnknown(RuntimeError):
    """Commit was attempted, but its durable outcome cannot yet be established."""


@dataclass(frozen=True)
class PendingCombatCommit:
    encounter_id: str
    requester_key: str
    sequence_id: int
    state_before: dict[str, Any]
    state_after: dict[str, Any]
    movements: tuple[CombatSpriteMovement, ...]


@dataclass(frozen=True)
class ResolvedCombatCommit:
    attempt: PendingCombatCommit
    committed: PersistedCombatCommand | None


class CombatPersistenceService:
    """Atomically append an accepted command and update its combat snapshot."""

    def __init__(self, session_factory: Callable = SessionLocal):
        self._session_factory = session_factory
        # Access is ordered by the application's session mutation ownership.
        self._pending: dict[str, PendingCombatCommit] = {}

    def has_pending(self, session_code: str) -> bool:
        return session_code in self._pending

    def resolve_pending(self, session_code: str) -> ResolvedCombatCommit | None:
        attempt = self._pending.get(session_code)
        if attempt is None:
            return None
        return ResolvedCombatCommit(attempt, self._resolve_commit(session_code, attempt))

    def complete_recovery(self, session_code: str, resolved: ResolvedCombatCommit) -> None:
        """Clear quarantine only after the application has installed the outcome."""
        if self._pending.get(session_code) is not resolved.attempt:
            raise RuntimeError("Combat recovery ownership changed")
        del self._pending[session_code]

    def _resolve_commit(self, session_code: str, attempt: PendingCombatCommit) -> PersistedCombatCommand | None:
        with self._session_factory() as db:
            connection = db.connection()
            if connection.dialect.name == "postgresql" and connection.get_isolation_level() != "READ COMMITTED":
                raise RuntimeError("Combat outcome recovery requires READ COMMITTED")
            if connection.dialect.name == "postgresql":
                db.execute(text("SET LOCAL lock_timeout = '5s'"))
            # Acceptance takes this stable row lock before any encounter write.
            # Wait for that transaction to end, then read the receipt in a new
            # READ COMMITTED statement snapshot. A plain SELECT miss is unsafe.
            session = db.query(GameSession).filter_by(session_code=session_code).with_for_update().one_or_none()
            if session is None:
                raise RuntimeError("Combat session disappeared during recovery")
            action = self._find_action(db, attempt.encounter_id, attempt.requester_key, attempt.sequence_id)
            if action is not None:
                encounter = db.query(CombatEncounter).filter_by(encounter_id=attempt.encounter_id).one()
                if encounter.session_id != session.id:
                    raise RuntimeError("Combat recovery session mismatch")
            return self._stored_command(action, duplicate=False) if action is not None else None

    @staticmethod
    def requester_key(user_id: int | None, client_id: str) -> str:
        return f"user:{user_id}" if user_id is not None else f"client:{client_id}"

    def find_result(
        self,
        encounter_id: str,
        requester_key: str,
        sequence_id: int,
    ) -> PersistedCombatCommand | None:
        with self._session_factory() as db:
            action = self._find_action(
                db,
                encounter_id,
                requester_key,
                sequence_id,
            )
            return self._stored_command(action, duplicate=True) if action else None

    def last_action(self, encounter_id: str) -> CombatJournalEntry | None:
        with self._session_factory() as db:
            action = (
                db.query(CombatActionJournal)
                .filter(CombatActionJournal.encounter_id == encounter_id)
                .order_by(
                    CombatActionJournal.state_version.desc(),
                    CombatActionJournal.id.desc(),
                )
                .first()
            )
            if not action:
                return None
            return CombatJournalEntry(
                command_type=action.command_type,
                state_before=json.loads(action.state_before_json or "{}"),
                state_version=action.state_version,
            )

    def persist_accepted(
        self,
        *,
        session_code: str,
        requester_key: str,
        sequence_id: int,
        actor_id: str | None,
        command_type: str,
        command_payload: dict[str, Any],
        result_payload: dict[str, Any],
        state_before: dict[str, Any],
        state_after: dict[str, Any],
        created_by: int | None,
        movements: tuple[CombatSpriteMovement, ...] = (),
    ) -> PersistedCombatCommand:
        if self.has_pending(session_code):
            raise CombatCommitOutcomeUnknown("Resolve the previous combat commit before accepting another command")
        encounter_id = str(state_after['combat_id'])
        attempt = None
        try:
            with self._session_factory() as db:
                persisted = self.stage_accepted(
                    db, session_code=session_code, requester_key=requester_key,
                    sequence_id=sequence_id, actor_id=actor_id,
                    command_type=command_type, command_payload=command_payload,
                    result_payload=result_payload, state_before=state_before,
                    state_after=state_after, created_by=created_by,
                )
                if persisted.duplicate:
                    return persisted
                if movements and not persisted.duplicate:
                    encounter = db.query(CombatEncounter).filter_by(encounter_id=encounter_id).one()
                    if any(move.table_id != encounter.table_id for move in movements):
                        raise ValueError("Movement must use the encounter table")
                    stage_combat_movements(db, encounter.session_id, movements)
                attempt = PendingCombatCommit(
                    encounter_id, requester_key, sequence_id, deepcopy(state_before),
                    {**deepcopy(state_after), 'state_version': persisted.state_version}, deepcopy(movements),
                )
                db.commit()
            return persisted
        except Exception as error:
            if attempt is None:
                if isinstance(error, IntegrityError):
                    existing = self.find_result(encounter_id, requester_key, sequence_id)
                    if existing is not None:
                        return existing
                raise
            # A failed commit response does not prove rollback. The original
            # session is closed before resolving on a fresh connection.
            self._pending[session_code] = attempt
            try:
                recovered = self._resolve_commit(session_code, attempt)
            except Exception as recovery_error:
                raise CombatCommitOutcomeUnknown("Combat outcome is uncertain; wait for recovery before retrying") from recovery_error
            del self._pending[session_code]
            if recovered is not None:
                return recovered
            raise

    def stage_accepted(
        self,
        db: Session,
        *,
        session_code: str,
        requester_key: str,
        sequence_id: int,
        actor_id: str | None,
        command_type: str,
        command_payload: dict[str, Any],
        result_payload: dict[str, Any],
        state_before: dict[str, Any],
        state_after: dict[str, Any],
        created_by: int | None,
    ) -> PersistedCombatCommand:
        """Flush snapshot/journal into a caller-owned transaction.

        The caller owns commit, rollback, duplicate-race recovery and publication.
        Returned values are provisional until that outer commit succeeds.
        """
        encounter_id = str(state_after['combat_id'])
        encounter = self._get_or_create_encounter(db, session_code, state_after)
        existing = self._find_action(db, encounter_id, requester_key, sequence_id)
        if existing:
            return self._stored_command(existing, duplicate=True)

        expected_version = state_before.get('state_version')
        if expected_version is not None and expected_version != encounter.state_version:
            raise ValueError("Combat changed before acceptance; reload")
        next_version = int(encounter.state_version or 0) + 1
        state_after = dict(state_after)
        state_after['state_version'] = next_version
        stored_result = dict(result_payload)
        stored_result['state_version'] = next_version
        if isinstance(stored_result.get('combat'), dict):
            stored_result['combat'] = dict(stored_result['combat'])
            stored_result['combat']['state_version'] = next_version
        self._update_snapshot(encounter, state_after, next_version)
        db.add(CombatActionJournal(
            encounter_id=encounter_id, requester_key=requester_key,
            sequence_id=sequence_id, actor_id=actor_id, command_type=command_type,
            command_payload_json=json.dumps(command_payload),
            result_payload_json=json.dumps(stored_result),
            state_before_json=json.dumps(state_before),
            state_after_hash=str(state_after.get('state_hash', '')),
            state_version=next_version, created_by=created_by,
        ))
        db.flush()
        return PersistedCombatCommand(stored_result, next_version)

    @staticmethod
    def _find_action(db, encounter_id, requester_key, sequence_id):
        return db.query(CombatActionJournal).filter(
            CombatActionJournal.encounter_id == encounter_id,
            CombatActionJournal.requester_key == requester_key,
            CombatActionJournal.sequence_id == sequence_id,
        ).first()

    @staticmethod
    def _stored_command(
        action: CombatActionJournal,
        *,
        duplicate: bool,
    ) -> PersistedCombatCommand:
        return PersistedCombatCommand(
            result=json.loads(action.result_payload_json),
            state_version=action.state_version,
            duplicate=duplicate,
        )

    @staticmethod
    def _get_or_create_encounter(db, session_code, state_after):
        encounter_id = str(state_after['combat_id'])
        # Serialize acceptance and future outcome lookups on the stable session
        # row, including the first command before an encounter row exists.
        game_session = db.query(GameSession).filter(
            GameSession.session_code == session_code
        ).with_for_update().first()
        if not game_session:
            raise ValueError(f"Game session not found: {session_code}")
        encounter = db.query(CombatEncounter).filter(
            CombatEncounter.encounter_id == encounter_id
        ).with_for_update().first()
        if encounter:
            if encounter.session_id != game_session.id or encounter.table_id != str(state_after.get('table_id', '')):
                raise ValueError("Encounter does not belong to this session/table")
            return encounter

        encounter = CombatEncounter(
            encounter_id=encounter_id,
            session_id=game_session.id,
            table_id=str(state_after.get('table_id', '')),
        )
        db.add(encounter)
        db.flush()
        return encounter

    @staticmethod
    def _update_snapshot(
        encounter: CombatEncounter,
        state_after: dict[str, Any],
        state_version: int,
    ) -> None:
        encounter.phase = state_after.get('phase', 'active')
        encounter.ended_at = utc_now() if encounter.phase == 'ended' else None
        encounter.round_number = state_after.get('round_number', 1)
        encounter.current_turn_index = state_after.get('current_turn_index', 0)
        encounter.state_version = state_version
        encounter.combatants_json = json.dumps(state_after.get('combatants', []))
        encounter.settings_json = json.dumps(state_after.get('settings', {}))
        encounter.action_log_json = json.dumps(state_after.get('action_log', []))
