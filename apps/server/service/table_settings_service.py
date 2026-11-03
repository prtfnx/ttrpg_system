"""Atomic, session-scoped settings patches with durable original-intent outcomes."""

import math
import re
import uuid
from collections.abc import Callable
from contextlib import AbstractContextManager
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
from sqlalchemy.orm import Session

_NULLABLE_DEFAULTS = {'fog_exploration_mode': 'current_only', 'distance_unit': 'ft',
                      'grid_color_hex': '#ffffff', 'background_color_hex': '#2a3441'}


@dataclass(frozen=True)
class TableSettingsIntent:
    identity: OperationIdentity
    table_id: str
    patch: dict

    @classmethod
    def create(cls, session_id, actor_id, request_id, data):
        if not isinstance(data, dict) or not 2 <= len(data) <= 11 or set(data) - {'table_id', *models.TABLE_SETTINGS_FIELDS}:
            raise OperationRejected('Settings require a table_id and a closed nonempty settings patch')
        try:
            table_id = str(uuid.UUID(data.get('table_id')))
        except (ValueError, TypeError, AttributeError) as exc:
            raise OperationRejected('table_id must be a table UUID') from exc
        patch = {key: value for key, value in data.items() if key != 'table_id'}
        for key, value in patch.items():
            valid = False
            if key in ('dynamic_lighting_enabled', 'grid_enabled', 'snap_to_grid'):
                valid = isinstance(value, bool)
            elif key in ('ambient_light_level', 'grid_cell_px', 'cell_distance'):
                try:
                    valid = not isinstance(value, bool) and isinstance(value, (int, float)) and math.isfinite(value)
                    valid = valid and (0 <= value <= 1 if key == 'ambient_light_level' else
                                       10 <= value <= 500 if key == 'grid_cell_px' else value > 0)
                except (OverflowError, TypeError):
                    valid = False
            elif key == 'fog_exploration_mode':
                valid = value in ('current_only', 'persist_dimmed')
            elif key == 'distance_unit':
                valid = value in ('ft', 'm')
            else:
                valid = isinstance(value, str) and re.fullmatch(r'#(?:[0-9a-fA-F]{6}|[0-9a-fA-F]{8})', value) is not None
                if valid:
                    patch[key] = value.lower()
            if not valid:
                raise OperationRejected(f'Invalid setting: {key}')
            if key in ('ambient_light_level', 'grid_cell_px', 'cell_distance'):
                patch[key] = float(value)
        identity = OperationIdentity.create(session_id, actor_id, 'table_settings', request_id,
                                             {'table_id': table_id, **patch})
        return cls(identity, table_id, patch)


@dataclass(frozen=True)
class TableSettingsAccepted:
    receipt: dict
    settings: dict | None
    replayed: bool
    actor_authorized: bool = True


class TableSettingsService:
    def __init__(self, session_factory: Callable[[], AbstractContextManager[Session]] | None = None):
        self._factory = session_factory or SessionLocal

    @staticmethod
    def _current(db, intent):
        table = db.query(models.VirtualTable).filter_by(table_id=intent.table_id,
            session_id=intent.identity.session_id).with_for_update().one_or_none()
        if table is not None:
            settings = {name: getattr(table, name) for name in models.TABLE_SETTINGS_FIELDS}
            for name, default in _NULLABLE_DEFAULTS.items():
                if settings[name] is None:
                    settings[name] = default
            return table, {**settings, 'settings_revision': table.settings_revision}
        retired = db.get(models.TableDeletionTombstone, intent.table_id)
        if retired is None or retired.session_id != intent.identity.session_id:
            raise OperationRejected('Table not found in this session', 'forbidden')
        return None, None

    def resolve(self, intent: TableSettingsIntent, *, internal_recovery=False) -> TableSettingsAccepted | None:
        with self._factory() as db:
            game = lock_operation_session(db, intent.identity, require_dm=not internal_recovery)
            receipt = find_receipt(db, intent.identity)
            if receipt is None:
                if not internal_recovery or db.get(models.User, intent.identity.actor_id) is not None:
                    return None
                # Hard actor deletion removes receipts. Repair canonical cache
                # state without claiming an outcome or disclosing an old result.
                _, settings = self._current(db, intent)
                return TableSettingsAccepted({}, settings, True, False)
            _, settings = self._current(db, intent)
            authorized = bool(game.is_active and session_actor_is_dm(db, game, intent.identity.actor_id))
            return TableSettingsAccepted(receipt, settings, True, authorized)

    def execute(self, intent: TableSettingsIntent, target_dirty=False) -> TableSettingsAccepted:
        commit_started = False
        try:
            with self._factory() as db:
                lock_operation_session(db, intent.identity)
                receipt = find_receipt(db, intent.identity)
                table, current = self._current(db, intent)
                if receipt is not None:
                    return TableSettingsAccepted(receipt, current, True)
                if table is None:
                    raise OperationRejected('Table was deleted', 'conflict')
                if target_dirty:
                    raise OperationRejected('Resolve table persistence before changing settings', 'conflict')
                assert current is not None
                changed = any(current[name] != value for name, value in intent.patch.items())
                if changed:
                    crud.update_virtual_table(db, intent.table_id, schemas.VirtualTableUpdate(**intent.patch), commit=False)
                receipt = dict(success=True, table_id=intent.table_id, operation_id=intent.identity.operation_id,
                               changed=changed, accepted_revision=table.settings_revision)
                stage_receipt(db, intent.identity, receipt)
                _, settings = self._current(db, intent)
                commit_started = True
                db.commit()
                return TableSettingsAccepted(receipt, settings, False)
        except (OperationRejected, OperationOutcomeUnknown):
            if not commit_started:
                raise
        except Exception as exc:
            if not commit_started:
                raise OperationRejected('Table settings could not be saved', 'persistence_failed') from exc
        try:
            recovered = self.resolve(intent)
        except Exception as exc:
            raise OperationOutcomeUnknown('Table settings outcome is unknown') from exc
        if recovered is not None:
            return recovered
        raise OperationRejected('Table settings did not commit. Retry the original request.', 'persistence_failed')
