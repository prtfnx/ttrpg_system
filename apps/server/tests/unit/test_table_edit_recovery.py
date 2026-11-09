"""Table field saves retain their original owner until current installation."""
import asyncio
import copy
import threading
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from core_table.protocol import Message, MessageType
from database import models
from service.protocol.base import ServerProtocol
from service.table_edit_service import TableEditService
from sqlalchemy import event
from sqlalchemy.orm import scoped_session

from .test_table_edit_service import table_scene as table_scene


@pytest.fixture
def scene(table_scene, monkeypatch):
    s = table_scene
    session = SimpleNamespace(game_session_db_id=s.session_id,
        client_info={'client': {'user_id': s.actor_id}, 'other': {'user_id': 999}},
        auto_save=AsyncMock(side_effect=AssertionError('Receipt acceptance must not trigger a full snapshot')))
    s.proto = ServerProtocol(s.manager, session)
    monkeypatch.setattr(s.proto, '_get_session_id', lambda _msg: s.session_id)
    monkeypatch.setattr(s.proto, '_get_user_id', lambda _msg, client: s.actor_id if client == 'client' else 999)
    monkeypatch.setattr(s.proto, '_get_client_role', lambda _client: 'owner')
    monkeypatch.setattr(s.proto, '_get_session_code', lambda *_args: 'TEST01')
    monkeypatch.setattr(s.proto, '_table_edit_service', lambda: s.service)
    s.proto.send_to_client = AsyncMock()
    s.proto.broadcast_to_session = AsyncMock()
    def request(kind='table_move'):
        data = {'table_id': s.table_id, **({'x_moved': 15, 'y_moved': 30} if kind == 'table_move'
            else {'scale': 2} if kind == 'table_scale' else {'table_name': 'Changed', 'width': 1500})}
        if kind == 'table_update_request':
            data = {'category': 'table', 'type': 'table_update', 'data': data}
        return Message(MessageType(kind), data)
    s.request = request
    return s


async def dispatch(s, request, client='client'):
    assert await s.proto.handle_client(request, client)
    response = s.proto.send_to_client.call_args.args[0]
    Message.from_dict(response.to_dict())
    return response


def lose_commit(s, monkeypatch, committed):
    def factory():
        db = s.factory()
        def lost(_db):
            raise OSError('Private commit response failure')
        event.listen(db, 'after_commit' if committed else 'before_commit', lost, once=True)
        return db
    monkeypatch.setattr(s.service, 'execute', lambda *args: TableEditService(factory).execute(*args))


@pytest.mark.parametrize('kind', ['table_move', 'table_scale', 'table_update_request'])
@pytest.mark.parametrize('committed', [False, True])
@pytest.mark.parametrize('outage', [False, True])
async def test_settlement_and_installation_precede_quarantine_release(scene, monkeypatch, kind, committed, outage):
    s = scene
    request = s.request(kind)
    resolver = s.service.resolve
    available = not outage
    def resolve(attempt):
        if not available:
            raise OSError('Private lookup outage')
        return resolver(attempt)
    monkeypatch.setattr(s.service, 'resolve', resolve)
    lose_commit(s, monkeypatch, committed)
    response = await dispatch(s, request)
    if outage:
        assert response.data['outcome'] == 'unknown'
        assert s.table.display_name == 'Original' and getattr(s.table, 'position', (0, 0)) == (0, 0)
        assert s.proto._has_pending_writes() and not s.manager.persistence_allowed()
        assert not await s.manager.save_table_async(s.table_id, s.session_id)
        follower = s.request(kind)
        blocked = await dispatch(s, follower, 'other')
        assert blocked.data['outcome'] == 'unknown'
        assert blocked.causation_id == follower.message_id and 'operation_id' not in blocked.data
        assert blocked.data['table_id'] == s.table_id
        available = True
        response = await dispatch(s, copy.deepcopy(request))
    assert not s.proto._has_pending_writes() and s.manager.persistence_allowed()
    assert response.causation_id == request.message_id and 'Private' not in str(response.data)
    assert response.type == (MessageType.SUCCESS if committed else MessageType.ERROR)
    if not committed:
        assert response.data['code'] == 'persistence_failed'
    assert not s.proto.actions._dirty_tables
    s.proto.session_manager.auto_save.assert_not_awaited()
    with s.factory() as db:
        row = db.query(models.VirtualTable).one()
        assert s.table.display_name == row.name and s.table.width == row.width
        assert getattr(s.table, 'position', (0, 0)) == (row.position_x, row.position_y)
        assert getattr(s.table, 'scale', (1, 1)) == (row.scale_x, row.scale_y)


async def test_failed_installation_recovers_current_fields_and_preserves_unrelated_retained_state(scene, monkeypatch):
    s = scene
    install = s.proto._install_table_edit
    monkeypatch.setattr(s.proto, '_install_table_edit', AsyncMock(side_effect=RuntimeError('cache error')))
    request = s.request()
    assert (await dispatch(s, request)).data['outcome'] == 'unknown'
    assert s.proto._pending_table_edit.accepted
    token = s.table.find_entity_by_sprite_id('untouched')
    token.name = 'Retained'
    s.table.display_name = 'Retained name'
    with s.factory() as db, db.begin():
        db.query(models.VirtualTable).one().position_x = 80
    monkeypatch.setattr(s.proto, '_install_table_edit', install)
    response = await dispatch(s, request)
    assert response.data['success'] and response.data['resync_required']
    assert s.table.position == (80, 30) and s.table.display_name == 'Retained name'
    assert s.table.find_entity_by_sprite_id('untouched') is token and token.name == 'Retained'
    assert s.manager.tables_id[s.table_id] is s.table
    assert 'current' not in response.data


