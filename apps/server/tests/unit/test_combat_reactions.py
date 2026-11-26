"""Pending movement and reactions share the command snapshot/receipt boundary."""

from copy import deepcopy
from dataclasses import replace

import pytest
from core_table.combat import Combatant, CombatPhase, CombatState
from core_table.table import VirtualTable
from service.combat_actions import available_combat_actions
from service.combat_command_service import CombatCommandContext, CombatCommandService
from service.combat_engine import CombatEngine
from service.combat_movement import CombatMovementDraft
from service.combat_reactions import eligible_triggers


@pytest.fixture
def game():
    table = VirtualTable("Reactions", 500, 500)
    table.add_entity({"sprite_id": "mover", "position": [50, 25], "layer": "tokens"})
    table.add_entity({"sprite_id": "reactor", "position": [25, 25], "layer": "tokens"})
    mover = Combatant("moving", "mover", "Moving NPC", is_npc=True, hp=20, max_hp=20, movement_remaining=30)
    reactor = Combatant(
        "reacting",
        "reactor",
        "Player",
        controlled_by=["1"],
        hp=20,
        max_hp=20,
        actor_actions=[
            {
                "name": "Sword",
                "combat": {
                    "kind": "attack",
                    "effect": "attack_roll",
                    "damage_formula": "2",
                    "damage_type": "slashing",
                    "attack_bonus": 100,
                    "range_ft": 5.0,
                },
            }
        ],
    )
    state = CombatState(
        "reaction-encounter", "reactions", str(table.table_id), phase=CombatPhase.ACTIVE, combatants=[mover, reactor]
    )
    CombatEngine._active["reactions"] = state
    service = CombatCommandService()

    def context(role="owner", user=2, draft=None):
        draft = draft or CombatMovementDraft(table)

        def validate(_table, _sprite, old, new, path, _actor):
            return {
                "success": True,
                "movement_cost": 12.5,
                "path": path or [[old["x"], old["y"]], [new["x"], new["y"]]],
            }

        return CombatCommandContext(
            "reactions",
            str(user),
            role,
            user,
            table_lookup=draft.lookup,
            movement_draft=draft,
            validate_move=validate,
            move_sprite=lambda tid, sid, old, new, code: draft.move(
                tid, sid, old, new, code, allow_out_of_bounds=False
            ),
            mover_role=lambda uid: "owner" if uid == 2 else "player",
            resume_context=lambda role, uid: context(role, uid, draft),
        )

    yield table, state, mover, reactor, service, context
    CombatEngine._active.pop("reactions", None)


def move_payload(game):
    table = game[0]
    return {
        "type": "move",
        "actor_id": "moving",
        "table_id": str(table.table_id),
        "from_x": 50,
        "from_y": 25,
        "target_x": 175,
        "target_y": 25,
        "path": [[50, 25], [175, 25]],
    }


async def apply(game, command, context=None, sequence=1):
    result = await game[4].apply_async(
        game[4].parse_envelope({"sequence_id": sequence, "commands": [command]}), context or game[5]()
    )
    assert result.accepted, result.reason
    return result


def reply(game, use=True):
    state = CombatEngine.get_state("reactions")
    assert state is not None
    pending = state.pending_movement
    assert pending is not None
    return {
        "type": "resolve_opportunity_attack",
        "actor_id": "reacting",
        "target_id": "moving",
        "trigger_id": pending["triggers"][0]["trigger_id"],
        "use_reaction": use,
        **({"action_id": available_combat_actions(game[3])[0].action_id} if use else {}),
    }


async def test_movement_waits_without_spending_and_controlled_reaction_completes_it(game):
    table, state, mover, reactor, _, context = game
    pending = await apply(game, move_payload(game))
    assert pending.applied[0]["result"]["status"] == "awaiting_reactions"
    assert table.find_entity_by_sprite_id("mover").position == (50, 25)
    assert mover.movement_remaining == 30 and reactor.has_reaction
    assert CombatState.from_dict(deepcopy(state.to_dict())).pending_movement == state.pending_movement
    response = await apply(game, reply(game), context("player", 1), sequence=2)
    assert response.applied[0]["result"]["movement_status"] == "completed"
    assert mover.movement_remaining == 17.5 and not reactor.has_reaction
    assert state.pending_movement is None
    assert context  # movement is staged until protocol publication
    assert mover.hp <= 20


