"""Safety contracts for the opt-in, real-server release runner."""

import pytest
from scripts.verify_paint_release import require_local_test_url


@pytest.mark.parametrize("host", ["127.0.0.1", "localhost", "[::1]"])
def test_release_runner_accepts_only_explicit_loopback_test_database(host):
    result = require_local_test_url(f"postgresql://test_admin@{host}:55473/paint_test")
    assert result.drivername == "postgresql+psycopg"
    assert result.database == "paint_test"
    assert result.port == 55473


@pytest.mark.parametrize(
    "url",
    [
        "postgresql://admin@example.com/paint_test",
        "postgresql://admin@127.0.0.1/production",
        "postgresql://admin@127.0.0.1/",
        "sqlite:///paint_test.db",
        "postgresql+psycopg2://admin@localhost/paint_test",
        "postgresql://admin@localhost/paint_test?host=example.com",
        "postgresql://admin@localhost/paint_test?hostaddr=192.0.2.1",
        "postgresql://admin@localhost/paint_test?service=production",
    ],
)
def test_release_runner_rejects_unsafe_or_overridden_targets(url):
    with pytest.raises(ValueError):
        require_local_test_url(url)
