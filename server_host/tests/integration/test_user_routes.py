import pytest

@pytest.mark.integration
class TestUserRegistration:
    def test_register_new_user(self, client):
        response = client.post(
            "/users/register",
            data={
                "username": "newuser",
                "email": "new@example.com",
                "password": "newpass123",
                "password_confirm": "newpass123"
            },
            follow_redirects=False
        )
        assert response.status_code == 302
        
    def test_register_duplicate_username(self, client, test_user):
        response = client.post(
            "/users/register",
            data={
                "username": test_user.username,
                "email": "different@example.com",
                "password": "pass123",
                "password_confirm": "pass123"
            }
        )
        assert response.status_code == 400
        
    def test_register_duplicate_email(self, client, test_user):
        response = client.post(
            "/users/register",
            data={
                "username": "differentuser",
                "email": test_user.email,
                "password": "pass123",
                "password_confirm": "pass123"
            }
        )
        assert response.status_code == 400
        
    def test_register_password_mismatch(self, client):
        response = client.post(
            "/users/register",
            data={
                "username": "user",
                "email": "user@example.com",
                "password": "pass123",
                "password_confirm": "different"
            }
        )
        assert response.status_code == 400

@pytest.mark.integration
class TestUserLogin:
    def test_login_success(self, client, test_user):
        response = client.post(
            "/users/login",
            data={
                "username": test_user.username,
                "password": "testpass123"
            },
            follow_redirects=False
        )
        assert response.status_code == 302
        assert "token" in response.cookies
        
    def test_login_wrong_password(self, client, test_user):
        response = client.post(
            "/users/login",
            data={
                "username": test_user.username,
                "password": "wrongpass"
            }
        )
        assert response.status_code == 400
        
    def test_login_nonexistent_user(self, client):
        response = client.post(
            "/users/login",
            data={
                "username": "ghost",
                "password": "anypass"
            }
        )
        assert response.status_code == 400

@pytest.mark.integration
class TestProtectedEndpoints:
    def test_profile_without_auth(self, client):
        response = client.get("/users/profile")
        # Should redirect to login
        assert response.status_code in [302, 401]
        
    def test_profile_with_auth(self, auth_client, test_user):
        response = auth_client.get("/users/profile")
        assert response.status_code == 200
        
    def test_dashboard_with_auth(self, auth_client):
        response = auth_client.get("/users/dashboard")
        assert response.status_code == 200

@pytest.mark.integration
class TestUserFlow:
    """Test complete user registration and login flow"""
    
    def test_complete_registration_login_flow(self, client):
        # Register
        register_response = client.post(
            "/users/register",
            data={
                "username": "flowuser",
                "email": "flow@example.com",
                "password": "flowpass123",
                "password_confirm": "flowpass123"
            },
            follow_redirects=False
        )
        assert register_response.status_code == 302
        
        # Login
        login_response = client.post(
            "/users/login",
            data={
                "username": "flowuser",
                "password": "flowpass123"
            },
            follow_redirects=False
        )
        assert login_response.status_code == 302
        assert "token" in login_response.cookies
