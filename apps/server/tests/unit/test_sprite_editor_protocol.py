"""Real protocol dispatch joins legacy sprite APIs to durable editor history."""
import asyncio
import copy
import json
import time
from unittest.mock import AsyncMock

import pytest
from core_table.protocol import Message, MessageType
from core_table.server import TableManager
from database import crud, models
from service.protocol.base import ServerProtocol
from service.sprite_editor_commands import sprite_command_scope
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
