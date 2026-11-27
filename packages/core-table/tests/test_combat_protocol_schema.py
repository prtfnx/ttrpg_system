"""Combat requests are validated before reaching their domain handlers."""

from copy import deepcopy

import pytest
from core_table.protocol import Message


def command():
    return {"type": "combat_command", "data": {"sequence_id": 42, "combat_id": "encounter",
        "expected_state_version": 3, "commands": [{"type": "dodge", "actor_id": "actor"}]}}


@pytest.mark.parametrize("identity", [0, 2**53 - 1])
def test_combat_command_accepts_safe_identities_and_optional_preconditions(identity):
    wire = command()
    wire["data"]["sequence_id"] = identity
    assert Message.from_dict(wire).data == wire["data"]
    assert Message.from_dict({"type": "combat_command", "data": {"commands": wire["data"]["commands"]}})


@pytest.mark.parametrize("patch", [
    {"sequence_id": True}, {"sequence_id": -1}, {"sequence_id": 2**53}, {"sequence_id": "42"},
    {"expected_state_version": -1}, {"expected_state_version": True}, {"combat_id": ""},
    {"commands": []}, {"commands": [{"type": "invented", "actor_id": "actor"}]},
    {"commands": [{"type": "dodge"}]}, {"commands": [{"type": "dodge", "actor_id": ""}]},
    {"commands": [{"type": "dodge", "actor_id": "actor", "user_id": 99}]},
    {"commands": [{"type": "dodge", "actor_id": "actor"}] * 51}, {"user_id": 99},
])
def test_combat_command_rejects_invalid_or_spoofed_payload(patch):
    wire = command()
    wire["data"].update(deepcopy(patch))
    with pytest.raises(ValueError, match="Invalid protocol message"):
        Message.from_dict(wire)


def test_missing_commands_is_not_defaulted_to_an_empty_executable_batch():
    with pytest.raises(ValueError):
        Message.from_dict({"type": "combat_command", "data": {"sequence_id": 42}})


@pytest.mark.parametrize("probe", [{"combat_id": "encounter", "sequence_id": 42},
    {"combat_id": "encounter", "sequence_id": 2**53 - 1}])
def test_state_query_accepts_a_bound_receipt_probe(probe):
    assert Message.from_dict({"type": "combat_state_request", "data": {"receipt_probe": probe}})
    assert Message.from_dict({"type": "combat_state_request", "data": {}})


@pytest.mark.parametrize("probe", [{"combat_id": "", "sequence_id": 1},
    {"combat_id": "encounter", "sequence_id": True}, {"combat_id": "encounter", "sequence_id": 2**53},
    {"combat_id": "encounter", "sequence_id": 42, "user_id": 99}, {"sequence_id": 42}])
def test_state_query_rejects_invalid_receipt_probe(probe):
    with pytest.raises(ValueError):
        Message.from_dict({"type": "combat_state_request", "data": {"receipt_probe": probe}})


def test_nested_batches_do_not_bypass_combat_command_validation():
    invalid = command()
    invalid["data"]["commands"] = []
    with pytest.raises(ValueError):
        Message.from_dict({"type": "batch_request", "data": {"messages": [invalid]}})


def combat_state():
    return {"combat_id": "encounter", "table_id": "table", "phase": "active", "round_number": 1,
        "current_turn_index": 0, "combatants": [{"combatant_id": "actor", "entity_id": "sprite"}]}


@pytest.mark.parametrize("combat", [None, combat_state(), {**combat_state(), "current_turn_index": -1}])
def test_combat_state_allows_empty_ended_and_role_filtered_views(combat):
    assert Message.from_dict({"type": "combat_state", "data": {"combat": combat}})


@pytest.mark.parametrize("receipt", [
    {"status": "accepted", "state_version": 1},
    {"status": "absent", "current_state_version": 1, "encounter_ended": True},
    {"status": "unavailable"},
])
def test_state_receipts_validate_each_outcome_independently(receipt):
    data = {"combat": None, "receipt": {"combat_id": "encounter", "sequence_id": 42, **receipt}}
    assert Message.from_dict({"type": "combat_state", "data": data})


@pytest.mark.parametrize("patch", [{"round_number": True}, {"current_turn_index": -2},
    {"combatants": [{"combatant_id": "actor", "entity_id": "sprite", "hp": "secret"}]},
    {"combatants": [{"combatant_id": "actor", "entity_id": "sprite", "controlled_by": "1"}]},
    {"pending_movement": {"movement_id": "move", "expires_at": 1, "command": {"type": "move"}}},
    {"state_version": -1}, {"phase": "unknown"}])
def test_combat_state_rejects_bad_render_fields_and_private_movement_payload(patch):
    with pytest.raises(ValueError):
        Message.from_dict({"type": "combat_state", "data": {"combat": {**combat_state(), **patch}}})


def test_recovery_results_allow_null_combat_and_the_resync_hint():
    for kind, result in [("action_result", {"accepted": True, "applied": []}),
                         ("action_rejected", {"accepted": False, "reason": "Did not commit"})]:
        assert Message.from_dict({"type": kind, "data": {**result, "sequence_id": 42,
            "combat": None, "resync_required": True}})


def test_receipt_status_and_metadata_cannot_be_mixed_or_spoofed():
    for receipt in [{"status": "accepted"}, {"status": "accepted", "state_version": True},
                    {"status": "unknown"}, {"status": "unavailable", "private": "value"}]:
        with pytest.raises(ValueError):
            Message.from_dict({"type": "combat_state", "data": {"combat": None,
                "receipt": {"combat_id": "encounter", "sequence_id": 42, **receipt}}})
