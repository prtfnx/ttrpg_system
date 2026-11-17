"""Private welcomes cannot outlive role changes while a join is suspended."""
import asyncio
import json
import threading
import time
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import jwt
import pytest
from api import game_ws
from core_table.server import TableManager
from database import models
from fastapi import WebSocket, WebSocketDisconnect
from service import game_session
from service.authentication import ALGORITHM, SECRET_KEY
from service.game_session import ConnectionManager
from service.game_session_protocol import GameSessionProtocolService
from service.server_protocol import ServerProtocol
from sqlalchemy.orm import sessionmaker


@pytest.fixture
def joining(monkeypatch):
    service = GameSessionProtocolService.__new__(GameSessionProtocolService)
    service.session_code, service.game_session_db_id, service.db_session = 'ROOM', None, None
    service.clients, service.client_info, service.websocket_to_client, service._outboxes = {}, {}, {}, {}
    service.table_manager = TableManager()
    service.server_protocol = ServerProtocol(service.table_manager, session_manager=service)
    encounter = SimpleNamespace(to_dict=lambda dm=False: {'dm_notes': 'private' if dm else ''})
    service.server_protocol._load_active_choice_encounter = AsyncMock(return_value=encounter)
    manager = ConnectionManager()
    manager.sessions_protocols['ROOM'] = service
    manager.broadcast_to_session = AsyncMock()
    assets = MagicMock()
    monkeypatch.setattr(game_session, 'get_server_asset_manager', lambda: assets)
    frames = []

    async def transport(frame):
        frames.append(frame)

    socket = WebSocket({'type': 'websocket', 'query_string': b'', 'headers': []},
                       receive=AsyncMock(return_value={'type': 'websocket.connect'}), send=transport)
    return SimpleNamespace(manager=manager, service=service, socket=socket, frames=frames,
                           assets=assets, encounter=encounter)


@pytest.mark.parametrize('phase', ['load', 'hydrate', 'reauthorize'])
@pytest.mark.parametrize('change', ['demote', 'promote', 'kick', 'account'])
async def test_revocation_prevents_private_welcome_and_late_registration(joining, monkeypatch, phase, change):
    game = joining
    entered, release = asyncio.Event(), asyncio.Event()
    worker_entered, worker_release = threading.Event(), threading.Event()
    before = 'player' if change == 'promote' else 'co_dm'
    reauthorize = AsyncMock(return_value=before)

    async def delayed(*_args):
        entered.set()
        await release.wait()
        return before if phase == 'reauthorize' else game.encounter

    def load(_code):
        worker_entered.set()
        assert worker_release.wait(5)
        return game.service, None

    if phase == 'load':
        game.manager.sessions_protocols.clear()
        monkeypatch.setattr(game_session, '_load_protocol_service', load)
    elif phase == 'hydrate':
        game.service.server_protocol._load_active_choice_encounter = AsyncMock(side_effect=delayed)
    else:
        reauthorize.side_effect = delayed
    task = asyncio.create_task(game.manager.connect(game.socket, 'ROOM', 7, 'member', before,
                                                    reauthorize=reauthorize))
    retirement = None
    try:
        if phase == 'load':
            assert await asyncio.to_thread(worker_entered.wait, 2)
        else:
            await asyncio.wait_for(entered.wait(), 2)
        if change in {'demote', 'promote'}:
            retirement = asyncio.create_task(game.manager.refresh_user_role('ROOM', 7,
                'co_dm' if change == 'promote' else 'player'))
        elif change == 'kick':
            retirement = asyncio.create_task(game.manager.disconnect_user('ROOM', 7, reason='Kicked'))
        else:
            retirement = asyncio.create_task(game.manager.disconnect_account(7, reason='Revoked'))
        await asyncio.sleep(0)
        release.set()
        worker_release.set()
        with pytest.raises(WebSocketDisconnect) as stopped:
            await asyncio.wait_for(task, 3)
        expected = 1012 if change in {'demote', 'promote'} else 4003
        assert stopped.value.code == expected
        await asyncio.wait_for(retirement, 3)
        assert not any(frame['type'] == 'websocket.send' and '"welcome"' in frame.get('text', '')
                       for frame in game.frames)
        assert any(frame['type'] == 'websocket.close' and frame['code'] == expected for frame in game.frames)
        assert not game.manager._pending_joins
        assert not game.manager.connection_info and not game.manager.active_connections
        assert not game.manager.user_connections
        assert not game.service.clients and not game.service.websocket_to_client
        assert not game.service._outboxes
        assert all(call.args[1].type.value != 'player_joined'
                   for call in game.manager.broadcast_to_session.await_args_list)
    finally:
        release.set()
        worker_release.set()
        await asyncio.gather(task, *([retirement] if retirement else []), return_exceptions=True)


async def test_final_authority_controls_welcome_indexes_assets_and_peer_announcement(joining):
    game = joining
    client = await game.manager.connect(game.socket, 'ROOM', 7, 'member', 'co_dm',
                                        reauthorize=AsyncMock(return_value='spectator'))
    welcome = next(json.loads(frame['text'])['data'] for frame in game.frames if frame['type'] == 'websocket.send')
    assert welcome['role'] == 'spectator' and welcome['choice_encounter']['dm_notes'] == ''
    assert 'dungeon_master' not in welcome['visible_layers']
    assert game.service.client_info[client]['role'] == 'spectator'
    assert game.manager.connection_info[game.socket]['role'] == 'spectator'
    game.assets.setup_session_permissions.assert_called_once_with('ROOM', 7, 'member', 'spectator')
    assert game.manager.broadcast_to_session.call_args.args[1].data['role'] == 'spectator'
    assert not game.manager._pending_joins