async def test_pass_does_not_spend_reaction(game):
    await apply(game, move_payload(game))
    result = await apply(game, reply(game, False), game[5]("player", 1), sequence=2)
    assert result.applied[0]["result"]["movement_status"] == "completed"
    assert game[3].has_reaction


@pytest.mark.parametrize(
    "change", [{"trigger_id": "foreign"}, {"actor_id": "moving"}, {"target_id": "reacting"}, {"action_id": "foreign"}]
)
async def test_forged_trigger_preserves_pending_state_and_resources(game, change):
    await apply(game, move_payload(game))
    before = deepcopy(game[1].to_dict())
    result = await game[4].apply_async(
        game[4].parse_envelope({"commands": [{**reply(game), **change}]}), game[5]("player", 1)
    )
    assert not result.accepted
    current = CombatEngine.get_state("reactions")
    assert current is not None and current.to_dict() == before


async def test_other_user_cannot_pass_another_players_reaction(game):
    await apply(game, move_payload(game))
    result = await game[4].apply_async(game[4].parse_envelope({"commands": [reply(game, False)]}), game[5]("player", 3))
    assert not result.accepted and "control" in result.reason


async def test_expiry_is_internal_and_does_not_consume_reaction(game, monkeypatch):
    await apply(game, move_payload(game))
    expiry = {"type": "expire_opportunity_attacks", "actor_id": "moving"}
    rejected = await game[4].apply_async(game[4].parse_envelope({"commands": [expiry]}), game[5]())
    assert not rejected.accepted
    state = CombatEngine.get_state("reactions")
    assert state is not None and state.pending_movement is not None
    deadline = state.pending_movement["expires_at"] + 1
    monkeypatch.setattr("service.combat_reactions.time.time", lambda: deadline)
    result = await apply(game, expiry, replace(game[5](), internal_expiry=True), sequence=3)
    assert result.applied[0]["result"]["movement_status"] == "completed"
    assert game[3].has_reaction


async def test_knocked_out_mover_cancels_movement(game, monkeypatch):
    await apply(game, move_payload(game))
    game[2].hp = 0
    result = await apply(game, reply(game, False), game[5]("player", 1), sequence=2)
    assert result.applied[0]["result"]["movement_status"] == "cancelled"
    assert game[2].movement_remaining == 30


async def test_membership_revocation_cancels_movement(game):
    await apply(game, move_payload(game))
    result = await apply(game, reply(game, False), replace(game[5]("player", 1), mover_role=lambda _: None), sequence=2)
    assert result.applied[0]["result"]["movement_status"] == "cancelled"
    assert game[2].movement_remaining == 30


async def test_mover_can_cancel_but_cannot_take_another_action_while_pending(game):
    await apply(game, move_payload(game))
    result = await game[4].apply_async(
        game[4].parse_envelope({"commands": [{"type": "end_turn", "actor_id": "moving"}]}), game[5]()
    )
    assert not result.accepted and "pending" in result.reason
    current = CombatEngine.get_state("reactions")
    assert current is not None and current.pending_movement is not None
    result = await apply(
        game,
        {
            "type": "cancel_pending_move",
            "actor_id": "moving",
            "movement_id": current.pending_movement["movement_id"],
        },
        sequence=2,
    )
    assert result.applied[0]["result"]["status"] == "cancelled"


def test_path_can_enter_and_leave_reach_and_disengage_suppresses_it(game):
    table, state, mover, *_ = game
    path = [[175, 25], [50, 25], [175, 25]]
    assert eligible_triggers(state, table, mover, path)
    mover.is_disengaging = True
    assert eligible_triggers(state, table, mover, path) == []


