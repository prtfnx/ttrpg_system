"""Atomic single-table domain batches over the existing ActionsCore API.

Trusted callers must authorize individual commands and serialize all session
mutations. This module does not expose a new WebSocket authority boundary.
"""
import asyncio
import copy
import hashlib
import json
import logging

from .async_actions_protocol import ActionResult
from .server import TableManager
from .table import VirtualTable

MAX_ACTIONS = 100
MAX_SNAPSHOT_BYTES = 1024 * 1024
MAX_HISTORY_BYTES = 4 * 1024 * 1024
SUPPORTED = frozenset({
    "create_sprite", "delete_sprite", "move_sprite", "scale_sprite",
    "rotate_sprite", "update_sprite", "move_sprite_to_layer",
    "update_table", "move_table", "scale_table", "set_layer_visibility",
})
logger = logging.getLogger(__name__)


def state_hash(state):
    payload = json.dumps(state, sort_keys=True, separators=(",", ":"), allow_nan=False).encode()
    if len(payload) > MAX_SNAPSHOT_BYTES:
        raise ValueError("Table snapshot exceeds the domain batch history budget")
    return hashlib.sha256(payload).hexdigest(), len(payload)


def _lock(actions):
    if not hasattr(actions, "_batch_history_lock"):
        actions._batch_history_lock = asyncio.Lock()
    return actions._batch_history_lock


def _scope(table_id, session_id, actor_id):
    return (table_id, session_id, actor_id)


def _context_error(actions, table_id, session_id, actor_id):
    if not isinstance(table_id, str) or not table_id:
        return ActionResult(False, "A canonical table ID is required")
    if any(value is not None and (
        isinstance(value, bool) or not isinstance(value, int) or value <= 0
    ) for value in (session_id, actor_id)):
        return ActionResult(False, "Session and actor IDs must be positive integers")
    if actions.table_manager.db_session and any(
        isinstance(value, bool) or not isinstance(value, int) or value <= 0
        for value in (session_id, actor_id)
    ):
        return ActionResult(False, "Persistent history requires trusted session and actor context")
    return None


async def _publish(actions, table, session_id):
    if actions.table_manager.db_session:
        if not await actions.table_manager.save_table_async(str(table.table_id), session_id, draft=table):
            return False
    # Publish only after durable success. Preserve the live table reference.
    live = actions.table_manager.get_table(str(table.table_id))
    if live is None:
        return False
    live.__dict__.clear()
    live.__dict__.update(table.__dict__)
    return True


async def _finish_before_cancellation(worker):
    try:
        return await asyncio.shield(worker)
    except asyncio.CancelledError:
        # Repeated cancellation must not cancel the commit worker or release
        # the caller's mutation lock before publication and history complete.
        while not worker.done():
            try:
                await asyncio.shield(worker)
            except asyncio.CancelledError:
                continue
        worker.result()
        raise


async def apply_batch(actions, commands, *, table_id, session_id=None, actor_id=None, expected_state=None):
    worker = asyncio.create_task(_apply_batch(actions, commands, table_id=table_id,
        session_id=session_id, actor_id=actor_id, expected_state=expected_state))
    return await _finish_before_cancellation(worker)


