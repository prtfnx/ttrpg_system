import copy
import uuid
from datetime import timedelta

import pytest
from core_table.paint import PaintLimits
from database import models
from service import paint_object_service as service_module
from service.paint_object_service import PaintCommandError, PaintObjectService
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from utils.time import utc_now

TABLE_ID = "9e8ed60d-f18c-4f47-a5ce-fc04db50506a"
OTHER_TABLE_ID = "d57d06dc-85d1-42a7-a928-2d1fa10848f9"
OBJECT_ID = "dd830253-e2bf-4a92-9862-eabe85f79c99"


def editable(object_id: str = OBJECT_ID) -> dict:
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


@pytest.fixture
def paint_service():
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    factory = sessionmaker(bind=engine)
    models.Base.metadata.create_all(engine)
    with factory.begin() as db:
        owner = models.User(username="owner", hashed_password="x")
        player = models.User(username="player", hashed_password="x")
        other = models.User(username="other", hashed_password="x")
        spectator = models.User(username="spectator", hashed_password="x")
        db.add_all([owner, player, other, spectator])
        db.flush()
        session = models.GameSession(
            name="First", session_code="FIRST", owner_id=owner.id
        )
        foreign_session = models.GameSession(
            name="Second", session_code="SECOND", owner_id=other.id
        )
        db.add_all([session, foreign_session])
        db.flush()
        db.add_all([
            models.GamePlayer(
                session_id=session.id, user_id=player.id, role="player"
            ),
            models.GamePlayer(
                session_id=session.id, user_id=spectator.id, role="spectator"
            ),
            models.GamePlayer(
                session_id=session.id, user_id=other.id, role="player"
            ),
            models.VirtualTable(
                table_id=TABLE_ID,
                name="First",
                width=1000,
                height=1000,
                session_id=session.id,
            ),
            models.VirtualTable(
                table_id=OTHER_TABLE_ID,
                name="Second",
                width=1000,
                height=1000,
                session_id=foreign_session.id,
            ),
        ])
        ids = {
            "session": session.id,
            "foreign_session": foreign_session.id,
            "owner": owner.id,
            "player": player.id,
            "other": other.id,
            "spectator": spectator.id,
        }
    yield PaintObjectService(factory), factory, ids
    engine.dispose()


def create(service, ids, *, actor="player", operation_id=None, value=None):
    return service.create(
        session_id=ids["session"],
        actor_id=ids[actor],
        table_id=TABLE_ID,
        operation_id=operation_id or str(uuid.uuid4()),
        editable=value or editable(),
    )


def test_create_assigns_server_fields_revision_and_stable_order(paint_service):
    service, _, ids = paint_service

    first = create(service, ids)
    second = create(service, ids, value=editable(str(uuid.uuid4())))

    assert first.error is None and first.broadcast
    assert first.event["revision"] == 1
    assert first.event["object"]["created_by"] == ids["player"]
    assert first.event["object"]["version"] == 1
    assert first.event["object"]["z_order"] == 1
    assert second.event["revision"] == 2
    assert second.event["object"]["z_order"] == 2


def test_disabled_paint_gate_rejects_commands_before_opening_database():
    def unavailable_database():
        pytest.fail("A disabled paint writer must not open a database session")

    service = PaintObjectService(unavailable_database, writes_enabled=False)
    context = {"session_id": 1, "actor_id": 1, "table_id": TABLE_ID, "operation_id": str(uuid.uuid4())}
    results = [
        service.create(**context, editable=editable()),
        service.update(**context, object_id=OBJECT_ID, expected_version=1, editable=editable()),
        service.delete(**context, object_id=OBJECT_ID, expected_version=1),
    ]
    for result in results:
        assert result.error.code == "paint_disabled"
        assert result.event is None
        assert not result.broadcast


