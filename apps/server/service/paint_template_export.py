"""Lossless maintenance export for the retired paint-template table."""

from __future__ import annotations

import hashlib
import json
from datetime import UTC, datetime
from typing import Any

from database import models
from sqlalchemy.orm import Session


def _timestamp(value: datetime | None) -> str | None:
    if value is None:
        return None
    if value.tzinfo is None:
        value = value.replace(tzinfo=UTC)
    return value.astimezone(UTC).isoformat().replace("+00:00", "Z")


def build_paint_template_export(db: Session) -> dict[str, Any]:
    """Return a deterministic, lossless document for every stored template."""
    rows = (
        db.query(models.PaintTemplate)
        .order_by(
            models.PaintTemplate.session_id,
            models.PaintTemplate.id,
        )
        .all()
    )
    templates = [
        {
            "source_id": row.id,
            "template_id": row.template_id,
            "session_id": row.session_id,
            "created_by": row.created_by,
            "name": row.name,
            "description": row.description,
            "strokes_json": row.strokes_json,
            "thumbnail": row.thumbnail,
            "created_at": _timestamp(row.created_at),
            "updated_at": _timestamp(row.updated_at),
        }
        for row in rows
    ]
    canonical = json.dumps(
        templates,
        ensure_ascii=False,
        allow_nan=False,
        sort_keys=True,
        separators=(",", ":"),
    ).encode("utf-8")
    return {
        "format": "ttrpg-paint-template-export-v1",
        "source_count": len(templates),
        "source_sha256": hashlib.sha256(canonical).hexdigest(),
        "templates": templates,
    }
