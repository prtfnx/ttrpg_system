import json
import math
import re
from dataclasses import dataclass
from typing import Any

from core_table.protocol import Message, MessageType
from database import crud, models
from database.database import SessionLocal
from utils.blocking import run_blocking
from utils.logger import setup_logger
from utils.roles import can_interact, is_dm

from ._protocol_base import _ProtocolBase

logger = setup_logger(__name__)
_IDENTIFIER = re.compile(r"^[A-Za-z0-9._-]{1,64}$")
_MAX_MEASUREMENTS_PER_TABLE = 500
_MAX_MEASUREMENT_BYTES = 64 * 1024


@dataclass(frozen=True)
class _MeasurementResult:
    payload: dict[str, Any] | None = None
    error: str | None = None


def _table_in_session(db, table_id: str, session_id: int) -> bool:
    return db.query(models.VirtualTable.id).filter(
        models.VirtualTable.table_id == table_id,
        models.VirtualTable.session_id == session_id,
    ).first() is not None


def _upsert_measurement(
    *,
    session_id: int,
    user_id: int,
    table_id: str,
    measurement_id: str,
    kind: str,
    measurement_data: str,
) -> _MeasurementResult:
    db = SessionLocal()
    try:
        if not _table_in_session(db, table_id, session_id):
            return _MeasurementResult(error="Table not found in this session")
        existing = crud.get_shared_measurement(db, table_id, measurement_id)
        if (
            existing is None
            and len(crud.get_shared_measurements(db, table_id))
            >= _MAX_MEASUREMENTS_PER_TABLE
        ):
            return _MeasurementResult(error="Table measurement limit reached")
        measurement = crud.upsert_shared_measurement(
            db,
            table_id=table_id,
            measurement_id=measurement_id,
            created_by=user_id,
            kind=kind,
            measurement_data=measurement_data,
        )
        return _MeasurementResult(
            payload={"operation": "upsert", **measurement.to_dict()}
        )
    except PermissionError as exc:
        return _MeasurementResult(error=str(exc))
    except Exception:
        logger.exception("Shared measurement persistence failed")
        return _MeasurementResult(error="Measurement could not be persisted")
    finally:
        db.close()


def _delete_measurement(
    *,
    session_id: int,
    table_id: str,
    measurement_id: str,
    created_by: int | None,
) -> _MeasurementResult:
    db = SessionLocal()
    try:
        if not _table_in_session(db, table_id, session_id):
            return _MeasurementResult(error="Table not found in this session")
        deleted = crud.delete_shared_measurement(
            db,
            table_id,
            measurement_id,
            created_by=created_by,
        )
        if not deleted:
            return _MeasurementResult(error="Measurement not found or not owned by you")
        return _MeasurementResult(payload={
            "operation": "delete",
            "table_id": table_id,
            "measurement_id": measurement_id,
        })
    except Exception:
        logger.exception("Shared measurement deletion failed")
        return _MeasurementResult(error="Measurement could not be deleted")
    finally:
        db.close()


def _clear_measurements(
    *,
    session_id: int,
    table_id: str,
    created_by: int | None,
) -> _MeasurementResult:
    db = SessionLocal()
    try:
        if not _table_in_session(db, table_id, session_id):
            return _MeasurementResult(error="Table not found in this session")
        count = crud.clear_shared_measurements(
            db,
            table_id,
            created_by=created_by,
        )
        return _MeasurementResult(payload={
            "operation": "clear",
            "table_id": table_id,
            "created_by": created_by,
            "cleared": count,
        })
    except Exception:
        logger.exception("Shared measurement clearing failed")
        return _MeasurementResult(error="Measurements could not be cleared")
    finally:
        db.close()


def _load_measurements(*, session_id: int, table_id: str) -> _MeasurementResult:
    db = SessionLocal()
    try:
        if not _table_in_session(db, table_id, session_id):
            return _MeasurementResult(error="Table not found in this session")
        measurements = [
            measurement.to_dict()
            for measurement in crud.get_shared_measurements(db, table_id)
        ]
        return _MeasurementResult(payload={
            "table_id": table_id,
            "measurements": measurements,
        })
    except Exception:
        logger.exception("Shared measurement sync failed")
        return _MeasurementResult(error="Measurements could not be loaded")
    finally:
        db.close()


def _valid_point(value: Any) -> bool:
    if not isinstance(value, dict):
        return False
    x, y = value.get("x"), value.get("y")
    return (
        isinstance(x, (int, float))
        and not isinstance(x, bool)
        and math.isfinite(x)
        and isinstance(y, (int, float))
        and not isinstance(y, bool)
        and math.isfinite(y)
    )


def _validate_measurement(kind: str, value: Any, measurement_id: str) -> str:
    if not isinstance(value, dict) or value.get("id") != measurement_id:
        raise ValueError("measurement id must match measurement_id")
    if kind == "line":
        if not _valid_point(value.get("start")) or not _valid_point(value.get("end")):
            raise ValueError("line measurements require finite start and end points")
    elif kind == "shape":
        points = value.get("points")
        if (
            not isinstance(points, list)
            or not 2 <= len(points) <= 100
            or not all(_valid_point(point) for point in points)
        ):
            raise ValueError("shapes require between 2 and 100 finite points")
    else:
        raise ValueError("kind must be line or shape")
    encoded = json.dumps(
        value,
        separators=(",", ":"),
        sort_keys=True,
        allow_nan=False,
    )
    if len(encoded.encode("utf-8")) > _MAX_MEASUREMENT_BYTES:
        raise ValueError("measurement exceeds 64 KiB")
    return encoded