def test_disabled_paint_gate_preserves_objects_and_allows_authorized_snapshots(paint_service):
    service, factory, ids = paint_service
    created = create(service, ids)
    readonly = PaintObjectService(factory, writes_enabled=False)
    snapshot = readonly.snapshot(session_id=ids["session"], actor_id=ids["spectator"], table_id=TABLE_ID)
    assert snapshot.revision == 1
    assert snapshot.objects == [created.event["object"]]
    assert create(readonly, ids).error.code == "paint_disabled"
    with factory() as db:
        assert db.query(models.PaintObject).count() == 1
        assert db.query(models.PaintOperationResult).count() == 1
        assert db.get(models.PaintState, TABLE_ID).revision == 1


def test_identical_retry_returns_recorded_result_without_rebroadcast(paint_service):
    service, factory, ids = paint_service
    operation_id = str(uuid.uuid4())

    first = create(service, ids, operation_id=operation_id)
    replay = create(service, ids, operation_id=operation_id)

    assert replay.event == first.event
    assert not replay.broadcast
    with factory() as db:
        assert db.query(models.PaintObject).count() == 1
        assert db.query(models.PaintOperationResult).count() == 1


def test_reused_operation_id_with_different_body_is_rejected(paint_service):
    service, _, ids = paint_service
    operation_id = str(uuid.uuid4())
    create(service, ids, operation_id=operation_id)
    changed = editable()
    changed["style"]["width"] = 4

    result = create(service, ids, operation_id=operation_id, value=changed)

    assert result.error.code == "invalid_payload"
    assert result.event is None


def test_retry_after_supported_window_requires_snapshot(paint_service):
    _, factory, ids = paint_service
    operation_id = str(uuid.uuid4())
    service = PaintObjectService(factory, retry_window_seconds=3600)
    first = create(service, ids, operation_id=operation_id)
    with factory.begin() as db:
        recorded = db.get(
            models.PaintOperationResult,
            (TABLE_ID, ids["player"], operation_id),
        )
        assert recorded is not None
        recorded.created_at = utc_now() - timedelta(hours=2)

    replay = create(service, ids, operation_id=operation_id)

    assert first.error is None
    assert replay.error.code == "retry_window_expired"
    assert replay.event is None
    with factory() as db:
        assert db.query(models.PaintObject).count() == 1
        assert db.query(models.PaintOperationResult).count() == 1
        assert db.get(models.PaintState, TABLE_ID).revision == 1


def test_retry_window_must_be_positive(paint_service):
    _, factory, _ = paint_service

    with pytest.raises(ValueError, match="retry_window_seconds"):
        PaintObjectService(factory, retry_window_seconds=0)


def test_update_requires_current_version_and_preserves_server_fields(paint_service):
    service, _, ids = paint_service
    accepted = create(service, ids)
    replacement = editable()
    replacement["transform"]["x"] = 50

    updated = service.update(
        session_id=ids["session"],
        actor_id=ids["player"],
        table_id=TABLE_ID,
        operation_id=str(uuid.uuid4()),
        object_id=OBJECT_ID,
        expected_version=1,
        editable=replacement,
    )
    conflict = service.update(
        session_id=ids["session"],
        actor_id=ids["player"],
        table_id=TABLE_ID,
        operation_id=str(uuid.uuid4()),
        object_id=OBJECT_ID,
        expected_version=1,
        editable=replacement,
    )

    assert updated.event["revision"] == 2
    assert updated.event["object"]["version"] == 2
    assert updated.event["object"]["z_order"] == accepted.event["object"]["z_order"]
    assert updated.event["object"]["created_by"] == ids["player"]
    assert conflict.error.code == "version_conflict"
    assert conflict.error.current_version == 2
    assert conflict.error.current_object == updated.event["object"]


