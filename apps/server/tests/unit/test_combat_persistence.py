import json
from typing import Any

import pytest
from core_table.combat import CombatState
from database.crud import load_active_combat_encounter
from database.models import CombatActionJournal, CombatEncounter, GameSession
from service.combat_persistence_service import CombatPersistenceService
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import sessionmaker


@pytest.mark.unit
def test_combat_action_sequence_is_unique_per_encounter_and_requester(
    test_db,
    test_game_session,
):
    encounter = CombatEncounter(
        encounter_id="encounter-1",
        session_id=test_game_session.id,
        table_id="table-1",
        phase="active",
    )
    test_db.add(encounter)
    test_db.flush()

    def action(requester_key: str) -> CombatActionJournal:
        return CombatActionJournal(
            encounter_id=encounter.encounter_id,
            requester_key=requester_key,
            sequence_id=1_750_000_000_000,
            actor_id="actor-1",
            command_type="attack",
            command_payload_json=json.dumps({"commands": [{"type": "attack"}]}),
            result_payload_json=json.dumps({"accepted": True}),
            state_before_json=json.dumps({"combatants": []}),
            state_after_hash="state-hash",
            state_version=1,
            created_by=test_game_session.owner_id,
        )

    test_db.add(action("user:1"))
    test_db.commit()

    test_db.add(action("user:1"))
    with pytest.raises(IntegrityError):
        test_db.commit()
    test_db.rollback()

    test_db.add(action("user:2"))
    test_db.commit()
    assert test_db.query(CombatActionJournal).count() == 2


@pytest.mark.unit
def test_combat_snapshot_starts_at_version_zero(test_db, test_game_session):
    encounter = CombatEncounter(
        encounter_id="encounter-2",
        session_id=test_game_session.id,
        table_id="table-1",
    )
    test_db.add(encounter)
    test_db.commit()

    assert encounter.state_version == 0


@pytest.mark.unit
def test_accepted_command_atomically_updates_snapshot_and_journal(
    test_db,
    test_game_session,
):
    service = CombatPersistenceService(
        sessionmaker(bind=test_db.get_bind(), expire_on_commit=False)
    )
    state_before = _state("combat-atomic", hp=20)
    state_after = _state("combat-atomic", hp=15)

    persisted = service.persist_accepted(
        session_code=test_game_session.session_code,
        requester_key="user:1",
        sequence_id=42,
        actor_id="actor-1",
        command_type="attack",
        command_payload={"commands": [{"type": "attack"}]},
        result_payload={
            "accepted": True,
            "sequence_id": 42,
            "combat": state_after,
        },
        state_before=state_before,
        state_after=state_after,
        created_by=test_game_session.owner_id,
    )

    test_db.expire_all()
    encounter = test_db.query(CombatEncounter).filter_by(
        encounter_id="combat-atomic"
    ).one()
    action = test_db.query(CombatActionJournal).one()
    assert persisted.state_version == 1
    assert persisted.result["state_version"] == 1
    assert persisted.result["combat"]["state_version"] == 1
    assert encounter.state_version == 1
    assert json.loads(encounter.combatants_json)[0]["hp"] == 15
    assert action.state_version == 1
    assert json.loads(action.state_before_json)["combatants"][0]["hp"] == 20

    restored_data = load_active_combat_encounter(
        test_db,
        test_game_session.session_code,
    )
    assert restored_data is not None
    restored = CombatState.from_dict(restored_data)
    assert restored.state_version == 1
    assert restored.combatants[0].hp == 15


@pytest.mark.unit
def test_duplicate_command_returns_stored_result_without_advancing_snapshot(
    test_db,
    test_game_session,
):
    service = CombatPersistenceService(
        sessionmaker(bind=test_db.get_bind(), expire_on_commit=False)
    )
    arguments: dict[str, Any] = {
        "session_code": test_game_session.session_code,
        "requester_key": "user:1",
        "sequence_id": 42,
        "actor_id": "actor-1",
        "command_type": "attack",
        "command_payload": {"commands": [{"type": "attack"}]},
        "result_payload": {"accepted": True, "sequence_id": 42},
        "state_before": _state("combat-duplicate", hp=20),
        "state_after": _state("combat-duplicate", hp=15),
        "created_by": test_game_session.owner_id,
    }

    first = service.persist_accepted(**arguments)
    arguments["state_after"] = _state("combat-duplicate", hp=1)
    duplicate = service.persist_accepted(**arguments)

    test_db.expire_all()
    encounter = test_db.query(CombatEncounter).filter_by(
        encounter_id="combat-duplicate"
    ).one()
    assert first.duplicate is False
    assert duplicate.duplicate is True
    assert duplicate.result == first.result
    assert encounter.state_version == 1
    assert json.loads(encounter.combatants_json)[0]["hp"] == 15
    assert test_db.query(CombatActionJournal).count() == 1


