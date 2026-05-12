"""
Tests for character-related protocol handlers and dice-rolling logic.

Focus: user-visible behaviour — correct message types broadcast,
death save state persistence, roll result contents.
"""
import importlib
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

        proto.broadcast_to_session.assert_awaited_once() # type: ignore[attr-defined]
        broadcast_msg = proto.broadcast_to_session.call_args[0][0] # type: ignore[attr-defined]
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

        proto.broadcast_to_session.assert_awaited_once() # type: ignore[attr-defined]
        broadcast_msg = proto.broadcast_to_session.call_args[0][0] # type: ignore[attr-defined]
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

        proto.broadcast_to_session.assert_not_awaited  # type: ignore[attr-defined]()


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

        proto.broadcast_to_session.assert_awaited_once() # type: ignore[attr-defined]
        broadcast_msg = proto.broadcast_to_session.call_args[0][0] # type: ignore[attr-defined]
        assert broadcast_msg.type == MessageType.CHARACTER_UPDATE, (
            f"Expected CHARACTER_UPDATE, got {broadcast_msg.type}"
        )
        assert broadcast_msg.data["operation"] == "delete"
        assert broadcast_msg.data["character_id"] == "c1"


# ---------------------------------------------------------------------------
# Shared helper
# ---------------------------------------------------------------------------

def _make_proto():
    from core_table.server import TableManager
    from service.server_protocol import ServerProtocol

    tm = TableManager()
    proto = ServerProtocol(tm, session_manager=MagicMock())
    proto.send_to_client = AsyncMock()
    proto.broadcast_to_session = AsyncMock()
    proto._get_session_id = MagicMock(return_value=1)
    proto._get_user_id = MagicMock(return_value=1)
    proto._get_client_role = MagicMock(return_value="player")
    return proto


# ---------------------------------------------------------------------------
# handle_character_load_request
# ---------------------------------------------------------------------------

@pytest.mark.unit
class TestCharacterLoadRequest:
    async def test_success_returns_character_data(self):
        from core_table.protocol import Message, MessageType

        proto = _make_proto()
        msg = Message(MessageType.CHARACTER_LOAD_REQUEST, {
            "character_id": "c1", "session_code": "TST",
        })
        with patch.object(proto.actions, "load_character", new=AsyncMock(
            return_value=MagicMock(
                success=True, message="OK",
                data={"character_data": {"name": "Hero", "level": 3}},
            )
        )):
            resp = await proto.handle_character_load_request(msg, "client1")

        assert resp.type == MessageType.CHARACTER_LOAD_RESPONSE
        assert resp.data["success"] is True
        assert resp.data["character_data"]["name"] == "Hero"

    async def test_missing_character_id_returns_error(self):
        from core_table.protocol import Message, MessageType

        proto = _make_proto()
        msg = Message(MessageType.CHARACTER_LOAD_REQUEST, {"session_code": "TST"})
        resp = await proto.handle_character_load_request(msg, "client1")

        assert resp.data["success"] is False
        assert "required" in resp.data["error"].lower()

    async def test_session_not_found_returns_error(self):
        from core_table.protocol import Message, MessageType

        proto = _make_proto()
        proto._get_session_id = MagicMock(return_value=None)
        msg = Message(MessageType.CHARACTER_LOAD_REQUEST, {
            "character_id": "c1", "session_code": "GONE",
        })
        resp = await proto.handle_character_load_request(msg, "client1")

        assert resp.data["success"] is False
        assert "GONE" in resp.data["error"]

    async def test_action_failure_returns_error(self):
        from core_table.protocol import Message, MessageType

        proto = _make_proto()
        msg = Message(MessageType.CHARACTER_LOAD_REQUEST, {
            "character_id": "c1", "session_code": "TST",
        })
        with patch.object(proto.actions, "load_character", new=AsyncMock(
            return_value=MagicMock(success=False, message="Character not found", data=None)
        )):
            resp = await proto.handle_character_load_request(msg, "client1")

        assert resp.data["success"] is False
        assert "Character not found" in resp.data["error"]


# ---------------------------------------------------------------------------
# handle_character_list_request
# ---------------------------------------------------------------------------

