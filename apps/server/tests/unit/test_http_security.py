import pytest
from config import Settings
from starlette.requests import Request
from starlette.responses import Response
from utils.http_security import add_security_headers, asset_connect_origins, trusted_origins, unsafe_request_rejection


def _request(
    method: str,
    *,
    headers: list[tuple[bytes, bytes]] | None = None,
) -> Request:
    return Request({
        "type": "http",
        "method": method,
        "scheme": "https",
        "server": ("example.com", 443),
        "path": "/settings",
        "query_string": b"",
        "headers": headers or [],
    })


def test_cross_site_browser_write_is_rejected():
    request = _request(
        "POST",
        headers=[
            (b"origin", b"https://evil.example"),
            (b"sec-fetch-site", b"cross-site"),
        ],
    )

    assert unsafe_request_rejection(
        request,
        trusted_origins("https://app.example", []),
    )


def test_same_origin_browser_write_is_accepted():
    request = _request(
        "DELETE",
        headers=[
            (b"origin", b"https://app.example"),
            (b"sec-fetch-site", b"same-origin"),
        ],
    )

    assert unsafe_request_rejection(
        request,
        trusted_origins("https://app.example", []),
    ) is None


def test_authenticated_cookie_write_without_origin_is_rejected():
    request = _request("PATCH", headers=[(b"cookie", b"token=secret")])

    assert unsafe_request_rejection(
        request,
        trusted_origins("https://app.example", []),
    )


def test_security_headers_cover_embedding_content_and_transport():
    response = Response()

    add_security_headers(response, production=True)

    assert response.headers["x-frame-options"] == "DENY"
    assert "frame-ancestors 'none'" in response.headers["content-security-policy"]
    assert response.headers["x-content-type-options"] == "nosniff"
    assert response.headers["strict-transport-security"].startswith("max-age=31536000")


@pytest.mark.parametrize("mode,endpoint,expected", [
    ("presigned", "", "https://audit-account.r2.cloudflarestorage.com"),
    ("presigned", "https://objects.example:8443/bucket", "https://objects.example:8443"),
    ("worker", "", "https://assets.example"),
])
def test_csp_allows_wasm_and_only_selected_asset_transport(mode, endpoint, expected):
    settings = Settings(_env_file=None, r2_enabled=True, r2_account_id="audit-account",
                        r2_endpoint=endpoint, ASSET_LINK_MODE=mode,
                        ASSET_WORKER_BASE_URL="https://assets.example",
                        ASSET_WORKER_HMAC_SECRET="s" * 32)
    response = Response()
    add_security_headers(response, production=False, asset_origins=asset_connect_origins(settings))
    directives = dict(part.split(" ", 1) for part in response.headers["content-security-policy"].split("; "))
    assert "'wasm-unsafe-eval'" in directives["script-src"]
    assert "'unsafe-eval'" not in directives["script-src"]
    assert directives["connect-src"].split() == ["'self'", "ws:", "wss:", expected]


@pytest.mark.parametrize("endpoint", [
    "https://objects.example;script-src *", "https://user:password@objects.example",
    "https://*.example", "https://objects.example/?key=secret", "javascript:alert(1)",
    "https://objects.example:99999", "https://objects.example/\npath",
])
def test_asset_policy_rejects_invalid_or_injected_endpoint(endpoint):
    settings = Settings(_env_file=None, r2_enabled=True, r2_endpoint=endpoint)
    with pytest.raises(ValueError):
        asset_connect_origins(settings)


def test_disabled_assets_do_not_expand_connect_policy():
    assert asset_connect_origins(Settings(_env_file=None, r2_enabled=False)) == ()
