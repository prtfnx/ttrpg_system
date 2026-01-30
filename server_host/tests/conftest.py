import pytest
import sys
from pathlib import Path

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from main import app
from database.database import get_db
from database.models import Base

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
        password="testpass123"
    )
    return crud.create_user(test_db, user_data)

@pytest.fixture
def auth_token(test_user):
    from routers.users import create_access_token
    return create_access_token(data={"sub": test_user.username})

@pytest.fixture
def auth_client(client, test_db, test_user, auth_token):
    """Client with authentication set up"""
    from routers.users import get_current_user
    
    async def override_get_current_user():
        return test_user
    
    app.dependency_overrides[get_current_user] = override_get_current_user
    
    # Set cookie for authenticated requests
    client.cookies.set("token", auth_token)
    
    yield client
    
    app.dependency_overrides.pop(get_current_user, None)

@pytest.fixture
def test_game_session(test_db, test_user):
    from database import crud, schemas
    
    session_data = schemas.GameSessionCreate(name="Test Game Session")
    return crud.create_game_session(test_db, session_data, test_user.id, "TEST01")
