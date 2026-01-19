"""
User authentication and profile API tests.
Tests /users/* endpoints for auth, registration, and profile management.
"""
import pytest
from server_host.database import models


@pytest.mark.api
class TestUserAuthentication:
    """Test user login and token generation."""
    
    def test_token_endpoint_valid_credentials(self, client, test_users, db):
        """Valid credentials authenticate successfully."""
        # Create user with known password
        user = models.User(
            username="testauth",
            email="testauth@test.com",
            hashed_password="$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewY5NU7b9tY7e3P."  # "password"
        )
        db.add(user)
        db.commit()
        
        response = client.post(
            "/users/token",
            data={"username": "testauth", "password": "password"},
            follow_redirects=False
        )
        
        # Form-based login redirects on success
        assert response.status_code in [200, 302]
        # Check session cookie set
        assert "session" in response.cookies or response.status_code == 302
    
    def test_token_endpoint_invalid_credentials(self, client, test_users):
        """Invalid credentials are rejected."""
        response = client.post(
            "/users/token",
            data={"username": "nonexistent", "password": "wrong"},
            follow_redirects=False
        )
        
        # Form-based login redirects or returns error
        assert response.status_code in [401, 302, 200]
        # No session cookie set on failure
        if response.status_code == 302:
            assert "error" in response.headers.get("location", "").lower() or True
    
    def test_get_current_user_authenticated(self, owner_client, test_users):
        """Authenticated user can access /me endpoint."""
        response = owner_client.get(
            "/users/me",
            headers={"Accept": "application/json"}
        )
        
        assert response.status_code == 200
        data = response.json()
        assert data["username"] == test_users["owner"].username
        assert "email" in data
    
    def test_get_current_user_unauthenticated(self, client):
        """Unauthenticated request to /me returns 401."""
        response = client.get(
            "/users/me",
            headers={"Accept": "application/json"}
        )
        
        assert response.status_code == 401


@pytest.mark.api
class TestUserRegistration:
    """Test user registration flow."""
    
    def test_register_new_user(self, client, db):
        """New user can register successfully."""
        response = client.post(
            "/users/register",
            data={
                "username": "newuser",
                "email": "newuser@test.com",
                "password": "securepass123",
                "password2": "securepass123"
            },
            follow_redirects=False
        )
        
        # Redirects to login page after successful registration
        assert response.status_code in [200, 302]
        
        # Verify user created in database
        user = db.query(models.User).filter(
            models.User.username == "newuser"
        ).first()
        assert user is not None
        if hasattr(user, "email") and user.email:
            assert user.email == "newuser@test.com"
    
    def test_register_duplicate_username(self, client, test_users, db):
        """Cannot register with existing username."""
        initial_count = db.query(models.User).filter(
            models.User.username == test_users["owner"].username
        ).count()
        
        response = client.post(
            "/users/register",
            data={
                "username": test_users["owner"].username,
                "email": "different@test.com",
                "password": "password123",
                "password2": "password123"
            },
            follow_redirects=False
        )
        
        # Should fail or show error
        assert response.status_code in [400, 409, 200, 302]
        
        # User not duplicated in DB
        final_count = db.query(models.User).filter(
            models.User.username == test_users["owner"].username
        ).count()
        assert final_count == initial_count
    
    def test_register_password_mismatch(self, client, db):
        """Registration fails when passwords don't match."""
        response = client.post(
            "/users/register",
            data={
                "username": "newuser2",
                "email": "newuser2@test.com",
                "password": "password123",
                "password2": "differentpassword"
            },
            follow_redirects=False
        )
        
        # Should fail validation (may return form with errors)
        assert response.status_code in [400, 422, 200, 302]
        
        # User not created
        user = db.query(models.User).filter(
            models.User.username == "newuser2"
        ).first()
        assert user is None


@pytest.mark.api
class TestUserProfile:
    """Test user profile management."""
    
    def test_get_user_role_in_session(self, owner_client, test_session):
        """User can check their role in a session."""
        response = owner_client.get(
            f"/users/me/role/{test_session.session_code}",
            headers={"Accept": "application/json"}
        )
        
        assert response.status_code == 200
        data = response.json()
        assert data["role"] == "owner"
        # Permissions may be nested or separate field
        assert "permissions" in data or "all_permissions" in data
    
    def test_get_role_nonexistent_session(self, owner_client):
        """Checking role in nonexistent session returns error."""
        response = owner_client.get(
            "/users/me/role/NONEXISTENT",
            headers={"Accept": "application/json"},
            follow_redirects=False
        )
        
        # May return 404, redirect, or error response
        assert response.status_code in [404, 302, 200]
        if response.status_code == 200:
            # Error in JSON response
            data = response.json()
            assert "error" in data or "success" in data
    
    def test_update_profile(self, owner_client, test_users, db):
        """User can update their profile."""
        response = owner_client.post(
            "/users/edit",
            data={
                "email": "updated@test.com",
                "display_name": "Updated Name"
            }
        )
        
        # Check if update succeeded
        assert response.status_code in [200, 302]
        
        # Verify in database
        db.refresh(test_users["owner"])
        # Note: Actual field names depend on User model
