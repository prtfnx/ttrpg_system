import json
from pathlib import Path

import pytest
from core_table.protocol import Message, MessageType

SCHEMA_PATH = Path(__file__).parents[1] / "protocol" / "message.schema.json"


def test_message_type_schema_matches_python_enum():
    schema = json.loads(SCHEMA_PATH.read_text(encoding="utf-8"))
    type_schema = schema["properties"]["type"]

    assert type_schema["x-enum-varnames"] == [member.name for member in MessageType]
    assert type_schema["enum"] == [member.value for member in MessageType]


def test_packaged_schema_matches_canonical_schema():
    packaged_schema = Path(__file__).parents[1] / "core_table" / "message.schema.generated.json"

    assert packaged_schema.read_bytes() == SCHEMA_PATH.read_bytes()


def test_message_from_json_validates_the_envelope():
    message = Message.from_json('{"type":"ping","data":{}}')

    assert message.type == MessageType.PING
    assert message.version == "0.1"


@pytest.mark.parametrize(
    "raw_message",
    [
        "[]",
        '{"type":"unknown","data":{}}',
        '{"type":"ping","data":[]}',
        '{"type":"ping","data":{},"unexpected":true}',
    ],
)
def test_message_from_json_rejects_invalid_envelopes(raw_message):
    with pytest.raises(ValueError, match="Invalid protocol message"):
        Message.from_json(raw_message)


def test_message_from_json_enforces_type_specific_payloads():
    with pytest.raises(ValueError, match="Invalid protocol message"):
        Message.from_json(
            '{"type":"player_status_response",'
            '"data":{"client_id":"client-1","status":"ready"}}'
        )
