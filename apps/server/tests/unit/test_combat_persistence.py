import json

import pytest
from core_table.combat import CombatState
from database.crud import load_active_combat_encounter
from database.models import CombatActionJournal, CombatEncounter
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
    arguments = {
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
