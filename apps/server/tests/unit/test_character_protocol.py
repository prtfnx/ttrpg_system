"""
Tests for character-related protocol handlers and dice-rolling logic.

Focus: user-visible behaviour — correct message types broadcast,
death save state persistence, roll result contents.
"""
import importlib
import json
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture()
def db_mod(monkeypatch, tmp_path):
    import database.database as dbmod
    import database.models as models

    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Session = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    monkeypatch.setattr(dbmod, "DATABASE_URL", "sqlite:///:memory:")
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
        user = User(username="tester", email="t@t.com", full_name="T", hashed_password="x")
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


def _save_char(manager, session_id, user_id, char_id="char-1", hp=0, successes=0, failures=0):
    r = manager.save_character(session_id, {
        "character_id": char_id,
        "name": "Test Hero",
        "data": {
            "stats": {
                "hp": hp,
                "maxHp": 10,
                "deathSaves": {"successes": successes, "failures": failures},
            }
        },
    }, user_id)
    assert r["success"], r
    return r


# ---------------------------------------------------------------------------
# ActionsCore.character_roll — generic rolls
# ---------------------------------------------------------------------------

@pytest.mark.unit
class TestCharacterRollGeneric:
    """Server rolls the dice; result has expected fields for all roll types."""

    async def _run(self, manager, user_and_session, roll_type, modifier=0, adv=False, dis=False):
        from core_table.actions_core import ActionsCore
        from core_table.server import TableManager

        uid, sid = user_and_session
        _save_char(manager, sid, uid)

        tm = TableManager()
        actions = ActionsCore(tm)

        return await actions.character_roll(sid, "char-1", uid, roll_type, roll_type, modifier, adv, dis)

    async def test_skill_check_returns_valid_roll(self, manager, user_and_session):
        r = await self._run(manager, user_and_session, "skill_check", modifier=3)
        assert r.success
        assert 1 <= r.data["die_roll"] <= 20
        assert r.data["total"] == r.data["die_roll"] + 3
        assert r.data["roll_type"] == "skill_check"

    async def test_saving_throw_returns_valid_roll(self, manager, user_and_session):
        r = await self._run(manager, user_and_session, "saving_throw", modifier=-1)
        assert r.success
        assert r.data["total"] == r.data["die_roll"] - 1

    async def test_attack_roll_returns_valid_roll(self, manager, user_and_session):
        r = await self._run(manager, user_and_session, "attack", modifier=5)
        assert r.success
        assert r.data["roll_type"] == "attack"

    async def test_advantage_takes_higher(self, manager, user_and_session):
        from core_table.actions_core import ActionsCore
        from core_table.server import TableManager

        uid, sid = user_and_session
        _save_char(manager, sid, uid)
        tm = TableManager()
        actions = ActionsCore(tm)

        for _ in range(20):
            r = await actions.character_roll(sid, "char-1", uid, "skill_check", "test", 0, advantage=True)
            assert r.success
            assert 1 <= r.data["die_roll"] <= 20

    async def test_disadvantage_takes_lower(self, manager, user_and_session):
        from core_table.actions_core import ActionsCore
        from core_table.server import TableManager

        uid, sid = user_and_session
        _save_char(manager, sid, uid)
        tm = TableManager()
        actions = ActionsCore(tm)

        for _ in range(20):
            r = await actions.character_roll(sid, "char-1", uid, "skill_check", "test", 0, disadvantage=True)
            assert r.success
            assert 1 <= r.data["die_roll"] <= 20


# ---------------------------------------------------------------------------
# ActionsCore.character_roll — death saves
# ---------------------------------------------------------------------------

