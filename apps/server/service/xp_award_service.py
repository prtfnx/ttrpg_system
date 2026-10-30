"""Atomic XP acceptance and durable retries; call from a bounded worker."""

import json
from collections.abc import Callable
from contextlib import AbstractContextManager
from copy import deepcopy
from dataclasses import dataclass

from database.database import SessionLocal
from database.models import CharacterLog, GamePlayer, GameSession, SessionCharacter
from service.character_rules import level_for_xp
from service.character_schema import validate_character_document
from service.session_operation_receipts import (
    OperationIdentity,
    OperationOutcomeUnknown,
    OperationRejected,
    bounded_json,
    find_receipt,
    stage_receipt,
)
from sqlalchemy import text
from sqlalchemy.orm import Session
from utils.roles import is_dm
from utils.time import utc_now


@dataclass(frozen=True)
class XPAwardIntent:
    identity: OperationIdentity
    character_id: str
    amount: int
    source: str
    description: str

    @classmethod
    def create(cls, session_id: int, actor_id: int, request_id: str, data: dict):
        if not isinstance(data, dict) or not data.keys() <= {
            'character_id', 'amount', 'source', 'description', 'session_code',
        }:
            raise OperationRejected('Invalid XP award fields')
        character_id, amount = data.get('character_id'), data.get('amount')
        source, description = data.get('source', 'other'), data.get('description', '')
        if not isinstance(character_id, str) or not character_id.strip() or len(character_id) > 64:
            raise OperationRejected('character_id is required (up to 64 characters)')
        if isinstance(amount, bool) or not isinstance(amount, int) or not 0 < amount <= 1_000_000:
            raise OperationRejected('XP amount must be an integer from 1 to 1000000')
        if not isinstance(source, str) or not 1 <= len(source) <= 50:
            raise OperationRejected('XP source must be text from 1 to 50 characters')
        if not isinstance(description, str) or len(description) > 300:
            raise OperationRejected('XP description must be text up to 300 characters')
        source, description = source.strip() or 'other', description.strip()
        payload = dict(character_id=character_id, amount=amount, source=source, description=description)
        identity = OperationIdentity.create(session_id, actor_id, 'xp_award', request_id, payload)
        return cls(identity, character_id, amount, source, description)


def _award_document(raw: dict, amount: int) -> tuple[dict, dict]:
    document = validate_character_document(raw)
    inner = document['data']
    values = [location[key] for location in (document, inner) for key in ('experience', 'currentXP')
              if key in location and location[key] is not None]
    parsed = []
    for value in values:
        if isinstance(value, str) and value.isascii() and value.isdigit():
            value = int(value)
        if isinstance(value, bool) or not isinstance(value, int) or not 0 <= value <= 1_000_000_000:
            raise OperationRejected('Stored XP is invalid; repair it before awarding XP')
        parsed.append(value)
    if len(set(parsed)) > 1:
        raise OperationRejected('Stored XP fields disagree; repair them before awarding XP')
    current = parsed[0] if parsed else 0
    level = inner.get('level', document.get('level', 1)) or 1
    if isinstance(level, bool) or not isinstance(level, int) or not 1 <= level <= 20:
        raise OperationRejected('Stored level is invalid; repair it before awarding XP')
    old_level = max(level_for_xp(current), level)
    new_xp = current + amount
    new_level = max(old_level, level_for_xp(new_xp))
    leveled_up = new_level > old_level
    inner['experience'] = new_xp
    inner.pop('currentXP', None)
    document.pop('experience', None)
    document.pop('currentXP', None)
    if leveled_up:
        inner.update(level=new_level, pending_level_up=True)
    document = validate_character_document(document)
    return document, dict(new_xp=new_xp, leveled_up=leveled_up, new_level=new_level)


class XPAwardService:
    def __init__(self, session_factory: Callable[[], AbstractContextManager[Session]] = SessionLocal):
        self._factory = session_factory

    @staticmethod
    def _authorize_and_lock(db, identity: OperationIdentity):
        connection = db.connection()
        if connection.dialect.name == 'postgresql':
            if connection.get_isolation_level() != 'READ COMMITTED':
                raise OperationRejected('XP acceptance requires READ COMMITTED')
            db.execute(text("SET LOCAL lock_timeout = '5s'"))
        game = db.query(GameSession).filter_by(id=identity.session_id, is_active=True).with_for_update().one_or_none()
        role = db.query(GamePlayer.role).filter_by(session_id=identity.session_id, user_id=identity.actor_id).scalar()
        if game is None or not (game.owner_id == identity.actor_id or is_dm(role)):
            raise OperationRejected('Current session DM authority is required', 'forbidden')

    def lookup(self, intent: XPAwardIntent) -> dict | None:
        # A stable session-row lock waits for the original transaction to settle.
        # At READ COMMITTED, absence after that barrier proves no accepted effect.
        with self._factory() as db:
            self._authorize_and_lock(db, intent.identity)
            receipt = find_receipt(db, intent.identity)
            return {**receipt, 'replayed': True, 'resync_required': True} if receipt else None

    def execute(self, intent: XPAwardIntent) -> dict:
        commit_started = False
        try:
            with self._factory() as db:
                self._authorize_and_lock(db, intent.identity)
                receipt = find_receipt(db, intent.identity)
                if receipt is not None:
                    return {**receipt, 'replayed': True, 'resync_required': True}
                source = db.query(SessionCharacter).filter_by(session_id=intent.identity.session_id,
                    character_id=intent.character_id, archived_at=None).with_for_update().one_or_none()
                if source is None:
                    raise OperationRejected('Active character not found in this session', 'forbidden')
                document, progression = _award_document(json.loads(source.character_data), intent.amount)
                if document['character_id'] != intent.character_id:
                    raise OperationRejected('Stored character identity does not match its source')
                source.character_data = bounded_json(document, 512 * 1024)
                source.version = int(source.version or 1) + 1
                source.updated_at, source.last_modified_by = utc_now(), intent.identity.actor_id
                db.add(CharacterLog(character_id=intent.character_id, session_id=intent.identity.session_id,
                    user_id=intent.identity.actor_id, action_type='xp_award',
                    description=f'+{intent.amount} XP from {intent.source}'
                    + (f': {intent.description}' if intent.description else '')))
                result = dict(success=True, character_id=intent.character_id, amount=intent.amount,
                    operation_id=intent.identity.operation_id, version=source.version, **progression)
                stage_receipt(db, intent.identity, result)
                commit_started = True
                db.commit()
                return {**result, 'character_data': deepcopy(document), 'replayed': False}
        except OperationRejected:
            if not commit_started:
                raise
        except Exception as exc:
            if not commit_started:
                raise OperationRejected('XP award could not be saved', 'persistence_failed') from exc
        try:
            recovered = self.lookup(intent)
        except Exception as exc:
            raise OperationOutcomeUnknown('XP outcome is unknown. Retry only the original request identity and input.') from exc
        if recovered is not None:
            return recovered
        raise OperationRejected('XP award was not committed. Retry the original request.', 'persistence_failed')
