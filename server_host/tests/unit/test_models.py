import pytest
from pydantic import ValidationError

@pytest.mark.unit
class TestUserSchemas:
    def test_user_create_valid(self):
        from server_host.database import schemas
        user_data = schemas.UserCreate(
            username="validuser",
            email="valid@example.com",
            password="pass123"
        )
        assert user_data.username == "validuser"
        assert user_data.email == "valid@example.com"
        
    def from database import schemas
        test_user_create_invalid_email(self):
        with pytest.raises(ValidationError):
            schemas.UserCreate(
                username="user",
                email="not-an-email",
                password="pass123"
            )

@pytest.mark.unit
class TestGameSessionSchemas:
    def from database import schemas
        test_game_session_create(self):
        session_data = schemas.GameSessionCreate(name="Test Session")
        assert session_data.name == "Test Session"
        from database import schemas
        
    def test_game_session_empty_name(self):
        with pytest.raises(ValidationError):
            schemas.GameSessionCreate(name="")
