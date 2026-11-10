"""Fault-injected protocol recovery installs current fog without stale scene saves."""
import asyncio
import threading
from unittest.mock import AsyncMock

import pytest
from core_table.protocol import Message, MessageType
from database import crud, models
from service.fog_edit_service import FogEditIntent, FogEditService
from service.table_edit_service import TableEditService
from sqlalchemy import event

from . import test_table_edit_recovery
from .test_table_edit_recovery import dispatch
from .test_table_edit_service import table_scene as table_scene

table_protocol = test_table_edit_recovery.scene


@pytest.fixture
def scene(table_protocol, monkeypatch):
    s = table_protocol
    s.service = FogEditService(s.factory)
    monkeypatch.setattr(s.proto, '_fog_edit_service', lambda: s.service)
    monkeypatch.setattr(s.proto, '_table_edit_service', lambda: TableEditService(s.factory))
    def request(hide=None):
        return Message(MessageType.TABLE_UPDATE_REQUEST, {'category': 'table', 'type': 'fog_update',
            'data': {'table_id': s.table_id, 'hide_rectangles': [[[20, 30], [50, 80]]] if hide is None else hide,
                     'reveal_rectangles': []}})
    s.request = request
    return s


def lose_commit(s, monkeypatch, committed):
    def factory():
        db = s.factory()
        def lost(_db):
            raise OSError('Private fog commit failure')
        event.listen(db, 'after_commit' if committed else 'before_commit', lost, once=True)
        return db
    monkeypatch.setattr(s.service, 'execute', lambda *args: FogEditService(factory).execute(*args))


@pytest.mark.parametrize('committed', [False, True])
@pytest.mark.parametrize('outage', [False, True])
@pytest.mark.parametrize('clearing', [False, True])
async def test_fog_effect_and_original_settle_before_quarantine_clears(scene, monkeypatch, committed, outage, clearing):
    s = scene
    seed = s.request(hide=[[[1, 2], [8, 9]]])
    assert (await dispatch(s, seed)).data['domain'] == 'fog_edit'
    request = s.request(hide=[] if clearing else None)
    resolver, available = s.service.resolve, not outage
    def resolve(attempt):
        if not available:
            raise OSError('Private lookup unavailable')
        return resolver(attempt)
    monkeypatch.setattr(s.service, 'resolve', resolve)
    lose_commit(s, monkeypatch, committed)
    response = await dispatch(s, request)
    if outage:
        assert response.data['outcome'] == 'unknown' and s.proto._has_pending_writes()
        assert s.manager.get_table(s.table_id).fog_rectangles['hide'] == [((1, 2), (8, 9))]
        assert not await s.manager.save_table_async(s.table_id, s.session_id)
        read = await dispatch(s, Message(MessageType.TABLE_LIST_REQUEST), 'other')
        assert read.data['outcome'] == 'unknown' and 'operation_id' not in read.data
        available = True
        response = await dispatch(s, request)
    assert response.causation_id == request.message_id and 'Private' not in str(response.data)
    assert response.type == (MessageType.SUCCESS if committed else MessageType.ERROR)
    assert not s.proto._has_pending_writes() and not s.proto.actions._dirty_tables
    s.proto.session_manager.auto_save.assert_not_awaited()
    with s.factory() as db:
        restored, success = crud.load_table_from_db(db, s.table_id)
        assert success and restored is not None and s.manager.get_table(s.table_id).to_dict() == restored.to_dict()
    assert 'fog_entities' not in response.data and 'fog_rectangles' not in response.data


