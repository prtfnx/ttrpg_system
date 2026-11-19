import pytest
from core_table.protocol import Message, MessageType
from service.protocol.base import ServerProtocol


@pytest.mark.parametrize('operation_id', [None, 'operation-1'])
def test_rejected_sprite_move_remains_valid_after_response_correlation(operation_id):
    data = {'table_id': 'table-1', 'sprite_id': 'sprite-1', 'action_id': 'move-1',
            'from': {'x': 0, 'y': 0}, 'to': {'x': 50, 'y': 0}}
    if operation_id:
        data['operation_id'] = operation_id
    request = Message(MessageType.SPRITE_MOVE, data)
    response = Message(MessageType.ACTION_REJECTED, {'reason': 'Path blocked by obstacle'})
    ServerProtocol._correlate_response(request, response)
    decoded = Message.from_json(response.to_json())
    assert decoded.data['table_id'] == 'table-1'
    assert decoded.data['action_id'] == 'move-1'
    assert decoded.causation_id == request.message_id
    assert decoded.data.get('operation_id') == operation_id
