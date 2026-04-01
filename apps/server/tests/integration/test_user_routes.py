import pytest

@pytest.mark.integration
class TestUserRegistration:
    def test_register_new_user(self, client):
        response = client.post(
            "/users/register",
            data={
                "username": "newuser",
                "email": "new@example.com",
                "password": "Newpass12",
                "confirm_password": "Newpass12"
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
                "password": "Pass1234",
                "confirm_password": "Pass1234"
            }
        )
        assert response.status_code in [400, 409]

    def test_register_duplicate_email(self, client, test_user):
        response = client.post(
            "/users/register",
            data={
                "username": "differentuser",
                "email": test_user.email,
                "password": "Pass1234",
                "confirm_password": "Pass1234"
            }
        )
        assert response.status_code in [400, 409]

    def test_register_password_mismatch(self, client):
        response = client.post(
            "/users/register",
            data={
                "username": "usertest",
                "email": "user@example.com",
                "password": "Pass1234",
                "confirm_password": "Different1"
            }
        )
        assert response.status_code == 400


@pytest.mark.integration
class TestUserLogin:
    def test_login_success(self, client, test_user):
        """test_user is created with password Pass1234 in conftest"""
        response = client.post(
            "/users/login",
            data={
                "username": test_user.username,
                "password": "Pass1234"
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
                "password": "WrongPass1"
            }
        )
        assert response.status_code == 401

    def test_login_nonexistent_user(self, client):
        response = client.post(
            "/users/login",
            data={
                "username": "ghostuser",
                "password": "NoSuchPass1"
            }
        )
        assert response.status_code == 401


@pytest.mark.integration
class TestProtectedEndpoints:
    def test_profile_without_auth(self, client):
        response = client.get("/users/me", follow_redirects=False)
        assert response.status_code in [302, 401]

    def test_profile_with_auth(self, auth_client):
        response = auth_client.get("/users/me", headers={"accept": "application/json"})
        assert response.status_code == 200

    def test_dashboard_without_auth(self, client):
        response = client.get("/users/dashboard", follow_redirects=False)
        assert response.status_code in [302, 401]

    def test_dashboard_with_auth(self, auth_client):
        response = auth_client.get("/users/dashboard")
        assert response.status_code == 200


@pytest.mark.integration
class TestUserFlow:
    def test_complete_registration_login_flow(self, client):
        reg = client.post(
            "/users/register",
            data={
                "username": "flowuser",
                "email": "flow@example.com",
                "password": "Flowpass1",
                "confirm_password": "Flowpass1"
            },
            follow_redirects=False
        )
        assert reg.status_code == 302

        login = client.post(
            "/users/login",
            data={"username": "flowuser", "password": "Flowpass1"},
            follow_redirects=False
        )
        assert login.status_code == 302
        assert "token" in login.cookies
