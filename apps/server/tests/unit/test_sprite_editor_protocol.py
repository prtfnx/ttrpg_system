"""Real protocol dispatch joins legacy sprite APIs to durable editor history."""
import asyncio
import copy
import json
import threading
import time
from collections import Counter
from unittest.mock import AsyncMock

import pytest
from core_table.protocol import Message, MessageType
from core_table.server import TableManager
from database import crud, models
from service.protocol.base import ServerProtocol
from service.sprite_editor_commands import sprite_command_scope
from sqlalchemy import event
from sqlalchemy.orm import sessionmaker


@pytest.fixture
def protocol(monkeypatch, test_db, test_db_engine, test_game_session, test_user):
    factory = sessionmaker(bind=test_db_engine)
    monkeypatch.setattr("service.protocol.base.SessionLocal", factory)
    monkeypatch.setattr("service.protocol.canvas.SessionLocal", factory)
    monkeypatch.setattr("service.canvas_persistence_service.SessionLocal", factory)
    manager = TableManager(test_db)
    table = manager.create_table("Text history", 1000, 1000)
    assert crud.save_table_to_db(test_db, table, test_game_session.id)
    proto = ServerProtocol(manager)
    monkeypatch.setattr(proto, "_get_session_id", lambda _msg: test_game_session.id)
    monkeypatch.setattr(proto, "_get_user_id", lambda _msg, _client: test_user.id)
    monkeypatch.setattr(proto, "_get_client_role", lambda _client: "owner")
    monkeypatch.setattr(proto, "_get_session_code", lambda *_args: test_game_session.session_code)
    proto.send_to_client = AsyncMock()
    proto.broadcast_filtered = AsyncMock()
    return proto, table, factory


async def send(proto, message):
    assert await proto.handle_client(message, "client")
    return proto.send_to_client.call_args.args[0]


def create(table):
    descriptor = {"version": 1, "text": "Привіт", "font_size": 24, "font_family": "sans-serif",
        "font_weight": 400, "font_style": "normal", "color": "#ffffff", "language": "uk", "direction": "auto"}
    return Message(MessageType.SPRITE_CREATE, {"table_id": str(table.table_id), "sprite_data": {
        "sprite_id": "text", "x": 20, "y": 30, "width": 120, "height": 40, "layer": "tokens",
        "metadata": {"text_sprite": descriptor}}})


async def test_normal_text_create_and_edit_enter_same_durable_history(protocol):
    proto, table, factory = protocol
    response = await send(proto, create(table))
    assert response.type == MessageType.SPRITE_RESPONSE and response.data["can_undo"]
    metadata = json.loads(table.find_entity_by_sprite_id("text").metadata)
    metadata["text_sprite"]["text"] = "Edited"
    response = await send(proto, Message(MessageType.SPRITE_UPDATE, {"table_id": str(table.table_id),
        "sprite_id": "text", "metadata": metadata, "width": 100, "height": 40, "expected_text_revision": 1}))
    assert response.type == MessageType.SUCCESS and response.data["can_undo"]
    assert response.data["table_id"] == str(table.table_id)
    with factory() as db:
        rows = db.query(models.CanvasCommandJournal).order_by(models.CanvasCommandJournal.id).all()
        assert len(rows) == 2 and all(row.kind == "sprite" for row in rows)
        assert rows[0].changes[0]["before"] is None
        assert json.loads(rows[1].changes[0]["after"]["metadata"])["text_revision"] == 2
    assert sprite_command_scope.get() is None


async def test_identical_create_retry_acknowledges_without_rebroadcast_or_stale_object(protocol):
    proto, table, factory = protocol
    message = create(table)
    retry = copy.deepcopy(message)  # Original body, before handler normalization.
    assert (await send(proto, message)).type == MessageType.SPRITE_RESPONSE
    response = await send(proto, retry)
    assert response.type == MessageType.SPRITE_RESPONSE and response.data["resync_required"]
    assert "sprite_data" not in response.data
    assert proto.broadcast_filtered.await_count == 1
    with factory() as db:
        assert db.query(models.CanvasCommandJournal).count() == 1
    retry.data["sprite_data"]["width"] = 200
    assert (await send(proto, retry)).type == MessageType.ERROR
    assert sprite_command_scope.get() is None


async def test_history_storage_failure_rejects_without_live_mutation_or_broadcast(protocol, monkeypatch):
    proto, table, factory = protocol
    before = table.to_dict()

    def fail(*_args, **_kwargs):
        raise RuntimeError("private journal failure")

    monkeypatch.setattr("service.sprite_editor_commands.SpriteEditorCommandService.persist", fail)
    response = await send(proto, create(table))
    assert response.type == MessageType.ERROR and "private" not in response.data["error"]
    assert table.to_dict() == before and not proto.actions._dirty_tables
    proto.broadcast_filtered.assert_not_awaited()
    with factory() as db:
        assert not db.query(models.Entity).count() and not db.query(models.CanvasCommandJournal).count()
    assert sprite_command_scope.get() is None