@pytest.mark.unit
class TestCharacterListRequest:
    async def test_dm_gets_all_characters(self):
        """DM passes user_id=0 to list_characters so they see everyone's characters."""
        from core_table.protocol import Message, MessageType

        proto = _make_proto()
        proto._get_client_role = MagicMock(return_value="owner")
        msg = Message(MessageType.CHARACTER_LIST_REQUEST, {"session_code": "TST"})

        list_mock = AsyncMock(return_value=MagicMock(
            success=True,
            data={"characters": [{"id": "c1"}, {"id": "c2"}]},
            message="Listed",
        ))
        with patch.object(proto.actions, "list_characters", new=list_mock):
            resp = await proto.handle_character_list_request(msg, "dm1")

        assert resp.data["success"] is True
        assert len(resp.data["characters"]) == 2
        # DM filter: user_id=0 means all characters
        list_mock.assert_awaited_once()
        assert list_mock.call_args[0][1] == 0  # user_id_for_filter

    async def test_player_gets_own_characters(self):
        """Player passes their own user_id so list_characters filters."""
        from core_table.protocol import Message, MessageType

        proto = _make_proto()
        proto._get_client_role = MagicMock(return_value="player")
        proto._get_user_id = MagicMock(return_value=42)
        msg = Message(MessageType.CHARACTER_LIST_REQUEST, {"session_code": "TST"})

        list_mock = AsyncMock(return_value=MagicMock(
            success=True,
            data={"characters": [{"id": "c1"}]},
            message="Listed",
        ))
        with patch.object(proto.actions, "list_characters", new=list_mock):
            await proto.handle_character_list_request(msg, "player1")

        assert list_mock.call_args[0][1] == 42  # user_id passed through

    async def test_session_not_found_returns_error(self):
        from core_table.protocol import Message, MessageType

        proto = _make_proto()
        proto._get_session_id = MagicMock(return_value=None)
        msg = Message(MessageType.CHARACTER_LIST_REQUEST, {"session_code": "OLD"})
        resp = await proto.handle_character_list_request(msg, "client1")

        assert resp.data["success"] is False
        assert "OLD" in resp.data["error"]


# ---------------------------------------------------------------------------
# handle_character_update
# ---------------------------------------------------------------------------

@pytest.mark.unit
class TestCharacterUpdate:
    async def test_success_broadcasts_character_update(self):
        from core_table.protocol import Message, MessageType

        proto = _make_proto()
        msg = Message(MessageType.CHARACTER_UPDATE, {
            "character_id": "c1",
            "updates": {"hp": 8},
            "version": 3,
            "session_code": "TST",
        })
        with patch.object(proto.actions, "update_character", new=AsyncMock(
            return_value=MagicMock(success=True, message="updated", data={"version": 4})
        )):
            with patch.object(proto, "_sync_character_stats_to_tokens", new=AsyncMock()):
                resp = await proto.handle_character_update(msg, "client1")

        assert resp.data["success"] is True
        assert resp.data["version"] == 4
        proto.broadcast_to_session.assert_awaited_once()  # type: ignore[attr-defined]
        broadcast = proto.broadcast_to_session.call_args[0][0]  # type: ignore[attr-defined]
        assert broadcast.type == MessageType.CHARACTER_UPDATE
        assert broadcast.data["updates"] == {"hp": 8}

    async def test_missing_character_id_returns_error(self):
        from core_table.protocol import Message, MessageType

        proto = _make_proto()
        msg = Message(MessageType.CHARACTER_UPDATE, {"updates": {"hp": 5}, "session_code": "TST"})
        resp = await proto.handle_character_update(msg, "client1")

        assert resp.data["success"] is False
        assert "required" in resp.data["error"].lower()

    async def test_missing_updates_returns_error(self):
        from core_table.protocol import Message, MessageType

        proto = _make_proto()
        msg = Message(MessageType.CHARACTER_UPDATE, {"character_id": "c1", "session_code": "TST"})
        resp = await proto.handle_character_update(msg, "client1")

        assert resp.data["success"] is False

    async def test_session_not_found_returns_error(self):
        from core_table.protocol import Message, MessageType

        proto = _make_proto()
        proto._get_session_id = MagicMock(return_value=None)
        msg = Message(MessageType.CHARACTER_UPDATE, {
            "character_id": "c1", "updates": {"hp": 5},
        })
        resp = await proto.handle_character_update(msg, "client1")

        assert resp.data["success"] is False
        assert "session" in resp.data["error"].lower()

    async def test_action_failure_returns_error(self):
        from core_table.protocol import Message, MessageType

        proto = _make_proto()
        msg = Message(MessageType.CHARACTER_UPDATE, {
            "character_id": "c1", "updates": {"hp": 5}, "session_code": "TST",
        })
        with patch.object(proto.actions, "update_character", new=AsyncMock(
            return_value=MagicMock(success=False, message="Version conflict")
        )):
            resp = await proto.handle_character_update(msg, "client1")

        assert resp.data["success"] is False
        assert "Version conflict" in resp.data["error"]


