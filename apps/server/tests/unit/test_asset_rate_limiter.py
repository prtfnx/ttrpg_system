from datetime import timedelta

from database import models
from service.asset_rate_limiter import (
    AssetRateLimitDecision,
    DurableAssetRateLimiter,
    TokenBucketLimit,
)
from sqlalchemy.orm import sessionmaker
from utils.time import utc_now


def _factory(test_db):
    return sessionmaker(
        autocommit=False,
        autoflush=False,
        bind=test_db.get_bind(),
    )


def test_limit_is_shared_by_independent_limiter_instances(test_db, test_user):
    factory = _factory(test_db)
    first_worker = DurableAssetRateLimiter(factory)
    second_worker = DurableAssetRateLimiter(factory)
    limit = (TokenBucketLimit(capacity=2, window_seconds=60),)

    assert first_worker.consume(
        user_id=test_user.id, operation="upload", limits=limit
    ) == AssetRateLimitDecision.ALLOWED
    assert second_worker.consume(
        user_id=test_user.id, operation="upload", limits=limit
    ) == AssetRateLimitDecision.ALLOWED
    assert first_worker.consume(
        user_id=test_user.id, operation="upload", limits=limit
    ) == AssetRateLimitDecision.LIMITED
    assert test_db.query(models.AssetRateLimitBucket).count() == 1


def test_expired_bucket_resets_after_worker_restart(test_db, test_user):
    factory = _factory(test_db)
    now = utc_now()
    limit = (TokenBucketLimit(capacity=1, window_seconds=60),)
    limiter = DurableAssetRateLimiter(factory, clock=lambda: now)

    assert limiter.consume(
        user_id=test_user.id, operation="download", limits=limit
    ) == AssetRateLimitDecision.ALLOWED
    assert limiter.consume(
        user_id=test_user.id, operation="download", limits=limit
    ) == AssetRateLimitDecision.LIMITED

    restarted = DurableAssetRateLimiter(
        factory,
        clock=lambda: now + timedelta(seconds=61),
    )
    assert restarted.consume(
        user_id=test_user.id, operation="download", limits=limit
    ) == AssetRateLimitDecision.ALLOWED


def test_limiter_fails_closed_when_store_is_unavailable():
    def unavailable_factory():
        raise RuntimeError("database unavailable")

    limiter = DurableAssetRateLimiter(unavailable_factory)

    assert limiter.consume(
        user_id=1,
        operation="upload",
        limits=(TokenBucketLimit(capacity=1, window_seconds=60),),
    ) == AssetRateLimitDecision.UNAVAILABLE
