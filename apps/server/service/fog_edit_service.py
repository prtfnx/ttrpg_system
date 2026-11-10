"""Replace fog rows and original-intent receipt in one owned transaction."""
import hashlib
import json
import math
import uuid

from core_table.table import Entity
from database import models
from service.session_operation_receipts import (
    OperationIdentity,
    OperationOutcomeUnknown,
    OperationRejected,
    bounded_json,
    find_receipt,
    lock_operation_session,
    stage_receipt,
)
from service.table_edit_service import TableEditIntent, TableEditResolution, TableEditService
from sqlalchemy import func, inspect


class FogEditIntent(TableEditIntent):
    @classmethod
    def create(cls, session_id, actor_id, request_id, kind, data):
        if (kind != 'table_update_request' or not isinstance(data, dict)
                or set(data) != {'category', 'type', 'data'} or data['category'] != 'table'
                or data['type'] != 'fog_update' or not isinstance(data['data'], dict)
                or set(data['data']) != {'table_id', 'hide_rectangles', 'reveal_rectangles'}):
            raise OperationRejected('A closed complete fog replacement is required')
        digest = hashlib.sha256(bounded_json({'kind': kind, 'data': data}, 60 * 1024).encode()).hexdigest()
        identity = OperationIdentity.create(session_id, actor_id, 'fog_edit', request_id,
            {'complete_payload_sha256': digest})
        try:
            table_id = str(uuid.UUID(data['data']['table_id']))
        except (ValueError, TypeError, AttributeError) as exc:
            raise OperationRejected('table_id must be a table UUID') from exc
        patch = {}
        for key in ('hide_rectangles', 'reveal_rectangles'):
            source = data['data'][key]
            if not isinstance(source, list) or len(source) > 10000:
                raise OperationRejected('Fog rectangles must be bounded arrays')
            normalized = []
            for rectangle in source:
                if (not isinstance(rectangle, (list, tuple)) or len(rectangle) != 2
                        or any(not isinstance(point, (list, tuple)) or len(point) != 2 for point in rectangle)):
                    raise OperationRejected('Fog rectangles require two coordinate pairs')
                coordinates = [coordinate for point in rectangle for coordinate in point]
                if any(isinstance(value, bool) or not isinstance(value, (int, float))
                       or not -2147483648 <= value <= 2147483647 or not math.isfinite(value) for value in coordinates):
                    raise OperationRejected('Fog coordinates must be finite and within SQL pixel-anchor limits')
                x1, y1, x2, y2 = coordinates
                if x1 == x2 or y1 == y2:
                    raise OperationRejected('Fog rectangles must have positive width and height')
                # Core-table anchors are integer pixels; preserve fractional extents.
                normalized.append((int(min(x1, x2)), int(min(y1, y2)), abs(x2 - x1), abs(y2 - y1)))
            patch[key] = tuple(normalized)
        return cls(identity, table_id, patch)


class FogEditService(TableEditService):
    @staticmethod
    def _current(db, intent):
        table = db.query(models.VirtualTable).filter_by(table_id=intent.table_id,
            session_id=intent.identity.session_id).with_for_update().one_or_none()
        if table is None:
            retired = db.get(models.TableDeletionTombstone, intent.table_id)
            if retired is None or retired.session_id != intent.identity.session_id:
                raise OperationRejected('Table not found in this session', 'forbidden')
            return None, None
        rows = db.query(models.Entity).filter_by(table_id=table.id, layer='fog_of_war').order_by(
            models.Entity.entity_id, models.Entity.id).all()
        if len({row.entity_id for row in rows}) != len(rows):
            raise OperationOutcomeUnknown('Stored fog identities collide')
        entities = []
        for row in rows:
            data = {column.key: getattr(row, column.key) for column in inspect(models.Entity).column_attrs}
            data.update(position=(row.position_x, row.position_y), metadata=row.entity_metadata,
                controlled_by=json.loads(row.controlled_by) if row.controlled_by else [],
                obstacle_data=json.loads(row.obstacle_data) if row.obstacle_data else None,
                width=float(row.width or 0), height=float(row.height or 0))
            entities.append(Entity.from_dict(data))
        return table, {'fog_entities': entities}

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
                raise OperationRejected('Resolve retained table persistence before replacing fog', 'conflict')
            last_id = db.query(func.max(models.Entity.entity_id)).filter_by(table_id=table.id).scalar() or 0
            count = sum(len(rectangles) for rectangles in intent.patch.values())
            if last_id + count > 2147483647:
                raise OperationRejected('Table entity identity space is exhausted', 'conflict')
            db.query(models.Entity).filter_by(table_id=table.id, layer='fog_of_war').delete(synchronize_session=False)
            for key, texture in (('hide_rectangles', '__FOG_HIDE__'), ('reveal_rectangles', '__FOG_REVEAL__')):
                for index, (x, y, width, height) in enumerate(intent.patch[key]):
                    last_id += 1
                    sprite_id = str(uuid.uuid5(uuid.NAMESPACE_URL,
                        f'fog:{intent.identity.session_id}:{intent.identity.actor_id}:{intent.identity.operation_id}:{key}:{index}'))
                    db.add(models.Entity(entity_id=last_id, sprite_id=sprite_id, table_id=table.id,
                        name=f'fog_{key}_{index}', position_x=x, position_y=y, layer='fog_of_war',
                        texture_path=texture, scale_x=width, scale_y=height))
            db.flush()
            receipt = {'success': True, 'domain': 'fog_edit', 'operation_id': intent.identity.operation_id,
                'table_id': intent.table_id}
            stage_receipt(db, intent.identity, receipt)
            _, current = self._current(db, intent)
            return TableEditResolution(True, receipt, current, True, False)
