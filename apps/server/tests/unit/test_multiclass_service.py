"""Actual advancement acceptance, authority and restart recovery boundaries."""
import json
from types import SimpleNamespace

import pytest
from core_table.table import VirtualTable
from database import crud, models
from managers import character_manager
from service import character_update_service
from service.character_update_recovery import CharacterUpdateOutcomeUnknown
from service.multiclass_service import MulticlassIntent, MulticlassService, prepare_multiclass_update
from service.session_operation_receipts import OperationRejected
from sqlalchemy import create_engine, event
from sqlalchemy.orm import Session, sessionmaker


def document(*, level=3):
    return {'character_id': 'hero', 'name': 'Hero', 'schemaVersion': 1, 'data': {
        'class': 'fighter', 'classes': [{'name': 'fighter', 'level': level}], 'level': level,
        'abilityScores': {'strength': 15, 'dexterity': 15, 'intelligence': 14},
        'stats': {'hp': 7, 'maxHp': 20, 'ac': 12}, 'inventory': [{'name': 'Rope'}]}}


@pytest.fixture
def advances(tmp_path, monkeypatch):
    engine = create_engine(f"sqlite:///{tmp_path / 'multiclass.db'}", connect_args={'check_same_thread': False})

    @event.listens_for(engine, 'connect')
    def foreign_keys(connection, _):
        connection.execute('PRAGMA foreign_keys=ON')

    models.Base.metadata.create_all(engine)
    factory = sessionmaker(bind=engine)
    monkeypatch.setattr(character_manager, 'SessionLocal', factory)
    with factory() as db:
        db.add_all([models.User(id=i, username=f'multiclass-{i}', hashed_password='unused') for i in (1, 2, 3)])
        db.flush()
        db.add_all([models.GameSession(id=i, name='Advances', session_code=f'ADVANCE{i}', owner_id=1) for i in (1, 2)])
        db.flush()
        db.add_all([models.GamePlayer(session_id=1, user_id=2, role='co_dm'),
                    models.GamePlayer(session_id=1, user_id=3, role='player')])
        db.add(models.SessionCharacter(session_id=1, character_id='hero', owner_user_id=3,
            character_name='Hero', character_data=json.dumps(document())))
        db.commit()
        table = VirtualTable('Stats', 1000, 1000)
        table.add_entity({'sprite_id': 'hero-token', 'character_id': 'hero', 'hp': 7, 'max_hp': 20, 'ac': 12})
        crud.save_table_to_db(db, table, 1)

    def construct(session_factory=factory):
        manager = character_manager.ServerCharacterManager()
        return manager, MulticlassService(session_factory, manager.stage_character_update,
                                          manager.update_recovery, manager.validate_multiclass)

    def intent(request='original', *, actor=2, target='rogue', version=1, character='hero', session=1):
        data: dict = {'character_id': character, 'new_class': target}
        if version is not None:
            data['version'] = version
        return MulticlassIntent.from_request(session, actor, request, data)

    manager, service = construct()
    yield SimpleNamespace(factory=factory, engine=engine, manager=manager, service=service,
                          construct=construct, intent=intent)
    engine.dispose()


def state(scope):
    with scope.factory() as db:
        source = db.query(models.SessionCharacter).one()
        return (source.version, json.loads(source.character_data),
                [(row.hp, row.max_hp, row.ac) for row in db.query(models.Entity)],
                db.query(models.CharacterLog).count(), db.query(models.SessionOperationReceipt).count())


def test_original_advance_accepts_once_after_manager_restart_and_keeps_unrelated_state(advances):
    accepted = advances.service.execute(advances.intent())
    assert accepted['success'] and accepted['accepted_version'] == 2 and accepted['accepted_level'] == 4
    after = state(advances)
    _, restarted = advances.construct()
    replay = restarted.execute(advances.intent(target=' ROGUE '))
    assert replay['replayed'] and replay['version'] == 2 and replay['new_class'] == 'rogue'
    assert state(advances) == after
    assert after[1]['data']['inventory'] == [{'name': 'Rope'}] and after[2] == [(7, 20, 12)]
    with advances.factory() as db:
        assert db.query(models.CharacterLog).filter_by(action_type='multiclass').count() == 1
        receipt = db.query(models.SessionOperationReceipt).one().result_json
        assert 'character_data' not in receipt and 'classes' not in receipt


def test_old_receipt_reads_later_source_and_current_per_token_projections_without_repair(advances):
    advances.service.execute(advances.intent())
    assert advances.service.execute(advances.intent('next', target='wizard', version=2))['success']
    with advances.factory() as db:
        db.query(models.Entity).one().hp = 0
        db.commit()
    before = state(advances)
    replay = advances.service.execute(advances.intent())
    assert replay['accepted_level'] == 4 and replay['version'] == 3
    assert replay['character_data']['data']['level'] == 5 and replay['token_updates'][0]['stats']['hp'] == 0
    assert state(advances) == before


@pytest.mark.parametrize('change', ['class', 'version', 'character'])
def test_changed_input_cannot_reuse_original_identity(advances, change):
    advances.service.execute(advances.intent())
    if change == 'character':
        with advances.factory() as db:
            db.add(models.SessionCharacter(session_id=1, character_id='other', owner_user_id=3,
                character_name='Other', character_data=json.dumps({**document(), 'character_id': 'other'})))
            db.commit()
    options = {'target': 'wizard'} if change == 'class' else {'version': 2} if change == 'version' else {'character': 'other'}
    result = advances.service.execute(advances.intent(**options))
    assert not result['success'] and result['code'] == 'conflict'


@pytest.mark.parametrize('actor', [1, 2, 3])
def test_current_session_dm_or_character_owner_can_advance(advances, actor):
    assert advances.service.execute(advances.intent(actor=actor))['success']


