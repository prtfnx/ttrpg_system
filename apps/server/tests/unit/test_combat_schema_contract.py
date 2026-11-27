"""Canonical wire definitions must follow the authoritative domain models."""

import json
from pathlib import Path

import pytest
from core_table.combat import Combatant, CombatPhase, CombatState
from core_table.protocol import Message, MessageType
from pydantic import ValidationError
from service.combat_actions import CombatActionDefinition, available_combat_actions
from service.combat_command_service import CombatCommandEnvelope
from service.combat_state_presenter import CombatStatePresenter
from service.protocol.combat import CombatReceiptProbe
from tests.unit.test_combat_reactions import game as game

SCHEMA = Path(__file__).resolve().parents[4] / "packages/core-table/protocol/message.schema.json"


@pytest.mark.parametrize("model", [CombatCommandEnvelope, CombatReceiptProbe])
def test_canonical_command_and_receipt_definitions_match_their_domain_models(model):
    canonical = json.loads(SCHEMA.read_text(encoding="utf-8"))["$defs"]
    expected = model.model_json_schema()
    for name, definition in expected.pop("$defs", {}).items():
        assert canonical[name] == definition, "Update the canonical combat schema and regenerate protocol bindings"
    assert canonical[model.__name__] == expected


def test_missing_command_list_is_rejected_before_application():
    with pytest.raises(ValidationError):
        CombatCommandEnvelope.model_validate({"sequence_id": 42})


def test_available_action_schema_matches_serialized_structured_mechanics():
    canonical = json.loads(SCHEMA.read_text(encoding="utf-8"))["$defs"]["availableCombatActionWire"]
    expected = CombatActionDefinition.model_json_schema()
    expected["properties"]["action_id"] = {"type": "string", "minLength": 1, "maxLength": 96}
    expected["required"] = list(expected["properties"])
    assert canonical == expected


@pytest.mark.parametrize("role", ["owner", "co_dm", "player", "trusted_player", "spectator"])
def test_real_role_projections_match_the_canonical_state_and_result_contract(role):
    actor = Combatant("actor", "sprite", name="Hero", controlled_by=["1"], hp=20, max_hp=20,
        actor_actions=[{"name": "Sword", "combat": {"kind": "attack", "effect": "attack_roll",
            "damage_formula": "1d6", "damage_type": "slashing", "range_ft": 5}}])
    assert available_combat_actions(actor)
    visible = Combatant("npc", "npc-token", name="NPC", is_npc=True, hp=10, max_hp=20)
    hidden = Combatant("hidden", "hidden-token", name="Private", is_npc=True, is_hidden=True, hp=20, max_hp=20)
    state = CombatState("encounter", "session", "table", phase=CombatPhase.ACTIVE,
        combatants=[actor, visible, hidden], current_turn_index=2)
    view = CombatStatePresenter.for_client(state, role, 1)
    assert Message.from_dict(Message(MessageType.COMBAT_STATE, {"combat": view}).to_dict())
    result = CombatStatePresenter.message_for_client(state, role, 1,
        {"accepted": True, "sequence_id": 42, "applied": [], "resync_required": True})
    assert Message.from_dict(Message(MessageType.ACTION_RESULT, result).to_dict())


@pytest.mark.parametrize("role", ["owner", "player", "spectator"])
async def test_real_pending_reaction_views_match_the_read_only_contract(game, role):
    from tests.unit.test_combat_reactions import apply, move_payload

    await apply(game, move_payload(game))
    view = CombatStatePresenter.for_client(game[1], role, 1)
    assert view is not None
    assert "command" not in view["pending_movement"]
    assert Message.from_dict(Message(MessageType.COMBAT_STATE, {"combat": view}).to_dict())
    if role == "spectator":
        assert "reaction_prompts" not in view
