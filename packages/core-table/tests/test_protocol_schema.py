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
        '{"type":"test","data":{}}',
        '{"type":"connection_status_request","data":{}}',
        '{"type":"connection_status_response","data":{}}',
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


@pytest.mark.parametrize(
    "message",
    [
        {
            "type": "new_table_request",
            "data": {"table_name": "Arena", "width": 2000, "height": 1200},
        },
        {"type": "table_request", "data": {"table_id": "table-1"}},
        {"type": "table_list_request", "data": {}},
        {"type": "table_active_request", "data": {}},
        {"type": "table_active_set", "data": {"table_id": "table-1"}},
        {
            "type": "table_update_request",
            "data": {
                "category": "table",
                "type": "table_update",
                "data": {"table_id": "table-1", "grid_enabled": False},
            },
        },
        {
            "type": "table_update_request",
            "data": {
                "category": "table",
                "type": "fog_update",
                "data": {
                    "table_id": "table-1",
                    "hide_rectangles": [[[0, 0], [10, 10]]],
                    "reveal_rectangles": [],
                },
            },
        },
        {"type": "table_scale", "data": {"table_id": "table-1", "scale": 1.5}},
        {
            "type": "table_move",
            "data": {"table_id": "table-1", "x_moved": -5, "y_moved": 10},
        },
        {
            "type": "table_settings_update",
            "data": {"table_id": "table-1", "snap_to_grid": False},
        },
    ],
)
def test_message_from_json_accepts_table_command_payloads(message):
    parsed = Message.from_json(json.dumps(message))

    assert parsed.type.value == message["type"]


@pytest.mark.parametrize(
    "message",
    [
        {
            "type": "new_table_request",
            "data": {"table_name": "Arena", "width": 10001, "height": 1200},
        },
        {"type": "table_request", "data": {"table_id": ""}},
        {"type": "table_list_request", "data": {"session_code": "spoofed"}},
        {"type": "table_active_request", "data": {"user_id": 999}},
        {
            "type": "table_active_set",
            "data": {"table_id": "table-1", "user_id": 999},
        },
        {
            "type": "table_update_request",
            "data": {
                "category": "sprite",
                "type": "table_update",
                "data": {"table_id": "table-1", "grid_enabled": False},
            },
        },
        {
            "type": "table_update_request",
            "data": {
                "category": "table",
                "type": "fog_update",
                "data": {
                    "table_id": "table-1",
                    "hide_rectangles": [[[0, 0], [10]]],
                    "reveal_rectangles": [],
                },
            },
        },
        {"type": "table_scale", "data": {"table_id": "table-1", "scale": 0}},
        {
            "type": "table_move",
            "data": {"table_id": "table-1", "x_moved": 0},
        },
        {"type": "table_settings_update", "data": {"table_id": "table-1"}},
    ],
)
def test_message_from_json_rejects_invalid_table_command_payloads(message):
    with pytest.raises(ValueError, match="Invalid protocol message"):
        Message.from_json(json.dumps(message))


@pytest.mark.parametrize(
    "message",
    [
        {
            "type": "wall_create",
            "data": {
                "table_id": "table-1",
                "wall_data": {
                    "x1": 0,
                    "y1": 10,
                    "x2": 100,
                    "y2": 10,
                    "wall_type": "window",
                    "blocks_movement": True,
                    "blocks_light": False,
                },
            },
        },
        {
            "type": "wall_update",
            "data": {
                "table_id": "table-1",
                "wall_id": "wall-1",
                "updates": {"door_state": "locked", "is_door": True},
            },
        },
        {"type": "wall_remove", "data": {"table_id": "table-1", "wall_id": "wall-1"}},
        {"type": "door_toggle", "data": {"table_id": "table-1", "wall_id": "wall-1"}},
    ],
)
def test_message_from_json_accepts_wall_command_payloads(message):
    parsed = Message.from_json(json.dumps(message))

    assert parsed.type.value == message["type"]


@pytest.mark.parametrize(
    "message",
    [
        {
            "type": "wall_create",
            "data": {
                "table_id": "table-1",
                "wall_data": {"x1": 0, "y1": 10, "x2": 100},
            },
        },
        {
            "type": "wall_create",
            "data": {
                "table_id": "table-1",
                "wall_data": {
                    "wall_id": "caller-controlled",
                    "x1": 0,
                    "y1": 10,
                    "x2": 100,
                    "y2": 10,
                },
            },
        },
        {
            "type": "wall_update",
            "data": {"table_id": "table-1", "wall_id": "wall-1", "updates": {}},
        },
        {
            "type": "wall_update",
            "data": {
                "table_id": "table-1",
                "wall_id": "wall-1",
                "updates": {"door_state": "ajar"},
            },
        },
        {
            "type": "wall_update",
            "data": {
                "table_id": "table-1",
                "wall_id": "wall-1",
                "updates": {"created_by": 99},
            },
        },
        {"type": "wall_remove", "data": {"table_id": "table-1", "wall_id": ""}},
        {"type": "door_toggle", "data": {"table_id": "table-1"}},
        {"type": "wall_batch_create", "data": {"table_id": "table-1", "walls": []}},
    ],
)
def test_message_from_json_rejects_invalid_wall_command_payloads(message):
    with pytest.raises(ValueError, match="Invalid protocol message"):
        Message.from_json(json.dumps(message))
