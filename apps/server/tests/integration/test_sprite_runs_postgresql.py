"""Opt-in PostgreSQL checks for batched sprite durability, latency and history."""
import os
import time

import pytest
from core_table.protocol import Message, MessageType
from database import models
from service.sprite_editor_commands import SpriteCommandScope, SpriteEditorCommandService
from sqlalchemy import event
from tests.integration.test_canvas_history_postgresql import scene  # noqa: F401
from tests.integration.test_writer_fencing_postgresql import database as database

pytestmark = [pytest.mark.integration, pytest.mark.skipif(
    not os.getenv("TEST_POSTGRESQL_DATABASE_URL"), reason="TEST_POSTGRESQL_DATABASE_URL is not configured")]


def commands(context_scene, count=10):
    table = context_scene["load"]()
    context = context_scene["context"]
    result = []
    for angle in range(1, count + 1):
        target = table.find_entity_by_sprite_id("original")
        before = {"table_id": context["table_id"], "_sprite_targets": ["original"],
            "sprites": {"original": target.to_dict()}}
        staged = table.fork_for_sprite_edit(["original"])
        staged.find_entity_by_sprite_id("original").rotation = angle
        scope = SpriteCommandScope.from_message(Message(MessageType.SPRITE_ROTATE, {
            "table_id": context["table_id"], "sprite_id": "original", "rotation": angle}),
            context["session_id"], context["actor_id"])
        result.append(dict(scope=scope, before_snapshot=before, staged=staged))
        table = staged
    return result


def test_bulk_journal_uses_one_insert_and_retains_restart_undo_and_retry(scene):  # noqa: F811
    factory = scene["factory"]
    engine = factory.kw["bind"]
    batch = commands(scene)
    inserts = []

    def cursor(_conn, _cursor, statement, _parameters, _context, _many):
        # A controlled cursor delay exercises a real PostgreSQL transaction;
        # it does not pretend to measure deployed network RTT.
        time.sleep(0.005)
        if statement.lstrip().upper().startswith("INSERT") and "canvas_command_journal" in statement:
            inserts.append(statement)

    event.listen(engine, "before_cursor_execute", cursor)
    try:
        receipts = SpriteEditorCommandService(factory).persist_many(batch)
    finally:
        event.remove(engine, "before_cursor_execute", cursor)
    assert len(inserts) == 1 and all(receipt["can_undo"] for receipt in receipts)
    assert SpriteEditorCommandService(factory).replay(batch[-1]["scope"])["resync_required"]
    for expected in range(9, -1, -1):
        scene["execute"](scene["command"]("undo"))
        assert scene["load"]().find_entity_by_sprite_id("original").rotation == expected
    with factory() as db:
        assert db.query(models.CanvasCommandJournal).filter_by(kind="sprite").count() == 10


def test_late_postgresql_commit_failure_rolls_back_bulk_rows_and_journal(scene):  # noqa: F811
    factory = scene["factory"]
    engine = factory.kw["bind"]
    before = scene["load"]().to_dict()
    batch = commands(scene)

    def fail(_connection):
        raise RuntimeError("commit unavailable")

    event.listen(engine, "commit", fail)
    try:
        with pytest.raises(RuntimeError, match="commit unavailable"):
            SpriteEditorCommandService(factory).persist_many(batch)
    finally:
        event.remove(engine, "commit", fail)
    assert scene["load"]().to_dict() == before
    with factory() as db:
        assert db.query(models.CanvasCommandJournal).filter_by(kind="sprite").count() == 0
