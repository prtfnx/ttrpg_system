import asyncio
import copy
import json
import threading
from contextlib import contextmanager
from types import SimpleNamespace
from unittest.mock import AsyncMock

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


@pytest.fixture
def dispatch(creation):
    from core_table.protocol import Message
    from core_table.server import TableManager
    from service.server_protocol import ServerProtocol

    session = SimpleNamespace(game_session_db_id=1, session_code='TABLE1', client_info={
        'dm': {'user_id': 1, 'role': 'owner'}, 'codm': {'user_id': 2, 'role': 'co_dm'},
        'player': {'user_id': 3, 'role': 'player'},
    })

    def create():
        proto = ServerProtocol(TableManager(True), session_manager=session)
        proto._table_creation_service = lambda: creation.service
        proto.send_to_client = AsyncMock()
        proto.broadcast_to_session = AsyncMock()
        proto.ensure_assets_in_r2 = AsyncMock(side_effect=lambda data, *_: data)
        return proto

    proto = create()

    async def send(message, actor='dm', protocol=None):
        target = protocol or proto
        await target.handle_client(Message.from_json(message.to_json()), actor)
        sender = target.send_to_client
        assert isinstance(sender, AsyncMock)
        return Message.from_json(sender.call_args.args[0].to_json())

    return SimpleNamespace(proto=proto, create=create, send=send)


@pytest.mark.asyncio
async def test_real_dispatch_reconstructs_original_table_once_and_keeps_resident_state(creation, dispatch):
    from core_table.protocol import Message, MessageType

    request = Message(MessageType.NEW_TABLE_REQUEST, {'table_name': 'Scene', 'width': 1000, 'height': 1000})
    retry = copy.deepcopy(request)
    accepted = await dispatch.send(request)
    table_id = accepted.data['table_id']
    assert len(dispatch.proto.table_manager.tables) == len(dispatch.proto.actions.action_history) == 1
    live = dispatch.proto.table_manager.tables_id[table_id]
    live.display_name = 'Current resident name'
    replay = await dispatch.send(retry)
    assert replay.data['replayed'] and replay.data['table_data']['table_name'] == 'Current resident name'
    assert dispatch.proto.table_manager.tables_id[table_id] is live
    restarted = dispatch.create()
    replay = await dispatch.send(retry, protocol=restarted)
    assert replay.data['table_id'] == table_id and replay.data['replayed']
    assert len(restarted.table_manager.tables) == 1
    broadcast = restarted.broadcast_to_session
    assert isinstance(broadcast, AsyncMock)
    broadcast.assert_awaited_once()  # Uncached accepted table is announced on installation.
    with creation.factory() as db:
        assert db.query(models.VirtualTable).count() == db.query(models.SessionOperationReceipt).count() == 1


@pytest.mark.asyncio
async def test_copy_wire_replay_does_not_capture_source_again(creation, dispatch, monkeypatch):
    from core_table.protocol import Message, MessageType

    source = VirtualTable('Source', 1000, 1000)
    source.add_entity({'name': 'Hidden', 'layer': 'dungeon_master'})
    with creation.factory() as db:
        crud.save_table_to_db(db, source, 1)
    dispatch.proto.table_manager.add_table(source)
    request = Message(MessageType.NEW_TABLE_REQUEST, {'table_name': 'Copy', 'source_table_id': str(source.table_id)})
    assert (await dispatch.send(request)).type == MessageType.NEW_TABLE_RESPONSE

    def invalid_snapshot():
        raise AssertionError('A replay must not re-capture its source')

    monkeypatch.setattr(source, 'to_dict', invalid_snapshot)
    assert (await dispatch.send(request)).data['replayed']
    with creation.factory() as db:
        assert db.query(models.VirtualTable).count() == 2 and db.query(models.SessionOperationReceipt).count() == 1


