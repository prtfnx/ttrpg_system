"""Canonical wire definitions must follow the authoritative domain models."""

import json
from pathlib import Path

import pytest
from pydantic import ValidationError
from service.combat_command_service import CombatCommandEnvelope
from service.protocol.combat import CombatReceiptProbe

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
