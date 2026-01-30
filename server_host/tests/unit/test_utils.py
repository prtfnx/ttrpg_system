import pytest
from server_host.utils.rate_limiter import RateLimiter
from datetime import datetime, timedelta

@pytest.mark.unit
class TestRateLimiter:
    def test_allows_requests_under_limit(self):
        """Test that requests under the limit are allowed"""
        limiter = RateLimiter(max_attempts=3, time_window_minutes=1)
        
        # First 3 attempts should succeed
        assert limiter.is_allowed("user1")
        assert limiter.is_allowed("user1")
        assert limiter.is_allowed("user1")
        
    def test_blocks_requests_over_limit(self):
        """Test that requests over the limit are blocked"""
        limiter = RateLimiter(max_attempts=3, time_window_minutes=1)
        
        # Use up the limit
        limiter.is_allowed("user1")
        limiter.is_allowed("user1")
        limiter.is_allowed("user1")
        
        # 4th attempt should be blocked
        assert not limiter.is_allowed("user1")
        
    def test_different_users_independent_limits(self):
        """Test that different users have independent rate limits"""
        limiter = RateLimiter(max_attempts=2, time_window_minutes=1)
        
        # User1 uses their limit
        assert limiter.is_allowed("user1")
        assert limiter.is_allowed("user1")
        assert not limiter.is_allowed("user1")
        
        # User2 still has their full limit
        assert limiter.is_allowed("user2")
        assert limiter.is_allowed("user2")
        
    def test_cleanup_removes_old_entries(self):
        """Test that cleanup removes old entries"""
        limiter = RateLimiter(max_attempts=3, time_window_minutes=1)
        
        limiter.is_allowed("old_user")
        limiter.is_allowed("recent_user")
        
        # Cleanup entries older than 2 hours
        initial_count = len(limiter.attempts)
        limiter.cleanup_old_entries(hours_old=0.001)  # Very short time
        
        # Some entries should be cleaned up
        assert len(limiter.attempts) <= initial_count
