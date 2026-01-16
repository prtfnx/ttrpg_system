"""
Shared test fixtures for all test modules.

This module provides reusable fixtures following pytest best practices:
- Database setup with proper scoping
- Authentication fixtures for different user roles
- Common test data factories
- Test client configuration

Best Practices Applied:
- Session-scoped engine for performance
- Function-scoped db sessions for test isolation
- Explicit fixture dependencies
- Proper cleanup with yield patterns
- No sys.path manipulation needed
"""

import pytest
import json
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from server_host.main import app
from server_host.database.database import Base, get_db
from server_host.database import models
from server_host.routers.users import get_current_user, get_current_active_user


# Test database configuration
SQLALCHEMY_TEST_DATABASE_URL = "sqlite:///./test_admin_panel.db"


@pytest.fixture(scope="session")
def engine():
    """
    Create test database engine with session scope for performance.
    
    Session scope means this is created once per test session, not per test.
    This significantly improves test execution speed.
    """
    engine = create_engine(
        SQLALCHEMY_TEST_DATABASE_URL,
        connect_args={"check_same_thread": False}
    )
    Base.metadata.create_all(bind=engine)
    yield engine
    Base.metadata.drop_all(bind=engine)


@pytest.fixture(scope="function")
def db(engine):
    """
    Create test database session with function scope.
    
    Each test gets a fresh database connection with proper transaction isolation.
    Database is recreated for each test to ensure complete isolation.
    """
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    
    TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()
        Base.metadata.drop_all(bind=engine)


@pytest.fixture
def client(db):
    """
    Create FastAPI test client with database dependency override.
    
    This client uses the test database and doesn't follow redirects,
    so we can test HTTP status codes properly.
    """
    def override_get_db():
        try:
            yield db
        finally:
            pass
    
    app.dependency_overrides[get_db] = override_get_db
    yield TestClient(app, follow_redirects=False)
    app.dependency_overrides.clear()


@pytest.fixture
def test_users(db):
    """
    Create standard test users for all tests.
    
    Returns:
        dict: User objects keyed by role name
            - owner: Premium tier user
            - co_dm: Free tier user  
            - player1: Free tier user
            - player2: Free tier user
            - spectator: Free tier user
    """
    users = {
        "owner": models.User(
            username="owner_user",
            email="owner@test.com",
            hashed_password="hashed_password",
            tier="premium"
        ),
        "co_dm": models.User(
            username="codm_user",
            email="codm@test.com",
            hashed_password="hashed_password",
            tier="free"
        ),
        "player1": models.User(
            username="player1",
            email="player1@test.com",
            hashed_password="hashed_password",
            tier="free"
        ),
        "player2": models.User(
            username="player2",
            email="player2@test.com",
            hashed_password="hashed_password",
            tier="free"
        ),
        "spectator": models.User(
            username="spectator",
            email="spectator@test.com",
            hashed_password="hashed_password",
            tier="free"
        ),
    }
    
    db.add_all(users.values())
    db.commit()
    
    for user in users.values():
        db.refresh(user)
    
    return users


@pytest.fixture
def test_session(db, test_users):
    """
    Create test session with multiple players in different roles.
    
    Creates session "ADMIN123" owned by owner_user with:
    - Owner (owner_user) - connected
    - Co-DM (codm_user) - connected
    - Player (player1) - disconnected
    - Trusted Player (player2) - connected
    - Spectator (spectator) - disconnected
    
    Returns:
        models.GameSession: The created session
    """
    session = models.GameSession(
        session_code="ADMIN123",
        name="Admin Test Session",
        owner_id=test_users["owner"].id,
        game_data=json.dumps({
            "description": "Test session for admin panel",
            "max_players": 10,
            "visibility": "private",
            "join_policy": "invite_only"
        })
    )
    db.add(session)
    db.commit()
    db.refresh(session)
    
    # Create game players
    players = [
        models.GamePlayer(
            session_id=session.id,
            user_id=test_users["owner"].id,
            role="owner",
            is_connected=True
        ),
        models.GamePlayer(
            session_id=session.id,
            user_id=test_users["co_dm"].id,
            role="co_dm",
            is_connected=True
        ),
        models.GamePlayer(
            session_id=session.id,
            user_id=test_users["player1"].id,
            role="player",
            is_connected=False
        ),
        models.GamePlayer(
            session_id=session.id,
            user_id=test_users["player2"].id,
            role="trusted_player",
            is_connected=True
        ),
        models.GamePlayer(
            session_id=session.id,
            user_id=test_users["spectator"].id,
            role="spectator",
            is_connected=False
        ),
    ]
    db.add_all(players)
    db.commit()
    
    return session


