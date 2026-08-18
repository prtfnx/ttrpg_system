"""Transactional asset unlinking and retryable R2 object cleanup."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import timedelta
from typing import Protocol

from database.database import SessionLocal
from database.models import (
    Asset,
    AssetDeletionJob,
    GamePlayer,
    GameSession,
    SessionAsset,
)
from utils.audit import audit_event
from utils.logger import setup_logger
from utils.time import utc_now

logger = setup_logger(__name__)
_MAX_DELETE_ATTEMPTS = 10
_MAX_RETRY_DELAY_SECONDS = 3600
_PROCESSING_LEASE_SECONDS = 300


class _Storage(Protocol):
    def delete_file(self, file_key: str) -> bool: ...


@dataclass(frozen=True)
class AssetUnlinkResult:
    success: bool
    error: str | None = None
    deletion_job_id: int | None = None


@dataclass(frozen=True)
class AssetCleanupResult:
    completed: bool
    retry_scheduled: bool = False
    cancelled: bool = False


def _record_denial(
    db,
    *,
    reason: str,
    session_code: str,
    user_id: int,
    asset_id: str,
) -> AssetUnlinkResult:
    db.add(audit_event(
        "asset.unlink",
        outcome="denied",
        session_code=session_code,
        user_id=user_id,
        target_type="asset",
        target_id=asset_id,
        details={"reason": reason},
    ))
    db.commit()
    errors = {
        "not_session_member": "Session access denied",
        "not_linked_to_session": "Asset not available in this session",
        "insufficient_permission": "Permission denied",
    }
    return AssetUnlinkResult(False, errors[reason])


def queue_asset_unlink(
    *,
    session_code: str,
    user_id: int,
    r2_asset_id: str,
) -> AssetUnlinkResult:
    """Unlink one session and atomically enqueue deletion of the final object."""
    db = None
    try:
        db = SessionLocal()
        asset = (
            db.query(Asset)
            .filter(Asset.r2_asset_id == r2_asset_id)
            .with_for_update()
            .first()
        )
        if asset is None:
            return AssetUnlinkResult(False, "Asset not found")
        session = db.query(GameSession).filter(
            GameSession.session_code == session_code
        ).first()
        if session is None:
            return AssetUnlinkResult(False, "Session not found")
        player = db.query(GamePlayer).filter(
            GamePlayer.session_id == session.id,
            GamePlayer.user_id == user_id,
        ).first()
        if session.owner_id != user_id and player is None:
            return _record_denial(
                db,
                reason="not_session_member",
                session_code=session_code,
                user_id=user_id,
                asset_id=r2_asset_id,
            )
        link = db.query(SessionAsset).filter(
            SessionAsset.session_id == session.id,
            SessionAsset.asset_id == asset.id,
        ).first()
        if link is None:
            return _record_denial(
                db,
                reason="not_linked_to_session",
                session_code=session_code,
                user_id=user_id,
                asset_id=r2_asset_id,
            )
        can_moderate = session.owner_id == user_id or (
            player is not None and player.role in {"owner", "co_dm"}
        )
        if not can_moderate and asset.uploaded_by != user_id:
            return _record_denial(
                db,
                reason="insufficient_permission",
                session_code=session_code,
                user_id=user_id,
                asset_id=r2_asset_id,
            )

        db.delete(link)
        db.flush()
        remaining_links = db.query(SessionAsset).filter(
            SessionAsset.asset_id == asset.id
        ).count()
        job = None
        if remaining_links == 0:
            job = db.query(AssetDeletionJob).filter(
                AssetDeletionJob.asset_id == asset.id
            ).first()
            if job is None:
                job = AssetDeletionJob(
                    asset_id=asset.id,
                    r2_asset_id=asset.r2_asset_id,
                    r2_key=asset.r2_key,
                    session_code=session_code,
                    requested_by=user_id,
                    status="pending",
                    attempts=0,
                    next_attempt_at=utc_now(),
                )
                db.add(job)
                db.flush()
            db.add(audit_event(
                "asset.deletion.queued",
                session_code=session_code,
                user_id=user_id,
                target_type="asset",
                target_id=r2_asset_id,
                details={"job_id": job.id},
            ))
        db.add(audit_event(
            "asset.unlink",
            session_code=session_code,
            user_id=user_id,
            target_type="asset",
            target_id=r2_asset_id,
            details={
                "remaining_links": remaining_links,
                "deletion_queued": job is not None,
            },
        ))
        db.commit()
        return AssetUnlinkResult(
            True,
            deletion_job_id=job.id if job is not None else None,
        )
    except Exception:
        if db is not None:
            db.rollback()
        logger.exception("Asset unlink transaction failed")
        return AssetUnlinkResult(False, "Asset could not be unlinked")
    finally:
        if db is not None:
            db.close()


def process_asset_deletion_job(job_id: int, storage: _Storage) -> AssetCleanupResult:
    """Attempt one idempotent outbox delivery without holding a DB transaction."""
    db = SessionLocal()
    try:
        job = (
            db.query(AssetDeletionJob)
            .filter(AssetDeletionJob.id == job_id)
            .with_for_update()
            .first()
        )
        if job is None:
            return AssetCleanupResult(completed=True)
        now = utc_now()
        if (
            job.status == "processing"
            and job.next_attempt_at is not None
            and job.next_attempt_at > now
        ):
            return AssetCleanupResult(completed=False, retry_scheduled=True)
        if job.status == "failed":
            return AssetCleanupResult(completed=False)
        remaining_links = db.query(SessionAsset).filter(
            SessionAsset.asset_id == job.asset_id
        ).count()
        if remaining_links:
            db.add(audit_event(
                "asset.deletion.cancelled",
                session_code=job.session_code,
                user_id=job.requested_by,
                target_type="asset",
                target_id=job.r2_asset_id,
                details={"reason": "asset_still_linked", "remaining_links": remaining_links},
            ))
            db.delete(job)
            db.commit()
            return AssetCleanupResult(completed=False, cancelled=True)
        asset_id = job.asset_id
        r2_key = job.r2_key
        job.attempts += 1
        job.status = "processing"
        job.last_error = None
        job.next_attempt_at = now + timedelta(seconds=_PROCESSING_LEASE_SECONDS)
        job.updated_at = now
        db.commit()
    finally:
        db.close()

    deleted = False
    try:
        deleted = storage.delete_file(r2_key)
    except Exception:
        logger.exception("Asset object cleanup call failed")

    db = SessionLocal()
    try:
        job = (
            db.query(AssetDeletionJob)
            .filter(AssetDeletionJob.id == job_id)
            .with_for_update()
            .first()
        )
        if job is None:
            return AssetCleanupResult(completed=True)
        asset = (
            db.query(Asset)
            .filter(Asset.id == asset_id)
            .with_for_update()
            .first()
        )
        if asset is None:
            db.delete(job)
            db.commit()
            return AssetCleanupResult(completed=True)
        if not deleted:
            permanent = job.attempts >= _MAX_DELETE_ATTEMPTS
            job.status = "failed" if permanent else "retry"
            job.last_error = "storage_delete_failed"
            delay = min(2 ** min(job.attempts, 12), _MAX_RETRY_DELAY_SECONDS)
            job.next_attempt_at = utc_now() + timedelta(seconds=delay)
            job.updated_at = utc_now()
            db.add(audit_event(
                "asset.deletion.failed" if permanent else "asset.deletion.retry",
                outcome="failure",
                session_code=job.session_code,
                user_id=job.requested_by,
                target_type="asset",
                target_id=job.r2_asset_id,
                details={"attempts": job.attempts, "retry_in_seconds": delay},
            ))
            db.commit()
            return AssetCleanupResult(completed=False, retry_scheduled=not permanent)

        db.add(audit_event(
            "asset.deletion.completed",
            session_code=job.session_code,
            user_id=job.requested_by,
            target_type="asset",
            target_id=job.r2_asset_id,
            details={"attempts": job.attempts},
        ))
        db.delete(job)
        db.delete(asset)
        db.commit()
        return AssetCleanupResult(completed=True)
    except Exception:
        db.rollback()
        logger.exception("Asset deletion outbox finalization failed")
        return AssetCleanupResult(completed=False, retry_scheduled=True)
    finally:
        db.close()


def process_pending_asset_deletions(storage: _Storage, *, limit: int = 25) -> int:
    """Process a bounded, deterministic batch of due outbox rows."""
    db = SessionLocal()
    try:
        job_ids = [
            job_id
            for (job_id,) in (
                db.query(AssetDeletionJob.id)
                .filter(
                    AssetDeletionJob.status.in_(("pending", "retry", "processing")),
                    AssetDeletionJob.next_attempt_at <= utc_now(),
                )
                .order_by(AssetDeletionJob.next_attempt_at, AssetDeletionJob.id)
                .limit(limit)
                .all()
            )
        ]
    finally:
        db.close()
    completed = 0
    for job_id in job_ids:
        if process_asset_deletion_job(job_id, storage).completed:
            completed += 1
    return completed
