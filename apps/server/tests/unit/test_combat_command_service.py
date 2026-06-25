from unittest.mock import patch

from service.attack_resolver import AttackResult
from service.combat_command_service import (
    CombatCommandContext,
    CombatCommandService,
)
from service.combat_engine import CombatEngine


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
