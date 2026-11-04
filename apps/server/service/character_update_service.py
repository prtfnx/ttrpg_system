"""Atomic character updates with original-intent receipts and current-state replay."""
import hashlib
import json
from collections.abc import Callable
from copy import deepcopy
from dataclasses import dataclass
from typing import Any

from database.models import CharacterPermission, Entity, GamePlayer, SessionCharacter, VirtualTable
from service.character_update_recovery import CharacterUpdateOutcomeUnknown, PendingCharacterUpdate
from service.session_operation_receipts import (
    OperationIdentity,
    OperationRejected,
    bounded_json,
    find_receipt,
    lock_operation_session,
    session_actor_is_dm,
    stage_receipt,
)


class StagedCharacterUpdateRejected(ValueError):
    def __init__(self, result: dict[str, Any]):
        self.result = result
        super().__init__(str(result.get('error', 'Character update rejected')))


@dataclass(frozen=True)
class CharacterUpdateIntent:
    identity: OperationIdentity
    character_id: str
    updates: dict
    expected_version: int | None
    reconciliation_digest: str | None = None

    @classmethod
    def create(cls, session_id, actor_id, request_id, character_id, updates, expected_version=None,
               reconciliation_digest=None):
        if not isinstance(character_id, str) or not 1 <= len(character_id) <= 64:
            raise OperationRejected('Character identity is required (up to 64 characters)')
        if expected_version is not None and (isinstance(expected_version, bool) or not isinstance(expected_version, int)
                                           or not 1 <= expected_version <= 9007199254740991):
            raise OperationRejected('Expected character version must be a positive integer')
        if not isinstance(updates, dict) or not updates and reconciliation_digest is None:
            raise OperationRejected('A nonempty character patch is required')
        if reconciliation_digest is not None:
            if (not isinstance(reconciliation_digest, str) or len(reconciliation_digest) != 64
                    or any(char not in '0123456789abcdef' for char in reconciliation_digest) or updates):
                raise OperationRejected('Stat reconciliation requires only its original plan digest')
        body = dict(character_id=character_id, updates=updates, version=expected_version,
                    reconciliation_digest=reconciliation_digest)
        digest = hashlib.sha256(bounded_json(body, 512 * 1024).encode()).hexdigest()
        identity = OperationIdentity.create(session_id, actor_id, 'character_update', request_id, {'intent_digest': digest})
        return cls(identity, character_id, deepcopy(updates), expected_version, reconciliation_digest)


def character_actor_can_edit(db, game, source, actor_id):
    member = db.query(GamePlayer.id).filter_by(session_id=game.id, user_id=actor_id).first()
    dm = session_actor_is_dm(db, game, actor_id)
    if not game.is_active or not (dm or member is not None):
        return False
    return bool(dm or source.owner_user_id == actor_id or db.query(CharacterPermission.id).filter_by(
        session_id=game.id, character_id=source.character_id, user_id=actor_id, can_edit=True).first())


def read_character_update_outcome(db, game, identity, receipt, *, internal=False):
    source = db.query(SessionCharacter).filter_by(session_id=identity.session_id,
        character_id=receipt['character_id']).with_for_update().one_or_none()
    if source is None:
        raise CharacterUpdateOutcomeUnknown('Character source disappeared; current cache state cannot be reconstructed')
    authorized = character_actor_can_edit(db, game, source, identity.actor_id)
    if receipt.get('reconciliation') and not session_actor_is_dm(db, game, identity.actor_id):
        authorized = False
    if not internal and not authorized:
        raise OperationRejected('Current character edit authority is required', 'forbidden')
    projections = []
    for entity, table_id in db.query(Entity, VirtualTable.table_id).join(VirtualTable,
            Entity.table_id == VirtualTable.id).filter(VirtualTable.session_id == identity.session_id,
            Entity.character_id == source.character_id).order_by(Entity.id).all():
        projections.append(dict(sprite_id=entity.sprite_id, table_id=table_id, layer=entity.layer,
            stats={'hp': entity.hp, 'max_hp': entity.max_hp, 'ac': entity.ac}))
    result = {**receipt, 'success': True, 'version': source.version,
        'character_data': json.loads(source.character_data), 'character_archived': source.archived_at is not None,
        'token_updates': projections, 'token_stats': {}, 'applied_updates': {},
        'replayed': True, 'resync_required': True}
    return result, authorized


