"""Combat movement must not escape acceptance through an earlier table save."""
import asyncio
import copy
import json
import threading
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from core_table.dice import DiceEngine, DiceRollResult
from core_table.protocol import Message, MessageType
from core_table.server import TableManager
from core_table.session_rules import SessionRules
from database import crud, models
from service import combat_persistence_service as persistence_module
from service.combat_engine import CombatEngine
from service.combat_persistence_service import CombatPersistenceService
from service.protocol.base import ServerProtocol
from sqlalchemy.orm import sessionmaker


@pytest.fixture
def game(test_db, test_db_engine, test_game_session, monkeypatch):
    factory = sessionmaker(bind=test_db_engine, expire_on_commit=False)
    monkeypatch.setattr("database.database.SessionLocal", factory)
    code, owner = test_game_session.session_code, test_game_session.owner_id
    manager = TableManager(test_db)
    table = manager.create_table("Combat", 1000, 1000)
    table.grid_cell_px = 50
    hero = table.add_entity({"sprite_id": "hero", "position": [100, 100], "layer": "tokens",
                             "hp": 20, "max_hp": 20, "controlled_by": [owner]})
    enemy = table.add_entity({"sprite_id": "enemy", "position": [250, 100], "layer": "tokens", "hp": 20})
    crud.save_table_to_db(test_db, table, test_game_session.id)
    state = CombatEngine.start_combat(code, str(table.table_id), [], combatants=[
        {"entity_id": hero.sprite_id, "hp": 20, "max_hp": 20, "controlled_by": [str(owner)]},
        {"entity_id": enemy.sprite_id, "hp": 20, "max_hp": 20, "armor_class": 10},
    ])
    state.current_turn_index = next(i for i, member in enumerate(state.combatants) if member.entity_id == "hero")
    persistence = CombatPersistenceService(factory)
    saved = persistence.persist_accepted(
        session_code=code, requester_key=f"user:{owner}", sequence_id=1, actor_id=None,
        command_type="start_combat", command_payload={}, result_payload={"accepted": True},
        state_before={}, state_after=state.to_dict(), created_by=owner,
    )
    state.state_version = saved.state_version
    session = SimpleNamespace(session_code=code, game_session_db_id=test_game_session.id,
                              client_info={"dm": {"user_id": owner, "role": "owner"}})
    delivered = []

    async def send(message, client_id):
        delivered.append((message, client_id))

    proto = ServerProtocol(manager, session_manager=session, transport_send=send)
    proto.combat_persistence_service = persistence
    rules = SessionRules.defaults(code)
    rules.movement_mode = "free"
    proto._rules_cache[code] = (rules, "free_roam")
    proto.actions.move_sprite = AsyncMock(side_effect=AssertionError("Combat must not save a separate move"))
    monkeypatch.setattr(DiceEngine, "roll", staticmethod(lambda formula: DiceRollResult(
        total=30 if "d20" in formula else 3, rolls=[10] if "d20" in formula else [3],
        modifier=20 if "d20" in formula else 0, formula=formula,
    )))

    def move(start=100, target=150, **fields):
        return {"type": "move", "actor_id": hero.sprite_id, "table_id": str(table.table_id),
                "from_x": start, "from_y": 100, "target_x": target, "target_y": 100, **fields}

    def attack(**fields):
        return {"type": "attack", "actor_id": hero.sprite_id, "target_id": enemy.sprite_id,
                "table_id": str(table.table_id), "attack_bonus": 20, "damage_formula": "1d4", "range_ft": 5, **fields}

    async def command(commands, sequence=2):
        request = Message(MessageType.COMBAT_COMMAND, {"sequence_id": sequence, "commands": commands})
        await proto.handle_client(request, "dm")
        return next(message for message, client in reversed(delivered)
                    if client == "dm" and message.causation_id == request.message_id)

    try:
        yield SimpleNamespace(factory=factory, code=code, table=table, hero=hero, enemy=enemy,
                              proto=proto, state=state, move=move, attack=attack, command=command)
    finally:
        CombatEngine._active.pop(code, None)


def assert_rejected_unchanged(game, before):
    state = CombatEngine.get_state(game.code)
    assert state is not None and state.to_dict() == before
    assert game.hero.position == (100, 100)
    with game.factory() as db:
        assert db.query(models.Entity).filter_by(sprite_id="hero").one().position_x == 100
        assert db.query(models.CombatEncounter).one().state_version == 1
        assert db.query(models.CombatActionJournal).count() == 1
    game.proto.actions.move_sprite.assert_not_awaited()


async def test_rejected_later_action_never_writes_movement(game):
    before = copy.deepcopy(game.state.to_dict())
    response = await game.command([game.move(), game.attack(target_id="missing")])
    assert response.type == MessageType.ACTION_REJECTED and response.data["failed_index"] == 1
    assert_rejected_unchanged(game, before)


