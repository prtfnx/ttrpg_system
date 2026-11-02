"""Durable table create/copy/import acceptance with detached worker inputs."""

import hashlib
import uuid
from collections.abc import Callable
from contextlib import AbstractContextManager
from copy import deepcopy
from dataclasses import dataclass

from core_table.table import VirtualTable
from database import crud, models
from database.database import SessionLocal
from service.character_token_binding import CharacterBindingError, prepare_character_bindings
from service.session_operation_receipts import (
    OperationIdentity,
    OperationOutcomeUnknown,
    OperationRejected,
    bounded_json,
    find_receipt,
    lock_operation_session,
    session_actor_is_dm,
    stage_receipt,
)
from sqlalchemy.orm import Session

MAX_IMPORT_BYTES = 5 * 1024 * 1024
MAX_ENTITIES = 5000


def _dimension(value):
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not 500 <= value <= 10000 or int(value) != value:
        raise OperationRejected('Table width and height must be whole numbers between 500 and 10000')
    return int(value)


def _validate_snapshot(snapshot: dict) -> int:
    if not isinstance(snapshot, dict) or not isinstance(snapshot.get('layers', {}), dict):
        raise OperationRejected('table_data and its layers must be objects')
    layers = snapshot.get('layers', {})
    if any(not isinstance(entities, (dict, list)) for entities in layers.values()):
        raise OperationRejected('Table layers must contain entity lists or objects')
    count = sum(len(entities) for entities in layers.values())
    if count > MAX_ENTITIES:
        raise OperationRejected('Table imports are limited to 5000 entities')
    bounded_json(snapshot, MAX_IMPORT_BYTES)
    return count


def _copy_snapshot(source: dict) -> dict:
    copied = deepcopy(source)
    copied.pop('table_id', None)
    for entities in copied.get('layers', {}).values():
        for entity in entities.values() if isinstance(entities, dict) else entities:
            entity['sprite_id'] = str(uuid.uuid4())
    for wall in copied.get('walls', []):
        wall['wall_id'] = str(uuid.uuid4())
        wall.pop('table_id', None)
    for zone in copied.get('cover_zones', []):
        zone['zone_id'] = str(uuid.uuid4())
    return copied


@dataclass(frozen=True)
class TableCreateIntent:
    identity: OperationIdentity
    name: str
    width: int
    height: int
    source_id: str | None
    initial_data: dict | None
    local_id: str | None

    @property
    def table_id(self) -> str:
        scope = self.identity
        return str(uuid.uuid5(uuid.NAMESPACE_URL,
            f'ttrpg:table_create:{scope.session_id}:{scope.actor_id}:{scope.operation_id}'))

    @classmethod
    def create(cls, session_id, actor_id, request_id, data):
        if not isinstance(data, dict) or not data or not data.keys() <= {
            'table_name', 'width', 'height', 'local_table_id', 'source_table_id', 'table_data',
        }:
            raise OperationRejected('Invalid table creation fields')
        name = data.get('table_name', 'default')
        if not isinstance(name, str) or not 1 <= len(name.strip()) <= 50:
            raise OperationRejected('Table name must be nonempty text up to 50 characters')
        width, height = _dimension(data.get('width', 2000)), _dimension(data.get('height', 2000))
        source_id, initial_data, local_id = data.get('source_table_id'), data.get('table_data'), data.get('local_table_id')
        if source_id is not None:
            try:
                source_id = str(uuid.UUID(source_id))
            except (ValueError, TypeError, AttributeError) as exc:
                raise OperationRejected('source_table_id must be a table UUID') from exc
        if source_id is not None and initial_data is not None:
            raise OperationRejected('Choose either source_table_id or table_data')
        if local_id is not None and (not isinstance(local_id, str) or not local_id.strip() or len(local_id) > 128):
            raise OperationRejected('local_table_id must be nonempty text up to 128 characters')
        snapshot_hash = None
        if initial_data is not None:
            _validate_snapshot(initial_data)
            snapshot_hash = hashlib.sha256(bounded_json(initial_data, MAX_IMPORT_BYTES).encode('utf-8')).hexdigest()
        identity = OperationIdentity.create(session_id, actor_id, 'table_create', request_id, {
            'name': name.strip(), 'width': width, 'height': height, 'source_id': source_id,
            'snapshot_hash': snapshot_hash, 'local_id': local_id,
        })
        return cls(identity, name.strip(), width, height, source_id, deepcopy(initial_data), local_id)


