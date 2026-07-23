"""
Rate limiting utilities for flood protection
"""
import time
from collections import OrderedDict, deque
from functools import lru_cache
from ipaddress import ip_address
from threading import RLock

from config import Settings
from utils.observability import record_rate_limit


class RateLimiter:
    def __init__(self, name: str = "unknown", *, max_identifiers: int = 10_000):
        if max_identifiers < 1:
            raise ValueError("max_identifiers must be positive")
        self.name = name
        self.max_identifiers = max_identifiers
        self.requests: OrderedDict[str, deque[float]] = OrderedDict()
        self._lock = RLock()

    def is_allowed(self, identifier: str, max_requests: int = 5, window_minutes: float = 5) -> bool:
        """
        Check if a request is allowed based on rate limiting.

        Args:
            identifier: IP address or user identifier
            max_requests: Maximum number of requests allowed
            window_minutes: Time window in minutes

        Returns:
            True if request is allowed, False if rate limited
        """
        if max_requests < 1 or window_minutes <= 0:
            raise ValueError("rate-limit thresholds must be positive")
        now = time.monotonic()
        window_seconds = window_minutes * 60
        cutoff_time = now - window_seconds

        with self._lock:
            user_requests = self.requests.get(identifier)
            if user_requests is None:
                if len(self.requests) >= self.max_identifiers:
                    self.requests.popitem(last=False)
                user_requests = deque()
                self.requests[identifier] = user_requests
            else:
                self.requests.move_to_end(identifier)

            while user_requests and user_requests[0] < cutoff_time:
                user_requests.popleft()

            allowed = len(user_requests) < max_requests
            if allowed:
                user_requests.append(now)

        record_rate_limit(self.name, allowed)
        return allowed

    def get_time_until_reset(self, identifier: str, window_minutes: float = 5) -> int:
        """
        Get seconds until rate limit resets for this identifier.

        Returns:
            Seconds until reset, or 0 if not rate limited
        """
        if window_minutes <= 0:
            raise ValueError("window_minutes must be positive")
        with self._lock:
            user_requests = self.requests.get(identifier)
            if not user_requests:
                return 0
            oldest_request = user_requests[0]
        window_seconds = window_minutes * 60
        reset_time = oldest_request + window_seconds

        return max(0, int(reset_time - time.monotonic()))

    def cleanup_old_entries(self, hours_old: int = 1):
        """
        Clean up old entries to prevent memory leaks.
        Should be called periodically.
        """
        if hours_old <= 0:
            raise ValueError("hours_old must be positive")
        cutoff_time = time.monotonic() - (hours_old * 3600)

        with self._lock:
            for identifier in list(self.requests.keys()):
                user_requests = self.requests[identifier]
                while user_requests and user_requests[0] < cutoff_time:
                    user_requests.popleft()

                if not user_requests:
                    del self.requests[identifier]

    def clear(self):
        """Clear all rate limiting data. Useful for testing."""
        with self._lock:
            self.requests.clear()

# Global rate limiter instances
registration_limiter = RateLimiter("registration")
login_limiter = RateLimiter("login")
password_reset_limiter = RateLimiter("password_reset")


@lru_cache(maxsize=1)
def _trust_proxy_headers() -> bool:
    return Settings().TRUST_PROXY_HEADERS


def _normalized_ip(value: object) -> str | None:
    try:
        return str(ip_address(str(value).strip()))
    except ValueError:
        return None


def get_client_ip(request, *, trust_proxy_headers: bool | None = None) -> str:
    """Return a validated client IP, trusting forwarding headers only by policy."""
    trust_proxy_headers = (
        _trust_proxy_headers() if trust_proxy_headers is None else trust_proxy_headers
    )
    if trust_proxy_headers:
        forwarded_for = request.headers.get("x-forwarded-for", "")
        forwarded = _normalized_ip(forwarded_for.split(",", 1)[0])
        if forwarded:
            return forwarded
    direct = _normalized_ip(getattr(getattr(request, "client", None), "host", None))
    return direct or "unknown"
