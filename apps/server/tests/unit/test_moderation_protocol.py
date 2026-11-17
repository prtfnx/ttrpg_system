"""Real protocol/SQL moderation retires all tabs after durable acceptance."""
import asyncio
import json
import threading
from contextlib import contextmanager
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from core_table.protocol import Message, MessageType
from core_table.server import TableManager
from database.models import AuditLog, Base, GamePlayer, GameSession, User
from fastapi import WebSocket, WebSocketDisconnect
from service.game_session import ConnectionManager
from service.game_session_protocol import GameSessionProtocolService
from service.server_protocol import ServerProtocol
from service.session_moderation import SessionModerationService
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from starlette.websockets import WebSocketState


@pytest.fixture
async def game(tmp_path, monkeypatch):
    engine = create_engine(f"sqlite:///{tmp_path / 'moderation-protocol.db'}", connect_args={'check_same_thread': False})
    Base.metadata.create_all(engine)
    factory = sessionmaker(bind=engine)
    with factory() as db:
        db.add_all([User(id=i, username=f'user-{i}', hashed_password='unused') for i in (1, 2, 3, 4)])
        db.flush()
        db.add(GameSession(id=1, session_code='ROOM', name='Protocol', owner_id=1))
        db.flush()
        db.add_all([GamePlayer(session_id=1, user_id=i, role=role)
                    for i, role in ((1, 'owner'), (2, 'co_dm'), (3, 'player'), (4, 'spectator'))])
        db.commit()
    loop_thread = threading.get_ident()
    workers = []

    @contextmanager
    def worker_factory():
        assert threading.get_ident() != loop_thread
        with factory() as db:
            workers.append(db)
            yield db

    monkeypatch.setattr('service.session_moderation.SessionLocal', worker_factory)
    monkeypatch.setattr('service.session_join_hydration.SessionLocal', worker_factory)
    service = GameSessionProtocolService.__new__(GameSessionProtocolService)
    service.session_code, service.game_session_db_id, service.db_session = 'ROOM', 1, None
    service.clients = {name: AsyncMock(spec=WebSocket) for name in ('actor', 'codm', 'first', 'second', 'spectator')}
    users = {'actor': (1, 'owner'), 'codm': (2, 'co_dm'), 'first': (3, 'player'), 'second': (3, 'player'), 'spectator': (4, 'spectator')}
    service.client_info = {name: {'user_id': user, 'username': f'user-{user}', 'role': role}
                           for name, (user, role) in users.items()}
    service.websocket_to_client = {ws: name for name, ws in service.clients.items()}
    service._outboxes = {}
    service.table_manager = TableManager()
    service.server_protocol = ServerProtocol(service.table_manager, session_manager=service, transport_send=service.send_to_client)
    service.server_protocol._load_active_choice_encounter = AsyncMock(return_value=None)
    manager = ConnectionManager()
    manager.sessions_protocols['ROOM'] = service
    manager.active_connections['ROOM'] = list(service.clients.values())
    manager.connection_info = {ws: {**service.client_info[name], 'session_code': 'ROOM', 'client_id': name}
                               for name, ws in service.clients.items()}
    for ws, info in manager.connection_info.items():
        manager.user_connections.setdefault(info['user_id'], set()).add(ws)
    other = AsyncMock(spec=WebSocket)
    manager.active_connections['OTHER'] = [other]
    manager.connection_info[other] = {'session_code': 'OTHER', 'user_id': 3, 'role': 'owner', 'username': 'user-3'}
    manager.user_connections[3].add(other)
    service.revoke_user = manager.disconnect_user
    sockets = dict(service.clients)

    async def send(kind, *, actor='actor', data=None):
        request = Message(kind, data or {'player_id': '3'})
        await service.server_protocol.handle_client(request, actor)
        await service.drain_outbound()
        sends = sockets[actor].send_text
        assert isinstance(sends, AsyncMock)
        return next(Message.from_json(call.args[0]) for call in reversed(sends.call_args_list)
                    if json.loads(call.args[0]).get('causation_id') == request.message_id)

    yield SimpleNamespace(factory=factory, engine=engine, workers=workers, service=service, manager=manager,
                          sockets=sockets, other=other, send=send)
    for box in service._outboxes.values():
        box.close()
    await asyncio.gather(*(box.drain() for box in service._outboxes.values()), return_exceptions=True)
    engine.dispose()


