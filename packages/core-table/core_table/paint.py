"""Shared runtime validation for the versioned paint-object contract."""

from __future__ import annotations

import json
import math
from dataclasses import dataclass
from functools import lru_cache
from importlib.resources import files
from typing import Any, Iterable, Mapping

from jsonschema import Draft202012Validator, FormatChecker


class PaintValidationError(ValueError):
    """Raised when a paint payload violates the shared contract."""


@dataclass(frozen=True)
class PaintLimits:
    max_serialized_bytes: int
    max_objects_per_table: int
    max_points_per_table: int


@lru_cache(maxsize=1)
def _paint_schema() -> dict[str, Any]:
    resource = files("core_table").joinpath("paint_object.schema.generated.json")
    schema = json.loads(resource.read_text(encoding="utf-8"))
    Draft202012Validator.check_schema(schema)
    return schema


@lru_cache(maxsize=14)
def _paint_validator(definition: str, kind: str | None = None) -> Draft202012Validator:
    schema = {**_paint_schema(), "$ref": f"#/$defs/{definition}"}
    schema.pop("oneOf", None)
    base = schema["$defs"]["paintEditableBase"]
    if kind in base["properties"]["kind"]["enum"]:
        # Compile the tagged branch from the canonical schema, not a second
        # hand-written contract. The generic oneOf + if + unevaluatedProperties
        # otherwise walks a valid freehand path three times. Flatten known
        # object properties and validate the selected geometry exactly once.
        branch = next(rule for rule in base["allOf"] if rule["if"]["properties"]["kind"]["const"] == kind)
        properties = {**base["properties"], "kind": {"const": kind}, **branch["then"]["properties"]}
        required = list(base["required"])
        if definition == "paintObject":
            metadata = schema["$defs"][definition]["allOf"][1]
            properties.update(metadata["properties"])
            required.extend(metadata["required"])
        schema = {
            "$schema": schema["$schema"],
            "$defs": schema["$defs"],
            "type": "object",
            "properties": properties,
            "required": required,
            "additionalProperties": False,
        }
    return Draft202012Validator(
        schema,
        format_checker=FormatChecker(),
    )


def paint_limits() -> PaintLimits:
    limits = _paint_schema()["x-limits"]
    return PaintLimits(
        max_serialized_bytes=limits["maxSerializedBytes"],
        max_objects_per_table=limits["maxObjectsPerTable"],
        max_points_per_table=limits["maxPointsPerTable"],
    )


def _serialized_size(payload: Mapping[str, Any]) -> int:
    try:
        encoded = json.dumps(
            payload,
            allow_nan=False,
            ensure_ascii=False,
            separators=(",", ":"),
            sort_keys=True,
        ).encode("utf-8")
    except (TypeError, ValueError) as exc:
        raise PaintValidationError("paint payload must contain finite JSON values") from exc
    return len(encoded)


def _format_error(error: Any) -> str:
    path = ".".join(str(part) for part in error.absolute_path)
    location = f" at {path}" if path else ""
    return f"invalid paint payload{location}: {error.message}"


def _leaf_errors(error: Any) -> list[Any]:
    if not error.context:
        return [error]
    return [leaf for child in error.context for leaf in _leaf_errors(child)]


def _validate(payload: Mapping[str, Any], definition: str) -> None:
    if not isinstance(payload, Mapping):
        raise PaintValidationError("paint payload must be an object")

    limits = paint_limits()
    size = _serialized_size(payload)
    if size > limits.max_serialized_bytes:
        raise PaintValidationError(f"paint payload exceeds the {limits.max_serialized_bytes}-byte serialized limit")

    kind = payload.get("kind")
    errors = [
        leaf
        for error in _paint_validator(definition, kind if isinstance(kind, str) else None).iter_errors(payload)
        for leaf in _leaf_errors(error)
    ]
    errors.sort(
        key=lambda error: (
            -len(error.absolute_path),
            tuple(str(part) for part in error.absolute_path),
            error.message,
        ),
    )
    if errors:
        raise PaintValidationError(_format_error(errors[0]))

    if payload["kind"] in {"square", "circle"}:
        transform = payload["transform"]
        if not math.isclose(
            transform["scale_x"],
            transform["scale_y"],
            rel_tol=1e-9,
            abs_tol=1e-12,
        ):
            raise PaintValidationError(f"{payload['kind']} transform must preserve its aspect ratio")


def validate_paint_object_input(payload: Mapping[str, Any]) -> None:
    """Validate client-editable fields, semantic invariants, and byte size."""
    _validate(payload, "paintObjectInput")


def validate_paint_object(payload: Mapping[str, Any]) -> None:
    """Validate a complete server-authoritative paint object."""
    _validate(payload, "paintObject")


def paint_point_count(payload: Mapping[str, Any]) -> int:
    """Return the points charged to a table's aggregate point budget."""
    geometry = payload["geometry"]
    if payload["kind"] == "freehand":
        return len(geometry["points"])
    if payload["kind"] == "line":
        return 2
    return 0


def validate_paint_table_budget(objects: Iterable[Mapping[str, Any]]) -> None:
    """Validate authoritative objects and their aggregate table budgets."""
    limits = paint_limits()
    object_count = 0
    point_count = 0

    for payload in objects:
        object_count += 1
        if object_count > limits.max_objects_per_table:
            raise PaintValidationError(f"paint table exceeds the {limits.max_objects_per_table}-object limit")
        validate_paint_object(payload)
        point_count += paint_point_count(payload)
        if point_count > limits.max_points_per_table:
            raise PaintValidationError(f"paint table exceeds the {limits.max_points_per_table}-point limit")
