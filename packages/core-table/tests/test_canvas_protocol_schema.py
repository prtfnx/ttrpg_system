import json
from importlib.resources import files

import pytest
from core_table.protocol import Message

UUID = "9e8ed60d-f18c-4f47-a5ce-fc04db50506a"
BASE = {"operation_id": UUID, "table_id": UUID, "issued_at": 1791378000000}
TRANSFORM = {"dx": 0, "dy": 0, "scale": 1, "rotation": 0, "pivot_x": 0, "pivot_y": 0}
MEMBERS = [{"kind": "paint", "id": UUID, "version": 1}]
STYLE = {"stroke_rgba": [0, 0.5, 1, 1], "width": 4, "fill_rgba": None}


@pytest.mark.parametrize("mode,extras", [
    ("transform", {"members": MEMBERS, "transform": TRANSFORM}),
    ("restyle", {"members": MEMBERS, "style": STYLE}),
    ("copy", {"members": MEMBERS}), ("cut", {"members": MEMBERS}),
    ("delete", {"members": MEMBERS}), ("undo", {}), ("redo", {}),
    ("paste", {"clipboard_id": UUID, "transform": TRANSFORM,
               "ids": [{"kind": "paint", "source_id": UUID, "id": UUID}]}),
])
def test_canvas_modes_validate(mode, extras):
    parsed = Message.from_json(json.dumps({"type": "canvas_command", "data": {**BASE, "mode": mode, **extras}}))
    assert parsed.data["mode"] == mode


@pytest.mark.parametrize("data", [
    {**BASE, "mode": "undo", "members": MEMBERS},
    {**BASE, "mode": "transform", "members": MEMBERS},
    {**BASE, "mode": "copy", "members": []},
    {**BASE, "mode": "copy", "members": MEMBERS * 101},
    {**BASE, "mode": "copy", "members": MEMBERS, "actor_id": 42},
    {**BASE, "mode": "transform", "members": MEMBERS, "transform": {**TRANSFORM, "scale": 0}},
    {**BASE, "mode": "restyle", "members": MEMBERS},
    {**BASE, "mode": "restyle", "members": MEMBERS, "style": {**STYLE, "width": 0}},
    {**BASE, "mode": "restyle", "members": MEMBERS, "style": {**STYLE, "stroke_rgba": [True, 0, 0, 1]}},
    {**BASE, "mode": "restyle", "members": MEMBERS, "style": {**STYLE, "fill_rgba": [0, 0, 0]}},
    {**BASE, "mode": "restyle", "members": MEMBERS, "style": {**STYLE, "created_by": 42}},
    {**BASE, "mode": "copy", "members": MEMBERS, "style": STYLE},
    {**BASE, "mode": "restyle", "members": MEMBERS, "style": STYLE, "transform": TRANSFORM},
    {**BASE, "mode": "restyle", "members": [{"kind": "sprite", "id": "sprite", "expected": {
        "x": 0, "y": 0, "width": 20, "height": 10, "scale_x": 1, "scale_y": 1, "rotation": 0,
    }}], "style": STYLE},
    {**BASE, "mode": "copy", "members": [{"kind": "paint", "id": UUID, "version": True}]},
    {**BASE, "mode": "paste", "clipboard_id": UUID, "transform": TRANSFORM,
     "ids": [{"kind": "paint", "source_id": UUID, "id": UUID, "created_by": 42}]},
])
def test_canvas_malformed_or_authority_bearing_commands_reject(data):
    with pytest.raises(ValueError, match="Invalid protocol message"):
        Message.from_json(json.dumps({"type": "canvas_command", "data": data}))


@pytest.mark.parametrize("message", [
    {"type": "canvas_history_request", "data": {"table_id": UUID}},
    {"type": "canvas_history_state", "data": {"table_id": UUID, "can_undo": True, "can_redo": False}},
    {"type": "canvas_command_result", "data": {**BASE, "success": False, "code": "forbidden", "error": "Denied"}},
    {"type": "canvas_command_result", "data": {"operation_id": UUID, "table_id": UUID,
     "success": True, "selection": [], "can_undo": True, "can_redo": False, "resync_required": True}},
])
def test_canvas_responses_and_history_validate(message):
    message["data"].pop("issued_at", None)
    assert Message.from_json(json.dumps(message)).type.value == message["type"]


def test_canvas_restyle_contract_matches_canonical_paint_style():
    paint = json.loads(files("core_table").joinpath("paint_object.schema.generated.json").read_text())
    messages = json.loads(files("core_table").joinpath("message.schema.generated.json").read_text())
    style = json.loads(json.dumps(messages["$defs"]["canvasPaintStyle"]).replace("canvasPaintRgba", "rgba"))
    assert style == paint["$defs"]["style"]
    assert messages["$defs"]["canvasPaintRgba"] == paint["$defs"]["rgba"]
