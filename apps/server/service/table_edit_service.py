"""Atomic table metadata/transform edits, independent of full scene snapshots."""
import math
import uuid
from dataclasses import dataclass

from database import crud, models, schemas
from database.database import SessionLocal
from service.session_operation_receipts import (
    OperationIdentity,
    OperationOutcomeUnknown,
    OperationRejected,
    find_receipt,
    lock_operation_session,
    session_actor_is_dm,
    stage_receipt,
)


def _number(value):
    try:
        if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
            raise ValueError
        return float(value)
    except (OverflowError, ValueError):
        raise OperationRejected('Table transforms must contain finite numbers') from None


@dataclass(frozen=True)
class TableEditIntent:
    identity: OperationIdentity
    table_id: str
    patch: dict

    @classmethod
    def create(cls, session_id, actor_id, request_id, kind, data):
        if not isinstance(data, dict):
            raise OperationRejected('Table edit requires complete original data')
        identity = OperationIdentity.create(session_id, actor_id, 'table_edit', request_id,
            {'kind': kind, 'data': data})
        values = data
        patch = {}
        if kind == 'table_move' and set(data) == {'table_id', 'x_moved', 'y_moved'}:
            patch = {'position_x': _number(data['x_moved']), 'position_y': _number(data['y_moved'])}
        elif kind == 'table_scale' and set(data) == {'table_id', 'scale'}:
            scale = _number(data['scale'])
            if not 0 < scale <= 100:
                raise OperationRejected('Table scale must be within (0, 100]')
            patch = {'scale_x': scale, 'scale_y': scale}
        elif (kind == 'table_update_request' and set(data) == {'category', 'type', 'data'}
                and data['category'] == 'table' and data['type'] == 'table_update'):
            values = data['data']
            if (not isinstance(values, dict) or 'table_id' not in values or len(values) < 2
                    or set(values) - {'table_id', 'table_name', 'width', 'height', 'grid_size', 'grid_enabled'}):
                raise OperationRejected('A closed nonempty table metadata patch is required')
            for key, value in values.items():
                if key == 'table_name':
                    if not isinstance(value, str) or not value.strip() or len(value.strip()) > 50:
                        raise OperationRejected('Table name must contain 1..50 characters')
                    patch['name'] = value.strip()
                elif key in {'width', 'height'}:
                    number = _number(value)
                    if not number.is_integer() or not 500 <= number <= 10000:
                        raise OperationRejected('Table dimensions must be whole numbers within 500..10000')
                    patch[key] = int(number)
                elif key == 'grid_size':
                    number = _number(value)
                    if not 10 <= number <= 200:
                        raise OperationRejected('Legacy grid size must be within 10..200')
                    patch['grid_cell_px'] = number
                elif key == 'grid_enabled':
                    if not isinstance(value, bool):
                        raise OperationRejected('grid_enabled must be boolean')
                    patch[key] = value
        else:
            raise OperationRejected('Unsupported table edit or incomplete original input')
        try:
            table_id = str(uuid.UUID(values.get('table_id')))
        except (ValueError, TypeError, AttributeError) as exc:
            raise OperationRejected('table_id must be a table UUID') from exc
        return cls(identity, table_id, patch)


@dataclass(frozen=True)
class TableEditResolution:
    committed: bool
    receipt: dict
    current: dict | None
    authorized: bool
    replayed: bool = True


@dataclass
class PendingTableEdit:
    intent: TableEditIntent
    accepted: bool = False


class TableEditService:
    def __init__(self, factory=None):
        self.factory = factory or SessionLocal

    @staticmethod
    def _current(db, intent):
        table = db.query(models.VirtualTable).filter_by(table_id=intent.table_id,
            session_id=intent.identity.session_id).with_for_update().one_or_none()
        if table is None:
            retired = db.get(models.TableDeletionTombstone, intent.table_id)
            if retired is None or retired.session_id != intent.identity.session_id:
                raise OperationRejected('Table not found in this session', 'forbidden')
            return None, None
        fields = set(intent.patch)
        if fields & {'grid_cell_px', 'grid_enabled'}:
            fields.add('settings_revision')
        return table, {key: getattr(table, key) for key in fields}

    def resolve(self, attempt: PendingTableEdit) -> TableEditResolution:
        intent = attempt.intent
        with self.factory() as db:
            game = lock_operation_session(db, intent.identity, require_dm=False)
            receipt = find_receipt(db, intent.identity)
            table, current = self._current(db, intent)
            if receipt is None and (attempt.accepted or table is None
                    or db.get(models.User, intent.identity.actor_id) is None):
                raise OperationOutcomeUnknown('Missing receipt cannot prove table edit rollback')
            authorized = bool(game.is_active and session_actor_is_dm(db, game, intent.identity.actor_id))
            return TableEditResolution(receipt is not None, receipt or {}, current, authorized)

    def execute(self, intent: TableEditIntent, target_dirty=False) -> TableEditResolution:
        with self.factory() as db, db.begin():
            lock_operation_session(db, intent.identity)
            receipt = find_receipt(db, intent.identity)
            table, current = self._current(db, intent)
            if receipt is not None:
                return TableEditResolution(True, receipt, current, True)
            if table is None:
                raise OperationRejected('Table was deleted', 'conflict')
            if target_dirty:
                raise OperationRejected('Resolve retained table persistence before editing metadata', 'conflict')
            crud.update_virtual_table(db, intent.table_id, schemas.VirtualTableUpdate(**intent.patch), commit=False)
            receipt = {'success': True, 'domain': 'table_edit', 'operation_id': intent.identity.operation_id,
                'table_id': intent.table_id}
            stage_receipt(db, intent.identity, receipt)
            _, current = self._current(db, intent)
            return TableEditResolution(True, receipt, current, True, False)
