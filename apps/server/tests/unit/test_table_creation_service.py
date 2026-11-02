import json
from contextlib import contextmanager
from types import SimpleNamespace

import pytest
from core_table.table import VirtualTable
from database import crud, models
from service import table_creation_service
from service.session_operation_receipts import OperationOutcomeUnknown, OperationRejected
from service.table_creation_service import TableCreateIntent, TableCreationService
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker


@pytest.fixture
def creation(tmp_path):
    engine = create_engine(f"sqlite:///{tmp_path / 'tables.db'}", connect_args={'check_same_thread': False})
    models.Base.metadata.create_all(engine)
    factory = sessionmaker(bind=engine)
    with factory() as db:
        db.add_all([models.User(id=i, username=f'table-{i}', email=f'table-{i}@example.com', hashed_password='unused')
                    for i in (1, 2, 3)])
        db.flush()
        db.add_all([models.GameSession(id=i, name='Tables', session_code=f'TABLE{i}', owner_id=1, is_active=True)
                    for i in (1, 2)])
        db.flush()
        db.add(models.GamePlayer(session_id=1, user_id=2, role='co_dm'))
        db.commit()

    def intent(request='create-original', actor=1, session=1, **payload):
        return TableCreateIntent.create(session, actor, request, dict(table_name='Scene', **payload))

    yield SimpleNamespace(engine=engine, factory=factory, service=TableCreationService(factory), intent=intent)
    engine.dispose()


def test_one_table_and_paint_state_from_same_intent_across_service_restart(creation):
    first = creation.service.execute(creation.intent(local_table_id='local-draft'))
    assert not first.replayed and first.snapshot is not None
    restarted = TableCreationService(creation.factory)
    replay = restarted.execute(creation.intent(local_table_id='local-draft'))
    assert replay.replayed and replay.receipt == first.receipt
    assert replay.snapshot == first.snapshot
    creation.service.execute(creation.intent('another-create'))
    with creation.factory() as db:
        assert db.query(models.VirtualTable).count() == db.query(models.PaintState).count() == 2
        assert db.query(models.SessionOperationReceipt).count() == 2


def test_changed_intent_cannot_overwrite_or_create_another_table(creation):
    creation.service.execute(creation.intent())
    with pytest.raises(OperationRejected, match='different input'):
        creation.service.execute(creation.intent(width=1000))
    with creation.factory() as db:
        assert db.query(models.VirtualTable).one().width == 2000


def test_receipt_replay_reads_current_table_and_survives_later_delete(creation):
    intent = creation.intent()
    creation.service.execute(intent)
    with creation.factory() as db:
        db.query(models.VirtualTable).one().name = 'Renamed'
        db.commit()
    replay = creation.service.execute(intent)
    assert replay.snapshot is not None and replay.snapshot['table_name'] == 'Renamed'
    with creation.factory() as db:
        assert crud.delete_virtual_table(db, intent.table_id)
    replay = creation.service.execute(intent)
    assert replay.replayed and replay.snapshot is None
    with creation.factory() as db:
        assert db.query(models.VirtualTable).count() == 0 and db.query(models.SessionOperationReceipt).count() == 1


def test_current_authority_is_required_before_replay_and_internal_recovery_does_not_expose_it(creation):
    intent = creation.intent(actor=2)
    creation.service.execute(intent)
    with creation.factory() as db:
        db.query(models.GamePlayer).one().role = 'player'
        db.commit()
    with pytest.raises(OperationRejected, match='DM authority'):
        creation.service.execute(intent)
    recovered = creation.service.resolve(intent, internal_recovery=True)
    assert recovered is not None and not recovered.actor_authorized


def test_copy_creates_new_global_identities_and_replay_ignores_changed_or_deleted_source(creation):
    source = VirtualTable('Source', 1000, 1000)
    sprite = source.add_entity({'sprite_id': 'original-token', 'name': 'Hidden', 'layer': 'dungeon_master'})
    with creation.factory() as db:
        crud.save_table_to_db(db, source, 1)
    intent = creation.intent(source_table_id=str(source.table_id))
    first = creation.service.execute(intent, source.to_dict())
    with creation.factory() as db:
        copied = db.query(models.Entity).filter(models.Entity.sprite_id != sprite.sprite_id).one()
        assert copied.name == 'Hidden' and copied.sprite_id != sprite.sprite_id
        assert crud.delete_virtual_table(db, str(source.table_id))
    replay = creation.service.execute(intent, source_dirty=True)
    assert replay.replayed and replay.receipt == first.receipt
    with creation.factory() as db:
        assert db.query(models.VirtualTable).count() == 1