async def test_revocation_repairs_cache_without_disclosing_original_acceptance(scene, monkeypatch):
    s = scene
    resolver = s.service.resolve
    monkeypatch.setattr(s.service, 'resolve', lambda _: (_ for _ in ()).throw(OSError('outage')))
    lose_commit(s, monkeypatch, True)
    request = s.request('table_scale')
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
    assert 'domain' not in response.data and s.table.scale == (2, 2)
    assert not s.proto._has_pending_writes()
    # A stale cached owner role cannot authorize another table edit.
    denied = await dispatch(s, s.request())
    assert denied.data['code'] == 'forbidden'


async def test_repeated_cancellation_cannot_release_owner_before_acceptance_and_publication(scene, monkeypatch):
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
    assert not task.done() and s.proto._mutation_lock.locked() and s.proto._has_pending_writes()
    release.set()
    with pytest.raises(asyncio.CancelledError):
        await task
    assert s.table.position == (15, 30) and not s.proto._has_pending_writes()
    assert s.proto.broadcast_to_session.await_count


@pytest.mark.parametrize('available', [False, True])
async def test_join_and_empty_cleanup_wait_for_settlement_after_original_socket_disappears(scene, monkeypatch, available):
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
            assert not svc.clients and s.proto._has_pending_writes()
            return
        await svc._register_client(socket, 'replacement', {'user_id': s.actor_id}, 'free_roam', {})
    await svc.drain_outbound()
    assert s.table.position == (15, 30) and not s.proto._has_pending_writes()


async def test_known_accepted_missing_receipt_retains_quarantine(scene, monkeypatch):
    s = scene
    install = s.proto._install_table_edit
    monkeypatch.setattr(s.proto, '_install_table_edit', AsyncMock(side_effect=RuntimeError('cache error')))
    request = s.request()
    assert (await dispatch(s, request)).data['outcome'] == 'unknown'
    with s.factory() as db, db.begin():
        db.query(models.SessionOperationReceipt).delete()
    monkeypatch.setattr(s.proto, '_install_table_edit', install)
    assert (await dispatch(s, request)).data['outcome'] == 'unknown'
    assert s.proto._has_pending_writes()


async def test_normal_and_duplicate_edits_publish_only_resync_and_no_snapshot_save(scene):
    s = scene
    request = s.request('table_update_request')
    assert (await dispatch(s, request)).data['replayed'] is False
    with s.factory() as db, db.begin():
        db.query(models.VirtualTable).one().name = 'Later'
    assert (await dispatch(s, request)).data['replayed'] is True
    assert s.table.display_name == 'Later'
    for call in s.proto.broadcast_to_session.call_args_list:
        assert call.args[0].data == {'table_id': s.table_id, 'operation': 'resync', 'resync_required': True}
    s.proto.session_manager.auto_save.assert_not_awaited()


async def test_changed_original_cannot_reapply_after_recovery(scene, monkeypatch):
    s = scene
    resolver = s.service.resolve
    monkeypatch.setattr(s.service, 'resolve', lambda _: (_ for _ in ()).throw(OSError('outage')))
    lose_commit(s, monkeypatch, True)
    request = s.request()
    assert (await dispatch(s, request)).data['outcome'] == 'unknown'
    monkeypatch.setattr(s.service, 'resolve', resolver)
    request.data['x_moved'] = 500
    assert (await dispatch(s, request)).data['code'] == 'conflict'
    assert s.table.position == (15, 30)


async def test_later_table_deletion_retires_both_indexes(scene):
    from service.table_deletion_service import TableDeleteIntent, TableDeletionService
    s = scene
    request = s.request()
    assert (await dispatch(s, request)).data['success']
    TableDeletionService(s.factory).execute(TableDeleteIntent.create(s.session_id, s.actor_id,
        'delete', {'table_id': s.table_id}))
    assert (await dispatch(s, request)).data['table_deleted']
    assert s.manager.get_table(s.table_id) is None and s.table_id not in s.manager.tables_id


async def test_task_scoped_database_session_selects_owned_worker_and_sql_stays_off_loop(scene, test_db_engine):
    s = scene
    s.manager.db_session = scoped_session(s.factory)
    threads, main_thread = [], threading.get_ident()
    def observe(*_args):
        threads.append(threading.get_ident())
    event.listen(test_db_engine, 'before_cursor_execute', observe)
    try:
        assert (await dispatch(s, s.request())).data['success']
    finally:
        event.remove(test_db_engine, 'before_cursor_execute', observe)
        s.manager.db_session.remove()
    assert threads and all(thread != main_thread for thread in threads)


async def test_batched_followers_remain_unadmitted_and_keep_their_own_identities(scene, monkeypatch):
    s = scene
    resolver = s.service.resolve
    monkeypatch.setattr(s.service, 'resolve', lambda _: (_ for _ in ()).throw(OSError('outage')))
    lose_commit(s, monkeypatch, True)
    first, follower = s.request('table_update_request'), s.request('table_scale')
    batch = Message(MessageType.BATCH_REQUEST, {'messages': [first.to_dict(), follower.to_dict()]})
    summary = await dispatch(s, batch)
    assert summary.data['failed_count'] == 2
    replies = [call.args[0] for call in s.proto.send_to_client.call_args_list
        if call.args[0].causation_id in {first.message_id, follower.message_id}]
    assert len(replies) == 2 and all(reply.data['outcome'] == 'unknown' for reply in replies)
    with s.factory() as db:
        assert db.query(models.SessionOperationReceipt).count() == 1
        assert db.query(models.VirtualTable).one().scale_x == 1
    monkeypatch.setattr(s.service, 'resolve', resolver)
    assert (await dispatch(s, first)).data['success']
    assert getattr(s.table, 'scale', (1, 1)) == (1, 1)
