from routers.telemetry import BrowserErrorReport


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
