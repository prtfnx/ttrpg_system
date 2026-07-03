from unittest.mock import AsyncMock, MagicMock, patch

from service.attack_resolver import AttackResult
from service.combat_command_service import (
    CombatCommandContext,
    CombatCommandService,
)
from service.combat_engine import CombatEngine
from service.combat_persistence_service import PersistedCombatCommand


def _context(role: str = "owner", user_id: int | None = 1) -> CombatCommandContext:
    return CombatCommandContext(
        session_code="cmd",
        client_id="c1",
        role=role,
        user_id=user_id,
    )


def _state():
    CombatEngine._active.pop("cmd", None)
    state = CombatEngine.start_combat(
        "cmd",
        "t1",
        [],
        combatants=[
            {
                "entity_id": "sprite-a",
                "name": "Ada",
                "hp": 20,
                "max_hp": 20,
                "armor_class": 12,
                "movement_speed": 30,
                "controlled_by": ["1"],
            },
            {
                "entity_id": "sprite-b",
                "name": "Borin",
                "hp": 20,
                "max_hp": 20,
                "armor_class": 10,
                "movement_speed": 30,
                "controlled_by": ["2"],
            },
        ],
    )
    state.current_turn_index = 0
    return state, state.combatants[0], state.combatants[1]


def test_player_command_executes_attack_for_owned_current_combatant():
    state, attacker, target = _state()
    service = CombatCommandService()
    envelope = service.parse_envelope({
        "sequence_id": 7,
        "commands": [{
            "type": "attack",
            "actor_id": attacker.combatant_id,
            "target_id": target.combatant_id,
            "damage_formula": "1d6",
        }],
    })

    with patch.object(CombatEngine, "apply_damage", return_value={"new_hp": 15}):
        with patch("service.attack_resolver.AttackResolver") as resolver:
            resolver.return_value.resolve_attack.return_value = AttackResult(hit=True, damage_dealt=5)
            result = service.apply(envelope, _context(role="player"))

    assert result.accepted is True
    assert result.sequence_id == 7
    assert result.applied[0]["action_type"] == "attack"
    assert CombatEngine.get_state("cmd").combatants[0].has_action is False


def test_command_accepts_token_ids_and_applies_to_combatants():
    state, attacker, target = _state()
    service = CombatCommandService()
    envelope = service.parse_envelope({
        "sequence_id": 8,
        "commands": [{
            "type": "attack",
            "actor_id": attacker.entity_id,
            "target_id": target.entity_id,
            "damage_formula": "1d6",
        }],
    })

    with patch.object(CombatEngine, "apply_damage", return_value={"new_hp": 15}):
        with patch("service.attack_resolver.AttackResolver") as resolver:
            resolver.return_value.resolve_attack.return_value = AttackResult(hit=True, damage_dealt=5)
            result = service.apply(envelope, _context(role="player"))

    assert result.accepted is True
    assert result.applied[0]["actor_id"] == attacker.combatant_id
    assert CombatEngine.get_state("cmd").combatants[0].has_action is False


def test_player_command_rejects_unowned_combatant():
    state, attacker, target = _state()
    service = CombatCommandService()
    envelope = service.parse_envelope({
        "sequence_id": 1,
        "commands": [{
            "type": "attack",
            "actor_id": attacker.combatant_id,
            "target_id": target.combatant_id,
        }],
    })

    result = service.apply(envelope, _context(role="player", user_id=99))

    assert result.accepted is False
    assert result.reason == "You do not control this combatant"
    assert result.failed_index == 0


def test_player_cannot_apply_dm_override_to_owned_actor():
    state, actor, _target = _state()
    service = CombatCommandService()
    envelope = service.parse_envelope({
        "sequence_id": 20,
        "commands": [{
            "type": "dm_override",
            "actor_id": actor.combatant_id,
            "override_type": "set_hp",
            "value": 5,
        }],
    })

    result = service.apply(envelope, _context(role="player"))

    assert result.accepted is False
    assert result.reason == "DMs only"
    assert CombatEngine.get_state("cmd").combatants[0].hp == 20


