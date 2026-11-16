"""Account expiry finishes admitted work without starting queued mutations."""
import asyncio
import json
import time
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest
from api import game_ws
from core_table.protocol import Message, MessageType
from fastapi import WebSocketDisconnect


@pytest.mark.parametrize('close_first', [False, True])
async def test_expiry_settles_inflight_work_and_discards_queued_mutations(monkeypatch, close_first):
    clock = {'now': 1000.0}
    monkeypatch.setattr(game_ws, 'time', SimpleNamespace(time=lambda: clock['now'],
        monotonic=time.monotonic, perf_counter=time.perf_counter))
    monkeypatch.setattr(game_ws, '_origin_is_allowed', lambda _: True)
    monkeypatch.setattr(game_ws, '_load_websocket_session_context', lambda *_: (
        game_ws.WebSocketSessionContext(1, 'owner', 'owner', token_expires_at=1060.0), None))
    release, reader_waiting, finish_read, closed, settled = (asyncio.Event() for _ in range(5))
    originals = [Message(MessageType.NEW_TABLE_REQUEST, {'table_name': name}).to_dict() for name in ('First', 'Queued')]
    frames = iter([*(json.dumps(message) for message in originals), '{"type":"ping","data":{}}'])
    received = 0

    async def receive():
        nonlocal received
        received += 1
        if received == 3:
            reader_waiting.set()
            await finish_read.wait()
        try:
            return next(frames)
        except StopIteration:
            raise WebSocketDisconnect() from None

    accepted = []

    async def handle(_socket, message):
        await release.wait()
        accepted.append(message['message_id'])
        settled.set()

    socket = MagicMock()
    socket.headers, socket.cookies = {}, {'token': 'validated-account-cookie'}
    socket.receive_text = AsyncMock(side_effect=receive)
    socket.close = AsyncMock(side_effect=lambda **_: closed.set())
    manager = MagicMock()
    manager.connect = AsyncMock(return_value='client')
    manager.handle_message = AsyncMock(side_effect=handle)
    manager.disconnect = AsyncMock()
    task = asyncio.create_task(game_ws.websocket_game_endpoint(socket, 'ROOM12', manager))
    try:
        await asyncio.wait_for(reader_waiting.wait(), 2)
        assert manager.handle_message.await_count == 1
        clock['now'] = 1061.0
        if close_first:
            finish_read.set()
            await asyncio.wait_for(closed.wait(), 2)
            assert not task.done()
            manager.disconnect.assert_not_awaited()
        release.set()
        await asyncio.wait_for(settled.wait(), 2)
        await asyncio.sleep(0)
        finish_read.set()
        await asyncio.wait_for(task, 2)
        assert accepted == [originals[0]['message_id']]
        manager.handle_message.assert_awaited_once()
        manager.disconnect.assert_awaited_once()
        socket.close.assert_awaited_once_with(code=1008, reason='Authentication expired')
    finally:
        release.set()
        finish_read.set()
        await asyncio.gather(task, return_exceptions=True)
