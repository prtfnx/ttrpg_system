"""Protocol/cache settlement with real SQL and injected commit/lookup failures."""
import asyncio
import copy
import threading
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from core_table.entities import Wall
from core_table.protocol import Message, MessageType
from database import crud, models
from service.protocol.base import ServerProtocol
from service.wall_command_service import WallCommandService
from sqlalchemy import event
from sqlalchemy.orm import scoped_session

from .test_wall_command_service import wall_scene as wall_scene


@pytest.fixture
def scene(wall_scene, monkeypatch):
    s = wall_scene
    wall_id = s.service.execute(s.intent(request_id='seed')).receipt['wall_id']
    with s.factory() as db:
        s.table.add_wall(Wall.from_dict(db.query(models.Wall).one().to_dict()))
    unrelated = Wall(s.table_id, 1, 2, 3, 4)
    s.table.add_wall(unrelated)
    crud.save_table_to_db(s.manager.db_session, s.table, s.session_id)
    s.unrelated = unrelated
    s.wall_id = wall_id
    session = SimpleNamespace(game_session_db_id=s.session_id,
        client_info={'client': {'user_id': s.actor_id}, 'other': {'user_id': 999}})
    s.proto = ServerProtocol(s.manager, session)
    monkeypatch.setattr(s.proto, '_get_session_id', lambda _msg: s.session_id)
    monkeypatch.setattr(s.proto, '_get_user_id', lambda _msg, client: s.actor_id if client == 'client' else 999)
    monkeypatch.setattr(s.proto, '_get_client_role', lambda _client: 'owner')
    monkeypatch.setattr(s.proto, '_get_session_code', lambda *_args: 'TEST01')
    monkeypatch.setattr(s.proto, '_wall_command_service', lambda: s.service)
    s.proto.send_to_client = AsyncMock()
    s.proto.broadcast_to_session = AsyncMock()
    s.request = lambda kind='door_toggle': Message(MessageType(kind), {
        'table_id': s.table_id, **({'wall_data': {'x1': 0, 'y1': 0, 'x2': 50, 'y2': 60}}
        if kind == 'wall_create' else {'wall_id': s.wall_id}),
        **({'updates': {'x2': 80}} if kind == 'wall_update' else {})})
    return s


async def dispatch(s, request, client='client'):
    assert await s.proto.handle_client(request, client)
    response = s.proto.send_to_client.call_args.args[0]
    Message.from_dict(response.to_dict())
    return response


def lose_commit(s, monkeypatch, committed):
    execute = s.service.execute
    def failing_factory():
        db = s.factory()
        def lost(_db):
            raise OSError('Private lost commit response')
        event.listen(db, 'after_commit' if committed else 'before_commit', lost, once=True)
        return db
    monkeypatch.setattr(s.service, 'execute', lambda *args: WallCommandService(failing_factory).execute(*args))
    return execute


@pytest.mark.parametrize('committed', [False, True])
@pytest.mark.parametrize('outage', [False, True])
@pytest.mark.parametrize('kind', ['wall_create', 'wall_update', 'wall_remove', 'door_toggle'])
async def test_original_settles_and_current_wall_installs_before_quarantine_clears(scene, monkeypatch, committed, outage, kind):
    s = scene
    request = s.request(kind)
    retry = copy.deepcopy(request)
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
        assert s.proto._has_pending_writes() and not s.manager.persistence_allowed()
        assert not await s.manager.save_table_async(s.table_id, s.session_id)
        follower = s.request('door_toggle')
        blocked = await dispatch(s, follower, 'other')
        assert blocked.data['outcome'] == 'unknown'
        assert blocked.causation_id == follower.message_id
        assert 'operation_id' not in blocked.data
        assert not s.proto.broadcast_to_session.await_count
        available = True
        response = await dispatch(s, retry)
    assert not s.proto._has_pending_writes() and s.manager.persistence_allowed()
    assert response.causation_id == request.message_id
    assert 'Private' not in str(response.data)
    if committed:
        assert response.type == MessageType.SUCCESS and response.data['domain'] == 'wall_command'
    else:
        assert response.type == MessageType.ERROR and response.data['code'] == 'persistence_failed'
    assert s.table.get_wall(s.unrelated.wall_id) is s.unrelated
    with s.factory() as db:
        expected = {row.wall_id: row.to_dict() for row in db.query(models.Wall).all()}
        assert {key: row.to_dict() for key, row in s.table.walls.items()} == expected


