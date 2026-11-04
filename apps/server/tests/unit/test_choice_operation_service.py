"""Receipts settle actual choice transitions without rerolling or stale replay."""
from types import SimpleNamespace
from unittest.mock import Mock

import pytest
from database import models
from service import choice_operation_service
from service.choice_encounter_persistence_service import ChoiceEncounterPersistenceService
from service.choice_operation_service import ChoiceIntent, ChoiceOperationRejected, ChoiceOperationService
from service.encounter_engine import EncounterEngine
from service.session_operation_receipts import OperationOutcomeUnknown, OperationRejected
from sqlalchemy import create_engine, event
from sqlalchemy.orm import Session, sessionmaker


@pytest.fixture
def choices(tmp_path):
    engine = create_engine(f"sqlite:///{tmp_path / 'choice-receipts.db'}", connect_args={'check_same_thread': False})

    @event.listens_for(engine, 'connect')
    def foreign_keys(connection, _):
        connection.execute('PRAGMA foreign_keys=ON')

    models.Base.metadata.create_all(engine)
    factory = sessionmaker(bind=engine)
    with factory() as db:
        db.add_all([models.User(id=i, username=f'choice-{i}', hashed_password='unused') for i in (1, 2, 3, 4)])
        db.flush()
        db.add(models.GameSession(id=1, session_code='CHOICE', name='Choices', owner_id=1))
        db.flush()
        db.add_all([models.GamePlayer(session_id=1, user_id=i, role=role)
                    for i, role in ((2, 'co_dm'), (3, 'player'), (4, 'spectator'))])
        db.commit()
    store = ChoiceEncounterPersistenceService(factory)
    service = ChoiceOperationService(store)

    def intent(kind='encounter_start', request='start-original', actor=1, **data):
        if kind == 'encounter_start':
            data = {'choices': [{'choice_id': 'go', 'text': 'Go', 'requires_roll': True, 'roll_dc': 10}],
                    'participants': ['3'], 'dm_notes': 'Private', **data}
        return ChoiceIntent.create(1, actor, request, kind, data)

    def transition(kind, request='transition-original'):
        if kind == 'encounter_start':
            return intent()
        started = service.execute(intent())
        target = started.receipt['encounter_id']
        if kind == 'encounter_roll':
            service.execute(intent('encounter_choice', 'choose', actor=3, encounter_id=target, choice_id='go'))
        return intent(kind, request, actor=1 if kind == 'encounter_end' else 3,
                      encounter_id=target, **({'choice_id': 'go'} if kind in ('encounter_choice', 'encounter_roll') else {}))

    yield SimpleNamespace(factory=factory, engine=engine, store=store, service=service, intent=intent, transition=transition)
    engine.dispose()


def counts(scope):
    with scope.factory() as db:
        return (db.query(models.ChoiceEncounter).count(), db.query(models.ChoiceEncounterEvent).count(),
                db.query(models.SessionOperationReceipt).count(),
                [(row.version, row.state_json) for row in db.query(models.ChoiceEncounter).order_by(models.ChoiceEncounter.id)])


@pytest.mark.parametrize('kind', list(choice_operation_service.KINDS))
def test_original_accepts_once_on_reconstructed_service_without_changing_live_registry(choices, kind):
    intent = choices.transition(kind)
    live = dict(EncounterEngine._active)
    accepted = choices.service.execute(intent)
    before = counts(choices)
    restarted = ChoiceOperationService(ChoiceEncounterPersistenceService(choices.factory))
    replay = restarted.execute(intent)
    assert not accepted.replayed and replay.replayed and replay.receipt == accepted.receipt
    assert counts(choices) == before and EncounterEngine._active == live


def test_old_start_and_end_receipts_return_new_current_prompt_instead_of_recreating_old_one(choices):
    start = choices.intent()
    first = choices.service.execute(start)
    end = choices.intent('encounter_end', 'end-original', encounter_id=first.receipt['encounter_id'])
    choices.service.execute(end)
    assert choices.service.execute(start).current is None
    second = choices.service.execute(choices.intent(request='second', title='New prompt'))
    before = counts(choices)
    for original in (start, end):
        replay = choices.service.execute(original)
        assert replay.current == second.current and replay.receipt['encounter_id'] == first.receipt['encounter_id']
    assert counts(choices) == before


