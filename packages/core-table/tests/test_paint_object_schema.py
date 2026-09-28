import copy
import json
import math
from pathlib import Path

import pytest
from jsonschema import Draft202012Validator, FormatChecker

SCHEMA_PATH = Path(__file__).parents[1] / "protocol" / "paint_object.schema.json"


@pytest.fixture(scope="module")
def schema() -> dict:
    loaded = json.loads(SCHEMA_PATH.read_text(encoding="utf-8"))
    Draft202012Validator.check_schema(loaded)
    return loaded


@pytest.fixture(scope="module")
def input_validator(schema: dict) -> Draft202012Validator:
    return Draft202012Validator(
        {"$ref": "#/$defs/paintObjectInput", **schema},
        format_checker=FormatChecker(),
    )


@pytest.fixture
def base_input() -> dict:
    return {
        "id": "4e34ddf1-b61d-43ee-92ea-834c30a4c8d4",
        "kind": "freehand",
        "geometry": {
            "kind": "freehand",
            "points": [{"x": 0, "y": 0, "pressure": 0.5}],
        },
        "transform": {"x": 10, "y": 20, "scale_x": 1, "scale_y": 1},
        "style": {
            "stroke_rgba": [0.1, 0.2, 0.3, 1],
            "width": 3,
            "fill_rgba": None,
        },
    }


@pytest.mark.parametrize(
    ("kind", "geometry"),
    [
        (
            "freehand",
            {
                "kind": "freehand",
                "points": [{"x": 1, "y": 2, "pressure": 0.25}],
            },
        ),
        (
            "line",
            {
                "kind": "line",
                "start": {"x": 0, "y": 0, "pressure": 0.5},
                "end": {"x": 20, "y": 10, "pressure": 0.5},
            },
        ),
        ("rectangle", {"kind": "rectangle", "width": 20, "height": 10}),
        ("square", {"kind": "square", "size": 20}),
        ("ellipse", {"kind": "ellipse", "width": 20, "height": 10}),
        ("circle", {"kind": "circle", "diameter": 20}),
    ],
)
def test_schema_accepts_every_paint_kind(
    input_validator: Draft202012Validator,
    base_input: dict,
    kind: str,
    geometry: dict,
):
    candidate = copy.deepcopy(base_input)
    candidate.update(kind=kind, geometry=geometry)

    input_validator.validate(candidate)


def test_schema_accepts_authoritative_object(schema: dict, base_input: dict):
    candidate = {
        **base_input,
        "table_id": "9e8ed60d-f18c-4f47-a5ce-fc04db50506a",
        "created_by": 42,
        "version": 1,
        "z_order": 7,
        "created_at": "2026-09-28T10:00:00Z",
        "updated_at": "2026-09-28T10:00:00Z",
    }
    validator = Draft202012Validator(
        {"$ref": "#/$defs/paintObject", **schema},
        format_checker=FormatChecker(),
    )

    validator.validate(candidate)


@pytest.mark.parametrize(
    "mutate",
    [
        lambda value: value.update(kind="triangle"),
        lambda value: value["geometry"].update(kind="line"),
        lambda value: value["geometry"].update(points=[]),
        lambda value: value["geometry"]["points"][0].update(pressure=1.01),
        lambda value: value["transform"].update(scale_x=0),
        lambda value: value["style"].update(width=0),
        lambda value: value["style"].update(stroke_rgba=[0, 0, 0]),
        lambda value: value.update(created_by=123),
        lambda value: value.update(unexpected=True),
    ],
)
def test_schema_rejects_malformed_inputs(
    input_validator: Draft202012Validator,
    base_input: dict,
    mutate,
):
    candidate = copy.deepcopy(base_input)
    mutate(candidate)

    assert not input_validator.is_valid(candidate)


def test_schema_caps_path_points(
    input_validator: Draft202012Validator, base_input: dict
):
    candidate = copy.deepcopy(base_input)
    candidate["geometry"]["points"] *= 8193

    assert not input_validator.is_valid(candidate)


def test_schema_declares_transport_and_table_budgets(schema: dict):
    assert schema["x-limits"] == {
        "maxSerializedBytes": 61_440,
        "maxObjectsPerTable": 2_000,
        "maxPointsPerTable": 100_000,
    }


def test_json_non_finite_numbers_require_runtime_rejection(
    input_validator: Draft202012Validator, base_input: dict
):
    """Document jsonschema's NaN gap for the runtime validator layer."""
    candidate = copy.deepcopy(base_input)
    candidate["transform"]["x"] = math.nan

    assert input_validator.is_valid(candidate)


def test_packaged_schema_matches_canonical_schema():
    packaged_schema = (
        Path(__file__).parents[1]
        / "core_table"
        / "paint_object.schema.generated.json"
    )

    assert packaged_schema.read_bytes() == SCHEMA_PATH.read_bytes()
