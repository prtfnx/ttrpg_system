from concurrent.futures import ThreadPoolExecutor
from types import SimpleNamespace

from utils.rate_limiter import RateLimiter, get_client_ip


def _request(*, direct: str, forwarded: str | None = None):
    headers = {"x-forwarded-for": forwarded} if forwarded else {}
    return SimpleNamespace(headers=headers, client=SimpleNamespace(host=direct))


def test_client_ip_ignores_forwarding_headers_by_default(monkeypatch):
    monkeypatch.setattr("utils.rate_limiter._trust_proxy_headers", lambda: False)
    request = _request(direct="10.0.0.4", forwarded="198.51.100.8")

    assert get_client_ip(request) == "10.0.0.4"


def test_client_ip_accepts_valid_forwarded_ip_only_when_trusted():
    request = _request(direct="10.0.0.4", forwarded="198.51.100.8, 10.0.0.1")

    assert get_client_ip(request, trust_proxy_headers=True) == "198.51.100.8"


def test_rate_limiter_bounds_identifier_memory():
    limiter = RateLimiter("test", max_identifiers=2)

    assert limiter.is_allowed("first", max_requests=1)
    assert limiter.is_allowed("second", max_requests=1)
    assert limiter.is_allowed("third", max_requests=1)

    assert list(limiter.requests) == ["second", "third"]


def test_rate_limiter_applies_one_limit_across_concurrent_requests():
    limiter = RateLimiter("test")

    with ThreadPoolExecutor(max_workers=16) as executor:
        allowed = list(
            executor.map(
                lambda _: limiter.is_allowed("shared", max_requests=5),
                range(50),
            )
        )

    assert sum(allowed) == 5
