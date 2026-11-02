import asyncio
import copy
import threading
from contextlib import contextmanager
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from core_table.table import VirtualTable
from database import crud, models, schemas
from service import table_deletion_service
from service.session_operation_receipts import OperationOutcomeUnknown, OperationRejected
from service.table_deletion_service import TableDeleteIntent, TableDeletionService
from sqlalchemy import create_engine, event
from sqlalchemy.orm import Session, sessionmaker


@pytest.fixture
def deletion(tmp_path):
    engine = create_engine(f"sqlite:///{tmp_path / 'deletion.db'}", connect_args={'check_same_thread': False})

    @event.listens_for(engine, 'connect')
    def foreign_keys(connection, _):
        connection.execute('PRAGMA foreign_keys=ON')

    models.Base.metadata.create_all(engine)
    factory = sessionmaker(bind=engine)
    table = VirtualTable('Retired scene', 1000, 1000)
    other = VirtualTable('Kept scene', 1000, 1000)
    table_id = str(table.table_id)
    with factory() as db:
        db.add_all([models.User(id=i, username=f'delete-{i}', email=f'delete-{i}@example.com', hashed_password='unused')
                    for i in (1, 2, 3)])
        db.flush()
        db.add_all([models.GameSession(id=i, name='Deletion', session_code=f'DELETE{i}', owner_id=1, is_active=True)
                    for i in (1, 2)])
        db.flush()
        db.add_all([models.GamePlayer(session_id=1, user_id=i, role='co_dm' if i == 2 else 'player',
                                     active_table_id=table_id) for i in (2, 3)])
        db.add(models.GamePlayer(session_id=2, user_id=3, role='player', active_table_id=str(other.table_id)))
        db.add(models.SessionCharacter(character_id='hero', session_id=1, owner_user_id=3,
                                      character_name='Hero', character_data='{}'))
        db.commit()
        table.add_entity({'sprite_id': 'linked-token', 'character_id': 'hero'})
        crud.save_table_to_db(db, table, 1)
        crud.save_table_to_db(db, other, 2)
        db.add_all([
            models.Wall(wall_id='wall', table_id=table_id, x1=0, y1=0, x2=1, y2=1),
            models.PaintStroke(stroke_id='stroke', table_id=table_id, stroke_data='{}'),
            models.PaintObject(id='paint', table_id=table_id, kind='line', geometry={}, transform={}, style={},
                               created_by=1, z_order=1),
            models.PaintOperationResult(table_id=table_id, actor_id=1, operation_id='paint-request',
                                        request_hash='a' * 64, result_json={}),
            models.CanvasCommandJournal(table_id=table_id, actor_id=1, operation_id='canvas-request',
                                        kind='paint', state='accepted', request_hash='b' * 64, result_json={}),
            models.SharedMeasurement(table_id=table_id, measurement_id='measure', created_by=1,
                                     kind='line', measurement_data='{}'),
        ])
        db.commit()

    def intent(request='delete-original', actor=2, session=1, target=table_id):
        return TableDeleteIntent.create(session, actor, request, {'table_id': target})

    yield SimpleNamespace(engine=engine, factory=factory, table=table, table_id=table_id,
                          other=other, service=TableDeletionService(factory), intent=intent)
    engine.dispose()


def test_atomic_deletion_removes_dependencies_and_pointers_but_keeps_character_and_other_session(deletion):
    accepted = deletion.service.execute(deletion.intent())
    assert accepted.receipt['success'] and not accepted.replayed
    with deletion.factory() as db:
        assert db.query(models.VirtualTable).one().table_id == str(deletion.other.table_id)
        assert db.query(models.PaintState).one().table_id == str(deletion.other.table_id)
        for model in (models.Entity, models.Wall, models.PaintStroke, models.PaintObject,
                      models.PaintOperationResult, models.CanvasCommandJournal, models.SharedMeasurement):
            assert db.query(model).count() == 0
        assert all(row.active_table_id is None for row in db.query(models.GamePlayer).filter_by(session_id=1))
        assert db.query(models.GamePlayer).filter_by(session_id=2).one().active_table_id == str(deletion.other.table_id)
        assert db.query(models.SessionCharacter).one().version == 1
        assert db.query(models.TableDeletionTombstone).one().deleted_by == 2
        assert db.query(models.SessionOperationReceipt).one().domain == 'table_delete'
    replay = TableDeletionService(deletion.factory).execute(deletion.intent())
    assert replay.replayed and replay.receipt == accepted.receipt
    assert deletion.service.execute(deletion.intent('deliberate-again')).receipt['already_deleted']


