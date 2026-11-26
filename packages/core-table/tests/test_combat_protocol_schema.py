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
