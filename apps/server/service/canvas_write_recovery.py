"""Fresh settlement of one admitted canvas command, including undo/redo."""
import copy
from dataclasses import dataclass, field
from typing import Callable

from core_table.table import Entity
from database import models
from service.canvas_command_service import CanvasCommandService, CanvasRejected
from service.session_operation_receipts import OperationIdentity, lock_operation_session
from service.sprite_write_recovery import load_current_sprites
from sqlalchemy.orm import Session
from utils.roles import can_interact, get_visible_layers


class CanvasWriteUnknown(RuntimeError):
    """The original outcome/current projection cannot yet be proved."""


@dataclass(frozen=True)
class CanvasWriteIntent:
    session_id: int
    actor_id: int
    operation_id: str
    table_id: str
    request_hash: str
    command: dict

    @classmethod
    def create(cls, session_id, actor_id, command, service):
        if any(isinstance(value, bool) or not isinstance(value, int) or value <= 0 for value in (session_id, actor_id)):
            raise CanvasRejected('forbidden', 'Authenticated session identity is required')
        operation_id, table_id, _mode, _edit, request_hash = service.prepare(command)
        return cls(session_id, actor_id, operation_id, table_id, request_hash, copy.deepcopy(command))


@dataclass
class PendingCanvasWrite:
    intent: CanvasWriteIntent
    message_id: str | None
    factory: Callable[[], Session] = field(repr=False)
    targets: tuple[str, ...] | None = None
    accepted: bool = False
    replayed: bool = False


@dataclass(frozen=True)
class CanvasWriteResolution:
    committed: bool
    authorized: bool
    receipt: dict | None
    sprites: dict[str, dict[str, Entity | None]]


def resolve_canvas_write(attempt: PendingCanvasWrite) -> CanvasWriteResolution:
    intent = attempt.intent
    service = CanvasCommandService(attempt.factory)
    with attempt.factory() as db:
        game = lock_operation_session(db, OperationIdentity(intent.session_id, intent.actor_id,
            'canvas_editor', intent.operation_id, intent.request_hash), require_dm=False)
        table = db.query(models.VirtualTable).filter_by(table_id=intent.table_id,
            session_id=intent.session_id).with_for_update().one_or_none()
        if table is None:
            raise CanvasWriteUnknown('Original canvas table disappeared')
        row = service._entries(db, intent.table_id, intent.actor_id).filter_by(operation_id=intent.operation_id).one_or_none()
        receipt = None
        targets = attempt.targets
        if row is not None:
            if row.request_hash != intent.request_hash or row.kind != intent.command['mode']:
                raise CanvasWriteUnknown('Original canvas receipt identity changed')
            value = (row.result_json or {}).get('receipt')
            if (not isinstance(value, dict) or value.get('success') is not True
                    or value.get('operation_id') != intent.operation_id or value.get('table_id') != intent.table_id):
                raise CanvasWriteUnknown('Original canvas receipt is invalid')
            receipt = {**copy.deepcopy(value), **service._history(db, intent.table_id, intent.actor_id),
                'resync_required': True}
            if targets is None:
                targets = row.result_json.get('sprite_targets')
                if targets is None and isinstance(row.changes, list):
                    targets = tuple(change['id'] for change in row.changes if change['kind'] == 'sprite')
                if targets is None and attempt.replayed:
                    # A legacy receipt-only undo/redo replay did not mutate this
                    # cache. Existing data still acknowledges without new writes.
                    targets = ()
            if (not isinstance(targets, (tuple, list)) or len(targets) > 100
                    or any(not isinstance(target, str) or not 0 < len(target) <= 128 for target in targets)):
                raise CanvasWriteUnknown('Affected canvas sprite identities are unavailable')
        else:
            if attempt.accepted or db.get(models.User, intent.actor_id) is None:
                raise CanvasWriteUnknown('Accepted canvas history disappeared')
            # Expiry cannot turn an earlier unknown outcome into a rejection.
            service.prepare(intent.command)
        role = 'owner' if game.owner_id == intent.actor_id else db.query(models.GamePlayer.role).filter_by(
            session_id=intent.session_id, user_id=intent.actor_id).scalar()
        authorized = bool(game.is_active and role and can_interact(role))
        sprites = load_current_sprites(db, {intent.table_id: targets}, {intent.table_id: table}) if targets else {}
        if receipt is not None:
            selected = []
            visible = set(get_visible_layers(role)) if authorized else set()
            for reference in receipt.get('selection', []):
                kind, target = reference.get('kind'), reference.get('id')
                if kind == 'sprite':
                    current = db.query(models.Entity.layer).filter_by(table_id=table.id, sprite_id=target).scalar()
                    exists = current in visible
                elif kind == 'paint':
                    current = db.get(models.PaintObject, target)
                    exists = current is not None and current.table_id == intent.table_id
                else:
                    raise CanvasWriteUnknown('Original canvas selection is invalid')
                if exists:
                    selected.append(reference)
            receipt['selection'] = selected
        return CanvasWriteResolution(row is not None, authorized, receipt, sprites)
