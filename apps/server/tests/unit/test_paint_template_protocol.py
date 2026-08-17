# pyright: reportAttributeAccessIssue=false, reportIncompatibleMethodOverride=false

import threading
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from core_table.protocol import Message, MessageType
from service.protocol import paint_templates as template_module
from service.protocol.paint_templates import _PaintTemplatesMixin
from sqlalchemy.orm import sessionmaker


class PaintTemplateHarness(_PaintTemplatesMixin):
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
def template_db(monkeypatch, test_db, test_game_session, test_user, player_user):
    session_factory = sessionmaker(
        autocommit=False,
        autoflush=False,
        bind=test_db.get_bind(),
    )
    monkeypatch.setattr(template_module, "SessionLocal", session_factory)
    return test_game_session.id, test_user.id, player_user.id


def _upsert() -> Message:
    return Message(
        MessageType.PAINT_TEMPLATE_UPSERT,
        {
            "id": "template-1",
            "name": "Fire",
            "description": "A fire marker",
            "strokes": [
                {
                    "id": "stroke-1",
                    "points": [{"x": 1, "y": 2, "pressure": 1}],
                    "color": [1, 0, 0, 1],
                    "width": 4,
                    "blend_mode": "Alpha",
                }
            ],
        },
    )


@pytest.mark.asyncio
async def test_template_is_persisted_and_broadcast(template_db):
    session_id, owner_id, _ = template_db
    harness = PaintTemplateHarness(session_id, owner_id, "player")

    result = await harness.handle_paint_template_upsert(_upsert(), "owner")

    assert result.type == MessageType.PAINT_TEMPLATE_UPSERT
    assert result.data["template"]["created_by"] == owner_id
    harness.broadcast_to_session.assert_awaited_once()


@pytest.mark.asyncio
async def test_creator_or_dm_can_delete_template(template_db):
    session_id, owner_id, other_id = template_db
    harness = PaintTemplateHarness(session_id, owner_id, "player")
    await harness.handle_paint_template_upsert(_upsert(), "owner")

    harness.user_id = other_id
    denied = await harness.handle_paint_template_delete(
        Message(MessageType.PAINT_TEMPLATE_DELETE, {"id": "template-1"}),
        "other",
    )
    assert denied.type == MessageType.ERROR

    harness.role = "co_dm"
    deleted = await harness.handle_paint_template_delete(
        Message(MessageType.PAINT_TEMPLATE_DELETE, {"id": "template-1"}),
        "dm",
    )
    assert deleted.type == MessageType.PAINT_TEMPLATE_DELETE


@pytest.mark.asyncio
async def test_template_validation_rejects_invalid_payload(template_db):
    session_id, owner_id, _ = template_db
    harness = PaintTemplateHarness(session_id, owner_id, "player")
    message = _upsert()
    message.data["strokes"][0]["width"] = float("nan")

    result = await harness.handle_paint_template_upsert(message, "owner")

    assert result.type == MessageType.ERROR
    assert "valid paint strokes" in result.data["error"]


@pytest.mark.asyncio
async def test_template_database_operations_run_off_event_loop(
    template_db,
    monkeypatch,
):
    session_id, owner_id, _ = template_db
    harness = PaintTemplateHarness(session_id, owner_id, "player")
    event_loop_thread = threading.get_ident()
    worker_threads = {}

    def recording_wrapper(name, operation):
        def wrapped(**kwargs):
            worker_threads[name] = threading.get_ident()
            return operation(**kwargs)

        return wrapped

    for name in (
        "_upsert_paint_template",
        "_load_paint_templates",
        "_delete_paint_template",
    ):
        monkeypatch.setattr(
            template_module,
            name,
            recording_wrapper(name, getattr(template_module, name)),
        )

    await harness.handle_paint_template_upsert(_upsert(), "owner")
    await harness.handle_paint_template_sync(
        Message(MessageType.PAINT_TEMPLATE_SYNC, {}),
        "owner",
    )
    await harness.handle_paint_template_delete(
        Message(MessageType.PAINT_TEMPLATE_DELETE, {"id": "template-1"}),
        "owner",
    )

    assert set(worker_threads) == {
        "_upsert_paint_template",
        "_load_paint_templates",
        "_delete_paint_template",
    }
    assert all(thread_id != event_loop_thread for thread_id in worker_threads.values())
