"""Session policy cannot resume until uncertain settings settle and install."""
import asyncio
import json
import threading
from unittest.mock import AsyncMock

import pytest
from core_table.protocol import Message, MessageType
from database import models
from service.session_edit_service import SessionEditService
from sqlalchemy import event

from . import test_table_edit_recovery
from .test_table_edit_recovery import dispatch
from .test_table_edit_service import table_scene as table_scene

table_protocol = test_table_edit_recovery.scene


@pytest.fixture
def scene(table_protocol, monkeypatch):
    s = table_protocol
    s.service = SessionEditService(s.factory)
    monkeypatch.setattr(s.proto, '_session_edit_service', lambda: s.service)
    s.request = lambda kind='game_mode_change': Message(MessageType(kind),
        {'game_mode': 'explore'} if kind == 'game_mode_change' else {'rules': {'default_movement_speed': 45}})
    return s


def lose_commit(s, monkeypatch, committed):
    def factory():
        db = s.factory()
        def lost(_db):
            raise OSError('Private commit error')
        event.listen(db, 'after_commit' if committed else 'before_commit', lost, once=True)
        return db
    monkeypatch.setattr(s.service, 'execute', lambda intent: SessionEditService(factory).execute(intent))


@pytest.mark.parametrize('kind', ['game_mode_change', 'session_rules_update'])
@pytest.mark.parametrize('committed', [False, True])
@pytest.mark.parametrize('outage', [False, True])
async def test_settlement_and_current_cache_install_precede_state_work(scene, monkeypatch, kind, committed, outage):
    s = scene
    resolver, available = s.service.resolve, not outage
    def resolve(attempt):
        if not available:
            raise OSError('Private lookup outage')
        return resolver(attempt)
    monkeypatch.setattr(s.service, 'resolve', resolve)
    lose_commit(s, monkeypatch, committed)
    request = s.request(kind)
    response = await dispatch(s, request)
    if outage:
        assert response.data['outcome'] == 'unknown' and s.proto._has_pending_writes()
        assert not s.manager.persistence_allowed()
        assert not await s.manager.save_table_async(s.table_id, s.session_id)
        assert not s.proto._rules_cache
        blocked = await dispatch(s, Message(MessageType.SESSION_RULES_REQUEST, {}), 'other')
        assert blocked.data['outcome'] == 'unknown' and 'operation_id' not in blocked.data
        available = True
        response = await dispatch(s, request)
    assert response.type == (MessageType.SUCCESS if committed else MessageType.ERROR)
    assert response.causation_id == request.message_id and 'Private' not in str(response.data)
    assert 'rules' not in response.data and 'game_mode' not in response.data
    assert not s.proto._has_pending_writes() and s.manager.persistence_allowed()
    current = s.service.load(s.session_id, s.actor_id)
    rules, mode = s.proto._rules_cache[current['session_code']]
    assert rules.to_dict() == current['rules'] and mode == current['mode']
    s.proto.session_manager.auto_save.assert_not_awaited()


@pytest.mark.parametrize('kind', ['game_mode_change', 'session_rules_update'])
async def test_failed_installation_uses_later_policy_without_rewriting_it(scene, monkeypatch, kind):
    s = scene
    install = s.proto._install_session_edit
    monkeypatch.setattr(s.proto, '_install_session_edit', AsyncMock(side_effect=RuntimeError('cache')))
    request = s.request(kind)
    assert (await dispatch(s, request)).data['outcome'] == 'unknown'
    assert s.proto._pending_session_edit.accepted
    with s.factory() as db, db.begin():
        game = db.get(models.GameSession, s.session_id)
        game.game_mode = 'custom'
        game.session_rules_json = json.dumps({'default_movement_speed': 60})
        code = game.session_code
    monkeypatch.setattr(s.proto, '_install_session_edit', install)
    assert (await dispatch(s, request)).data['success']
    rules, mode = s.proto._rules_cache[code]
    assert mode == 'custom' and rules.default_movement_speed == 60


async def test_revocation_repairs_current_cache_but_withholds_private_acceptance(scene, monkeypatch, player_user):
    s = scene
    resolver = s.service.resolve
    monkeypatch.setattr(s.service, 'resolve', lambda _: (_ for _ in ()).throw(OSError('lookup')))
    lose_commit(s, monkeypatch, True)
    request = s.request()
    assert (await dispatch(s, request)).data['outcome'] == 'unknown'
    with s.factory() as db, db.begin():
        db.get(models.GameSession, s.session_id).owner_id = player_user.id
        db.query(models.GamePlayer).filter_by(session_id=s.session_id, user_id=s.actor_id).delete()
    monkeypatch.setattr(s.service, 'resolve', resolver)
    response = await dispatch(s, request)
    assert response.data['code'] == 'forbidden' and 'success' not in response.data
    assert not s.proto._has_pending_writes() and next(iter(s.proto._rules_cache.values()))[1] == 'explore'
    assert (await dispatch(s, s.request())).data['code'] == 'forbidden'


