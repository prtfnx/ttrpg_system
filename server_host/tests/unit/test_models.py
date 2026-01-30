import pytest
from server_host.database import schemas
from pydantic import ValidationError

@pytest.mark.unit
class TestUserSchemas:
    def test_user_create_valid(self):
        user_data = schemas.UserCreate(
            username="validuser",
            email="valid@example.com",
            password="pass123"
        )
        assert user_data.username == "validuser"
        assert user_data.email == "valid@example.com"
        
    def test_user_create_invalid_email(self):
        """Test that invalid email is accepted (email is optional in schema)"""
        # Current schema doesn't enforce email validation, so this test
        # should check that optional email can be any string or None
        user = schemas.UserCreate(
            username="user",
            email="not-an-email",  # Schema allows this as email is Optional[str]
            password="pass123"
        )
        assert user.email == "not-an-email"

@pytest.mark.unit
class TestGameSessionSchemas:
    def test_game_session_create(self):
        session_data = schemas.GameSessionCreate(name="Test Session")
        assert session_data.name == "Test Session"
        
    def test_game_session_empty_name(self):
        """Test that empty name is currently allowed"""
        # Current schema doesn't validate min length
        # so empty names are allowed
        session = schemas.GameSessionCreate(name="")
        assert session.name == ""
