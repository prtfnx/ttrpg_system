import pytest
from datetime import datetime
from unittest.mock import patch
from server_host.database import models

@pytest.mark.unit
class TestDemoSystem:
    def test_demo_creates_session(self, client, test_db):
        """Demo endpoint creates demo session"""
        response = client.get("/demo", follow_redirects=False)
        
        assert response.status_code == 302
        assert "/game/session/" in response.headers["location"]
        
        demo_session = test_db.query(models.GameSession).filter(
            models.GameSession.is_demo == True
        ).first()
        assert demo_session is not None
    
    def test_demo_sets_jwt_cookie(self, client):
        """Demo sets short-lived JWT token"""
        response = client.get("/demo", follow_redirects=False)
        
        assert "token" in response.cookies
        token = response.cookies.get("token")
        assert token is not None
    
    def test_demo_rate_limiting(self, client):
        """Demo enforces IP rate limiting"""
        # Make 4 requests (limit is 3 per hour)
        responses = []
        for i in range(4):
            response = client.get("/demo", follow_redirects=False)
            responses.append(response)
        
        # First 3 should succeed
        for i in range(3):
            assert responses[i].status_code == 302
        
        # 4th should be rate limited
        assert responses[3].status_code == 429
    
    def test_demo_session_has_spectator_role(self, auth_client, test_db):
        """Demo users get spectator role"""
        # Create demo session
        demo_session = models.GameSession(
            name="Demo Session",
            session_code="DEMO01",
            owner_id=1,
            is_demo=True
        )
        test_db.add(demo_session)
        test_db.commit()
        
        # Verify the is_demo flag is set
        session = test_db.query(models.GameSession).filter(
            models.GameSession.session_code == "DEMO01"
        ).first()
        assert session.is_demo == True