async def test_missing_accepted_receipt_and_changed_original_are_not_reapplied(scene, monkeypatch):
    s = scene
    install = s.proto._install_session_edit
    monkeypatch.setattr(s.proto, '_install_session_edit', AsyncMock(side_effect=RuntimeError('cache')))
    original = s.request()
    assert (await dispatch(s, original)).data['outcome'] == 'unknown'
    with s.factory() as db, db.begin():
        receipt = db.query(models.SessionOperationReceipt).one()
        db.delete(receipt)
    monkeypatch.setattr(s.proto, '_install_session_edit', install)
    assert (await dispatch(s, original)).data['outcome'] == 'unknown'
    assert s.proto._has_pending_writes()


async def test_changed_retry_conflicts_after_current_repair(scene, monkeypatch):
    s = scene
    resolver = s.service.resolve
    monkeypatch.setattr(s.service, 'resolve', lambda _: (_ for _ in ()).throw(OSError('lookup')))
    lose_commit(s, monkeypatch, True)
    original = s.request()
    assert (await dispatch(s, original)).data['outcome'] == 'unknown'
    monkeypatch.setattr(s.service, 'resolve', resolver)
    changed = Message(MessageType.GAME_MODE_CHANGE, {'game_mode': 'fight'}, message_id=original.message_id)
    assert (await dispatch(s, changed)).data['code'] == 'conflict'
    assert not s.proto._has_pending_writes() and s.service.load(s.session_id, s.actor_id)['mode'] == 'explore'


async def test_repeated_cancellation_retains_session_lock_until_installation(scene, monkeypatch):
    s = scene
    install, entered, release = s.proto._install_session_edit, asyncio.Event(), asyncio.Event()
    async def delayed(current):
        entered.set()
        await release.wait()
        await install(current)
    monkeypatch.setattr(s.proto, '_install_session_edit', delayed)
    task = asyncio.create_task(dispatch(s, s.request()))
    await entered.wait()
    task.cancel()
    await asyncio.sleep(0)
    task.cancel()
    assert s.proto._mutation_lock.locked() and not task.done() and s.proto._has_pending_writes()
    release.set()
    with pytest.raises(asyncio.CancelledError):
        await task
    assert not s.proto._has_pending_writes() and not s.proto._mutation_lock.locked()


async def test_sql_is_off_loop_publication_failure_does_not_reject_acceptance(scene, monkeypatch, test_db_engine):
    s = scene
    monkeypatch.setattr(s.proto, 'broadcast_to_session', AsyncMock(side_effect=RuntimeError('transport')))
    threads, main = [], threading.get_ident()
    def observe(*_args):
        threads.append(threading.get_ident())
    event.listen(test_db_engine, 'before_cursor_execute', observe)
    try:
        assert (await dispatch(s, s.request())).data['success']
    finally:
        event.remove(test_db_engine, 'before_cursor_execute', observe)
    assert threads and all(thread != main for thread in threads)


async def test_current_query_sends_once_and_failure_retains_policy(scene, monkeypatch):
    s = scene
    request = Message(MessageType.SESSION_RULES_REQUEST, {})
    response = await dispatch(s, request)
    assert response.type == MessageType.SESSION_RULES_CHANGED and response.data['mode'] == 'free_roam'
    assert s.proto.send_to_client.await_count == 1
    cache = dict(s.proto._rules_cache)
    monkeypatch.setattr(s.service, 'load', lambda *_: (_ for _ in ()).throw(OSError('Private DB details')))
    response = await dispatch(s, Message(MessageType.SESSION_RULES_REQUEST, {}))
    assert response.data['code'] == 'session_settings_unavailable' and 'Private' not in str(response.data)
    assert s.proto._rules_cache == cache


@pytest.mark.parametrize('available', [False, True])
async def test_join_settles_before_loading_fresh_metadata_and_empty_cleanup_stays_guarded(scene, monkeypatch, available):
    from service.game_session_protocol import GameSessionProtocolService
    s = scene
    resolver = s.service.resolve
    monkeypatch.setattr(s.service, 'resolve', lambda _: (_ for _ in ()).throw(OSError('lookup')))
    lose_commit(s, monkeypatch, True)
    assert (await dispatch(s, s.request())).data['outcome'] == 'unknown'
    current = s.service.load(s.session_id, s.actor_id)
    svc = GameSessionProtocolService.__new__(GameSessionProtocolService)
    svc.server_protocol, svc.table_manager = s.proto, s.manager
    svc.session_code, svc.game_session_db_id, svc.db_session = current['session_code'], s.session_id, s.manager.db_session
    svc.clients, svc.client_info, svc.websocket_to_client, svc._outboxes = {}, {}, {}, {}
    s.proto.session_manager = svc
    s.proto._load_active_choice_encounter = AsyncMock(return_value=None)
    monkeypatch.setattr('service.session_join_hydration.SessionLocal', s.factory)
    assert not await svc.save_to_database_async()
    socket = AsyncMock()
    socket.scope = {'query_string': b''}
    if not available:
        with pytest.raises(RuntimeError, match='settle'):
            await svc.add_client(socket, 'replacement', {'user_id': s.actor_id, 'role': 'owner'})
        assert not svc.clients
        return
    monkeypatch.setattr(s.service, 'resolve', resolver)
    await svc.add_client(socket, 'replacement', {'user_id': s.actor_id, 'role': 'owner'})
    welcome = Message.from_json(socket.send_text.call_args.args[0])
    assert welcome.type == MessageType.WELCOME and welcome.data['game_mode'] == 'explore'
    assert not s.proto._has_pending_writes()
    await svc.remove_client(socket)
