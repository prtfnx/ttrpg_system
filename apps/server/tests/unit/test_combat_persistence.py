import json

import pytest
from database.models import CombatActionJournal, CombatEncounter
from sqlalchemy.exc import IntegrityError


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
