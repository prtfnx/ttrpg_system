import pytest

@pytest.mark.integration
class TestGameLobby:
    def test_lobby_requires_auth(self, client):
        response = client.get("/game/")
        assert response.status_code in [302, 401]
        
    def test_lobby_with_auth(self, auth_client):
        response = auth_client.get("/game/")
        assert response.status_code == 200

@pytest.mark.integration
class TestCreateGameSession:
    def test_create_session(self, auth_client):
        response = auth_client.post(
            "/game/create",
            data={"game_name": "Dragon Hunt"},
            follow_redirects=False
        )
        assert response.status_code == 302
        assert "/game/session/" in response.headers["location"]
        
    def test_create_session_without_auth(self, client):
        response = client.post(
            "/game/create",
            data={"game_name": "Test"}
        )
        assert response.status_code in [302, 401]
        
    def test_create_multiple_sessions(self, auth_client, test_db, test_user):
        # Create first session
        response1 = auth_client.post(
            "/game/create",
            data={"game_name": "Session 1"}
        )
        assert response1.status_code == 302
        
        # Create second session
        response2 = auth_client.post(
            "/game/create",
            data={"game_name": "Session 2"}
        )
        assert response2.status_code == 302
        
        # Verify both exist
        from server_host.database import crud
        sessions = crud.get_user_game_sessions(test_db, test_user.id)
        assert len(sessions) >= 2

@pytest.mark.integration
class TestJoinGameSession:
    def test_join_session_with_valid_code(self, auth_client, test_game_session):
        response = auth_client.post(
            "/game/join",
            data={
                "session_code": "TEST01",
                "character_name": "Hero"
            },
            follow_redirects=False
        )
        assert response.status_code == 302
        
    def test_join_session_invalid_code(self, auth_client):
        response = auth_client.post(
            "/game/join",
            data={
                "session_code": "INVALID",
                "character_name": "Hero"
            }
        )
        assert response.status_code in [400, 404]
        
    def test_join_without_auth(self, client, test_game_session):
        response = client.post(
            "/game/join",
            data={
                "session_code": "TEST01",
                "character_name": "Hero"
            }
        )
        assert response.status_code in [302, 401]

@pytest.mark.integration
class TestGameSessionAccess:
    def test_access_own_session(self, auth_client, test_game_session):
        response = auth_client.get(f"/game/session/{test_game_session.session_code}")
        assert response.status_code == 200
        
    def test_session_code_uniqueness(self, test_db, test_user):
        from server_host.routers.game import generate_unique_session_code
        
        codes = set()
        for _ in range(10):
            code = generate_unique_session_code(test_db)
            codes.add(code)
        
        # All codes should be unique
        assert len(codes) == 10

@pytest.mark.integration
class TestGameFlow:
    """Test complete game creation and join flow"""
    
    def test_full_game_workflow(self, client, test_db):
        # Register two users
        client.post(
            "/users/register",
            data={
                "username": "gm",
                "email": "gm@example.com",
                "password": "gmpass123",
                "password_confirm": "gmpass123"
            }
        )
        
        # GM login
        gm_login = client.post(
            "/users/login",
            data={"username": "gm", "password": "gmpass123"}
        )
        assert "token" in gm_login.cookies
        
        # GM creates session
        create_resp = client.post(
            "/game/create",
            data={"game_name": "Epic Adventure"},
            follow_redirects=False
        )
        assert create_resp.status_code == 302
        
        # Extract session code from redirect
        location = create_resp.headers["location"]
        session_code = location.split("/")[-1]
        
        # Register player
        client.cookies.clear()
        client.post(
            "/users/register",
            data={
                "username": "player1",
                "email": "player@example.com",
                "password": "playerpass123",
                "password_confirm": "playerpass123"
            }
        )
        
        # Player login
        player_login = client.post(
            "/users/login",
            data={"username": "player1", "password": "playerpass123"}
        )
        assert "token" in player_login.cookies
        
        # Player joins
        join_resp = client.post(
            "/game/join",
            data={
                "session_code": session_code,
                "character_name": "Warrior"
            },
            follow_redirects=False
        )
        assert join_resp.status_code == 302
