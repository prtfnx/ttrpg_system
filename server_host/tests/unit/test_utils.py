import pytest
from server_host.utils.rate_limiter import RateLimiter
import time

@pytest.mark.unit
class TestRateLimiter:
    def test_allows_requests_under_limit(self):
        """Test that requests under the limit are allowed"""
        limiter = RateLimiter()
        
        # First 3 attempts with limit=3 should succeed
        assert limiter.is_allowed("user1", max_requests=3, window_minutes=1)
        assert limiter.is_allowed("user1", max_requests=3, window_minutes=1)
        assert limiter.is_allowed("user1", max_requests=3, window_minutes=1)
        
    def test_blocks_requests_over_limit(self):
        """Test that requests over the limit are blocked"""
        limiter = RateLimiter()
        
        # Use up the limit (3 requests)
        limiter.is_allowed("user1", max_requests=3, window_minutes=1)
        limiter.is_allowed("user1", max_requests=3, window_minutes=1)
        limiter.is_allowed("user1", max_requests=3, window_minutes=1)
        
        # 4th attempt should be blocked
        assert not limiter.is_allowed("user1", max_requests=3, window_minutes=1)
        
    def test_different_users_independent_limits(self):
        """Test that different users have independent rate limits"""
        limiter = RateLimiter()
        
        # User1 uses their limit (2 requests)
        assert limiter.is_allowed("user1", max_requests=2, window_minutes=1)
        assert limiter.is_allowed("user1", max_requests=2, window_minutes=1)
        assert not limiter.is_allowed("user1", max_requests=2, window_minutes=1)
        
        # User2 still has their full limit
        assert limiter.is_allowed("user2", max_requests=2, window_minutes=1)
        assert limiter.is_allowed("user2", max_requests=2, window_minutes=1)
        
    def test_time_window_resets(self):
        """Test that rate limit resets after time window expires"""
        limiter = RateLimiter()
        
        # Use up limit with very short window (0.01 minutes = 0.6 seconds)
        assert limiter.is_allowed("user1", max_requests=2, window_minutes=0.01)
        assert limiter.is_allowed("user1", max_requests=2, window_minutes=0.01)
        assert not limiter.is_allowed("user1", max_requests=2, window_minutes=0.01)
        
        # Wait for window to expire
        time.sleep(0.7)
        
        # Should be allowed again
        assert limiter.is_allowed("user1", max_requests=2, window_minutes=0.01)
