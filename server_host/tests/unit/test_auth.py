import pytest
from fastapi import HTTPException
from datetime import timedelta
import jwt

@pytest.mark.unit
class TestTokenGeneration:
    def test_create_access_token(self):
        from server_host.routers.users import create_access_token
        token = create_access_token(data={"sub": "testuser"})
        assert token is not None
        assert isinstance(token, str)
        
    def test_token_expiration(self):
        from server_host.routers.users import create_access_token, SECRET_KEY, ALGORITHM
        
        token = create_access_token(
            data={"sub": "testuser"},
            expires_delta=timedelta(minutes=1)
        )
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        assert "exp" in payload
        assert payload["sub"] == "testuser"

@pytest.mark.unit
class TestPasswordHashing:
    def test_password_is_hashed(self, test_db):
        from server_host.database import crud, schemas
        user_data = schemas.UserCreate(
            username="secure",
            email="secure@example.com",
            password="plaintext123"
        )
        user = crud.create_user(test_db, user_data)
        
        assert user.hashed_password != "plaintext123"
        assert len(user.hashed_password) > 20
        
    def test_verify_password(self, test_db, test_user):
        """Test password verification against stored hash"""
        from server_host.database import crud
        # Correct password should verify
        assert crud.verify_password("pass123", test_user.hashed_password)
        # Wrong password should not verify
        assert not crud.verify_password("wrongpass", test_user.hashed_password)
