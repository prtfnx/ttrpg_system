# pyright: reportAttributeAccessIssue=false, reportIncompatibleMethodOverride=false

import threading
import time
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
    db.add_all(
        [
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
        ]
    )
    db.commit()

    import service.protocol.paint as paint_module

    monkeypatch.setattr(paint_module, "SessionLocal", session_factory)
    yield session_factory, first.id, second.id, owner.id, player.id, other.id
    db.close()


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
    return Message(
        MessageType.PAINT_OBJECT_CREATE,
        {
            "operation_id": operation_id or str(uuid.uuid4()),
            "issued_at": time.time() * 1000,
            "table_id": TABLE_ID,
            "object": editable_object(),
        },
    )


def preview_message(
    *,
    table_id: str = TABLE_ID,
    sequence: int = 1,
    draft: dict | None = None,
) -> Message:
    return Message(
        MessageType.PAINT_PREVIEW,
        {
            "table_id": table_id,
            "temporary_id": OBJECT_ID,
            "sequence": sequence,
            "expires_at": 1000,
            "draft": draft or editable_object(),
            "actor_id": 999999,
        },
    )


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

    updated = await harness.handle_paint_object_update(
        Message(
            MessageType.PAINT_OBJECT_UPDATE,
            {
                "issued_at": time.time() * 1000,
                "operation_id": str(uuid.uuid4()),
                "table_id": TABLE_ID,
                "id": OBJECT_ID,
                "expected_version": 1,
                "object": changed,
            },
        ),
        "player",
    )
    conflict = await harness.handle_paint_object_update(
        Message(
            MessageType.PAINT_OBJECT_UPDATE,
            {
                "issued_at": time.time() * 1000,
                "operation_id": str(uuid.uuid4()),
                "table_id": TABLE_ID,
                "id": OBJECT_ID,
                "expected_version": 1,
                "object": changed,
            },
        ),
        "player",
    )

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

    response = await harness.handle_paint_snapshot_request(
        Message(
            MessageType.PAINT_SNAPSHOT_REQUEST,
            {"table_id": TABLE_ID},
        ),
        "player",
    )

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
    chunks = _snapshot_chunks(PaintSnapshot(TABLE_ID, 2, objects), max_bytes=850)

    assert len(chunks) == 2
    assert [chunk.data["chunk_index"] for chunk in chunks] == [0, 1]
    assert all(chunk.data["chunk_count"] == 2 for chunk in chunks)
    assert [chunk.data["complete"] for chunk in chunks] == [False, True]
    assert all(len(chunk.to_json().encode("utf-8")) <= 850 for chunk in chunks)


def snapshot_objects(count: int) -> list[dict]:
    return [
        {
            **editable_object(str(uuid.uuid4())),
            "table_id": TABLE_ID,
            "created_by": 1,
            "version": 1,
            "z_order": index + 1,
            "created_at": "2026-10-13T00:00:00Z",
            "updated_at": "2026-10-13T00:00:00Z",
        }
        for index in range(count)
    ]


@pytest.mark.parametrize("identity", ["\u0001" * 128, "😀" * 128, '\\"' * 64])
def test_snapshot_sizes_complete_wire_frames_with_escaped_and_unicode_identities(identity):
    objects = snapshot_objects(500)
    # Validate the input envelope too: these unusual identities are legal.
    request = Message(MessageType.PAINT_SNAPSHOT_REQUEST, {"table_id": TABLE_ID},
                      message_id=identity, correlation_id=identity)
    Message.from_json(request.to_json())
    chunks = _snapshot_chunks(PaintSnapshot(TABLE_ID, 500, objects), max_bytes=65536,
                              correlation_id=identity, causation_id=identity)
    assert len(chunks) > 1
    assert [item for chunk in chunks for item in chunk.data["objects"]] == objects
    for index, chunk in enumerate(chunks):
        assert len(chunk.to_json().encode("utf-8")) <= 65536
        decoded = Message.from_json(chunk.to_json())
        assert decoded.correlation_id == decoded.causation_id == identity
        assert decoded.data == chunk.data
        assert chunk.data["chunk_index"] == index
        assert chunk.data["chunk_count"] == len(chunks)
        assert chunk.data["complete"] == (index == len(chunks) - 1)


def test_snapshot_empty_frame_and_oversized_objects_obey_full_envelope_budget():
    identity = "\u0001" * 128
    empty = _snapshot_chunks(PaintSnapshot(TABLE_ID, 0, []), max_bytes=2048,
                             correlation_id=identity, causation_id=identity)
    assert len(empty) == 1
    assert empty[0].data["objects"] == []
    assert empty[0].data["complete"] is True
    Message.from_json(empty[0].to_json())
    with pytest.raises(ValueError, match="metadata"):
        _snapshot_chunks(PaintSnapshot(TABLE_ID, 0, []), max_bytes=100,
                         correlation_id=identity, causation_id=identity)
    with pytest.raises(ValueError, match="object is too large"):
        _snapshot_chunks(PaintSnapshot(TABLE_ID, 1, snapshot_objects(1)), max_bytes=500)


