import asyncio
import copy
import threading
from contextlib import contextmanager
from types import SimpleNamespace
from unittest.mock import AsyncMock

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
    assert settings.service.execute(settings.intent(grid_cell_px=75.0)).replayed
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


def test_legacy_nullable_settings_produce_a_valid_current_outcome(settings):
    from core_table.protocol import Message, MessageType

    with settings.factory() as db:
        table = db.query(models.VirtualTable).filter_by(table_id=settings.table_id).one()
        for field in ('fog_exploration_mode', 'distance_unit', 'grid_color_hex', 'background_color_hex'):
            setattr(table, field, None)
        db.commit()
    accepted = settings.service.execute(settings.intent())
    assert accepted.settings is not None
    Message.from_json(Message(MessageType.TABLE_SETTINGS_CHANGED,
                              {**accepted.receipt, **accepted.settings, 'replayed': False}).to_json())
    assert accepted.settings['distance_unit'] == 'ft' and accepted.settings['grid_color_hex'] == '#ffffff'


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


@pytest.fixture
def dispatch(settings):
    from core_table.protocol import Message
    from core_table.server import TableManager
    from service.server_protocol import ServerProtocol

    context = SimpleNamespace(game_session_db_id=1, session_code='SETTING1',
                              client_info={'dm': {'user_id': 2, 'role': 'co_dm'}})
    proto = ServerProtocol(TableManager(True), session_manager=context)
    proto.table_manager.add_table(settings.table)
    proto._table_settings_service = lambda: settings.service
    proto.send_to_client = AsyncMock()
    proto.broadcast_to_session = AsyncMock()

    async def send(message):
        await proto.handle_client(Message.from_json(message.to_json()), 'dm')
        sender = proto.send_to_client
        assert isinstance(sender, AsyncMock)
        return Message.from_json(sender.call_args.args[0].to_json())

    return SimpleNamespace(proto=proto, send=send)


@pytest.mark.asyncio
async def test_dispatch_receipt_replay_keeps_current_settings_and_later_deleted_state(settings, dispatch):
    from core_table.protocol import Message, MessageType

    original = Message(MessageType.TABLE_SETTINGS_UPDATE, {'table_id': settings.table_id, 'grid_cell_px': 75})
    first = await dispatch.send(original)
    assert first.type == MessageType.TABLE_SETTINGS_CHANGED and first.data['settings_revision'] == 1
    later = Message(MessageType.TABLE_SETTINGS_UPDATE, {'table_id': settings.table_id, 'grid_cell_px': 90})
    assert (await dispatch.send(later)).data['settings_revision'] == 2
    replay = await dispatch.send(original)
    assert replay.data['replayed'] and replay.data['grid_cell_px'] == settings.table.grid_cell_px == 90
    with settings.factory() as db:
        crud.delete_virtual_table(db, settings.table_id)
    replay = await dispatch.send(original)
    assert replay.data['table_deleted'] and 'grid_cell_px' not in replay.data
    assert settings.table_id not in dispatch.proto.table_manager.tables_id


@pytest.mark.asyncio
@pytest.mark.parametrize('committed', [False, True])
async def test_unknown_settings_quarantine_reads_and_snapshots_until_verified(settings, dispatch, committed):
    from core_table.protocol import Message, MessageType

    class LostResponse(Session):
        def commit(self):
            if committed:
                super().commit()
            raise RuntimeError('Commit response lost')

    calls, unavailable = 0, True

    @contextmanager
    def factory():
        nonlocal calls
        calls += 1
        if calls > 1 and unavailable:
            raise RuntimeError('Lookup unavailable')
        current = sessionmaker(bind=settings.engine, class_=LostResponse) if calls == 1 else settings.factory
        with current() as db:
            yield db

    settings.service = TableSettingsService(factory)
    original = Message(MessageType.TABLE_SETTINGS_UPDATE, {'table_id': settings.table_id, 'grid_cell_px': 75})
    assert (await dispatch.send(original)).data['outcome'] == 'unknown'
    assert settings.table.grid_cell_px == 50 and not dispatch.proto.table_manager.persistence_allowed()
    assert not await dispatch.proto.table_manager.save_to_database_async(1)
    assert (await dispatch.send(Message(MessageType.TABLE_LIST_REQUEST, {}))).data['outcome'] == 'unknown'
    unavailable = False
    recovered = await dispatch.send(original)
    if committed:
        assert recovered.data['replayed'] and settings.table.grid_cell_px == 75
    else:
        assert recovered.data['code'] == 'persistence_failed' and settings.table.grid_cell_px == 50
        assert (await dispatch.send(original)).type == MessageType.TABLE_SETTINGS_CHANGED
    assert dispatch.proto.table_manager.persistence_allowed()


