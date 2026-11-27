"""The payload generator follows canonical references and refuses schema drift."""

import json
from copy import deepcopy
from pathlib import Path

import pytest
from scripts.protocol_payload_types import combat_payload_types


def schema():
    return json.loads((Path(__file__).parents[1] / "protocol/message.schema.json").read_text(encoding="utf-8"))


def test_payload_generation_is_deterministic_and_preserves_closed_fields_and_nullability():
    canonical = schema()
    generated = combat_payload_types(canonical)
    assert generated == combat_payload_types(deepcopy(canonical))
    text = generated.decode("utf-8")
    assert 'export type CombatCommandType = "start_combat"' in text
    assert '"commands": Array<CombatCommand>;' in text
    assert '"combat": CombatStateWire | null;' in text
    assert '"status": "accepted";' in text
    assert '"state_version": number;' in text
    assert 'export type CombatMessage<' in text
    assert '"user_id"' not in text


def test_payload_generation_refuses_a_message_family_pointing_at_another_definition():
    canonical = schema()
    rule = next(rule for rule in canonical["allOf"]
                if rule.get("if", {}).get("properties", {}).get("type", {}).get("const") == "combat_command")
    rule["then"]["properties"]["data"]["$ref"] = "#/$defs/combatStateData"
    with pytest.raises(ValueError, match="mapping changed"):
        combat_payload_types(canonical)


def test_payload_generation_refuses_unhandled_schema_constructs():
    canonical = schema()
    canonical["$defs"]["CombatCommandEnvelope"] = {"allOf": [{"type": "object"}]}
    with pytest.raises(ValueError, match="Unsupported combat payload schema"):
        combat_payload_types(canonical)
