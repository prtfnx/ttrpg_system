"""Tests for phase 4 ACTION_COMMIT handler."""
import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '../..'))

import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from core_table.protocol import Message, MessageType
from core_table.server import TableManager
from service.server_protocol import ServerProtocol


def make_protocol(role='dm'):
    tm = TableManager()
    proto = ServerProtocol(tm, session_manager=MagicMock())
    proto.send_to_client = AsyncMock()
    proto.broadcast_to_session = AsyncMock()
    proto._get_client_role = MagicMock(return_value=role)
    proto._get_user_id = MagicMock(return_value=1)
    proto._can_control_sprite = AsyncMock(return_value=True)
    proto._get_session_code = MagicMock(return_value=None)
    proto.actions.move_sprite = AsyncMock(return_value=MagicMock(success=True, message='ok'))
    return proto


@pytest.mark.asyncio
async def test_empty_actions_rejected():
    proto = make_protocol()
    msg = Message(MessageType.ACTION_COMMIT, {'actions': [], 'sequence_id': 1})
    resp = await proto.handle_action_commit(msg, 'c1')
    assert resp.type == MessageType.ACTION_REJECTED
    assert resp.data is not None
    assert resp.data['sequence_id'] == 1


@pytest.mark.asyncio
async def test_dm_move_commit_success():
    proto = make_protocol(role='dm')
    msg = Message(MessageType.ACTION_COMMIT, {
        'sequence_id': 5,
        'actions': [{'action_type': 'move', 'sprite_id': 's1', 'table_id': 't1',
                     'target_x': 100, 'target_y': 200, 'sequence_index': 0}],
    })
    resp = await proto.handle_action_commit(msg, 'c1')
    assert resp.type == MessageType.ACTION_RESULT
    assert resp.data is not None
    assert resp.data['sequence_id'] == 5
    assert len(resp.data['applied']) == 1
    proto.broadcast_to_session.assert_awaited_once()  # type: ignore[attr-defined]


@pytest.mark.asyncio
async def test_player_move_free_roam_success():
    proto = make_protocol(role='player')
    msg = Message(MessageType.ACTION_COMMIT, {
        'sequence_id': 2,
        'actions': [{'action_type': 'move', 'sprite_id': 's1', 'table_id': 't1',
                     'target_x': 64, 'target_y': 64, 'cost_ft': 5, 'speed_ft': 30,
                     'sequence_index': 0}],
    })
    with patch('service.protocol.combat.get_session_rules_json', return_value=None), \
         patch('service.protocol.combat.get_game_mode', return_value='free_roam'), \
         patch('service.protocol.combat.SessionLocal') as mock_db:
        mock_db.return_value.__enter__ = MagicMock(return_value=MagicMock())
        mock_db.return_value.__exit__ = MagicMock(return_value=False)
        mock_db.return_value.close = MagicMock()
        resp = await proto.handle_action_commit(msg, 'c1')
    assert resp.type == MessageType.ACTION_RESULT


@pytest.mark.asyncio
async def test_player_no_control_rejected():
    proto = make_protocol(role='player')
    proto._can_control_sprite = AsyncMock(return_value=False)
    msg = Message(MessageType.ACTION_COMMIT, {
        'sequence_id': 3,
        'actions': [{'action_type': 'move', 'sprite_id': 's2', 'table_id': 't1',
                     'target_x': 0, 'target_y': 0, 'sequence_index': 0}],
    })
    resp = await proto.handle_action_commit(msg, 'c1')
    assert resp.type == MessageType.ACTION_REJECTED
    assert resp.data is not None
    assert resp.data['failed_index'] == 0


@pytest.mark.asyncio
async def test_failed_move_returns_rejected_with_index():
    proto = make_protocol(role='dm')
    proto.actions.move_sprite = AsyncMock(return_value=MagicMock(success=False, message='blocked'))
    msg = Message(MessageType.ACTION_COMMIT, {
        'sequence_id': 7,
        'actions': [{'action_type': 'move', 'sprite_id': 's1', 'table_id': 't1',
                     'target_x': 10, 'target_y': 10, 'sequence_index': 0}],
    })
    resp = await proto.handle_action_commit(msg, 'c1')
    assert resp.type == MessageType.ACTION_REJECTED
    assert resp.data is not None
    assert resp.data['failed_index'] == 0
    assert resp.data['reason'] == 'blocked'


@pytest.mark.asyncio
async def test_multi_action_commit():
    proto = make_protocol(role='dm')
    msg = Message(MessageType.ACTION_COMMIT, {
        'sequence_id': 9,
        'actions': [
            {'action_type': 'move', 'sprite_id': 's1', 'table_id': 't1',
             'target_x': 100, 'target_y': 100, 'sequence_index': 0},
            {'action_type': 'attack', 'sprite_id': 's1', 'table_id': 't1',
             'sequence_index': 1},
        ],
    })
    resp = await proto.handle_action_commit(msg, 'c1')
    assert resp.type == MessageType.ACTION_RESULT
    assert resp.data is not None
    assert len(resp.data['applied']) == 2
    assert resp.data['applied'][0]['action_type'] == 'move'
    assert resp.data['applied'][1]['action_type'] == 'attack'