def test_dm_override_applies_outside_actor_turn():
    state, actor, target = _state()
    service = CombatCommandService()
    envelope = service.parse_envelope({
        "sequence_id": 21,
        "commands": [{
            "type": "dm_override",
            "actor_id": target.combatant_id,
            "override_type": "set_hp",
            "value": 7,
        }],
    })

    result = service.apply(envelope, _context(role="owner"))

    assert result.accepted is True
    assert result.applied[0]["result"] == {
        "override_type": "set_hp",
        "combatant_id": target.combatant_id,
        "hp": 7,
    }
    assert CombatEngine.get_state("cmd").combatants[1].hp == 7
    assert CombatEngine.get_state("cmd").get_current_combatant().combatant_id == actor.combatant_id


def test_dm_override_batch_updates_resources_atomically():
    state, actor, target = _state()
    target.temp_hp = 5
    target.has_action = False
    service = CombatCommandService()
    envelope = service.parse_envelope({
        "sequence_id": 22,
        "commands": [
            {
                "type": "dm_override",
                "actor_id": target.combatant_id,
                "override_type": "apply_damage",
                "value": 8,
                "damage_type": "force",
            },
            {
                "type": "dm_override",
                "actor_id": target.combatant_id,
                "override_type": "set_temp_hp",
                "value": 3,
            },
            {
                "type": "dm_override",
                "actor_id": target.combatant_id,
                "override_type": "grant_resource",
                "resource": "action",
            },
            {
                "type": "dm_override",
                "actor_id": target.combatant_id,
                "override_type": "grant_resource",
                "resource": "movement",
                "value": 10,
            },
        ],
    })

    result = service.apply(envelope, _context(role="owner"))

    updated = CombatEngine.get_state("cmd").combatants[1]
    assert result.accepted is True
    assert updated.hp == 17
    assert updated.temp_hp == 3
    assert updated.has_action is True
    assert updated.movement_remaining == 40


def test_invalid_dm_override_rolls_back_earlier_override():
    state, actor, target = _state()
    service = CombatCommandService()
    envelope = service.parse_envelope({
        "sequence_id": 23,
        "commands": [
            {
                "type": "dm_override",
                "actor_id": target.combatant_id,
                "override_type": "set_hp",
                "value": 4,
            },
            {
                "type": "dm_override",
                "actor_id": target.combatant_id,
                "override_type": "grant_resource",
            },
        ],
    })

    result = service.apply(envelope, _context(role="owner"))

    assert result.accepted is False
    assert result.failed_index == 1
    assert result.reason == "resource required"
    assert CombatEngine.get_state("cmd").combatants[1].hp == 20


def test_dm_override_updates_conditions_traits_and_surprise_atomically():
    state, _actor, target = _state()
    service = CombatCommandService()
    envelope = service.parse_envelope({
        "sequence_id": 24,
        "commands": [
            {
                "type": "dm_override",
                "actor_id": target.combatant_id,
                "override_type": "add_condition",
                "condition_type": "poisoned",
                "duration": 2,
                "source": "trap",
            },
            {
                "type": "dm_override",
                "actor_id": target.combatant_id,
                "override_type": "set_damage_traits",
                "resistances": ["fire"],
                "vulnerabilities": ["cold"],
                "immunities": ["poison"],
            },
            {
                "type": "dm_override",
                "actor_id": target.combatant_id,
                "override_type": "set_surprised",
                "surprised": True,
            },
        ],
    })

    result = service.apply(envelope, _context(role="owner"))

    updated = CombatEngine.get_state("cmd").combatants[1]
    assert result.accepted is True
    assert updated.conditions[0].condition_type.value == "poisoned"
    assert updated.conditions[0].duration_remaining == 2
    assert updated.conditions[0].source == "trap"
    assert updated.damage_resistances == ["fire"]
    assert updated.damage_vulnerabilities == ["cold"]
    assert updated.damage_immunities == ["poison"]
    assert updated.surprised is True


def test_dm_override_removes_condition_from_selected_combatant():
    state, _actor, target = _state()
    CombatEngine.add_condition("cmd", target.combatant_id, "prone")
    service = CombatCommandService()
    envelope = service.parse_envelope({
        "sequence_id": 25,
        "commands": [{
            "type": "dm_override",
            "actor_id": target.combatant_id,
            "override_type": "remove_condition",
            "condition_type": "prone",
        }],
    })

    result = service.apply(envelope, _context(role="owner"))

    assert result.accepted is True
    assert CombatEngine.get_state("cmd").combatants[1].conditions == []


