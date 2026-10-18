import json
from pathlib import Path

import pytest
from core_table.protocol import Message, MessageType

SCHEMA_PATH = Path(__file__).parents[1] / "protocol" / "message.schema.json"
SPRITE_MUTATIONS = {"sprite_create", "sprite_remove", "sprite_move", "sprite_scale", "sprite_rotate", "sprite_update"}


@pytest.mark.parametrize("kind", sorted(SPRITE_MUTATIONS))
@pytest.mark.parametrize("field,value", [("timestamp", "missing"), ("timestamp", None), ("timestamp", True), ("timestamp", -1),
    ("message_id", "missing"), ("message_id", None), ("message_id", "")])
def test_sprite_mutations_require_original_time_and_nonempty_identity(kind, field, value):
    message = {"type": kind, "message_id": "original", "timestamp": 1, "data": {"table_id": "table", "sprite_id": "sprite"}}
    message["data"].update({
        "sprite_create": {"sprite_data": {"sprite_id": "sprite", "x": 1, "y": 1}},
        "sprite_move": {"from": {"x": 0, "y": 0}, "to": {"x": 1, "y": 1}},
        "sprite_scale": {"width": 10, "height": 10}, "sprite_rotate": {"rotation": 0},
    }.get(kind, {}))
    Message.from_dict(message)  # Keep invalid-payload errors from masking this boundary.
    if value == "missing":
        del message[field]
    else:
        message[field] = value
    with pytest.raises(ValueError, match=field):
        Message.from_dict(message)


@pytest.mark.parametrize("field", ["message_id", "correlation_id", "causation_id"])
def test_wire_identity_bounds_keep_response_envelope_reserve_bounded(field):
    with pytest.raises(ValueError, match="Invalid protocol message"):
        Message.from_json(json.dumps({"type": "ping", "data": {}, field: "x" * 129}))


def test_wire_serializer_is_compact_unicode_json_without_nonfinite_numbers():
    message = Message(MessageType.CUSTOM, {"text": "Привіт 😀", "points": [{"x": 1, "y": 2}]})
    wire = message.to_json()
    assert wire == json.dumps(message.to_dict(), ensure_ascii=False, allow_nan=False, separators=(",", ":"))
    assert "Привіт 😀" in wire
    assert Message.from_json(wire).data == message.data
    with pytest.raises(ValueError):
        Message(MessageType.CUSTOM, {"value": float("nan")}).to_json()


@pytest.mark.parametrize("issued", [None, True, -1, 9007199254740992])
def test_paint_creation_requires_a_bounded_original_intent_timestamp(issued):
    data = {"operation_id": "6ce2fdea-0947-4410-a0ae-a3d4cd508dc2", "table_id": "d1e1f34c-3e92-4b78-b71a-7f02c6e1d359", "object": {}}
    if issued is not None:
        data["issued_at"] = issued
    with pytest.raises(ValueError, match="Invalid protocol message"):
        Message.from_json(json.dumps({"type": "paint_object_create", "data": data}))


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
        '{"type":"file_request","data":{}}',
        '{"type":"file_data","data":{"file_id":"file-1"}}',
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


PAINT_OPERATION_ID = "4e34ddf1-b61d-43ee-92ea-834c30a4c8d4"
PAINT_TABLE_ID = "9e8ed60d-f18c-4f47-a5ce-fc04db50506a"
PAINT_OBJECT_ID = "dd830253-e2bf-4a92-9862-eabe85f79c99"


