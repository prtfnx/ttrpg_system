import pytest
from unittest.mock import patch

from routers.users import get_current_user
import main
from database import crud, schemas, models

from utils.invitation_fixtures import *


@pytest.mark.integration
class TestSessionPlayerManagement:

    def test_get_session_players_success(self, auth_client, game_session_with_players, test_user, co_dm_user, player_user):
        response = auth_client.get(
            f"/game/api/sessions/{game_session_with_players.session_code}/players"
        )
        assert response.status_code == 200
        data = response.json()
        assert len(data) >= 3
        by_username = {p["username"]: p for p in data}
        assert test_user.username in by_username
        assert co_dm_user.username in by_username
        assert player_user.username in by_username
        assert by_username[test_user.username]["role"] == "owner"
        assert by_username[co_dm_user.username]["role"] == "co_dm"
        assert by_username[player_user.username]["role"] == "player"

    def test_get_session_players_unauthorized(self, client, game_session_with_players):
        response = client.get(
            f"/game/api/sessions/{game_session_with_players.session_code}/players",
            headers={"accept": "application/json"}
        )
        assert response.status_code == 401

    def test_get_session_players_not_member(self, client, test_db, game_session_with_players):
        outsider = crud.create_user(test_db, schemas.UserCreate(
            username="outsider",
            email="outsider@example.com",
            password="Outsider12"
        ))

        async def override():
            return outsider

        main.app.dependency_overrides[get_current_user] = override
        response = client.get(
            f"/game/api/sessions/{game_session_with_players.session_code}/players",
            headers={"accept": "application/json"}
        )
        main.app.dependency_overrides.pop(get_current_user, None)

        assert response.status_code == 403

    def test_get_session_players_invalid_session(self, auth_client):
        response = auth_client.get("/game/api/sessions/INVALID/players")
        assert response.status_code == 404


@pytest.mark.integration
class TestRoleManagement:

    def test_change_player_role_success(self, auth_client, test_db, game_session_with_players, player_user):
        response = auth_client.post(
            f"/game/api/sessions/{game_session_with_players.session_code}/players/{player_user.id}/role",
            json={"role": "co_dm"}
        )
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert "co_dm" in data["message"]

        player = test_db.query(models.GamePlayer).filter_by(
            user_id=player_user.id,
            session_id=game_session_with_players.id
        ).first()
        assert player.role == "co_dm"

    def test_change_role_unauthorized(self, client, game_session_with_players, player_user):
        response = client.post(
            f"/game/api/sessions/{game_session_with_players.session_code}/players/{player_user.id}/role",
            json={"role": "co_dm"},
            headers={"accept": "application/json"}
        )
        assert response.status_code == 401

    def test_change_role_insufficient_permissions(self, client, game_session_with_players, player_user, co_dm_user):
        async def override():
            return player_user

        main.app.dependency_overrides[get_current_user] = override
        response = client.post(
            f"/game/api/sessions/{game_session_with_players.session_code}/players/{co_dm_user.id}/role",
            json={"role": "co_dm"},
            headers={"accept": "application/json"}
        )
        main.app.dependency_overrides.pop(get_current_user, None)

        assert response.status_code == 403

    def test_co_dm_can_manage_players(self, client, game_session_with_players, co_dm_user, player_user):
        async def override():
            return co_dm_user

        main.app.dependency_overrides[get_current_user] = override
        response = client.post(
            f"/game/api/sessions/{game_session_with_players.session_code}/players/{player_user.id}/role",
            json={"role": "player"}  # co_dm can assign player role (not co_dm)
        )
        main.app.dependency_overrides.pop(get_current_user, None)

        assert response.status_code == 200

    def test_cannot_change_owner_role(self, auth_client, game_session_with_players, test_user):
        response = auth_client.post(
            f"/game/api/sessions/{game_session_with_players.session_code}/players/{test_user.id}/role",
            json={"role": "player"}
        )
        assert response.status_code == 400

    def test_invalid_role_value(self, auth_client, game_session_with_players, player_user):
        response = auth_client.post(
            f"/game/api/sessions/{game_session_with_players.session_code}/players/{player_user.id}/role",
            json={"role": "super_admin"}
        )
        assert response.status_code == 400


