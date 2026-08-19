"""Database-backed throttling for R2 asset operations."""

import logging
from collections.abc import Callable, Sequence
from dataclasses import dataclass
from datetime import datetime, timedelta
from enum import Enum

from database.models import AssetRateLimitBucket, User
from sqlalchemy.orm import Session
from utils.observability import record_rate_limit
from utils.time import utc_now

logger = logging.getLogger(__name__)


class AssetRateLimitDecision(str, Enum):
    ALLOWED = "allowed"
    LIMITED = "limited"
    UNAVAILABLE = "unavailable"


@dataclass(frozen=True)
class TokenBucketLimit:
    capacity: int
    window_seconds: int


class DurableAssetRateLimiter:
    """Consume token buckets while holding the authenticated user's DB lock."""

    def __init__(
        self,
        session_factory: Callable[[], Session],
        *,
        clock: Callable[[], datetime] = utc_now,
    ) -> None:
        self._session_factory = session_factory
        self._clock = clock

    def consume(
        self,
        *,
        user_id: int,
        operation: str,
        limits: Sequence[TokenBucketLimit],
    ) -> AssetRateLimitDecision:
        if not limits or any(
            limit.capacity < 1 or limit.window_seconds < 1 for limit in limits
        ):
            raise ValueError("asset rate limits must be positive")

        db: Session | None = None
        try:
            db = self._session_factory()
            user = (
                db.query(User)
                .filter(User.id == user_id)
                .with_for_update()
                .one_or_none()
            )
            if user is None:
                logger.warning(
                    "Asset limiter rejected an unknown user",
                    extra={
                        "event_name": "asset.rate_limit.unavailable",
                        "operation": operation,
                    },
                )
                record_rate_limit(f"asset_{operation}_shared", False)
                return AssetRateLimitDecision.UNAVAILABLE

            now = self._clock()
            reservations: list[tuple[AssetRateLimitBucket, float]] = []
            for limit in limits:
                bucket = (
                    db.query(AssetRateLimitBucket)
                    .filter(
                        AssetRateLimitBucket.user_id == user_id,
                        AssetRateLimitBucket.operation == operation,
                        AssetRateLimitBucket.window_seconds == limit.window_seconds,
                    )
                    .one_or_none()
                )
                if bucket is None:
                    bucket = AssetRateLimitBucket(
                        user_id=user_id,
                        operation=operation,
                        window_seconds=limit.window_seconds,
                        tokens=float(limit.capacity),
                        updated_at=now,
                        expires_at=now + timedelta(seconds=limit.window_seconds),
                    )
                    db.add(bucket)
                elif bucket.expires_at <= now:
                    bucket.tokens = float(limit.capacity)
                else:
                    elapsed = max(0.0, (now - bucket.updated_at).total_seconds())
                    bucket.tokens = min(
                        float(limit.capacity),
                        bucket.tokens
                        + elapsed * limit.capacity / limit.window_seconds,
                    )

                bucket.updated_at = now
                bucket.expires_at = now + timedelta(seconds=limit.window_seconds)
                reservations.append((bucket, bucket.tokens))

            allowed = all(tokens >= 1.0 for _, tokens in reservations)
            if allowed:
                for bucket, _ in reservations:
                    bucket.tokens -= 1.0

            db.commit()
            record_rate_limit(f"asset_{operation}_shared", allowed)
            return (
                AssetRateLimitDecision.ALLOWED
                if allowed
                else AssetRateLimitDecision.LIMITED
            )
        except Exception:
            if db is not None:
                db.rollback()
            logger.exception(
                "Shared asset limiter unavailable",
                extra={
                    "event_name": "asset.rate_limit.unavailable",
                    "operation": operation,
                },
            )
            record_rate_limit(f"asset_{operation}_shared", False)
            return AssetRateLimitDecision.UNAVAILABLE
        finally:
            if db is not None:
                db.close()
