from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from core_table.protocol import Message, MessageType
from database import models
from service.protocol.measurements import _MeasurementsMixin


class MeasurementHarness(_MeasurementsMixin):
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
def measurement_db(monkeypatch, test_db, test_game_session, test_user, player_user):
    table = models.VirtualTable(
        table_id="measurement-table",
        name="Measurements",
        width=800,
        height=600,
        session_id=test_game_session.id,
    )
    test_db.add(table)
    test_db.commit()
    def session_factory():
        return test_db

    import service.protocol.measurements as module

    monkeypatch.setattr(module, "SessionLocal", session_factory)
    return test_game_session.id, table.table_id, test_user.id, player_user.id


def _upsert(table_id: str, measurement_id: str = "measurement-1") -> Message:
    return Message(MessageType.MEASUREMENT_UPSERT, {
        "table_id": table_id,
        "measurement_id": measurement_id,
        "kind": "line",
        "measurement": {
            "id": measurement_id,
            "start": {"x": 0, "y": 0},
            "end": {"x": 10, "y": 20},
        },
    })


@pytest.mark.asyncio
async def test_completed_measurement_is_persisted_and_broadcast(measurement_db):
    session_id, table_id, owner_id, _ = measurement_db
    harness = MeasurementHarness(session_id, owner_id, "player")

    result = await harness.handle_measurement_upsert(_upsert(table_id), "owner")

    assert result.type == MessageType.MEASUREMENT_UPSERT
    assert result.data["created_by"] == owner_id
    harness.broadcast_to_session.assert_awaited_once()


@pytest.mark.asyncio
async def test_creator_or_dm_can_delete_measurement(measurement_db):
    session_id, table_id, owner_id, other_id = measurement_db
    harness = MeasurementHarness(session_id, owner_id, "player")
    await harness.handle_measurement_upsert(_upsert(table_id), "owner")

    harness.user_id = other_id
    denied = await harness.handle_measurement_delete(
        Message(MessageType.MEASUREMENT_DELETE, {
            "table_id": table_id,
            "measurement_id": "measurement-1",
        }),
        "other",
    )
    assert denied.type == MessageType.ERROR

    harness.role = "co_dm"
    deleted = await harness.handle_measurement_delete(
        Message(MessageType.MEASUREMENT_DELETE, {
            "table_id": table_id,
            "measurement_id": "measurement-1",
        }),
        "dm",
    )
    assert deleted.type == MessageType.MEASUREMENT_DELETE
