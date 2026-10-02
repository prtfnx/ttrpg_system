"""Safe, resumable persistence cutover from legacy strokes to paint objects."""

from __future__ import annotations

import json
import os
import uuid
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from database import models
from service.paint_legacy_migration import (
    LegacyPaintConversion,
    LegacyPaintStrokeRecord,
    convert_legacy_paint_strokes,
)
from sqlalchemy import text
from sqlalchemy.orm import Session


class PaintLegacyCutoverError(RuntimeError):
    """The cutover cannot continue without operator intervention."""


@dataclass(frozen=True)
class PaintLegacyCutoverPlan:
    records: tuple[LegacyPaintStrokeRecord, ...]
    conversion: LegacyPaintConversion

    def backup(self) -> dict[str, Any]:
        """Return the lossless source artifact written before any mutation."""
        return {
            "format": "ttrpg-paint-legacy-backup-v1",
            "source_count": self.conversion.source_count,
            "source_sha256": self.conversion.source_sha256,
            "rows": [
                {
                    "source_id": row.source_id,
                    "stroke_id": row.stroke_id,
                    "table_id": row.table_id,
                    "created_by": row.created_by,
                    "stroke_data": row.stroke_data,
                    "created_at": _timestamp(row.created_at),
                }
                for row in self.records
            ],
        }

    def report(self) -> dict[str, Any]:
        return {
            "format": "ttrpg-paint-legacy-cutover-report-v1",
            **self.conversion.report(),
        }


@dataclass(frozen=True)
class PaintLegacyCutoverResult:
    source_count: int
    converted_count: int
    inserted_count: int
    existing_count: int
    quarantined_count: int
    affected_tables: tuple[str, ...]


def _timestamp(value: datetime | None) -> str | None:
    if value is None:
        return None
    if value.tzinfo is None:
        value = value.replace(tzinfo=UTC)
    return value.astimezone(UTC).isoformat().replace("+00:00", "Z")


def _database_timestamp(value: str) -> datetime:
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    return parsed.astimezone(UTC).replace(tzinfo=None)


def _object_document(value: models.PaintObject) -> dict[str, Any]:
    return {
        "id": value.id,
        "table_id": value.table_id,
        "kind": value.kind,
        "geometry": value.geometry,
        "transform": value.transform,
        "style": value.style,
        "created_by": value.created_by,
        "version": value.version,
        "z_order": value.z_order,
        "created_at": _timestamp(value.created_at),
        "updated_at": _timestamp(value.updated_at),
    }


def _canonical(value: dict[str, Any]) -> str:
    return json.dumps(value, allow_nan=False, sort_keys=True, separators=(",", ":"))


def write_json_artifact(path: Path, document: dict[str, Any]) -> None:
    """Write a private JSON artifact atomically and never replace an existing file."""
    path = path.resolve()
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.exists():
        raise PaintLegacyCutoverError(f"Refusing to replace existing artifact: {path}")

    temporary = path.with_name(f".{path.name}.{uuid.uuid4().hex}.tmp")
    descriptor = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    try:
        with os.fdopen(descriptor, "w", encoding="utf-8") as stream:
            json.dump(document, stream, ensure_ascii=False, indent=2, sort_keys=True)
            stream.write("\n")
            stream.flush()
            os.fsync(stream.fileno())
        try:
            # A hard-link publication is atomic and, unlike POSIX rename,
            # cannot replace a destination created by a concurrent process.
            os.link(temporary, path)
        except FileExistsError as exc:
            raise PaintLegacyCutoverError(
                f"Refusing to replace existing artifact: {path}"
            ) from exc
    finally:
        if temporary.exists():
            temporary.unlink()

    with path.open(encoding="utf-8") as stream:
        if json.load(stream) != document:
            raise PaintLegacyCutoverError(f"Artifact verification failed: {path}")


