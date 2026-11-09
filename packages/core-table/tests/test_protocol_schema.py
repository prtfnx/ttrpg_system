import json
from pathlib import Path

import pytest
from core_table.protocol import Message, MessageType

SCHEMA_PATH = Path(__file__).parents[1] / "protocol" / "message.schema.json"
SPRITE_MUTATIONS = {"sprite_create", "sprite_remove", "sprite_move", "sprite_scale", "sprite_rotate", "sprite_update",
                    "compendium_sprite_add", "compendium_sprite_update", "compendium_sprite_remove"}


@pytest.mark.parametrize('extra', [{}, {'source_table_id': '51f0094e-66af-4f2d-91e1-b0caef9d33ed'},
    {'table_data': {'layers': {}}}])
def test_table_create_copy_and_import_have_original_wire_identity(extra):
    message = {'type': 'new_table_request', 'message_id': 'original', 'timestamp': 1,
        'data': {'table_name': 'Scene', **extra}}
    Message.from_dict(message)
    for field in ('message_id', 'timestamp'):
        missing = {key: value for key, value in message.items() if key != field}
        with pytest.raises(ValueError, match='Invalid protocol message'):
            Message.from_dict(missing)


@pytest.mark.parametrize('extra', [{'width': 499}, {'height': True}, {'table_name': 'x' * 51},
    {'source_table_id': 'not-a-uuid'}, {'table_data': []}, {'user_id': 99},
    {'source_table_id': '51f0094e-66af-4f2d-91e1-b0caef9d33ed', 'table_data': {}}])
def test_table_creation_closed_payload_rejects_invalid_or_ambiguous_input(extra):
    with pytest.raises(ValueError, match='Invalid protocol message'):
        Message.from_dict({'type': 'new_table_request', 'message_id': 'original', 'timestamp': 1,
            'data': {'table_name': 'Scene', **extra}})


@pytest.mark.parametrize('field,value', [('message_id', None), ('timestamp', None), ('amount', True),
    ('amount', 0), ('amount', 1.5), ('amount', '100'), ('amount', 1000001),
    ('source', 'x' * 51), ('description', 'x' * 301), ('character_id', ''), ('user_id', 7)])
def test_xp_award_has_bounded_closed_payload_and_original_identity(field, value):
    message = {'type': 'xp_award', 'message_id': 'original', 'timestamp': 1,
               'data': {'character_id': 'hero', 'amount': 100}}
    Message.from_dict(message)
    target = message if field in {'message_id', 'timestamp'} else message['data']
    target[field] = value
    with pytest.raises(ValueError, match='Invalid protocol message'):
        Message.from_dict(message)


@pytest.mark.parametrize('field', ['message_id', 'timestamp'])
def test_xp_award_missing_envelope_identity_is_not_synthesized(field):
    message = {'type': 'xp_award', 'message_id': 'original', 'timestamp': 1,
               'data': {'character_id': 'hero', 'amount': 100}}
    del message[field]
    with pytest.raises(ValueError, match='Invalid protocol message'):
        Message.from_dict(message)


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


@pytest.mark.parametrize('options', [{'mode': 'dry_run'}, {'mode': 'apply', 'expected_digest': 'a' * 64}])
def test_reconciliation_request_has_one_closed_explicit_mode(options):
    parsed = Message.from_dict({'type': 'character_update', 'message_id': 'original', 'timestamp': 1,
        'data': {'character_id': 'hero', 'stat_reconciliation': options}})
    assert parsed.data['stat_reconciliation'] == options


@pytest.mark.parametrize('data', [
    {'character_id': 'hero', 'stat_reconciliation': {'mode': 'apply'}},
    {'character_id': 'hero', 'stat_reconciliation': {'mode': 'apply', 'expected_digest': 'bad'}},
    {'character_id': 'hero', 'stat_reconciliation': {'mode': 'dry_run', 'expected_digest': 'a' * 64}},
    {'character_id': 'hero', 'stat_reconciliation': {'mode': 'guess'}},
    {'character_id': 'hero', 'stat_reconciliation': {'mode': 'dry_run'}, 'updates': {'hp': 1}},
    {'character_id': 'hero', 'stat_reconciliation': None},
])
def test_reconciliation_cannot_mix_mutations_or_omit_its_exact_precondition(data):
    with pytest.raises(ValueError, match='Invalid protocol message'):
        Message.from_dict({'type': 'character_update', 'message_id': 'original', 'timestamp': 1, 'data': data})


