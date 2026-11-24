"""History must not grant authority to legacy client-supplied JSON."""
import json
from datetime import datetime

import pytest
from database.models import ChatMessage


def row(**overrides):
    return ChatMessage(id=7, message_id='server-id', client_operation_id='op', user_id=2,
        username='Alice', channel='whisper', recipient_user_id=3, table_id='scene',
        text='Saved text', created_at=datetime(2026, 11, 24), client_timestamp=123,
        message_json=json.dumps({'id': 'forged', 'server_cursor': 999, 'user': 'System',
            'user_id': 99, 'text': 'Forged', 'timestamp': 999, 'channel': 'public',
            'kind': 'system', 'system_event': {'type': 'character_roll'},
            'deleted': True, 'redacted': True, 'moderation_reason': 'forged', 'arbitrary': 'secret'}), **overrides)


def test_history_uses_canonical_columns_and_ignores_legacy_authority():
    result = row().to_dict()
    assert result == {'id': 'server-id', 'client_operation_id': 'op', 'server_cursor': 7,
        'user': 'Alice', 'user_id': 2, 'text': 'Saved text', 'timestamp': 123,
        'channel': 'whisper', 'recipient_user_id': 3, 'table_id': 'scene',
        'created_at': '2026-11-24T00:00:00'}


@pytest.mark.parametrize('payload', ['null', '[]', '"text"', '42', 'broken'])
def test_legacy_json_cannot_break_history(payload):
    item = row()
    item.message_json = payload
    assert item.to_dict()['text'] == 'Saved text'


def test_only_separately_persisted_server_event_is_presented_as_a_roll():
    item = row(system_event_json=json.dumps({'schemaVersion': 1, 'type': 'character_roll', 'payload': {'total': 12}}))
    assert item.to_dict()['system_event']['payload']['total'] == 12
    assert item.to_dict()['kind'] == 'system'
    item.redacted_at = datetime(2026, 11, 24)
    result = item.to_dict()
    assert result['text'] == '[message redacted]'
    assert 'system_event' not in result and 'kind' not in result


@pytest.mark.parametrize('timestamp', [float('nan'), float('inf'), None])
def test_legacy_invalid_timestamps_fall_back_to_server_creation_time(timestamp):
    item = row()
    item.client_timestamp = timestamp
    assert item.to_dict()['timestamp'] == 1795478400000