def test_creator_and_dm_permissions_apply_to_update_and_delete(paint_service):
    service, factory, ids = paint_service
    create(service, ids)
    denied = service.delete(
        session_id=ids["session"],
        actor_id=ids["other"],
        table_id=TABLE_ID,
        operation_id=str(uuid.uuid4()),
        object_id=OBJECT_ID,
        expected_version=1,
    )
    deleted = service.delete(
        session_id=ids["session"],
        actor_id=ids["owner"],
        table_id=TABLE_ID,
        operation_id=str(uuid.uuid4()),
        object_id=OBJECT_ID,
        expected_version=1,
    )

    assert denied.error.code == "forbidden"
    assert deleted.event["action"] == "delete"
    assert deleted.event["revision"] == 2
    with factory() as db:
        assert db.query(models.PaintObject).count() == 0
        assert db.query(models.PaintOperationResult).count() == 2


def test_delete_retry_returns_tombstone_without_rebroadcast(paint_service):
    service, factory, ids = paint_service
    create(service, ids)
    operation_id = str(uuid.uuid4())

    first = service.delete(
        session_id=ids["session"],
        actor_id=ids["player"],
        table_id=TABLE_ID,
        operation_id=operation_id,
        object_id=OBJECT_ID,
        expected_version=1,
    )
    replay = service.delete(
        session_id=ids["session"],
        actor_id=ids["player"],
        table_id=TABLE_ID,
        operation_id=operation_id,
        object_id=OBJECT_ID,
        expected_version=1,
    )

    assert replay.event == first.event
    assert not replay.broadcast
    with factory() as db:
        assert db.query(models.PaintObject).count() == 0


def test_spectator_and_foreign_table_writes_fail_closed(paint_service):
    service, _, ids = paint_service

    spectator = create(service, ids, actor="spectator")
    foreign = service.create(
        session_id=ids["session"],
        actor_id=ids["player"],
        table_id=OTHER_TABLE_ID,
        operation_id=str(uuid.uuid4()),
        editable=editable(),
    )

    assert spectator.error.code == "forbidden"
    assert foreign.error.code == "not_found"


def test_snapshot_is_ordered_and_available_to_spectators(paint_service):
    service, _, ids = paint_service
    first = create(service, ids)
    second = create(service, ids, value=editable(str(uuid.uuid4())))

    snapshot = service.snapshot(
        session_id=ids["session"],
        actor_id=ids["spectator"],
        table_id=TABLE_ID,
    )

    assert not isinstance(snapshot, PaintCommandError)
    assert snapshot.revision == 2
    assert [item["id"] for item in snapshot.objects] == [
        first.event["object"]["id"],
        second.event["object"]["id"],
    ]


def test_empty_snapshot_does_not_turn_a_read_into_a_database_write(paint_service):
    service, factory, ids = paint_service

    snapshot = service.snapshot(
        session_id=ids["session"],
        actor_id=ids["spectator"],
        table_id=TABLE_ID,
    )

    assert not isinstance(snapshot, PaintCommandError)
    assert snapshot.revision == 0
    assert snapshot.objects == []
    with factory() as db:
        assert db.query(models.PaintState).count() == 0


def test_invalid_payload_never_mutates_committed_state(paint_service):
    service, factory, ids = paint_service
    invalid = copy.deepcopy(editable())
    invalid["transform"]["x"] = float("nan")

    result = create(service, ids, value=invalid)

    assert result.error.code == "invalid_payload"
    with factory() as db:
        assert db.query(models.PaintObject).count() == 0
        assert db.query(models.PaintState).count() == 0


def test_table_object_and_point_budgets_are_enforced(
    paint_service, monkeypatch
):
    service, _, ids = paint_service
    monkeypatch.setattr(
        service_module,
        "paint_limits",
        lambda: PaintLimits(61_440, 1, 100_000),
    )
    create(service, ids)
    object_limited = create(service, ids, value=editable(str(uuid.uuid4())))

    monkeypatch.setattr(
        service_module,
        "paint_limits",
        lambda: PaintLimits(61_440, 2_000, 1),
    )
    two_points = editable(str(uuid.uuid4()))
    two_points["geometry"]["points"].append(
        {"x": 1, "y": 1, "pressure": 0.5}
    )
    point_limited = create(service, ids, value=two_points)

    assert object_limited.error.code == "limit_exceeded"
    assert point_limited.error.code == "limit_exceeded"
