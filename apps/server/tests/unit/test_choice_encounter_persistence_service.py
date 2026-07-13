import json

import pytest
from database.models import (
    Base,
    ChoiceEncounter,
    ChoiceEncounterEvent,
    GameSession,
    User,
)
from service.choice_encounter_persistence_service import (
    ChoiceEncounterPersistenceError,
    ChoiceEncounterPersistenceService,
)
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool


@pytest.fixture
def persistence():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    session_factory = sessionmaker(bind=engine)
    with session_factory() as db:
        owner = User(
            username="encounter-owner",
            email="encounter@example.com",
            hashed_password="not-used",
        )
        db.add(owner)
        db.flush()
        db.add(GameSession(
            name="Choice encounter test",
            session_code="TST",
            owner_id=owner.id,
            is_active=True,
        ))
        db.commit()
    yield ChoiceEncounterPersistenceService(session_factory), session_factory
    engine.dispose()


def _snapshot(*, phase="presenting", version=0):
    return {
        "encounter_id": "enc-1",
        "session_id": "TST",
        "table_id": "table-1",
        "title": "Crossroads",
        "description": "Choose a route",
        "phase": phase,
        "choices": [{"choice_id": "left", "text": "Go left"}],
        "participants": ["7"],
        "player_choices": {},
        "pending_rolls": {},
        "roll_results": [],
        "dm_notes": "The right path is trapped",
        "version": version,
    }


@pytest.mark.unit
def test_snapshot_round_trip_and_ordered_events(persistence):
    service, session_factory = persistence
    service.save_snapshot(
        session_code="TST",
        encounter=_snapshot(),
        event_type="EncounterStarted",
        actor_id="1",
        payload={"title": "Crossroads"},
        created_by=1,
    )
    choice_state = _snapshot(phase="awaiting_choice", version=1)
    choice_state["player_choices"] = {"7": "left"}
    service.save_snapshot(
        session_code="TST",
        encounter=choice_state,
        event_type="ChoiceSelected",
        actor_id="7",
        payload={"choice_id": "left"},
        created_by=1,
    )

    assert service.load_active("TST") == choice_state
    with session_factory() as db:
        stored = db.query(ChoiceEncounter).one()
        events = db.query(ChoiceEncounterEvent).order_by(ChoiceEncounterEvent.sequence).all()
        assert stored.version == 1
        assert json.loads(stored.choices_json)[0]["choice_id"] == "left"
        assert [(event.sequence, event.event_type) for event in events] == [
            (1, "EncounterStarted"),
            (2, "ChoiceSelected"),
        ]


@pytest.mark.unit
def test_completed_encounter_is_not_restored_as_active(persistence):
    service, _ = persistence
    service.save_snapshot(
        session_code="TST",
        encounter=_snapshot(phase="completed", version=1),
        event_type="EncounterEnded",
        actor_id="1",
        payload={},
        created_by=1,
    )

    assert service.load_active("TST") is None


@pytest.mark.unit
def test_missing_game_session_fails_instead_of_silently_losing_state(persistence):
    service, _ = persistence
    with pytest.raises(ChoiceEncounterPersistenceError, match="Active game session"):
        service.save_snapshot(
            session_code="MISSING",
            encounter=_snapshot(),
            event_type="EncounterStarted",
            actor_id="1",
            payload={},
        )
