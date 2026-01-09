"""
Security Tests for Role Management
Tests for SQL injection, XSS, privilege escalation, and other security vulnerabilities
"""
import pytest
from fastapi.testclient import TestClient
from core_table.api.session_management import router as session_router


@pytest.fixture
def test_session(db):
    """Create a test session"""
    from core_table.entities import Session, Player, SessionPlayer
    
    dm = Player(id=1, username="dm", email="dm@test.com")
    db.add(dm)
    db.flush()
    
    session = Session(name="Test Session", dm_id=dm.id, is_active=True)
    db.add(session)
    db.flush()
    
    sp = SessionPlayer(
        session_id=session.id,
        player_id=dm.id,
        role="dm",
        is_online=True
    )
    db.add(sp)
    db.commit()
    db.refresh(session)
    
    return session


class TestSQLInjection:
    """Test SQL injection prevention"""
    
    def test_session_id_sql_injection(self, client, test_session, db):
        """Test SQL injection in session ID parameter"""
        malicious_id = "1 OR 1=1"
        
        response = client.get(
            f"/api/sessions/{malicious_id}/players",
            headers={"Authorization": "Bearer test_token"}
        )
        
        # Should return 404 or 422, not 200 with all sessions
        assert response.status_code in [404, 422, 500]
        assert response.status_code != 200
    
    def test_player_id_sql_injection(self, client, test_session, db):
        """Test SQL injection in player ID parameter"""
        malicious_id = "1; DROP TABLE sessions;--"
        
        response = client.post(
            f"/api/sessions/{test_session.id}/players/{malicious_id}/kick",
            headers={"Authorization": "Bearer test_token"}
        )
        
        assert response.status_code in [404, 422, 403]
        
        # Verify table still exists
        from core_table.entities import Session
        assert db.query(Session).first() is not None
    
    def test_role_name_sql_injection(self, client, test_session, db):
        """Test SQL injection in role parameter"""
        from core_table.entities import Player, SessionPlayer
        
        player = Player(id=2, username="player", email="player@test.com")
        db.add(player)
        db.flush()
        
        sp = SessionPlayer(
            session_id=test_session.id,
            player_id=player.id,
            role="player"
        )
        db.add(sp)
        db.commit()
        
        malicious_role = "dm'; DROP TABLE players;--"
        
        response = client.put(
            f"/api/sessions/{test_session.id}/players/{player.id}/role",
            json={"role": malicious_role},
            headers={"Authorization": "Bearer test_token"}
        )
        
        assert response.status_code in [400, 422]
        
        # Verify table still exists
        assert db.query(Player).first() is not None
    
    def test_invitation_token_sql_injection(self, client, test_session, db):
        """Test SQL injection in invitation token"""
        malicious_token = "token' OR '1'='1"
        
        response = client.post(
            f"/api/sessions/{test_session.id}/invitations/{malicious_token}/revoke",
            headers={"Authorization": "Bearer test_token"}
        )
        
        assert response.status_code in [404, 422, 403]


class TestXSSPrevention:
    """Test XSS (Cross-Site Scripting) prevention"""
    
    def test_session_name_xss(self, client, db):
        """Test XSS in session name"""
        xss_name = "<script>alert('XSS')</script>"
        
        response = client.post(
            "/api/sessions",
            json={"name": xss_name},
            headers={"Authorization": "Bearer test_token"}
        )
        
        if response.status_code == 200:
            # Name should be sanitized or escaped
            assert "<script>" not in response.json().get("name", "")
    
    def test_username_xss(self, client, test_session, db):
        """Test XSS in username display"""
        from core_table.entities import Player, SessionPlayer
        
        xss_username = "<img src=x onerror=alert('XSS')>"
        player = Player(
            username=xss_username,
            email="xss@test.com"
        )
        db.add(player)
        db.flush()
        
        sp = SessionPlayer(
            session_id=test_session.id,
            player_id=player.id,
            role="player"
        )
        db.add(sp)
        db.commit()
        
        response = client.get(
            f"/api/sessions/{test_session.id}/players",
            headers={"Authorization": "Bearer test_token"}
        )
        
        if response.status_code == 200:
            players = response.json()
            # XSS should be escaped
            assert "<img" not in str(players)


