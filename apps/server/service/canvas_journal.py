"""Shared transaction-local history retention for accepted editor writes."""
import copy
import json
from datetime import timedelta

from database import models

MAX_HISTORY_BYTES = 4 * 1024 * 1024
MAX_HISTORY_ENTRIES = 100
RETENTION = timedelta(hours=48)


def trim_history(db, table_id, actor_id, now, *, max_entries=MAX_HISTORY_ENTRIES, max_bytes=MAX_HISTORY_BYTES):
    entries = db.query(
        models.CanvasCommandJournal.id,
        models.CanvasCommandJournal.changes_bytes,
        models.CanvasCommandJournal.created_at,
        models.CanvasCommandJournal.kind,
        models.CanvasCommandJournal.state,
    ).filter_by(table_id=table_id, actor_id=actor_id).filter(
        models.CanvasCommandJournal.changes.isnot(None)).order_by(models.CanvasCommandJournal.id.desc()).all()
    size = 0
    expired = []
    states = set()
    for index, entry in enumerate(entries):
        size += entry.changes_bytes
        if index >= max_entries or size > max_bytes or entry.created_at < now - RETENTION:
            expired.append(entry.id)
        elif entry.kind in {"paint", "sprite", "transform", "sprite_edit", "restyle", "delete", "cut", "paste"}:
            states.add(entry.state)
    if expired:
        db.query(models.CanvasCommandJournal).filter(models.CanvasCommandJournal.id.in_(expired)).update(
            {"changes": None, "changes_bytes": 0, "state": "expired"}, synchronize_session="fetch")
    db.flush()
    return {"table_id": table_id, "can_undo": "applied" in states, "can_redo": "undone" in states}


def record_paint_command(db, *, table_id, actor_id, operation_id, request_hash, before, after, now):
    """Join a standalone paint write's existing transaction, never commit it."""
    changes = [{"kind": "paint", "id": (before or after)["id"],
                "before": copy.deepcopy(before), "after": copy.deepcopy(after)}]
    # Abandonment only examines existing history. Do not flush pending paint
    # and retry rows before their matching journal entry has been staged.
    with db.no_autoflush:
        db.query(models.CanvasCommandJournal).filter_by(table_id=table_id, actor_id=actor_id, state="undone").update(
            {"state": "abandoned"}, synchronize_session=False)
    db.add(models.CanvasCommandJournal(table_id=table_id, actor_id=actor_id,
        operation_id=operation_id, request_hash=request_hash, kind="paint", state="applied",
        changes=changes, changes_bytes=len(json.dumps(changes, sort_keys=True, separators=(",", ":"), allow_nan=False).encode("utf-8")),
        result_json={"receipt": {"operation_id": operation_id, "table_id": table_id, "success": True,
            "selection": [{"kind": "paint", "id": after["id"]}] if after else [], "can_undo": True, "can_redo": False}},
        created_at=now))
    db.flush()
    trim_history(db, table_id, actor_id, now)