@dataclass(frozen=True)
class TableCreationAccepted:
    receipt: dict
    snapshot: dict | None
    replayed: bool
    actor_authorized: bool = True


class TableCreationService:
    def __init__(self, session_factory: Callable[[], AbstractContextManager[Session]] | None = None):
        self._factory = session_factory or SessionLocal

    @staticmethod
    def _read_outcome(db, intent, receipt) -> TableCreationAccepted:
        row = db.query(models.VirtualTable).filter_by(table_id=intent.table_id,
            session_id=intent.identity.session_id).one_or_none()
        snapshot = None
        if row is not None:
            table, loaded = crud.load_table_from_db(db, intent.table_id)
            if not loaded or table is None:
                raise OperationOutcomeUnknown('Accepted table could not be reconstructed')
            snapshot = table.to_dict()
        return TableCreationAccepted(receipt, snapshot, True)

    def resolve(self, intent: TableCreateIntent, *, internal_recovery: bool = False) -> TableCreationAccepted | None:
        with self._factory() as db:
            game = lock_operation_session(db, intent.identity, require_dm=not internal_recovery)
            receipt = find_receipt(db, intent.identity)
            if receipt is None:
                return None
            outcome = self._read_outcome(db, intent, receipt)
            return TableCreationAccepted(outcome.receipt, outcome.snapshot, True,
                bool(game.is_active and session_actor_is_dm(db, game, intent.identity.actor_id)) if internal_recovery else True)

    def execute(self, intent: TableCreateIntent, source_snapshot: dict | None = None,
                source_dirty: bool = False) -> TableCreationAccepted:
        commit_started = False
        try:
            with self._factory() as db:
                lock_operation_session(db, intent.identity)
                receipt = find_receipt(db, intent.identity)
                if receipt is not None:
                    return self._read_outcome(db, intent, receipt)
                initial_data = intent.initial_data
                if intent.source_id is not None:
                    source = db.query(models.VirtualTable).filter_by(table_id=intent.source_id,
                        session_id=intent.identity.session_id).with_for_update().one_or_none()
                    if source is None:
                        raise OperationRejected('Source table not found in this session', 'forbidden')
                    if source_dirty:
                        raise OperationRejected('Resolve source table persistence before copying', 'conflict')
                    if source_snapshot is None:
                        table, loaded = crud.load_table_from_db(db, intent.source_id)
                        if not loaded or table is None:
                            raise OperationRejected('Source table could not be read')
                        source_snapshot = table.to_dict()
                    _validate_snapshot(source_snapshot)
                    initial_data = _copy_snapshot(source_snapshot)
                table = VirtualTable(intent.name, intent.width, intent.height, table_id=intent.table_id)
                if initial_data is not None:
                    expected = _validate_snapshot(initial_data)
                    table.from_dict({**initial_data, 'table_name': intent.name, 'width': intent.width, 'height': intent.height})
                    if len(table.entities) != expected:
                        raise OperationRejected('Table data contains invalid entities')
                changes = [{'kind': 'sprite', 'id': entity.sprite_id, 'before': None, 'after': entity.to_dict()}
                           for entity in table.entities.values()]
                projections = prepare_character_bindings(db, changes, intent.identity.session_id,
                    intent.identity.actor_id, bypass_owner_check=True)
                for entity in table.entities.values():
                    for field, value in projections.get(entity.sprite_id, {}).items():
                        setattr(entity, field, value)
                crud.stage_new_table_snapshot(db, table, intent.identity.session_id)
                receipt = dict(success=True, operation_id=intent.identity.operation_id, table_id=intent.table_id,
                               name=intent.name, local_table_id=intent.local_id)
                stage_receipt(db, intent.identity, receipt)
                snapshot = deepcopy(table.to_dict())
                commit_started = True
                db.commit()
                return TableCreationAccepted(receipt, snapshot, False)
        except (OperationRejected, OperationOutcomeUnknown):
            if not commit_started:
                raise
        except CharacterBindingError as exc:
            if not commit_started:
                raise OperationRejected(str(exc), exc.code) from exc
        except Exception as exc:
            if not commit_started:
                raise OperationRejected('Table creation could not be saved', 'persistence_failed') from exc
        try:
            recovered = self.resolve(intent)
        except Exception as exc:
            raise OperationOutcomeUnknown('Table creation outcome is unknown') from exc
        if recovered is not None:
            return recovered
        raise OperationRejected('Table creation was not committed. Retry the original request.', 'persistence_failed')