async def test_normal_and_replayed_toggle_never_toggle_twice_or_broadcast_historical_wall(scene):
    s = scene
    request = s.request()
    fresh = await dispatch(s, request)
    assert fresh.type == MessageType.WALL_DATA and fresh.data['wall']['door_state'] == 'open'
    with s.factory() as db, db.begin():
        crud.update_wall(db, s.wall_id, {'door_state': 'closed', 'x2': 120}, commit=False)
    s.proto.broadcast_to_session.reset_mock()
    replay = await dispatch(s, request)
    assert replay.type == MessageType.SUCCESS and replay.data['resync_required']
    assert 'wall' not in replay.data
    assert s.table.get_wall(s.wall_id).door_state == 'closed'
    assert s.table.get_wall(s.wall_id).x2 == 120
    for call in s.proto.broadcast_to_session.call_args_list:
        assert call.args[0].type == MessageType.SPRITE_RESPONSE
        assert 'wall' not in call.args[0].data


async def test_failed_cache_installation_retains_owner_and_uses_current_deletion(scene, monkeypatch):
    s = scene
    install = s.proto._install_wall_resolution
    monkeypatch.setattr(s.proto, '_install_wall_resolution', AsyncMock(side_effect=RuntimeError('cache failure')))
    request = s.request()
    assert (await dispatch(s, request)).data['outcome'] == 'unknown'
    assert s.proto._pending_wall_command.accepted
    with s.factory() as db, db.begin():
        crud.delete_wall(db, s.wall_id, commit=False)
    monkeypatch.setattr(s.proto, '_install_wall_resolution', install)
    response = await dispatch(s, request)
    assert response.type == MessageType.SUCCESS
    assert s.table.get_wall(s.wall_id) is None


async def test_revoked_actor_can_repair_cache_without_disclosing_original_receipt(scene, monkeypatch):
    s = scene
    resolver = s.service.resolve
    monkeypatch.setattr(s.service, 'resolve', lambda _: (_ for _ in ()).throw(OSError('outage')))
    lose_commit(s, monkeypatch, True)
    request = s.request()
    assert (await dispatch(s, request)).data['outcome'] == 'unknown'
    with s.factory() as db, db.begin():
        owner = models.User(username='newowner', email='newowner@example.com', hashed_password='test')
        db.add(owner)
        db.flush()
        db.get(models.GameSession, s.session_id).owner_id = owner.id
        db.query(models.GamePlayer).filter_by(session_id=s.session_id, user_id=s.actor_id).one().role = 'spectator'
    monkeypatch.setattr(s.service, 'resolve', resolver)
    response = await dispatch(s, request)
    assert response.type == MessageType.ERROR and response.data['code'] == 'forbidden'
    assert response.data['outcome'] == 'unknown' and 'wall_id' not in response.data
    assert s.table.get_wall(s.wall_id).door_state == 'open'
    assert not s.proto._has_pending_writes()


async def test_repeated_cancellation_holds_session_owner_through_commit_and_publication(scene, monkeypatch):
    s = scene
    execute = s.service.execute
    started, release = threading.Event(), threading.Event()
    def slow(*args):
        started.set()
        assert release.wait(5)
        return execute(*args)
    monkeypatch.setattr(s.service, 'execute', slow)
    request = s.request()
    task = asyncio.create_task(s.proto.handle_client(request, 'client'))
    while not started.is_set():
        await asyncio.sleep(0)
    task.cancel()
    await asyncio.sleep(0)
    task.cancel()
    await asyncio.sleep(0)
    assert not task.done() and s.proto._mutation_lock.locked()
    assert s.proto._has_pending_writes()
    release.set()
    with pytest.raises(asyncio.CancelledError):
        await task
    assert s.table.get_wall(s.wall_id).door_state == 'open'
    assert not s.proto._has_pending_writes()
    assert s.proto.broadcast_to_session.await_count