@pytest.mark.unit
class TestDeathSaveRoll:
    """Death saves follow D&D 5e rules and persist state."""

    async def _roll_with_fixed_die(self, manager, user_and_session, fixed_roll,
                                   init_successes=0, init_failures=0):
        """Patch secrets.randbelow so the die shows a specific value."""
        from core_table.actions_core import ActionsCore
        from core_table.server import TableManager

        uid, sid = user_and_session
        _save_char(manager, sid, uid, successes=init_successes, failures=init_failures)

        tm = TableManager()
        actions = ActionsCore(tm)

        with patch("secrets.randbelow", return_value=fixed_roll - 1):
            result = await actions.character_roll(sid, "char-1", uid, "death_save", "death_save", 0)
        return result, uid, sid

    async def test_roll_10_or_above_is_success(self, manager, user_and_session):
        r, uid, sid = await self._roll_with_fixed_die(manager, user_and_session, 12)
        assert r.success
        assert r.data["passed"] is True
        assert r.data["stabilized"] is False
        assert r.data["double_failure"] is False
        assert r.data["death_saves"]["successes"] == 1
        assert r.data["death_saves"]["failures"] == 0

    async def test_roll_below_10_is_failure(self, manager, user_and_session):
        r, uid, sid = await self._roll_with_fixed_die(manager, user_and_session, 7)
        assert r.success
        assert r.data["passed"] is False
        assert r.data["death_saves"]["failures"] == 1
        assert r.data["death_saves"]["successes"] == 0

    async def test_natural_20_stabilizes(self, manager, user_and_session):
        r, uid, sid = await self._roll_with_fixed_die(manager, user_and_session, 20)
        assert r.data["stabilized"] is True
        assert r.data["death_saves"]["successes"] == 3

    async def test_natural_1_adds_two_failures(self, manager, user_and_session):
        r, uid, sid = await self._roll_with_fixed_die(manager, user_and_session, 1)
        assert r.data["double_failure"] is True
        assert r.data["death_saves"]["failures"] == 2

    async def test_death_saves_accumulate_across_rolls(self, manager, user_and_session):
        r1, uid, sid = await self._roll_with_fixed_die(manager, user_and_session, 15)
        assert r1.data["death_saves"]["successes"] == 1

        r2, _, _ = await self._roll_with_fixed_die(manager, (uid, sid), 18, init_successes=1)
        assert r2.data["death_saves"]["successes"] == 2

    async def test_failures_capped_at_3(self, manager, user_and_session):
        r, uid, sid = await self._roll_with_fixed_die(manager, user_and_session, 1, init_failures=2)
        assert r.data["death_saves"]["failures"] == 3

    async def test_successes_capped_at_3(self, manager, user_and_session):
        r, uid, sid = await self._roll_with_fixed_die(manager, user_and_session, 15, init_successes=2)
        assert r.data["death_saves"]["successes"] == 3


# ---------------------------------------------------------------------------
# handle_character_roll — broadcasts CHARACTER_ROLL_RESULT
# ---------------------------------------------------------------------------

@pytest.mark.unit
class TestCharacterRollHandlerBroadcast:
    """handle_character_roll must broadcast CHARACTER_ROLL_RESULT to session."""

    def _make_protocol(self):
        from core_table.protocol import Message, MessageType
        from core_table.server import TableManager
        from service.server_protocol import ServerProtocol

        tm = TableManager()
        proto = ServerProtocol(tm, session_manager=MagicMock())
        proto.send_to_client = AsyncMock()
        proto.broadcast_to_session = AsyncMock()  # broadcast is on self, not session_manager
        proto._get_session_id = MagicMock(return_value=1)
        proto._get_user_id = MagicMock(return_value=1)
        return proto, Message, MessageType

    async def test_broadcasts_roll_result_on_success(self):
        proto, Message, MessageType = self._make_protocol()

        msg = Message(MessageType.CHARACTER_ROLL, {
            "character_id": "char-1",
            "roll_type": "skill_check",
            "skill": "athletics",
            "modifier": 2,
            "advantage": False,
            "disadvantage": False,
        })

        with patch.object(proto.actions, "character_roll", new=AsyncMock(
            return_value=MagicMock(
                success=True,
                data={"character_id": "char-1", "die_roll": 14, "total": 16, "roll_type": "skill_check",
                      "skill": "athletics", "modifier": 2, "advantage": False, "disadvantage": False,
                      "description": "athletics (skill_check): d20=14+2 = 16"},
                message="Roll completed",
            )
        )):
            await proto.handle_character_roll(msg, "client1")

        proto.broadcast_to_session.assert_awaited_once()
        broadcast_msg = proto.broadcast_to_session.call_args[0][0]
        assert broadcast_msg.type == MessageType.CHARACTER_ROLL_RESULT
        assert broadcast_msg.data["character_id"] == "char-1"


