import json
from types import SimpleNamespace

import pytest
from core_table.table import VirtualTable
from database import crud, models
from managers import character_manager
from service import character_update_service
from service.character_update_recovery import CharacterUpdateOutcomeUnknown
from service.character_update_service import CharacterUpdateIntent, CharacterUpdateService
from sqlalchemy import create_engine, event
from sqlalchemy.orm import Session, sessionmaker


@pytest.fixture
def updates(tmp_path, monkeypatch):
    engine = create_engine(f"sqlite:///{tmp_path / 'character-receipts.db'}", connect_args={'check_same_thread': False})

    @event.listens_for(engine, 'connect')
    def foreign_keys(connection, _):
        connection.execute('PRAGMA foreign_keys=ON')

    models.Base.metadata.create_all(engine)
    factory = sessionmaker(bind=engine)
    monkeypatch.setattr(character_manager, 'SessionLocal', factory)
    table, foreign = VirtualTable('Own', 1000, 1000), VirtualTable('Foreign', 1000, 1000)
    with factory() as db:
        db.add_all([models.User(id=i, username=f'update-{i}', hashed_password='unused') for i in (1, 2, 3)])
        db.flush()
        db.add_all([models.GameSession(id=i, name='Characters', session_code=f'UPDATE{i}', owner_id=1) for i in (1, 2)])
        db.flush()
        db.add_all([models.GamePlayer(session_id=1, user_id=2, role='co_dm'),
                    models.GamePlayer(session_id=1, user_id=3, role='player')])
        db.add(models.SessionCharacter(character_id='hero', session_id=1, owner_user_id=3, character_name='Hero',
            character_data=json.dumps({'character_id': 'hero', 'name': 'Hero', 'schemaVersion': 1,
                                       'data': {'stats': {'hp': 20, 'maxHp': 20, 'ac': 12}}})))
        db.commit()
        for scene, session_id, hp in ((table, 1, 20), (foreign, 2, 99)):
            scene.add_entity({'sprite_id': f'token-{session_id}', 'character_id': 'hero', 'hp': hp, 'max_hp': 20, 'ac': 12})
            crud.save_table_to_db(db, scene, session_id)

    def construct(session_factory=factory):
        manager = character_manager.ServerCharacterManager()
        return manager, CharacterUpdateService(session_factory, manager.stage_character_update, manager.update_recovery)

    def intent(request='original-update', *, actor=2, version=1, patch=None, character='hero'):
        return CharacterUpdateIntent.create(1, actor, request, character,
            patch if patch is not None else {'data': {'stats': {'hp': 5}}}, version)

    manager, service = construct()
    yield SimpleNamespace(engine=engine, factory=factory, manager=manager, service=service, construct=construct, intent=intent)
    engine.dispose()


def state(updates):
    with updates.factory() as db:
        source = db.query(models.SessionCharacter).one()
        return (source.version, json.loads(source.character_data),
                {row.sprite_id: (row.hp, row.max_hp, row.ac) for row in db.query(models.Entity)},
                db.query(models.CharacterLog).count(), db.query(models.SessionOperationReceipt).count())


def test_original_update_accepts_once_across_manager_restart_and_keeps_foreign_tokens(updates):
    accepted = updates.service.execute(updates.intent())
    assert accepted['success'] and accepted['accepted_version'] == 2 and not accepted['replayed']
    before = state(updates)
    _, restarted = updates.construct()
    replay = restarted.execute(updates.intent())
    assert replay['replayed'] and replay['version'] == 2 and replay['accepted_version'] == 2
    assert state(updates) == before
    assert before[2] == {'token-1': (5, 20, 12), 'token-2': (99, 20, 12)}
    assert before[3] > 0 and before[4] == 1


def test_old_receipt_reads_current_source_and_each_persisted_projection_without_repairing_it(updates):
    updates.service.execute(updates.intent())
    updates.service.execute(updates.intent('later', version=2, patch={'data': {'stats': {'hp': 9}}}))
    with updates.factory() as db:
        db.query(models.Entity).filter_by(sprite_id='token-1').one().hp = 0
        db.commit()
    before = state(updates)
    _, restarted = updates.construct()
    replay = restarted.execute(updates.intent())
    assert replay['accepted_version'] == 2 and replay['version'] == 3
    assert replay['character_data']['data']['stats']['hp'] == 9
    assert replay['token_updates'][0]['stats']['hp'] == 0
    assert state(updates) == before


@pytest.mark.parametrize('change', ['patch', 'version', 'character'])
def test_reused_identity_cannot_accept_different_input(updates, change):
    updates.service.execute(updates.intent())
    options = {'patch': {'data': {'stats': {'hp': 9}}}} if change == 'patch' else {'version': 2}
    if change == 'character':
        with updates.factory() as db:
            db.add(models.SessionCharacter(character_id='other', session_id=1, owner_user_id=3,
                                           character_name='Other', character_data='{}'))
            db.commit()
        options = {'character': 'other'}
    result = updates.service.execute(updates.intent(**options))
    assert not result['success'] and result['code'] == 'conflict'
    with updates.factory() as db:
        assert db.query(models.SessionOperationReceipt).count() == 1


