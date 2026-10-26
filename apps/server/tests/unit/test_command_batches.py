from types import SimpleNamespace
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest
from core_table.protocol import Message, MessageType
from service.protocol.base import ServerProtocol


def protocol():
    result = ServerProtocol.__new__(ServerProtocol)
    result.handlers = {MessageType.PING: AsyncMock(return_value=Message(MessageType.PONG, {
        "timestamp": 1, "client_id": "client",
    }))}
    return result


@pytest.mark.asyncio
@pytest.mark.parametrize("items", [None, [], "invalid", [None], [{}] * 51,
                                  [{"type": "ping"}, {"type": "batch_request"}]])
async def test_batch_preflight_prevents_partial_dispatch(items):
    server = protocol()
    response = await server.handle_batch_request(Message(MessageType.BATCH_REQUEST, {"messages": items}), "client")
    assert response.type == MessageType.ERROR
    server.handlers[MessageType.PING].assert_not_awaited()


@pytest.mark.asyncio
async def test_children_keep_their_own_correlation_and_failures_are_reported():
    server = protocol()
    response = await server.handle_batch_request(Message(MessageType.BATCH_REQUEST, {"seq": 7, "messages": [
        {"type": "ping", "message_id": "request-1", "correlation_id": "correlation-1", "data": {}},
        {"type": "sprite_move", "message_id": "request-2", "data": {}},
    ]}), "client")
    assert response.type == MessageType.BATCH_RESPONSE
    assert response.data["atomic"] is False
    assert response.data["failed_count"] == 1
    assert response.data["messages"][0]["correlation_id"] == "correlation-1"
    assert response.data["messages"][0]["causation_id"] == "request-1"
    assert response.data["messages"][1]["correlation_id"] == "request-2"
    assert Message.from_json(response.to_json()).data == response.data


@pytest.mark.asyncio
async def test_silent_children_still_receive_a_schema_valid_batch_summary():
    server = protocol()
    server.handlers[MessageType.PING].return_value = None
    response = await server.handle_batch_request(Message(MessageType.BATCH_REQUEST, {
        "messages": [Message(MessageType.PING, {}).to_dict()] * 50,
    }), "client")
    assert response.data["processed_count"] == 50
    assert response.data["response_count"] == response.data["failed_count"] == 0
    assert Message.from_json(response.to_json()).data == response.data


@pytest.mark.asyncio
async def test_batch_errors_do_not_echo_sensitive_payloads():
    server = protocol()
    server.handlers[MessageType.PING].side_effect = RuntimeError("private database details")
    response = await server.handle_batch_request(Message(MessageType.BATCH_REQUEST, {"messages": [
        {"type": "ping", "message_id": "request", "data": {"secret": "private"}},
    ]}), "client")
    child = response.data["messages"][0]
    assert child["data"] == {"error": "Batch message processing failed", "code": "invalid_payload"}
    assert child["correlation_id"] == "request"
    assert response.data["failed_count"] == 1


@pytest.mark.asyncio
@pytest.mark.parametrize("response_type", [MessageType.CANVAS_COMMAND_RESULT,
    MessageType.CHARACTER_UPDATE_RESPONSE, MessageType.ASSET_DOWNLOAD_RESPONSE])
@pytest.mark.parametrize("success", [False, True])
async def test_batch_summary_counts_explicit_domain_denials(response_type, success):
    server = protocol()
    server.send_to_client = AsyncMock()
    server.handlers[MessageType.CANVAS_COMMAND] = AsyncMock(return_value=Message(response_type, {
        "success": success, "code": "history_empty", "error": "No history",
    }))
    request = Message(MessageType.CANVAS_COMMAND, {
        "operation_id": str(uuid4()), "table_id": str(uuid4()),
        "issued_at": 1792627200000, "mode": "undo",
    })
    response = await server.handle_batch_request(Message(MessageType.BATCH_REQUEST, {
        "messages": [request.to_dict()],
    }), "client")
    assert response.data["failed_count"] == int(not success)
    assert response.data["response_count"] == 1
    assert response.data["messages"] == []
    server.send_to_client.assert_awaited_once()
    assert server.send_to_client.await_args is not None
    streamed = server.send_to_client.await_args.args[0]
    assert streamed.causation_id == request.message_id


@pytest.mark.asyncio
@pytest.mark.parametrize("response_type,data,failures", [
    (MessageType.CANVAS_HISTORY_STATE, {"error": "History unavailable"}, 1),
    (MessageType.CANVAS_HISTORY_STATE, {"can_undo": False, "can_redo": False}, 0),
    (MessageType.ENCOUNTER_RESULT, {"success": False}, 0),
    (MessageType.CHARACTER_ROLL_RESULT, {"success": False}, 0),
    (MessageType.PAINT_OBJECT_EVENT, {"operation": "delete"}, 0),
    (MessageType.ERROR, {"error": "Paint version conflict"}, 1),
    (MessageType.ACTION_REJECTED, {"accepted": False}, 1),
])
async def test_batch_summary_distinguishes_denials_from_game_outcomes(response_type, data, failures):
    server = protocol()
    server.handlers[MessageType.PING].return_value = Message(response_type, data)
    response = await server.handle_batch_request(Message(MessageType.BATCH_REQUEST, {
        "messages": [Message(MessageType.PING, {}).to_dict()],
    }), "client")
    assert response.data["failed_count"] == failures


@pytest.mark.asyncio
@pytest.mark.parametrize("response_type", [MessageType.ERROR, MessageType.ACTION_REJECTED, MessageType.SUCCESS])
async def test_only_accepted_mutations_trigger_coupled_autosave(response_type):
    server = protocol()
    server.handlers[MessageType.SPRITE_UPDATE] = AsyncMock(return_value=Message(response_type, {}))
    server.session_manager = SimpleNamespace(auto_save=AsyncMock())
    await server._invoke_handler(Message(MessageType.SPRITE_UPDATE, {}), "client")
    assert server.session_manager.auto_save.await_count == (1 if response_type == MessageType.SUCCESS else 0)