@pytest.mark.parametrize('available', [False, True])
async def test_join_and_empty_cleanup_wait_for_wall_settlement_after_socket_removal(scene, monkeypatch, available):
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
    assert s.table.get_wall(s.wall_id).door_state == 'open'
    assert not s.proto._has_pending_writes()
    for outbox in svc._outboxes.values():
        await outbox.drain()
        outbox.close()


async def test_task_scoped_production_session_uses_the_durable_path(scene):
    s = scene
    s.manager.db_session = scoped_session(s.factory)
    try:
        assert s.proto._durable_wall_commands()
        response = await dispatch(s, s.request())
        assert response.type == MessageType.WALL_DATA
    finally:
        s.manager.db_session.remove()


async def test_missing_known_accepted_receipt_cannot_clear_quarantine(scene, monkeypatch):
    s = scene
    install = s.proto._install_wall_resolution
    monkeypatch.setattr(s.proto, '_install_wall_resolution', AsyncMock(side_effect=RuntimeError('cache failure')))
    request = s.request()
    assert (await dispatch(s, request)).data['outcome'] == 'unknown'
    with s.factory() as db, db.begin():
        db.query(models.SessionOperationReceipt).filter_by(operation_id=request.message_id).delete()
    monkeypatch.setattr(s.proto, '_install_wall_resolution', install)
    assert (await dispatch(s, request)).data['outcome'] == 'unknown'
    assert s.proto._has_pending_writes() and not s.manager.persistence_allowed()


async def test_changed_original_cannot_reapply_after_recovery(scene, monkeypatch):
    s = scene
    resolver = s.service.resolve
    monkeypatch.setattr(s.service, 'resolve', lambda _: (_ for _ in ()).throw(OSError('outage')))
    lose_commit(s, monkeypatch, True)
    request = s.request('wall_update')
    assert (await dispatch(s, request)).data['outcome'] == 'unknown'
    monkeypatch.setattr(s.service, 'resolve', resolver)
    request.data['updates']['x2'] = 200
    response = await dispatch(s, request)
    assert response.data['code'] == 'conflict'
    assert s.table.get_wall(s.wall_id).x2 == 80
    assert not s.proto._has_pending_writes()


async def test_unknown_table_is_rejected_before_admission_without_quarantining_session(scene):
    import uuid
    s = scene
    request = s.request()
    request.data['table_id'] = str(uuid.uuid4())
    response = await dispatch(s, request)
    assert response.type == MessageType.ERROR and response.data['code'] == 'forbidden'
    assert not s.proto._has_pending_writes()


async def test_wall_database_work_runs_off_server_loop(scene, test_db_engine):
    s = scene
    threads = []
    main_thread = threading.get_ident()
    def observe(*_args):
        threads.append(threading.get_ident())
    event.listen(test_db_engine, 'before_cursor_execute', observe)
    try:
        assert (await dispatch(s, s.request())).type == MessageType.WALL_DATA
    finally:
        event.remove(test_db_engine, 'before_cursor_execute', observe)
    assert threads and all(thread != main_thread for thread in threads)


async def test_replay_of_wall_in_later_deleted_table_retires_current_cache(scene):
    from service.table_deletion_service import TableDeleteIntent, TableDeletionService
    s = scene
    request = s.request()
    assert (await dispatch(s, request)).type == MessageType.WALL_DATA
    TableDeletionService(s.factory).execute(TableDeleteIntent.create(s.session_id, s.actor_id,
        'later-delete', {'table_id': s.table_id}))
    response = await dispatch(s, request)
    assert response.type == MessageType.SUCCESS and response.data['table_deleted']
    assert s.manager.get_table(s.table_id) is None and s.table_id not in s.manager.tables_id
    assert not s.proto._has_pending_writes()
