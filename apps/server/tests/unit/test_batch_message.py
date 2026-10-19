"""Tests for batch message serialization — verifies inline dict construction is JSON-safe."""
import asyncio
import json
import uuid
from unittest.mock import AsyncMock

import pytest
from core_table.protocol import Message, MessageType
from service.paint_object_service import PaintSnapshot
from service.protocol import paint as paint_module
from service.protocol.base import ServerProtocol


def test_batch_response_dict_is_json_serializable():
    """Regression: batch responses must be plain dicts, not Message objects."""
    responses = [
        Message(MessageType.TABLE_DATA, {'sprites': []}),
        Message(MessageType.ERROR, {'error': 'test'}),
    ]

    batch_data = {
        'messages': [
            {
                'type': resp.type.value,
                'data': resp.data or {},
                'client_id': resp.client_id,
                'timestamp': resp.timestamp,
                'version': resp.version,
                'priority': resp.priority,
                'sequence_id': resp.sequence_id,
            }
            for resp in responses
        ],
        'seq': 1,
        'processed_count': 2,
        'response_count': 2,
    }

    batch = Message(MessageType.BATCH_RESPONSE, batch_data)
    # Must not raise TypeError: Object of type Message is not JSON serializable
    serialized = batch.to_json()
    parsed = json.loads(serialized)
    assert len(parsed['data']['messages']) == 2
    assert parsed['data']['messages'][0]['type'] == MessageType.TABLE_DATA.value
    assert parsed['data']['messages'][1]['data'] == {'error': 'test'}


def test_batch_response_includes_all_message_fields():
    """Batch sub-messages must include version/priority/sequence_id for backward compat."""
    resp = Message(MessageType.TABLE_DATA, {'sprites': []})
    batch_msg = resp.to_dict()
    # Verify all fields from Message.to_json() are present
    for field in ('type', 'data', 'client_id', 'timestamp', 'version', 'priority', 'sequence_id'):
        assert field in batch_msg


@pytest.mark.asyncio
async def test_batch_handler_validates_entries_and_returns_directional_response():
    protocol = object.__new__(ServerProtocol)
    ping_handler = AsyncMock(
        return_value=Message(MessageType.SUCCESS, {"acknowledged": True}),
    )
    protocol.handlers = {MessageType.PING: ping_handler}
    request = Message(MessageType.BATCH_REQUEST, {
        "messages": [Message(MessageType.PING, {}).to_dict()],
        "seq": 7,
    })

    response = await protocol.handle_batch_request(request, "client-1")

    ping_handler.assert_awaited_once()
    assert response.type == MessageType.BATCH_RESPONSE
    assert response.data["seq"] == 7
    assert response.data["processed_count"] == 1
    assert response.data["response_count"] == 1
    assert Message.from_json(response.to_json()).type == MessageType.BATCH_RESPONSE


@pytest.mark.asyncio
async def test_batch_handler_does_not_dispatch_schema_invalid_entries():
    protocol = object.__new__(ServerProtocol)
    status_handler = AsyncMock()
    protocol.handlers = {MessageType.PLAYER_STATUS_REQUEST: status_handler}
    request = Message(MessageType.BATCH_REQUEST, {
        "messages": [{
            "type": MessageType.PLAYER_STATUS_REQUEST.value,
            "data": {"status": "ready"},
        }],
    })

    response = await protocol.handle_batch_request(request, "client-1")

    status_handler.assert_not_awaited()
    assert response.type == MessageType.BATCH_RESPONSE
    assert response.data["messages"][0]["type"] == MessageType.ERROR.value


@pytest.mark.asyncio
async def test_committed_mutation_receipt_precedes_a_later_blocked_member():
    protocol = object.__new__(ServerProtocol)
    protocol.send_to_client = AsyncMock()
    entered, release = asyncio.Event(), asyncio.Event()

    async def blocked(*_args):
        entered.set()
        await release.wait()
        return Message(MessageType.PONG, {"timestamp": 1, "client_id": "client"})

    first = Message(MessageType.TABLE_SETTINGS_UPDATE, {"table_id": str(uuid.uuid4()), "grid_cell_px": 64})
    protocol.handlers = {
        first.type: AsyncMock(return_value=Message(MessageType.SUCCESS, {"success": True})),
        MessageType.PING: blocked,
    }
    task = asyncio.create_task(protocol.handle_batch_request(Message(MessageType.BATCH_REQUEST, {
        "messages": [first.to_dict(), Message(MessageType.PING, {}).to_dict()],
    }), "client"))
    await asyncio.wait_for(entered.wait(), 1)
    receipt = protocol.send_to_client.call_args.args[0]
    assert receipt.causation_id == first.message_id and not task.done()
    release.set()
    summary = await task
    assert summary.data["response_count"] == 2
    assert [item["type"] for item in summary.data["messages"]] == ["pong"]


@pytest.mark.asyncio
async def test_batched_table_snapshot_is_streamed_outside_the_summary():
    protocol = object.__new__(ServerProtocol)
    protocol.send_to_client = AsyncMock()
    protocol.handlers = {MessageType.TABLE_REQUEST: AsyncMock(return_value=Message(
        MessageType.TABLE_RESPONSE, {"table_data": {"layers": {}}}))}
    request = Message(MessageType.TABLE_REQUEST, {"table_id": str(uuid.uuid4())})
    response = await protocol.handle_batch_request(Message(MessageType.BATCH_REQUEST, {
        "messages": [request.to_dict()],
    }), "client")
    assert response.data["response_count"] == 1 and not response.data["messages"]
    assert protocol.send_to_client.call_args.args[0].causation_id == request.message_id


