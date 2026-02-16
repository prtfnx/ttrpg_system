import pytest
import sys
import os
from pathlib import Path

# Add both server_host and parent directory to path
server_host_dir = str(Path(__file__).parent.parent)
parent_dir = str(Path(__file__).parent.parent.parent)

if server_host_dir not in sys.path:
    sys.path.insert(0, server_host_dir)
if parent_dir not in sys.path:
    sys.path.insert(0, parent_dir)

# Set PYTHONPATH environment variable
os.environ['PYTHONPATH'] = f"{server_host_dir};{parent_dir}"

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from server_host import main
from server_host.database.database import get_db
from server_host.database.models import Base

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
    from server_host.utils.rate_limiter import registration_limiter, login_limiter
    from server_host.routers.demo import demo_limiter
    
    registration_limiter.clear()
    login_limiter.clear()
    demo_limiter.clear()
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
    from server_host.database import crud, schemas
    user_data = schemas.UserCreate(
        username="testuser",
        email="test@example.com",
        password="pass123"  # Short to avoid bcrypt 72-byte limit
    )
    return crud.create_user(test_db, user_data)

@pytest.fixture
def auth_token(test_user):
    from server_host.routers.users import create_access_token
    return create_access_token(data={"sub": test_user.username})

@pytest.fixture
def auth_client(client, test_db, test_user, auth_token):
    from server_host.routers.users import get_current_user
    
    async def override_get_current_user():
        return test_user
    
    app.dependency_overrides[get_current_user] = override_get_current_user
    client.cookies.set("token", auth_token)
    
    yield client
    
    app.dependency_overrides.pop(get_current_user, None)

@pytest.fixture
def test_game_session(test_db, test_user):
    from server_host.database import crud, schemas
    session_data = schemas.GameSessionCreate(name="Test Game Session")
    return crud.create_game_session(test_db, session_data, test_user.id, "TEST01")
