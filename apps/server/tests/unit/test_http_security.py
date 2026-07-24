from starlette.requests import Request
from starlette.responses import Response
from utils.http_security import add_security_headers, trusted_origins, unsafe_request_rejection


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
