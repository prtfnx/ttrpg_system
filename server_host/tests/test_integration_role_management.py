"""
Integration tests for role management system
Tests full workflow from API to database
"""
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from datetime import datetime, timedelta

from server_host.main import app
from server_host.database.database import Base, get_db
from server_host.database import models

SQLALCHEMY_TEST_DATABASE_URL = "sqlite:///./test_role_management.db"
engine = create_engine(SQLALCHEMY_TEST_DATABASE_URL, connect_args={"check_same_thread": False})
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

@pytest.fixture
def db():
    Base.metadata.create_all(bind=engine)
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()
        Base.metadata.drop_all(bind=engine)

@pytest.fixture
def client(db):
    def override_get_db():
        try:
            yield db
        finally:
            pass
    app.dependency_overrides[get_db] = override_get_db
    return TestClient(app)

@pytest.fixture
def test_data(db):
    """Create test users and session"""
    owner = models.User(username="owner", email="owner@test.com", hashed_password="hash")
    player = models.User(username="player", email="player@test.com", hashed_password="hash")
    db.add_all([owner, player])
    db.commit()
    
    session = models.GameSession(
        session_code="TEST123",
        owner_id=owner.id,
        session_name="Test Session"
    )
    db.add(session)
    db.commit()
    
    owner_player = models.GamePlayer(
        session_id=session.id,
        user_id=owner.id,
        role="owner"
    )
    player_player = models.GamePlayer(
        session_id=session.id,
        user_id=player.id,
        role="player"
    )
    db.add_all([owner_player, player_player])
    db.commit()
    
    return {"owner": owner, "player": player, "session": session}

def test_get_session_players(client, test_data):
    """Test fetching all players in session"""
    response = client.get("/game/session/TEST123/players")
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 2
    assert any(p["role"] == "owner" for p in data)
    assert any(p["role"] == "player" for p in data)

def test_change_role_as_owner(client, test_data, db):
    """Test owner changing player role"""
    player_id = test_data["player"].id
    
    response = client.post(
        f"/game/session/TEST123/players/{player_id}/role",
        json={"new_role": "trusted_player"}
    )
    
    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    assert data["old_role"] == "player"
    assert data["new_role"] == "trusted_player"
    assert len(data["permissions_gained"]) > 0
    
    updated_player = db.query(models.GamePlayer).filter(
        models.GamePlayer.user_id == player_id
    ).first()
    assert updated_player.role == "trusted_player"

def test_cannot_change_owner_role(client, test_data):
    """Test that owner role cannot be changed"""
    owner_id = test_data["owner"].id
    
    response = client.post(
        f"/game/session/TEST123/players/{owner_id}/role",
        json={"new_role": "player"}
    )
    
    assert response.status_code == 403
    assert "Cannot change owner's role" in response.json()["detail"]

def test_kick_player_as_codm(client, test_data, db):
    """Test co-DM kicking a player"""
    player_id = test_data["player"].id
    
    codm = models.User(username="codm", email="codm@test.com", hashed_password="hash")
    db.add(codm)
    db.commit()
    
    codm_player = models.GamePlayer(
        session_id=test_data["session"].id,
        user_id=codm.id,
        role="co_dm"
    )
    db.add(codm_player)
    db.commit()
    
    response = client.delete(f"/game/session/TEST123/players/{player_id}")
    
    assert response.status_code == 200
    assert response.json()["success"] is True
    
    kicked_player = db.query(models.GamePlayer).filter(
        models.GamePlayer.user_id == player_id
    ).first()
    assert kicked_player is None

def test_audit_log_created(client, test_data, db):
    """Test that role changes create audit logs"""
    player_id = test_data["player"].id
    
    client.post(
        f"/game/session/TEST123/players/{player_id}/role",
        json={"new_role": "co_dm"}
    )
    
    audit_entry = db.query(models.AuditLog).filter(
        models.AuditLog.event_type == "ROLE_CHANGE"
    ).first()
    
    assert audit_entry is not None
    assert audit_entry.session_code == "TEST123"
    assert audit_entry.target_user_id == player_id

def test_custom_permission_grant(client, test_data, db):
    """Test granting custom permissions"""
    player_id = test_data["player"].id
    
    response = client.post(
        f"/game/session/TEST123/players/{player_id}/permissions",
        json={"permission": "view_dm_layer"}
    )
    
    assert response.status_code == 200
    
    custom_perm = db.query(models.SessionPermission).filter(
        models.SessionPermission.user_id == player_id,
        models.SessionPermission.permission == "view_dm_layer"
    ).first()
    
    assert custom_perm is not None
    assert custom_perm.is_active is True

def test_get_player_permissions(client, test_data):
    """Test retrieving player permissions"""
    player_id = test_data["player"].id
    
    response = client.get(f"/game/session/TEST123/players/{player_id}/permissions")
    
    assert response.status_code == 200
    data = response.json()
    assert "role" in data
    assert "role_permissions" in data
    assert "all_permissions" in data
    assert data["role"] == "player"

if __name__ == "__main__":
    pytest.main([__file__, "-v"])
