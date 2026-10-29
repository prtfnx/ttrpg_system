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
from service.compendium_npc_persistence import stage_compendium_npc
from service.paint_object_service import _Rejected
from service.sprite_delta_persistence import stage_sprite_delta
from sqlalchemy import insert
from utils.action_diagnostics import timed_transaction
from utils.roles import can_interact, is_dm

SPRITE_COMMAND_TYPES = frozenset({MessageType.SPRITE_CREATE, MessageType.SPRITE_REMOVE,
    MessageType.SPRITE_MOVE, MessageType.SPRITE_SCALE, MessageType.SPRITE_ROTATE, MessageType.SPRITE_UPDATE,
    MessageType.COMPENDIUM_SPRITE_ADD, MessageType.COMPENDIUM_SPRITE_UPDATE, MessageType.COMPENDIUM_SPRITE_REMOVE})
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
    new_character: dict = field(default_factory=dict, compare=False)

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
            msg.type not in {MessageType.SPRITE_UPDATE, MessageType.COMPENDIUM_SPRITE_UPDATE}
            or set(msg.data) <= EDITOR_UPDATE_FIELDS, msg.timestamp)


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
        table, role = self.paint._lock_table_and_role(db, table_id=scope.table_id,
            session_id=scope.session_id, actor_id=scope.actor_id)
        if not can_interact(role):
            raise CanvasRejected("forbidden", "Spectators cannot modify sprites")
        return table, role

    def replay(self, scope):
        self._require_intent_age(scope)
        try:
            with self.factory() as db, timed_transaction(db):
                return self._replay_in_transaction(db, scope)
        except _Rejected as exc:
            raise CanvasRejected(exc.error.code, exc.error.message) from exc

    def replay_many(self, scopes):
        results = {}
        groups = {}
        with self.factory() as db, timed_transaction(db):
            for scope in scopes:
                try:
                    self._require_intent_age(scope)
                    groups.setdefault((scope.session_id, scope.table_id, scope.actor_id), []).append(scope)
                except CanvasRejected as exc:
                    results[(scope.operation_id, scope.request_hash)] = exc
            for group in groups.values():
                first = group[0]
                try:
                    self._role(db, first)
                    rows = {row.operation_id: row for row in self._entries(db, first.table_id, first.actor_id).filter(
                        models.CanvasCommandJournal.operation_id.in_([scope.operation_id for scope in group])).all()}
                except _Rejected as exc:
                    error = CanvasRejected(exc.error.code, exc.error.message)
                    for scope in group:
                        results[(scope.operation_id, scope.request_hash)] = error
                    continue
                except CanvasRejected as exc:
                    for scope in group:
                        results[(scope.operation_id, scope.request_hash)] = exc
                    continue
                for scope in group:
                    try:
                        results[(scope.operation_id, scope.request_hash)] = self._replay_row(db, scope, rows.get(scope.operation_id))
                    except CanvasRejected as exc:
                        results[(scope.operation_id, scope.request_hash)] = exc
        return results

    def _replay_in_transaction(self, db, scope):
        self._role(db, scope)
        row = self._entries(db, scope.table_id, scope.actor_id).filter_by(operation_id=scope.operation_id).one_or_none()
        return self._replay_row(db, scope, row)

    def _replay_row(self, db, scope, row):
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
            with self.factory() as db, timed_transaction(db):
                abandoned_scopes = set()
                pending_deltas = {}
                run_state = {"operations": {}, "combat": {}, "rules": {}, "journal": [],
                    "operation_ids": [command["scope"].operation_id for command in commands]}
                # Keep pending journal entries private until all authorization
                # checks pass, even when a caller enables ORM autoflush.
                with db.no_autoflush:
                    receipts = [self._persist_in_transaction(db, **command, abandoned_scopes=abandoned_scopes,
                        pending_deltas=pending_deltas, run_state=run_state) for command in commands]
                if run_state["journal"]:
                    db.execute(insert(models.CanvasCommandJournal), run_state["journal"],
                        execution_options={"render_nulls": True})
                for delta in pending_deltas.values():
                    stage_sprite_delta(db, delta["staged"], list(delta["changes"].values()), delta["session_id"], stored=delta["stored"])
                history = {(table_id, actor_id): self._trim(db, table_id, actor_id)
                    for table_id, actor_id in {(command["scope"].table_id, command["scope"].actor_id) for command in commands}}
                # All outcomes describe the same committed run. Journal rows
                # still retain a distinct ordered undo boundary per gesture.
                for command, receipt in zip(commands, receipts, strict=True):
                    scope = command["scope"]
                    receipt.update(history[(scope.table_id, scope.actor_id)])
            return receipts
        except _Rejected as exc:
            raise CanvasRejected(exc.error.code, exc.error.message) from exc

    def _persist_in_transaction(self, db, *, scope, before_snapshot, staged, combat_sprite_ids=(), abandoned_scopes=None, pending_deltas=None, run_state):
        stored, role = self._role(db, scope)
        if str(staged.table_id) != scope.table_id or before_snapshot.get("table_id") != scope.table_id:
            raise CanvasRejected("not_found", "Sprite table scope changed")
        history_scope = (scope.table_id, scope.actor_id)
        existing = run_state["operations"].get(history_scope)
        if existing is None:
            existing = {row[0] for row in db.query(models.CanvasCommandJournal.operation_id).filter_by(
                table_id=scope.table_id, actor_id=scope.actor_id).filter(
                models.CanvasCommandJournal.operation_id.in_(run_state["operation_ids"])).all()}
            run_state["operations"][history_scope] = existing
        if scope.operation_id in existing:
            raise CanvasRejected("conflict", "Sprite command was already accepted; reload before retrying")
        targets = before_snapshot.get("_sprite_targets")
        if targets is not None:
            old = {target: before_snapshot["sprites"][target] for target in targets if before_snapshot["sprites"][target] is not None}
            new = {target: entity.to_dict() for target in targets if (entity := staged.find_entity_by_sprite_id(target)) is not None}
        else:
            before = VirtualTable(before_snapshot["table_name"], staged.width, staged.height, table_id=scope.table_id)
            before.from_dict(copy.deepcopy(before_snapshot))
            old = {entity.sprite_id: entity.to_dict() for entity in before.entities.values()}
            new = {entity.sprite_id: entity.to_dict() for entity in staged.entities.values()}
        changes = [{"kind": "sprite", "id": target, "before": old.get(target), "after": new.get(target)}
            for target in sorted(old.keys() | new.keys()) if encoded(old.get(target)) != encoded(new.get(target))]
        if scope.new_character:
            stage_compendium_npc(db, scope.session_id, scope.actor_id, scope.new_character, changes)
        projections = self._prepare_character_bindings(db, changes, scope.session_id, scope.actor_id, role)
        for target, stats in projections.items():
            entity = staged.find_entity_by_sprite_id(target)
            for stat_field, value in stats.items():
                setattr(entity, stat_field, value)
        moved = [change for change in changes if change["before"] is not None and change["after"] is not None
                 and change["before"]["position"] != change["after"]["position"]]
        if moved:
            rules = run_state["rules"].get(scope.session_id)
            if rules is None:
                session = db.get(models.GameSession, scope.session_id)
                rules = SessionRules.from_dict({**json.loads(session.session_rules_json or "{}"), "session_id": session.session_code})
                run_state["rules"][scope.session_id] = rules
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
        combat_scope = (scope.session_id, scope.table_id)
        persisted_combat = run_state["combat"].get(combat_scope)
        if persisted_combat is None:
            encounters = db.query(models.CombatEncounter).filter_by(session_id=scope.session_id,
                table_id=scope.table_id, ended_at=None).filter(models.CombatEncounter.phase != "inactive").all()
            persisted_combat = {str(member["entity_id"]) for encounter in encounters
                for member in json.loads(encounter.combatants_json or "[]")}
            run_state["combat"][combat_scope] = persisted_combat
        combat_ids.update(persisted_combat)
        reversible = scope.editor and bool(changes) and not any(change["id"] in combat_ids for change in changes)
        if reversible:
            self._authorize(changes, role, scope.actor_id, "sprite", ())
        if pending_deltas is None:
            stage_sprite_delta(db, staged, changes, scope.session_id, stored=stored)
        else:
            key = (scope.session_id, scope.table_id)
            delta = pending_deltas.setdefault(key, {"session_id": scope.session_id, "stored": stored, "changes": {}})
            delta["staged"] = staged
            for change in changes:
                prior = delta["changes"].get(change["id"])
                delta["changes"][change["id"]] = {**change, "before": prior["before"] if prior else change["before"]}
        if reversible and (abandoned_scopes is None or history_scope not in abandoned_scopes):
            self._entries(db, scope.table_id, scope.actor_id).filter_by(state="undone").update(
                {"state": "abandoned"}, synchronize_session=False)
            if abandoned_scopes is not None:
                abandoned_scopes.add(history_scope)
        receipt = {"success": True, "table_id": scope.table_id}
        row = dict(table_id=scope.table_id, actor_id=scope.actor_id,
            operation_id=scope.operation_id, request_hash=scope.request_hash,
            kind="sprite" if reversible else "sprite_receipt", state="applied" if reversible else "accepted",
            changes=changes if reversible else None, changes_bytes=len(encoded(changes)) if reversible else 0,
            result_json={"receipt": dict(receipt)}, created_at=self.now())
        run_state["journal"].append(row)
        existing.add(scope.operation_id)
        return receipt
