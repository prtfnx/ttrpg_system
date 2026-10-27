"""Real transactions, row locks and restart recovery for shared canvas history."""
from __future__ import annotations

import copy
import os
import threading
import uuid
from datetime import UTC, datetime

import pytest
from core_table.table import VirtualTable
from database import crud, models
from service.canvas_command_service import CanvasCommandService, CanvasRejected, sprite_transform
from service.paint_object_service import PaintObjectService
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import NullPool
from tests.integration.test_writer_fencing_postgresql import database  # noqa: F401

pytestmark = [
    pytest.mark.integration,
    pytest.mark.skipif(
        not os.getenv("TEST_POSTGRESQL_DATABASE_URL"),
        reason="TEST_POSTGRESQL_DATABASE_URL is not configured",
    ),
]
IDENTITY = {"dx": 0, "dy": 0, "scale": 1, "rotation": 0, "pivot_x": 0, "pivot_y": 0}


@pytest.fixture
def scene(database):  # noqa: F811 - imported, shared temporary-schema fixture
    _, url, session_id, table_id = database
    # Timestamp columns use naive UTC. A non-UTC connection must not change
    # paint provenance when a serialized UTC timestamp is restored by undo.
    zoned_url = url.update_query_dict({"options": url.query["options"] + " -ctimezone=Europe/Kyiv"})
    engine = create_engine(zoned_url, poolclass=NullPool)
    factory = sessionmaker(bind=engine)
    paint_id = str(uuid.uuid4())
    with factory() as db:
        session = db.get(models.GameSession, session_id)
        assert session is not None
        actor_id = session.owner_id
        table = VirtualTable("Canvas", 1000, 1000, table_id=table_id)
        table.snap_to_grid = False
        table.add_entity({"sprite_id": "original", "x": 10, "y": 20, "width": 20, "height": 10})
        crud.save_table_to_db(db, table, session_id)
        assert db.execute(text("SHOW TIMEZONE")).scalar_one() == "Europe/Kyiv"
    context = {"session_id": session_id, "actor_id": actor_id, "table_id": table_id}
    with factory.begin() as db:
        accepted = PaintObjectService(factory, writes_enabled=True).apply_in_transaction(
            db, "create", **context, operation_id=str(uuid.uuid4()), editable={
                "id": paint_id, "kind": "rectangle",
                "geometry": {"kind": "rectangle", "width": 20, "height": 10},
                "transform": {"x": 50, "y": 60, "scale_x": 1, "scale_y": 1},
                "style": {"stroke_rgba": [1, 0, 0, 1], "width": 2, "fill_rgba": None},
            },
        )
        assert accepted.error is None

    def load():
        with factory() as db:
            loaded, ok = crud.load_table_from_db(db, table_id)
            assert ok and loaded is not None
            return loaded

    def command(mode="transform"):
        result = {"operation_id": str(uuid.uuid4()), "table_id": table_id,
                  "issued_at": datetime.now(UTC).timestamp() * 1000, "mode": mode}
        if mode in {"transform", "delete"}:
            with factory() as db:
                paint_object = db.get(models.PaintObject, paint_id)
                assert paint_object is not None
                version = paint_object.version
            entity = load().find_entity_by_sprite_id("original")
            assert entity is not None
            result["members"] = [
                {"kind": "paint", "id": paint_id, "version": version},
                {"kind": "sprite", "id": "original",
                 "expected": sprite_transform(entity)},
            ]
        if mode == "transform":
            result["transform"] = {**IDENTITY, "dx": 10, "dy": 20}
        return result

    def execute(value, snapshot=None):
        # A fresh service and database load intentionally discard all Python
        # history/live-scene caches, as after a process restart.
        return CanvasCommandService(factory, writes_enabled=True).execute(
            session_id=session_id, actor_id=actor_id, command=value,
            table_snapshot=snapshot if snapshot is not None else load().to_dict(),
        )

    try:
        yield {"factory": factory, "load": load, "command": command, "execute": execute,
               "context": context, "paint": paint_id}
    finally:
        engine.dispose()


def test_delete_restore_preserves_utc_provenance_and_earlier_history_after_restart(scene):
    with scene["factory"]() as db:
        created_at = db.get(models.PaintObject, scene["paint"]).created_at
    scene["execute"](scene["command"]())
    scene["execute"](scene["command"]("delete"))
    restored = scene["execute"](scene["command"]("undo"))
    assert restored.table.find_entity_by_sprite_id("original").position == (20, 40)
    with scene["factory"]() as db:
        paint = db.get(models.PaintObject, scene["paint"])
        assert paint.created_at == created_at
        assert paint.z_order == 1 and paint.created_by == scene["context"]["actor_id"]
    undone = scene["execute"](scene["command"]("undo"))
    assert undone.table.find_entity_by_sprite_id("original").position == (10, 20)
    assert undone.receipt["can_redo"] and not undone.receipt["can_undo"]
    scene["execute"](scene["command"]("redo"))
    scene["execute"](scene["command"]("redo"))
    with scene["factory"]() as db:
        assert db.get(models.PaintObject, scene["paint"]) is None
    assert scene["load"]().find_entity_by_sprite_id("original") is None


def test_late_sprite_failure_rolls_back_all_postgresql_canvas_writes(scene):
    table = scene["load"]()
    table.add_entity({"sprite_id": "occupied", "x": 20, "y": 40})
    with scene["factory"]() as db:
        crud.save_table_to_db(db, table, scene["context"]["session_id"])
    before = copy.deepcopy(table.to_dict())
    with pytest.raises(CanvasRejected, match="occupied"):
        scene["execute"](scene["command"]())
    assert scene["load"]().to_dict() == before
    with scene["factory"]() as db:
        assert db.get(models.PaintObject, scene["paint"]).version == 1
        assert db.get(models.PaintState, scene["context"]["table_id"]).revision == 1
        assert db.query(models.PaintOperationResult).count() == 1
        assert db.query(models.CanvasCommandJournal).count() == 0


@pytest.mark.parametrize("identical_retry", [False, True])
def test_competing_canvas_writers_serialize_without_duplicate_or_partial_edits(scene, identical_retry):
    first = scene["command"]()
    commands = [first, copy.deepcopy(first) if identical_retry else scene["command"]()]
    snapshot = scene["load"]().to_dict()
    barrier = threading.Barrier(2)
    outcomes, failures = [], []

    def write(command):
        try:
            barrier.wait(timeout=5)
            try:
                result = scene["execute"](command, snapshot)
            except CanvasRejected as exc:
                outcomes.append(exc.code)
            else:
                outcomes.append("retry" if result.replayed else "accepted")
                if result.replayed:
                    assert not result.events and result.receipt["resync_required"]
                else:
                    assert len(result.events) == 2
        except BaseException as exc:
            failures.append(exc)

    threads = [threading.Thread(target=write, args=(command,), daemon=True) for command in commands]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join(timeout=15)
    assert all(not thread.is_alive() for thread in threads)
    assert not failures
    assert sorted(outcomes) == ["accepted", "retry" if identical_retry else "conflict"]
    assert scene["load"]().find_entity_by_sprite_id("original").position == (20, 40)
    with scene["factory"]() as db:
        assert db.get(models.PaintObject, scene["paint"]).version == 2
        assert db.get(models.PaintState, scene["context"]["table_id"]).revision == 2
        assert db.query(models.PaintOperationResult).count() == 2
        assert db.query(models.CanvasCommandJournal).count() == 1
