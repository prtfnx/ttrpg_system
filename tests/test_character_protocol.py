"""
Tests for CHARACTER_UPDATE protocol handling
"""
import asyncio
import pytest

from net.protocol import Message, MessageType
from core_table.server_protocol import ServerProtocol
from core_table.actions_protocol import ActionResult


class DummyTableManager:
    def __init__(self):
        self.tables = {}
        self.tables_id = {}


@pytest.mark.asyncio
async def test_character_update_handler_registered():
    tm = DummyTableManager()
    protocol = ServerProtocol(tm)
    assert MessageType.CHARACTER_UPDATE in protocol.handlers
    assert protocol.handlers[MessageType.CHARACTER_UPDATE] == protocol.handle_character_update


@pytest.mark.asyncio
async def test_handle_character_update_no_data():
    tm = DummyTableManager()
    protocol = ServerProtocol(tm)

    msg = Message(MessageType.CHARACTER_UPDATE, None)
    resp = await protocol.handle_character_update(msg, 'client_1')
    assert resp.type == MessageType.CHARACTER_UPDATE_RESPONSE
    assert resp.data and resp.data.get('success') is False


@pytest.mark.asyncio
async def test_handle_character_update_success_broadcast(monkeypatch):
    tm = DummyTableManager()
    protocol = ServerProtocol(tm)

    # Stub out actions.update_character to simulate successful update
    async def fake_update(session_id, character_id, updates, user_id, expected_version=None):
        return ActionResult(True, 'ok', {'version': 5})

    protocol.actions.update_character = fake_update

    broadcasts = []

    async def fake_broadcast(msg, client_id):
        broadcasts.append(msg)

    monkeypatch.setattr(protocol, 'broadcast_to_session', fake_broadcast)

    payload = {'character_id': 'char-123', 'updates': {'stats': {'hp': 10}}, 'version': 4, 'user_id': 1}
    msg = Message(MessageType.CHARACTER_UPDATE, payload)

    resp = await protocol.handle_character_update(msg, 'client_1')
    assert resp.type == MessageType.CHARACTER_UPDATE_RESPONSE
    assert resp.data and resp.data.get('success') is True
    assert resp.data.get('version') == 5

    # Ensure a broadcast message was emitted
    assert len(broadcasts) == 1
    b = broadcasts[0]
    assert b.type == MessageType.CHARACTER_UPDATE
    assert b.data and b.data.get('character_id') == 'char-123'