@pytest.mark.parametrize('data', [{'character_id': 'hero', 'updates': {'name': 'Hero'}, 'version': 1},
    {'character_id': 'hero', 'character_data': {'name': 'Hero'}},
    {'character_id': 'hero', 'stat_reconciliation': {'mode': 'apply', 'expected_digest': 'a' * 64}}])
@pytest.mark.parametrize('field,value', [('message_id', None), ('message_id', ''), ('message_id', 'x' * 129),
    ('timestamp', None), ('timestamp', -1), ('timestamp', True), ('timestamp', 9007199254741)])
def test_character_mutation_requires_bounded_original_wire_identity(data, field, value):
    wire = {'type': 'character_update', 'message_id': 'original', 'timestamp': 1, 'data': data}
    assert Message.from_dict(wire).message_id == 'original'
    wire.pop(field) if value is None else wire.update({field: value})
    with pytest.raises(ValueError, match='Invalid protocol message'):
        Message.from_dict(wire)


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


@pytest.mark.parametrize("data", [
    {"code": "combat_outcome_unknown", "error": "Reload before retrying", "outcome": "unknown",
     "sequence_id": 17, "resync_required": True},
    {"code": "character_outcome_unknown", "error": "Reload before retrying", "outcome": "unknown",
     "character_id": "character-1", "resync_required": True},
    {"code": "character_outcome_unknown", "error": "Reload before retrying", "outcome": "unknown",
     "resync_required": True},
    {"code": "operation_id_conflict", "error": "Identity belongs to different updates"},
])
def test_recovery_errors_survive_the_shared_wire_validator(data):
    wire = Message(MessageType.ERROR, data, causation_id="original-request").to_json()
    parsed = Message.from_json(wire)
    assert parsed.data == data
    assert parsed.causation_id == "original-request"


@pytest.mark.parametrize("updates", [
    {"outcome": "committed"}, {"character_id": ""}, {"character_id": "x" * 65},
    {"sequence_id": -1}, {"sequence_id": True}, {"unregistered_field": True},
])
def test_recovery_error_payloads_keep_the_closed_schema(updates):
    data = {"code": "character_outcome_unknown", "error": "Reload before retrying", "outcome": "unknown"}
    with pytest.raises(ValueError, match="Invalid protocol message"):
        Message.from_json(Message(MessageType.ERROR, {**data, **updates}).to_json())