@pytest.mark.asyncio
async def test_settings_repeated_cancellation_holds_ownership_through_install_and_publication(settings, dispatch, monkeypatch):
    from core_table.protocol import Message, MessageType

    entered, release = threading.Event(), threading.Event()
    publishing, published = asyncio.Event(), asyncio.Event()
    stage = table_settings_service.stage_receipt
    loop_thread = threading.get_ident()

    def delayed(*args):
        assert threading.get_ident() != loop_thread
        stage(*args)
        entered.set()
        assert release.wait(5)

    async def publish(*_):
        publishing.set()
        await published.wait()

    monkeypatch.setattr(table_settings_service, 'stage_receipt', delayed)
    dispatch.proto.broadcast_to_session = AsyncMock(side_effect=publish)
    request = Message(MessageType.TABLE_SETTINGS_UPDATE, {'table_id': settings.table_id, 'grid_enabled': False})
    task = asyncio.create_task(dispatch.send(request))
    try:
        assert await asyncio.to_thread(entered.wait, 2)
        for _ in range(2):
            task.cancel()
            await asyncio.sleep(0)
        assert dispatch.proto._mutation_lock.locked() and not task.done() and settings.table.grid_enabled
        assert (await dispatch.send(Message(MessageType.PING, {}))).type == MessageType.PONG
        release.set()
        await asyncio.wait_for(publishing.wait(), 3)
        task.cancel()
        await asyncio.sleep(0)
        assert dispatch.proto._mutation_lock.locked() and not task.done() and not settings.table.grid_enabled
    finally:
        release.set()
        published.set()
    with pytest.raises(asyncio.CancelledError):
        await task
    assert (await dispatch.send(request)).data['replayed']


@pytest.mark.asyncio
async def test_install_failure_recovers_current_state_before_rejecting_changed_original_request(settings, dispatch, monkeypatch):
    from core_table.protocol import Message, MessageType

    install = dispatch.proto._install_table_settings
    monkeypatch.setattr(dispatch.proto, '_install_table_settings', AsyncMock(side_effect=RuntimeError('Cache failed')))
    request = Message(MessageType.TABLE_SETTINGS_UPDATE, {'table_id': settings.table_id, 'grid_cell_px': 75})
    assert (await dispatch.send(request)).data['outcome'] == 'unknown'
    monkeypatch.setattr(dispatch.proto, '_install_table_settings', install)
    changed = copy.deepcopy(request)
    changed.data['grid_cell_px'] = 90
    assert (await dispatch.send(changed)).data['code'] == 'conflict'
    assert settings.table.grid_cell_px == 75 and dispatch.proto.table_manager.persistence_allowed()


@pytest.mark.asyncio
async def test_actor_removal_reconciles_cache_without_disclosing_original_receipt(settings, dispatch, monkeypatch):
    from core_table.protocol import Message, MessageType

    install = dispatch.proto._install_table_settings
    monkeypatch.setattr(dispatch.proto, '_install_table_settings', AsyncMock(side_effect=RuntimeError('Cache failed')))
    request = Message(MessageType.TABLE_SETTINGS_UPDATE, {'table_id': settings.table_id, 'grid_cell_px': 75})
    assert (await dispatch.send(request)).data['outcome'] == 'unknown'
    with settings.factory() as db:
        db.query(models.GamePlayer).filter_by(user_id=2).delete()
        db.query(models.User).filter_by(id=2).delete()
        db.commit()
    monkeypatch.setattr(dispatch.proto, '_install_table_settings', install)
    response = await dispatch.send(request)
    assert response.data['code'] == 'forbidden' and 'grid_cell_px' not in response.data
    assert settings.table.grid_cell_px == 75 and dispatch.proto.table_manager.persistence_allowed()