class _MeasurementsMixin(_ProtocolBase):
    """Persist and synchronize completed table measurements."""

    def _measurement_context(
        self, msg: Message, client_id: str
    ) -> tuple[int, int, str] | Message:
        if not can_interact(self._get_client_role(client_id)):
            return Message(MessageType.ERROR, {"error": "Not permitted to share measurements"})
        session_id = self._get_session_id(msg)
        user_id = self._get_user_id(msg, client_id)
        table_id = (msg.data or {}).get("table_id")
        if session_id is None or user_id is None:
            return Message(MessageType.ERROR, {"error": "Authenticated session context is required"})
        if not isinstance(table_id, str) or not table_id or len(table_id) > 36:
            return Message(MessageType.ERROR, {"error": "Valid table_id is required"})
        return session_id, user_id, table_id

    async def handle_measurement_upsert(
        self, msg: Message, client_id: str
    ) -> Message:
        context = self._measurement_context(msg, client_id)
        if isinstance(context, Message):
            return context
        session_id, user_id, table_id = context
        data = msg.data or {}
        measurement_id = data.get("measurement_id")
        kind = data.get("kind")
        if not isinstance(measurement_id, str) or not _IDENTIFIER.fullmatch(measurement_id):
            return Message(MessageType.ERROR, {"error": "Invalid measurement_id"})
        if not isinstance(kind, str):
            return Message(MessageType.ERROR, {"error": "kind is required"})
        try:
            measurement_data = _validate_measurement(
                kind, data.get("measurement"), measurement_id
            )
        except (TypeError, ValueError) as exc:
            return Message(MessageType.ERROR, {"error": str(exc)})

        result = await run_blocking(
            _upsert_measurement,
            session_id=session_id,
            user_id=user_id,
            table_id=table_id,
            measurement_id=measurement_id,
            kind=kind,
            measurement_data=measurement_data,
        )
        if result.error or result.payload is None:
            return Message(
                MessageType.ERROR,
                {"error": result.error or "Measurement could not be persisted"},
            )

        outbound = Message(MessageType.MEASUREMENT_UPSERT, result.payload)
        await self.broadcast_to_session(outbound, client_id)
        return outbound

    async def handle_measurement_delete(
        self, msg: Message, client_id: str
    ) -> Message:
        context = self._measurement_context(msg, client_id)
        if isinstance(context, Message):
            return context
        session_id, user_id, table_id = context
        measurement_id = (msg.data or {}).get("measurement_id")
        if not isinstance(measurement_id, str) or not _IDENTIFIER.fullmatch(measurement_id):
            return Message(MessageType.ERROR, {"error": "Invalid measurement_id"})
        role = self._get_client_role(client_id)

        result = await run_blocking(
            _delete_measurement,
            session_id=session_id,
            table_id=table_id,
            measurement_id=measurement_id,
            created_by=None if is_dm(role) else user_id,
        )
        if result.error or result.payload is None:
            return Message(
                MessageType.ERROR,
                {"error": result.error or "Measurement could not be deleted"},
            )

        outbound = Message(MessageType.MEASUREMENT_DELETE, result.payload)
        await self.broadcast_to_session(outbound, client_id)
        return outbound

    async def handle_measurement_clear(
        self, msg: Message, client_id: str
    ) -> Message:
        context = self._measurement_context(msg, client_id)
        if isinstance(context, Message):
            return context
        session_id, user_id, table_id = context
        clear_all = (msg.data or {}).get("all") is True
        role = self._get_client_role(client_id)
        if clear_all and not is_dm(role):
            return Message(MessageType.ERROR, {"error": "Only a DM can clear all measurements"})

        created_by = None if clear_all else user_id
        result = await run_blocking(
            _clear_measurements,
            session_id=session_id,
            table_id=table_id,
            created_by=created_by,
        )
        if result.error or result.payload is None:
            return Message(
                MessageType.ERROR,
                {"error": result.error or "Measurements could not be cleared"},
            )

        outbound = Message(MessageType.MEASUREMENT_CLEAR, result.payload)
        await self.broadcast_to_session(outbound, client_id)
        return outbound

    async def handle_measurement_sync(
        self, msg: Message, client_id: str
    ) -> Message:
        context = self._measurement_context(msg, client_id)
        if isinstance(context, Message):
            return context
        session_id, _, table_id = context
        result = await run_blocking(
            _load_measurements,
            session_id=session_id,
            table_id=table_id,
        )
        if result.error or result.payload is None:
            return Message(
                MessageType.ERROR,
                {"error": result.error or "Measurements could not be loaded"},
            )
        return Message(MessageType.MEASUREMENT_SYNC, result.payload)