async def _apply_batch(actions, commands, *, table_id, session_id=None, actor_id=None, expected_state=None):
    error = _context_error(actions, table_id, session_id, actor_id)
    if error is not None:
        return error
    if not isinstance(commands, list) or not 1 <= len(commands) <= MAX_ACTIONS:
        return ActionResult(False, "Batch requires 1–100 commands")
    # Reject the complete envelope before staging any action. Identity/context
    # cannot be overridden by a child. Creating/deleting tables is not supported.
    for command in commands:
        if (not isinstance(command, dict) or command.get("type") not in SUPPORTED
                or not isinstance(command.get("params"), dict)
                or command["params"].get("table_id", table_id) != table_id
                or command["params"].get("session_id", session_id) != session_id):
            return ActionResult(False, "Unsupported command or inconsistent batch context")
        if command["type"] == "update_sprite" and any(key not in {
            "table_id", "session_id", "sprite_id", "name", "scale_x", "scale_y",
            "rotation", "width", "height", "metadata",
        } for key in command["params"]):
            return ActionResult(False, "Batch sprite updates cannot change identity, indexing or authority")
        if command["type"] == "update_table" and any(key not in {
            "table_id", "session_id", "display_name", "width", "height", "position", "scale",
            "dynamic_lighting_enabled", "fog_exploration_mode", "ambient_light_level", "grid_cell_px",
            "cell_distance", "distance_unit", "grid_enabled", "snap_to_grid", "grid_color_hex", "background_color_hex",
        } for key in command["params"]):
            return ActionResult(False, "Batch table updates cannot change identity or indexed state")
    async with _lock(actions):
        table = actions.table_manager.get_table(table_id)
        if table is None:
            return ActionResult(False, "Table not found")
        try:
            before = copy.deepcopy(table.to_dict())
            fingerprint, before_size = state_hash(before)
            if expected_state is not None and fingerprint != expected_state:
                return ActionResult(False, "Table changed before the batch", {"code": "history_conflict"})
            staged = copy.deepcopy(table)
            manager = TableManager()
            manager.tables = {**actions.table_manager.tables, table_id: staged}
            manager.tables_id = {**actions.table_manager.tables_id, table_id: staged}
            worker = type(actions)(manager)
            results = []
            for index, command in enumerate(commands):
                params = copy.deepcopy(command["params"])
                params.pop("session_id", None)
                params["table_id"] = table_id
                result = await getattr(worker, command["type"])(**params)
                results.append(result)
                if not result.success:
                    return ActionResult(False, result.message, {"failed_index": index, "atomic": True})
            after = copy.deepcopy(staged.to_dict())
            after_hash, after_size = state_hash(after)
            probe = VirtualTable(staged.display_name, staged.width, staged.height)
            probe.table_id = staged.table_id
            probe.from_dict(copy.deepcopy(after))
            if state_hash(probe.to_dict())[0] != after_hash:
                return ActionResult(False, "Batch produced invalid or non-reconstructible table state")
            if not await _publish(actions, staged, session_id):
                return ActionResult(False, "Batch persistence failed; live state unchanged", {"atomic": True})
            await actions._add_to_history({
                "type": "batch", "table_id": table_id,
                "history_scope": _scope(table_id, session_id, actor_id),
                "before": before, "after": after,
                "history_bytes": before_size + after_size,
            })
            return ActionResult(True, "Atomic table batch applied", {
                "results": results, "atomic": True, "state_hash": after_hash,
            })
        except (TypeError, ValueError, KeyError) as exc:
            return ActionResult(False, str(exc), {"atomic": True})
        except Exception:
            logger.exception("Atomic table batch failed")
            return ActionResult(False, "Atomic batch could not be persisted", {"atomic": True})


async def apply_history(actions, *, undo, table_id, session_id=None, actor_id=None):
    worker = asyncio.create_task(_apply_history(actions, undo=undo, table_id=table_id,
        session_id=session_id, actor_id=actor_id))
    return await _finish_before_cancellation(worker)


async def _apply_history(actions, *, undo, table_id, session_id=None, actor_id=None):
    error = _context_error(actions, table_id, session_id, actor_id)
    if error is not None:
        return error
    async with _lock(actions):
        source = actions.undo_stack if undo else actions.redo_stack
        destination = actions.redo_stack if undo else actions.undo_stack
        scope = _scope(table_id, session_id, actor_id)
        entry = next((item for item in reversed(source) if item.get("history_scope") == scope), None)
        if entry is None:
            return ActionResult(False, "No accepted atomic batch to undo" if undo else "No accepted atomic batch to redo")
        table = actions.table_manager.get_table(table_id)
        if table is None:
            return ActionResult(False, "Table not found")
        expected = entry["after" if undo else "before"]
        replacement = entry["before" if undo else "after"]
        try:
            if state_hash(table.to_dict())[0] != state_hash(expected)[0]:
                return ActionResult(False, "Table changed; history cannot overwrite later edits", {"code": "history_conflict"})
            staged = VirtualTable(table.display_name, table.width, table.height)
            staged.table_id = table.table_id
            staged.from_dict(copy.deepcopy(replacement))
            # Rehydration must be lossless, not silently normalize invalid data.
            if state_hash(staged.to_dict())[0] != state_hash(replacement)[0]:
                return ActionResult(False, "History state could not be reconstructed")
            if not await _publish(actions, staged, session_id):
                return ActionResult(False, "History persistence failed; live state unchanged")
            source.remove(entry)
            destination.append(entry)
            return ActionResult(True, "Atomic batch undone" if undo else "Atomic batch redone", {
                "atomic": True, "state_hash": state_hash(replacement)[0],
            })
        except (TypeError, ValueError, KeyError) as exc:
            return ActionResult(False, str(exc))
        except Exception:
            logger.exception("Atomic table history failed")
            return ActionResult(False, "Atomic history could not be persisted")
