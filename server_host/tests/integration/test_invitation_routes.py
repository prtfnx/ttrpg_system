import pytest
import json
import time
from datetime import datetime, timedelta
from unittest.mock import patch
from fastapi.testclient import TestClient

from server_host.routers.users import get_current_user
from server_host import main
from server_host.database import crud, models

# Import the invitation fixtures
from ..utils.invitation_fixtures import *

@pytest.mark.integration
class TestInvitationCreation:
    """Test invitation creation endpoints and workflows"""
    
    def test_create_invitation_success(self, auth_client, test_game_session, mock_request_ip):
        """Test successful invitation creation by session owner"""
        invitation_data = {
            "session_code": test_game_session.session_code,
            "pre_assigned_role": "player",
            "expires_hours": 24,
            "max_uses": 5
        }
        
        response = auth_client.post(
            "/api/invitations/create",
            json=invitation_data
        )
        
        assert response.status_code == 201
        data = response.json()
        assert "invite_code" in data
        assert data["pre_assigned_role"] == "player"
        assert data["max_uses"] == 5
        assert data["session_id"] == test_game_session.id
        assert data["is_active"] is True
        
    def test_create_invitation_unauthorized(self, client, test_game_session):
        """Test invitation creation fails without authentication"""
        invitation_data = {
            "session_code": test_game_session.session_code,
            "pre_assigned_role": "player"
        }
        
        response = client.post(
            "/api/invitations/create", 
            json=invitation_data
        )
        
        assert response.status_code == 401
        
    def test_create_invitation_invalid_session(self, auth_client):
        """Test invitation creation fails with invalid session code"""
        invitation_data = {
            "session_code": "INVALID",
            "pre_assigned_role": "player"
        }
        
        response = auth_client.post(
            "/api/invitations/create",
            json=invitation_data
        )
        
        assert response.status_code == 404
        
    def test_create_invitation_not_owner(self, test_db, test_game_session, player_user):
        """Test invitation creation fails if user is not session owner"""
        # Override current user to be a regular player
        async def override_get_current_user():
            return player_user
        
        main.app.dependency_overrides[get_current_user] = override_get_current_user
        
        client = TestClient(main.app)
        
        invitation_data = {
            "session_code": test_game_session.session_code,
            "pre_assigned_role": "player"
        }
        
        response = client.post(
            "/api/invitations/create",
            json=invitation_data
        )
        
        assert response.status_code == 403
        
        # Clean up override
        main.app.dependency_overrides.pop(get_current_user, None)
        
    def test_create_invitation_with_expiration(self, auth_client, test_game_session):
        """Test invitation creation with custom expiration time"""
        invitation_data = {
            "session_code": test_game_session.session_code,
            "pre_assigned_role": "co_dm",
            "expires_hours": 48,
            "max_uses": 10
        }
        
        response = auth_client.post(
            "/api/invitations/create",
            json=invitation_data
        )
        
        assert response.status_code == 201
        data = response.json()
        assert data["pre_assigned_role"] == "co_dm"
        assert data["max_uses"] == 10
        
        # Parse and verify expiration time is approximately 48 hours from now
        expires_at = datetime.fromisoformat(data["expires_at"].replace("Z", "+00:00"))
        expected_expires = datetime.utcnow() + timedelta(hours=48)
        
        # Allow 1 minute tolerance for test execution time
        time_diff = abs((expires_at - expected_expires).total_seconds())
        assert time_diff < 60

@pytest.mark.integration  
class TestInvitationValidation:
    """Test invitation validation and retrieval"""
    
    def test_get_invitation_valid_code(self, auth_client, invitation_factory):
        """Test retrieving a valid invitation"""
        invitation = invitation_factory()
        
        response = auth_client.get(f"/api/invitations/{invitation.invite_code}")
        
        assert response.status_code == 200
        data = response.json()
        assert data["invite_code"] == invitation.invite_code
        assert data["pre_assigned_role"] == invitation.pre_assigned_role
        assert data["session_id"] == invitation.session_id
        
    def test_get_invitation_invalid_code(self, auth_client):
        """Test retrieving invitation with invalid code"""
        response = auth_client.get("/api/invitations/INVALIDCODE")
        
        assert response.status_code == 404
        
    def test_get_invitation_expired(self, auth_client, invitation_factory):
        """Test retrieving an expired invitation"""
        # Create expired invitation
        expired_invitation = invitation_factory(
            expires_at=datetime.utcnow() - timedelta(hours=1)
        )
        
        response = auth_client.get(f"/api/invitations/{expired_invitation.invite_code}")
        
        assert response.status_code == 410  # Gone - expired
        
    def test_get_invitation_max_uses_exceeded(self, auth_client, invitation_factory):
        """Test retrieving invitation that has exceeded max uses"""
        maxed_invitation = invitation_factory(max_uses=2, uses_count=2)
        
        response = auth_client.get(f"/api/invitations/{maxed_invitation.invite_code}")
        
        assert response.status_code == 410  # Gone - no uses left

