"""Rejected lifecycle transitions must not survive a database reconstruction."""
import copy

import pytest
from database.models import CombatActionJournal, CombatEncounter
from service.combat_command_service import CombatCommandContext, CombatCommandService
from service.combat_engine import CombatEngine
from service.combat_persistence_service import CombatPersistenceService
from sqlalchemy.orm import sessionmaker


@pytest.fixture
def lifecycle(test_db_engine, test_game_session, monkeypatch):
    factory = sessionmaker(bind=test_db_engine, expire_on_commit=False)
    monkeypatch.setattr("database.database.SessionLocal", factory)
    code = test_game_session.session_code
    context = CombatCommandContext(session_code=code, client_id="dm", role="owner",
                                   user_id=test_game_session.owner_id)
    persistence = CombatPersistenceService(factory)
    service = CombatCommandService(persistence=persistence)

    def command(sequence, kind, **fields):
        return service.parse_envelope({"sequence_id": sequence, "commands": [{
            "type": kind, "actor_id": "__dm__", **fields,
        }]})

    start = command(1, "start_combat", table_id="table", entity_ids=["one", "two"])
    CombatEngine._active.pop(code, None)
    try:
        yield factory, code, context, persistence, service, command, start
    finally:
        CombatEngine._active.pop(code, None)


def fail_journal(**_kwargs):
    raise RuntimeError("Injected journal failure")


async def test_rejected_start_cannot_be_restored_from_database(lifecycle, monkeypatch):
    factory, code, context, persistence, service, _, start = lifecycle
    monkeypatch.setattr(persistence, "persist_accepted", fail_journal)
    result = await service.apply_async(start, context)

    assert not result.accepted
    assert CombatEngine.get_state(code) is None
    with factory() as db:
        assert db.query(CombatEncounter).count() == 0
        assert db.query(CombatActionJournal).count() == 0
    assert CombatEngine.restore(code) is None


@pytest.mark.parametrize("transition", ["end_combat", "end_turn"])
async def test_rejected_end_or_round_preserves_committed_combat(lifecycle, monkeypatch, transition):
    factory, code, context, persistence, service, command, start = lifecycle
    assert (await service.apply_async(start, context)).accepted
    state = CombatEngine.get_state(code)
    assert state is not None
    if transition == "end_turn":
        current = state.get_current_combatant()
        assert current is not None
        assert (await service.apply_async(command(2, "end_turn", actor_id=current.combatant_id), context)).accepted
    state = CombatEngine.get_state(code)
    assert state is not None
    before = copy.deepcopy(state.to_dict())
    actor = state.get_current_combatant()
    assert actor is not None
    envelope = command(3, transition, actor_id=actor.combatant_id if transition == "end_turn" else "__dm__")
    monkeypatch.setattr(persistence, "persist_accepted", fail_journal)

    result = await service.apply_async(envelope, context)

    assert not result.accepted
    state = CombatEngine.get_state(code)
    assert state is not None
    assert state.to_dict() == before
    CombatEngine._active.pop(code)
    restored = CombatEngine.restore(code)
    assert restored is not None
    # Legacy hydration does not restore the optional start timestamp. Compare
    # every acceptance-owned field, including resources, round and version.
    durable = restored.to_dict()
    assert {key: value for key, value in durable.items() if key != "started_at"} == {
        key: value for key, value in before.items() if key != "started_at"
    }
    with factory() as db:
        row = db.query(CombatEncounter).one()
        assert row.ended_at is None and row.phase == "active"
        assert db.query(CombatActionJournal).count() == (2 if transition == "end_turn" else 1)


async def test_accepted_end_marks_snapshot_and_journal_in_one_commit(lifecycle):
    factory, code, context, _, service, command, start = lifecycle
    assert (await service.apply_async(start, context)).accepted
    result = await service.apply_async(command(2, "end_combat"), context)

    assert result.accepted and result.state_version == 2
    assert CombatEngine.get_state(code) is None
    with factory() as db:
        row = db.query(CombatEncounter).one()
        assert row.phase == "ended" and row.ended_at is not None
        assert row.state_version == 2
        assert db.query(CombatActionJournal).count() == 2
    assert CombatEngine.restore(code) is None