def test_invalid_condition_rolls_back_earlier_trait_override():
    state, _actor, target = _state()
    service = CombatCommandService()
    envelope = service.parse_envelope({
        "sequence_id": 26,
        "commands": [
            {
                "type": "dm_override",
                "actor_id": target.combatant_id,
                "override_type": "set_damage_traits",
                "resistances": ["fire"],
            },
            {
                "type": "dm_override",
                "actor_id": target.combatant_id,
                "override_type": "add_condition",
                "condition_type": "not-a-condition",
            },
        ],
    })

    result = service.apply(envelope, _context(role="owner"))

    assert result.accepted is False
    assert result.failed_index == 1
    assert result.reason == "Unknown condition: not-a-condition"
    assert CombatEngine.get_state("cmd").combatants[1].damage_resistances == []


def test_player_rolls_owned_initiative_outside_their_turn():
    state, _actor, target = _state()
    service = CombatCommandService()
    envelope = service.parse_envelope({
        "sequence_id": 27,
        "commands": [{
            "type": "roll_initiative",
            "actor_id": target.combatant_id,
        }],
    })

    result = service.apply(envelope, _context(role="player", user_id=2))

    assert result.accepted is True
    assert result.applied[0]["result"]["combatant_id"] == target.combatant_id
    assert CombatEngine.get_state("cmd").combatants[1].initiative is not None


def test_player_cannot_roll_unowned_initiative():
    state, _actor, target = _state()
    service = CombatCommandService()
    envelope = service.parse_envelope({
        "sequence_id": 28,
        "commands": [{
            "type": "roll_initiative",
            "actor_id": target.combatant_id,
        }],
    })

    result = service.apply(envelope, _context(role="player", user_id=99))

    assert result.accepted is False
    assert result.reason == "You do not control this combatant"
    assert target.initiative is None


def test_dm_sets_initiative_and_removes_combatant_outside_turn():
    state, _actor, target = _state()
    service = CombatCommandService()
    set_result = service.apply(service.parse_envelope({
        "sequence_id": 29,
        "commands": [{
            "type": "set_initiative",
            "actor_id": target.combatant_id,
            "initiative": 18,
        }],
    }), _context(role="owner"))

    remove_result = service.apply(service.parse_envelope({
        "sequence_id": 30,
        "commands": [{
            "type": "remove_combatant",
            "actor_id": target.combatant_id,
        }],
    }), _context(role="owner"))

    assert set_result.accepted is True
    assert set_result.applied[0]["result"]["value"] == 18
    assert remove_result.accepted is True
    assert len(CombatEngine.get_state("cmd").combatants) == 1


def test_dm_skip_turn_requires_current_actor_and_advances_turn():
    state, actor, target = _state()
    service = CombatCommandService()
    wrong_actor = service.apply(service.parse_envelope({
        "sequence_id": 31,
        "commands": [{
            "type": "skip_turn",
            "actor_id": target.combatant_id,
        }],
    }), _context(role="owner"))

    accepted = service.apply(service.parse_envelope({
        "sequence_id": 32,
        "commands": [{
            "type": "skip_turn",
            "actor_id": actor.combatant_id,
        }],
    }), _context(role="owner"))

    assert wrong_actor.accepted is False
    assert wrong_actor.reason == "Can only skip the current turn"
    assert accepted.accepted is True
    assert (
        CombatEngine.get_state("cmd").get_current_combatant().combatant_id
        == target.combatant_id
    )


def test_player_cannot_remove_combatant():
    state, actor, _target = _state()
    service = CombatCommandService()
    envelope = service.parse_envelope({
        "sequence_id": 33,
        "commands": [{
            "type": "remove_combatant",
            "actor_id": actor.combatant_id,
        }],
    })

    result = service.apply(envelope, _context(role="player", user_id=1))

    assert result.accepted is False
    assert result.reason == "DMs only"
    assert len(CombatEngine.get_state("cmd").combatants) == 2


def test_command_batch_rolls_back_when_later_command_fails():
    state, actor, _target = _state()
    service = CombatCommandService()
    envelope = service.parse_envelope({
        "sequence_id": 2,
        "commands": [
            {"type": "dash", "actor_id": actor.combatant_id},
            {"type": "attack", "actor_id": actor.combatant_id},
        ],
    })

    result = service.apply(envelope, _context(role="owner"))
    restored_actor = CombatEngine.get_state("cmd").combatants[0]

    assert result.accepted is False
    assert result.failed_index == 1
    assert result.reason == "target_id required"
    assert restored_actor.has_action is True
    assert restored_actor.movement_remaining == 30


