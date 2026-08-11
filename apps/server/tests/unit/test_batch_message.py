"""Tests for batch message serialization — verifies inline dict construction is JSON-safe."""
import json
from unittest.mock import AsyncMock

import pytest
from core_table.protocol import Message, MessageType
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