@pytest.mark.parametrize(
    "message",
    [
        {
            "type": "paint_object_create",
            "data": {
                "issued_at": 0,
                "operation_id": PAINT_OPERATION_ID,
                "table_id": PAINT_TABLE_ID,
                "object": {},
            },
        },
        {
            "type": "paint_object_update",
            "data": {
                "issued_at": 0,
                "operation_id": PAINT_OPERATION_ID,
                "table_id": PAINT_TABLE_ID,
                "id": PAINT_OBJECT_ID,
                "expected_version": 1,
                "object": {},
            },
        },
        {
            "type": "paint_object_delete",
            "data": {
                "issued_at": 0,
                "operation_id": PAINT_OPERATION_ID,
                "table_id": PAINT_TABLE_ID,
                "id": PAINT_OBJECT_ID,
                "expected_version": 2,
            },
        },
        {
            "type": "paint_object_event",
            "data": {
                "operation_id": PAINT_OPERATION_ID,
                "table_id": PAINT_TABLE_ID,
                "revision": 3,
                "action": "create",
                "object": {},
            },
        },
        {
            "type": "paint_object_event",
            "data": {
                "operation_id": PAINT_OPERATION_ID,
                "table_id": PAINT_TABLE_ID,
                "revision": 4,
                "action": "delete",
                "deleted_id": PAINT_OBJECT_ID,
                "deleted_version": 2,
            },
        },
        {"type": "paint_snapshot_request", "data": {"table_id": PAINT_TABLE_ID}},
        {
            "type": "paint_snapshot_chunk",
            "data": {
                "snapshot_id": PAINT_OPERATION_ID,
                "table_id": PAINT_TABLE_ID,
                "revision": 0,
                "chunk_index": 0,
                "chunk_count": 1,
                "complete": True,
                "objects": [],
            },
        },
        {
            "type": "paint_preview",
            "data": {
                "table_id": PAINT_TABLE_ID,
                "temporary_id": PAINT_OBJECT_ID,
                "sequence": 0,
                "expires_at": 1000,
                "draft": {},
            },
        },
        {
            "type": "paint_preview_cancel",
            "data": {
                "table_id": PAINT_TABLE_ID,
                "temporary_id": PAINT_OBJECT_ID,
                "sequence": 1,
            },
        },
        {
            "type": "error",
            "data": {
                "error": "Paint object changed",
                "operation_id": PAINT_OPERATION_ID,
                "code": "version_conflict",
                "current_object": {},
                "current_version": 2,
            },
        },
    ],
)
def test_message_from_json_accepts_paint_object_envelopes(message):
    parsed = Message.from_json(json.dumps(message))

    assert parsed.type.value == message["type"]


@pytest.mark.parametrize(
    "message",
    [
        {
            "type": "paint_object_create",
            "data": {
                "operation_id": "not-a-uuid",
                "table_id": PAINT_TABLE_ID,
                "object": {},
            },
        },
        {
            "type": "paint_object_update",
            "data": {
                "operation_id": PAINT_OPERATION_ID,
                "table_id": PAINT_TABLE_ID,
                "id": PAINT_OBJECT_ID,
                "expected_version": 0,
                "object": {},
            },
        },
        {
            "type": "paint_object_delete",
            "data": {
                "operation_id": PAINT_OPERATION_ID,
                "table_id": PAINT_TABLE_ID,
                "id": PAINT_OBJECT_ID,
                "expected_version": 1,
                "created_by": 99,
            },
        },
        {
            "type": "paint_object_event",
            "data": {
                "operation_id": PAINT_OPERATION_ID,
                "table_id": PAINT_TABLE_ID,
                "revision": 1,
                "action": "delete",
                "object": {},
            },
        },
        {
            "type": "paint_snapshot_chunk",
            "data": {
                "snapshot_id": PAINT_OPERATION_ID,
                "table_id": PAINT_TABLE_ID,
                "revision": 0,
                "chunk_index": 0,
                "chunk_count": 0,
                "complete": True,
                "objects": [],
            },
        },
        {
            "type": "paint_preview",
            "data": {
                "table_id": PAINT_TABLE_ID,
                "temporary_id": PAINT_OBJECT_ID,
                "sequence": 0,
                "expires_at": 1000,
            },
        },
        {
            "type": "paint_preview_cancel",
            "data": {
                "table_id": PAINT_TABLE_ID,
                "temporary_id": PAINT_OBJECT_ID,
                "sequence": -1,
            },
        },
        {
            "type": "error",
            "data": {
                "error": "Paint failed",
                "operation_id": PAINT_OPERATION_ID,
                "code": "made_up_code",
            },
        },
    ],
)
def test_message_from_json_rejects_invalid_paint_object_envelopes(message):
    with pytest.raises(ValueError, match="Invalid protocol message"):
        Message.from_json(json.dumps(message))
