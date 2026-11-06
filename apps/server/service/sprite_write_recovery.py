"""Resolve an admitted sprite run without replaying its staged mutations."""
import copy
from dataclasses import dataclass, field
from typing import Callable

from core_table.table import Entity
from database import crud, models
from service.session_operation_receipts import OperationIdentity, lock_operation_session
from service.sprite_editor_commands import SpriteCommandScope, SpriteEditorCommandService
from sqlalchemy.orm import Session
from utils.roles import can_interact


class SpriteWriteUnknown(RuntimeError):
    """Receipt lookup/current state cannot yet prove a complete outcome."""


@dataclass
class PendingSpriteWrite:
    scopes: tuple[SpriteCommandScope, ...]
    targets: dict[str, set[str]]
    factory: Callable[[], Session] = field(repr=False)
    accepted: bool = False
    failure: tuple[str, str] | None = None

    @classmethod
    def create(cls, commands, factory):
        scopes = tuple(command['scope'] for command in commands)
        if not scopes or len({(scope.session_id, scope.actor_id) for scope in scopes}) != 1:
            raise ValueError('A sprite write must belong to one authenticated session actor')
        targets: dict[str, set[str]] = {}
        for command in commands:
            scope, before = command['scope'], command['before_snapshot']
            ids = before.get('_sprite_targets')
            if not ids or any(not isinstance(target, str) or not target for target in ids):
                raise ValueError('An admitted sprite write requires explicit affected sprite identities')
            targets.setdefault(scope.table_id, set()).update(ids)
        return cls(scopes, targets, factory)


@dataclass(frozen=True)
class SpriteWriteResolution:
    committed: bool
    authorized: bool
    receipts: dict[str, dict]
    # Detached current entities, including explicit absence after deletion.
    sprites: dict[str, dict[str, Entity | None]]


def resolve_sprite_write(attempt: PendingSpriteWrite) -> SpriteWriteResolution:
    """Wait behind the acceptance transaction on a fresh READ COMMITTED session.

    Absence proves rollback only while the original scope/table/actor and retry
    timeline still exist. A missing/pruned/corrupt receipt is never inferred from
    a matching sprite value, nor can partial journal visibility settle a run.
    """
    first = attempt.scopes[0]
    service = SpriteEditorCommandService(attempt.factory)
    with attempt.factory() as db:
        game = lock_operation_session(db, OperationIdentity(first.session_id, first.actor_id,
            'sprite_editor', first.operation_id, first.request_hash), require_dm=False)
        receipts = {}
        stored_tables = {}
        for table_id in sorted(attempt.targets):
            table = db.query(models.VirtualTable).filter_by(table_id=table_id, session_id=first.session_id
                ).with_for_update().one_or_none()
            if table is None:
                raise SpriteWriteUnknown('Original sprite table disappeared')
            stored_tables[table_id] = table
        for scope in attempt.scopes:
            row = service._entries(db, scope.table_id, scope.actor_id).filter_by(operation_id=scope.operation_id).one_or_none()
            if row is not None:
                if row.request_hash != scope.request_hash or row.kind not in {'sprite', 'sprite_receipt'}:
                    raise SpriteWriteUnknown('Original sprite receipt identity changed')
                receipt = (row.result_json or {}).get('receipt')
                if not isinstance(receipt, dict) or receipt.get('success') is not True or receipt.get('table_id') != scope.table_id:
                    raise SpriteWriteUnknown('Original sprite receipt is invalid')
                receipts[scope.operation_id] = {**copy.deepcopy(receipt),
                    **service._history(db, scope.table_id, scope.actor_id), 'resync_required': True}
        if receipts and len(receipts) != len(attempt.scopes):
            raise SpriteWriteUnknown('Only part of the sprite run is recorded')
        committed = bool(receipts)
        if not committed:
            if attempt.accepted or db.get(models.User, first.actor_id) is None:
                raise SpriteWriteUnknown('Accepted sprite history disappeared')
            for scope in attempt.scopes:
                # Retry age is an admission bound, not evidence of rejection.
                service._require_intent_age(scope)
        role = 'owner' if game.owner_id == first.actor_id else db.query(models.GamePlayer.role).filter_by(
            session_id=first.session_id, user_id=first.actor_id).scalar()
        authorized = bool(game.is_active and role and can_interact(role))
        sprites = {}
        for table_id, targets in attempt.targets.items():
            expected = {row.sprite_id: row.entity_id for row in db.query(models.Entity.sprite_id, models.Entity.entity_id).filter(
                models.Entity.table_id == stored_tables[table_id].id, models.Entity.sprite_id.in_(targets)).all()}
            current, loaded = crud.load_table_from_db(db, table_id)
            if not loaded or current is None:
                raise SpriteWriteUnknown('Current sprite state could not be loaded')
            sprites[table_id] = {}
            for target in targets:
                entity = current.find_entity_by_sprite_id(target)
                if target in expected and (entity is None or entity.entity_id != expected[target]):
                    raise SpriteWriteUnknown('Current sprite identities cannot be loaded losslessly')
                sprites[table_id][target] = copy.deepcopy(entity)
        return SpriteWriteResolution(committed, authorized, receipts, sprites)