@pytest.mark.integration
class TestPlayerRemoval:

    def test_kick_player_success(self, auth_client, test_db, game_session_with_players, player_user):
        response = auth_client.delete(
            f"/game/api/sessions/{game_session_with_players.session_code}/players/{player_user.id}"
        )
        assert response.status_code == 200
        assert response.json()["success"] is True

        kicked = test_db.query(models.GamePlayer).filter_by(
            user_id=player_user.id,
            session_id=game_session_with_players.id
        ).first()
        assert kicked is None

    def test_kick_player_unauthorized(self, client, game_session_with_players, player_user):
        response = client.delete(
            f"/game/api/sessions/{game_session_with_players.session_code}/players/{player_user.id}",
            headers={"accept": "application/json"}
        )
        assert response.status_code == 401

    def test_kick_player_insufficient_permissions(self, client, game_session_with_players, player_user, co_dm_user):
        async def override():
            return player_user

        main.app.dependency_overrides[get_current_user] = override
        response = client.delete(
            f"/game/api/sessions/{game_session_with_players.session_code}/players/{co_dm_user.id}",
            headers={"accept": "application/json"}
        )
        main.app.dependency_overrides.pop(get_current_user, None)

        assert response.status_code == 403

    def test_cannot_kick_owner(self, client, game_session_with_players, co_dm_user, test_user):
        async def override():
            return co_dm_user

        main.app.dependency_overrides[get_current_user] = override
        response = client.delete(
            f"/game/api/sessions/{game_session_with_players.session_code}/players/{test_user.id}",
            headers={"accept": "application/json"}
        )
        main.app.dependency_overrides.pop(get_current_user, None)

        assert response.status_code == 400

    def test_kick_nonexistent_player(self, auth_client, game_session_with_players):
        response = auth_client.delete(
            f"/game/api/sessions/{game_session_with_players.session_code}/players/99999"
        )
        assert response.status_code == 404


@pytest.mark.integration
class TestUserSessions:

    def test_get_user_sessions(self, auth_client, test_user, game_session_with_players):
        response = auth_client.get("/game/api/sessions")
        assert response.status_code == 200
        data = response.json()
        assert len(data) >= 1
        session = next((s for s in data if s["session_code"] == game_session_with_players.session_code), None)
        assert session is not None
        assert session["user_role"] == "owner"

    def test_get_user_sessions_unauthorized(self, client):
        response = client.get("/game/api/sessions", headers={"accept": "application/json"})
        assert response.status_code == 401

    def test_get_user_sessions_multiple_roles(self, client, co_dm_user, game_session_with_players):
        async def override():
            return co_dm_user

        main.app.dependency_overrides[get_current_user] = override
        response = client.get("/game/api/sessions")
        main.app.dependency_overrides.pop(get_current_user, None)

        assert response.status_code == 200
        data = response.json()
        session = next((s for s in data if s["session_code"] == game_session_with_players.session_code), None)
        assert session is not None
        assert session["user_role"] == "co_dm"


@pytest.mark.integration
class TestAdminAuditLogging:

    def test_role_change_audit_log(self, auth_client, test_db, game_session_with_players, player_user):
        response = auth_client.post(
            f"/game/api/sessions/{game_session_with_players.session_code}/players/{player_user.id}/role",
            json={"role": "co_dm"}
        )
        assert response.status_code == 200

        logs = test_db.query(models.AuditLog).filter_by(
            event_type="PLAYER_ROLE_CHANGED",
            session_code=game_session_with_players.session_code
        ).all()
        assert len(logs) >= 1
        assert str(player_user.id) in logs[-1].details

    def test_player_kick_audit_log(self, auth_client, test_db, game_session_with_players, player_user):
        response = auth_client.delete(
            f"/game/api/sessions/{game_session_with_players.session_code}/players/{player_user.id}"
        )
        assert response.status_code == 200

        logs = test_db.query(models.AuditLog).filter_by(
            event_type="PLAYER_KICKED",
            session_code=game_session_with_players.session_code
        ).all()
        assert len(logs) >= 1
        assert str(player_user.id) in logs[-1].details


@pytest.mark.integration
class TestAdminSecurityValidation:

    def test_sql_injection_protection_session_code(self, auth_client):
        bad_code = "TEST01'; DROP TABLE game_sessions; --"
        response = auth_client.get(f"/game/api/sessions/{bad_code}/players")
        assert response.status_code == 404

    def test_session_isolation(self, client, test_db, test_user):
        other_user = crud.create_user(test_db, schemas.UserCreate(
            username="other_user",
            email="other@example.com",
            password="Other1234"
        ))
        other_session = crud.create_game_session(
            test_db,
            schemas.GameSessionCreate(name="Other Session"),
            other_user.id,
            "OTHER1"
        )

        async def override():
            return test_user

        main.app.dependency_overrides[get_current_user] = override
        response = client.get(
            f"/game/api/sessions/{other_session.session_code}/players",
            headers={"accept": "application/json"}
        )
        main.app.dependency_overrides.pop(get_current_user, None)

        assert response.status_code == 403
