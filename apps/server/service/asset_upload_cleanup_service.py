"""Durable cleanup for upload intents that may still own R2 bytes."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import timedelta
from typing import Protocol

from database.database import SessionLocal
from database.models import Asset, AssetUploadIntent
from utils.logger import setup_logger
from utils.time import utc_now

logger = setup_logger(__name__)

STORAGE_RESERVED_UPLOAD_STATUSES = (
    "awaiting_upload",
    "cleanup_pending",
    "cleanup_processing",
    "cleanup_retry",
    "cleanup_failed",
)

_LEGACY_CLEANUP_STATUSES = (
    "expired",
    "failed",
    "verification_failed",
    "inspection_failed",
    "promotion_failed",
    "superseded",
    "link_quota_exceeded",
    "metadata_failed",
)
_PROCESSABLE_STATUSES = ("cleanup_pending", "cleanup_processing", "cleanup_retry")
_PROCESSING_LEASE = timedelta(minutes=5)
_UPLOAD_SETTLE_GRACE = timedelta(hours=1)
_MAX_RETRY_DELAY_SECONDS = 3600


class _Storage(Protocol):
    def delete_file(self, file_key: str) -> bool: ...


@dataclass(frozen=True)
class UploadCleanupResult:
    completed: bool
    retry_scheduled: bool = False


def queue_upload_cleanup(intent: AssetUploadIntent, reason: str) -> None:
    """Mark an intent for cleanup without releasing its byte reservation."""
    now = utc_now()
    safe_after = now
    if intent.expires_at is not None:
        safe_after = max(safe_after, intent.expires_at + _UPLOAD_SETTLE_GRACE)
    intent.status = "cleanup_pending"
    intent.error_message = reason
    intent.confirmed_at = intent.confirmed_at or now
    intent.cleanup_next_attempt_at = safe_after


def prepare_upload_cleanups(*, limit: int = 100) -> int:
    """Convert expired and legacy terminal intents into retryable cleanup work."""
    db = SessionLocal()
    try:
        now = utc_now()
        expired_before = now - _UPLOAD_SETTLE_GRACE
        intents = (
            db.query(AssetUploadIntent)
            .filter(
                AssetUploadIntent.cleanup_next_attempt_at.is_(None),
                (
                    (
                        (AssetUploadIntent.status == "awaiting_upload")
                        & (AssetUploadIntent.expires_at.is_not(None))
                        & (AssetUploadIntent.expires_at <= expired_before)
                    )
                    | AssetUploadIntent.status.in_(_LEGACY_CLEANUP_STATUSES)
                ),
            )
            .order_by(AssetUploadIntent.expires_at, AssetUploadIntent.id)
            .limit(limit)
            .with_for_update()
            .all()
        )
        for intent in intents:
            queue_upload_cleanup(
                intent,
                intent.error_message or "Upload intent expired before confirmation",
            )
        db.commit()
        return len(intents)
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


def process_upload_cleanup(
    intent_id: int,
    storage: _Storage,
) -> UploadCleanupResult:
    """Deliver one idempotent cleanup without holding a DB transaction over R2 I/O."""
    db = SessionLocal()
    try:
        intent = (
            db.query(AssetUploadIntent)
            .filter(AssetUploadIntent.id == intent_id)
            .with_for_update()
            .first()
        )
        if intent is None or intent.status == "cleaned":
            return UploadCleanupResult(completed=True)
        now = utc_now()
        if intent.status not in _PROCESSABLE_STATUSES:
            return UploadCleanupResult(completed=False)
        if intent.cleanup_next_attempt_at and intent.cleanup_next_attempt_at > now:
            return UploadCleanupResult(completed=False, retry_scheduled=True)

        r2_key = intent.r2_key
        if not (r2_key.startswith("pending/") or r2_key.startswith("assets/")):
            intent.status = "cleanup_failed"
            intent.error_message = "Upload cleanup refused an invalid R2 key"
            intent.cleanup_next_attempt_at = None
            db.commit()
            return UploadCleanupResult(completed=False)

        if r2_key.startswith("assets/"):
            # Final keys are content-addressed and can be shared by another
            # confirmation. Deleting after an unlocked metadata check races
            # that confirmation and can remove a live object. Release only a
            # redundant reservation here; otherwise retain it and require the
            # age-gated orphan audit to prove the key is unreferenced.
            if db.query(Asset.id).filter(Asset.r2_key == r2_key).first() is not None:
                intent.status = "cleaned"
                intent.cleanup_next_attempt_at = None
                db.commit()
                return UploadCleanupResult(completed=True)
            intent.status = "cleanup_failed"
            intent.error_message = "Final asset key requires orphan reconciliation"
            intent.cleanup_next_attempt_at = None
            db.commit()
            return UploadCleanupResult(completed=False)

        intent.cleanup_attempts += 1
        intent.status = "cleanup_processing"
        intent.cleanup_next_attempt_at = now + _PROCESSING_LEASE
        db.commit()
    finally:
        db.close()

    deleted = False
    try:
        deleted = storage.delete_file(r2_key)
    except Exception:
        logger.exception("Upload intent R2 cleanup call failed")

    db = SessionLocal()
    try:
        intent = (
            db.query(AssetUploadIntent)
            .filter(AssetUploadIntent.id == intent_id)
            .with_for_update()
            .first()
        )
        if intent is None or intent.status == "cleaned":
            return UploadCleanupResult(completed=True)
        if deleted:
            intent.status = "cleaned"
            intent.cleanup_next_attempt_at = None
            db.commit()
            return UploadCleanupResult(completed=True)

        intent.status = "cleanup_retry"
        intent.error_message = "R2 upload cleanup failed"
        delay = min(
            2 ** min(intent.cleanup_attempts, 12),
            _MAX_RETRY_DELAY_SECONDS,
        )
        intent.cleanup_next_attempt_at = utc_now() + timedelta(seconds=delay)
        db.commit()
        return UploadCleanupResult(completed=False, retry_scheduled=True)
    except Exception:
        db.rollback()
        logger.exception("Upload intent cleanup finalization failed")
        return UploadCleanupResult(completed=False, retry_scheduled=True)
    finally:
        db.close()


def process_pending_upload_cleanups(storage: _Storage, *, limit: int = 25) -> int:
    """Prepare stale intents and process one bounded batch of due cleanup work."""
    prepare_upload_cleanups(limit=max(limit * 4, limit))
    db = SessionLocal()
    try:
        intent_ids = [
            intent_id
            for (intent_id,) in (
                db.query(AssetUploadIntent.id)
                .filter(
                    AssetUploadIntent.status.in_(_PROCESSABLE_STATUSES),
                    AssetUploadIntent.cleanup_next_attempt_at <= utc_now(),
                )
                .order_by(
                    AssetUploadIntent.cleanup_next_attempt_at,
                    AssetUploadIntent.id,
                )
                .limit(limit)
                .all()
            )
        ]
    finally:
        db.close()

    completed = 0
    for intent_id in intent_ids:
        if process_upload_cleanup(intent_id, storage).completed:
            completed += 1
    return completed