async def test_failed_installation_uses_current_fog_preserves_unrelated_edits_and_aliases(scene, monkeypatch):
    s = scene
    install = s.proto._install_table_edit
    monkeypatch.setattr(s.proto, '_install_table_edit', AsyncMock(side_effect=RuntimeError('installation')))
    original = s.request()
    assert (await dispatch(s, original)).data['outcome'] == 'unknown'
    later = s.request(hide=[[[100, 200], [130, 250]]])
    s.service.execute(FogEditIntent.create(s.session_id, s.actor_id, later.message_id, later.type.value, later.data))
    table = s.manager.get_table(s.table_id)
    token = table.find_entity_by_sprite_id('untouched')
    token.name, table.display_name = 'Retained token', 'Retained name'
    monkeypatch.setattr(s.proto, '_install_table_edit', install)
    assert (await dispatch(s, original)).data['success']
    current = s.manager.get_table(s.table_id)
    assert current.fog_rectangles['hide'] == [((100, 200), (130, 250))]
    assert current.find_entity_by_sprite_id('untouched') is token
    assert current.display_name == 'Retained name' and s.manager.tables_id[s.table_id] is current


async def test_install_collision_never_overwrites_unrelated_retained_entity(scene, monkeypatch):
    s = scene
    install = s.proto._install_table_edit
    monkeypatch.setattr(s.proto, '_install_table_edit', AsyncMock(side_effect=RuntimeError('installation')))
    original = s.request()
    assert (await dispatch(s, original)).data['outcome'] == 'unknown'
    table = s.manager.get_table(s.table_id)
    retained = table.add_entity({'sprite_id': 'retained', 'x': 90, 'y': 90})
    monkeypatch.setattr(s.proto, '_install_table_edit', install)
    assert (await dispatch(s, original)).data['outcome'] == 'unknown'
    assert s.manager.get_table(s.table_id) is table and table.find_entity_by_sprite_id('retained') is retained
    table.remove_entity(retained.entity_id)
    assert (await dispatch(s, original)).data['success']


async def test_missing_known_accepted_receipt_and_changed_original_stay_safe(scene, monkeypatch):
    s = scene
    install = s.proto._install_table_edit
    monkeypatch.setattr(s.proto, '_install_table_edit', AsyncMock(side_effect=RuntimeError('installation')))
    original = s.request()
    assert (await dispatch(s, original)).data['outcome'] == 'unknown'
    with s.factory() as db, db.begin():
        db.query(models.SessionOperationReceipt).delete()
    monkeypatch.setattr(s.proto, '_install_table_edit', install)
    assert (await dispatch(s, original)).data['outcome'] == 'unknown'
    assert s.proto._has_pending_writes()


async def test_changed_original_does_not_replace_fog_after_recovery(scene, monkeypatch):
    s = scene
    resolver = s.service.resolve
    monkeypatch.setattr(s.service, 'resolve', lambda _: (_ for _ in ()).throw(OSError('outage')))
    lose_commit(s, monkeypatch, True)
    original = s.request()
    assert (await dispatch(s, original)).data['outcome'] == 'unknown'
    monkeypatch.setattr(s.service, 'resolve', resolver)
    original.data['data']['hide_rectangles'] = []
    assert (await dispatch(s, original)).data['code'] == 'conflict'
    assert s.manager.get_table(s.table_id).fog_rectangles['hide']


async def test_revocation_repairs_current_fog_without_exposing_receipt(scene, monkeypatch):
    s = scene
    resolver = s.service.resolve
    monkeypatch.setattr(s.service, 'resolve', lambda _: (_ for _ in ()).throw(OSError('outage')))
    lose_commit(s, monkeypatch, True)
    original = s.request()
    assert (await dispatch(s, original)).data['outcome'] == 'unknown'
    with s.factory() as db, db.begin():
        owner = models.User(username='replacement', hashed_password='test')
        db.add(owner)
        db.flush()
        db.get(models.GameSession, s.session_id).owner_id = owner.id
        db.query(models.GamePlayer).filter_by(session_id=s.session_id, user_id=s.actor_id).one().role = 'spectator'
    monkeypatch.setattr(s.service, 'resolve', resolver)
    response = await dispatch(s, original)
    assert response.data['code'] == 'forbidden' and response.data['outcome'] == 'unknown'
    assert 'domain' not in response.data and not s.proto._has_pending_writes()
    assert s.manager.get_table(s.table_id).fog_rectangles['hide']