async def test_expired_sprite_intent_rejects_before_staging_or_publication(protocol):
    proto, table, factory = protocol
    message = create(table)
    message.timestamp = time.time() - 3 * 86400
    response = await send(proto, message)
    assert response.type == MessageType.ERROR and response.data["code"] == "retry_window_expired"
    assert table.find_entity_by_sprite_id("text") is None
    proto.broadcast_filtered.assert_not_awaited()
    with factory() as db:
        assert not db.query(models.Entity).count() and not db.query(models.CanvasCommandJournal).count()


async def test_repeated_cancellation_holds_session_lock_through_post_commit_broadcast(protocol):
    proto, table, _ = protocol
    started, release, published = asyncio.Event(), asyncio.Event(), asyncio.Event()

    async def broadcast(*_args):
        started.set()
        await release.wait()
        published.set()

    proto.broadcast_filtered.side_effect = broadcast
    task = asyncio.create_task(proto.handle_client(create(table), "client"))
    await asyncio.wait_for(started.wait(), 2)
    task.cancel()
    await asyncio.sleep(0)
    task.cancel()
    await asyncio.sleep(0)
    assert proto._mutation_lock.locked() and not task.done()
    assert table.find_entity_by_sprite_id("text") is not None
    release.set()
    with pytest.raises(asyncio.CancelledError):
        await task
    assert published.is_set() and not proto._mutation_lock.locked()


async def test_broadcast_failure_is_durable_success_requiring_resync(protocol):
    proto, table, factory = protocol
    proto.broadcast_filtered.side_effect = RuntimeError("transport disconnected")
    response = await send(proto, create(table))
    assert response.type == MessageType.SPRITE_RESPONSE
    assert response.data["success"] and response.data["resync_required"]
    assert table.find_entity_by_sprite_id("text") is not None
    with factory() as db:
        assert db.query(models.CanvasCommandJournal).count() == 1


def rotation(table, angle, sprite_id="text"):
    return Message(MessageType.SPRITE_ROTATE, {"table_id": str(table.table_id),
        "sprite_id": sprite_id, "rotation": angle, "action_id": f"rotate-{angle}"})


async def test_sprite_burst_commits_once_without_exposing_provisional_state(protocol, test_db_engine, monkeypatch):
    proto, table, factory = protocol
    await send(proto, create(table))
    proto.send_to_client.reset_mock()
    proto.broadcast_filtered.reset_mock()
    original = __import__("service.sprite_editor_commands", fromlist=["SpriteEditorCommandService"]).SpriteEditorCommandService.persist_many
    commits = []

    def persist(service, commands):
        assert table.find_entity_by_sprite_id("text").rotation == 0
        assert not proto.broadcast_filtered.await_count
        assert len(commands) == 2
        return original(service, commands)

    monkeypatch.setattr("service.sprite_editor_commands.SpriteEditorCommandService.persist_many", persist)
    event.listen(test_db_engine, "commit", lambda _connection: commits.append(True))
    response = await send(proto, Message(MessageType.BATCH_REQUEST, {"messages": [
        rotation(table, 30).to_dict(), rotation(table, 60).to_dict()]}))
    assert response.type == MessageType.BATCH_RESPONSE and response.data["failed_count"] == 0
    assert response.data["response_count"] == 2 and not response.data["messages"]
    assert proto.send_to_client.await_count == 3  # Two independent receipts and one transport summary.
    assert len(commits) == 2  # One read preflight and one write transaction, not two per action.
    assert table.find_entity_by_sprite_id("text").rotation == 60
    assert proto.broadcast_filtered.await_count == 2
    with factory() as db:
        assert db.query(models.CanvasCommandJournal).count() == 3
        assert db.query(models.Entity).one().rotation == 60


async def test_denied_member_does_not_discard_other_buffered_changes(protocol):
    proto, table, _ = protocol
    await send(proto, create(table))
    proto.send_to_client.reset_mock()
    response = await send(proto, Message(MessageType.BATCH_REQUEST, {"messages": [
        rotation(table, 30).to_dict(), rotation(table, 40, "missing").to_dict(), rotation(table, 60).to_dict()]}))
    assert response.data["failed_count"] == 1
    outcomes = [call.args[0].to_dict() for call in proto.send_to_client.call_args_list[:-1]]
    assert [item["type"] for item in outcomes] == ["sprite_response", "error", "sprite_response"]
    assert outcomes[1]["data"]["action_id"] == "rotate-40"
    assert table.find_entity_by_sprite_id("text").rotation == 60