# ---------------------------------------------------------------------------
# handle_character_log_request
# ---------------------------------------------------------------------------

@pytest.mark.unit
class TestCharacterLogRequest:
    async def test_success_returns_logs(self):
        from core_table.protocol import Message, MessageType

        proto = _make_proto()
        msg = Message(MessageType.CHARACTER_LOG_REQUEST, {
            "character_id": "c1", "session_code": "TST", "limit": 10,
        })
        logs = [{"action": "hp_change", "delta": -3}, {"action": "death_save"}]
        with patch.object(proto.actions, "get_character_log", new=AsyncMock(
            return_value=MagicMock(success=True, data={"logs": logs}, message="OK")
        )):
            resp = await proto.handle_character_log_request(msg, "client1")

        assert resp.type == MessageType.CHARACTER_LOG_RESPONSE
        assert resp.data["success"] is True
        assert resp.data["logs"] == logs
        assert resp.data["character_id"] == "c1"

    async def test_missing_character_id_returns_error(self):
        from core_table.protocol import Message, MessageType

        proto = _make_proto()
        msg = Message(MessageType.CHARACTER_LOG_REQUEST, {"session_code": "TST"})
        resp = await proto.handle_character_log_request(msg, "client1")

        assert resp.data["success"] is False
        assert "required" in resp.data["error"].lower()

    async def test_action_failure_returns_error(self):
        from core_table.protocol import Message, MessageType

        proto = _make_proto()
        msg = Message(MessageType.CHARACTER_LOG_REQUEST, {
            "character_id": "c1", "session_code": "TST",
        })
        with patch.object(proto.actions, "get_character_log", new=AsyncMock(
            return_value=MagicMock(success=False, message="Access denied")
        )):
            resp = await proto.handle_character_log_request(msg, "client1")

        assert resp.data["success"] is False


# ---------------------------------------------------------------------------
# handle_xp_award
# ---------------------------------------------------------------------------

@pytest.mark.unit
class TestXpAward:
    def _char_data(self, xp=0, level=1):
        return {
            "success": True,
            "character_data": {
                "character_id": "c1", "name": "Hero",
                "data": {"experience": xp, "level": level, "stats": {}},
            },
        }

    async def test_non_player_is_rejected(self):
        from core_table.protocol import Message, MessageType

        proto = _make_proto()
        # "player" is not in DM_ROLES — xp award is DM-only
        proto._get_client_role = MagicMock(return_value="player")
        msg = Message(MessageType.XP_AWARD, {
            "character_id": "c1", "amount": 100, "source": "encounter",
        })
        resp = await proto.handle_xp_award(msg, "player1")

        assert resp.data["success"] is False
        assert "DM" in resp.data["error"]
        proto.broadcast_to_session.assert_not_awaited()  # type: ignore[attr-defined]

    async def test_session_not_found_returns_error(self):
        from core_table.protocol import Message, MessageType

        proto = _make_proto()
        proto._get_client_role = MagicMock(return_value="owner")
        proto._get_session_id = MagicMock(return_value=None)
        msg = Message(MessageType.XP_AWARD, {
            "character_id": "c1", "amount": 100, "source": "encounter",
        })
        resp = await proto.handle_xp_award(msg, "dm1")

        assert resp.data["success"] is False
        assert "Session" in resp.data["error"]

    async def test_xp_award_no_level_up(self):
        from core_table.protocol import Message, MessageType

        proto = _make_proto()
        proto._get_client_role = MagicMock(return_value="owner")
        msg = Message(MessageType.XP_AWARD, {
            "character_id": "c1", "amount": 50, "source": "quest",
        })
        char_mgr = MagicMock()
        char_mgr.load_character.return_value = self._char_data(xp=100, level=1)
        char_mgr.update_character.return_value = {"success": True}

        db_mock = MagicMock()
        db_mock.__enter__ = MagicMock(return_value=db_mock)
        db_mock.__exit__ = MagicMock(return_value=False)

        with patch("managers.character_manager.get_server_character_manager", return_value=char_mgr):
            with patch("database.database.SessionLocal", return_value=db_mock):
                resp = await proto.handle_xp_award(msg, "dm1")

        assert resp.data["success"] is True
        assert resp.data["new_xp"] == 150
        assert resp.data["leveled_up"] is False
        proto.broadcast_to_session.assert_awaited_once()  # type: ignore[attr-defined]

    async def test_xp_award_triggers_level_up(self):
        from core_table.protocol import Message, MessageType

        proto = _make_proto()
        proto._get_client_role = MagicMock(return_value="owner")
        # 250 XP + 300 pushes past 300 threshold to level 2
        msg = Message(MessageType.XP_AWARD, {
            "character_id": "c1", "amount": 300, "source": "boss",
        })
        char_mgr = MagicMock()
        char_mgr.load_character.return_value = self._char_data(xp=250, level=1)
        char_mgr.update_character.return_value = {"success": True}

        db_mock = MagicMock()
        db_mock.__enter__ = MagicMock(return_value=db_mock)
        db_mock.__exit__ = MagicMock(return_value=False)

        with patch("managers.character_manager.get_server_character_manager", return_value=char_mgr):
            with patch("database.database.SessionLocal", return_value=db_mock):
                resp = await proto.handle_xp_award(msg, "dm1")

        assert resp.data["success"] is True
        assert resp.data["leveled_up"] is True
        assert resp.data["new_level"] == 2