async def test_failure_after_staging_movement_rolls_back_journal_and_token(game, monkeypatch):
    before = copy.deepcopy(game.state.to_dict())
    stage = persistence_module.stage_combat_movements

    def fail(db, session_id, movements):
        stage(db, session_id, movements)
        assert db.query(models.Entity).filter_by(sprite_id="hero").one().position_x == 200
        assert db.query(models.CombatActionJournal).count() == 2
        raise RuntimeError("Failed after movement and journal flush")

    monkeypatch.setattr(persistence_module, "stage_combat_movements", fail)
    response = await game.command([game.move(target=200), game.attack()])
    assert response.type == MessageType.ACTION_REJECTED
    assert_rejected_unchanged(game, before)


async def test_multiple_moves_and_attack_commit_once_and_survive_restart(game):
    commands = [game.move(), game.move(start=150, target=200), game.attack()]
    response = await game.command(commands)
    assert response.type == MessageType.ACTION_RESULT, response.data
    assert response.data["state_version"] == 2
    assert response.data["applied"][2]["result"]["damage_dealt"] == 3
    assert game.hero.position == (200, 100)
    assert game.table.find_entity_by_sprite_id("hero") is game.hero
    with game.factory() as db:
        row = db.query(models.Entity).filter_by(sprite_id="hero").one()
        assert row.position_x == 200
        restored_table, success = crud.load_table_from_db(db, str(game.table.table_id))
        assert success and restored_table is not None
        restored_hero = restored_table.find_entity_by_sprite_id("hero")
        assert restored_hero is not None and restored_hero.position == (200, 100)
        assert db.query(models.CombatActionJournal).count() == 2
    replay = await game.command(commands)
    assert replay.type == MessageType.ACTION_RESULT and replay.data["duplicate"]
    assert game.hero.position == (200, 100)
    CombatEngine._active.pop(game.code)
    restored = CombatEngine.restore(game.code)
    assert restored is not None and restored.state_version == 2
    assert next(c for c in restored.combatants if c.entity_id == "enemy").hp == 17
    assert next(c for c in restored.combatants if c.entity_id == "hero").movement_remaining == 20


async def test_movement_does_not_overwrite_durable_stats_from_another_owner(game):
    with game.factory() as db:
        db.query(models.Entity).filter_by(sprite_id="hero").one().hp = 17
        db.commit()
    response = await game.command([game.move()])
    assert response.type == MessageType.ACTION_RESULT, response.data
    with game.factory() as db:
        row = db.query(models.Entity).filter_by(sprite_id="hero").one()
        assert (row.hp, row.position_x) == (17, 150)


async def test_stale_durable_position_cannot_be_overwritten_by_combat(game):
    with game.factory() as db:
        db.query(models.Entity).filter_by(sprite_id="hero").one().position_x = 125
        db.commit()
    response = await game.command([game.move()])
    assert response.type == MessageType.ACTION_REJECTED
    assert game.hero.position == (100, 100)
    with game.factory() as db:
        assert db.query(models.Entity).filter_by(sprite_id="hero").one().position_x == 125
        assert db.query(models.CombatActionJournal).count() == 1


async def test_translated_polygon_geometry_commits_with_its_anchor(game):
    game.hero.obstacle_type = "polygon"
    game.hero.obstacle_data = {"vertices": [[100, 100], [110, 100], [110, 110]]}
    with game.factory() as db:
        crud.save_table_to_db(db, game.table, db.query(models.GameSession).one().id)
    response = await game.command([game.move()])
    assert response.type == MessageType.ACTION_RESULT, response.data
    expected = {"vertices": [[150, 100], [160, 100], [160, 110]]}
    assert game.hero.obstacle_data == expected
    with game.factory() as db:
        row = db.query(models.Entity).filter_by(sprite_id="hero").one()
        assert row.position_x == 150 and json.loads(row.obstacle_data) == expected


@pytest.mark.parametrize("fields", [{"table_id": "foreign-table"}, {"target_x": 250}])
async def test_foreign_or_occupied_destination_rejects_without_effects(game, fields):
    before = copy.deepcopy(game.state.to_dict())
    response = await game.command([game.move(**fields)])
    assert response.type == MessageType.ACTION_REJECTED
    assert_rejected_unchanged(game, before)


async def test_cancelled_movement_keeps_table_and_session_ownership_until_publication(game, monkeypatch):
    started, release = threading.Event(), threading.Event()
    stage = persistence_module.stage_combat_movements

    def delayed(db, session_id, movements):
        stage(db, session_id, movements)
        started.set()
        assert release.wait(5)

    monkeypatch.setattr(persistence_module, "stage_combat_movements", delayed)
    task = asyncio.create_task(game.command([game.move()]))

    async def admitted():
        while not started.is_set():
            await asyncio.sleep(.001)

    try:
        await asyncio.wait_for(admitted(), 2)
        task.cancel()
        await asyncio.sleep(0)
        assert not task.done()
        assert game.proto._mutation_lock.locked()
        assert game.proto.table_manager.table_write_lock(str(game.table.table_id)).locked()
        assert game.hero.position == (100, 100)
        release.set()
        with pytest.raises(asyncio.CancelledError):
            await asyncio.wait_for(task, 2)
        assert game.hero.position == (150, 100)
        state = CombatEngine.get_state(game.code)
        assert state is not None and state.state_version == 2
    finally:
        release.set()
        await asyncio.gather(task, return_exceptions=True)
