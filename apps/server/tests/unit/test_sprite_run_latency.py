"""Durable sub-runs bound receipt withholding while preserving gesture history."""
import time
import uuid

from core_table.protocol import Message, MessageType
from database import models
from service.sprite_editor_commands import SpriteEditorCommandService
from sqlalchemy import event
from tests.unit.test_sprite_editor_protocol import create, rotation, send
from tests.unit.test_sprite_editor_protocol import protocol as protocol


async def test_first_subrun_is_published_before_a_later_subrun_failure(protocol, monkeypatch):
    proto, table, factory = protocol
    await send(proto, create(table))
    proto.send_to_client.reset_mock()
    original = SpriteEditorCommandService.persist_many
    calls = []

    def persist(service, commands):
        calls.append(len(commands))
        if len(calls) == 2:
            assert proto.send_to_client.await_count == 10
            with factory() as db:
                assert db.query(models.Entity).one().rotation == 10
            raise RuntimeError("second transaction unavailable")
        return original(service, commands)

    monkeypatch.setattr(SpriteEditorCommandService, "persist_many", persist)
    result = await send(proto, Message(MessageType.BATCH_REQUEST, {"messages": [
        rotation(table, angle).to_dict() for angle in range(1, 26)]}))
    assert calls == [10, 10, 5]
    assert result.data["failed_count"] == 10
    assert table.find_entity_by_sprite_id("text").rotation == 25
    with factory() as db:
        assert db.query(models.CanvasCommandJournal).count() == 16


async def test_bulk_journal_preserves_order_and_every_undo_step(protocol):
    proto, table, factory = protocol
    await send(proto, create(table))
    await send(proto, Message(MessageType.BATCH_REQUEST, {"messages": [
        rotation(table, angle).to_dict() for angle in range(1, 21)]}))
    with factory() as db:
        entries = db.query(models.CanvasCommandJournal).order_by(models.CanvasCommandJournal.id).all()
        assert [entry.changes[0]["after"]["rotation"] for entry in entries[1:]] == list(range(1, 21))
    for angle in range(19, -1, -1):
        result = await send(proto, Message(MessageType.CANVAS_COMMAND, {"table_id": str(table.table_id),
            "operation_id": str(uuid.uuid4()), "issued_at": time.time() * 1000, "mode": "undo"}))
        assert result.data["success"]
        assert proto.table_manager.get_table(str(table.table_id)).find_entity_by_sprite_id("text").rotation == angle
        with factory() as db:
            assert db.query(models.Entity).one().rotation == angle


async def test_slow_database_moves_publish_bounded_committed_progress(protocol, test_db_engine):
    from core_table.session_rules import SessionRules
    proto, table, factory = protocol
    await send(proto, create(table))
    code = proto._get_session_code()
    rules = SessionRules.defaults(code)
    rules.movement_mode = "free"
    proto._rules_cache[code] = rules, "free_roam"
    statements, receipts = [], []
    started = time.perf_counter()

    def slow(_conn, _cursor, statement, _parameters, _context, _many):
        statements.append(statement)
        time.sleep(0.02)

    proto.send_to_client.side_effect = lambda *_: receipts.append((len(statements), time.perf_counter() - started,
        table.find_entity_by_sprite_id("text").position[0]))
    event.listen(test_db_engine, "before_cursor_execute", slow)
    try:
        result = await send(proto, Message(MessageType.BATCH_REQUEST, {"messages": [
            Message(MessageType.SPRITE_MOVE, {"table_id": str(table.table_id), "sprite_id": "text",
                "from": {"x": 20, "y": 30}, "to": {"x": 20 + step * 10, "y": 30},
                "action_id": f"move-{step}"}).to_dict() for step in range(1, 51)]}))
    finally:
        event.remove(test_db_engine, "before_cursor_execute", slow)
    assert result.data["failed_count"] == 0
    assert receipts[0][2] == 120 and receipts[0][0] < len(statements)
    assert len(statements) < 150
    with factory() as db:
        assert db.query(models.Entity).one().position_x == 520
        assert db.query(models.CanvasCommandJournal).count() == 51
    print(f"SLOW_MOVES sql={len(statements)} first_receipt_ms={receipts[0][1] * 1000:.1f} "
          f"total_ms={(time.perf_counter()-started) * 1000:.1f}")
