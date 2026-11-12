"""Session originals and typed rules are required before decoder ID defaults."""
import pytest
from core_table.protocol import Message


@pytest.mark.parametrize('kind,data', [('game_mode_change', {'game_mode': 'explore'}),
    ('session_rules_update', {'rules': {'movement_mode': 'free'}})])
@pytest.mark.parametrize('identity', [None, '', ' ', 'x' * 129])
def test_original_id_is_required(kind, data, identity):
    request = {'type': kind, 'data': data, 'message_id': 'original'}
    assert Message.from_dict(request).message_id == 'original'
    if identity is None:
        request.pop('message_id')
    else:
        request['message_id'] = identity
    with pytest.raises(ValueError, match='Invalid protocol message'):
        Message.from_dict(request)


@pytest.mark.parametrize('data', [{}, {'game_mode': 'invalid'}, {'game_mode': 'fight', 'user_id': 123}])
def test_game_mode_is_closed_and_canonical(data):
    with pytest.raises(ValueError, match='Invalid protocol message'):
        Message.from_dict({'type': 'game_mode_change', 'data': data, 'message_id': 'original'})


@pytest.mark.parametrize('rules', [{}, [], {'unknown': True}, {'walls_block_movement': 1},
    {'default_movement_speed': 0}, {'actions_per_turn': True}, {'reactions_per_turn': -1},
    {'explore_round_timer': 0}, {'movement_mode': 'invalid'}, {'custom_rules': []},
    {'server_validation_tier': 'trust_client'}, {'critical_hit_rule': 'invalid'}])
def test_rules_replacement_is_nonempty_closed_and_typed(rules):
    with pytest.raises(ValueError, match='Invalid protocol message'):
        Message.from_dict({'type': 'session_rules_update', 'data': {'rules': rules}, 'message_id': 'original'})
