from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from core_table.protocol import Message, MessageType
from database import models
from service.protocol.chat import _ChatMixin
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool


class ChatHarness(_ChatMixin):
    def __init__(self, session_id: int, user_id: int, clients: dict):
        self.session_id = session_id
        self.user_id = user_id
        self.session_manager = SimpleNamespace(client_info=clients)
        self.broadcast_to_session = AsyncMock()
        self.send_to_client = AsyncMock()

    def _get_session_id(self, _msg):
        return self.session_id

    def _get_session_code(self, _msg=None):
        return "CHAT"

    def _get_user_id(self, _msg, _client_id=None):
        return self.user_id

    def _get_client_info(self, client_id):
        return self.session_manager.client_info[client_id]


@pytest.fixture()
def chat_db(monkeypatch):
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    session_factory = sessionmaker(bind=engine)
    models.Base.metadata.create_all(engine)
    db = session_factory()
    alice = models.User(username="alice", email="alice@example.com", hashed_password="x")
    bob = models.User(username="bob", email="bob@example.com", hashed_password="x")
    outsider = models.User(username="outsider", email="out@example.com", hashed_password="x")
    db.add_all([alice, bob, outsider])
    db.flush()
    session = models.GameSession(name="Chat", session_code="CHAT", owner_id=alice.id)
    db.add(session)
    db.flush()
    db.add_all([
        models.GamePlayer(session_id=session.id, user_id=alice.id, role="owner"),
        models.GamePlayer(session_id=session.id, user_id=bob.id, role="player"),
    ])
    db.commit()

    import service.protocol.chat as chat_module

    monkeypatch.setattr(chat_module, "SessionLocal", session_factory)
    yield session_factory, session.id, alice.id, bob.id, outsider.id
    db.close()


def _message(operation_id="operation-1", **data):
    payload = {
        "message": {
            "id": operation_id,
            "user": "untrusted-name",
            "text": "secret",
            "timestamp": 123,
        },
        **data,
    }
    return Message(MessageType.CHAT, payload)


@pytest.mark.asyncio
async def test_whisper_without_recipient_fails_without_delivery(chat_db):
    _, session_id, alice_id, _, _ = chat_db
    harness = ChatHarness(session_id, alice_id, {"alice-client": {"user_id": alice_id, "username": "alice"}})

    result = await harness.handle_chat(_message(channel="whisper"), "alice-client")

    assert result.type == MessageType.ERROR
    harness.broadcast_to_session.assert_not_awaited()
    harness.send_to_client.assert_not_awaited()


@pytest.mark.asyncio
async def test_whisper_requires_recipient_membership(chat_db):
    _, session_id, alice_id, _, outsider_id = chat_db
    harness = ChatHarness(session_id, alice_id, {"alice-client": {"user_id": alice_id, "username": "alice"}})

    result = await harness.handle_chat(
        _message(channel="whisper", recipient_user_id=outsider_id),
        "alice-client",
    )

    assert result.type == MessageType.ERROR
    harness.broadcast_to_session.assert_not_awaited()


@pytest.mark.asyncio
async def test_whisper_is_scoped_and_idempotent(chat_db):
    session_factory, session_id, alice_id, bob_id, _ = chat_db
    clients = {
        "alice-client": {"user_id": alice_id, "username": "alice"},
        "bob-client": {"user_id": bob_id, "username": "bob"},
    }
    harness = ChatHarness(session_id, alice_id, clients)
    message = _message(channel="whisper", recipient_user_id=bob_id)

    first = await harness.handle_chat(message, "alice-client")
    second = await harness.handle_chat(message, "alice-client")

    assert first.type == MessageType.CHAT_CONFIRMATION
    assert first.data["client_operation_id"] == "operation-1"
    assert first.data["chat_message"]["id"] != "operation-1"
    assert second.data["chat_message"]["id"] == first.data["chat_message"]["id"]
    harness.send_to_client.assert_awaited_once()
    harness.broadcast_to_session.assert_not_awaited()
    with session_factory() as db:
        assert db.query(models.ChatMessage).count() == 1


@pytest.mark.asyncio
async def test_unbounded_history_is_rejected(chat_db):
    _, session_id, alice_id, _, _ = chat_db
    harness = ChatHarness(session_id, alice_id, {"alice-client": {"user_id": alice_id, "username": "alice"}})

    result = await harness.handle_chat_request(
        Message(MessageType.CHAT_REQUEST, {"all": True}),
        "alice-client",
    )

    assert result.type == MessageType.ERROR


@pytest.mark.asyncio
async def test_bounded_history_returns_visible_messages(chat_db):
    _, session_id, alice_id, _, _ = chat_db
    harness = ChatHarness(session_id, alice_id, {"alice-client": {"user_id": alice_id, "username": "alice"}})
    await harness.handle_chat(_message(), "alice-client")

    result = await harness.handle_chat_request(
        Message(MessageType.CHAT_REQUEST, {"count": 30}),
        "alice-client",
    )

    assert result.type == MessageType.CHAT
    assert result.data["count"] == 1
    assert result.data["messages"][0]["user"] == "alice"


@pytest.mark.asyncio
async def test_attachment_metadata_is_rejected_until_asset_contract_exists(chat_db):
    _, session_id, alice_id, _, _ = chat_db
    harness = ChatHarness(session_id, alice_id, {"alice-client": {"user_id": alice_id, "username": "alice"}})

    result = await harness.handle_chat(
        _message(attachments=[{"url": "https://untrusted.example/secret"}]),
        "alice-client",
    )

    assert result.type == MessageType.ERROR
    harness.broadcast_to_session.assert_not_awaited()