def test_retired_identity_blocks_snapshot_and_creation_after_actor_receipt_removal(deletion):
    deletion.service.execute(deletion.intent())
    with deletion.factory() as db:
        db.query(models.GamePlayer).filter_by(user_id=2).delete()
        db.query(models.User).filter_by(id=2).delete()
        db.commit()
        assert db.query(models.SessionOperationReceipt).count() == 0
        assert db.query(models.TableDeletionTombstone).one().deleted_by is None
    with deletion.factory() as db, pytest.raises(ValueError, match='deleted'):
        crud.save_table_to_db(db, deletion.table, 1)
    with deletion.factory() as db, pytest.raises(ValueError, match='deleted'):
        crud.create_virtual_table(db, schemas.VirtualTableCreate(table_id=deletion.table_id, name='Stale',
                                                                width=1000, height=1000, session_id=1))
    recovered = deletion.service.resolve(deletion.intent(), internal_recovery=True)
    assert recovered is not None and not recovered.actor_authorized


def test_original_identity_and_current_session_authority_are_required(deletion):
    deletion.service.execute(deletion.intent())
    with pytest.raises(OperationRejected, match='different input'):
        deletion.service.execute(deletion.intent(target=str(deletion.other.table_id)))
    with pytest.raises(OperationRejected, match='not found'):
        deletion.service.execute(deletion.intent('foreign', target=str(deletion.other.table_id)))
    with deletion.factory() as db:
        db.query(models.GamePlayer).filter_by(session_id=1, user_id=2).one().role = 'player'
        db.commit()
    with pytest.raises(OperationRejected, match='DM authority'):
        deletion.service.execute(deletion.intent())
    recovered = deletion.service.resolve(deletion.intent(), internal_recovery=True)
    assert recovered is not None and not recovered.actor_authorized


@pytest.mark.parametrize('kind', ['combat', 'choice', 'cache'])
def test_active_encounter_blocks_delete_and_completed_history_survives(deletion, kind):
    with deletion.factory() as db:
        if kind == 'combat':
            db.add(models.CombatEncounter(encounter_id='encounter', session_id=1,
                                          table_id=deletion.table_id, phase='combat'))
        elif kind == 'choice':
            db.add(models.ChoiceEncounter(encounter_id='encounter', session_id=1, session_code='DELETE1',
                                          table_id=deletion.table_id, title='Choice', phase='active', state_json='{}'))
        db.commit()
    with pytest.raises(OperationRejected, match='End the active encounter'):
        deletion.service.execute(deletion.intent(), cached_encounter_active=kind == 'cache')
    with deletion.factory() as db:
        for model, phase in ((models.CombatEncounter, 'inactive'), (models.ChoiceEncounter, 'completed')):
            db.query(model).update({'phase': phase})
        db.commit()
    deletion.service.execute(deletion.intent())
    with deletion.factory() as db:
        assert db.query(models.CombatEncounter).count() + db.query(models.ChoiceEncounter).count() == (kind != 'cache')


def test_flush_failure_rolls_back_table_dependencies_pointers_tombstone_and_receipt(deletion, monkeypatch):
    stage = table_deletion_service.stage_receipt

    def fail(*args):
        stage(*args)
        raise RuntimeError('After deletion and receipt flush')

    monkeypatch.setattr(table_deletion_service, 'stage_receipt', fail)
    with pytest.raises(OperationRejected, match='could not be saved'):
        deletion.service.execute(deletion.intent())
    with deletion.factory() as db:
        assert db.query(models.VirtualTable).count() == 2
        assert db.query(models.Wall).count() == db.query(models.Entity).count() == db.query(models.CanvasCommandJournal).count() == 1
        assert db.query(models.TableDeletionTombstone).count() == db.query(models.SessionOperationReceipt).count() == 0
        assert db.query(models.GamePlayer).filter_by(session_id=1, user_id=2).one().active_table_id == deletion.table_id


