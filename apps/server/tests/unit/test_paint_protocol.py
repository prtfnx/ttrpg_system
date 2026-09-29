# pyright: reportAttributeAccessIssue=false, reportIncompatibleMethodOverride=false

import json
import threading
import uuid
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from core_table.protocol import Message, MessageType
from database import models
from service.paint_object_service import PaintSnapshot
from service.protocol import paint as paint_module
from service.protocol.paint import _PaintMixin, _snapshot_chunks
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

TABLE_ID = "9e8ed60d-f18c-4f47-a5ce-fc04db50506a"
OTHER_TABLE_ID = "d57d06dc-85d1-42a7-a928-2d1fa10848f9"
OBJECT_ID = "dd830253-e2bf-4a92-9862-eabe85f79c99"


class PaintHarness(_PaintMixin):
    def __init__(self, session_id: int, user_id: int, role: str):
        self.session_id = session_id
        self.user_id = user_id
        self.role = role
        self.session_manager = SimpleNamespace()
        self.broadcast_to_session = AsyncMock()
        self.send_to_client = AsyncMock()

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
        models.GamePlayer(session_id=first.id, user_id=player.id, role="player"),
        models.VirtualTable(
            table_id="table-first",
            name="First",
            width=10,
            height=10,
            session_id=first.id,
        ),
        models.VirtualTable(
            table_id="table-second",
            name="Second",
            width=10,
            height=10,
            session_id=second.id,
        ),
        models.VirtualTable(
            table_id=TABLE_ID,
            name="Object table",
            width=1000,
            height=1000,
            session_id=first.id,
        ),
        models.VirtualTable(
            table_id=OTHER_TABLE_ID,
            name="Foreign object table",
            width=1000,
            height=1000,
            session_id=second.id,
        ),
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


def editable_object(object_id: str = OBJECT_ID) -> dict:
    return {
        "id": object_id,
        "kind": "freehand",
        "geometry": {
            "kind": "freehand",
            "points": [{"x": 0, "y": 0, "pressure": 0.5}],
        },
        "transform": {"x": 10, "y": 20, "scale_x": 1, "scale_y": 1},
        "style": {
            "stroke_rgba": [0.1, 0.2, 0.3, 1],
            "width": 3,
            "fill_rgba": None,
        },
    }


def object_create_message(*, operation_id: str | None = None) -> Message:
    return Message(MessageType.PAINT_OBJECT_CREATE, {
        "operation_id": operation_id or str(uuid.uuid4()),
        "table_id": TABLE_ID,
        "object": editable_object(),
    })