def test_roll_receipt_replays_exact_dice_after_completion_without_running_random_again(choices, monkeypatch):
    intent = choices.transition('encounter_roll')
    original = choices.service.execute(intent)
    choices.service.execute(choices.intent('encounter_end', 'end', encounter_id=original.receipt['encounter_id']))
    roll = Mock(side_effect=AssertionError('A duplicate must never reroll'))
    monkeypatch.setattr('service.encounter_engine.DiceEngine.roll', roll)
    replay = choices.service.execute(intent)
    assert replay.receipt['roll'] == original.receipt['roll'] and replay.current is None
    roll.assert_not_called()


@pytest.mark.parametrize('kind', list(choice_operation_service.KINDS))
def test_receipt_flush_failure_rolls_back_snapshot_event_and_receipt(choices, monkeypatch, kind):
    intent = choices.transition(kind)
    before = counts(choices)
    stage = choice_operation_service.stage_receipt

    def fail(*args):
        stage(*args)
        raise RuntimeError('After snapshot/event/receipt flush')

    monkeypatch.setattr(choice_operation_service, 'stage_receipt', fail)
    with pytest.raises(ChoiceOperationRejected) as error:
        choices.service.execute(intent)
    assert error.value.not_accepted and error.value.code == 'persistence_failed'
    assert counts(choices) == before


@pytest.mark.parametrize('kind', list(choice_operation_service.KINDS))
@pytest.mark.parametrize('committed', [False, True])
def test_lost_commit_response_settles_by_receipt_presence_on_fresh_connection(choices, kind, committed):
    intent = choices.transition(kind)

    class LostResponse(Session):
        def commit(self):
            if committed:
                super().commit()
            raise OSError('Commit response lost')

    uncertain = ChoiceOperationService(ChoiceEncounterPersistenceService(sessionmaker(bind=choices.engine, class_=LostResponse)))
    with pytest.raises(OperationOutcomeUnknown):
        uncertain.execute(intent)
    settled = choices.service.lookup(intent, internal=True)
    assert (settled.receipt is not None) is committed
    before = counts(choices)
    result = choices.service.execute(intent)
    assert result.replayed is committed
    if committed:
        assert counts(choices) == before


def test_current_database_authority_precedes_receipt_disclosure_but_internal_repair_is_allowed(choices):
    intent = choices.intent(actor=2)
    choices.service.execute(intent)
    with choices.factory() as db:
        db.query(models.GamePlayer).filter_by(user_id=2).one().role = 'player'
        db.commit()
    with pytest.raises(ChoiceOperationRejected) as error:
        choices.service.execute(intent)
    assert error.value.code == 'forbidden' and not error.value.not_accepted
    recovered = choices.service.lookup(intent, internal=True)
    assert recovered.receipt is not None and recovered.current is not None and recovered.role is None


def test_reusing_identity_with_changed_payload_or_operation_kind_rejects(choices):
    original = choices.service.execute(choices.intent())
    for changed in (choices.intent(title='Changed'),
                    choices.intent('encounter_end', 'start-original', encounter_id=original.receipt['encounter_id'])):
        with pytest.raises(ChoiceOperationRejected) as error:
            choices.service.execute(changed)
        assert error.value.code == 'conflict' and not error.value.not_accepted
    assert counts(choices)[:3] == (1, 1, 1)


@pytest.mark.parametrize('actor', [3, 4])
def test_players_and_spectators_cannot_start_a_prompt(choices, actor):
    with pytest.raises(ChoiceOperationRejected, match='authority'):
        choices.service.execute(choices.intent(actor=actor))
    assert counts(choices)[:3] == (0, 0, 0)


def test_spectators_and_nonparticipants_cannot_select_even_with_current_connection(choices):
    started = choices.service.execute(choices.intent())
    for actor in (2, 4):
        with pytest.raises(ChoiceOperationRejected):
            choices.service.execute(choices.intent('encounter_choice', f'choose-{actor}', actor=actor,
                encounter_id=started.receipt['encounter_id'], choice_id='go'))
    assert counts(choices)[:3] == (1, 1, 1)


@pytest.mark.parametrize('kind,payload', [
    ('encounter_start', {'choices': []}), ('encounter_start', {'choices': [{'text': 'Go', 'requires_roll': True}]}),
    ('encounter_start', {'choices': [{'text': 'Go'}], 'user_id': 1}),
    ('encounter_start', {'choices': [{'text': 'Go', 'roll_dc': True}]}),
    ('encounter_roll', {'encounter_id': 'target', 'bonus': True}),
    ('encounter_roll', {'encounter_id': 'target', 'bonus': 1.5}),
    ('encounter_choice', {'choice_id': 'go'}), ('encounter_end', {}),
])
def test_invalid_or_implicit_target_intents_reject_before_sql(kind, payload):
    with pytest.raises(OperationRejected):
        ChoiceIntent.create(1, 1, 'original', kind, payload)