@pytest.mark.parametrize(
    "message",
    [
        {
            "type": "new_table_request",
            "message_id": "original-table-create",
            "timestamp": 1,
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
            "message_id": "settings-original", "timestamp": 1,
            "data": {"table_id": "550e8400-e29b-41d4-a716-446655440000", "snap_to_grid": False},
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
            "message_id": "original-table-create",
            "timestamp": 1,
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
    message['message_id'] = 'original-wall'
    parsed = Message.from_json(json.dumps(message))

    assert parsed.type.value == message["type"]


@pytest.mark.parametrize('kind', ['wall_create', 'wall_update', 'wall_remove', 'door_toggle'])
@pytest.mark.parametrize('invalid', [None, '', '   ', 'x' * 129])
def test_wall_wire_requires_original_identity_instead_of_minting_one(kind, invalid):
    data = {'table_id': 'table', 'wall_id': 'wall'}
    if kind == 'wall_create':
        data = {'table_id': 'table', 'wall_data': {'x1': 0, 'y1': 0, 'x2': 10, 'y2': 10}}
    elif kind == 'wall_update':
        data['updates'] = {'door_state': 'open'}
    wire = {'type': kind, 'message_id': 'original', 'data': data}
    assert Message.from_dict(wire).message_id == 'original'
    if invalid is None:
        wire.pop('message_id')
    else:
        wire['message_id'] = invalid
    with pytest.raises(ValueError, match='Invalid protocol message'):
        Message.from_dict(wire)


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
    message['message_id'] = 'original-wall'
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


@pytest.mark.parametrize('field,value', [('message_id', ''), ('message_id', 'x' * 129),
    ('timestamp', -1), ('timestamp', True), ('data', {'table_id': 'scene-name'}),
    ('data', {'table_id': '11111111-1111-1111-1111-111111111111', 'user_id': 2})])
def test_table_delete_requires_closed_uuid_payload_and_original_identity(field, value):
    message = {'type': 'table_delete', 'message_id': 'original', 'timestamp': 1,
               'data': {'table_id': '11111111-1111-1111-1111-111111111111'}}
    assert Message.from_dict(message).message_id == 'original'
    message[field] = value
    with pytest.raises(ValueError):
        Message.from_dict(message)


@pytest.mark.parametrize('field', ['message_id', 'timestamp'])
def test_table_delete_missing_identity_cannot_be_synthesized(field):
    message = {'type': 'table_delete', 'message_id': 'original', 'timestamp': 1,
               'data': {'table_id': '11111111-1111-1111-1111-111111111111'}}
    del message[field]
    with pytest.raises(ValueError):
        Message.from_dict(message)


@pytest.mark.parametrize('field,value', [('message_id', ''), ('message_id', 'x' * 129), ('timestamp', True),
    ('timestamp', -1), ('data', {'table_id': 'scene', 'grid_enabled': True}),
    ('data', {'table_id': '550e8400-e29b-41d4-a716-446655440000', 'settings_revision': 9})])
def test_settings_requires_closed_patch_and_original_identity(field, value):
    message = {'type': 'table_settings_update', 'message_id': 'original', 'timestamp': 1,
        'data': {'table_id': '550e8400-e29b-41d4-a716-446655440000', 'grid_enabled': True}}
    Message.from_dict(message)
    message[field] = value
    with pytest.raises(ValueError):
        Message.from_dict(message)


@pytest.mark.parametrize('field', ['message_id', 'timestamp'])
def test_settings_missing_identity_is_not_synthesized(field):
    message = {'type': 'table_settings_update', 'message_id': 'original', 'timestamp': 1,
        'data': {'table_id': '550e8400-e29b-41d4-a716-446655440000', 'grid_enabled': True}}
    del message[field]
    with pytest.raises(ValueError):
        Message.from_dict(message)


def test_settings_receipt_can_reconcile_a_later_deleted_table_without_old_settings():
    message = {'type': 'table_settings_changed', 'data': {'table_id': 'scene', 'table_deleted': True,
        'operation_id': 'original', 'replayed': True}}
    Message.from_dict(message)
    del message['data']['table_deleted']
    with pytest.raises(ValueError):
        Message.from_dict(message)


@pytest.mark.parametrize('context', [None, {'contract': 'session-operations-v1',
    'session_instance': '1:2026-10-30T00:00:00', 'domains': ['table_create', 'xp_award']},
    {'contract': 'session-operations-v2', 'session_instance': '1:created',
     'domains': ['character_update', 'choice_encounter', 'character_multiclass']}])
def test_welcome_admits_only_explicit_bounded_recovery_context(context):
    data = {'message': 'Welcome', 'client_id': 'client', 'user_id': 1, 'username': 'Owner',
        'session_code': 'ROOM', 'connection_id': None, 'tables': [], 'role': 'owner', 'permissions': [],
        'visible_layers': [], 'game_mode': 'free_roam', 'session_rules': {}, 'choice_encounter': None,
        'operation_recovery': context}
    Message.from_dict({'type': 'welcome', 'data': data})
    data['operation_recovery'] = {'contract': 'old', 'session_instance': 'x', 'domains': ['xp_award']}
    with pytest.raises(ValueError):
        Message.from_dict({'type': 'welcome', 'data': data})


@pytest.mark.parametrize('contract,domains', [
    ('session-operations-v1', ['character_update']),
    ('session-operations-v1', ['choice_encounter']),
    ('session-operations-v1', ['character_multiclass']),
    ('session-operations-v2', ['character_update', 'character_update']),
    ('session-operations-v2', ['future_mutation']),
])
def test_welcome_rejects_unnegotiated_or_invalid_recovery_domains(contract, domains):
    data = {'message': 'Welcome', 'client_id': 'client', 'user_id': 1, 'username': 'Owner',
        'session_code': 'ROOM', 'connection_id': None, 'tables': [], 'role': 'owner', 'permissions': [],
        'visible_layers': [], 'game_mode': 'free_roam', 'session_rules': {}, 'choice_encounter': None,
        'operation_recovery': {'contract': contract, 'session_instance': '1:created', 'domains': domains}}
    with pytest.raises(ValueError):
        Message.from_dict({'type': 'welcome', 'data': data})


