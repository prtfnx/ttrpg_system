"""Retention cleanup for durable paint operation results."""

from __future__ import annotations

from datetime import datetime, timedelta
from typing import Callable

from config import Settings
from database import models
from database.database import SessionLocal
from service.canvas_command_service import RETENTION as CANVAS_RETENTION
from sqlalchemy.orm import Session
from utils.time import utc_now


def cleanup_expired_paint_operations(
    *,
    session_factory: Callable[[], Session] = SessionLocal,
    retention_seconds: int | None = None,
    now: Callable[[], datetime] = utc_now,
) -> int:
    """Delete ledger rows older than the configured supported retention."""
    configured_retention = (
        retention_seconds if retention_seconds is not None else Settings().PAINT_OPERATION_RETENTION_SECONDS
    )
    if configured_retention <= 0:
        raise ValueError("retention_seconds must be positive")
    cutoff = now() - timedelta(seconds=configured_retention)
    with session_factory() as db, db.begin():
        deleted = (
            db.query(models.PaintOperationResult)
            .filter(models.PaintOperationResult.created_at < cutoff)
            .delete(synchronize_session=False)
        )
        # Canvas intents expire after 24 hours; retaining receipts for 48 hours
        # cannot make an expired intent execute twice after cleanup.
        db.query(models.CanvasCommandJournal).filter(
            models.CanvasCommandJournal.created_at < now() - CANVAS_RETENTION
        ).delete(synchronize_session=False)
        return deleted