@pytest.mark.parametrize('kind', [MessageType.PLAYER_KICK_REQUEST, MessageType.PLAYER_BAN_REQUEST])
async def test_committed_moderation_removes_membership_and_every_session_tab(game, kind):
    response = await game.send(kind)
    assert response.data['success'] is True
    assert set(game.service.clients) == {'actor', 'codm', 'spectator'}
    assert game.manager.user_connections[3] == {game.other}
    for name in ('first', 'second'):
        assert game.sockets[name] not in game.manager.connection_info
        game.sockets[name].close.assert_awaited_once_with(code=1008,
            reason='Banned from session' if kind == MessageType.PLAYER_BAN_REQUEST else 'Kicked from session')
    game.other.close.assert_not_awaited()
    with game.factory() as db:
        assert db.query(GamePlayer).filter_by(user_id=3).one_or_none() is None
        assert db.query(AuditLog).count() == 1
    assert game.workers


@pytest.mark.parametrize('change', ['actor_demoted', 'target_elevated'])
async def test_current_sql_hierarchy_overrides_stale_live_roles(game, change):
    with game.factory() as db:
        db.query(GamePlayer).filter_by(user_id=2 if change == 'actor_demoted' else 3).one().role = (
            'player' if change == 'actor_demoted' else 'co_dm')
        db.commit()
    response = await game.send(MessageType.PLAYER_KICK_REQUEST, actor='codm')
    assert response.type == MessageType.ERROR
    assert {'first', 'second'} <= game.service.clients.keys()
    with game.factory() as db:
        assert db.query(GamePlayer).filter_by(user_id=3).one() and db.query(AuditLog).count() == 0


async def test_transaction_failure_keeps_membership_bans_and_live_tabs(game, monkeypatch):
    class FailedAudit(Session):
        def flush(self, *args, **kwargs):
            if any(isinstance(row, AuditLog) for row in self.new):
                raise OSError('Audit unavailable')
            return super().flush(*args, **kwargs)

    monkeypatch.setattr('service.session_moderation.SessionLocal', sessionmaker(bind=game.engine, class_=FailedAudit))
    response = await game.send(MessageType.PLAYER_BAN_REQUEST)
    assert response.type == MessageType.ERROR
    for name in ('first', 'second'):
        game.sockets[name].close.assert_not_awaited()
    with game.factory() as db:
        assert db.query(GamePlayer).filter_by(user_id=3).one()
        assert db.query(AuditLog).count() == 0 and json.loads(db.get(GameSession, 1).ban_list) == []


@pytest.mark.parametrize('committed', [False, True])
async def test_unknown_commit_retires_old_authority_and_reports_unknown(game, monkeypatch, committed):
    class LostResponse(Session):
        def commit(self):
            if committed:
                super().commit()
            raise OSError('Response lost')

    monkeypatch.setattr('service.session_moderation.SessionLocal', sessionmaker(bind=game.engine, class_=LostResponse))
    response = await game.send(MessageType.PLAYER_BAN_REQUEST)
    assert response.data['code'] == 'outcome_unknown' and response.data['outcome'] == 'unknown'
    assert response.data['domain'] == 'session_moderation'
    assert 'success' not in response.data and 'not_accepted' not in response.data
    assert 'first' not in game.service.clients and 'second' not in game.service.clients
    with game.factory() as db:
        assert (db.query(GamePlayer).filter_by(user_id=3).one_or_none() is None) is committed


async def test_notification_failure_after_commit_cannot_turn_acceptance_into_rejection(game, monkeypatch):
    monkeypatch.setattr(game.service, 'broadcast_to_session', AsyncMock(side_effect=OSError('Peer unavailable')))
    response = await game.send(MessageType.PLAYER_KICK_REQUEST)
    assert response.data['success'] is True and response.data['resync_required'] is True
    with game.factory() as db:
        assert db.query(GamePlayer).filter_by(user_id=3).one_or_none() is None


async def test_all_tabs_are_fenced_before_a_slow_removal_notice(game):
    entered, release, held = asyncio.Event(), asyncio.Event(), asyncio.Event()
    boxes = []

    async def hold_notice(_payload):
        entered.set()
        await release.wait()

    async def hold_frame(_payload):
        await held.wait()

    for name in ('first', 'second'):
        game.sockets[name].send_text.side_effect = hold_frame
        game.sockets[name].send_json.side_effect = hold_notice
        await game.service.send_to_client(Message(MessageType.SUCCESS, {'inflight': True}), name)
        await game.service.send_to_client(Message(MessageType.SUCCESS, {'private_tail': True}), name)
        boxes.append(game.service._outboxes[game.sockets[name]])
    task = asyncio.create_task(game.send(MessageType.PLAYER_KICK_REQUEST))
    try:
        await asyncio.wait_for(entered.wait(), 3)
        assert all(box.closed and not box.queue for box in boxes)
        assert all(game.sockets[name] not in game.manager.connection_info for name in ('first', 'second'))
        assert 'first' not in game.service.clients and 'second' not in game.service.clients
        release.set()
        assert (await task).data['success']
    finally:
        release.set()
        held.set()
        await asyncio.gather(task, *(box.drain() for box in boxes), return_exceptions=True)