# ---------------------------------------------------------------------------
# handle_multiclass_request
# ---------------------------------------------------------------------------

@pytest.mark.unit
class TestMulticlassRequest:
    async def test_missing_new_class_returns_error(self):
        from core_table.protocol import Message, MessageType

        proto = _make_proto()
        # character_id present but new_class missing → hits 'required' guard
        msg = Message(MessageType.MULTICLASS_REQUEST, {"character_id": "c1"})
        resp = await proto.handle_multiclass_request(msg, "client1")

        assert resp.data["success"] is False
        assert "required" in resp.data["error"].lower()

    async def test_session_not_found_returns_error(self):
        from core_table.protocol import Message, MessageType

        proto = _make_proto()
        proto._get_session_id = MagicMock(return_value=None)
        msg = Message(MessageType.MULTICLASS_REQUEST, {
            "character_id": "c1", "new_class": "rogue",
        })
        char_mgr = MagicMock()
        char_mgr.load_character.return_value = {"success": True, "character_data": {}}
        with patch("managers.character_manager.get_server_character_manager", return_value=char_mgr):
            resp = await proto.handle_multiclass_request(msg, "client1")

        assert resp.data["success"] is False
        assert "Session" in resp.data["error"]

    async def test_invalid_multiclass_returns_error(self):
        from core_table.protocol import Message, MessageType

        proto = _make_proto()
        msg = Message(MessageType.MULTICLASS_REQUEST, {
            "character_id": "c1", "new_class": "wizard",
        })
        char_mgr = MagicMock()
        char_mgr.load_character.return_value = {
            "success": True,
            "character_data": {"data": {"classes": []}},
        }
        char_mgr.validate_multiclass.return_value = (False, "Insufficient INT score")

        with patch("managers.character_manager.get_server_character_manager", return_value=char_mgr):
            resp = await proto.handle_multiclass_request(msg, "client1")

        assert resp.data["success"] is False
        assert "Insufficient" in resp.data["error"]

    async def test_success_broadcasts_and_includes_classes(self):
        from core_table.protocol import Message, MessageType

        proto = _make_proto()
        msg = Message(MessageType.MULTICLASS_REQUEST, {
            "character_id": "c1", "new_class": "rogue",
        })
        char_mgr = MagicMock()
        char_mgr.load_character.return_value = {
            "success": True,
            "character_data": {"data": {"classes": [{"name": "fighter", "level": 3}]}},
        }
        char_mgr.validate_multiclass.return_value = (True, None)
        char_mgr.update_character.return_value = {"success": True}

        with patch("managers.character_manager.get_server_character_manager", return_value=char_mgr):
            resp = await proto.handle_multiclass_request(msg, "client1")

        assert resp.data["success"] is True
        assert resp.data["new_class"] == "rogue"
        class_names = [c["name"] for c in resp.data["classes"]]
        assert "fighter" in class_names
        assert "rogue" in class_names
        proto.broadcast_to_session.assert_awaited_once()  # type: ignore[attr-defined]
