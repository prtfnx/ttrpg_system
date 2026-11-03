from contextlib import contextmanager
from types import SimpleNamespace

import pytest
from core_table.table import VirtualTable
from database import crud, models, schemas
from service import table_settings_service
from service.session_operation_receipts import OperationOutcomeUnknown, OperationRejected
from service.table_settings_service import TableSettingsIntent, TableSettingsService
from sqlalchemy import create_engine, event
from sqlalchemy.orm import Session, sessionmaker


@pytest.fixture
def settings(tmp_path):
    engine = create_engine(f"sqlite:///{tmp_path / 'settings.db'}", connect_args={'check_same_thread': False})

    @event.listens_for(engine, 'connect')
    def foreign_keys(connection, _):
        connection.execute('PRAGMA foreign_keys=ON')

    models.Base.metadata.create_all(engine)
    factory = sessionmaker(bind=engine)
    table, foreign = VirtualTable('Settings', 1000, 1000), VirtualTable('Foreign', 1000, 1000)
    table.add_entity({'sprite_id': 'kept-token', 'name': 'Unchanged'})
    with factory() as db:
        db.add_all([models.User(id=i, username=f'settings-{i}', hashed_password='unused') for i in (1, 2)])
        db.flush()
        db.add_all([models.GameSession(id=i, name='Settings', session_code=f'SETTING{i}', owner_id=1) for i in (1, 2)])
        db.flush()
        db.add(models.GamePlayer(session_id=1, user_id=2, role='co_dm'))
        db.commit()
        crud.save_table_to_db(db, table, 1)
        crud.save_table_to_db(db, foreign, 2)

    def intent(request='settings-original', actor=2, target=str(table.table_id), **patch):
        return TableSettingsIntent.create(1, actor, request, {'table_id': target, **(patch or {'grid_cell_px': 75})})

    yield SimpleNamespace(engine=engine, factory=factory, table=table, table_id=str(table.table_id), foreign=foreign,
                          service=TableSettingsService(factory), intent=intent)
    engine.dispose()


def test_patch_receipt_and_revision_accept_once_and_replay_reads_current_state(settings):
    accepted = settings.service.execute(settings.intent())
    assert accepted.settings is not None and accepted.settings['settings_revision'] == 1
    assert accepted.receipt['changed'] and accepted.receipt['accepted_revision'] == 1
    settings.service.execute(settings.intent('later', grid_cell_px=90, background_color_hex='#ABCDEF'))
    replay = TableSettingsService(settings.factory).execute(settings.intent())
    assert replay.replayed and replay.receipt == accepted.receipt
    assert replay.settings is not None and replay.settings['grid_cell_px'] == 90
    assert replay.settings['settings_revision'] == 2 and replay.settings['background_color_hex'] == '#abcdef'
    with settings.factory() as db:
        assert db.query(models.SessionOperationReceipt).count() == 2
        assert db.query(models.Entity).one().name == 'Unchanged'
        assert db.query(models.VirtualTable).filter_by(table_id=settings.table_id).one().width == 1000


def test_noop_still_has_durable_identity_without_incrementing_revision(settings):
    intent = settings.intent(grid_cell_px=50)
    assert not settings.service.execute(intent).receipt['changed']
    assert TableSettingsService(settings.factory).execute(intent).replayed
    with settings.factory() as db:
        assert db.query(models.SessionOperationReceipt).count() == 1
        assert db.query(models.VirtualTable).filter_by(table_id=settings.table_id).one().settings_revision == 0
    with pytest.raises(OperationRejected, match='different input'):
        settings.service.execute(settings.intent())


def test_scope_authority_and_dirty_source_are_checked_before_acceptance(settings):
    with pytest.raises(OperationRejected, match='not found'):
        settings.service.execute(settings.intent(target=str(settings.foreign.table_id)))
    with pytest.raises(OperationRejected, match='Resolve table persistence'):
        settings.service.execute(settings.intent(), target_dirty=True)
    settings.service.execute(settings.intent())
    with settings.factory() as db:
        db.query(models.GamePlayer).one().role = 'player'
        db.commit()
    with pytest.raises(OperationRejected, match='DM authority'):
        settings.service.execute(settings.intent())
    recovered = settings.service.resolve(settings.intent(), internal_recovery=True)
    assert recovered is not None and not recovered.actor_authorized


