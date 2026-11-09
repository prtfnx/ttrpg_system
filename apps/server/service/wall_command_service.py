"""Wall effects and original-intent receipts share one owned transaction."""
import math
import uuid
from copy import deepcopy
from dataclasses import dataclass

from core_table.entities import WALL_TYPE_DEFAULTS, Wall
from database import crud, models
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
from utils.roles import can_interact

_COORDINATES = {'x1', 'y1', 'x2', 'y2'}
_FLAGS = {'blocks_movement', 'blocks_light', 'blocks_sight', 'blocks_sound', 'is_door', 'is_secret'}
_ENUMS = {'wall_type': set(WALL_TYPE_DEFAULTS), 'door_state': {'open', 'closed', 'locked'},
          'direction': {'both', 'left', 'right'}}


@dataclass(frozen=True)
class WallCommandIntent:
    identity: OperationIdentity
    table_id: str
    wall_id: str
    kind: str
    patch: dict

    @classmethod
    def create(cls, session_id, actor_id, request_id, kind, data):
        if kind not in {'wall_create', 'wall_update', 'wall_remove', 'door_toggle'}:
            raise OperationRejected('Invalid wall command')
        expected = {'table_id', 'wall_data'} if kind == 'wall_create' else {'table_id', 'wall_id'}
        if kind == 'wall_update':
            expected.add('updates')
        if not isinstance(data, dict) or set(data) != expected:
            raise OperationRejected('Wall command requires its complete original payload')
        try:
            table_id = str(uuid.UUID(data['table_id']))
        except (ValueError, TypeError, AttributeError) as exc:
            raise OperationRejected('table_id must be a table UUID') from exc
        identity = OperationIdentity.create(session_id, actor_id, 'wall_command', request_id,
                                             {'kind': kind, 'data': data})
        wall_id = (str(uuid.uuid5(uuid.NAMESPACE_URL,
            f'wall:{session_id}:{actor_id}:{request_id}')) if kind == 'wall_create' else data['wall_id'])
        if not isinstance(wall_id, str) or not wall_id.strip() or len(wall_id) > 128:
            raise OperationRejected('A valid wall identity is required')
        patch = deepcopy(data.get('wall_data' if kind == 'wall_create' else 'updates', {}))
        if not isinstance(patch, dict) or set(patch) - (_COORDINATES | _FLAGS | _ENUMS.keys()):
            raise OperationRejected('Invalid wall fields')
        if kind == 'wall_create' and not _COORDINATES <= patch.keys() or kind == 'wall_update' and not patch:
            raise OperationRejected('Wall coordinates or a nonempty update are required')
        for key, value in patch.items():
            if key in _COORDINATES:
                if (isinstance(value, bool) or not isinstance(value, (int, float))
                        or not 0 <= value <= 10000 or not math.isfinite(value)):
                    raise OperationRejected('Wall coordinates must be finite and within 0..10000')
            elif key in _FLAGS:
                if not isinstance(value, bool):
                    raise OperationRejected('Wall flags must be booleans')
            elif not isinstance(value, str) or value not in _ENUMS[key]:
                raise OperationRejected('Invalid wall property')
        return cls(identity, table_id, wall_id, kind, patch)


@dataclass(frozen=True)
class WallCommandResolution:
    committed: bool
    receipt: dict
    wall: dict | None
    table_exists: bool
    authorized: bool
    replayed: bool = True


@dataclass
class PendingWallCommand:
    intent: WallCommandIntent
    accepted: bool = False


class WallCommandService:
    def __init__(self, factory=None):
        self.factory = factory or SessionLocal

    @staticmethod
    def _authorized(db, game, intent):
        if not game.is_active:
            return False
        if session_actor_is_dm(db, game, intent.identity.actor_id):
            return True
        role = db.query(models.GamePlayer.role).filter_by(session_id=game.id,
            user_id=intent.identity.actor_id).scalar()
        return intent.kind == 'door_toggle' and can_interact(role)

    @staticmethod
    def _current(db, intent):
        table = db.query(models.VirtualTable).filter_by(table_id=intent.table_id,
            session_id=intent.identity.session_id).with_for_update().one_or_none()
        if table is None:
            retired = db.get(models.TableDeletionTombstone, intent.table_id)
            if retired is None or retired.session_id != intent.identity.session_id:
                raise OperationRejected('Table not found in this session', 'forbidden')
            return None, None
        row = db.query(models.Wall).filter_by(table_id=intent.table_id,
            wall_id=intent.wall_id).with_for_update().one_or_none()
        return table, row

    def resolve(self, attempt: PendingWallCommand) -> WallCommandResolution:
        intent = attempt.intent
        with self.factory() as db:
            game = lock_operation_session(db, intent.identity, require_dm=False)
            receipt = find_receipt(db, intent.identity)
            table, row = self._current(db, intent)
            if receipt is None and (attempt.accepted or table is None
                    or db.get(models.User, intent.identity.actor_id) is None):
                raise OperationOutcomeUnknown('Missing receipt cannot prove that the wall command rolled back')
            return WallCommandResolution(receipt is not None, receipt or {},
                row.to_dict() if row else None, table is not None, self._authorized(db, game, intent))

    def execute(self, intent: WallCommandIntent, target_dirty=False) -> WallCommandResolution:
        with self.factory() as db, db.begin():
            game = lock_operation_session(db, intent.identity, require_dm=False)
            if not self._authorized(db, game, intent):
                raise OperationRejected('Current session authority is required', 'forbidden')
            receipt = find_receipt(db, intent.identity)
            table, row = self._current(db, intent)
            if receipt is not None:
                return WallCommandResolution(True, receipt, row.to_dict() if row else None, table is not None, True)
            if table is None:
                raise OperationRejected('Table was deleted', 'conflict')
            if target_dirty:
                raise OperationRejected('Resolve retained table persistence before editing walls', 'conflict')
            for field in _COORDINATES & intent.patch.keys():
                limit = table.width if field.startswith('x') else table.height
                if intent.patch[field] > limit:
                    raise OperationRejected('Wall endpoints must be within the current table')
            if intent.kind == 'wall_create':
                if row is not None:
                    raise OperationRejected('Wall identity already exists', 'conflict')
                wall = Wall.from_dict({**intent.patch, 'wall_id': intent.wall_id,
                    'table_id': intent.table_id, 'created_by': intent.identity.actor_id})
                row = crud.create_wall(db, wall.to_dict(), commit=False)
            else:
                if row is None:
                    raise OperationRejected('Wall not found in this table', 'conflict')
                if intent.kind == 'wall_remove':
                    crud.delete_wall(db, intent.wall_id, commit=False)
                    row = None
                else:
                    patch = intent.patch
                    if intent.kind == 'door_toggle':
                        if not row.is_door:
                            raise OperationRejected('This wall is not a door')
                        if row.door_state == 'locked' and not session_actor_is_dm(db, game, intent.identity.actor_id):
                            raise OperationRejected('Only DMs can open locked doors', 'forbidden')
                        patch = {'door_state': 'closed' if row.door_state == 'open' else 'open'}
                    row = crud.update_wall(db, intent.wall_id, patch, commit=False)
            receipt = {'success': True, 'domain': 'wall_command', 'operation_id': intent.identity.operation_id,
                'table_id': intent.table_id, 'wall_id': intent.wall_id, 'command': intent.kind}
            stage_receipt(db, intent.identity, receipt)
            return WallCommandResolution(True, receipt, row.to_dict() if row else None, True, True, False)