@pytest.mark.parametrize('available', [False, True])
async def test_join_and_empty_cleanup_cannot_bypass_fog_owner(scene, monkeypatch, available):
    from service.game_session_protocol import GameSessionProtocolService
    s = scene
    resolver = s.service.resolve
    monkeypatch.setattr(s.service, 'resolve', lambda _: (_ for _ in ()).throw(OSError('outage')))
    lose_commit(s, monkeypatch, True)
    assert (await dispatch(s, s.request())).data['outcome'] == 'unknown'
    svc = GameSessionProtocolService.__new__(GameSessionProtocolService)
    svc.server_protocol, svc.table_manager = s.proto, s.manager
    svc.session_code, svc.game_session_db_id, svc.db_session = 'TEST01', s.session_id, None
    svc.clients, svc.client_info, svc.websocket_to_client, svc._outboxes = {}, {}, {}, {}
    s.proto.session_manager = svc
    s.proto._load_active_choice_encounter = AsyncMock(return_value=None)
    assert not await svc.save_to_database_async()
    if available:
        monkeypatch.setattr(s.service, 'resolve', resolver)
    socket = AsyncMock()
    socket.scope = {'query_string': b''}
    async with s.proto._mutation_lock:
        if not available:
            with pytest.raises(RuntimeError, match='settle'):
                await svc._register_client(socket, 'replacement', {'user_id': s.actor_id}, 'free_roam', {})
            return
        await svc._register_client(socket, 'replacement', {'user_id': s.actor_id}, 'free_roam', {})
    await svc.drain_outbound()
    assert s.manager.get_table(s.table_id).fog_rectangles['hide']


async def test_repeated_cancellation_retains_fog_ownership_through_installation(scene, monkeypatch):
    s = scene
    execute = s.service.execute
    started, release = threading.Event(), threading.Event()
    def slow(*args):
        started.set()
        assert release.wait(5)
        return execute(*args)
    monkeypatch.setattr(s.service, 'execute', slow)
    task = asyncio.create_task(s.proto.handle_client(s.request(), 'client'))
    while not started.is_set():
        await asyncio.sleep(0)
    task.cancel()
    await asyncio.sleep(0)
    task.cancel()
    await asyncio.sleep(0)
    assert not task.done() and s.proto._mutation_lock.locked()
    release.set()
    with pytest.raises(asyncio.CancelledError):
        await task
    assert not s.proto._has_pending_writes() and s.manager.get_table(s.table_id).fog_rectangles['hide']


async def test_later_deleted_table_is_not_recreated_by_original_fog(scene):
    from service.table_deletion_service import TableDeleteIntent, TableDeletionService
    s = scene
    original = s.request()
    assert (await dispatch(s, original)).data['success']
    TableDeletionService(s.factory).execute(TableDeleteIntent.create(s.session_id, s.actor_id,
        'delete', {'table_id': s.table_id}))
    assert (await dispatch(s, original)).data['table_deleted']
    assert s.manager.get_table(s.table_id) is None


async def test_fog_sql_runs_off_loop_and_publication_failure_stays_accepted(scene, monkeypatch, test_db_engine):
    s = scene
    threads, main = [], threading.get_ident()
    def observe(*_args):
        threads.append(threading.get_ident())
    event.listen(test_db_engine, 'before_cursor_execute', observe)
    monkeypatch.setattr(s.proto, 'broadcast_to_session', AsyncMock(side_effect=RuntimeError('publication')))
    try:
        response = await dispatch(s, s.request())
    finally:
        event.remove(test_db_engine, 'before_cursor_execute', observe)
    assert response.data['success'] and response.data['resync_required']
    assert threads and all(thread != main for thread in threads)