# Authentication fixtures for different user roles
# These follow the pattern: <role>_client for authenticated test clients

@pytest.fixture
def owner_client(client, test_users):
    """Test client authenticated as owner."""
    app.dependency_overrides[get_current_user] = lambda: test_users["owner"]
    app.dependency_overrides[get_current_active_user] = lambda: test_users["owner"]
    return client


@pytest.fixture
def codm_client(client, test_users):
    """Test client authenticated as co-DM."""
    app.dependency_overrides[get_current_user] = lambda: test_users["co_dm"]
    app.dependency_overrides[get_current_active_user] = lambda: test_users["co_dm"]
    return client


@pytest.fixture
def player_client(client, test_users):
    """Test client authenticated as player."""
    app.dependency_overrides[get_current_user] = lambda: test_users["player1"]
    app.dependency_overrides[get_current_active_user] = lambda: test_users["player1"]
    return client


@pytest.fixture
def spectator_client(client, test_users):
    """Test client authenticated as spectator."""
    app.dependency_overrides[get_current_user] = lambda: test_users["spectator"]
    app.dependency_overrides[get_current_active_user] = lambda: test_users["spectator"]
    return client


# Factory fixtures for creating custom test data

@pytest.fixture
def session_factory(db):
    """
    Factory fixture for creating custom test sessions.
    
    Usage:
        session = session_factory(
            code="CUSTOM123",
            name="Custom Session",
            owner=test_users["owner"]
        )
    
    Returns:
        callable: Function that creates and returns a GameSession
    """
    def _create_session(
        code="TEST001",
        name="Test Session",
        owner=None,
        max_players=10,
        visibility="private",
        description="Factory test session"
    ):
        session = models.GameSession(
            session_code=code,
            name=name,
            owner_id=owner.id if owner else None,
            game_data=json.dumps({
                "description": description,
                "max_players": max_players,
                "visibility": visibility,
                "join_policy": "invite_only"
            })
        )
        db.add(session)
        db.commit()
        db.refresh(session)
        return session
    
    return _create_session


@pytest.fixture
def player_factory(db):
    """
    Factory fixture for adding players to sessions.
    
    Usage:
        player_factory(
            session=test_session,
            user=test_users["player1"],
            role="player",
            is_connected=True
        )
    
    Returns:
        callable: Function that creates and returns a GamePlayer
    """
    def _create_player(session, user, role="player", is_connected=False):
        player = models.GamePlayer(
            session_id=session.id,
            user_id=user.id,
            role=role,
            is_connected=is_connected
        )
        db.add(player)
        db.commit()
        db.refresh(player)
        return player
    
    return _create_player


@pytest.fixture
def audit_log_factory(db):
    """
    Factory fixture for creating audit log entries.
    
    Usage:
        audit_log_factory(
            event_type="ROLE_CHANGE",
            session_code="ADMIN123",
            user=test_users["owner"],
            details={"old": "player", "new": "trusted_player"}
        )
    
    Returns:
        callable: Function that creates and returns an AuditLog entry
    """
    def _create_audit_log(
        event_type,
        session_code,
        user,
        target_user=None,
        details=None
    ):
        audit = models.AuditLog(
            event_type=event_type,
            session_code=session_code,
            user_id=user.id,
            target_user_id=target_user.id if target_user else None,
            details=json.dumps(details) if details else None
        )
        db.add(audit)
        db.commit()
        db.refresh(audit)
        return audit
    
    return _create_audit_log
