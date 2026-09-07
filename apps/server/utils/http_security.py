from collections.abc import Iterable
from urllib.parse import urlsplit

from config import Settings
from fastapi import Request
from starlette.responses import Response

_UNSAFE_METHODS = {"POST", "PUT", "PATCH", "DELETE"}
_CSP = "; ".join(
    (
        "default-src 'self'",
        "base-uri 'self'",
        "connect-src 'self' ws: wss:{asset_sources}",
        "font-src 'self' data:",
        "form-action 'self'",
        "frame-ancestors 'none'",
        "img-src 'self' data: blob: https:",
        "object-src 'none'",
        "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'",
        "style-src 'self' 'unsafe-inline'",
    )
)


def asset_connect_origins(settings: Settings) -> tuple[str, ...]:
    """Allow only the configured browser asset transport, never a wildcard."""
    if not settings.r2_enabled:
        return ()
    if settings.ASSET_LINK_MODE == "worker":
        url = settings.ASSET_WORKER_BASE_URL
    else:
        url = settings.r2_endpoint or (
            f"https://{settings.r2_account_id}.r2.cloudflarestorage.com"
            if settings.r2_account_id else ""
        )
    if not url:
        return ()
    parsed = urlsplit(url)
    if (
        parsed.scheme not in ({"https"} if settings.is_production else {"http", "https"})
        or not parsed.hostname
        or parsed.username is not None
        or parsed.password is not None
        or parsed.query
        or parsed.fragment
        or any(char.isspace() or ord(char) < 32 or char in "'\";*<>\\" for char in url)
    ):
        raise ValueError("Browser asset endpoint must be a valid HTTP(S) URL; production requires HTTPS")
    # Accessing port also validates malformed/out-of-range ports.
    port = parsed.port
    host = parsed.hostname
    if ":" in host:
        host = f"[{host}]"
    suffix = f":{port}" if port is not None else ""
    return (f"{parsed.scheme}://{host}{suffix}",)


def normalized_origin(value: str) -> str | None:
    """Return a comparable HTTP origin without path, query, or fragments."""
    try:
        parsed = urlsplit(value)
        if parsed.scheme.lower() not in {"http", "https"} or not parsed.netloc:
            return None
        return f"{parsed.scheme.lower()}://{parsed.netloc.lower()}"
    except ValueError:
        return None


def trusted_origins(base_url: str, cors_origins: Iterable[str]) -> frozenset[str]:
    candidates = [base_url, *(origin for origin in cors_origins if origin != "*")]
    return frozenset(
        origin
        for candidate in candidates
        if (origin := normalized_origin(candidate)) is not None
    )


def unsafe_request_rejection(
    request: Request,
    allowed_origins: frozenset[str],
) -> str | None:
    """Reject browser cross-site writes and ambiguous authenticated cookie writes."""
    if request.method.upper() not in _UNSAFE_METHODS:
        return None

    fetch_site = request.headers.get("sec-fetch-site", "").lower()
    if fetch_site == "cross-site":
        return "Cross-site state-changing requests are not allowed"

    origin = request.headers.get("origin")
    if origin:
        if normalized_origin(origin) not in allowed_origins:
            return "Request origin is not allowed"
        return None

    referer = request.headers.get("referer")
    if referer:
        if normalized_origin(referer) not in allowed_origins:
            return "Request referrer is not allowed"
        return None

    if "token" in request.cookies or "session" in request.cookies:
        return "Authenticated browser writes require an Origin or Referer header"
    return None


def add_security_headers(
    response: Response, *, production: bool, asset_origins: Iterable[str] = (),
) -> None:
    sources = "".join(f" {origin}" for origin in asset_origins)
    response.headers["Content-Security-Policy"] = _CSP.format(asset_sources=sources)
    response.headers["Cross-Origin-Opener-Policy"] = "same-origin"
    response.headers["Permissions-Policy"] = (
        "camera=(), geolocation=(), microphone=(), payment=(), usb=()"
    )
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    if production:
        response.headers["Strict-Transport-Security"] = (
            "max-age=31536000; includeSubDomains"
        )