async def test_ban_blocks_rejoin_even_if_membership_is_recreated(game):
    assert (await game.send(MessageType.PLAYER_BAN_REQUEST)).data['success']
    with game.factory() as db:
        db.add(GamePlayer(session_id=1, user_id=3, role='player'))
        db.commit()
    game.service.db_session = True
    socket = AsyncMock(spec=WebSocket)
    with pytest.raises(PermissionError, match='Banned'):
        await game.manager.connect(socket, 'ROOM', 3, 'user-3')
    socket.send_text.assert_not_awaited()
    assert socket not in game.manager.connection_info


async def test_schema_valid_timed_ban_is_rejected_without_a_permanent_effect(game):
    response = await game.send(MessageType.PLAYER_BAN_REQUEST, data={'player_id': '3', 'duration': 15})
    assert response.type == MessageType.ERROR
    assert {'first', 'second'} <= game.service.clients.keys()
    with game.factory() as db:
        assert db.query(GamePlayer).filter_by(user_id=3).one()
        assert json.loads(db.get(GameSession, 1).ban_list) == []


async def test_moderation_invalidates_a_join_waiting_behind_its_sql_worker(game, monkeypatch):
    entered, release = threading.Event(), threading.Event()
    execute = SessionModerationService.execute

    def delayed(self, *args, **kwargs):
        entered.set()
        assert release.wait(5)
        return execute(self, *args, **kwargs)

    monkeypatch.setattr(SessionModerationService, 'execute', delayed)
    task = asyncio.create_task(game.send(MessageType.PLAYER_KICK_REQUEST))
    join = None
    socket = AsyncMock(spec=WebSocket)
    socket.application_state = WebSocketState.CONNECTED
    socket.close.side_effect = lambda **_: setattr(socket, 'application_state', WebSocketState.DISCONNECTED)
    try:
        assert await asyncio.to_thread(entered.wait, 2)
        join = asyncio.create_task(game.manager.connect(socket, 'ROOM', 3, 'user-3'))
        async with asyncio.timeout(2):
            while socket not in game.manager.connection_info:
                await asyncio.sleep(0)
        release.set()
        assert (await task).data['success']
        with pytest.raises(WebSocketDisconnect):
            await join
        socket.send_text.assert_not_awaited()
        assert not game.manager._pending_joins and socket not in game.manager.connection_info
    finally:
        release.set()
        await asyncio.gather(task, *([join] if join else []), return_exceptions=True)


async def test_unresponsive_removal_io_cannot_hold_session_mutations_forever(game, monkeypatch):
    monkeypatch.setattr('service.game_session._REMOVAL_IO_TIMEOUT_SECONDS', .01)
    never = asyncio.Event()

    async def blocked(*_args, **_kwargs):
        await never.wait()

    for name in ('first', 'second'):
        game.sockets[name].send_json.side_effect = blocked
        game.sockets[name].close.side_effect = blocked
    response = await asyncio.wait_for(game.send(MessageType.PLAYER_KICK_REQUEST), 2)
    assert response.data['success'] is True
    assert 'first' not in game.service.clients and 'second' not in game.service.clients
    assert not game.service.server_protocol._mutation_lock.locked()


async def test_repeated_cancellation_retains_sql_and_retirement_ownership(game, monkeypatch):
    entered, release = threading.Event(), threading.Event()
    execute = SessionModerationService.execute

    def delayed(self, *args, **kwargs):
        entered.set()
        assert release.wait(5)
        return execute(self, *args, **kwargs)

    monkeypatch.setattr(SessionModerationService, 'execute', delayed)
    task = asyncio.create_task(game.send(MessageType.PLAYER_BAN_REQUEST))
    try:
        assert await asyncio.to_thread(entered.wait, 2)
        for _ in range(2):
            task.cancel()
            await asyncio.sleep(0)
            assert not task.done() and game.service.server_protocol._mutation_lock.locked()
        release.set()
        with pytest.raises(asyncio.CancelledError):
            await task
        assert 'first' not in game.service.clients and 'second' not in game.service.clients
        with game.factory() as db:
            assert db.query(GamePlayer).filter_by(user_id=3).one_or_none() is None
            assert db.query(AuditLog).count() == 1
    finally:
        release.set()
        await asyncio.gather(task, return_exceptions=True)