def test_current_authority_is_checked_before_disclosing_a_retained_receipt(updates):
    updates.service.execute(updates.intent())
    with updates.factory() as db:
        db.query(models.GamePlayer).filter_by(user_id=2).one().role = 'player'
        db.commit()
    replay = updates.service.execute(updates.intent())
    assert not replay['success'] and replay['code'] == 'forbidden'
    assert 'accepted_version' not in replay and 'character_data' not in replay


def test_character_owner_and_current_edit_grants_are_supported_without_dm_bypass(updates):
    assert updates.service.execute(updates.intent(actor=3))['success']
    with updates.factory() as db:
        db.query(models.GamePlayer).filter_by(user_id=2).one().role = 'player'
        db.add(models.CharacterPermission(character_id='hero', session_id=1, user_id=2,
            can_view=True, can_edit=True, can_control=False, granted_by=3))
        db.commit()
    assert updates.service.execute(updates.intent('granted', version=2))['success']
    with updates.factory() as db:
        db.query(models.CharacterPermission).delete()
        db.commit()
    assert updates.service.execute(updates.intent('granted', version=2))['code'] == 'forbidden'


def test_receipt_audit_source_version_permissions_and_projections_rollback_together(updates, monkeypatch):
    stage = character_update_service.stage_receipt

    def fail(*args):
        stage(*args)
        raise RuntimeError('After character/permission/projection/receipt flush')

    monkeypatch.setattr(character_update_service, 'stage_receipt', fail)
    before = state(updates)
    result = updates.service.execute(updates.intent(patch={'controlledBy': [2], 'data': {'stats': {'hp': 0}}}))
    assert not result['success'] and result['not_accepted'] and result['code'] == 'persistence_failed'
    assert state(updates) == before
    with updates.factory() as db:
        assert db.query(models.CharacterPermission).count() == 0
    assert not updates.manager.update_recovery.has_pending(1)


def test_late_sharing_denial_cannot_commit_a_provisional_source_version(updates):
    before = state(updates)
    result = updates.service.execute(updates.intent(patch={'controlledBy': [999999], 'data': {'stats': {'hp': 0}}}))
    assert not result['success'] and result['not_accepted']
    assert state(updates) == before


@pytest.mark.parametrize('committed', [False, True])
@pytest.mark.parametrize('outage', [False, True])
def test_commit_response_loss_uses_receipt_settlement_and_retains_cache_ownership(updates, monkeypatch, committed, outage):
    class LostResponse(Session):
        def commit(self):
            if committed:
                super().commit()
            raise RuntimeError('Commit response lost')

    manager, service = updates.construct(sessionmaker(bind=updates.engine, class_=LostResponse))
    recovery, original_lookup = manager.update_recovery, manager.update_recovery._lookup
    if outage:
        def offline(_attempt):
            raise OSError('Lookup unavailable')
        monkeypatch.setattr(recovery, '_lookup', offline)
        with pytest.raises(CharacterUpdateOutcomeUnknown):
            service.execute(updates.intent())
        monkeypatch.setattr(recovery, '_lookup', original_lookup)
    else:
        result = service.execute(updates.intent())
        assert result['success'] is committed and result['recovery_required']
    assert recovery.has_pending(1)
    resolved = recovery.resolve(1)
    assert resolved is not None and resolved.committed is committed and resolved.current_result is not None
    assert resolved.current_result['version'] == (2 if committed else 1)
    recovery.complete(resolved)
    replay = updates.service.execute(updates.intent())
    assert replay['success'] and state(updates)[0] == 2 and state(updates)[4] == 1


def test_receipt_survives_source_archival_without_reapplying_the_patch(updates):
    from utils.time import utc_now

    updates.service.execute(updates.intent())
    with updates.factory() as db:
        db.query(models.SessionCharacter).one().archived_at = utc_now()
        db.commit()
    replay = updates.service.execute(updates.intent())
    assert replay['success'] and replay['character_archived'] and replay['version'] == 2
    assert state(updates)[4] == 1


@pytest.mark.parametrize('version,patch', [(True, {'name': 'Hero'}), (0, {'name': 'Hero'}),
    (1, {}), (1, {'data': {'stats': {'hp': float('nan')}}}), (1, {'description': 'x' * (512 * 1024)})])
def test_invalid_identity_or_payload_is_rejected_before_storage(version, patch):
    with pytest.raises(ValueError):
        CharacterUpdateIntent.create(1, 1, 'original', 'hero', patch, version)
