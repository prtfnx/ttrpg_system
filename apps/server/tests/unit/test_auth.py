from datetime import timedelta
from types import SimpleNamespace
from unittest.mock import MagicMock

import jwt
import pytest
from fastapi import HTTPException


@pytest.mark.unit
class TestTokenGeneration:
    def test_create_access_token(self):
        from routers.users import create_access_token
        token = create_access_token(data={"sub": "testuser"})
        assert token is not None
        assert isinstance(token, str)

    def test_token_expiration(self):
        from routers.users import ALGORITHM, SECRET_KEY, create_access_token

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
        from database import crud, schemas
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
        from database import crud
        # Correct password should verify
        assert crud.verify_password("Pass1234", test_user.hashed_password)
        # Wrong password should not verify
        assert not crud.verify_password("wrongpass", test_user.hashed_password)


@pytest.mark.unit
class TestPasswordAuditBehavior:
    def test_failed_login_records_coarse_event(self, monkeypatch):
        from routers.users import _authenticate_password

        monkeypatch.setattr("routers.users.crud.authenticate_user", lambda *args: False)
        db = MagicMock()
        request = SimpleNamespace(headers={}, client=None, state=SimpleNamespace())
        form = SimpleNamespace(username="unknown", password="WrongPass1")

        with pytest.raises(HTTPException) as error:
            _authenticate_password(form, request, db)

        assert error.value.status_code == 401
        row = db.add.call_args.args[0]
        assert row.action == "authentication.login"
        assert row.outcome == "failure"
        assert "WrongPass1" not in row.details_json
        assert request.state.security_decision_audited is True

    def test_successful_login_fails_closed_when_audit_sink_fails(self, monkeypatch):
        from routers.users import _authenticate_password

        user = SimpleNamespace(id=7, username="player", session_version=0)
        monkeypatch.setattr("routers.users.crud.authenticate_user", lambda *args: user)
        db = MagicMock()
        db.commit.side_effect = RuntimeError("write unavailable")
        request = SimpleNamespace(headers={}, client=None, state=SimpleNamespace())
        form = SimpleNamespace(username="player", password="Pass1234")

        with pytest.raises(HTTPException) as error:
            _authenticate_password(form, request, db)

        assert error.value.status_code == 503
        db.rollback.assert_called_once()
