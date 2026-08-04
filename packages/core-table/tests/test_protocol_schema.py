import json
from pathlib import Path

from core_table.protocol import MessageType

SCHEMA_PATH = Path(__file__).parents[1] / "protocol" / "message.schema.json"


def test_message_type_schema_matches_python_enum():
    schema = json.loads(SCHEMA_PATH.read_text(encoding="utf-8"))
    type_schema = schema["properties"]["type"]

    assert type_schema["x-enum-varnames"] == [member.name for member in MessageType]
    assert type_schema["enum"] == [member.value for member in MessageType]