def test_friendly_and_incapacitated_reactors_do_not_trigger(game):
    table, state, mover, reactor, *_ = game
    reactor.is_npc = True
    assert eligible_triggers(state, table, mover, [[50, 25], [175, 25]]) == []
    reactor.is_npc = False
    reactor.hp = 0
    assert eligible_triggers(state, table, mover, [[50, 25], [175, 25]]) == []


async def test_public_view_never_exposes_pending_commands_or_other_actors_trigger_ids(game):
    from service.combat_state_presenter import CombatStatePresenter

    await apply(game, move_payload(game))
    spectator = CombatStatePresenter.for_client(game[1], "spectator", 3)
    peer = CombatStatePresenter.for_client(game[1], "player", 3)
    owner = CombatStatePresenter.for_client(game[1], "player", 1)
    assert spectator is not None and peer is not None and owner is not None
    assert set(spectator["pending_movement"]) == {"movement_id", "expires_at"}
    assert "reaction_prompts" not in spectator and "reaction_prompts" not in peer
    assert owner["reaction_prompts"][0]["trigger_id"] == game[1].pending_movement["triggers"][0]["trigger_id"]
    assert "requester_user_id" not in str(spectator)


async def test_persisted_window_survives_restart_and_duplicate_resolution_spends_once(game, monkeypatch):
    from database import crud, models
    from service.combat_persistence_service import CombatPersistenceService
    from sqlalchemy import create_engine
    from sqlalchemy.orm import sessionmaker
    from sqlalchemy.pool import StaticPool

    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    factory = sessionmaker(bind=engine)
    models.Base.metadata.create_all(engine)
    with factory() as db:
        db.add_all(
            [
                models.User(id=1, username="player", hashed_password="x"),
                models.User(id=2, username="dm", hashed_password="x"),
            ]
        )
        db.flush()
        session = models.GameSession(name="Game", session_code="reactions", owner_id=2)
        db.add(session)
        db.flush()
        crud.save_table_to_db(db, game[0], session.id)
    game[4]._persistence = CombatPersistenceService(factory)
    await apply(game, move_payload(game), sequence=41)
    with factory() as db:
        saved = crud.load_active_combat_encounter(db, "reactions")
        assert saved is not None
        assert saved["pending_movement"] is not None
    CombatEngine._active["reactions"] = CombatState.from_dict(saved)
    command = reply(game, False)
    context = game[5]("player", 1)
    accepted = await apply(game, command, context, sequence=42)
    duplicate = await apply(game, command, game[5]("player", 1), sequence=42)
    assert duplicate.duplicate and duplicate.applied == accepted.applied
    with factory() as db:
        saved = crud.load_active_combat_encounter(db, "reactions")
        assert saved is not None
        assert saved["pending_movement"] is None
        assert saved["combatants"][0]["movement_remaining"] == 17.5
        table, _ = crud.load_table_from_db(db, str(game[0].table_id))
        assert table is not None
        token = table.find_entity_by_sprite_id("mover")
        assert token is not None and token.position == (175, 25)
    engine.dispose()


async def test_persistence_failure_restores_window_and_spends_nothing(game):
    await apply(game, move_payload(game))
    current = CombatEngine.get_state("reactions")
    assert current is not None
    before = deepcopy(current.to_dict())

    class FailingPersistence:
        @staticmethod
        def requester_key(*_args):
            return "player"

        @staticmethod
        def find_result(*_args):
            return None

        @staticmethod
        def persist_accepted(**_kwargs):
            raise RuntimeError("storage failed")

    game[4]._persistence = FailingPersistence()
    result = await game[4].apply_async(
        game[4].parse_envelope({"sequence_id": 2, "commands": [reply(game, False)]}), game[5]("player", 1)
    )
    assert not result.accepted
    restored = CombatEngine.get_state("reactions")
    assert restored is not None and restored.to_dict() == before
    assert game[0].find_entity_by_sprite_id("mover").position == (50, 25)






@pytest.mark.parametrize('end',[(175,175),(25,175),(-125,125)])
def test_reach_exit_at_an_angle_does_not_lose_the_trigger_to_rounding(game,end):
    assert eligible_triggers(game[1],game[0],game[2],[[50,25],end])
