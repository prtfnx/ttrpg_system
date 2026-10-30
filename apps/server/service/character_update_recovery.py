"""Resolve an admitted character update without treating commit errors as rollback."""
from __future__ import annotations

from contextvars import ContextVar
from dataclasses import dataclass
from typing import Any, Callable

from database.models import GameSession, SessionCharacter
from sqlalchemy import text

character_update_request_id: ContextVar[str | None] = ContextVar("character_update_request_id", default=None)


class CharacterUpdateOutcomeUnknown(RuntimeError):
    """Source settlement cannot yet be proved; live snapshots must stay fenced."""


@dataclass(frozen=True)
class PendingCharacterUpdate:
    session_id: int
    character_id: str
    user_id: int
    request_id: str | None
    before_version: int
    before_document: str
    after_document: str
    result: dict[str, Any]
    updates: dict[str, Any]
    reconciliation_digest: str | None = None


@dataclass(frozen=True)
class ResolvedCharacterUpdate:
    attempt: PendingCharacterUpdate
    committed: bool


class CharacterUpdateRecovery:
    """Access is serialized by session ownership and the stable session-row lock.

    This verifies one in-process CAS attempt. It is not a durable operation ledger
    and must never infer failure from an arbitrary newer or missing source row.
    """

    def __init__(self, session_factory: Callable):
        self._factory = session_factory
        self._pending: dict[int, PendingCharacterUpdate] = {}

    def has_pending(self, session_id: int) -> bool:
        return session_id in self._pending

    def remember(self, attempt: PendingCharacterUpdate) -> None:
        if self.has_pending(attempt.session_id):
            raise CharacterUpdateOutcomeUnknown("Resolve the previous character update first")
        self._pending[attempt.session_id] = attempt

    def complete(self, resolved: ResolvedCharacterUpdate) -> None:
        if self._pending.get(resolved.attempt.session_id) is not resolved.attempt:
            raise RuntimeError("Character recovery ownership changed")
        del self._pending[resolved.attempt.session_id]

    def resolve(self, session_id: int) -> ResolvedCharacterUpdate | None:
        attempt = self._pending.get(session_id)
        if attempt is None:
            return None
        try:
            committed = self._lookup(attempt)
        except CharacterUpdateOutcomeUnknown:
            raise
        except Exception as exc:
            raise CharacterUpdateOutcomeUnknown("Character outcome lookup is unavailable") from exc
        return ResolvedCharacterUpdate(attempt, committed)

    def _lookup(self, attempt: PendingCharacterUpdate) -> bool:
        with self._factory() as db:
            connection = db.connection()
            if connection.dialect.name == "postgresql":
                if connection.get_isolation_level() != "READ COMMITTED":
                    raise CharacterUpdateOutcomeUnknown("Character recovery requires READ COMMITTED")
                db.execute(text("SET LOCAL lock_timeout = '5s'"))
            session = db.query(GameSession).filter_by(id=attempt.session_id).with_for_update().one_or_none()
            if session is None:
                raise CharacterUpdateOutcomeUnknown("Character session disappeared during recovery")
            source = db.query(SessionCharacter).filter_by(
                session_id=attempt.session_id, character_id=attempt.character_id, archived_at=None,
            ).one_or_none()
            if source is not None:
                if (source.version == attempt.result["version"] and source.character_data == attempt.after_document
                        and source.last_modified_by == attempt.user_id):
                    return True
                if source.version == attempt.before_version and source.character_data == attempt.before_document:
                    return False
            raise CharacterUpdateOutcomeUnknown("Character changed outside the pending update; reconcile before retrying")