@pytest.mark.asyncio
async def test_repeated_cancellation_waits_for_table_installation_and_publication(creation, dispatch, monkeypatch):
    from core_table.protocol import Message, MessageType

    entered, release = threading.Event(), threading.Event()
    stage = table_creation_service.stage_receipt
    loop_thread = threading.get_ident()

    def delayed(*args):
        assert threading.get_ident() != loop_thread
        stage(*args)
        entered.set()
        assert release.wait(5)

    monkeypatch.setattr(table_creation_service, 'stage_receipt', delayed)
    request = Message(MessageType.NEW_TABLE_REQUEST, {'table_name': 'Scene'})
    task = asyncio.create_task(dispatch.send(request))
    try:
        assert await asyncio.to_thread(entered.wait, 2)
        for _ in range(2):
            task.cancel()
            await asyncio.sleep(0)
        assert dispatch.proto._mutation_lock.locked() and not task.done()
        assert (await dispatch.send(Message(MessageType.PING, {}))).type == MessageType.PONG
    finally:
        release.set()
    with pytest.raises(asyncio.CancelledError):
        await task
    assert len(dispatch.proto.table_manager.tables) == 1
    broadcast = dispatch.proto.broadcast_to_session
    assert isinstance(broadcast, AsyncMock)
    broadcast.assert_awaited_once()
    assert (await dispatch.send(request)).data['replayed']


@pytest.mark.asyncio
@pytest.mark.parametrize('committed', [False, True])
async def test_unknown_table_commit_fences_reads_and_snapshots_until_verified(creation, dispatch, committed):
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
        current = sessionmaker(bind=creation.engine, class_=LostResponse) if calls == 1 else creation.factory
        with current() as db:
            yield db

    creation.service = TableCreationService(factory)
    request = Message(MessageType.NEW_TABLE_REQUEST, {'table_name': 'Scene'})
    response = await dispatch.send(request)
    assert response.data['outcome'] == 'unknown'
    assert not dispatch.proto.table_manager.persistence_allowed()
    assert not await dispatch.proto.table_manager.save_to_database_async(1)
    assert not dispatch.proto.table_manager.tables
    read = await dispatch.send(Message(MessageType.TABLE_LIST_REQUEST, {}))
    assert read.data['outcome'] == 'unknown'
    unavailable = False
    recovered = await dispatch.send(request)
    if committed:
        assert recovered.type == MessageType.NEW_TABLE_RESPONSE and recovered.data['replayed']
        assert len(dispatch.proto.table_manager.tables) == 1
    else:
        assert recovered.data['code'] == 'persistence_failed'
        assert not dispatch.proto.table_manager.tables
        assert (await dispatch.send(request)).type == MessageType.NEW_TABLE_RESPONSE
    assert dispatch.proto.table_manager.persistence_allowed()
    with creation.factory() as db:
        assert db.query(models.VirtualTable).count() == db.query(models.SessionOperationReceipt).count() == 1


@pytest.mark.asyncio
async def test_failed_post_commit_installation_recovers_before_later_reads(creation, dispatch, monkeypatch):
    from core_table.protocol import Message, MessageType

    install = dispatch.proto._install_created_table
    def failed_install(*args):
        raise RuntimeError('Install failed')

    monkeypatch.setattr(dispatch.proto, '_install_created_table', failed_install)
    request = Message(MessageType.NEW_TABLE_REQUEST, {'table_name': 'Scene'})
    assert (await dispatch.send(request)).data['outcome'] == 'unknown'
    monkeypatch.setattr(dispatch.proto, '_install_created_table', install)
    assert (await dispatch.send(Message(MessageType.TABLE_LIST_REQUEST, {}))).data['count'] == 1
    assert not dispatch.proto._has_pending_table_creation()
    assert len(dispatch.proto.actions.action_history) == 1


@pytest.mark.asyncio
async def test_recovery_repairs_cache_after_role_revocation_without_exposing_private_result(creation, dispatch):
    from core_table.protocol import Message, MessageType

    class LostResponse(Session):
        def commit(self):
            super().commit()
            raise RuntimeError('Lost response')

    calls, unavailable = 0, True

    @contextmanager
    def factory():
        nonlocal calls
        calls += 1
        if calls > 1 and unavailable:
            raise RuntimeError('Lookup unavailable')
        current = sessionmaker(bind=creation.engine, class_=LostResponse) if calls == 1 else creation.factory
        with current() as db:
            yield db

    creation.service = TableCreationService(factory)
    request = Message(MessageType.NEW_TABLE_REQUEST, {'table_name': 'Secret scene'})
    assert (await dispatch.send(request, actor='codm')).data['outcome'] == 'unknown'
    with creation.factory() as db:
        db.query(models.GamePlayer).one().role = 'player'
        db.commit()
    unavailable = False
    response = await dispatch.send(request, actor='codm')
    assert response.data['code'] == 'forbidden' and 'table_data' not in response.data
    assert len(dispatch.proto.table_manager.tables) == 1
    assert dispatch.proto.table_manager.persistence_allowed()