@pytest.mark.unit
def test_last_action_returns_newest_journal_entry(
    test_db,
    test_game_session,
):
    encounter = CombatEncounter(
        encounter_id="combat-last-action",
        session_id=test_game_session.id,
        table_id="table-1",
        phase="active",
    )
    test_db.add(encounter)
    test_db.flush()

    for version, command_type, hp in (
        (1, "attack", 20),
        (2, "dm_set_hp", 15),
    ):
        test_db.add(CombatActionJournal(
            encounter_id=encounter.encounter_id,
            requester_key="user:1",
            sequence_id=version,
            actor_id="actor-1",
            command_type=command_type,
            command_payload_json=json.dumps({"commands": [{"type": command_type}]}),
            result_payload_json=json.dumps({"accepted": True}),
            state_before_json=json.dumps(_state(encounter.encounter_id, hp=hp)),
            state_after_hash=f"state-{version}",
            state_version=version,
            created_by=test_game_session.owner_id,
        ))
    test_db.commit()

    service = CombatPersistenceService(
        sessionmaker(bind=test_db.get_bind(), expire_on_commit=False)
    )

    entry = service.last_action(encounter.encounter_id)

    assert entry is not None
    assert entry.command_type == "dm_set_hp"
    assert entry.state_version == 2
    assert entry.state_before["combatants"][0]["hp"] == 15


@pytest.mark.parametrize("commit", [False, True])
def test_borrowed_combat_transaction_leaves_commit_to_caller(test_db, test_game_session, commit):
    factory = sessionmaker(bind=test_db.get_bind(), expire_on_commit=False)
    service = CombatPersistenceService(factory)
    with factory() as db:
        result = service.stage_accepted(
            db, session_code=test_game_session.session_code, requester_key="user:1",
            sequence_id=99, actor_id="actor-1", command_type="attack",
            command_payload={"commands": [{"type": "attack"}]},
            result_payload={"accepted": True}, state_before={},
            state_after=_state("borrowed", hp=15), created_by=test_game_session.owner_id,
        )
        assert result.state_version == 1
        assert db.in_transaction()
        # A second resource belongs to the same outer acceptance boundary.
        session = db.get(type(test_game_session), test_game_session.id)
        assert session is not None
        session.name = "Accepted together"
        if commit:
            db.commit()
        else:
            db.rollback()

    test_db.expire_all()
    assert test_db.query(CombatEncounter).filter_by(encounter_id="borrowed").count() == int(commit)
    assert test_db.query(CombatActionJournal).filter_by(encounter_id="borrowed").count() == int(commit)
    assert (test_game_session.name == "Accepted together") is commit


def test_duplicate_staging_does_not_commit_unrelated_pending_changes(test_db, test_game_session):
    factory = sessionmaker(bind=test_db.get_bind(), expire_on_commit=False)
    service = CombatPersistenceService(factory)
    arguments: dict[str, Any] = dict(
        session_code=test_game_session.session_code, requester_key="user:1",
        sequence_id=99, actor_id="actor-1", command_type="attack",
        command_payload={}, result_payload={"accepted": True}, state_before={},
        state_after=_state("borrowed-duplicate", hp=15), created_by=test_game_session.owner_id,
    )
    original = service.persist_accepted(**arguments)
    with factory() as db:
        session = db.get(type(test_game_session), test_game_session.id)
        assert session is not None
        session.name = "Must roll back"
        duplicate = service.stage_accepted(db, **arguments)
        assert duplicate.duplicate and duplicate.result == original.result
        db.rollback()
    test_db.expire_all()
    assert test_game_session.name != "Must roll back"


@pytest.mark.parametrize("conflict", ["revision", "table", "session"])
def test_acceptance_rechecks_encounter_scope_and_source_revision(test_db, test_game_session, conflict):
    service = CombatPersistenceService(sessionmaker(bind=test_db.get_bind(), expire_on_commit=False))
    arguments: dict[str, Any] = dict(
        session_code=test_game_session.session_code, requester_key="user:1", sequence_id=1,
        actor_id="actor-1", command_type="attack", command_payload={},
        result_payload={"accepted": True}, state_before={},
        state_after=_state("scope-check", hp=20), created_by=test_game_session.owner_id,
    )
    service.persist_accepted(**arguments)
    arguments["sequence_id"] = 2
    if conflict == "revision":
        arguments["state_before"] = {"state_version": 0}
    elif conflict == "table":
        arguments["state_after"] = {**arguments["state_after"], "table_id": "other-table"}
    else:
        test_db.add(GameSession(name="Other session", session_code="OTHER", owner_id=test_game_session.owner_id))
        test_db.commit()
        arguments["session_code"] = "OTHER"
    with pytest.raises(ValueError):
        service.persist_accepted(**arguments)
    test_db.expire_all()
    assert test_db.query(CombatEncounter).one().state_version == 1
    assert test_db.query(CombatActionJournal).count() == 1


def _state(combat_id: str, hp: int) -> dict:
    return {
        "combat_id": combat_id,
        "session_id": "TEST01",
        "table_id": "table-1",
        "phase": "active",
        "round_number": 1,
        "current_turn_index": 0,
        "combatants": [{
            "combatant_id": "actor-1",
            "entity_id": "sprite-1",
            "hp": hp,
        }],
        "settings": {},
        "action_log": [],
        "state_hash": f"hp-{hp}",
    }
