"""
Rate limiting utilities for flood protection
"""
import time
from collections import defaultdict, deque
from typing import Dict, Deque
from datetime import datetime, timedelta

class RateLimiter:
    def __init__(self):
        # Store requests by IP address
        self.requests: Dict[str, Deque[float]] = defaultdict(deque)
        
    def is_allowed(self, identifier: str, max_requests: int = 5, window_minutes: int = 5) -> bool:
        """
        Check if a request is allowed based on rate limiting.
        
        Args:
            identifier: IP address or user identifier
            max_requests: Maximum number of requests allowed
            window_minutes: Time window in minutes
            
        Returns:
            True if request is allowed, False if rate limited
        """
        now = time.time()
        window_seconds = window_minutes * 60
        cutoff_time = now - window_seconds
        
        # Get requests for this identifier
        user_requests = self.requests[identifier]
        
        # Remove old requests outside the window
        while user_requests and user_requests[0] < cutoff_time:
            user_requests.popleft()
        
        # Check if under the limit
        if len(user_requests) < max_requests:
            user_requests.append(now)
            return True
        
        return False
    
    def get_time_until_reset(self, identifier: str, window_minutes: int = 5) -> int:
        """
        Get seconds until rate limit resets for this identifier.
        
        Returns:
            Seconds until reset, or 0 if not rate limited
        """
        if identifier not in self.requests:
            return 0
            
        user_requests = self.requests[identifier]
        if not user_requests:
            return 0
            
        oldest_request = user_requests[0]
        window_seconds = window_minutes * 60
        reset_time = oldest_request + window_seconds
        
        return max(0, int(reset_time - time.time()))
    
    def cleanup_old_entries(self, hours_old: int = 1):
        """
        Clean up old entries to prevent memory leaks.
        Should be called periodically.
        """
        cutoff_time = time.time() - (hours_old * 3600)
        
        # Clean up requests older than cutoff
        for identifier in list(self.requests.keys()):
            user_requests = self.requests[identifier]
            while user_requests and user_requests[0] < cutoff_time:
                user_requests.popleft()
            
            # Remove empty entries
            if not user_requests:
                del self.requests[identifier]
    
    def clear(self):
        """Clear all rate limiting data. Useful for testing."""
        self.requests.clear()

# Global rate limiter instance
registration_limiter = RateLimiter()
login_limiter = RateLimiter()

def get_client_ip(request) -> str:
    """
    Extract client IP address from request.
    Handles proxy headers for accurate IP detection.
    """
    # Check for forwarded headers (when behind proxy/load balancer)
    forwarded_for = request.headers.get("X-Forwarded-For")
    if forwarded_for:
        # Take the first IP in case of multiple proxies
        return forwarded_for.split(",")[0].strip()
    
    real_ip = request.headers.get("X-Real-IP")
    if real_ip:
        return real_ip.strip()
    
    # Fallback to direct client IP
    return request.client.host if request.client else "unknown"
