import asyncio
import copy
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from core_table.protocol import Message, MessageType
from core_table.server import TableManager
from database import models
from service.canvas_command_service import CanvasRejected, CanvasResult
from service.protocol import canvas as module
from service.protocol.base import ServerProtocol

from .test_canvas_command_service import PAINT, TABLE
from .test_canvas_command_service import scene as scene


@pytest.fixture
def protocol(scene, monkeypatch):
    manager = TableManager()
    manager.add_table(scene["table"]["table"])
    sessions = SimpleNamespace(session_code="CANVAS", game_session_db_id=scene["session"],
        client_info={"sender": {"user_id": scene["actor"], "role": "dm"}},
        broadcast_to_session=AsyncMock(), broadcast_filtered=AsyncMock(), auto_save=AsyncMock())
    result = ServerProtocol(manager, sessions, transport_send=AsyncMock())
    monkeypatch.setattr(module, "CanvasCommandService", lambda _: scene["service"])
    return result


async def dispatch(protocol, command):
    message = Message(MessageType.CANVAS_COMMAND, command)
    assert await protocol.handle_client(message, "sender")
    return protocol._transport_send.call_args.args[0]


@pytest.mark.asyncio
async def test_real_service_commits_before_publication_and_returns_correlated_receipt(scene, protocol):
    sent = []

    async def receive(message, _client):
        with scene["factory"]() as db:
            assert db.get(models.PaintObject, PAINT).version == 2
            assert db.query(models.CanvasCommandJournal).count() == 1
        sent.append(message)

    protocol._transport_send.side_effect = receive
    command = scene["command"]()
    receipt = await dispatch(protocol, command)
    assert [message.type for message in sent] == [MessageType.PAINT_OBJECT_EVENT,
        MessageType.SPRITE_UPDATE, MessageType.CANVAS_COMMAND_RESULT]
    assert receipt.data["success"] and receipt.data["can_undo"]
    assert receipt.correlation_id and receipt.causation_id
    assert protocol.table_manager.tables[TABLE] is protocol.table_manager.tables_id[TABLE]
    assert protocol.table_manager.get_table(TABLE).find_entity_by_sprite_id("sprite").position == (20, 40)
    protocol.session_manager.broadcast_to_session.assert_awaited_once()
    protocol.session_manager.broadcast_filtered.assert_awaited_once()
    assert protocol.session_manager.broadcast_filtered.call_args.args[1] == "tokens"
    protocol.session_manager.auto_save.assert_not_awaited()


@pytest.mark.asyncio
async def test_retry_does_not_publish_stale_table_or_rebroadcast_events(scene, protocol):
    command = scene["command"]()
    await dispatch(protocol, command)
    table = protocol.table_manager.get_table(TABLE)
    table.find_entity_by_sprite_id("sprite").rotation = 45
    protocol._transport_send.reset_mock()
    protocol.session_manager.broadcast_to_session.reset_mock()
    protocol.session_manager.broadcast_filtered.reset_mock()
    receipt = await dispatch(protocol, command)
    assert receipt.data["success"] and receipt.data["resync_required"]
    assert protocol._transport_send.await_count == 1
    assert protocol.table_manager.get_table(TABLE) is table
    assert table.find_entity_by_sprite_id("sprite").rotation == 45
    protocol.session_manager.broadcast_to_session.assert_not_awaited()
    protocol.session_manager.broadcast_filtered.assert_not_awaited()


@pytest.mark.asyncio
async def test_absolute_layer_edit_publishes_old_layer_removal_before_private_upsert(scene, protocol):
    command = scene["command"]("sprite_edit", members=scene["members"]()[1:], edit={"layer": "dungeon_master"})
    receipt = await dispatch(protocol, command)
    assert receipt.data["success"] and receipt.data["can_undo"]
    calls = protocol.session_manager.broadcast_filtered.await_args_list
    assert [(call.args[0].type, call.args[1]) for call in calls] == [
        (MessageType.SPRITE_REMOVE, "tokens"), (MessageType.SPRITE_UPDATE, "dungeon_master"),
    ]
    assert "sprite_data" not in calls[0].args[0].data
    assert calls[1].args[0].data["sprite_data"]["layer"] == "dungeon_master"
    with scene["factory"]() as db:
        assert db.query(models.CanvasCommandJournal).count() == 1