def test_receipt_disclosure_requires_current_grant_after_dm_revocation(advances):
    advances.service.execute(advances.intent())
    with advances.factory() as db:
        db.query(models.GamePlayer).filter_by(user_id=2).one().role = 'player'
        db.commit()
    denied = advances.service.execute(advances.intent())
    assert denied['code'] == 'forbidden' and 'accepted_level' not in denied and 'character_data' not in denied
    with advances.factory() as db:
        db.add(models.CharacterPermission(character_id='hero', session_id=1, user_id=2,
            can_view=True, can_edit=True, can_control=False, granted_by=3))
        db.commit()
    assert advances.service.execute(advances.intent())['replayed']


@pytest.mark.parametrize('version,session', [(99, 1), (1, 2)])
def test_stale_version_or_foreign_session_cannot_change_source(advances, version, session):
    before = state(advances)
    assert not advances.service.execute(advances.intent(version=version, session=session))['success']
    assert state(advances) == before


@pytest.mark.parametrize('flat', [False, True])
def test_legacy_primary_levels_are_preserved_and_flat_advancement_is_canonicalized(advances, flat):
    source = document()
    del source['data']['classes']
    if flat:
        source = {**source['data'], 'character_id': 'hero', 'name': 'Hero', 'schemaVersion': 1}
    with advances.factory() as db:
        db.query(models.SessionCharacter).one().character_data = json.dumps(source)
        db.commit()
    result = advances.service.execute(advances.intent())
    assert result['success'] and result['character_data']['data']['classes'] == [
        {'name': 'fighter', 'level': 3}, {'name': 'rogue', 'level': 1}]
    assert result['character_data']['data']['level'] == 4
    assert advances.service.execute(advances.intent('later', target='wizard', version=2))['success']


@pytest.mark.parametrize('problem', ['prerequisite', 'cap', 'split', 'duplicate', 'ambiguous_primary', 'same_primary'])
def test_invalid_or_ambiguous_advancement_leaves_all_state_unchanged(advances, problem):
    source = document(level=20 if problem == 'cap' else 3)
    if problem == 'prerequisite':
        source['data']['abilityScores']['dexterity'] = 8
    elif problem == 'split':
        source['data']['level'] = 5
    elif problem == 'duplicate':
        source['data']['classes'] = [{'name': 'rogue', 'level': 3}]
    elif problem in ('ambiguous_primary', 'same_primary'):
        source['data'].pop('classes')
        source['data']['class'] = 'fighter/wizard' if problem == 'ambiguous_primary' else 'rogue'
    with advances.factory() as db:
        db.query(models.SessionCharacter).one().character_data = json.dumps(source)
        db.commit()
    before = state(advances)
    result = advances.service.execute(advances.intent())
    assert not result['success'] and result['not_accepted']
    assert state(advances) == before


def test_audit_receipt_version_and_projections_rollback_together(advances, monkeypatch):
    before = state(advances)
    stage = character_update_service.stage_receipt

    def fail(*args):
        stage(*args)
        raise OSError('After source/audit/receipt flush')

    monkeypatch.setattr(character_update_service, 'stage_receipt', fail)
    result = advances.service.execute(advances.intent())
    assert not result['success'] and result['not_accepted'] and state(advances) == before


@pytest.mark.parametrize('committed', [False, True])
@pytest.mark.parametrize('outage', [False, True])
def test_lost_commit_response_retains_shared_recovery_until_current_installation(advances, monkeypatch, committed, outage):
    class LostResponse(Session):
        def commit(self):
            if committed:
                super().commit()
            raise OSError('Commit response lost')

    manager, service = advances.construct(sessionmaker(bind=advances.engine, class_=LostResponse))
    recovery, lookup = manager.update_recovery, manager.update_recovery._lookup
    if outage:
        def offline(_attempt):
            raise OSError('Lookup unavailable')
        monkeypatch.setattr(recovery, '_lookup', offline)
        with pytest.raises(CharacterUpdateOutcomeUnknown):
            service.execute(advances.intent())
        monkeypatch.setattr(recovery, '_lookup', lookup)
    else:
        result = service.execute(advances.intent())
        assert result['success'] is committed and result['recovery_required']
    assert recovery.has_pending(1)
    resolved = recovery.resolve(1)
    assert resolved is not None and resolved.committed is committed and resolved.current_result is not None
    assert resolved.attempt.operation is not None and resolved.attempt.operation.domain == 'character_multiclass'
    recovery.complete(resolved)
    assert advances.service.execute(advances.intent())['success'] and state(advances)[0] == 2


@pytest.mark.parametrize('data', [
    {'character_id': 'hero'}, {'character_id': 'hero', 'new_class': 'unknown'},
    {'character_id': 'hero', 'new_class': 'rogue', 'version': True},
    {'character_id': 'hero', 'new_class': 'rogue', 'version': 0},
    {'character_id': 'hero', 'new_class': 'rogue', 'user_id': 1},
])
def test_invalid_original_intent_is_rejected_before_sql(data):
    with pytest.raises(OperationRejected):
        MulticlassIntent.from_request(1, 1, 'original', data)


def test_preparation_is_detached_and_preserves_pinned_fighter_or_rule(advances):
    source = document()
    source['data'].update({'class': 'wizard', 'classes': [{'name': 'wizard', 'level': 3}]})
    source['data']['abilityScores']['strength'] = 8
    before = json.loads(json.dumps(source))
    patch = prepare_multiclass_update(source, 'fighter', advances.manager.validate_multiclass)
    assert patch['data']['classes'][-1] == {'name': 'fighter', 'level': 1}
    assert source == before