@pytest.mark.parametrize('committed', [False, True])
@pytest.mark.parametrize('lookup_outage', [False, True])
def test_commit_response_loss_and_lookup_outage_settle_original_delete(deletion, committed, lookup_outage):
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
        current = sessionmaker(bind=deletion.engine, class_=LostResponse) if calls == 1 else deletion.factory
        with current() as db:
            yield db

    service = TableDeletionService(factory)
    if lookup_outage:
        with pytest.raises(OperationOutcomeUnknown):
            service.execute(deletion.intent())
    elif committed:
        assert service.execute(deletion.intent()).replayed
    else:
        with pytest.raises(OperationRejected, match='did not commit'):
            service.execute(deletion.intent())
    deletion.service.execute(deletion.intent())
    with deletion.factory() as db:
        assert db.query(models.TableDeletionTombstone).count() == db.query(models.SessionOperationReceipt).count() == 1


@pytest.fixture
def dispatch(deletion):
    from core_table.protocol import Message
    from core_table.server import TableManager
    from service.server_protocol import ServerProtocol

    session = SimpleNamespace(game_session_db_id=1, session_code='DELETE1', client_info={
        'codm': {'user_id': 2, 'role': 'co_dm'}, 'player': {'user_id': 3, 'role': 'player'},
    })

    def create():
        proto = ServerProtocol(TableManager(True), session_manager=session)
        proto.table_manager.add_table(deletion.table)
        proto._table_deletion_service = lambda: deletion.service
        proto.send_to_client = AsyncMock()
        proto.broadcast_to_session = AsyncMock()
        return proto

    proto = create()

    async def send(message, actor='codm', protocol=None):
        target = protocol or proto
        await target.handle_client(Message.from_json(message.to_json()), actor)
        sender = target.send_to_client
        assert isinstance(sender, AsyncMock)
        return Message.from_json(sender.call_args.args[0].to_json())

    return SimpleNamespace(proto=proto, create=create, send=send)


@pytest.mark.asyncio
async def test_dispatch_deletes_once_and_discards_dirty_retry_only_after_acceptance(deletion, dispatch):
    from core_table.protocol import Message, MessageType

    actions = dispatch.proto.actions
    actions._dirty_tables[deletion.table_id] = 1
    actions._dirty_generations[deletion.table_id] = 1
    retry = asyncio.create_task(asyncio.Event().wait())
    actions._save_tasks[deletion.table_id] = retry
    request = Message(MessageType.TABLE_DELETE, {'table_id': deletion.table_id})
    accepted = await dispatch.send(request)
    assert accepted.type == MessageType.SUCCESS and accepted.data['operation'] == 'delete'
    assert not actions._dirty_tables and not actions._dirty_generations and not actions._save_tasks
    assert retry.cancelled() and not dispatch.proto.table_manager.tables and not dispatch.proto.table_manager.tables_id
    assert (await dispatch.send(copy.deepcopy(request))).data['replayed']
    restarted = dispatch.create()
    assert (await dispatch.send(request, protocol=restarted)).data['replayed']
    assert not restarted.table_manager.tables_id
    with deletion.factory() as db:
        assert db.query(models.SessionOperationReceipt).count() == 1


@pytest.mark.asyncio
async def test_repeated_cancellation_holds_ownership_through_delete_cleanup_and_publication(deletion, dispatch, monkeypatch):
    from core_table.protocol import Message, MessageType

    entered, release = threading.Event(), threading.Event()
    publishing, published = asyncio.Event(), asyncio.Event()
    stage = table_deletion_service.stage_receipt
    loop_thread = threading.get_ident()

    def delayed(*args):
        assert threading.get_ident() != loop_thread
        stage(*args)
        entered.set()
        assert release.wait(5)

    async def publish(*_):
        publishing.set()
        await published.wait()

    monkeypatch.setattr(table_deletion_service, 'stage_receipt', delayed)
    dispatch.proto.broadcast_to_session = AsyncMock(side_effect=publish)
    request = Message(MessageType.TABLE_DELETE, {'table_id': deletion.table_id})
    task = asyncio.create_task(dispatch.send(request))
    try:
        assert await asyncio.to_thread(entered.wait, 2)
        for _ in range(2):
            task.cancel()
            await asyncio.sleep(0)
        assert dispatch.proto._mutation_lock.locked() and not task.done()
        assert deletion.table_id in dispatch.proto.table_manager.tables_id
        assert (await dispatch.send(Message(MessageType.PING, {}))).type == MessageType.PONG
        release.set()
        await asyncio.wait_for(publishing.wait(), 3)
        task.cancel()
        await asyncio.sleep(0)
        assert dispatch.proto._mutation_lock.locked() and not task.done()
        assert not dispatch.proto.table_manager.tables_id
    finally:
        release.set()
        published.set()
    with pytest.raises(asyncio.CancelledError):
        await task
    assert (await dispatch.send(request)).data['replayed']