def prepare_legacy_paint_cutover(db: Session) -> PaintLegacyCutoverPlan:
    """Lock paint persistence and take one deterministic source snapshot."""
    connection = db.connection()
    if connection.dialect.name == "postgresql":
        connection.execute(text("LOCK TABLE paint_strokes, paint_objects, paint_state IN SHARE ROW EXCLUSIVE MODE"))

    rows = db.query(models.PaintStroke).order_by(models.PaintStroke.id).all()
    records = tuple(
        LegacyPaintStrokeRecord(
            source_id=row.id,
            stroke_id=row.stroke_id,
            table_id=row.table_id,
            created_by=row.created_by,
            stroke_data=row.stroke_data,
            created_at=row.created_at,
        )
        for row in rows
    )
    return PaintLegacyCutoverPlan(
        records=records,
        conversion=convert_legacy_paint_strokes(records),
    )


def apply_legacy_paint_cutover(
    db: Session,
    plan: PaintLegacyCutoverPlan,
    *,
    expected_source_sha256: str,
    allow_quarantine: bool = False,
) -> PaintLegacyCutoverResult:
    """Insert the prepared objects in the caller-owned fenced transaction."""
    conversion = plan.conversion
    if expected_source_sha256 != conversion.source_sha256:
        raise PaintLegacyCutoverError("Source checksum does not match the reviewed cutover checksum")
    if conversion.quarantined and not allow_quarantine:
        raise PaintLegacyCutoverError(f"Refusing to apply with {len(conversion.quarantined)} quarantined row(s)")

    current = prepare_legacy_paint_cutover(db)
    if current.conversion.source_sha256 != conversion.source_sha256:
        raise PaintLegacyCutoverError("Legacy paint source changed after artifacts were written")

    expected_by_id = {item["id"]: item for item in conversion.objects}
    affected_tables = tuple(sorted({item["table_id"] for item in conversion.objects}))
    existing_rows: list[models.PaintObject] = []
    if affected_tables:
        existing_rows = (
            db.query(models.PaintObject)
            .filter(models.PaintObject.table_id.in_(affected_tables))
            .order_by(models.PaintObject.table_id, models.PaintObject.z_order)
            .all()
        )

    for row in existing_rows:
        expected = expected_by_id.get(row.id)
        if expected is None or _canonical(_object_document(row)) != _canonical(expected):
            raise PaintLegacyCutoverError(f"Paint object state already diverged on table {row.table_id}")

    existing_ids = {row.id for row in existing_rows}
    inserted = 0
    for item in conversion.objects:
        if item["id"] in existing_ids:
            continue
        db.add(
            models.PaintObject(
                id=item["id"],
                table_id=item["table_id"],
                kind=item["kind"],
                geometry=item["geometry"],
                transform=item["transform"],
                style=item["style"],
                created_by=item["created_by"],
                version=item["version"],
                z_order=item["z_order"],
                created_at=_database_timestamp(item["created_at"]),
                updated_at=_database_timestamp(item["updated_at"]),
            )
        )
        inserted += 1

    for table_id in affected_tables:
        expected_next = 1 + max(item["z_order"] for item in conversion.objects if item["table_id"] == table_id)
        state = db.get(models.PaintState, table_id)
        if state is None:
            state = models.PaintState(table_id=table_id, revision=0, next_z_order=expected_next)
            db.add(state)
        elif state.revision != 0 or state.next_z_order not in {1, expected_next}:
            raise PaintLegacyCutoverError(f"Paint state already diverged on table {table_id}")
        else:
            state.next_z_order = expected_next

    db.flush()
    persisted_count = 0
    if affected_tables:
        persisted_count = db.query(models.PaintObject).filter(models.PaintObject.table_id.in_(affected_tables)).count()
    if persisted_count != conversion.converted_count:
        raise PaintLegacyCutoverError("Post-write verification count does not match the conversion report")

    for object_id, expected in expected_by_id.items():
        persisted = db.get(models.PaintObject, object_id)
        if persisted is None or _canonical(_object_document(persisted)) != _canonical(expected):
            raise PaintLegacyCutoverError(f"Post-write verification failed for paint object {object_id}")

    return PaintLegacyCutoverResult(
        source_count=conversion.source_count,
        converted_count=conversion.converted_count,
        inserted_count=inserted,
        existing_count=len(existing_ids),
        quarantined_count=len(conversion.quarantined),
        affected_tables=affected_tables,
    )
