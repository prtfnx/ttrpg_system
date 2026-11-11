"""Layer edits retain shared table ownership until current settings install."""
import asyncio
import threading
from unittest.mock import AsyncMock

import pytest
from core_table.protocol import Message, MessageType
from database import models
from service.layer_edit_service import LayerEditService
from service.table_edit_service import TableEditService
from sqlalchemy import event

from . import test_table_edit_recovery
from .test_table_edit_recovery import dispatch
from .test_table_edit_service import table_scene as table_scene

table_protocol = test_table_edit_recovery.scene


@pytest.fixture
def scene(table_protocol, monkeypatch):
    s = table_protocol
    s.service = LayerEditService(s.factory)
    monkeypatch.setattr(s.proto, '_layer_edit_service', lambda: s.service)
    monkeypatch.setattr(s.proto, '_table_edit_service', lambda: TableEditService(s.factory))
    s.request = lambda settings=None: Message(MessageType.LAYER_SETTINGS_UPDATE, {'table_id': s.table_id,
        'layer': 'tokens', 'settings': {'opacity': 0.4} if settings is None else settings})
    return s


def lose_commit(s, monkeypatch, committed):
    def factory():
        db = s.factory()
        def lost(_db):
            raise OSError('Private commit error')
        event.listen(db, 'after_commit' if committed else 'before_commit', lost, once=True)
        return db
    monkeypatch.setattr(s.service, 'execute', lambda *args: LayerEditService(factory).execute(*args))


@pytest.mark.parametrize('committed', [False, True])
@pytest.mark.parametrize('outage', [False, True])
@pytest.mark.parametrize('settings', [{'visible': False}, {'opacity': 0.4}])
async def test_commit_and_current_installation_settle_before_state_work_resumes(scene, monkeypatch, committed, outage, settings):
    s = scene
    request = s.request(settings)
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
        assert not await s.manager.save_table_async(s.table_id, s.session_id)
        assert not getattr(s.table, 'layer_settings', {})
        follower = s.request({'opacity': 0.8})
        blocked = await dispatch(s, follower, 'other')
        assert blocked.data['outcome'] == 'unknown' and blocked.causation_id == follower.message_id
        assert 'operation_id' not in blocked.data
        available = True
        response = await dispatch(s, request)
    assert response.type == (MessageType.SUCCESS if committed else MessageType.ERROR)
    assert response.causation_id == request.message_id and 'Private' not in str(response.data)
    assert s.table.layer_settings['tokens'] == (settings if committed else {})
    assert 'layer_settings' not in response.data and 'settings' not in response.data
    assert not s.proto._has_pending_writes() and not s.proto.actions._dirty_tables
    s.proto.session_manager.auto_save.assert_not_awaited()


async def test_failed_installation_uses_later_state_and_preserves_unrelated_cache(scene, monkeypatch):
    s = scene
    install = s.proto._install_table_edit
    monkeypatch.setattr(s.proto, '_install_table_edit', AsyncMock(side_effect=RuntimeError('cache')))
    original = s.request()
    assert (await dispatch(s, original)).data['outcome'] == 'unknown'
    with s.factory() as db, db.begin():
        db.query(models.VirtualTable).one().layer_settings = '{"tokens":{"opacity":0.9,"visible":false}}'
    s.table.layer_settings = {'map': {'opacity': 0.2}}
    token = s.table.find_entity_by_sprite_id('untouched')
    token.name = 'Retained'
    monkeypatch.setattr(s.proto, '_install_table_edit', install)
    assert (await dispatch(s, original)).data['success']
    assert s.table.layer_settings == {'map': {'opacity': 0.2}, 'tokens': {'opacity': 0.9, 'visible': False}}
    assert s.table.find_entity_by_sprite_id('untouched') is token
    assert s.manager.tables_id[s.table_id] is s.table


async def test_revoked_actor_repairs_cache_without_disclosing_original_receipt(scene, monkeypatch):
    s = scene
    resolver = s.service.resolve
    monkeypatch.setattr(s.service, 'resolve', lambda _: (_ for _ in ()).throw(OSError('outage')))
    lose_commit(s, monkeypatch, True)
    request = s.request()
    assert (await dispatch(s, request)).data['outcome'] == 'unknown'
    with s.factory() as db, db.begin():
        owner = models.User(username='replacement', hashed_password='test')
        db.add(owner)
        db.flush()
        db.get(models.GameSession, s.session_id).owner_id = owner.id
        db.query(models.GamePlayer).filter_by(session_id=s.session_id, user_id=s.actor_id).one().role = 'spectator'
    monkeypatch.setattr(s.service, 'resolve', resolver)
    response = await dispatch(s, request)
    assert response.data['code'] == 'forbidden' and response.data['outcome'] == 'unknown'
    assert 'domain' not in response.data and not s.proto._has_pending_writes()
    assert s.table.layer_settings['tokens']['opacity'] == 0.4
    assert (await dispatch(s, s.request())).data['code'] == 'forbidden'


async def test_missing_known_accepted_receipt_does_not_release_owner(scene, monkeypatch):
    s = scene
    install = s.proto._install_table_edit
    monkeypatch.setattr(s.proto, '_install_table_edit', AsyncMock(side_effect=RuntimeError('cache')))
    request = s.request()
    assert (await dispatch(s, request)).data['outcome'] == 'unknown'
    with s.factory() as db, db.begin():
        db.query(models.SessionOperationReceipt).delete()
    monkeypatch.setattr(s.proto, '_install_table_edit', install)
    assert (await dispatch(s, request)).data['outcome'] == 'unknown' and s.proto._has_pending_writes()


async def test_changed_original_never_applies_after_settlement(scene, monkeypatch):
    s = scene
    resolver = s.service.resolve
    monkeypatch.setattr(s.service, 'resolve', lambda _: (_ for _ in ()).throw(OSError('outage')))
    lose_commit(s, monkeypatch, True)
    request = s.request()
    assert (await dispatch(s, request)).data['outcome'] == 'unknown'
    monkeypatch.setattr(s.service, 'resolve', resolver)
    request.data['settings'] = {'opacity': 0.9}
    assert (await dispatch(s, request)).data['code'] == 'conflict'
    assert s.table.layer_settings['tokens']['opacity'] == 0.4


@pytest.mark.parametrize('available', [False, True])
async def test_join_and_empty_cleanup_wait_after_original_socket_disappears(scene, monkeypatch, available):
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
    assert not s.proto._has_pending_writes() and s.table.layer_settings['tokens']['opacity'] == 0.4


async def test_repeated_cancellation_retains_owner_until_current_style_installs(scene, monkeypatch):
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
    assert not s.proto._has_pending_writes() and s.table.layer_settings['tokens']['opacity'] == 0.4


async def test_sql_stays_off_loop_and_failed_notifications_do_not_reject_acceptance(scene, monkeypatch, test_db_engine):
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


async def test_later_deleted_table_stays_retired_on_layer_retry(scene):
    from service.table_deletion_service import TableDeleteIntent, TableDeletionService
    s = scene
    request = s.request()
    assert (await dispatch(s, request)).data['domain'] == 'layer_edit'
    TableDeletionService(s.factory).execute(TableDeleteIntent.create(s.session_id, s.actor_id,
        'delete', {'table_id': s.table_id}))
    assert (await dispatch(s, request)).data['table_deleted']
    assert s.manager.get_table(s.table_id) is None
