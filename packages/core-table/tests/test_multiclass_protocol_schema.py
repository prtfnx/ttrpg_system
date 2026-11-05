import pytest
from core_table.protocol import Message


def wire(**data):
    return {'type': 'multiclass_request', 'message_id': 'original', 'timestamp': 1,
            'data': {'character_id': 'hero', 'new_class': 'rogue', **data}}


@pytest.mark.parametrize('field,value', [('message_id', None), ('message_id', ''), ('message_id', 'x' * 129),
    ('timestamp', None), ('timestamp', True), ('timestamp', -1), ('timestamp', 9007199254741)])
def test_multiclass_requires_bounded_original_identity(field, value):
    request = wire()
    assert Message.from_dict(request).message_id == 'original'
    request.pop(field) if value is None else request.update({field: value})
    with pytest.raises(ValueError, match='Invalid protocol message'):
        Message.from_dict(request)


@pytest.mark.parametrize('data', [{}, {'version': 1}, {'version': 9007199254740991}])
def test_multiclass_accepts_closed_intent_and_optional_positive_version(data):
    assert Message.from_dict(wire(**data)).data == wire(**data)['data']


@pytest.mark.parametrize('data', [{'character_id': ''}, {'new_class': ''}, {'new_class': 'x' * 33},
    {'version': None}, {'version': True}, {'version': 0}, {'version': 1.5}, {'version': 9007199254740992},
    {'session_code': 'FORGED'}, {'user_id': 1}, {'classes': []}, {'level': 20}])
def test_multiclass_rejects_invalid_or_client_owned_advancement_fields(data):
    with pytest.raises(ValueError, match='Invalid protocol message'):
        Message.from_dict(wire(**data))
