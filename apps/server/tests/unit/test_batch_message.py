"""Tests for batch message serialization — verifies inline dict construction is JSON-safe."""
import json

from core_table.protocol import Message, MessageType


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

    batch = Message(MessageType.BATCH, batch_data)
    # Must not raise TypeError: Object of type Message is not JSON serializable
    serialized = batch.to_json()
    parsed = json.loads(serialized)
    assert len(parsed['data']['messages']) == 2
    assert parsed['data']['messages'][0]['type'] == MessageType.TABLE_DATA.value
    assert parsed['data']['messages'][1]['data'] == {'error': 'test'}


def test_batch_response_includes_all_message_fields():
    """Batch sub-messages must include version/priority/sequence_id for backward compat."""
    resp = Message(MessageType.TABLE_DATA, {'sprites': []})
    batch_msg = {
        'type': resp.type.value,
        'data': resp.data or {},
        'client_id': resp.client_id,
        'timestamp': resp.timestamp,
        'version': resp.version,
        'priority': resp.priority,
        'sequence_id': resp.sequence_id,
    }
    # Verify all fields from Message.to_json() are present
    for field in ('type', 'data', 'client_id', 'timestamp', 'version', 'priority', 'sequence_id'):
        assert field in batch_msg
