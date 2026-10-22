import pytest
from pydantic import ValidationError
from routers.telemetry import BrowserErrorReport, CommandTimingReport


def test_command_timings_reject_payloads_unknown_types_and_unbounded_values():
    valid = dict(message_type="sprite_move", message_id="request", queue_ms=30, acknowledgement_ms=100, release="test")
    assert CommandTimingReport(**valid).acknowledgement_ms == 100
    for patch in [{"payload": "private"}, {"message_type": "arbitrary"}, {"queue_ms": -1},
                  {"acknowledgement_ms": float("nan")}, {"acknowledgement_ms": 300001}]:
        with pytest.raises(ValidationError):
            CommandTimingReport(**{**valid, **patch})


def test_command_timing_intake_honors_feature_and_rate_limits(monkeypatch):
    from fastapi import HTTPException
    from routers import telemetry
    from starlette.requests import Request
    report = CommandTimingReport(message_type="sprite_move", message_id="request", queue_ms=1,
        acknowledgement_ms=2, release="test")
    request = Request({"type": "http", "headers": [], "client": ("127.0.0.1", 1)})
    monkeypatch.setattr(telemetry.settings, "BROWSER_TELEMETRY_ENABLED", True)
    monkeypatch.setattr(telemetry.telemetry_limiter, "is_allowed", lambda *args, **kwargs: True)
    assert telemetry.command_timing(report, request).status_code == 204
    monkeypatch.setattr(telemetry.telemetry_limiter, "is_allowed", lambda *args, **kwargs: False)
    with pytest.raises(HTTPException) as error:
        telemetry.command_timing(report, request)
    assert error.value.status_code == 429
    monkeypatch.setattr(telemetry.settings, "BROWSER_TELEMETRY_ENABLED", False)
    with pytest.raises(HTTPException) as error:
        telemetry.command_timing(report, request)
    assert error.value.status_code == 404


def test_browser_error_report_is_privacy_bounded():
    report = BrowserErrorReport(
        event_type="error",
        message="render failed",
        stack="Error: render failed",
        path="/game/session",
        release="abc123",
    )
    assert report.path == "/game/session"


def test_browser_error_report_rejects_urls_with_origins():
    try:
        BrowserErrorReport(
            event_type="error",
            message="failed",
            path="https://example.com/game?token=secret",
            release="abc123",
        )
    except ValueError:
        pass
    else:
        raise AssertionError("absolute browser URL should be rejected")