async def test_failed_buffered_commit_leaves_live_and_stored_table_unchanged(protocol, monkeypatch):
    proto, table, factory = protocol
    await send(proto, create(table))
    proto.send_to_client.reset_mock()
    proto.broadcast_filtered.reset_mock()

    def fail(*_args, **_kwargs):
        raise RuntimeError("storage unavailable")

    monkeypatch.setattr("service.sprite_editor_commands.SpriteEditorCommandService.persist_many", fail)
    response = await send(proto, Message(MessageType.BATCH_REQUEST, {"messages": [
        rotation(table, 30).to_dict(), rotation(table, 60).to_dict()]}))
    assert response.data["failed_count"] == 2
    assert all(call.args[0].data["resync_required"] for call in proto.send_to_client.call_args_list[:-1])
    assert table.find_entity_by_sprite_id("text").rotation == 0
    proto.broadcast_filtered.assert_not_awaited()
    with factory() as db:
        assert db.query(models.CanvasCommandJournal).count() == 1
        assert db.query(models.Entity).one().rotation == 0


async def test_same_identity_in_burst_has_one_history_entry(protocol):
    proto, table, factory = protocol
    await send(proto, create(table))
    proto.send_to_client.reset_mock()
    message = rotation(table, 30)
    response = await send(proto, Message(MessageType.BATCH_REQUEST, {"messages": [
        message.to_dict(), message.to_dict()]}))
    assert response.data["failed_count"] == 0
    assert proto.send_to_client.call_args_list[1].args[0].data["resync_required"]
    with factory() as db:
        assert db.query(models.CanvasCommandJournal).count() == 2


async def test_failed_in_memory_history_publication_cannot_reject_a_committed_burst(protocol, monkeypatch):
    proto, table, factory = protocol
    await send(proto, create(table))
    proto.send_to_client.reset_mock()
    proto.broadcast_filtered.reset_mock()
    monkeypatch.setattr(proto.actions, "_add_to_history", AsyncMock(side_effect=RuntimeError("history cache")))
    response = await send(proto, Message(MessageType.BATCH_REQUEST, {"messages": [
        rotation(table, 30).to_dict(), rotation(table, 60).to_dict()]}))
    assert response.data["failed_count"] == 0
    assert all(call.args[0].data["resync_required"] for call in proto.send_to_client.call_args_list[:-1])
    assert table.find_entity_by_sprite_id("text").rotation == 60
    assert proto.broadcast_filtered.await_count == 2
    with factory() as db:
        assert db.query(models.Entity).one().rotation == 60
        assert db.query(models.CanvasCommandJournal).count() == 3


@pytest.mark.parametrize("unrelated_sprites,distinct_targets", [(0, False), (100, False), (1000, False), (99, True)])
async def test_burst_sql_work_does_not_scale_with_unrelated_sprites(protocol, test_db, test_db_engine, test_game_session, unrelated_sprites, distinct_targets):
    proto, table, _ = protocol
    await send(proto, create(table))
    for index in range(unrelated_sprites):
        table.add_entity({"sprite_id": f"unrelated-{index}", "x": (index % 50) * 15 + 100, "y": (index // 50) * 15 + 300})
    crud.save_table_to_db(test_db, table, test_game_session.id)
    counts = Counter()
    commits = []

    def capture(_conn, _cursor, sql, _parameters, _context, _many):
        counts[sql.split()[0].upper()] += 1

    event.listen(test_db_engine, "before_cursor_execute", capture)
    event.listen(test_db_engine, "commit", lambda _connection: commits.append(True))
    started = time.perf_counter()
    try:
        response = await send(proto, Message(MessageType.BATCH_REQUEST, {"messages": [
            rotation(table, angle, f"unrelated-{angle - 1}" if distinct_targets else "text").to_dict() for angle in range(1, 21)]}))
    finally:
        event.remove(test_db_engine, "before_cursor_execute", capture)
    assert response.data["failed_count"] == 0
    assert sum(counts.values()) < 600
    assert len(commits) == 2
    print(f"BURST_SQL unrelated={unrelated_sprites} distinct_targets={distinct_targets} statements={sum(counts.values())} counts={dict(counts)} elapsed_ms={(time.perf_counter()-started)*1000:.1f}")


async def test_repeated_settings_cancellation_keeps_the_lock_through_commit_and_publication(protocol, monkeypatch):
    from service.canvas_persistence_service import persist_table_settings
    proto, table, factory = protocol
    started, release = threading.Event(), threading.Event()
    proto.broadcast_to_session = AsyncMock()

    def slow(*args):
        started.set()
        assert release.wait(3)
        return persist_table_settings(*args)

    monkeypatch.setattr("service.protocol.tables.persist_table_settings", slow)
    task = asyncio.create_task(proto.handle_client(Message(MessageType.TABLE_SETTINGS_UPDATE,
        {"table_id": str(table.table_id), "grid_cell_px": 60}), "client"))
    while not started.is_set():
        await asyncio.sleep(0)
    task.cancel()
    await asyncio.sleep(0)
    task.cancel()
    await asyncio.sleep(0)
    assert proto._mutation_lock.locked() and not task.done() and table.grid_cell_px == 50
    release.set()
    with pytest.raises(asyncio.CancelledError):
        await task
    assert table.grid_cell_px == 60 and not proto._mutation_lock.locked()
    proto.broadcast_to_session.assert_awaited_once()
    with factory() as db:
        assert db.query(models.VirtualTable).one().grid_cell_px == 60
