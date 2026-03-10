import importlib
import json

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
    import server_host.database.database as dbmod
    import server_host.database.models as models

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
    import server_host.managers.character_manager as cm_mod
    importlib.reload(cm_mod)
    return cm_mod.get_server_character_manager()


@pytest.fixture()
def user_and_session(db_mod):
    from server_host.database.models import GameSession, User

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
        from server_host.database.models import User
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

        from server_host.database.models import User
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
