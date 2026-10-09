from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from core_table.protocol import Message, MessageType
from service.protocol.base import ServerProtocol


def protocol():
    result = ServerProtocol.__new__(ServerProtocol)
    result.handlers = {MessageType.PING: AsyncMock(return_value=Message(MessageType.PONG, {}))}
    return result


@pytest.mark.asyncio
@pytest.mark.parametrize("items", [None, [], "invalid", [None], [{}] * 101,
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


@pytest.mark.asyncio
async def test_batch_errors_do_not_echo_sensitive_payloads():
    server = protocol()
    server.handlers[MessageType.PING].side_effect = RuntimeError("private database details")
    response = await server.handle_batch_request(Message(MessageType.BATCH_REQUEST, {"messages": [
        {"type": "ping", "message_id": "request", "data": {"secret": "private"}},
    ]}), "client")
    child = response.data["messages"][0]
    assert child["data"] == {"error": "Batch message processing failed"}
    assert child["correlation_id"] == "request"
    assert response.data["failed_count"] == 1


@pytest.mark.asyncio
@pytest.mark.parametrize("response_type", [MessageType.ERROR, MessageType.ACTION_REJECTED, MessageType.SUCCESS])
async def test_only_accepted_mutations_trigger_coupled_autosave(response_type):
    server = protocol()
    server.handlers[MessageType.SPRITE_UPDATE] = AsyncMock(return_value=Message(response_type, {}))
    server.session_manager = SimpleNamespace(auto_save=AsyncMock())
    await server._invoke_handler(Message(MessageType.SPRITE_UPDATE, {}), "client")
    assert server.session_manager.auto_save.await_count == (1 if response_type == MessageType.SUCCESS else 0)
