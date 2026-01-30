import pytest
from server_host.database import crud, schemas

@pytest.mark.unit
class TestUserCRUD:
    def test_create_user(self, test_db):
        user_data = schemas.UserCreate(
            username="john",
            email="john@example.com",
            password="secret123"
        )
        user = crud.create_user(test_db, user_data)
        
        assert user.id is not None
        assert user.username == "john"
        assert user.email == "john@example.com"
        assert user.hashed_password != "secret123"
        
    def test_get_user_by_username(self, test_db, test_user):
        user = crud.get_user_by_username(test_db, test_user.username)
        assert user.id == test_user.id
        assert user.username == test_user.username
        
    def test_get_nonexistent_user(self, test_db):
        user = crud.get_user_by_username(test_db, "ghost")
        assert user is None
        
    def test_get_user_by_email(self, test_db, test_user):
        user = crud.get_user_by_email(test_db, test_user.email)
        assert user.id == test_user.id

@pytest.mark.unit
class TestGameSessionCRUD:
    def test_create_game_session(self, test_db, test_user):
        session_data = schemas.GameSessionCreate(name="Dragon Quest")
        session = crud.create_game_session(test_db, session_data, test_user.id, "DRG001")
        
        assert session.id is not None
        assert session.name == "Dragon Quest"
        assert session.session_code == "DRG001"
        assert session.owner_id == test_user.id
        
    def test_get_session_by_code(self, test_db, test_game_session):
        session = crud.get_game_session_by_code(test_db, "TEST01")
        assert session.id == test_game_session.id
        assert session.name == test_game_session.name
        
    def test_get_user_sessions(self, test_db, test_user, test_game_session):
        sessions = crud.get_user_game_sessions(test_db, test_user.id)
        assert len(sessions) > 0
        assert sessions[0].id == test_game_session.id