@pytest.mark.asyncio
@pytest.mark.parametrize('committed', [False, True])
async def test_unknown_delete_fences_reads_snapshots_and_dirty_retries_until_settlement(deletion, dispatch, committed):
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
        current = sessionmaker(bind=deletion.engine, class_=LostResponse) if calls == 1 else deletion.factory
        with current() as db:
            yield db

    deletion.service = TableDeletionService(factory)
    dispatch.proto.actions._dirty_tables[deletion.table_id] = 1
    dispatch.proto.actions._dirty_generations[deletion.table_id] = 1
    request = Message(MessageType.TABLE_DELETE, {'table_id': deletion.table_id})
    assert (await dispatch.send(request)).data['outcome'] == 'unknown'
    assert not dispatch.proto.table_manager.persistence_allowed()
    assert not await dispatch.proto.table_manager.save_to_database_async(1)
    assert deletion.table_id in dispatch.proto.table_manager.tables_id
    assert deletion.table_id in dispatch.proto.actions._dirty_tables
    assert (await dispatch.send(Message(MessageType.TABLE_LIST_REQUEST, {}))).data['outcome'] == 'unknown'
    unavailable = False
    recovered = await dispatch.send(request)
    if committed:
        assert recovered.type == MessageType.SUCCESS and recovered.data['replayed']
        assert not dispatch.proto.actions._dirty_tables and not dispatch.proto.table_manager.tables_id
    else:
        assert recovered.data['code'] == 'persistence_failed'
        assert deletion.table_id in dispatch.proto.actions._dirty_tables
        assert deletion.table_id in dispatch.proto.table_manager.tables_id
        assert (await dispatch.send(request)).type == MessageType.SUCCESS
    assert dispatch.proto.table_manager.persistence_allowed()


@pytest.mark.asyncio
async def test_committed_delete_cache_failure_recovers_before_reads_and_rejects_changed_retry(deletion, dispatch, monkeypatch):
    from core_table.protocol import Message, MessageType

    discard = dispatch.proto.actions.discard_deleted_table
    monkeypatch.setattr(dispatch.proto.actions, 'discard_deleted_table', AsyncMock(side_effect=RuntimeError('Cache failed')))
    request = Message(MessageType.TABLE_DELETE, {'table_id': deletion.table_id})
    assert (await dispatch.send(request)).data['outcome'] == 'unknown'
    monkeypatch.setattr(dispatch.proto.actions, 'discard_deleted_table', discard)
    changed = copy.deepcopy(request)
    changed.data['table_id'] = str(deletion.other.table_id)
    assert (await dispatch.send(changed)).data['code'] == 'conflict'
    assert not dispatch.proto.table_manager.tables_id
    assert not dispatch.proto._has_pending_table_deletion()


@pytest.mark.asyncio
async def test_recovery_after_actor_removal_cleans_cache_without_exposing_original_result(deletion, dispatch, monkeypatch):
    from core_table.protocol import Message, MessageType

    discard = dispatch.proto.actions.discard_deleted_table
    monkeypatch.setattr(dispatch.proto.actions, 'discard_deleted_table', AsyncMock(side_effect=RuntimeError('Cache failed')))
    request = Message(MessageType.TABLE_DELETE, {'table_id': deletion.table_id})
    assert (await dispatch.send(request)).data['outcome'] == 'unknown'
    with deletion.factory() as db:
        db.query(models.GamePlayer).filter_by(user_id=2).delete()
        db.query(models.User).filter_by(id=2).delete()
        db.commit()
    monkeypatch.setattr(dispatch.proto.actions, 'discard_deleted_table', discard)
    response = await dispatch.send(request)
    assert response.data['code'] == 'forbidden' and 'success' not in response.data
    assert not dispatch.proto.table_manager.tables_id and dispatch.proto.table_manager.persistence_allowed()