@pytest.mark.asyncio
async def test_snapshot_handler_bounds_and_correlates_every_sent_frame(monkeypatch):
    objects = snapshot_objects(500)
    monkeypatch.setattr(paint_module, "_paint_snapshot", lambda **kwargs: PaintSnapshot(TABLE_ID, 500, objects))
    harness = PaintHarness(1, 1, "player")
    identity = "\u0001" * 128
    request = Message(MessageType.PAINT_SNAPSHOT_REQUEST, {"table_id": TABLE_ID},
                      message_id=identity, correlation_id=identity)
    final = await harness.handle_paint_snapshot_request(request, "player")
    chunks = [call.args[0] for call in harness.send_to_client.await_args_list] + [final]
    assert len(chunks) > 1
    assert [item for chunk in chunks for item in chunk.data["objects"]] == objects
    assert all(len(chunk.to_json().encode("utf-8")) <= 65536 for chunk in chunks)
    assert all(chunk.correlation_id == chunk.causation_id == identity for chunk in chunks)
    assert all(call.args[1] == "player" for call in harness.send_to_client.await_args_list)


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
    await harness.handle_paint_snapshot_request(
        Message(
            MessageType.PAINT_SNAPSHOT_REQUEST,
            {"table_id": TABLE_ID},
        ),
        "player",
    )
    await harness.handle_paint_object_delete(
        Message(
            MessageType.PAINT_OBJECT_DELETE,
            {
                "issued_at": time.time() * 1000,
                "operation_id": str(uuid.uuid4()),
                "table_id": TABLE_ID,
                "id": OBJECT_ID,
                "expected_version": 1,
            },
        ),
        "player",
    )

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
    await harness.handle_paint_preview_cancel(
        Message(
            MessageType.PAINT_PREVIEW_CANCEL,
            {
                "table_id": TABLE_ID,
                "temporary_id": OBJECT_ID,
                "sequence": 2,
                "actor_id": 999999,
            },
        ),
        "player",
    )

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
        membership = (
            db.query(models.GamePlayer)
            .filter_by(
                session_id=first_id,
                user_id=player_id,
            )
            .one()
        )
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
    oversized["geometry"]["points"] = [{"x": index, "y": index, "pressure": 0.5} for index in range(800)]

    await harness.handle_paint_preview(
        preview_message(draft=wrong_identity),
        "player",
    )
    await harness.handle_paint_preview(
        preview_message(draft=oversized),
        "player",
    )

    harness.broadcast_to_session.assert_not_awaited()


@pytest.mark.asyncio
async def test_disabled_paint_gate_denies_writes_and_drops_previews_but_keeps_snapshots(paint_db, monkeypatch):
    _, first_id, _, _, player_id, _ = paint_db
    monkeypatch.setenv("PAINT_OBJECT_WRITES_ENABLED", "false")
    harness = PaintHarness(first_id, player_id, "player")
    create_message = object_create_message()
    response = await harness.handle_paint_object_create(create_message, "player")
    assert response.type == MessageType.ERROR
    assert response.data["code"] == "paint_disabled"
    assert response.data["operation_id"] == create_message.data["operation_id"]
    await harness.handle_paint_preview(preview_message(), "player")
    harness.broadcast_to_session.assert_not_awaited()
    snapshot = await harness.handle_paint_snapshot_request(
        Message(MessageType.PAINT_SNAPSHOT_REQUEST, {"table_id": TABLE_ID}), "player"
    )
    assert snapshot.type == MessageType.PAINT_SNAPSHOT_CHUNK
    assert snapshot.data["revision"] == 0
    assert snapshot.data["objects"] == []


@pytest.mark.asyncio
async def test_preview_membership_cache_is_bounded_even_before_entries_expire(monkeypatch):
    monkeypatch.setattr(paint_module, "_authorize_paint_preview", lambda **kwargs: False)
    harness = PaintHarness(1, 1, "player")
    for index in range(300):
        assert not await harness._paint_preview_allowed(session_id=1, actor_id=1, table_id=f"table-{index}")
    assert len(harness._paint_preview_authorizations) == 256


@pytest.mark.asyncio
async def test_preview_relay_clamps_sender_expiry(paint_db, monkeypatch):
    _, first_id, _, _, player_id, _ = paint_db
    monkeypatch.setattr(paint_module.time, "time", lambda: 1_000)
    harness = PaintHarness(first_id, player_id, "player")
    message = preview_message()
    message.data["expires_at"] = 9_999_999_999_999
    await harness.handle_paint_preview(message, "player")
    relay = harness.broadcast_to_session.await_args.args[0]
    assert relay.data["expires_at"] == 1_002_000