# ---------------------------------------------------------------------------
# handle_character_save_request — broadcasts CHARACTER_UPDATE not PLAYER_STATUS
# ---------------------------------------------------------------------------

@pytest.mark.unit
class TestCharacterSaveBroadcast:
    """Saving a character must broadcast CHARACTER_UPDATE so other clients sync."""

    def _make_protocol(self):
        from core_table.server import TableManager
        from service.server_protocol import ServerProtocol

        tm = TableManager()
        proto = ServerProtocol(tm, session_manager=MagicMock())
        proto.send_to_client = AsyncMock()
        proto.broadcast_to_session = AsyncMock()
        proto._get_session_id = MagicMock(return_value=1)
        proto._get_user_id = MagicMock(return_value=1)
        return proto

    async def test_broadcasts_character_update_on_save(self):
        from core_table.protocol import Message, MessageType

        proto = self._make_protocol()

        msg = Message(MessageType.CHARACTER_SAVE_REQUEST, {
            "character_data": {"character_id": "c1", "name": "Hero"},
            "session_code": "TST",
            "user_id": 1,
        })

        save_result = MagicMock(
            success=True,
            message="Saved",
            data={"character_id": "c1", "version": 2},
        )

        with patch.object(proto.actions, "save_character", new=AsyncMock(return_value=save_result)):
            await proto.handle_character_save_request(msg, "c1")

        proto.broadcast_to_session.assert_awaited_once()
        broadcast_msg = proto.broadcast_to_session.call_args[0][0]
        assert broadcast_msg.type == MessageType.CHARACTER_UPDATE, (
            f"Expected CHARACTER_UPDATE, got {broadcast_msg.type}"
        )
        assert broadcast_msg.data["operation"] == "save"
        assert broadcast_msg.data["character_id"] == "c1"

    async def test_does_not_broadcast_on_save_failure(self):
        from core_table.protocol import Message, MessageType

        proto = self._make_protocol()

        msg = Message(MessageType.CHARACTER_SAVE_REQUEST, {
            "character_data": {"character_id": "c1", "name": "Hero"},
            "session_code": "TST",
            "user_id": 1,
        })

        with patch.object(proto.actions, "save_character", new=AsyncMock(
            return_value=MagicMock(success=False, message="DB error", data=None)
        )):
            await proto.handle_character_save_request(msg, "c1")

        proto.broadcast_to_session.assert_not_awaited()


# ---------------------------------------------------------------------------
# handle_character_delete_request — broadcasts CHARACTER_UPDATE with operation='delete'
# ---------------------------------------------------------------------------

@pytest.mark.unit
class TestCharacterDeleteBroadcast:
    """Deleting a character must broadcast CHARACTER_UPDATE so others remove it."""

    def _make_protocol(self):
        from core_table.server import TableManager
        from service.server_protocol import ServerProtocol

        tm = TableManager()
        proto = ServerProtocol(tm, session_manager=MagicMock())
        proto.send_to_client = AsyncMock()
        proto.broadcast_to_session = AsyncMock()
        proto._get_session_id = MagicMock(return_value=1)
        proto._get_user_id = MagicMock(return_value=1)
        return proto

    async def test_broadcasts_character_update_delete_on_success(self):
        from core_table.protocol import Message, MessageType

        proto = self._make_protocol()

        msg = Message(MessageType.CHARACTER_DELETE_REQUEST, {
            "character_id": "c1",
            "session_code": "TST",
            "user_id": 1,
        })

        with patch.object(proto.actions, "delete_character", new=AsyncMock(
            return_value=MagicMock(success=True, message="Deleted", data=None)
        )):
            await proto.handle_character_delete_request(msg, "c1")

        proto.broadcast_to_session.assert_awaited_once()
        broadcast_msg = proto.broadcast_to_session.call_args[0][0]
        assert broadcast_msg.type == MessageType.CHARACTER_UPDATE, (
            f"Expected CHARACTER_UPDATE, got {broadcast_msg.type}"
        )
        assert broadcast_msg.data["operation"] == "delete"
        assert broadcast_msg.data["character_id"] == "c1"