async def test_same_role_refresh_uses_final_authority_while_welcome_is_delivered(joining, monkeypatch):
    game = joining
    send = game.socket.send_text

    async def deliver(payload):
        await game.manager.refresh_user_role('ROOM', 7, 'spectator')
        await send(payload)

    monkeypatch.setattr(game.socket, 'send_text', deliver)
    await game.manager.connect(game.socket, 'ROOM', 7, 'member', 'co_dm',
                               reauthorize=AsyncMock(return_value='spectator'))
    assert not any(frame['type'] == 'websocket.close' for frame in game.frames)
    assert not game.manager._pending_joins


@pytest.mark.parametrize('other_session,other_user,role', [('ROOM', 8, 'player'), ('OTHER', 7, 'player'), ('ROOM', 7, 'co_dm')])
async def test_unrelated_or_same_role_refresh_keeps_pending_join(joining, other_session, other_user, role):
    game = joining
    entered, release = asyncio.Event(), asyncio.Event()

    async def hydrate(_code):
        entered.set()
        await release.wait()
        return game.encounter

    game.service.server_protocol._load_active_choice_encounter = AsyncMock(side_effect=hydrate)
    task = asyncio.create_task(game.manager.connect(game.socket, 'ROOM', 7, 'member', 'co_dm'))
    try:
        await asyncio.wait_for(entered.wait(), 2)
        await game.manager.refresh_user_role(other_session, other_user, role)
        release.set()
        await asyncio.wait_for(task, 3)
        assert any(frame['type'] == 'websocket.send' and 'private' in frame.get('text', '') for frame in game.frames)
        assert not any(frame['type'] == 'websocket.close' for frame in game.frames)
    finally:
        release.set()
        await asyncio.gather(task, return_exceptions=True)


@pytest.mark.parametrize('change', ['demote', 'promote', 'membership', 'credential', 'disabled', 'expiry', 'session'])
async def test_endpoint_revalidates_signed_authority_after_hydration(
    joining, test_db_engine, game_session_with_players, co_dm_user, player_user, monkeypatch, change,
):
    game = joining
    session = game_session_with_players
    user = player_user if change == 'promote' else co_dm_user
    user_id, session_id = user.id, session.id
    factory = sessionmaker(bind=test_db_engine)
    game.service.session_code = session.session_code
    game.manager.sessions_protocols = {session.session_code: game.service}
    game.manager._retry_empty_session = AsyncMock()
    expires_at = int(time.time()) + (2 if change == 'expiry' else 60)
    token = jwt.encode({'sub': user.username, 'sv': user.session_version or 0, 'exp': expires_at}, SECRET_KEY, algorithm=ALGORITHM)
    game.socket.scope['headers'] = [(b'cookie', f'token={token}'.encode())]
    monkeypatch.setattr(game.socket, 'receive_text', AsyncMock(side_effect=WebSocketDisconnect(code=1000)))
    monkeypatch.setattr(game_ws, 'SessionLocal', factory)
    monkeypatch.setattr(game_ws, '_origin_is_allowed', lambda _: True)
    load = game_ws._load_websocket_session_context
    loads = []
    loop_thread = threading.get_ident()

    def worker_load(*args):
        assert threading.get_ident() != loop_thread
        loads.append(args)
        return load(*args)

    monkeypatch.setattr(game_ws, '_load_websocket_session_context', worker_load)

    def change_authority():
        with factory() as db:
            membership = db.query(models.GamePlayer).filter_by(session_id=session_id, user_id=user_id).one()
            account = db.get(models.User, user_id)
            assert account is not None
            if change in {'demote', 'promote'}:
                membership.role = 'co_dm' if change == 'promote' else 'player'
            elif change == 'membership':
                db.delete(membership)
            elif change == 'credential':
                account.session_version += 1
            elif change == 'disabled':
                account.disabled = True
            elif change == 'session':
                current = db.get(models.GameSession, session_id)
                assert current is not None
                current.is_active = False
            db.commit()

    async def hydrate(_code):
        # Change durable authority after the original signed handshake read,
        # without calling the manager's live refresh helper.
        if change == 'expiry':
            await asyncio.sleep(max(0, expires_at - time.time()) + .05)
        else:
            await asyncio.to_thread(change_authority)
        return game.encounter

    game.service.server_protocol._load_active_choice_encounter = AsyncMock(side_effect=hydrate)
    await asyncio.wait_for(game_ws.websocket_game_endpoint(game.socket, session.session_code, game.manager), 5)
    await asyncio.gather(*game.manager._cleanup_tasks.values())
    assert len(loads) == 2
    welcomes = [json.loads(frame['text'])['data'] for frame in game.frames if frame['type'] == 'websocket.send']
    if change in {'demote', 'promote'}:
        role = 'co_dm' if change == 'promote' else 'player'
        assert len(welcomes) == 1 and welcomes[0]['role'] == role
        assert welcomes[0]['choice_encounter']['dm_notes'] == ('private' if change == 'promote' else '')
        assert game.manager.broadcast_to_session.await_args_list[0].args[1].data['role'] == role
    else:
        assert not welcomes
        assert any(frame['type'] == 'websocket.close' and frame['code'] == 1008 for frame in game.frames)
        game.assets.setup_session_permissions.assert_not_called()
    assert not game.manager._pending_joins and not game.manager.connection_info
    assert not game.service.clients and not game.service.websocket_to_client
