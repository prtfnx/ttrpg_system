"""Tests for direction-specific core WebSocket protocol handlers."""

import pytest
from core_table.protocol import Message, MessageType
from service.protocol.base import ServerProtocol


def test_server_registers_only_client_to_server_core_messages():
    protocol = object.__new__(ServerProtocol)
    protocol.handlers = {}

    protocol.init_handlers()

    assert MessageType.PING in protocol.handlers
    assert MessageType.PONG not in protocol.handlers
    assert MessageType.BATCH_REQUEST in protocol.handlers
    assert MessageType.BATCH_RESPONSE not in protocol.handlers


@pytest.mark.asyncio
async def test_ping_returns_a_schema_valid_pong():
    protocol = object.__new__(ServerProtocol)

    response = await protocol.handle_ping(Message(MessageType.PING, {}), "client-1")

    assert response.type == MessageType.PONG
    assert response.data["client_id"] == "client-1"
    assert Message.from_json(response.to_json()).type == MessageType.PONG
