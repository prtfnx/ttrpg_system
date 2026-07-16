import importlib
from unittest.mock import AsyncMock, MagicMock

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool


@pytest.fixture()
def context(monkeypatch):
    import database.database as dbmod
    import database.models as models

    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Session = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    monkeypatch.setattr(dbmod, "SessionLocal", Session)
    models.Base.metadata.create_all(bind=engine)

    db = Session()
    try:
        owner = models.User(username="owner", email="o@test", hashed_password="x")
        dm = models.User(username="dm", email="d@test", hashed_password="x")
        outsider = models.User(username="outsider", email="x@test", hashed_password="x")
        db.add_all([owner, dm, outsider])
        db.flush()
        session = models.GameSession(name="Game", session_code="DRAFT", owner_id=dm.id)
        db.add(session)
        db.flush()
        db.add(models.GamePlayer(
            session_id=session.id, user_id=owner.id, role="player"
        ))
        db.commit()
        ids = owner.id, dm.id, outsider.id, session.id
    finally:
        db.close()

    import managers.character_draft_manager as module
    importlib.reload(module)
    return module.get_character_draft_manager(), Session, ids


def draft_data(name=""):
    return {
        "name": name,
        "race": "",
        "class": "",
        "background": "",
        "strength": 8,
        "dexterity": 8,
        "constitution": 8,
        "intelligence": 8,
        "wisdom": 8,
        "charisma": 8,
        "skills": [],
    }


def final_data():
    return {
        **draft_data("Aria"),
        "race": "Elf",
        "class": "Wizard",
        "background": "Sage",
        "skills": ["Arcana"],
        "abilityScores": {
            "str": 8, "dex": 8, "con": 8, "int": 8, "wis": 8, "cha": 8,
        },
        "stats": {"hp": 6, "maxHp": 6, "ac": 10},
        "level": 1,
        "proficiencyBonus": 2,
    }


@pytest.mark.unit
class TestCharacterDraftLifecycle:
    def test_owner_resumes_and_dm_can_view_but_not_edit(self, context):
        manager, _, (owner, dm, outsider, session_id) = context
        created = manager.create_draft(session_id, owner, draft_data(), 0)
        assert created["success"] is True
        draft = created["draft"]

        saved = manager.update_draft(
            session_id, draft["draft_id"], owner, draft_data("Aria"), 2, draft["version"]
        )
        assert saved["success"] is True
        resumed = manager.load_draft(session_id, draft["draft_id"], owner)
        assert resumed["draft"]["draft_data"]["name"] == "Aria"
        assert resumed["draft"]["current_step"] == 2

        observed = manager.load_draft(
            session_id, draft["draft_id"], dm, bypass_owner_check=True
        )
        assert observed["success"] is True
        denied = manager.update_draft(
            session_id,
            draft["draft_id"],
            dm,
            draft_data("DM overwrite"),
            2,
            saved["draft"]["version"],
        )
        assert denied["success"] is False
        assert manager.load_draft(
            session_id, draft["draft_id"], outsider, bypass_owner_check=True
        )["success"] is False

    def test_version_conflict_returns_canonical_draft(self, context):
        manager, _, (owner, _, _, session_id) = context
        draft = manager.create_draft(session_id, owner, draft_data(), 0)["draft"]
        manager.update_draft(
            session_id, draft["draft_id"], owner, draft_data("First"), 1, 1
        )
        conflict = manager.update_draft(
            session_id, draft["draft_id"], owner, draft_data("Stale"), 1, 1
        )
        assert conflict["success"] is False
        assert conflict["error"] == "Version conflict"
        assert conflict["current_draft"]["draft_data"]["name"] == "First"

    def test_finalize_is_atomic_and_hides_active_draft(self, context):
        from database.models import CharacterDraft, SessionCharacter

        manager, Session, (owner, dm, _, session_id) = context
        draft = manager.create_draft(session_id, owner, draft_data("Aria"), 7)["draft"]
        result = manager.finalize_draft(
            session_id, draft["draft_id"], owner, draft["version"], final_data()
        )
        assert result["success"] is True
        assert result["draft_id"] == draft["draft_id"]
        assert result["character_id"] == draft["draft_id"]
        assert manager.list_drafts(session_id, owner)["drafts"] == []
        assert manager.list_drafts(
            session_id, dm, bypass_owner_check=True
        )["drafts"] == []

        db = Session()
        try:
            stored_draft = db.query(CharacterDraft).one()
            character = db.query(SessionCharacter).one()
            assert stored_draft.status == "converted"
            assert stored_draft.converted_character_id == character.character_id
            assert result["character_data"]["data"]["name"] == "Aria"
        finally:
            db.close()

    def test_invalid_finalization_leaves_draft_active(self, context):
        manager, Session, (owner, _, _, session_id) = context
        draft = manager.create_draft(session_id, owner, draft_data(), 0)["draft"]
        result = manager.finalize_draft(
            session_id, draft["draft_id"], owner, draft["version"], {"name": ""}
        )
        assert result["success"] is False
        assert manager.list_drafts(session_id, owner)["drafts"][0]["status"] == "active"


@pytest.mark.unit
async def test_protocol_broadcasts_draft_only_to_owner_clients_and_dm(context):
    from core_table.protocol import Message, MessageType
    from core_table.server import TableManager
    from service.server_protocol import ServerProtocol

    _, _, (owner, dm, outsider, session_id) = context
    session_manager = MagicMock()
    session_manager.client_info = {
        "owner-other": {"user_id": owner, "role": "player"},
        "dm-client": {"user_id": dm, "role": "owner"},
        "outsider": {"user_id": outsider, "role": "player"},
    }
    protocol = ServerProtocol(TableManager(), session_manager=session_manager)
    protocol.send_to_client = AsyncMock()
    protocol._get_session_id = MagicMock(return_value=session_id)
    protocol._get_user_id = MagicMock(return_value=owner)

    response = await protocol.handle_character_draft_create(
        Message(MessageType.CHARACTER_DRAFT_CREATE_REQUEST, {
            "draft_data": draft_data(), "current_step": 0,
        }),
        "owner-main",
    )

    assert response.type == MessageType.CHARACTER_DRAFT_CREATE_RESPONSE
    assert response.data["success"] is True
    targets = {call.args[1] for call in protocol.send_to_client.await_args_list}
    assert targets == {"owner-other", "dm-client"}