class CharacterUpdateService:
    def __init__(self, session_factory: Callable, stage: Callable, recovery):
        self._factory, self._stage, self._recovery = session_factory, stage, recovery

    def _remember(self, intent, before_version=0, before_document='', result=None):
        if self._recovery.has_pending(intent.identity.session_id):
            return
        result = result or {}
        self._recovery.remember(PendingCharacterUpdate(
            intent.identity.session_id, intent.character_id, intent.identity.actor_id, intent.identity.operation_id,
            before_version, before_document, json.dumps(result.get('character_data', {})), deepcopy(result),
            deepcopy(intent.updates), reconciliation_digest=intent.reconciliation_digest, operation=intent.identity,
        ))

    def execute(self, intent: CharacterUpdateIntent):
        if self._recovery.has_pending(intent.identity.session_id):
            raise CharacterUpdateOutcomeUnknown('Resolve the pending character update first')
        commit_started, lookup_complete = False, False
        receipt_found = False
        before_version, before_document, result = 0, '', None
        try:
            with self._factory() as db:
                game = lock_operation_session(db, intent.identity, require_dm=False)
                source = db.query(SessionCharacter).filter_by(session_id=intent.identity.session_id,
                    character_id=intent.character_id).with_for_update().one_or_none()
                if source is None:
                    raise OperationRejected('Character not found', 'forbidden')
                if not character_actor_can_edit(db, game, source, intent.identity.actor_id):
                    raise OperationRejected('Current character edit authority is required', 'forbidden')
                dm = session_actor_is_dm(db, game, intent.identity.actor_id)
                if intent.reconciliation_digest is not None and not dm:
                    raise OperationRejected('Current session DM authority is required for stat reconciliation', 'forbidden')
                receipt = find_receipt(db, intent.identity)
                lookup_complete = True
                receipt_found = receipt is not None
                if receipt is not None:
                    return read_character_update_outcome(db, game, intent.identity, receipt)[0]
                before_version, before_document = source.version, source.character_data
                result = self._stage(db, intent.identity.session_id, intent.character_id, intent.updates,
                    intent.identity.actor_id, expected_version=intent.expected_version, bypass_owner_check=dm,
                    stat_reconciliation_digest=intent.reconciliation_digest)
                receipt = dict(success=True, operation_id=intent.identity.operation_id, character_id=intent.character_id,
                               accepted_version=result['version'], reconciliation=intent.reconciliation_digest is not None)
                stage_receipt(db, intent.identity, receipt)
                result = {**result, **receipt, 'replayed': False}
                commit_started = True
                db.commit()
                return result
        except StagedCharacterUpdateRejected as exc:
            if not commit_started:
                return {**exc.result, 'operation_id': intent.identity.operation_id, 'not_accepted': True}
        except OperationRejected as exc:
            if not commit_started:
                return dict(success=False, error=str(exc), code=exc.code, operation_id=intent.identity.operation_id)
        except Exception as exc:
            if lookup_complete and not receipt_found and not commit_started and not isinstance(exc, CharacterUpdateOutcomeUnknown):
                return dict(success=False, error='Character update could not be saved', code='persistence_failed',
                            operation_id=intent.identity.operation_id, not_accepted=True)
        self._remember(intent, before_version, before_document, result)
        resolved = self._recovery.resolve(intent.identity.session_id)
        if resolved is None:
            raise CharacterUpdateOutcomeUnknown('Character update recovery ownership disappeared')
        # Keep ownership until the protocol has installed the verified current
        # projections, even when the original transaction proved rollback.
        return {**(resolved.current_result or {}), 'success': resolved.committed,
                'operation_id': intent.identity.operation_id, 'recovery_required': True,
                **({} if resolved.committed else {'error': 'Character update did not commit', 'not_accepted': True})}