@pytest.mark.asyncio
async def test_unauthenticated_sender_cannot_supply_actor_context(scene, protocol):
    protocol.session_manager.client_info.clear()
    response = await dispatch(protocol, {**scene["command"](), "actor_id": scene["actor"]})
    assert not response.data["success"] and response.data["code"] == "forbidden"
    with scene["factory"]() as db:
        assert db.query(models.CanvasCommandJournal).count() == 0


@pytest.mark.asyncio
async def test_authorization_rejection_has_domain_receipt_and_no_events(scene, protocol):
    command = scene["command"]()
    command["members"][0]["version"] = 999
    response = await dispatch(protocol, command)
    assert response.type == MessageType.CANVAS_COMMAND_RESULT
    assert not response.data["success"] and response.data["code"] == "conflict"
    assert protocol._transport_send.await_count == 1


@pytest.mark.asyncio
async def test_unexpected_storage_error_does_not_echo_internal_details(scene, protocol, monkeypatch):
    def fail(**_kwargs):
        raise RuntimeError("secret-database-connection")

    monkeypatch.setattr(scene["service"], "execute", fail)
    response = await dispatch(protocol, scene["command"]())
    assert response.data["code"] == "persistence_failed"
    assert "secret" not in response.to_json()
    assert protocol.table_manager.get_table(TABLE) is scene["table"]["table"]


@pytest.mark.asyncio
async def test_post_commit_delivery_failure_preserves_success_and_requests_resync(scene, protocol):
    protocol.session_manager.broadcast_to_session.side_effect = RuntimeError("disconnected")
    receipt = await dispatch(protocol, scene["command"]())
    assert receipt.data["success"] and receipt.data["resync_required"]
    assert protocol.table_manager.get_table(TABLE).find_entity_by_sprite_id("sprite").position == (20, 40)
    assert protocol.session_manager.broadcast_filtered.await_count == 1


@pytest.mark.asyncio
async def test_command_serializes_with_table_saves_and_snapshots_after_the_lock(scene, protocol, monkeypatch):
    lock = protocol.table_manager.table_write_lock(TABLE)
    await lock.acquire()
    captured = []

    async def execute(_function, **context):
        captured.append(context["table_snapshot"])
        raise CanvasRejected("conflict", "expected test rejection")

    monkeypatch.setattr(module, "run_blocking", execute)
    task = asyncio.create_task(dispatch(protocol, scene["command"]()))
    await asyncio.sleep(0)
    assert not captured
    protocol.table_manager.get_table(TABLE).find_entity_by_sprite_id("sprite").name = "Newer save"
    lock.release()
    await task
    assert "Newer save" in str(captured[0])


@pytest.mark.asyncio
async def test_repeated_cancellation_keeps_session_lock_until_commit_and_publication(scene, protocol, monkeypatch):
    started, release = asyncio.Event(), asyncio.Event()
    original = protocol.table_manager.get_table(TABLE)
    accepted = copy.deepcopy(original)
    accepted.find_entity_by_sprite_id("sprite").name = "Committed"

    async def execute(_function, **_context):
        started.set()
        await release.wait()
        return CanvasResult({"success": True}, [], accepted)

    monkeypatch.setattr(module, "run_blocking", execute)
    task = asyncio.create_task(dispatch(protocol, scene["command"]()))
    await asyncio.wait_for(started.wait(), 1)
    for _ in range(2):
        task.cancel()
        await asyncio.sleep(0)
        assert not task.done() and protocol._mutation_lock.locked()
        assert protocol.table_manager.get_table(TABLE) is original
    release.set()
    with pytest.raises(asyncio.CancelledError):
        await task
    assert not protocol._mutation_lock.locked()
    assert protocol.table_manager.get_table(TABLE).find_entity_by_sprite_id("sprite").name == "Committed"


@pytest.mark.asyncio
async def test_history_request_returns_only_current_actor_availability(scene, protocol):
    await dispatch(protocol, scene["command"]())
    assert await protocol.handle_client(Message(MessageType.CANVAS_HISTORY_REQUEST, {"table_id": TABLE}), "sender")
    response = protocol._transport_send.call_args.args[0]
    assert response.type == MessageType.CANVAS_HISTORY_STATE
    assert response.data == {"table_id": TABLE, "can_undo": True, "can_redo": False}
    protocol.session_manager.client_info.clear()
    await protocol.handle_client(Message(MessageType.CANVAS_HISTORY_REQUEST, {"table_id": TABLE}), "sender")
    assert protocol._transport_send.call_args.args[0].data["code"] == "forbidden"
