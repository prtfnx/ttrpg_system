"""Compose editor-only sprite and paint edits in one durable transaction.

The protocol caller holds its session mutation lock, passes an isolated live
table snapshot, and publishes the returned scene/events only after success.
Combat actions remain in CombatCommandService, never in editor history.
"""

from __future__ import annotations

import copy
import hashlib
import json
import math
import uuid
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Any, Callable

from core_table.paint import PaintValidationError, validate_paint_object_input, validate_paint_payload_size
from core_table.session_rules import SessionRules
from core_table.table import Entity, VirtualTable
from database import crud, models
from service.canvas_journal import MAX_HISTORY_BYTES, MAX_HISTORY_ENTRIES, RETENTION, trim_history
from service.movement_validator import MovementValidator
from service.paint_object_service import PaintObjectService, _object_dict, _Rejected
from sqlalchemy.orm import Session
from utils.roles import can_interact, get_sprite_limit, get_visible_layers, is_dm
from utils.time import utc_now

MAX_MEMBERS = 100
MAX_COMMAND_BYTES = 60 * 1024
MAX_ENTRY_BYTES = 1024 * 1024
RETRY_WINDOW = timedelta(hours=24)


class CanvasRejected(ValueError):
    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code


def encoded(value: Any) -> bytes:
    try:
        return json.dumps(value, sort_keys=True, separators=(",", ":"), allow_nan=False).encode("utf-8")
    except (ValueError, TypeError, UnicodeError) as exc:
        raise CanvasRejected("invalid_payload", "Canvas commands require finite JSON values") from exc


def sprite_transform(entity: Entity) -> dict:
    return {
        "x": entity.position[0],
        "y": entity.position[1],
        "width": entity.width or 50,
        "height": entity.height or 50,
        "scale_x": entity.scale_x,
        "scale_y": entity.scale_y,
        "rotation": entity.rotation,
    }


def editable_paint(value: dict) -> dict:
    return copy.deepcopy({key: value[key] for key in ("id", "kind", "geometry", "transform", "style")})


def _number(value: Any, *, minimum=-1_000_000, maximum=1_000_000) -> float:
    if (
        isinstance(value, bool)
        or not isinstance(value, (int, float))
        or not math.isfinite(value)
        or not minimum <= value <= maximum
    ):
        raise CanvasRejected("invalid_payload", "Invalid or out-of-range canvas transform")
    return float(value)


def _uuid(value: Any) -> str:
    try:
        if not isinstance(value, str) or str(uuid.UUID(value)) != value:
            raise ValueError
    except (ValueError, AttributeError) as exc:
        raise CanvasRejected("invalid_payload", "Expected a canonical UUID") from exc
    return value


def _mapping(transform: dict):
    if not isinstance(transform, dict) or set(transform) != {"dx", "dy", "scale", "rotation", "pivot_x", "pivot_y"}:
        raise CanvasRejected("invalid_payload", "A complete group transform is required")
    values = {key: _number(value) for key, value in transform.items()}
    scale = _number(transform["scale"], minimum=0.001, maximum=1000)
    angle = _number(transform["rotation"], minimum=-math.pi, maximum=math.pi)
    cosine, sine = math.cos(angle), math.sin(angle)

    def point(x, y):
        x, y = (x - values["pivot_x"]) * scale, (y - values["pivot_y"]) * scale
        return (
            values["pivot_x"] + cosine * x - sine * y + values["dx"],
            values["pivot_y"] + sine * x + cosine * y + values["dy"],
        )

    return point, scale, angle


@dataclass(frozen=True)
class CanvasResult:
    receipt: dict
    events: list[dict]
    table: VirtualTable | None = None
    replayed: bool = False