async def test_planned_move_attack_end_turn_resolves_as_one_batch():
    state, actor, target = _state()
    move_sprite = AsyncMock(return_value={"success": True, "message": "ok"})
    service = CombatCommandService()
    envelope = service.parse_envelope({
        "sequence_id": 3,
        "commands": [
            {
                "type": "move",
                "actor_id": actor.entity_id,
                "table_id": "t1",
                "from_x": 0,
                "from_y": 0,
                "target_x": 64,
                "target_y": 0,
                "cost_ft": 10,
            },
            {
                "type": "attack",
                "actor_id": actor.combatant_id,
                "target_id": target.combatant_id,
                "damage_formula": "1d6",
            },
            {
                "type": "end_turn",
                "actor_id": actor.combatant_id,
            },
        ],
    })

    context = CombatCommandContext(
        session_code="cmd",
        client_id="c1",
        role="player",
        user_id=1,
        move_sprite=move_sprite,
        validate_move=lambda *_args: {
            "success": True,
            "movement_cost": 10,
            "opportunity_attack_triggers": [],
        },
    )
    with patch.object(CombatEngine, "apply_damage", return_value={"new_hp": 15}):
        with patch("service.attack_resolver.AttackResolver") as resolver:
            resolver.return_value.resolve_attack.return_value = AttackResult(
                hit=True,
                damage_dealt=5,
            )
            result = await service.apply_async(envelope, context)

    current_state = CombatEngine.get_state("cmd")
    assert result.accepted is True
    assert [item["action_type"] for item in result.applied] == [
        "move",
        "attack",
        "end_turn",
    ]
    assert current_state.combatants[0].movement_remaining == 20
    assert current_state.combatants[0].has_action is False
    assert current_state.get_current_combatant().combatant_id == target.combatant_id
    move_sprite.assert_awaited_once()


def test_planned_spell_consumes_action_and_spell_slot():
    state, caster, target = _state()
    caster.spell_slots = {1: 1}
    caster.spell_slots_max = {1: 1}
    service = CombatCommandService()
    envelope = service.parse_envelope({
        "sequence_id": 4,
        "commands": [{
            "type": "cast_spell",
            "actor_id": caster.combatant_id,
            "spell_name": "Magic Missile",
            "spell_level": 1,
            "target_ids": [target.combatant_id],
        }],
    })

    result = service.apply(envelope, _context(role="player"))

    current_caster = CombatEngine.get_state("cmd").combatants[0]
    assert result.accepted is True
    assert result.applied[0]["action_type"] == "cast_spell"
    assert current_caster.has_action is False
    assert current_caster.spell_slots[1] == 0


async def test_move_command_rejects_failed_validation_before_moving_token():
    state, actor, _target = _state()
    move_sprite = AsyncMock(return_value={"success": True, "message": "ok"})
    service = CombatCommandService()
    envelope = service.parse_envelope({
        "sequence_id": 6,
        "commands": [{
            "type": "move",
            "actor_id": actor.combatant_id,
            "table_id": "t1",
            "from_x": 0,
            "from_y": 0,
            "target_x": 64,
            "target_y": 0,
            "cost_ft": 10,
        }],
    })

    result = await service.apply_async(envelope, CombatCommandContext(
        session_code="cmd",
        client_id="c1",
        role="player",
        user_id=1,
        move_sprite=move_sprite,
        validate_move=lambda *_args: {
            "success": False,
            "message": "Path blocked",
            "movement_cost": 10,
        },
    ))

    assert result.accepted is False
    assert result.reason == "Path blocked"
    assert CombatEngine.get_state("cmd").combatants[0].movement_remaining == 30
    move_sprite.assert_not_awaited()


