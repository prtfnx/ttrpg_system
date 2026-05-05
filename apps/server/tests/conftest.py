import secrets
from datetime import datetime, timedelta
from unittest.mock import Mock

import main
import pytest
from database.database import get_db
from database.models import Base
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

app = main.app

SQLALCHEMY_DATABASE_URL = "sqlite:///:memory:"

@pytest.fixture(scope="function")
def test_db_engine():
    engine = create_engine(
        SQLALCHEMY_DATABASE_URL,
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(bind=engine)
    yield engine
    Base.metadata.drop_all(bind=engine)

@pytest.fixture(scope="function")
def test_db(test_db_engine):
    TestingSessionLocal = sessionmaker(
        autocommit=False,
        autoflush=False,
        bind=test_db_engine
    )
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()

@pytest.fixture(autouse=True)
def reset_rate_limiters():
    """Reset rate limiters before each test to prevent 429 errors"""
    from routers.demo import demo_limiter
    from utils.rate_limiter import login_limiter, password_reset_limiter, registration_limiter

    registration_limiter.clear()
    login_limiter.clear()
    demo_limiter.clear()
    password_reset_limiter.clear()
    yield

@pytest.fixture(scope="function")
def client(test_db):
    def override_get_db():
        try:
            yield test_db
        finally:
            pass

    app.dependency_overrides[get_db] = override_get_db

    with TestClient(app) as test_client:
        yield test_client

    app.dependency_overrides.clear()

@pytest.fixture
def test_user(test_db):
    from database import crud, schemas
    user_data = schemas.UserCreate(
        username="testuser",
        email="test@example.com",
        password="Pass1234"
    )
    return crud.create_user(test_db, user_data)

@pytest.fixture
def auth_token(test_user):
    from routers.users import create_access_token
    return create_access_token(data={"sub": test_user.username})

@pytest.fixture
def auth_client(client, test_db, test_user, auth_token):
    from routers.users import get_current_user

    async def override_get_current_user():
        return test_user

    app.dependency_overrides[get_current_user] = override_get_current_user
    client.cookies.set("token", auth_token)

    yield client

    app.dependency_overrides.pop(get_current_user, None)

@pytest.fixture
def test_game_session(test_db, test_user):
    from database import crud, schemas
    session_data = schemas.GameSessionCreate(name="Test Game Session")
    return crud.create_game_session(test_db, session_data, test_user.id, "TEST01")


@pytest.fixture
def invitation_factory(test_db, test_user, test_game_session):
    def _create_invitation(**kwargs):
        from database import models
        defaults = {
            "invite_code": secrets.token_urlsafe(12),
            "session_id": test_game_session.id,
            "pre_assigned_role": "player",
            "created_by": test_user.id,
            "max_uses": 1,
            "uses_count": 0,
            "is_active": True,
            "expires_at": datetime.utcnow() + timedelta(hours=24),
        }
        defaults.update(kwargs)
        invitation = models.SessionInvitation(**defaults)
        test_db.add(invitation)
        test_db.commit()
        test_db.refresh(invitation)
        return invitation
    return _create_invitation


@pytest.fixture
def admin_user(test_db):
    from database import crud, schemas
    user_data = schemas.UserCreate(username="admin_user", email="admin@example.com", password="admin123")
    return crud.create_user(test_db, user_data)


@pytest.fixture
def co_dm_user(test_db):
    from database import crud, schemas
    user_data = schemas.UserCreate(username="codm_user", email="codm@example.com", password="codm123")
    return crud.create_user(test_db, user_data)


@pytest.fixture
def player_user(test_db):
    from database import crud, schemas
    user_data = schemas.UserCreate(username="player_user", email="player@example.com", password="player123")
    return crud.create_user(test_db, user_data)


@pytest.fixture
def game_session_with_players(test_db, test_user, co_dm_user, player_user, test_game_session):
    from database import models
    test_db.add(models.GamePlayer(user_id=co_dm_user.id, session_id=test_game_session.id, role="co_dm"))
    test_db.add(models.GamePlayer(user_id=player_user.id, session_id=test_game_session.id, role="player"))
    test_db.commit()
    return test_game_session


@pytest.fixture
def audit_log_factory(test_db):
    def _create_audit_log(**kwargs):
        from database import models
        defaults = {
            "event_type": "test_event",
            "session_code": "TEST01",
            "user_id": 1,
            "ip_address": "127.0.0.1",
            "user_agent": "pytest-client",
            "details": "Test audit log entry",
        }
        defaults.update(kwargs)
        audit_log = models.AuditLog(**defaults)
        test_db.add(audit_log)
        test_db.commit()
        test_db.refresh(audit_log)
        return audit_log
    return _create_audit_log


@pytest.fixture
def mock_request_ip():
    request = Mock()
    request.client.host = "192.168.1.100"
    request.headers = {"user-agent": "Test-Browser/1.0"}
    return request
