"""The shared wire boundary rejects unidentified and malformed layer edits."""
import pytest
from core_table.protocol import Message


def request():
    return {'type': 'layer_settings_update', 'message_id': 'original', 'data': {
        'table_id': 'table', 'layer': 'tokens', 'settings': {'opacity': 0.5}}}


@pytest.mark.parametrize('identity', [None, '', '   ', 'x' * 129])
def test_original_identity_is_required_before_decode(identity):
    data = request()
    assert Message.from_dict(data).message_id == 'original'
    if identity is None:
        data.pop('message_id')
    else:
        data['message_id'] = identity
    with pytest.raises(ValueError, match='Invalid protocol message'):
        Message.from_dict(data)


@pytest.mark.parametrize('settings', [{}, {'visible': 1}, {'opacity': True}, {'opacity': 1.1},
    {'color': [0, 0]}, {'tint_color': [0, 0, 2]}, {'unknown': True}, {'blend_mode': 'invalid'},
    {'color': [1, 1, 1], 'tint_color': [0, 0, 0]}])
def test_patch_contract_is_closed_and_typed(settings):
    data = request()
    data['data']['settings'] = settings
    with pytest.raises(ValueError, match='Invalid protocol message'):
        Message.from_dict(data)


def test_unknown_layer_rejects_and_legacy_rgb_remains_compatible():
    data = request()
    data['data']['layer'] = 'ground'
    with pytest.raises(ValueError, match='Invalid protocol message'):
        Message.from_dict(data)
    data['data'].update(layer='map', settings={'color': [0.1, 0.2, 0.3, 1], 'blend_mode': 'multiply'})
    assert Message.from_dict(data).data == data['data']
