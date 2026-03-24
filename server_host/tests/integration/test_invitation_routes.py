import pytest
from datetime import datetime, timedelta
from fastapi.testclient import TestClient

from server_host.routers.users import get_current_user
from server_host import main
from server_host.database import crud, models

from ..utils.invitation_fixtures import *


@pytest.mark.integration
class TestInvitationCreation:

    def test_create_invitation_success(self, auth_client, test_game_session):
        response = auth_client.post("/api/invitations/create", json={
            "session_code": test_game_session.session_code,
            "pre_assigned_role": "player",
            "expires_hours": 24,
            "max_uses": 5
        })
        assert response.status_code == 201
        data = response.json()
        assert "invite_code" in data
        assert data["pre_assigned_role"] == "player"
        assert data["max_uses"] == 5
        assert data["session_code"] == test_game_session.session_code
        assert data["is_active"] is True

    def test_create_invitation_unauthorized(self, client, test_game_session):
        response = client.post(
            "/api/invitations/create",
            json={"session_code": test_game_session.session_code, "pre_assigned_role": "player"},
            headers={"accept": "application/json"}
        )
        assert response.status_code == 401

    def test_create_invitation_invalid_session(self, auth_client):
        response = auth_client.post("/api/invitations/create", json={
            "session_code": "INVALID",
            "pre_assigned_role": "player"
        })
        assert response.status_code == 404

    def test_create_invitation_not_owner(self, client, test_db, test_game_session, player_user):
        """Non-member trying to create invitation gets 403"""
        async def override_current():
            return player_user

        main.app.dependency_overrides[get_current_user] = override_current
        response = client.post("/api/invitations/create", json={
            "session_code": test_game_session.session_code,
            "pre_assigned_role": "player"
        })
        main.app.dependency_overrides.pop(get_current_user, None)

        assert response.status_code == 403

    def test_create_invitation_with_expiration(self, auth_client, test_game_session):
        response = auth_client.post("/api/invitations/create", json={
            "session_code": test_game_session.session_code,
            "pre_assigned_role": "co_dm",
            "expires_hours": 48,
            "max_uses": 10
        })
        assert response.status_code == 201
        data = response.json()
        assert data["pre_assigned_role"] == "co_dm"
        assert data["max_uses"] == 10


@pytest.mark.integration
class TestInvitationValidation:

    def test_get_invitation_valid_code(self, client, invitation_factory):
        invitation = invitation_factory()
        response = client.get(f"/api/invitations/{invitation.invite_code}")
        assert response.status_code == 200
        data = response.json()
        assert data["invite_code"] == invitation.invite_code
        assert data["pre_assigned_role"] == invitation.pre_assigned_role
        assert data["session_code"] == invitation.session.session_code

    def test_get_invitation_invalid_code(self, client):
        response = client.get("/api/invitations/INVALIDCODE123")
        assert response.status_code == 404

    def test_get_invitation_expired(self, client, invitation_factory):
        expired = invitation_factory(expires_at=datetime.utcnow() - timedelta(hours=1))
        response = client.get(f"/api/invitations/{expired.invite_code}")
        assert response.status_code == 410

    def test_get_invitation_max_uses_exceeded(self, client, invitation_factory):
        maxed = invitation_factory(max_uses=2, uses_count=2)
        response = client.get(f"/api/invitations/{maxed.invite_code}")
        assert response.status_code == 410


@pytest.mark.integration
class TestInvitationAcceptance:

    def test_accept_invitation_success(self, client, test_db, invitation_factory, player_user):
        invitation = invitation_factory(max_uses=5)

        async def override_current():
            return player_user

        main.app.dependency_overrides[get_current_user] = override_current
        response = client.post(f"/api/invitations/{invitation.invite_code}/accept")
        main.app.dependency_overrides.pop(get_current_user, None)

        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert "session_code" in data

        test_db.refresh(invitation)
        assert invitation.uses_count == 1

        players = crud.get_session_players(test_db, invitation.session_id)
        assert player_user.id in [p.user_id for p in players]

    def test_accept_invitation_already_member(self, auth_client, invitation_factory):
        invitation = invitation_factory()
        response = auth_client.post(f"/api/invitations/{invitation.invite_code}/accept")
        assert response.status_code == 400

    def test_accept_invitation_expired(self, client, invitation_factory, player_user):
        expired = invitation_factory(expires_at=datetime.utcnow() - timedelta(hours=1))

        async def override_current():
            return player_user

        main.app.dependency_overrides[get_current_user] = override_current
        response = client.post(f"/api/invitations/{expired.invite_code}/accept")
        main.app.dependency_overrides.pop(get_current_user, None)

        assert response.status_code == 410


@pytest.mark.integration
class TestInvitationManagement:

    def test_list_session_invitations(self, auth_client, invitation_factory, test_game_session):
        inv1 = invitation_factory()
        inv2 = invitation_factory(pre_assigned_role="co_dm")
        inv3 = invitation_factory(is_active=False)

        response = auth_client.get(f"/api/invitations/session/{test_game_session.session_code}")
        assert response.status_code == 200
        data = response.json()
        assert len(data) == 3
        codes = [i["invite_code"] for i in data]
        assert inv1.invite_code in codes
        assert inv2.invite_code in codes
        assert inv3.invite_code in codes

    def test_list_invitations_unauthorized(self, client, test_game_session):
        response = client.get(
            f"/api/invitations/session/{test_game_session.session_code}",
            headers={"accept": "application/json"}
        )
        assert response.status_code == 401

    def test_delete_invitation(self, auth_client, test_db, invitation_factory):
        invitation = invitation_factory()
        response = auth_client.delete(f"/api/invitations/{invitation.id}")
        assert response.status_code == 200
        assert response.json()["success"] is True
        test_db.refresh(invitation)
        assert invitation.is_active is False

    def test_delete_invitation_not_owner(self, client, test_db, invitation_factory, player_user):
        invitation = invitation_factory()

        async def override_current():
            return player_user

        main.app.dependency_overrides[get_current_user] = override_current
        response = client.delete(f"/api/invitations/{invitation.id}")
        main.app.dependency_overrides.pop(get_current_user, None)

        assert response.status_code == 403


@pytest.mark.integration
class TestInvitationAuditing:

    def test_invitation_creation_audit_log(self, auth_client, test_db, test_game_session):
        response = auth_client.post("/api/invitations/create", json={
            "session_code": test_game_session.session_code,
            "pre_assigned_role": "player"
        })
        assert response.status_code == 201

        audit_logs = test_db.query(models.AuditLog).filter_by(
            event_type="INVITATION_CREATED"
        ).all()
        assert len(audit_logs) >= 1
        assert audit_logs[-1].session_code == test_game_session.session_code

    def test_invitation_acceptance_audit_log(self, client, test_db, invitation_factory, player_user):
        invitation = invitation_factory()

        async def override_current():
            return player_user

        main.app.dependency_overrides[get_current_user] = override_current
        response = client.post(f"/api/invitations/{invitation.invite_code}/accept")
        main.app.dependency_overrides.pop(get_current_user, None)

        assert response.status_code == 200

        audit_logs = test_db.query(models.AuditLog).filter_by(
            event_type="INVITATION_ACCEPTED"
        ).all()
        assert len(audit_logs) >= 1
        assert audit_logs[-1].user_id == player_user.id
