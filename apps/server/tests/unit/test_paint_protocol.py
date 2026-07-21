from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from core_table.protocol import Message, MessageType
from database import models
from service.protocol.paint import _PaintMixin
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool


class PaintHarness(_PaintMixin):
    def __init__(self, session_id: int, user_id: int, role: str):
        self.session_id = session_id
        self.user_id = user_id
        self.role = role
        self.session_manager = SimpleNamespace()
        self.broadcast_to_session = AsyncMock()

    def _get_session_id(self, _msg):
        return self.session_id

    def _get_user_id(self, _msg, _client_id=None):
        return self.user_id

    def _get_client_role(self, _client_id):
        return self.role


@pytest.fixture()
def paint_db(monkeypatch):
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    session_factory = sessionmaker(bind=engine)
    models.Base.metadata.create_all(engine)
    db = session_factory()
    owner = models.User(username="owner", email="owner@example.com", hashed_password="x")
    player = models.User(username="player", email="player@example.com", hashed_password="x")
    other = models.User(username="other", email="other@example.com", hashed_password="x")
    db.add_all([owner, player, other])
    db.flush()
    first = models.GameSession(name="First", session_code="FIRST", owner_id=owner.id)
    second = models.GameSession(name="Second", session_code="SECOND", owner_id=other.id)
    db.add_all([first, second])
    db.flush()
    db.add_all([
        models.VirtualTable(table_id="table-first", name="First", width=10, height=10, session_id=first.id),
        models.VirtualTable(table_id="table-second", name="Second", width=10, height=10, session_id=second.id),
    ])
    db.commit()

    import service.protocol.paint as paint_module

    monkeypatch.setattr(paint_module, "SessionLocal", session_factory)
    yield session_factory, first.id, second.id, owner.id, player.id, other.id
    db.close()


def create_message(table_id: str, stroke_id: str = "stroke-1") -> Message:
    return Message(MessageType.PAINT_STROKE_CREATE, {
        "table_id": table_id,
        "stroke_id": stroke_id,
        "stroke_data": {"id": stroke_id, "points": [{"x": 1, "y": 2}]},
    })


@pytest.mark.asyncio
async def test_create_rejects_table_from_another_session(paint_db):
    _, first_id, _, _, player_id, _ = paint_db
    harness = PaintHarness(first_id, player_id, "player")

    result = await harness.handle_paint_stroke_create(create_message("table-second"), "client")

    assert result.type == MessageType.ERROR
    assert "session" in result.data["error"].lower()
    harness.broadcast_to_session.assert_not_awaited()


@pytest.mark.asyncio
async def test_create_requires_matching_stroke_identity(paint_db):
    _, first_id, _, _, player_id, _ = paint_db
    harness = PaintHarness(first_id, player_id, "player")
    message = create_message("table-first")
    message.data["stroke_data"]["id"] = "different"

    result = await harness.handle_paint_stroke_create(message, "client")

    assert result.type == MessageType.ERROR
    harness.broadcast_to_session.assert_not_awaited()


@pytest.mark.asyncio
async def test_creator_can_delete_own_stroke_but_not_another_users(paint_db):
    session_factory, first_id, _, owner_id, player_id, _ = paint_db
    creator = PaintHarness(first_id, player_id, "player")
    await creator.handle_paint_stroke_create(create_message("table-first", "owned"), "player")

    db = session_factory()
    db.add(models.PaintStroke(
        table_id="table-first",
        stroke_id="someone-elses",
        stroke_data='{"id":"someone-elses"}',
        created_by=owner_id,
    ))
    db.commit()
    db.close()

    denied = await creator.handle_paint_stroke_delete(Message(MessageType.PAINT_STROKE_DELETE, {
        "table_id": "table-first",
        "stroke_id": "someone-elses",
    }), "player")
    deleted = await creator.handle_paint_stroke_delete(Message(MessageType.PAINT_STROKE_DELETE, {
        "table_id": "table-first",
        "stroke_id": "owned",
    }), "player")

    assert denied.type == MessageType.ERROR
    assert deleted.type == MessageType.PAINT_STROKE_DELETE


@pytest.mark.asyncio
async def test_dm_cannot_delete_stroke_through_foreign_table_context(paint_db):
    session_factory, first_id, _, owner_id, _, other_id = paint_db
    db = session_factory()
    db.add(models.PaintStroke(
        table_id="table-second",
        stroke_id="foreign",
        stroke_data='{"id":"foreign"}',
        created_by=other_id,
    ))
    db.commit()
    db.close()
    harness = PaintHarness(first_id, owner_id, "owner")

    result = await harness.handle_paint_stroke_delete(Message(MessageType.PAINT_STROKE_DELETE, {
        "table_id": "table-second",
        "stroke_id": "foreign",
    }), "owner")

    assert result.type == MessageType.ERROR
    verify = session_factory()
    assert verify.query(models.PaintStroke).filter_by(stroke_id="foreign").one()
    verify.close()