def test_receipt_replay_after_deletion_does_not_recreate_table(settings):
    intent = settings.intent()
    settings.service.execute(intent)
    with settings.factory() as db:
        crud.delete_virtual_table(db, settings.table_id)
    replay = TableSettingsService(settings.factory).execute(intent)
    assert replay.replayed and replay.settings is None
    with pytest.raises(OperationRejected, match='deleted'):
        settings.service.execute(settings.intent('new-settings'))


def test_revision_survives_actor_cleanup_and_other_crud_settings_updates(settings):
    settings.service.execute(settings.intent())
    with settings.factory() as db:
        db.query(models.GamePlayer).filter_by(user_id=2).delete()
        db.query(models.User).filter_by(id=2).delete()
        db.commit()
        table = crud.update_virtual_table(db, settings.table_id, schemas.VirtualTableUpdate(grid_enabled=False))
        assert table is not None and table.settings_revision == 2
    recovered = settings.service.resolve(settings.intent(), internal_recovery=True)
    assert recovered is not None and not recovered.actor_authorized and recovered.settings is not None
    assert recovered.settings['settings_revision'] == 2
    accepted = settings.service.execute(settings.intent('owner-after-cleanup', actor=1))
    assert accepted.settings is not None and accepted.settings['settings_revision'] == 2
    assert not accepted.receipt['changed']


def test_settings_receipt_and_revision_rollback_after_flush(settings, monkeypatch):
    stage = table_settings_service.stage_receipt

    def fail(*args):
        stage(*args)
        raise RuntimeError('After settings/receipt flush')

    monkeypatch.setattr(table_settings_service, 'stage_receipt', fail)
    with pytest.raises(OperationRejected, match='could not be saved'):
        settings.service.execute(settings.intent())
    with settings.factory() as db:
        table = db.query(models.VirtualTable).filter_by(table_id=settings.table_id).one()
        assert (table.grid_cell_px, table.settings_revision) == (50, 0)
        assert db.query(models.SessionOperationReceipt).count() == 0


@pytest.mark.parametrize('committed', [False, True])
@pytest.mark.parametrize('lookup_outage', [False, True])
def test_lost_commit_response_and_unavailable_lookup_settle_original_intent(settings, committed, lookup_outage):
    class LostResponse(Session):
        def commit(self):
            if committed:
                super().commit()
            raise RuntimeError('Commit response lost')

    calls = 0

    @contextmanager
    def factory():
        nonlocal calls
        calls += 1
        if calls == 2 and lookup_outage:
            raise RuntimeError('Lookup unavailable')
        current = sessionmaker(bind=settings.engine, class_=LostResponse) if calls == 1 else settings.factory
        with current() as db:
            yield db

    service = TableSettingsService(factory)
    if lookup_outage:
        with pytest.raises(OperationOutcomeUnknown):
            service.execute(settings.intent())
    elif committed:
        assert service.execute(settings.intent()).replayed
    else:
        with pytest.raises(OperationRejected, match='did not commit'):
            service.execute(settings.intent())
    settings.service.execute(settings.intent())
    with settings.factory() as db:
        assert db.query(models.SessionOperationReceipt).count() == 1
        assert db.query(models.VirtualTable).filter_by(table_id=settings.table_id).one().settings_revision == 1


@pytest.mark.parametrize('patch', [{'grid_cell_px': True}, {'cell_distance': float('inf')}, {'cell_distance': 0},
    {'ambient_light_level': float('nan')}, {'grid_cell_px': '75'}, {'grid_enabled': None}, {'grid_enabled': 1},
    {'distance_unit': 'yards'}, {'fog_exploration_mode': []}, {'grid_color_hex': 'red'}, {'settings_revision': 100},
    {'user_id': 1}, {'width': 2000}])
def test_invalid_or_unowned_fields_reject_before_storage(patch):
    with pytest.raises(OperationRejected):
        TableSettingsIntent.create(1, 1, 'original', {'table_id': '550e8400-e29b-41d4-a716-446655440000', **patch})
