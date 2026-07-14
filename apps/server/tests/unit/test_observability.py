import pytest
from prometheus_client import generate_latest

from utils.observability import observe_http, record_ws_message, track_asset_operation


def test_metric_labels_are_bounded():
    observe_http("TRACE_WITH_USER_DATA", "https://attacker.invalid/a", 418, 0.01)
    record_ws_message("sideways", "attacker-controlled-type", "unexpected", 0.01)

    metrics = generate_latest().decode("utf-8")
    assert 'method="OTHER",route="unmatched",status_class="4xx"' in metrics
    assert 'direction="inbound",message_type="unknown",outcome="error"' in metrics
    assert "attacker-controlled-type" not in metrics


@pytest.mark.asyncio
async def test_asset_operation_decorator_records_failures():
    @track_asset_operation("test_failure")
    async def fail():
        raise RuntimeError("storage unavailable")

    with pytest.raises(RuntimeError, match="storage unavailable"):
        await fail()

    metrics = generate_latest().decode("utf-8")
    assert 'operation="test_failure",outcome="error"' in metrics
