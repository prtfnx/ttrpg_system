"""Accept merged layer patches and original receipts without scene snapshots."""
import json
import math
import uuid

from database import crud, models, schemas
from service.session_operation_receipts import (
    OperationIdentity,
    OperationRejected,
    find_receipt,
    lock_operation_session,
    stage_receipt,
)
from service.table_edit_service import TableEditIntent, TableEditResolution, TableEditService

LAYER_NAMES = {'map', 'tokens', 'dungeon_master', 'light', 'height', 'obstacles', 'fog_of_war'}
LAYER_FIELDS = {'visible', 'opacity', 'tint_color', 'color', 'blend_mode'}


def normalize_layer_patch(settings, *, allow_empty=False):
    if (not isinstance(settings, dict) or not settings and not allow_empty
            or set(settings) - LAYER_FIELDS or {'color', 'tint_color'} <= settings.keys()):
        raise OperationRejected('A closed nonempty layer settings patch is required')
    normalized = {}
    for key, value in settings.items():
        if key == 'visible':
            if not isinstance(value, bool):
                raise OperationRejected('Layer visibility must be boolean')
        elif key == 'blend_mode':
            if not isinstance(value, str) or value not in {'alpha', 'additive', 'modulate', 'multiply'}:
                raise OperationRejected('Unsupported layer blend mode')
        else:
            numbers = value if key in {'color', 'tint_color'} else [value]
            if not isinstance(numbers, (list, tuple)) or key in {'color', 'tint_color'} and len(numbers) not in {3, 4}:
                raise OperationRejected('Layer tint must contain RGB or legacy RGBA values')
            if any(isinstance(number, bool) or not isinstance(number, (int, float))
                   or not 0 <= number <= 1 or not math.isfinite(number) for number in numbers):
                raise OperationRejected('Layer opacity/color values must be finite numbers within 0..1')
            value = [float(number) for number in numbers[:3]] if key in {'color', 'tint_color'} else float(value)
        normalized['tint_color' if key == 'color' else key] = value
    return normalized


class LayerEditIntent(TableEditIntent):
    @classmethod
    def create(cls, session_id, actor_id, request_id, kind, data):
        if (kind != 'layer_settings_update' or not isinstance(data, dict)
                or set(data) != {'table_id', 'layer', 'settings'}
                or not isinstance(data['layer'], str) or data['layer'] not in LAYER_NAMES):
            raise OperationRejected('A scoped canonical layer and settings patch are required')
        identity = OperationIdentity.create(session_id, actor_id, 'layer_edit', request_id, {'kind': kind, 'data': data})
        try:
            table_id = str(uuid.UUID(data['table_id']))
        except (ValueError, TypeError, AttributeError) as exc:
            raise OperationRejected('table_id must be a table UUID') from exc
        return cls(identity, table_id, {'layer': data['layer'], 'settings': normalize_layer_patch(data['settings'])})


class LayerEditService(TableEditService):
    @staticmethod
    def _layers(table):
        try:
            settings = json.loads(table.layer_settings or '{}')
        except (TypeError, ValueError) as exc:
            raise OperationRejected('Stored layer settings require repair', 'conflict') from exc
        if not isinstance(settings, dict):
            raise OperationRejected('Stored layer settings require repair', 'conflict')
        return settings

    @staticmethod
    def _current(db, intent):
        table = db.query(models.VirtualTable).filter_by(table_id=intent.table_id,
            session_id=intent.identity.session_id).with_for_update().one_or_none()
        if table is None:
            retired = db.get(models.TableDeletionTombstone, intent.table_id)
            if retired is None or retired.session_id != intent.identity.session_id:
                raise OperationRejected('Table not found in this session', 'forbidden')
            return None, None
        layer = intent.patch['layer']
        current = LayerEditService._layers(table).get(layer, {})
        if not isinstance(current, dict):
            raise OperationRejected('Stored layer settings require repair', 'conflict')
        current = {key: value for key, value in current.items() if key in LAYER_FIELDS}
        # Legacy saves could retain both aliases; prefer the current spelling.
        if 'tint_color' in current:
            current.pop('color', None)
        current = normalize_layer_patch(current, allow_empty=True)
        return table, {'layer_settings': {layer: current}}

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
                raise OperationRejected('Resolve retained table persistence before editing layers', 'conflict')
            assert current is not None
            layer, patch = intent.patch['layer'], intent.patch['settings']
            layers = self._layers(table)
            # Keep unknown legacy metadata, but do not leave a stale color alias.
            merged = {**layers.get(layer, {}), **current['layer_settings'][layer], **patch}
            if 'tint_color' in merged:
                merged.pop('color', None)
            layers[layer] = merged
            crud.update_virtual_table(db, intent.table_id, schemas.VirtualTableUpdate(layer_settings=layers), commit=False)
            receipt = {'success': True, 'domain': 'layer_edit', 'operation_id': intent.identity.operation_id,
                'table_id': intent.table_id}
            stage_receipt(db, intent.identity, receipt)
            _, current = self._current(db, intent)
            return TableEditResolution(True, receipt, current, True, False)