async def test_move_command_returns_opportunity_attack_warning_before_moving_token():
    state, actor, target = _state()
    move_sprite = AsyncMock(return_value={"success": True, "message": "ok"})
    service = CombatCommandService()
    envelope = service.parse_envelope({
        "sequence_id": 9,
        "commands": [{
            "type": "move",
            "actor_id": actor.combatant_id,
            "table_id": "t1",
            "from_x": 0,
            "from_y": 0,
            "target_x": 64,
            "target_y": 0,
            "cost_ft": 10,
        }],
    })

    result = await service.apply_async(envelope, CombatCommandContext(
        session_code="cmd",
        client_id="c1",
        role="player",
        user_id=1,
        move_sprite=move_sprite,
        validate_move=lambda *_args: {
            "success": True,
            "movement_cost": 10,
            "opportunity_attack_triggers": [{
                "combatant_id": target.combatant_id,
                "name": target.name,
            }],
        },
    ))

    assert result.accepted is False
    assert result.reason == "Opportunity attack warning"
    assert result.details["code"] == "opportunity_attack_warning"
    assert result.details["entity_id"] == actor.entity_id
    assert result.details["triggers"][0]["combatant_id"] == target.combatant_id
    assert CombatEngine.get_state("cmd").combatants[0].movement_remaining == 30
    move_sprite.assert_not_awaited()


async def test_move_command_applies_after_confirming_opportunity_attack_warning():
    state, actor, target = _state()
    move_sprite = AsyncMock(return_value={"success": True, "message": "ok"})
    service = CombatCommandService()
    envelope = service.parse_envelope({
        "sequence_id": 10,
        "commands": [{
            "type": "move",
            "actor_id": actor.combatant_id,
            "table_id": "t1",
            "from_x": 0,
            "from_y": 0,
            "target_x": 64,
            "target_y": 0,
            "cost_ft": 10,
            "confirm_opportunity_attacks": True,
        }],
    })

    result = await service.apply_async(envelope, CombatCommandContext(
        session_code="cmd",
        client_id="c1",
        role="player",
        user_id=1,
        move_sprite=move_sprite,
        validate_move=lambda *_args: {
            "success": True,
            "movement_cost": 10,
            "opportunity_attack_triggers": [{
                "combatant_id": target.combatant_id,
                "name": target.name,
            }],
        },
    ))

    assert result.accepted is True
    assert CombatEngine.get_state("cmd").combatants[0].movement_remaining == 20
    move_sprite.assert_awaited_once()


async def test_move_command_spends_movement_and_moves_token():
    state, actor, _target = _state()
    move_sprite = AsyncMock(return_value={"success": True, "message": "ok"})
    service = CombatCommandService()
    envelope = service.parse_envelope({
        "sequence_id": 4,
        "commands": [{
            "type": "move",
            "actor_id": actor.combatant_id,
            "table_id": "t1",
            "from_x": 0,
            "from_y": 0,
            "target_x": 64,
            "target_y": 0,
            "cost_ft": 1,
        }],
    })

    result = await service.apply_async(envelope, CombatCommandContext(
        session_code="cmd",
        client_id="c1",
        role="player",
        user_id=1,
        move_sprite=move_sprite,
        validate_move=lambda *_args: {"success": True, "movement_cost": 10},
    ))

    assert result.accepted is True
    assert CombatEngine.get_state("cmd").combatants[0].movement_remaining == 20
    assert result.applied[0]["result"]["cost_ft"] == 10
    assert result.applied[0]["result"]["declared_cost_ft"] == 1
    assert CombatEngine.get_state("cmd").action_log[-1].action_type == "move"
    assert CombatEngine.get_state("cmd").action_log[-1].state_before["movement_remaining"] == 30
    move_sprite.assert_awaited_once()


async def test_move_command_rolls_back_token_move_when_later_command_fails():
    state, actor, _target = _state()
    move_sprite = AsyncMock(return_value={"success": True, "message": "ok"})
    service = CombatCommandService()
    envelope = service.parse_envelope({
        "sequence_id": 5,
        "commands": [
            {
                "type": "move",
                "actor_id": actor.combatant_id,
                "table_id": "t1",
                "from_x": 0,
                "from_y": 0,
                "target_x": 64,
                "target_y": 0,
                "cost_ft": 10,
            },
            {"type": "attack", "actor_id": actor.combatant_id},
        ],
    })

    result = await service.apply_async(envelope, CombatCommandContext(
        session_code="cmd",
        client_id="c1",
        role="owner",
        user_id=1,
        move_sprite=move_sprite,
        validate_move=lambda *_args: {"success": True, "movement_cost": 10},
    ))
    restored_actor = CombatEngine.get_state("cmd").combatants[0]

    assert result.accepted is False
    assert result.failed_index == 1
    assert restored_actor.movement_remaining == 30
    assert move_sprite.await_count == 2
    assert move_sprite.await_args_list[1].args[2] == {"x": 64.0, "y": 0.0}
    assert move_sprite.await_args_list[1].args[3] == {"x": 0.0, "y": 0.0}


