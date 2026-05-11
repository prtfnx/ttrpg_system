import importlib

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture()
def db_mod(monkeypatch, tmp_path):
    """Wire character_manager to an isolated in-memory SQLite DB."""
    import database.database as dbmod
    import database.models as models

    db_url = "sqlite:///:memory:"
    engine = create_engine(db_url, connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Session = sessionmaker(autocommit=False, autoflush=False, bind=engine)

    monkeypatch.setattr(dbmod, "DATABASE_URL", db_url)
    monkeypatch.setattr(dbmod, "engine", engine)
    monkeypatch.setattr(dbmod, "SessionLocal", Session)

    models.Base.metadata.create_all(bind=engine)
    return dbmod


@pytest.fixture()
def manager(db_mod):
    import managers.character_manager as cm_mod
    importlib.reload(cm_mod)
    return cm_mod.get_server_character_manager()


@pytest.fixture()
def user_and_session(db_mod):
    from database.models import GameSession, User

    db = db_mod.SessionLocal()
    try:
        user = User(username="tester", email="t@t.com", full_name="Tester", hashed_password="x")
        db.add(user)
        db.commit()
        db.refresh(user)

        session = GameSession(name="s", session_code="TST", owner_id=user.id)
        db.add(session)
        db.commit()
        db.refresh(session)

        return user.id, session.id
    finally:
        db.close()


# ---------------------------------------------------------------------------
# Spell slot validation
# ---------------------------------------------------------------------------

@pytest.mark.unit
class TestSpellSlotValidation:
    def _save_wizard(self, manager, session_id, user_id):
        char = {
            "character_id": "wiz-1",
            "name": "Gandalf",
            "data": {
                "spellSlots": {
                    "1": {"total": 4, "used": 0},
                    "2": {"total": 3, "used": 0},
                },
                "spellSlotsUsed": {"1": 0, "2": 0},
            },
        }
        r = manager.save_character(session_id, char, user_id)
        assert r["success"]
        return r

    def test_valid_slot_usage_accepted(self, manager, user_and_session):
        uid, sid = user_and_session
        self._save_wizard(manager, sid, uid)

        r = manager.update_character(
            sid, "wiz-1", {"data": {"spellSlotsUsed": {"1": 2, "2": 1}}}, uid
        )
        assert r["success"] is True

    def test_over_limit_rejected(self, manager, user_and_session):
        uid, sid = user_and_session
        self._save_wizard(manager, sid, uid)

        r = manager.update_character(
            sid, "wiz-1", {"data": {"spellSlotsUsed": {"1": 5}}}, uid
        )
        assert r["success"] is False
        assert "level 1" in r["error"].lower() or "slot" in r["error"].lower()

    def test_exact_limit_accepted(self, manager, user_and_session):
        uid, sid = user_and_session
        self._save_wizard(manager, sid, uid)

        r = manager.update_character(
            sid, "wiz-1", {"data": {"spellSlotsUsed": {"2": 3}}}, uid
        )
        assert r["success"] is True

    def test_no_slots_in_update_skips_validation(self, manager, user_and_session):
        uid, sid = user_and_session
        self._save_wizard(manager, sid, uid)

        r = manager.update_character(sid, "wiz-1", {"name": "Gandalf the White"}, uid)
        assert r["success"] is True


# ---------------------------------------------------------------------------
# bypass_owner_check — DM token sync
# ---------------------------------------------------------------------------

@pytest.mark.unit
class TestBypassOwnerCheck:
    def test_owner_can_update(self, manager, user_and_session):
        uid, sid = user_and_session
        char = {"character_id": "hero-1", "name": "Hero", "data": {"stats": {"hp": 10, "maxHp": 20}}}
        manager.save_character(sid, char, uid)

        r = manager.update_character(sid, "hero-1", {"data": {"stats": {"hp": 8}}}, uid)
        assert r["success"] is True

    def test_non_owner_blocked_without_bypass(self, manager, user_and_session, db_mod):
        uid, sid = user_and_session

        # Create second user
        from database.models import User
        db = db_mod.SessionLocal()
        try:
            other = User(username="other", email="o@o.com", full_name="Other", hashed_password="y")
            db.add(other)
            db.commit()
            db.refresh(other)
            other_id = other.id
        finally:
            db.close()

        char = {"character_id": "hero-2", "name": "Hero2", "data": {"stats": {"hp": 10}}}
        manager.save_character(sid, char, uid)

        r = manager.update_character(sid, "hero-2", {"data": {"stats": {"hp": 5}}}, other_id)
        assert r["success"] is False
        assert "permission" in r["error"].lower() or "not authorized" in r["error"].lower()

    def test_bypass_allows_non_owner_update(self, manager, user_and_session, db_mod):
        uid, sid = user_and_session

        from database.models import User
        db = db_mod.SessionLocal()
        try:
            dm = User(username="dm", email="dm@dm.com", full_name="DM", hashed_password="z")
            db.add(dm)
            db.commit()
            db.refresh(dm)
            dm_id = dm.id
        finally:
            db.close()

        char = {"character_id": "hero-3", "name": "Hero3", "data": {"stats": {"hp": 10, "maxHp": 20}}}
        manager.save_character(sid, char, uid)

        r = manager.update_character(
            sid, "hero-3", {"data": {"stats": {"hp": 3}}}, dm_id, bypass_owner_check=True
        )
        assert r["success"] is True

        loaded = manager.load_character(sid, "hero-3", uid)
        assert loaded["success"] is True
        assert loaded["character_data"]["data"]["stats"]["hp"] == 3


# ---------------------------------------------------------------------------
# save_character
# ---------------------------------------------------------------------------

@pytest.mark.unit
class TestSaveCharacter:
    def test_save_new_character_returns_success(self, manager, user_and_session):
        uid, sid = user_and_session
        r = manager.save_character(sid, {"character_id": "c1", "name": "Aria"}, uid)
        assert r["success"] is True
        assert r["character_id"] == "c1"
        assert r["version"] == 1

    def test_save_generates_id_if_missing(self, manager, user_and_session):
        uid, sid = user_and_session
        r = manager.save_character(sid, {"name": "No ID"}, uid)
        assert r["success"] is True
        assert r["character_id"]

    def test_save_to_invalid_session_returns_error(self, manager):
        r = manager.save_character(999999, {"character_id": "x", "name": "X"}, 1)
        assert r["success"] is False
        assert "not found" in r["error"].lower()

    def test_save_updates_existing_character(self, manager, user_and_session):
        uid, sid = user_and_session
        manager.save_character(sid, {"character_id": "c2", "name": "Old Name"}, uid)
        r = manager.save_character(sid, {"character_id": "c2", "name": "New Name"}, uid)
        assert r["success"] is True
        assert r["version"] == 2

    def test_save_another_users_character_denied(self, manager, user_and_session, db_mod):
        uid, sid = user_and_session
        from database.models import User
        db = db_mod.SessionLocal()
        try:
            intruder = User(username="i", email="i@i.com", full_name="I", hashed_password="p")
            db.add(intruder)
            db.commit()
            db.refresh(intruder)
            intruder_id = intruder.id
        finally:
            db.close()
        manager.save_character(sid, {"character_id": "owned", "name": "Mine"}, uid)
        r = manager.save_character(sid, {"character_id": "owned", "name": "Stolen"}, intruder_id)
        assert r["success"] is False
        assert "permission" in r["error"].lower()


# ---------------------------------------------------------------------------
# load_character
# ---------------------------------------------------------------------------

@pytest.mark.unit
class TestLoadCharacter:
    def test_load_existing_character(self, manager, user_and_session):
        uid, sid = user_and_session
        manager.save_character(sid, {"character_id": "lc1", "name": "Loaded One"}, uid)
        r = manager.load_character(sid, "lc1", uid)
        assert r["success"] is True
        assert r["character_data"]["name"] == "Loaded One"

    def test_load_missing_character_returns_error(self, manager, user_and_session):
        uid, sid = user_and_session
        r = manager.load_character(sid, "ghost", uid)
        assert r["success"] is False
        assert "not found" in r["error"].lower()

    def test_load_another_users_character_denied(self, manager, user_and_session, db_mod):
        uid, sid = user_and_session
        from database.models import User
        db = db_mod.SessionLocal()
        try:
            other = User(username="o2", email="o2@o.com", full_name="O2", hashed_password="p")
            db.add(other)
            db.commit()
            db.refresh(other)
            other_id = other.id
        finally:
            db.close()
        manager.save_character(sid, {"character_id": "lc2", "name": "Priv"}, uid)
        r = manager.load_character(sid, "lc2", other_id)
        assert r["success"] is False


# ---------------------------------------------------------------------------
# list_characters
# ---------------------------------------------------------------------------

@pytest.mark.unit
class TestListCharacters:
    def test_list_returns_own_characters(self, manager, user_and_session):
        uid, sid = user_and_session
        manager.save_character(sid, {"character_id": "lc3", "name": "A"}, uid)
        manager.save_character(sid, {"character_id": "lc4", "name": "B"}, uid)
        r = manager.list_characters(sid, uid)
        assert r["success"] is True
        assert len(r["characters"]) == 2

    def test_list_empty_session_returns_empty(self, manager, user_and_session):
        uid, sid = user_and_session
        r = manager.list_characters(sid, uid)
        assert r["success"] is True
        assert r["characters"] == []

    def test_dm_list_gets_all_characters(self, manager, user_and_session, db_mod):
        uid, sid = user_and_session
        from database.models import User
        db = db_mod.SessionLocal()
        try:
            p2 = User(username="p2", email="p2@p.com", full_name="P2", hashed_password="p")
            db.add(p2)
            db.commit()
            db.refresh(p2)
            p2_id = p2.id
        finally:
            db.close()
        manager.save_character(sid, {"character_id": "dm1", "name": "P1 Char"}, uid)
        manager.save_character(sid, {"character_id": "dm2", "name": "P2 Char"}, p2_id)
        # user_id=0 means DM — get all
        r = manager.list_characters(sid, 0)
        assert r["success"] is True
        assert len(r["characters"]) == 2


# ---------------------------------------------------------------------------
# delete_character
# ---------------------------------------------------------------------------

@pytest.mark.unit
class TestDeleteCharacter:
    def test_delete_own_character(self, manager, user_and_session):
        uid, sid = user_and_session
        manager.save_character(sid, {"character_id": "del1", "name": "Gone"}, uid)
        r = manager.delete_character(sid, "del1", uid)
        assert r["success"] is True
        assert "deleted" in r["message"].lower()

    def test_delete_nonexistent_returns_error(self, manager, user_and_session):
        uid, sid = user_and_session
        r = manager.delete_character(sid, "ghost", uid)
        assert r["success"] is False

    def test_delete_another_users_character_denied(self, manager, user_and_session, db_mod):
        uid, sid = user_and_session
        from database.models import User
        db = db_mod.SessionLocal()
        try:
            thief = User(username="thief", email="t2@t.com", full_name="T", hashed_password="p")
            db.add(thief)
            db.commit()
            db.refresh(thief)
            thief_id = thief.id
        finally:
            db.close()
        manager.save_character(sid, {"character_id": "del2", "name": "Protected"}, uid)
        r = manager.delete_character(sid, "del2", thief_id)
        assert r["success"] is False


# ---------------------------------------------------------------------------
# update_character — version conflict
# ---------------------------------------------------------------------------

@pytest.mark.unit
class TestUpdateVersionConflict:
    def test_version_conflict_rejected(self, manager, user_and_session):
        uid, sid = user_and_session
        manager.save_character(sid, {"character_id": "vc1", "name": "Versioned"}, uid)
        r = manager.update_character(sid, "vc1", {"name": "Updated"}, uid, expected_version=99)
        assert r["success"] is False
        assert "version" in r["error"].lower()

    def test_correct_version_accepted(self, manager, user_and_session):
        uid, sid = user_and_session
        manager.save_character(sid, {"character_id": "vc2", "name": "Versioned"}, uid)
        r = manager.update_character(sid, "vc2", {"name": "Updated"}, uid, expected_version=1)
        assert r["success"] is True

    def test_update_missing_session_returns_error(self, manager):
        r = manager.update_character(999999, "x", {"name": "X"}, 1)
        assert r["success"] is False


# ---------------------------------------------------------------------------
# character logs
# ---------------------------------------------------------------------------

@pytest.mark.unit
class TestCharacterLogs:
    def test_hp_change_is_logged(self, manager, user_and_session):
        uid, sid = user_and_session
        char = {
            "character_id": "log1", "name": "Logger",
            "data": {"stats": {"hp": 10, "maxHp": 20}}
        }
        manager.save_character(sid, char, uid)
        manager.update_character(sid, "log1", {"data": {"stats": {"hp": 5, "maxHp": 20}}}, uid)
        r = manager.get_character_logs("log1", sid)
        assert r["success"] is True
        hp_logs = [log for log in r["logs"] if log["action_type"] == "hp_change"]
        assert len(hp_logs) >= 1

    def test_get_logs_empty_returns_empty_list(self, manager, user_and_session):
        uid, sid = user_and_session
        r = manager.get_character_logs("no-such-char", sid)
        assert r["success"] is True
        assert r["logs"] == []