@pytest.mark.asyncio
async def test_paint_recovery_queues_one_ordered_stream_without_awaiting_network(monkeypatch):
    table_id = str(uuid.uuid4())
    monkeypatch.setattr(paint_module, "_paint_snapshot", lambda **_kwargs: PaintSnapshot(table_id, 0, []))
    protocol = object.__new__(ServerProtocol)
    protocol._paint_context = lambda _msg, _client: (1, 1)
    protocol._snapshot_send = AsyncMock()
    protocol.send_to_client = AsyncMock()
    request = Message(MessageType.PAINT_SNAPSHOT_REQUEST, {"table_id": table_id})
    assert await protocol.handle_paint_snapshot_request(request, "client") is None
    chunks, client_id = protocol._snapshot_send.call_args.args
    assert client_id == "client" and chunks[-1].data["complete"]
    assert all(chunk.causation_id == request.message_id for chunk in chunks)
    protocol.send_to_client.assert_not_awaited()


@pytest.mark.asyncio
async def test_batch_handler_rejects_legacy_paint_before_enum_validation():
    protocol = object.__new__(ServerProtocol)
    handler = AsyncMock()
    protocol.handlers = {MessageType.PING: handler}
    request = Message(MessageType.BATCH_REQUEST, {
        "messages": [{"type": "paint_stroke_create", "data": {}}],
        "seq": 8,
    })

    response = await protocol.handle_batch_request(request, "client-1")

    handler.assert_not_awaited()
    assert response.type == MessageType.BATCH_RESPONSE
    assert response.data["processed_count"] == 1
    assert response.data["response_count"] == 1
    assert response.data["messages"][0]["data"]["code"] == "upgrade_required"


@pytest.mark.asyncio
@pytest.mark.parametrize("request_count", [2, 49])
async def test_batched_paint_snapshots_stream_complete_bounded_frames_without_aggregation(monkeypatch, request_count):
    table_id = str(uuid.uuid4())
    objects = [{
        "id": str(uuid.uuid4()), "table_id": table_id, "kind": "freehand",
        "geometry": {"kind": "freehand", "points": [{"x": i, "y": 0, "pressure": 0.5} for i in range(1400)]},
        "transform": {"x": 0, "y": 0, "scale_x": 1, "scale_y": 1},
        "style": {"stroke_rgba": [1, 0, 0, 1], "width": 2, "fill_rgba": None},
        "created_by": 1, "version": 1, "z_order": 1,
        "created_at": "2026-10-13T00:00:00Z", "updated_at": "2026-10-13T00:00:00Z",
    }]
    monkeypatch.setattr(paint_module, "_paint_snapshot", lambda **kwargs: PaintSnapshot(table_id, 1, objects))
    protocol = object.__new__(ServerProtocol)
    protocol._paint_context = lambda msg, client_id: (1, 1)
    protocol.send_to_client = AsyncMock()
    protocol.handlers = {
        MessageType.PAINT_SNAPSHOT_REQUEST: protocol.handle_paint_snapshot_request,
        MessageType.PING: AsyncMock(return_value=Message(MessageType.PONG, {"timestamp": 1, "client_id": "client-1"})),
    }
    requests = [Message(MessageType.PAINT_SNAPSHOT_REQUEST, {"table_id": table_id},
                        message_id="\u0001" * (128 - len(str(index))) + str(index),
                        correlation_id="😀" * 128 if request_count == 2 else None)
                for index in range(request_count)]
    batch = Message(MessageType.BATCH_REQUEST, {"messages": [request.to_dict() for request in requests]
                                              + [Message(MessageType.PING, {}).to_dict()]})
    Message.from_json(batch.to_json())
    assert len(batch.to_json().encode("utf-8")) <= 65536
    response = await protocol.handle_batch_request(batch, "client-1")
    frames = [call.args[0] for call in protocol.send_to_client.await_args_list]
    assert len(frames) == request_count
    # Before streaming the final chunks, even this pair alone exceeded 64 KiB.
    assert sum(len(frame.to_json().encode("utf-8")) for frame in frames) > 65536
    for frame, request in zip(frames, requests, strict=True):
        assert len(frame.to_json().encode("utf-8")) <= 65536
        assert Message.from_json(frame.to_json()).data["objects"] == objects
        assert frame.correlation_id == (request.correlation_id or request.message_id)
        assert frame.causation_id == request.message_id
        assert frame.data["complete"] is True
    assert all(call.args[1] == "client-1" for call in protocol.send_to_client.await_args_list)
    assert len(response.to_json().encode("utf-8")) <= 65536
    decoded = Message.from_json(response.to_json())
    assert decoded.data["processed_count"] == request_count + 1
    assert decoded.data["response_count"] == 1
    assert decoded.data["failed_count"] == 0
    assert decoded.data["messages"][-1]["type"] == MessageType.PONG.value
    assert len(decoded.data["messages"]) == 1
