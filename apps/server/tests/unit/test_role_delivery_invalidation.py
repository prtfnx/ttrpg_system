"""Role changes retire queued views before another authorization scope is used."""
import asyncio
import json
from typing import cast
from unittest.mock import AsyncMock, MagicMock

import pytest
from core_table.protocol import Message, MessageType
from fastapi import WebSocket
from service import game_session
from service.game_session import ConnectionManager
from service.game_session_protocol import GameSessionProtocolService


@pytest.mark.parametrize('before, after, layer', [
    ('co_dm', 'player', 'dungeon_master'),
    ('player', 'spectator', 'light'),
    ('player', 'co_dm', 'tokens'),
])
async def test_changed_roles_retire_all_tabs_and_discard_their_old_views(monkeypatch, before, after, layer):
    service = GameSessionProtocolService.__new__(GameSessionProtocolService)
    sockets = {name: AsyncMock(spec=WebSocket) for name in ('first', 'second', 'peer', 'other-session')}
    service.clients = {name: cast(WebSocket, sockets[name]) for name in ('first', 'second', 'peer')}
    service.websocket_to_client = {socket: name for name, socket in service.clients.items()}
    service.client_info = {name: {'user_id': 8 if name == 'peer' else 7, 'role': 'co_dm' if name == 'peer' else before}
                           for name in service.clients}
    service._outboxes = {}
    manager = ConnectionManager()
    manager.sessions_protocols['ROOM'] = service
    manager.active_connections = {'ROOM': list(service.clients.values()), 'OTHER': [sockets['other-session']]}
    manager.connection_info = {socket: {'session_code': 'OTHER' if name == 'other-session' else 'ROOM',
        'user_id': 8 if name == 'peer' else 7, 'role': 'co_dm' if name == 'peer' else before, 'username': name}
        for name, socket in sockets.items()}
    manager.user_connections = {7: {sockets[name] for name in ('first', 'second', 'other-session')}, 8: {sockets['peer']}}
    monkeypatch.setattr(game_session, 'get_server_asset_manager', MagicMock())
    started = {name: asyncio.Event() for name in ('first', 'second')}
    release = asyncio.Event()

    def paused(name):
        async def send(_payload):
            started[name].set()
            await release.wait()
        return send

    boxes = []
    try:
        for name in ('first', 'second'):
            sockets[name].send_text.side_effect = paused(name)
            await service.send_to_client(Message(MessageType.SUCCESS, {'hold': True}), name)
        await asyncio.wait_for(asyncio.gather(*(event.wait() for event in started.values())), 2)
        await service.broadcast_filtered(Message(MessageType.SPRITE_UPDATE,
            {'sprite_id': 'private-token', 'updates': {'hp': 7}}), layer)
        for name in ('first', 'second'):
            await service.send_snapshot([Message(MessageType.TABLE_DATA, {'private_snapshot': True})], name)
            boxes.append(service._outboxes[sockets[name]])

        assert await manager.refresh_user_role('ROOM', 7, after) == 2
        assert all(box.closed and not box.queue and not box.bytes and not box.snapshots for box in boxes)
        for name in ('first', 'second'):
            assert sockets[name] not in manager.connection_info
            assert name not in service.clients
            # The first frame had already been handed to the transport. No tail starts.
            assert sockets[name].send_text.await_count == 1
            sockets[name].close.assert_awaited_once_with(code=1012, reason='Session role changed; reconnect')
        assert set(service.clients) == {'peer'}
        assert manager.connection_info[sockets['other-session']]['role'] == before
        sockets['peer'].close.assert_not_awaited()
        sockets['other-session'].close.assert_not_awaited()
        await service.send_to_client(Message(MessageType.SUCCESS, {'still_connected': True}), 'peer')
        await service.drain_outbound()
        assert json.loads(sockets['peer'].send_text.call_args.args[0])['data']['still_connected']
    finally:
        release.set()
        for box in boxes:
            box.close()
        await asyncio.gather(*(box.drain() for box in boxes), return_exceptions=True)
        await service.drain_outbound()


async def test_repeating_the_same_role_keeps_healthy_connections(monkeypatch):
    manager = ConnectionManager()
    socket = AsyncMock(spec=WebSocket)
    manager.connection_info = {socket: {'session_code': 'ROOM', 'user_id': 7, 'username': 'member', 'role': 'player'}}
    manager._disconnect_connections = AsyncMock()
    monkeypatch.setattr(game_session, 'get_server_asset_manager', MagicMock())
    assert await manager.refresh_user_role('ROOM', 7, 'player') == 1
    manager._disconnect_connections.assert_awaited_once_with([], user_id=7,
        reason='Session role changed; reconnect', close_code=1012)
    socket.close.assert_not_awaited()


async def test_role_retirement_finishes_before_repeated_caller_cancellation(monkeypatch):
    manager = ConnectionManager()
    socket = AsyncMock(spec=WebSocket)
    manager.connection_info = {socket: {'session_code': 'ROOM', 'user_id': 7, 'username': 'member', 'role': 'co_dm'}}
    entered, release, retired = asyncio.Event(), asyncio.Event(), asyncio.Event()

    async def retire(*_args, **_kwargs):
        entered.set()
        await release.wait()
        retired.set()

    manager._disconnect_connections = AsyncMock(side_effect=retire)
    monkeypatch.setattr(game_session, 'get_server_asset_manager', MagicMock())
    task = asyncio.create_task(manager.refresh_user_role('ROOM', 7, 'player'))
    try:
        await asyncio.wait_for(entered.wait(), 2)
        assert manager.connection_info[socket]['role'] == 'player'
        for _ in range(2):
            task.cancel()
            await asyncio.sleep(0)
            assert not task.done()
        release.set()
        with pytest.raises(asyncio.CancelledError):
            await task
        assert retired.is_set()
    finally:
        release.set()
        await asyncio.gather(task, return_exceptions=True)
