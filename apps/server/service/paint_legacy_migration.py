"""Deterministic preparation of legacy strokes for the paint-object cutover."""

from __future__ import annotations

import hashlib
import json
import math
import uuid
from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any, Iterable

from core_table.paint import PaintValidationError, validate_paint_object

LEGACY_PAINT_NAMESPACE = uuid.UUID("c916da91-1d17-5a70-8108-304876be70d0")


@dataclass(frozen=True)
class LegacyPaintStrokeRecord:
    source_id: int
    stroke_id: str
    table_id: str
    created_by: int | None
    stroke_data: str
    created_at: datetime | None


@dataclass(frozen=True)
class PaintQuarantineRecord:
    source_id: int
    stroke_id: str
    table_id: str
    reason: str
    payload_sha256: str


@dataclass
class LegacyPaintConversion:
    source_count: int
    source_sha256: str
    objects: list[dict[str, Any]] = field(default_factory=list)
    id_mapping: dict[str, str] = field(default_factory=dict)
    quarantined: list[PaintQuarantineRecord] = field(default_factory=list)

    @property
    def converted_count(self) -> int:
        return len(self.objects)

    def report(self) -> dict[str, Any]:
        return {
            "source_count": self.source_count,
            "source_sha256": self.source_sha256,
            "converted_count": self.converted_count,
            "quarantined_count": len(self.quarantined),
            "id_mapping": dict(self.id_mapping),
            "quarantined": [
                {
                    "source_id": row.source_id,
                    "stroke_id": row.stroke_id,
                    "table_id": row.table_id,
                    "reason": row.reason,
                    "payload_sha256": row.payload_sha256,
                }
                for row in self.quarantined
            ],
        }


def _record_key(record: LegacyPaintStrokeRecord) -> str:
    return f"{record.table_id}:{record.source_id}"


def _stable_object_id(record: LegacyPaintStrokeRecord) -> str:
    identity = f"ttrpg:paint-stroke:{record.table_id}:{record.source_id}:{record.stroke_id}"
    return str(uuid.uuid5(LEGACY_PAINT_NAMESPACE, identity))


def _timestamp(value: datetime) -> str:
    if value.tzinfo is None:
        value = value.replace(tzinfo=UTC)
    return value.astimezone(UTC).isoformat().replace("+00:00", "Z")


def _finite_number(value: Any, field_name: str) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise ValueError(f"{field_name} must be numeric")
    result = float(value)
    if not math.isfinite(result):
        raise ValueError(f"{field_name} must be finite")
    return result


def _point(value: Any, index: int) -> dict[str, float]:
    if isinstance(value, dict):
        unexpected = set(value) - {"x", "y", "pressure"}
        if unexpected or "x" not in value or "y" not in value:
            raise ValueError(f"point {index} has invalid fields")
        x, y = value["x"], value["y"]
        pressure = value.get("pressure", 0.5)
    elif isinstance(value, (list, tuple)) and len(value) in {2, 3}:
        x, y = value[0], value[1]
        pressure = value[2] if len(value) == 3 else 0.5
    else:
        raise ValueError(f"point {index} must be an object or coordinate tuple")

    return {
        "x": _finite_number(x, f"point {index} x"),
        "y": _finite_number(y, f"point {index} y"),
        "pressure": _finite_number(pressure, f"point {index} pressure"),
    }


def _rgba(value: Any) -> list[float]:
    if not isinstance(value, (list, tuple)) or len(value) != 4:
        raise ValueError("color must contain four channels")
    return [_finite_number(channel, f"color channel {index}") for index, channel in enumerate(value)]


def _convert_record(
    record: LegacyPaintStrokeRecord,
    *,
    z_order: int,
) -> dict[str, Any]:
    if record.created_by is None or record.created_by < 1:
        raise ValueError("creator is missing")
    if record.created_at is None:
        raise ValueError("creation timestamp is missing")

    try:
        payload = json.loads(record.stroke_data)
    except (TypeError, json.JSONDecodeError) as exc:
        raise ValueError("stroke_data is not valid JSON") from exc
    if not isinstance(payload, dict):
        raise ValueError("stroke_data must contain an object")
    if payload.get("id") not in {None, record.stroke_id}:
        raise ValueError("embedded stroke id does not match the stored id")

    blend_mode = payload.get("blend_mode", "Alpha")
    if blend_mode not in {"Alpha", "alpha"}:
        raise ValueError(f"unsupported legacy blend mode: {blend_mode}")

    raw_points = payload.get("points")
    if not isinstance(raw_points, list) or not raw_points:
        raise ValueError("stroke must contain at least one point")

    timestamp = _timestamp(record.created_at)
    paint_object = {
        "id": _stable_object_id(record),
        "table_id": record.table_id,
        "kind": "freehand",
        "geometry": {
            "kind": "freehand",
            "points": [_point(point, index) for index, point in enumerate(raw_points)],
        },
        "transform": {"x": 0.0, "y": 0.0, "scale_x": 1.0, "scale_y": 1.0},
        "style": {
            "stroke_rgba": _rgba(payload.get("color", [1.0, 1.0, 1.0, 1.0])),
            "width": _finite_number(payload.get("width", 2.0), "width"),
            "fill_rgba": None,
        },
        "created_by": record.created_by,
        "version": 1,
        "z_order": z_order,
        "created_at": timestamp,
        "updated_at": timestamp,
    }
    try:
        validate_paint_object(paint_object)
    except PaintValidationError as exc:
        raise ValueError(str(exc)) from exc
    return paint_object


def _source_checksum(records: list[LegacyPaintStrokeRecord]) -> str:
    digest = hashlib.sha256()
    for record in records:
        canonical = {
            "source_id": record.source_id,
            "stroke_id": record.stroke_id,
            "table_id": record.table_id,
            "created_by": record.created_by,
            "stroke_data": record.stroke_data,
            "created_at": (
                _timestamp(record.created_at) if record.created_at is not None else None
            ),
        }
        digest.update(json.dumps(canonical, sort_keys=True, separators=(",", ":")).encode())
        digest.update(b"\n")
    return digest.hexdigest()


def convert_legacy_paint_strokes(
    source: Iterable[LegacyPaintStrokeRecord],
) -> LegacyPaintConversion:
    """Prepare valid objects and a complete quarantine report without DB writes."""
    records = sorted(
        source,
        key=lambda row: (
            row.table_id,
            _timestamp(row.created_at) if row.created_at is not None else "",
            row.source_id,
            row.stroke_id,
        ),
    )
    conversion = LegacyPaintConversion(
        source_count=len(records),
        source_sha256=_source_checksum(records),
    )
    next_z_order: dict[str, int] = {}

    for record in records:
        key = _record_key(record)
        object_id = _stable_object_id(record)
        conversion.id_mapping[key] = object_id
        z_order = next_z_order.get(record.table_id, 1)
        try:
            paint_object = _convert_record(record, z_order=z_order)
        except ValueError as exc:
            conversion.quarantined.append(PaintQuarantineRecord(
                source_id=record.source_id,
                stroke_id=record.stroke_id,
                table_id=record.table_id,
                reason=str(exc)[:256],
                payload_sha256=hashlib.sha256(record.stroke_data.encode()).hexdigest(),
            ))
            continue
        conversion.objects.append(paint_object)
        next_z_order[record.table_id] = z_order + 1

    return conversion
