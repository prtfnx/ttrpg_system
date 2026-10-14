"""Bridge legacy sprite commands into the existing transactional editor journal."""
import copy
import hashlib
import json
import uuid
from contextvars import ContextVar
from dataclasses import dataclass, field

from core_table.protocol import Message, MessageType
from core_table.table import VirtualTable
from database import crud, models
from service.canvas_command_service import (
    MAX_COMMAND_BYTES,
    MAX_ENTRY_BYTES,
    RETRY_WINDOW,
    CanvasCommandService,
    CanvasRejected,
    encoded,
)
from service.paint_object_service import _Rejected
from utils.roles import can_interact

SPRITE_COMMAND_TYPES = frozenset({MessageType.SPRITE_CREATE, MessageType.SPRITE_REMOVE,
    MessageType.SPRITE_MOVE, MessageType.SPRITE_SCALE, MessageType.SPRITE_ROTATE, MessageType.SPRITE_UPDATE})
EDITOR_UPDATE_FIELDS = frozenset({"sprite_id", "table_id", "width", "height", "rotation", "scale_x",
    "scale_y", "metadata", "expected_text_revision", "name"})


@dataclass(frozen=True)
class SpriteCommandScope:
    session_id: int
    actor_id: int
    table_id: str
    operation_id: str
    request_hash: str
    editor: bool
    receipt: dict = field(default_factory=dict, compare=False)

    @classmethod
    def from_message(cls, msg, session_id, actor_id):
        if msg.type not in SPRITE_COMMAND_TYPES or not isinstance(msg.data, dict):
            return None
        table_id = msg.data.get("table_id")
        if session_id is None or actor_id is None or not isinstance(table_id, str) or not table_id:
            return None  # Normal handler validation still owns malformed requests.
        table_id = table_id.strip()
        identity = encoded([session_id, actor_id, table_id, msg.type.value, msg.message_id]).decode("utf-8")
        return cls(session_id, actor_id, table_id, str(uuid.uuid5(uuid.NAMESPACE_URL, identity)),
            hashlib.sha256(encoded({"type": msg.type.value, "data": msg.data})).hexdigest(),
            msg.type != MessageType.SPRITE_UPDATE or set(msg.data) <= EDITOR_UPDATE_FIELDS)


sprite_command_scope: ContextVar[SpriteCommandScope | None] = ContextVar("sprite_command_scope", default=None)


class SpriteEditorCommandService(CanvasCommandService):
    """Persist a validated staged domain result and its undo delta in one commit."""

    def _role(self, db, scope):
        _, role = self.paint._lock_table_and_role(db, table_id=scope.table_id,
            session_id=scope.session_id, actor_id=scope.actor_id)
        if not can_interact(role):
            raise CanvasRejected("forbidden", "Spectators cannot modify sprites")
        return role

    def replay(self, scope):
        try:
            with self.factory() as db, db.begin():
                self._role(db, scope)
                row = self._entries(db, scope.table_id, scope.actor_id).filter_by(operation_id=scope.operation_id).one_or_none()
                if row is None:
                    return None
                if row.request_hash != scope.request_hash:
                    raise CanvasRejected("invalid_payload", "Message identity was reused for a different sprite command")
                if row.created_at < self.now() - RETRY_WINDOW:
                    raise CanvasRejected("retry_window_expired", "Sprite command expired; reload before editing")
                # Legacy sprite events have no versions. Never replay an old
                # object over a newer edit; return an acknowledgement + resync.
                return {"success": True, "resync_required": True,
                    **self._history(db, scope.table_id, scope.actor_id)}
        except _Rejected as exc:
            raise CanvasRejected(exc.error.code, exc.error.message) from exc

    def persist(self, *, scope, before_snapshot, staged, combat_sprite_ids=()):
        try:
            with self.factory() as db, db.begin():
                role = self._role(db, scope)
                if str(staged.table_id) != scope.table_id or before_snapshot.get("table_id") != scope.table_id:
                    raise CanvasRejected("not_found", "Sprite table scope changed")
                if self._entries(db, scope.table_id, scope.actor_id).filter_by(operation_id=scope.operation_id).first():
                    raise CanvasRejected("conflict", "Sprite command was already accepted; reload before retrying")
                before = VirtualTable(before_snapshot["table_name"], staged.width, staged.height, table_id=scope.table_id)
                before.from_dict(copy.deepcopy(before_snapshot))
                old = {entity.sprite_id: entity.to_dict() for entity in before.entities.values()}
                new = {entity.sprite_id: entity.to_dict() for entity in staged.entities.values()}
                changes = [{"kind": "sprite", "id": target, "before": old.get(target), "after": new.get(target)}
                    for target in sorted(old.keys() | new.keys()) if encoded(old.get(target)) != encoded(new.get(target))]
                if len(changes) > 100 or len(encoded(changes)) > MAX_ENTRY_BYTES:
                    raise CanvasRejected("limit_exceeded", "Sprite command exceeds the editor history budget")
                for change in changes:
                    if change["after"] is None:
                        continue
                    publication = Message(MessageType.SPRITE_UPDATE, {"sprite_id": change["id"],
                        "table_id": scope.table_id, "operation": "create",
                        "sprite_data": {**change["after"], "table_id": scope.table_id}})
                    if len(publication.to_json().encode("utf-8")) > MAX_COMMAND_BYTES:
                        raise CanvasRejected("limit_exceeded", "Sprite publication exceeds the safe WebSocket frame budget")
                combat_ids = set(combat_sprite_ids)
                encounters = db.query(models.CombatEncounter).filter_by(session_id=scope.session_id,
                    table_id=scope.table_id, ended_at=None).filter(models.CombatEncounter.phase != "inactive").all()
                for encounter in encounters:
                    combat_ids.update(str(member["entity_id"]) for member in json.loads(encounter.combatants_json or "[]"))
                reversible = scope.editor and bool(changes) and not any(change["id"] in combat_ids for change in changes)
                if reversible:
                    self._authorize(changes, role, scope.actor_id, "sprite", ())
                if crud._stage_table_snapshot(db, staged, scope.session_id) is None:
                    raise CanvasRejected("persistence_failed", "Sprite table could not be staged")
                if reversible:
                    self._entries(db, scope.table_id, scope.actor_id).filter_by(state="undone").update(
                        {"state": "abandoned"}, synchronize_session=False)
                receipt = {"success": True, "table_id": scope.table_id}
                row = models.CanvasCommandJournal(table_id=scope.table_id, actor_id=scope.actor_id,
                    operation_id=scope.operation_id, request_hash=scope.request_hash,
                    kind="sprite" if reversible else "sprite_receipt", state="applied" if reversible else "accepted",
                    changes=changes if reversible else None, changes_bytes=len(encoded(changes)) if reversible else 0,
                    result_json={"receipt": receipt}, created_at=self.now())
                db.add(row)
                db.flush()
                self._trim(db, scope.table_id, scope.actor_id)
                receipt.update(self._history(db, scope.table_id, scope.actor_id))
                row.result_json = {"receipt": receipt}
            return receipt
        except _Rejected as exc:
            raise CanvasRejected(exc.error.code, exc.error.message) from exc