@pytest.mark.integration
class TestInvitationAcceptance:
    """Test invitation acceptance workflow"""
    
    def test_accept_invitation_success(self, auth_client, test_db, invitation_factory, player_user):
        """Test successful invitation acceptance"""
        invitation = invitation_factory(max_uses=5)
        
        # Override current user to be the accepting player
        async def override_get_current_user():
            return player_user
            
        main.app.dependency_overrides[get_current_user] = override_get_current_user
        
        client = TestClient(main.app)
        
        response = client.post(f"/api/invitations/{invitation.invite_code}/accept")
        
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert "session_code" in data
        
        # Verify invitation usage was tracked
        test_db.refresh(invitation)
        assert invitation.uses_count == 1
        
        # Verify player was added to session
        players = crud.get_session_players(test_db, invitation.session_id)
        player_ids = [p.user_id for p in players]
        assert player_user.id in player_ids
        
        # Clean up override
        main.app.dependency_overrides.pop(get_current_user, None)
        
    def test_accept_invitation_already_member(self, auth_client, test_db, invitation_factory, test_user):
        """Test accepting invitation when already a member"""
        invitation = invitation_factory()
        
        # User is already owner of the session (test_user created test_game_session)
        response = auth_client.post(f"/api/invitations/{invitation.invite_code}/accept")
        
        assert response.status_code == 400  # Bad request - already member
        
    def test_accept_invitation_expired(self, auth_client, invitation_factory, player_user):
        """Test accepting an expired invitation"""
        expired_invitation = invitation_factory(
            expires_at=datetime.utcnow() - timedelta(hours=1)
        )
        
        async def override_get_current_user():
            return player_user
            
        main.app.dependency_overrides[get_current_user] = override_get_current_user
        
        client = TestClient(main.app)
        
        response = client.post(f"/api/invitations/{expired_invitation.invite_code}/accept")
        
        assert response.status_code == 410  # Gone - expired
        
        # Clean up override
        main.app.dependency_overrides.pop(get_current_user, None)

@pytest.mark.integration
class TestInvitationManagement:
    """Test invitation management operations"""
    
    def test_list_session_invitations(self, auth_client, invitation_factory, test_game_session):
        """Test listing all invitations for a session"""
        # Create multiple invitations
        inv1 = invitation_factory()
        inv2 = invitation_factory(pre_assigned_role="co_dm")
        inv3 = invitation_factory(is_active=False)
        
        response = auth_client.get(f"/api/invitations/session/{test_game_session.session_code}")
        
        assert response.status_code == 200
        data = response.json()
        assert len(data) == 3
        
        invite_codes = [inv["invite_code"] for inv in data]
        assert inv1.invite_code in invite_codes
        assert inv2.invite_code in invite_codes
        assert inv3.invite_code in invite_codes
        
    def test_list_invitations_unauthorized(self, client, test_game_session):
        """Test listing invitations without authentication"""
        response = client.get(f"/api/invitations/session/{test_game_session.session_code}")
        
        assert response.status_code == 401
        
    def test_delete_invitation(self, auth_client, test_db, invitation_factory):
        """Test deleting an invitation"""
        invitation = invitation_factory()
        
        response = auth_client.delete(f"/api/invitations/{invitation.id}")
        
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        
        # Verify invitation was deleted
        test_db.refresh(invitation)
        assert invitation.is_active is False
        
    def test_delete_invitation_not_owner(self, test_db, invitation_factory, player_user):
        """Test that only session owner can delete invitations"""
        invitation = invitation_factory()
        
        async def override_get_current_user():
            return player_user
            
        main.app.dependency_overrides[get_current_user] = override_get_current_user
        
        client = TestClient(main.app)
        
        response = client.delete(f"/api/invitations/{invitation.id}")
        
        assert response.status_code == 403
        
        # Clean up override 
        main.app.dependency_overrides.pop(get_current_user, None)

@pytest.mark.integration
class TestInvitationAuditing:
    """Test invitation-related audit logging"""
    
    @patch('server_host.routers.invitations.Request')
    def test_invitation_creation_audit_log(self, mock_request, auth_client, test_db, test_game_session):
        """Test that invitation creation is properly audited"""
        mock_request.client.host = "192.168.1.100"
        mock_request.headers = {"user-agent": "Test-Browser/1.0"}
        
        invitation_data = {
            "session_code": test_game_session.session_code,
            "pre_assigned_role": "player"
        }
        
        response = auth_client.post(
            "/api/invitations/create",
            json=invitation_data
        )
        
        assert response.status_code == 201
        
        # Check audit log was created
        audit_logs = test_db.query(models.AuditLog).filter_by(
            event_type="invitation_created"
        ).all()
        
        assert len(audit_logs) >= 1
        latest_log = audit_logs[-1]
        assert latest_log.session_code == test_game_session.session_code
        assert "invitation created" in latest_log.details.lower()
        
    @patch('server_host.routers.invitations.Request') 
    def test_invitation_acceptance_audit_log(self, mock_request, auth_client, test_db, invitation_factory, player_user):
        """Test that invitation acceptance is properly audited"""
        mock_request.client.host = "192.168.1.200"
        mock_request.headers = {"user-agent": "Mobile-Browser/2.0"}
        
        invitation = invitation_factory()
        
        async def override_get_current_user():
            return player_user
            
        main.app.dependency_overrides[get_current_user] = override_get_current_user
        
        client = TestClient(main.app)
        
        response = client.post(f"/api/invitations/{invitation.invite_code}/accept")
        
        assert response.status_code == 200
        
        # Check audit log was created
        audit_logs = test_db.query(models.AuditLog).filter_by(
            event_type="invitation_accepted"
        ).all()
        
        assert len(audit_logs) >= 1
        latest_log = audit_logs[-1]
        assert latest_log.user_id == player_user.id
        assert "invitation accepted" in latest_log.details.lower()
        
        # Clean up override
        main.app.dependency_overrides.pop(get_current_user, None)