def test_copy_rejects_foreign_session_and_unconfirmed_source(creation):
    source = VirtualTable('Source', 1000, 1000)
    with creation.factory() as db:
        crud.save_table_to_db(db, source, 2)
    with pytest.raises(OperationRejected, match='Source table not found'):
        creation.service.execute(creation.intent(source_table_id=str(source.table_id)))
    own = creation.intent('own-copy', session=2, source_table_id=str(source.table_id))
    with pytest.raises(OperationRejected, match='Resolve source'):
        creation.service.execute(own, source_dirty=True)


@pytest.mark.parametrize('source_session,allowed', [(1, True), (2, False)])
def test_import_rechecks_character_scope_and_copies_canonical_zero_and_null(creation, source_session, allowed):
    with creation.factory() as db:
        db.add(models.SessionCharacter(character_id='hero', session_id=source_session, owner_user_id=3,
            character_name='Hero', character_data=json.dumps({'character_id': 'hero', 'name': 'Hero',
                'data': {'stats': {'hp': 0, 'maxHp': 20, 'ac': None}}})))
        db.commit()
    initial = VirtualTable('Import', 1000, 1000)
    initial.add_entity({'sprite_id': 'linked', 'character_id': 'hero', 'hp': 99, 'ac': 15})
    intent = creation.intent(table_data=initial.to_dict())
    if allowed:
        creation.service.execute(intent)
        with creation.factory() as db:
            entity = db.query(models.Entity).one()
            assert (entity.hp, entity.max_hp, entity.ac) == (0, 20, None)
            assert db.query(models.SessionCharacter).one().version == 1
    else:
        with pytest.raises(OperationRejected):
            creation.service.execute(intent)
        with creation.factory() as db:
            assert db.query(models.VirtualTable).count() == db.query(models.SessionOperationReceipt).count() == 0


def test_table_snapshot_and_receipt_rollback_together_after_flush(creation, monkeypatch):
    stage = table_creation_service.stage_receipt

    def fail(*args):
        stage(*args)
        raise RuntimeError('After table and receipt flush')

    monkeypatch.setattr(table_creation_service, 'stage_receipt', fail)
    with pytest.raises(OperationRejected, match='could not be saved'):
        creation.service.execute(creation.intent())
    with creation.factory() as db:
        assert db.query(models.VirtualTable).count() == db.query(models.PaintState).count() == db.query(models.SessionOperationReceipt).count() == 0


@pytest.mark.parametrize('committed', [False, True])
@pytest.mark.parametrize('lookup_outage', [False, True])
def test_commit_response_loss_and_lookup_outage_keep_one_original_intent(creation, committed, lookup_outage):
    class LostResponse(Session):
        def commit(self):
            if committed:
                super().commit()
            raise RuntimeError('Commit response lost')

    calls = 0

    @contextmanager
    def failing_factory():
        nonlocal calls
        calls += 1
        if calls == 2 and lookup_outage:
            raise RuntimeError('Lookup unavailable')
        factory = sessionmaker(bind=creation.engine, class_=LostResponse) if calls == 1 else creation.factory
        with factory() as db:
            yield db

    service = TableCreationService(failing_factory)
    if lookup_outage:
        with pytest.raises(OperationOutcomeUnknown):
            service.execute(creation.intent())
    elif committed:
        assert service.execute(creation.intent()).replayed
    else:
        with pytest.raises(OperationRejected, match='not committed'):
            service.execute(creation.intent())
    creation.service.execute(creation.intent())
    with creation.factory() as db:
        assert db.query(models.VirtualTable).count() == db.query(models.PaintState).count() == db.query(models.SessionOperationReceipt).count() == 1


@pytest.mark.parametrize('data', [{'width': True}, {'height': 499}, {'width': float('nan')},
    {'table_name': ''}, {'source_table_id': 'not-a-table'}, {'local_table_id': 'x' * 129},
    {'table_data': {'layers': {'tokens': [{}] * 5001}}}, {'table_data': {'metadata': float('nan')}},
    {'user_id': 99}])
def test_create_input_is_bounded_before_acceptance(data):
    with pytest.raises(OperationRejected):
        TableCreateIntent.create(1, 1, 'request', {'table_name': 'Scene', **data})
