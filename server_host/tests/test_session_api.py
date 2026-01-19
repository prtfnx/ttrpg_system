"""
Session API router tests.
Tests that all session management routes are properly registered.
"""
import pytest
from server_host.main import app


@pytest.mark.api
class TestSessionRoutes:
    """Test session management route registration."""

    def test_session_routes_exist(self):
        """All session management routes are registered."""
        routes = [str(r.path) for r in app.routes if hasattr(r, 'path')]
        
        # Session management routes
        assert any('/session' in r for r in routes)
        assert any('/admin' in r for r in routes)
        
    def test_websocket_route_exists(self):
        """WebSocket route is registered."""
        routes = [str(r.path) for r in app.routes if hasattr(r, 'path')]
        assert any('/ws/game' in r for r in routes)
    
    def test_player_management_routes(self):
        """Player management routes exist."""
        routes = [str(r.path) for r in app.routes if hasattr(r, 'path')]
        assert any('players' in r for r in routes)
    
    def test_invitation_routes(self):
        """Invitation routes exist."""
        routes = [str(r.path) for r in app.routes if hasattr(r, 'path')]
        assert any('invitation' in r for r in routes)