def test_end_turn_command_advances_to_next_combatant():
    state, actor, target = _state()
    service = CombatCommandService()
    envelope = service.parse_envelope({
        "sequence_id": 3,
        "commands": [{"type": "end_turn", "actor_id": actor.combatant_id}],
    })

    result = service.apply(envelope, _context(role="player"))

    assert result.accepted is True
    assert CombatEngine.get_state("cmd").get_current_combatant().combatant_id == target.combatant_id


def test_invalid_payload_is_rejected_before_application():
    service = CombatCommandService()

    try:
        service.parse_envelope({"sequence_id": 1, "commands": []})
    except Exception as exc:
        assert "commands" in str(exc)
    else:
        raise AssertionError("Expected validation error")


def test_accepted_command_is_persisted_with_before_and_after_snapshots():
    state, actor, _target = _state()
    persistence = MagicMock()
    persistence.requester_key.return_value = "user:1"
    persistence.find_result.return_value = None

    def persist(**kwargs):
        result = dict(kwargs["result_payload"])
        result["state_version"] = 1
        return PersistedCombatCommand(result=result, state_version=1)

    persistence.persist_accepted.side_effect = persist
    service = CombatCommandService(persistence=persistence)
    envelope = service.parse_envelope({
        "sequence_id": 14,
        "commands": [{"type": "dash", "actor_id": actor.combatant_id}],
    })

    result = service.apply(envelope, _context(role="player"))

    persisted = persistence.persist_accepted.call_args.kwargs
    assert result.accepted is True
    assert result.state_version == 1
    assert CombatEngine.get_state("cmd").state_version == 1
    assert persisted["state_before"]["combatants"][0]["has_action"] is True
    assert persisted["state_after"]["combatants"][0]["has_action"] is False
    assert persisted["command_type"] == "dash"
    assert persisted["requester_key"] == "user:1"


def test_duplicate_command_returns_stored_result_without_mutating_state():
    state, actor, _target = _state()
    persistence = MagicMock()
    persistence.requester_key.return_value = "user:1"
    persistence.find_result.return_value = PersistedCombatCommand(
        result={
            "accepted": True,
            "sequence_id": 15,
            "applied": [{"action_type": "dash", "actor_id": actor.combatant_id}],
            "combat": state.to_dict(),
            "state_version": 3,
        },
        state_version=3,
        duplicate=True,
    )
    service = CombatCommandService(persistence=persistence)
    envelope = service.parse_envelope({
        "sequence_id": 15,
        "commands": [{"type": "dash", "actor_id": actor.combatant_id}],
    })

    result = service.apply(envelope, _context(role="player"))

    assert result.accepted is True
    assert result.duplicate is True
    assert result.state_version == 3
    assert CombatEngine.get_state("cmd").combatants[0].has_action is True
    persistence.persist_accepted.assert_not_called()


async def test_persistence_failure_rolls_back_combat_and_token_movement():
    state, actor, _target = _state()
    move_sprite = AsyncMock(return_value={"success": True, "message": "ok"})
    persistence = MagicMock()
    persistence.requester_key.return_value = "user:1"
    persistence.find_result.return_value = None
    persistence.persist_accepted.side_effect = RuntimeError("database unavailable")
    service = CombatCommandService(persistence=persistence)
    envelope = service.parse_envelope({
        "sequence_id": 16,
        "commands": [{
            "type": "move",
            "actor_id": actor.combatant_id,
            "table_id": "t1",
            "from_x": 0,
            "from_y": 0,
            "target_x": 64,
            "target_y": 0,
            "cost_ft": 10,
        }],
    })

    result = await service.apply_async(
        envelope,
        CombatCommandContext(
            session_code="cmd",
            client_id="c1",
            role="player",
            user_id=1,
            move_sprite=move_sprite,
            validate_move=lambda *_args: {"success": True, "movement_cost": 10},
        ),
    )

    assert result.accepted is False
    assert result.reason == "Failed to persist combat command"
    assert CombatEngine.get_state("cmd").combatants[0].movement_remaining == 30
    assert move_sprite.await_count == 2
