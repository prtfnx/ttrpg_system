"""Bridge legacy sprite commands into the existing transactional editor journal."""
import copy
import hashlib
import json
import math
import uuid
from contextvars import ContextVar
from dataclasses import dataclass, field
from datetime import UTC

from core_table.protocol import Message, MessageType
from core_table.session_rules import SessionRules
from core_table.table import VirtualTable
from database import models
from service.canvas_command_service import (
    MAX_COMMAND_BYTES,
    MAX_ENTRY_BYTES,
    RETRY_WINDOW,
    CanvasCommandService,
    CanvasRejected,
    encoded,
)
from service.paint_object_service import _Rejected
from service.sprite_delta_persistence import stage_sprite_delta
from utils.roles import can_interact, is_dm

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
    issued_at_seconds: float
    receipt: dict = field(default_factory=dict, compare=False)

    @classmethod
    def from_message(cls, msg, session_id, actor_id):
        if msg.type not in SPRITE_COMMAND_TYPES or not isinstance(msg.data, dict):
            return None
        table_id = msg.data.get("table_id")
        if session_id is None or actor_id is None or not isinstance(table_id, str) or not table_id:
            return None  # Normal handler validation still owns malformed requests.
        table_id = table_id.strip()
        if not isinstance(msg.message_id, str) or not msg.message_id or len(msg.message_id) > 128:
            raise CanvasRejected("invalid_payload", "The original sprite message_id is required")
        identity = encoded([session_id, actor_id, table_id, msg.type.value, msg.message_id]).decode("utf-8")
        return cls(session_id, actor_id, table_id, str(uuid.uuid5(uuid.NAMESPACE_URL, identity)),
            hashlib.sha256(encoded({"type": msg.type.value, "data": msg.data, "timestamp": msg.timestamp})).hexdigest(),
            msg.type != MessageType.SPRITE_UPDATE or set(msg.data) <= EDITOR_UPDATE_FIELDS, msg.timestamp)


sprite_command_scope: ContextVar[SpriteCommandScope | None] = ContextVar("sprite_command_scope", default=None)


class SpriteEditorCommandService(CanvasCommandService):
    """Persist a validated staged domain result and its undo delta in one commit."""

    def _require_intent_age(self, scope):
        issued_at = scope.issued_at_seconds
        if (isinstance(issued_at, bool) or not isinstance(issued_at, (int, float))
                or not math.isfinite(issued_at) or not 0 <= issued_at <= 9_007_199_254_740.991):
            raise CanvasRejected("invalid_payload", "The original sprite timestamp is required")
        current = self.now()
        if current.tzinfo is None:
            current = current.replace(tzinfo=UTC)
        age = current.timestamp() - issued_at
        if age > RETRY_WINDOW.total_seconds() or age < -60:
            raise CanvasRejected("retry_window_expired", "Sprite intent expired; reload before editing")

    def _role(self, db, scope):
        _, role = self.paint._lock_table_and_role(db, table_id=scope.table_id,
            session_id=scope.session_id, actor_id=scope.actor_id)
        if not can_interact(role):
            raise CanvasRejected("forbidden", "Spectators cannot modify sprites")
        return role

    def replay(self, scope):
        self._require_intent_age(scope)
        try:
            with self.factory() as db, db.begin():
                return self._replay_in_transaction(db, scope)
        except _Rejected as exc:
            raise CanvasRejected(exc.error.code, exc.error.message) from exc

    def replay_many(self, scopes):
        results = {}
        with self.factory() as db, db.begin():
            for scope in scopes:
                try:
                    self._require_intent_age(scope)
                    results[(scope.operation_id, scope.request_hash)] = self._replay_in_transaction(db, scope)
                except _Rejected as exc:
                    results[(scope.operation_id, scope.request_hash)] = CanvasRejected(exc.error.code, exc.error.message)
                except CanvasRejected as exc:
                    results[(scope.operation_id, scope.request_hash)] = exc
        return results

    def _replay_in_transaction(self, db, scope):
        self._role(db, scope)
        row = self._entries(db, scope.table_id, scope.actor_id).filter_by(operation_id=scope.operation_id).one_or_none()
        if row is None:
            return None
        if row.request_hash != scope.request_hash:
            raise CanvasRejected("invalid_payload", "Message identity was reused for a different sprite command")
        if row.created_at < self.now() - RETRY_WINDOW:
            raise CanvasRejected("retry_window_expired", "Sprite command expired; reload before editing")
        return {"success": True, "resync_required": True, **self._history(db, scope.table_id, scope.actor_id)}

    def persist(self, *, scope, before_snapshot, staged, combat_sprite_ids=()):
        return self.persist_many([dict(scope=scope, before_snapshot=before_snapshot,
            staged=staged, combat_sprite_ids=combat_sprite_ids)])[0]

    def persist_many(self, commands):
        """One transaction for a bounded, ordered run of staged sprite edits."""
        for command in commands:
            self._require_intent_age(command["scope"])
        try:
            with self.factory() as db, db.begin():
                receipts = [self._persist_in_transaction(db, **command) for command in commands]
            return receipts
        except _Rejected as exc:
            raise CanvasRejected(exc.error.code, exc.error.message) from exc

    def _persist_in_transaction(self, db, *, scope, before_snapshot, staged, combat_sprite_ids=()):
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
        moved = [change for change in changes if change["before"] is not None and change["after"] is not None
                 and change["before"]["position"] != change["after"]["position"]]
        if moved:
            session = db.get(models.GameSession, scope.session_id)
            rules = SessionRules.from_dict({**json.loads(session.session_rules_json or "{}"), "session_id": session.session_code})
            if not rules.allows_out_of_bounds(is_dm=is_dm(role)) and any(
                    not staged.is_valid_position(change["after"]["position"]) for change in moved):
                raise CanvasRejected("movement_rejected", "Outside table bounds")
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
        stage_sprite_delta(db, staged, changes, scope.session_id)
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
