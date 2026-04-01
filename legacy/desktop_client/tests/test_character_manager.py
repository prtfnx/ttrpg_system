import os
import tempfile
import importlib
import json

import pytest

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker


@pytest.fixture()
def temp_db_path(tmp_path):
    f = tmp_path / "test_ttrpg.db"
    return str(f)


@pytest.fixture()
def configure_db(temp_db_path, monkeypatch):
    """Configure server_host.database.database to use a temporary SQLite DB."""
    # Import the module and override engine/session
    import server_host.database.database as dbmod
    import server_host.database.models as models

    # Build a sqlite URL
    database_url = f"sqlite:///{temp_db_path}"

    # Create engine and session factory for tests
    engine = create_engine(database_url, connect_args={"check_same_thread": False})
    TestSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

    # Patch attributes on module
    monkeypatch.setattr(dbmod, 'DB_PATH', temp_db_path)
    monkeypatch.setattr(dbmod, 'DATABASE_URL', database_url)
    monkeypatch.setattr(dbmod, 'engine', engine)
    monkeypatch.setattr(dbmod, 'SessionLocal', TestSessionLocal)

    # Create tables
    models.Base.metadata.create_all(bind=engine)

    yield dbmod


def create_user_and_session(dbmod):
    """Helper to create a user and a game session, returning (user_id, session_id)."""
    from server_host.database.models import User, GameSession

    db = dbmod.SessionLocal()
    try:
        user = User(username='testuser', email='test@example.com', full_name='Test User', hashed_password='x')
        db.add(user)
        db.commit()
        db.refresh(user)

        session = GameSession(name='testsession', session_code='TST', owner_id=user.id)
        db.add(session)
        db.commit()
        db.refresh(session)

        return user.id, session.id
    finally:
        db.close()


def test_save_character_and_version_increment(configure_db):
    dbmod = configure_db

    # Reload manager module so it picks up patched SessionLocal
    import server_host.managers.character_manager as cm_mod
    importlib.reload(cm_mod)

    user_id, session_id = create_user_and_session(dbmod)

    manager = cm_mod.get_server_character_manager()

    # Save new character
    char = {'character_id': 'char-1', 'name': 'Hero', 'hp': 10}
    res = manager.save_character(session_id, char, user_id)
    assert res['success'] is True
    assert res.get('character_id') == 'char-1'
    assert isinstance(res.get('version'), int) and res.get('version') >= 1

    # Update character via save_character should increment version
    char2 = {'character_id': 'char-1', 'name': 'Hero', 'hp': 12}
    res2 = manager.save_character(session_id, char2, user_id)
    assert res2['success'] is True
    assert int(res2.get('version')) == int(res.get('version')) + 1


def test_update_character_merge_and_version_conflict(configure_db):
    dbmod = configure_db
    import server_host.managers.character_manager as cm_mod
    importlib.reload(cm_mod)

    user_id, session_id = create_user_and_session(dbmod)
    manager = cm_mod.get_server_character_manager()

    # Create initial character
    char = {'character_id': 'char-2', 'name': 'Rogue', 'hp': 8, 'notes': {'foo': 'bar'}}
    r = manager.save_character(session_id, char, user_id)
    assert r['success']
    base_version = int(r.get('version', 1))

    # Successful versioned update
    updates = {'hp': 9, 'new_field': 'x'}
    ures = manager.update_character(session_id, 'char-2', updates, user_id, expected_version=base_version)
    assert ures['success'] is True
    assert int(ures.get('version')) == base_version + 1

    # Load and ensure merge applied
    loaded = manager.load_character(session_id, 'char-2', user_id)
    assert loaded['success'] is True
    data = loaded['character_data']
    assert data.get('hp') == 9
    assert data.get('new_field') == 'x'

    # Version conflict
    conflict = manager.update_character(session_id, 'char-2', {'hp': 1}, user_id, expected_version=1)
    assert conflict['success'] is False
    assert 'Version conflict' in conflict.get('error', '')