def preview_message(
    *,
    table_id: str = TABLE_ID,
    sequence: int = 1,
    draft: dict | None = None,
) -> Message:
    return Message(MessageType.PAINT_PREVIEW, {
        "table_id": table_id,
        "temporary_id": OBJECT_ID,
        "sequence": sequence,
        "expires_at": 1000,
        "draft": draft or editable_object(),
        "actor_id": 999999,
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


@pytest.mark.asyncio
async def test_identical_create_retry_does_not_rebroadcast(paint_db):
    _, first_id, _, _, player_id, _ = paint_db
    harness = PaintHarness(first_id, player_id, "player")
    message = create_message("table-first")

    await harness.handle_paint_stroke_create(message, "player")
    await harness.handle_paint_stroke_create(message, "player")

    harness.broadcast_to_session.assert_awaited_once()


@pytest.mark.asyncio
async def test_paint_database_operations_run_off_event_loop(paint_db, monkeypatch):
    _, first_id, _, owner_id, player_id, _ = paint_db
    harness = PaintHarness(first_id, player_id, "player")
    event_loop_thread = threading.get_ident()
    worker_threads = {}

    def recording_wrapper(name, operation):
        def wrapped(**kwargs):
            worker_threads[name] = threading.get_ident()
            return operation(**kwargs)
        return wrapped

    for name in ("_create_paint_stroke", "_delete_paint_stroke", "_clear_paint_strokes"):
        monkeypatch.setattr(
            paint_module,
            name,
            recording_wrapper(name, getattr(paint_module, name)),
        )

    await harness.handle_paint_stroke_create(
        create_message("table-first", "delete-me"),
        "player",
    )
    await harness.handle_paint_stroke_delete(
        Message(MessageType.PAINT_STROKE_DELETE, {
            "table_id": "table-first",
            "stroke_id": "delete-me",
        }),
        "player",
    )
    await harness.handle_paint_stroke_create(
        create_message("table-first", "clear-me"),
        "player",
    )
    harness.user_id = owner_id
    harness.role = "owner"
    await harness.handle_paint_stroke_clear(
        Message(MessageType.PAINT_STROKE_CLEAR, {"table_id": "table-first"}),
        "owner",
    )

    assert set(worker_threads) == {
        "_create_paint_stroke",
        "_delete_paint_stroke",
        "_clear_paint_strokes",
    }
    assert all(thread_id != event_loop_thread for thread_id in worker_threads.values())


@pytest.mark.asyncio
async def test_object_create_is_persisted_broadcast_and_idempotent(paint_db):
    session_factory, first_id, _, _, player_id, _ = paint_db
    harness = PaintHarness(first_id, player_id, "player")
    message = object_create_message()

    accepted = await harness.handle_paint_object_create(message, "player")
    replay = await harness.handle_paint_object_create(message, "player")

    assert accepted.type == MessageType.PAINT_OBJECT_EVENT
    assert accepted.data["action"] == "create"
    assert accepted.data["object"]["version"] == 1
    assert replay.data == accepted.data
    harness.broadcast_to_session.assert_awaited_once()
    with session_factory() as db:
        assert db.query(models.PaintObject).filter_by(id=OBJECT_ID).one()


@pytest.mark.asyncio
async def test_object_update_returns_authoritative_version_conflict(paint_db):
    _, first_id, _, _, player_id, _ = paint_db
    harness = PaintHarness(first_id, player_id, "player")
    await harness.handle_paint_object_create(object_create_message(), "player")
    changed = editable_object()
    changed["transform"]["x"] = 50

    updated = await harness.handle_paint_object_update(Message(
        MessageType.PAINT_OBJECT_UPDATE,
        {
            "operation_id": str(uuid.uuid4()),
            "table_id": TABLE_ID,
            "id": OBJECT_ID,
            "expected_version": 1,
            "object": changed,
        },
    ), "player")
    conflict = await harness.handle_paint_object_update(Message(
        MessageType.PAINT_OBJECT_UPDATE,
        {
            "operation_id": str(uuid.uuid4()),
            "table_id": TABLE_ID,
            "id": OBJECT_ID,
            "expected_version": 1,
            "object": changed,
        },
    ), "player")

    assert updated.data["object"]["version"] == 2
    assert conflict.type == MessageType.ERROR
    assert conflict.data["code"] == "version_conflict"
    assert conflict.data["current_version"] == 2
    assert conflict.data["current_object"] == updated.data["object"]


@pytest.mark.asyncio
async def test_snapshot_returns_authoritative_objects_and_revision(paint_db):
    _, first_id, _, _, player_id, _ = paint_db
    harness = PaintHarness(first_id, player_id, "player")
    await harness.handle_paint_object_create(object_create_message(), "player")

    response = await harness.handle_paint_snapshot_request(Message(
        MessageType.PAINT_SNAPSHOT_REQUEST,
        {"table_id": TABLE_ID},
    ), "player")

    assert response.type == MessageType.PAINT_SNAPSHOT_CHUNK
    assert response.data["revision"] == 1
    assert response.data["chunk_index"] == 0
    assert response.data["chunk_count"] == 1
    assert response.data["complete"] is True
    assert [item["id"] for item in response.data["objects"]] == [OBJECT_ID]
    harness.send_to_client.assert_not_awaited()


def test_snapshot_chunks_stay_within_frame_budget():
    objects = [
        {"id": str(uuid.uuid4()), "payload": "x" * 220},
        {"id": str(uuid.uuid4()), "payload": "y" * 220},
    ]
    chunks = _snapshot_chunks(PaintSnapshot(TABLE_ID, 2, objects), max_bytes=520)

    assert len(chunks) == 2
    assert [chunk["chunk_index"] for chunk in chunks] == [0, 1]
    assert all(chunk["chunk_count"] == 2 for chunk in chunks)
    assert [chunk["complete"] for chunk in chunks] == [False, True]
    assert all(
        len(json.dumps(chunk, separators=(",", ":")).encode("utf-8")) <= 520
        for chunk in chunks
    )


@pytest.mark.asyncio
async def test_object_database_operations_run_off_event_loop(paint_db, monkeypatch):
    _, first_id, _, _, player_id, _ = paint_db
    harness = PaintHarness(first_id, player_id, "player")
    event_loop_thread = threading.get_ident()
    worker_threads = {}

    def recording_wrapper(name, operation):
        def wrapped(**kwargs):
            worker_threads[name] = threading.get_ident()
            return operation(**kwargs)

        return wrapped

    for name in ("_create_paint_object", "_paint_snapshot", "_delete_paint_object"):
        monkeypatch.setattr(
            paint_module,
            name,
            recording_wrapper(name, getattr(paint_module, name)),
        )

    await harness.handle_paint_object_create(object_create_message(), "player")
    await harness.handle_paint_snapshot_request(Message(
        MessageType.PAINT_SNAPSHOT_REQUEST,
        {"table_id": TABLE_ID},
    ), "player")
    await harness.handle_paint_object_delete(Message(
        MessageType.PAINT_OBJECT_DELETE,
        {
            "operation_id": str(uuid.uuid4()),
            "table_id": TABLE_ID,
            "id": OBJECT_ID,
            "expected_version": 1,
        },
    ), "player")

    assert set(worker_threads) == {
        "_create_paint_object",
        "_paint_snapshot",
        "_delete_paint_object",
    }
    assert all(thread_id != event_loop_thread for thread_id in worker_threads.values())


@pytest.mark.asyncio
async def test_preview_relay_derives_actor_and_never_writes(paint_db):
    session_factory, first_id, _, _, player_id, _ = paint_db
    harness = PaintHarness(first_id, player_id, "player")

    await harness.handle_paint_preview(preview_message(), "player")
    await harness.handle_paint_preview_cancel(Message(
        MessageType.PAINT_PREVIEW_CANCEL,
        {
            "table_id": TABLE_ID,
            "temporary_id": OBJECT_ID,
            "sequence": 2,
            "actor_id": 999999,
        },
    ), "player")

    preview = harness.broadcast_to_session.await_args_list[0].args[0]
    cancel = harness.broadcast_to_session.await_args_list[1].args[0]
    assert preview.type == MessageType.PAINT_PREVIEW
    assert preview.data["actor_id"] == player_id
    assert cancel.type == MessageType.PAINT_PREVIEW_CANCEL
    assert cancel.data["actor_id"] == player_id
    with session_factory() as db:
        assert db.query(models.PaintState).count() == 0
        assert db.query(models.PaintOperationResult).count() == 0


@pytest.mark.asyncio
async def test_preview_authorization_is_cached_and_runs_off_event_loop(
    paint_db,
    monkeypatch,
):
    _, first_id, _, _, player_id, _ = paint_db
    harness = PaintHarness(first_id, player_id, "player")
    event_loop_thread = threading.get_ident()
    authorization_threads = []
    original = paint_module._authorize_paint_preview

    def recording_authorization(**kwargs):
        authorization_threads.append(threading.get_ident())
        return original(**kwargs)

    monkeypatch.setattr(
        paint_module,
        "_authorize_paint_preview",
        recording_authorization,
    )

    await harness.handle_paint_preview(preview_message(sequence=1), "player")
    await harness.handle_paint_preview(preview_message(sequence=2), "player")

    assert len(authorization_threads) == 1
    assert authorization_threads[0] != event_loop_thread
    assert harness.broadcast_to_session.await_count == 2


@pytest.mark.asyncio
async def test_preview_rejects_foreign_table_and_spectator(paint_db):
    session_factory, first_id, _, _, player_id, _ = paint_db
    foreign_harness = PaintHarness(first_id, player_id, "player")

    await foreign_harness.handle_paint_preview(
        preview_message(table_id=OTHER_TABLE_ID),
        "player",
    )

    with session_factory.begin() as db:
        membership = db.query(models.GamePlayer).filter_by(
            session_id=first_id,
            user_id=player_id,
        ).one()
        membership.role = "spectator"
    spectator_harness = PaintHarness(first_id, player_id, "spectator")
    await spectator_harness.handle_paint_preview(preview_message(), "spectator")

    foreign_harness.broadcast_to_session.assert_not_awaited()
    spectator_harness.broadcast_to_session.assert_not_awaited()


@pytest.mark.asyncio
async def test_preview_rejects_invalid_identity_and_oversized_draft(paint_db):
    _, first_id, _, _, player_id, _ = paint_db
    harness = PaintHarness(first_id, player_id, "player")
    wrong_identity = editable_object(str(uuid.uuid4()))
    oversized = editable_object()
    oversized["geometry"]["points"] = [
        {"x": index, "y": index, "pressure": 0.5}
        for index in range(800)
    ]

    await harness.handle_paint_preview(
        preview_message(draft=wrong_identity),
        "player",
    )
    await harness.handle_paint_preview(
        preview_message(draft=oversized),
        "player",
    )

    harness.broadcast_to_session.assert_not_awaited()
