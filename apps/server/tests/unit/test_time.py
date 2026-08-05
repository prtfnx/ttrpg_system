"""Tests for UTC clock helpers."""

from datetime import UTC, datetime, timedelta

from utils.time import utc_now


def test_utc_now_returns_recent_naive_utc_time() -> None:
    before = datetime.now(UTC).replace(tzinfo=None)

    value = utc_now()

    after = datetime.now(UTC).replace(tzinfo=None)
    assert value.tzinfo is None
    assert before - timedelta(milliseconds=1) <= value <= after + timedelta(milliseconds=1)
