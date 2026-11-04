import pytest
from core_table.protocol import Message

PAYLOADS = [('encounter_start', {'choices': [{'text': 'Go'}]}),
    ('encounter_end', {'encounter_id': 'original-prompt'}),
    ('encounter_choice', {'encounter_id': 'original-prompt', 'choice_id': 'go'}),
    ('encounter_roll', {'encounter_id': 'original-prompt', 'choice_id': 'go', 'bonus': 0})]


@pytest.mark.parametrize('kind,data', PAYLOADS)
@pytest.mark.parametrize('field,value', [('message_id', None), ('message_id', ''), ('message_id', 'x' * 129),
    ('timestamp', None), ('timestamp', -1), ('timestamp', True), ('timestamp', 9007199254741)])
def test_choice_mutations_keep_bounded_original_wire_identity(kind, data, field, value):
    wire = dict(type=kind, message_id='original', timestamp=1, data=data)
    assert Message.from_dict(wire).message_id == 'original'
    wire.pop(field) if value is None else wire.update({field: value})
    with pytest.raises(ValueError, match='Invalid protocol message'):
        Message.from_dict(wire)


@pytest.mark.parametrize('kind,data', PAYLOADS)
def test_choice_mutations_reject_client_authority_fields(kind, data):
    for field in ('session_id', 'session_code', 'user_id', 'role'):
        with pytest.raises(ValueError, match='Invalid protocol message'):
            Message.from_dict(dict(type=kind, message_id='original', timestamp=1, data={**data, field: 'forged'}))


@pytest.mark.parametrize('kind,data', [
    ('encounter_start', {'choices': []}),
    ('encounter_start', {'choices': [{'text': 'Go', 'requires_roll': True}]}),
    ('encounter_start', {'choices': [{'text': 'Go', 'requires_roll': True, 'roll_dc': None}]}),
    ('encounter_end', {}), ('encounter_end', {'encounter_id': 'target', 'choice_id': 'go'}),
    ('encounter_choice', {'encounter_id': 'target'}),
    ('encounter_roll', {'encounter_id': 'target', 'bonus': True}),
    ('encounter_roll', {'encounter_id': 'target', 'bonus': 1.5}),
    ('encounter_roll', {'encounter_id': 'target', 'bonus': 1001}),
])
def test_choice_payloads_reject_implicit_targets_and_invalid_rolls(kind, data):
    with pytest.raises(ValueError, match='Invalid protocol message'):
        Message.from_dict(dict(type=kind, message_id='original', timestamp=1, data=data))


def test_choice_unknown_and_proven_rejection_are_distinct_valid_errors():
    Message.from_dict(dict(type='error', data={'error': 'Checking choice acceptance', 'code': 'choice_outcome_unknown',
        'outcome': 'unknown', 'operation_id': 'original', 'resync_required': True}))
    Message.from_dict(dict(type='error', data={'error': 'Choice did not commit', 'code': 'persistence_failed',
        'operation_id': 'original', 'not_accepted': True}))