class CanvasCommandService:
    def __init__(self, session_factory: Callable[[], Session], *, writes_enabled=None, now=utc_now):
        self.factory = session_factory
        self.paint = PaintObjectService(session_factory, writes_enabled=writes_enabled)
        self.now = now

    @staticmethod
    def _entries(db, table_id, actor_id):
        return db.query(models.CanvasCommandJournal).filter_by(table_id=table_id, actor_id=actor_id)

    def history(self, *, session_id, actor_id, table_id) -> dict:
        try:
            with self.factory() as db, db.begin():
                self.paint._lock_table_and_role(db, table_id=table_id, session_id=session_id, actor_id=actor_id)
                return self._history(db, table_id, actor_id)
        except _Rejected as exc:
            raise CanvasRejected(exc.error.code, exc.error.message) from exc

    def _history(self, db, table_id, actor_id):
        entries = (
            self._entries(db, table_id, actor_id)
            .filter(
                models.CanvasCommandJournal.kind.in_(["paint", "transform", "delete", "cut", "paste"]),
                models.CanvasCommandJournal.changes.isnot(None),
                models.CanvasCommandJournal.created_at >= self.now() - RETENTION,
            )
            .all()
        )
        return {
            "table_id": table_id,
            "can_undo": any(entry.state == "applied" for entry in entries),
            "can_redo": any(entry.state == "undone" for entry in entries),
        }

    def execute(self, **context) -> CanvasResult:
        try:
            return self._execute(**context)
        except _Rejected as exc:
            raise CanvasRejected(exc.error.code, exc.error.message) from exc
        except PaintValidationError as exc:
            raise CanvasRejected("invalid_payload", str(exc)) from exc

    def _execute(
        self,
        *,
        session_id: int,
        actor_id: int,
        command: dict,
        table_snapshot: dict,
        combat_sprite_ids: tuple[str, ...] = (),
    ) -> CanvasResult:
        if not isinstance(command, dict) or len(encoded(command)) > MAX_COMMAND_BYTES:
            raise CanvasRejected("limit_exceeded", "Canvas command exceeds 60 KiB")
        if set(command) - {
            "operation_id",
            "table_id",
            "issued_at",
            "mode",
            "members",
            "transform",
            "clipboard_id",
            "ids",
        }:
            raise CanvasRejected("invalid_payload", "Unknown canvas command fields")
        operation_id, table_id = _uuid(command.get("operation_id")), _uuid(command.get("table_id"))
        mode = command.get("mode")
        if mode not in {"transform", "delete", "copy", "cut", "paste", "undo", "redo"}:
            raise CanvasRejected("invalid_payload", "Unsupported canvas command")
        issued_at = _number(command.get("issued_at"), minimum=0, maximum=9_007_199_254_740_991)
        age = self.now().replace(tzinfo=UTC).timestamp() * 1000 - issued_at
        if age > RETRY_WINDOW.total_seconds() * 1000 or age < -60_000:
            raise CanvasRejected("retry_window_expired", "Canvas command expired; reload before issuing another edit")
        allowed = {"operation_id", "table_id", "issued_at", "mode"} | {
            "transform": {"members", "transform"},
            "delete": {"members"},
            "copy": {"members"},
            "cut": {"members"},
            "paste": {"clipboard_id", "ids", "transform"},
            "undo": set(),
            "redo": set(),
        }[mode]
        if set(command) != allowed:
            raise CanvasRejected("invalid_payload", "Incomplete or inconsistent canvas command")
        request_hash = hashlib.sha256(encoded(command)).hexdigest()
        with self.factory() as db, db.begin():
            db_table, role = self.paint._lock_table_and_role(
                db, table_id=table_id, session_id=session_id, actor_id=actor_id
            )
            if not can_interact(role):
                raise CanvasRejected("forbidden", "Spectators cannot issue editor commands")
            previous = self._entries(db, table_id, actor_id).filter_by(operation_id=operation_id).one_or_none()
            if previous is not None:
                if previous.request_hash != request_hash:
                    raise CanvasRejected(
                        "invalid_payload", "operation_id was already used for a different canvas command"
                    )
                result = copy.deepcopy(previous.result_json)
                result["receipt"].update(self._history(db, table_id, actor_id))
                # Sprite events are not versioned. Replaying an old event could
                # overwrite a newer accepted sprite. Reconcile from fresh
                # snapshots instead; a retry never rebroadcasts old mutations.
                result["receipt"]["resync_required"] = True
                return CanvasResult(result["receipt"], [], replayed=True)
            if table_snapshot.get("table_id") != table_id:
                raise CanvasRejected("not_found", "Table is not loaded")
            table = VirtualTable(db_table.name, db_table.width, db_table.height, table_id=table_id)
            table.from_dict(copy.deepcopy(table_snapshot))
            # Paint locks follow the same virtual-table -> paint-state order as
            # standalone writes. No scene changes are published by this worker.
            changes, events = [], []
            root = None
            if mode in {"undo", "redo"}:
                root, changes = self._inverse(db, table, table_id, actor_id, mode)
            elif mode == "paste":
                changes = self._paste(db, table, table_id, actor_id, command)
            else:
                members = command.get("members")
                if not isinstance(members, list) or not 1 <= len(members) <= MAX_MEMBERS:
                    raise CanvasRejected("limit_exceeded", "Select between 1 and 100 canvas objects")
                seen = set()
                for member in members:
                    if not isinstance(member, dict) or member.get("kind") not in {"paint", "sprite"}:
                        raise CanvasRejected("invalid_payload", "Invalid canvas selection reference")
                    kind, target = member["kind"], member.get("id")
                    if not isinstance(target, str) or not target or len(target) > 128 or (kind, target) in seen:
                        raise CanvasRejected("invalid_payload", "Invalid or duplicate canvas selection reference")
                    seen.add((kind, target))
                    before = self._current(db, table, kind, target)
                    if before is None:
                        raise CanvasRejected("conflict", "A selected object was removed")
                    if kind == "paint":
                        if (
                            set(member) != {"kind", "id", "version"}
                            or isinstance(member["version"], bool)
                            or member["version"] != before["version"]
                        ):
                            raise CanvasRejected("conflict", "A selected paint object changed")
                    else:
                        expected = member.get("expected")
                        actual = sprite_transform(Entity.from_dict(before))
                        if (
                            set(member) != {"kind", "id", "expected"}
                            or not isinstance(expected, dict)
                            or set(expected) != set(actual)
                        ):
                            raise CanvasRejected("invalid_payload", "A complete expected sprite transform is required")
                        for value in expected.values():
                            _number(value)
                        if expected != actual:
                            raise CanvasRejected("conflict", "A selected sprite changed")
                    after = copy.deepcopy(before) if mode in {"copy", "transform"} else None
                    if mode == "transform":
                        after = self._transformed(before, kind, command["transform"])
                    changes.append({"kind": kind, "id": target, "before": before, "after": after})
            if len(encoded(changes)) > MAX_ENTRY_BYTES:
                raise CanvasRejected("limit_exceeded", "Selection exceeds the 1 MiB editor history budget")
            session = db.get(models.GameSession, session_id)
            rules_data = json.loads(session.session_rules_json or "{}")
            rules_data.setdefault("session_id", session.session_code)
            rules = SessionRules.from_dict(rules_data) if rules_data else SessionRules.defaults(session.session_code)
            # Durable combat state also fences editor commands after restart,
            # before the combat engine has hydrated its in-memory cache. Read
            # it inside this transaction and fail closed on malformed storage.
            combat_ids = set(combat_sprite_ids)
            if mode != "copy":
                encounters = db.query(models.CombatEncounter).filter(
                    models.CombatEncounter.session_id == session_id,
                    models.CombatEncounter.table_id == table_id,
                    models.CombatEncounter.phase != "inactive",
                    models.CombatEncounter.ended_at.is_(None),
                ).all()
                for encounter in encounters:
                    combat_ids.update(str(member["entity_id"]) for member in json.loads(encounter.combatants_json or "[]"))
            self._authorize(changes, role, actor_id, mode, combat_ids)
            if mode != "copy":
                events = self._apply(db, table, changes, role, actor_id, session_id, operation_id, rules)
                if any(change["kind"] == "sprite" for change in changes):
                    if crud._stage_table_snapshot(db, table, session_id) is None:
                        raise CanvasRejected("persistence_failed", "Canvas table could not be staged")
                if not is_dm(role):
                    self._require_sprite_quota(db, table, session_id, actor_id, role)
                for change in changes:
                    change["after"] = self._current(db, table, change["kind"], change["id"])
                if root is not None:
                    # Compare against fresh versions on the next replay, not
                    # old paint versions that existed before this inverse.
                    updated = copy.deepcopy(root.changes)
                    for saved, change in zip(updated, changes, strict=True):
                        saved["before" if mode == "undo" else "after"] = change["after"]
                    root.changes = updated
                    root.state = "undone" if mode == "undo" else "applied"
                    root.changes_bytes = len(encoded(updated))
                else:
                    self._entries(db, table_id, actor_id).filter_by(state="undone").update(
                        {"state": "abandoned"}, synchronize_session=False
                    )
            receipt = {
                "operation_id": operation_id,
                "table_id": table_id,
                "success": True,
                "selection": [
                    {"kind": change["kind"], "id": change["id"]} for change in changes if change["after"] is not None
                ],
            }
            if mode in {"copy", "cut"}:
                receipt["clipboard_id"] = operation_id
            reversible = mode in {"transform", "delete", "cut", "paste"}
            row = models.CanvasCommandJournal(
                table_id=table_id,
                actor_id=actor_id,
                operation_id=operation_id,
                kind=mode,
                state="applied" if reversible else "receipt",
                request_hash=request_hash,
                changes=changes if reversible or mode == "copy" else None,
                changes_bytes=len(encoded(changes)) if reversible or mode == "copy" else 0,
                result_json={},
                created_at=self.now(),
            )
            db.add(row)
            db.flush()
            self._trim(db, table_id, actor_id)
            receipt.update(self._history(db, table_id, actor_id))
            # Large object payloads belong in the bounded delta, not a second
            # unbounded copy on every retained retry receipt.
            row.result_json = {"receipt": receipt}
        return CanvasResult(receipt, events, table if mode != "copy" else None)

    @staticmethod
    def _current(db, table, kind, target):
        if kind == "paint":
            value = db.get(models.PaintObject, target)
            return _object_dict(value) if value is not None and value.table_id == str(table.table_id) else None
        entity = table.find_entity_by_sprite_id(target)
        return copy.deepcopy(entity.to_dict()) if entity else None

    def _inverse(self, db, table, table_id, actor_id, mode):
        query = self._entries(db, table_id, actor_id).filter(
            models.CanvasCommandJournal.state == ("applied" if mode == "undo" else "undone"),
            models.CanvasCommandJournal.changes.isnot(None),
            models.CanvasCommandJournal.created_at >= self.now() - RETENTION,
        )
        order = models.CanvasCommandJournal.id.desc() if mode == "undo" else models.CanvasCommandJournal.id.asc()
        root = query.order_by(order).first()
        if root is None:
            raise CanvasRejected("history_empty", "No accepted editor action is available")
        changes = []
        for saved in root.changes:
            current = self._current(db, table, saved["kind"], saved["id"])
            expected = saved["after" if mode == "undo" else "before"]

            def content(value):
                if value is not None and saved["kind"] == "paint":
                    return {key: item for key, item in value.items() if key not in {"version", "updated_at"}}
                return value

            if encoded(content(current)) != encoded(content(expected)):
                raise CanvasRejected(
                    "history_conflict", "An affected object changed; history cannot overwrite another edit"
                )
            after = copy.deepcopy(saved["before" if mode == "undo" else "after"])
            if current is None and after is not None:
                after["_restoring"] = True
            changes.append({"kind": saved["kind"], "id": saved["id"], "before": current, "after": after})
        return root, changes

    def _paste(self, db, table, table_id, actor_id, command):
        clipboard_id = _uuid(command.get("clipboard_id"))
        clipboard = self._entries(db, table_id, actor_id).filter_by(operation_id=clipboard_id).one_or_none()
        if (
            clipboard is None
            or clipboard.kind not in {"copy", "cut"}
            or not clipboard.changes
            or clipboard.created_at < self.now() - RETRY_WINDOW
        ):
            raise CanvasRejected("clipboard_expired", "Clipboard is unavailable; copy the selection again")
        ids = command.get("ids")
        if not isinstance(ids, list) or len(ids) != len(clipboard.changes):
            raise CanvasRejected("invalid_payload", "Paste IDs must match every copied object")
        changes, seen = [], set()
        for saved, reference in zip(clipboard.changes, ids, strict=True):
            if (
                not isinstance(reference, dict)
                or set(reference) != {"kind", "source_id", "id"}
                or reference["kind"] != saved["kind"]
                or reference["source_id"] != saved["id"]
            ):
                raise CanvasRejected("invalid_payload", "Paste references do not match the clipboard")
            target = _uuid(reference["id"])
            if target in seen or self._current(db, table, saved["kind"], target) is not None:
                raise CanvasRejected("conflict", "Paste ID already exists")
            seen.add(target)
            after = self._transformed(saved["before"], saved["kind"], command["transform"])
            if saved["kind"] == "paint":
                after["id"] = target
            else:
                after["sprite_id"] = target
                after["entity_id"] = table.next_entity_id + len(changes)
            changes.append({"kind": saved["kind"], "id": target, "before": None, "after": after})
        return changes

    @staticmethod
    def _transformed(before, kind, transform):
        point, scale, angle = _mapping(transform)
        after = copy.deepcopy(before)
        if kind == "paint":
            old = after["transform"]
            x, y = point(old["x"], old["y"])
            old.update(
                x=x,
                y=y,
                scale_x=old["scale_x"] * scale,
                scale_y=old["scale_y"] * scale,
                rotation=(old.get("rotation", 0) + angle + math.pi) % (2 * math.pi) - math.pi,
            )
            validate_paint_object_input(editable_paint(after))
        else:
            width, height = after["width"] or 50, after["height"] or 50
            sx, sy = after["scale_x"] * scale, after["scale_y"] * scale
            center = point(
                after["position"][0] + width * after["scale_x"] / 2,
                after["position"][1] + height * after["scale_y"] / 2,
            )
            after["position"] = [round(center[0] - width * sx / 2), round(center[1] - height * sy / 2)]
            after.update(scale_x=sx, scale_y=sy, rotation=(after["rotation"] + math.degrees(angle) + 180) % 360 - 180)
            _number(sx, minimum=0.001, maximum=1000)
            _number(sy, minimum=0.001, maximum=1000)
            geometry = after.get("obstacle_data")
            if isinstance(geometry, dict):
                if isinstance(geometry.get("vertices"), list):
                    geometry["vertices"] = [list(point(*vertex)) for vertex in geometry["vertices"]]
                if all(key in geometry for key in ("x1", "y1", "x2", "y2")):
                    geometry["x1"], geometry["y1"] = point(geometry["x1"], geometry["y1"])
                    geometry["x2"], geometry["y2"] = point(geometry["x2"], geometry["y2"])
            if after.get("texture_path") == "__LIGHT__" and (scale != 1 or angle != 0):
                raise CanvasRejected(
                    "unsupported", "Use light settings to resize lights; group light rotation is unsupported"
                )
        return after

    @staticmethod
    def _authorize(changes, role, actor_id, mode, combat_sprite_ids):
        for change in changes:
            before, after = change["before"], change["after"]
            source = before or after
            if change["kind"] == "paint":
                if (
                    (before is not None or source.get("_restoring"))
                    and source["created_by"] != actor_id
                    and not is_dm(role)
                ):
                    raise CanvasRejected("forbidden", "Only the paint creator or a DM may edit or copy this object")
            else:
                if source["layer"] not in get_visible_layers(role):
                    raise CanvasRejected("forbidden", "Sprite layer is not visible to this actor")
                if (
                    (before is not None or source.get("_restoring"))
                    and not is_dm(role)
                    and actor_id not in source["controlled_by"]
                ):
                    raise CanvasRejected("forbidden", "You do not control every selected sprite")
                if after is None and not is_dm(role):
                    raise CanvasRejected("forbidden", "Sprite deletion remains DM-only, including history replay")
                if change["id"] in combat_sprite_ids and mode != "copy":
                    raise CanvasRejected(
                        "combat_required", "Combat tokens must use combat commands, not editor group operations"
                    )

    def _apply(self, db, table, changes, role, actor_id, session_id, operation_id, rules):
        events = []
        # Remove all affected sprite anchors first, then validate final anchors.
        # A selected member moving into another selected member's old anchor is
        # valid; an occupied final anchor remains a conflict.
        for change in changes:
            if change["kind"] == "sprite" and change["before"] is not None:
                table.remove_entity(change["before"]["entity_id"])
        for index, change in enumerate(changes):
            before, after, target = change["before"], change["after"], change["id"]
            if change["kind"] == "paint":
                child_id = str(uuid.uuid5(uuid.UUID(operation_id), str(index)))
                action = "create" if before is None else "delete" if after is None else "update"
                kwargs = {
                    "session_id": session_id,
                    "actor_id": actor_id,
                    "table_id": str(table.table_id),
                    "operation_id": child_id,
                }
                if before is not None:
                    kwargs.update(object_id=target, expected_version=before["version"])
                if after is not None:
                    kwargs["editable"] = editable_paint(after)
                result = self.paint.apply_in_transaction(db, action, **kwargs)
                if result.error:
                    raise CanvasRejected(result.error.code, result.error.message)
                event = result.event
                if before is None and after is not None and after.get("created_by") is not None:
                    # Restoring a deleted object preserves its provenance/order.
                    # Fresh clipboard IDs receive normal server-owned provenance.
                    if after["id"] == target and after.get("_restoring"):
                        accepted = db.get(models.PaintObject, target)
                        accepted.created_by, accepted.z_order = after["created_by"], after["z_order"]
                        # DateTime columns store naive UTC. Passing an aware
                        # value lets PostgreSQL cast through its connection
                        # timezone before stripping the offset.
                        accepted.created_at = datetime.fromisoformat(after["created_at"]).astimezone(UTC).replace(tzinfo=None)
                        accepted.version = after["version"] + 1
                        event["object"] = _object_dict(accepted)
                        validate_paint_payload_size(event["object"])
                        ledger = db.get(models.PaintOperationResult, (str(table.table_id), actor_id, child_id))
                        ledger.result_json = copy.deepcopy(event)
                events.append({"type": "paint_object_event", "data": event, "layer": None})
            else:
                if after is not None:
                    if before is None and not after.get("_restoring"):
                        after["controlled_by"] = [] if is_dm(role) else [actor_id]
                    candidate = Entity.from_dict(after)
                    occupant = table.entities.get(candidate.entity_id)
                    if occupant is not None and occupant.sprite_id != candidate.sprite_id:
                        if not after.get("_restoring"):
                            raise CanvasRejected("conflict", "Entity ID is occupied")
                        candidate.entity_id = candidate.id = table.next_entity_id
                    if not table.is_valid_position(candidate.position):
                        raise CanvasRejected("conflict", "A group member would leave the table")
                    if table.entity_index[candidate.layer].get(candidate.position):
                        raise CanvasRejected("conflict", "A group member's final anchor is occupied")
                    if before is not None and before["position"] != after["position"]:
                        validator = MovementValidator(rules)
                        # Group authoring preserves its shared geometry. Check
                        # the exact target rather than a different cell-snapped
                        # endpoint; combat tokens cannot enter this path.
                        validator.rules = copy.copy(rules)
                        validator.rules.movement_mode = "free"
                        validate = (
                            validator.validate
                            if getattr(rules, "server_validation_tier", "lightweight") == "full"
                            else validator.validate_lightweight
                        )
                        movement = validate(target, tuple(before["position"]), candidate.position, table)
                        if not movement.valid:
                            raise CanvasRejected("movement_rejected", movement.reason)
                    table.restore_entity(candidate)
                    events.append(
                        {
                            "type": "sprite_update",
                            "data": {
                                "sprite_id": target,
                                "table_id": str(table.table_id),
                                "operation": "create",
                                "sprite_data": {**candidate.to_dict(), "table_id": str(table.table_id)},
                            },
                            "layer": candidate.layer,
                        }
                    )
                else:
                    events.append(
                        {
                            "type": "sprite_remove",
                            "data": {"sprite_id": target, "table_id": str(table.table_id)},
                            "layer": before["layer"],
                        }
                    )
        db.flush()
        if any(len(encoded(event["data"])) > MAX_COMMAND_BYTES for event in events):
            raise CanvasRejected("limit_exceeded", "A canvas event would exceed the safe WebSocket frame budget")
        return events

    @staticmethod
    def _require_sprite_quota(db, table, session_id, actor_id, role):
        rows = (
            db.query(models.Entity.controlled_by)
            .join(models.VirtualTable)
            .filter(models.VirtualTable.session_id == session_id, models.VirtualTable.table_id != str(table.table_id))
            .all()
        )
        stored = sum(actor_id in json.loads(raw or "[]") for (raw,) in rows)
        live = sum(actor_id in entity.controlled_by for entity in table.entities.values())
        if live + stored > get_sprite_limit(role):
            raise CanvasRejected("limit_exceeded", "Sprite quota would be exceeded")

    def _trim(self, db, table_id, actor_id):
        trim_history(db, table_id, actor_id, self.now(), max_entries=MAX_HISTORY_ENTRIES, max_bytes=MAX_HISTORY_BYTES)
