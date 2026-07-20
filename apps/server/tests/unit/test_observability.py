from datetime import datetime, timedelta, timezone

import pytest
from prometheus_client import generate_latest

from database import models
from utils.observability import (
    observe_http,
    record_auth,
    record_email,
    record_job,
    record_ws_message,
    refresh_durable_metrics,
    track_asset_operation,
)


def test_metric_labels_are_bounded():
    observe_http("TRACE_WITH_USER_DATA", "https://attacker.invalid/a", 418, 0.01)
    record_ws_message("sideways", "attacker-controlled-type", "unexpected", 0.01)

    metrics = generate_latest().decode("utf-8")
    assert 'method="OTHER",route="unmatched",status_class="4xx"' in metrics
    assert 'direction="inbound",message_type="unknown",outcome="error"' in metrics
    assert "attacker-controlled-type" not in metrics


def test_operational_metric_labels_are_bounded():
    record_auth("attacker-user-id", "unexpected", "arbitrary-reason")
    record_email("attacker-address", "unexpected")
    record_job("attacker-job", "unexpected", 0.01)

    metrics = generate_latest().decode("utf-8")
    assert 'operation="unknown",outcome="failure",reason="unknown"' in metrics
    assert 'operation="unknown",outcome="error"' in metrics
    assert 'job="unknown",outcome="error"' in metrics
    assert "attacker-user-id" not in metrics
    assert "attacker-address" not in metrics
    assert "attacker-job" not in metrics


def test_durable_upload_gauges_refresh(test_db, test_user):
    created_at = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(minutes=5)
    test_db.add(models.AssetUploadIntent(
        asset_id="asset-observe",
        filename="map.png",
        r2_key="pending/map.png",
        session_code="TEST",
        uploaded_by=test_user.id,
        status="awaiting_upload",
        created_at=created_at,
    ))
    test_db.commit()
    refresh_durable_metrics(test_db)

    metrics = generate_latest().decode("utf-8")
    assert "ttrpg_pending_uploads 1.0" in metrics
    assert "ttrpg_pending_upload_oldest_age_seconds" in metrics


@pytest.mark.asyncio
async def test_asset_operation_decorator_records_failures():
    @track_asset_operation("test_failure")
    async def fail():
        raise RuntimeError("storage unavailable")

    with pytest.raises(RuntimeError, match="storage unavailable"):
        await fail()

    metrics = generate_latest().decode("utf-8")
    assert 'operation="test_failure",outcome="error"' in metrics