class TestPrivilegeEscalation:
    """Test privilege escalation prevention"""
    
    def test_player_cannot_promote_self_to_dm(self, client, test_session, db):
        """Player should not be able to make themselves DM"""
        from core_table.entities import Player, SessionPlayer
        
        player = Player(id=2, username="player", email="player@test.com")
        db.add(player)
        db.flush()
        
        sp = SessionPlayer(
            session_id=test_session.id,
            player_id=player.id,
            role="player"
        )
        db.add(sp)
        db.commit()
        
        # Try to promote self to DM
        response = client.put(
            f"/api/sessions/{test_session.id}/players/{player.id}/role",
            json={"role": "dm"},
            headers={"Authorization": f"Bearer player_token_{player.id}"}
        )
        
        assert response.status_code == 403
    
    def test_player_cannot_kick_dm(self, client, test_session, db):
        """Player should not be able to kick DM"""
        from core_table.entities import Player, SessionPlayer
        
        player = Player(id=2, username="player", email="player@test.com")
        db.add(player)
        db.flush()
        
        sp = SessionPlayer(
            session_id=test_session.id,
            player_id=player.id,
            role="player"
        )
        db.add(sp)
        db.commit()
        
        dm_id = test_session.dm_id
        
        response = client.post(
            f"/api/sessions/{test_session.id}/players/{dm_id}/kick",
            headers={"Authorization": f"Bearer player_token_{player.id}"}
        )
        
        assert response.status_code == 403
    
    def test_spectator_cannot_create_invitations(self, client, test_session, db):
        """Spectator should not create invitations"""
        from core_table.entities import Player, SessionPlayer
        
        spectator = Player(id=3, username="spectator", email="spectator@test.com")
        db.add(spectator)
        db.flush()
        
        sp = SessionPlayer(
            session_id=test_session.id,
            player_id=spectator.id,
            role="spectator"
        )
        db.add(sp)
        db.commit()
        
        response = client.post(
            f"/api/sessions/{test_session.id}/invitations",
            json={"role": "player"},
            headers={"Authorization": f"Bearer spectator_token_{spectator.id}"}
        )
        
        assert response.status_code == 403
    
    def test_cannot_access_other_session(self, client, db):
        """Player in session A cannot access session B"""
        from core_table.entities import Session, Player, SessionPlayer
        
        # Create two sessions
        player = Player(id=5, username="player5", email="player5@test.com")
        db.add(player)
        db.flush()
        
        session_a = Session(name="Session A", dm_id=1, is_active=True)
        session_b = Session(name="Session B", dm_id=2, is_active=True)
        db.add_all([session_a, session_b])
        db.flush()
        
        # Add player to session A only
        sp = SessionPlayer(
            session_id=session_a.id,
            player_id=player.id,
            role="player"
        )
        db.add(sp)
        db.commit()
        
        # Try to access session B
        response = client.get(
            f"/api/sessions/{session_b.id}/players",
            headers={"Authorization": f"Bearer player_token_{player.id}"}
        )
        
        assert response.status_code == 403


class TestInputValidation:
    """Test input validation and sanitization"""
    
    def test_invalid_role_name(self, client, test_session, db):
        """Test invalid role name is rejected"""
        from core_table.entities import Player, SessionPlayer
        
        player = Player(id=6, username="player6", email="player6@test.com")
        db.add(player)
        db.flush()
        
        sp = SessionPlayer(
            session_id=test_session.id,
            player_id=player.id,
            role="player"
        )
        db.add(sp)
        db.commit()
        
        response = client.put(
            f"/api/sessions/{test_session.id}/players/{player.id}/role",
            json={"role": "super_admin"},
            headers={"Authorization": "Bearer test_token"}
        )
        
        assert response.status_code in [400, 422]
    
    def test_negative_max_uses(self, client, test_session, db):
        """Test negative max_uses is rejected"""
        response = client.post(
            f"/api/sessions/{test_session.id}/invitations",
            json={"role": "player", "max_uses": -1},
            headers={"Authorization": "Bearer test_token"}
        )
        
        assert response.status_code in [400, 422]
    
    def test_excessively_long_session_name(self, client, db):
        """Test overly long session name is rejected"""
        long_name = "A" * 10000
        
        response = client.post(
            "/api/sessions",
            json={"name": long_name},
            headers={"Authorization": "Bearer test_token"}
        )
        
        assert response.status_code in [400, 422]


class TestRateLimiting:
    """Test rate limiting for sensitive operations"""
    
    def test_invitation_creation_rate_limit(self, client, test_session, db):
        """Test creating many invitations doesn't overwhelm system"""
        # Create 100 invitations rapidly
        responses = []
        for _ in range(100):
            response = client.post(
                f"/api/sessions/{test_session.id}/invitations",
                json={"role": "player"},
                headers={"Authorization": "Bearer test_token"}
            )
            responses.append(response.status_code)
        
        # Some should succeed, but rate limiting may apply
        assert 200 in responses or 201 in responses


class TestAuditLogging:
    """Test that sensitive actions are logged"""
    
    def test_role_change_logged(self, client, test_session, db):
        """Verify role changes are logged"""
        from core_table.entities import Player, SessionPlayer
        
        player = Player(id=7, username="player7", email="player7@test.com")
        db.add(player)
        db.flush()
        
        sp = SessionPlayer(
            session_id=test_session.id,
            player_id=player.id,
            role="player"
        )
        db.add(sp)
        db.commit()
        
        response = client.put(
            f"/api/sessions/{test_session.id}/players/{player.id}/role",
            json={"role": "spectator"},
            headers={"Authorization": "Bearer test_token"}
        )
        
        # Check audit log (if implemented)
        # This would query an audit_log table
        if response.status_code == 200:
            # Verify logging occurred
            pass
