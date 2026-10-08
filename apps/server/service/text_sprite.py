"""Bounded, versioned text metadata; raster textures are never durable assets."""
from __future__ import annotations

import json
from functools import lru_cache
from importlib.resources import files
from typing import Any

from jsonschema import Draft202012Validator


class TextSpriteValidationError(ValueError):
    pass


@lru_cache(maxsize=1)
def _schema() -> dict[str, Any]:
    return json.loads(files("core_table").joinpath("text_sprite.schema.generated.json").read_text(encoding="utf-8"))


@lru_cache(maxsize=1)
def _validator() -> Draft202012Validator:
    return Draft202012Validator(_schema())


def text_metadata(value: object, *, required: bool = False) -> dict[str, Any] | None:
    """Normalize a text descriptor while leaving non-text legacy metadata alone."""
    if value is None and not required:
        return None
    try:
        metadata = json.loads(value) if isinstance(value, str) else value
    except (ValueError, TypeError) as exc:
        if not required:
            return None
        raise TextSpriteValidationError("Text metadata must be JSON") from exc
    if isinstance(metadata, dict) and "text_sprite" not in metadata and metadata.get("is_text") is True:
        family = str(metadata.get("fontFamily", "sans-serif")).lower()
        weight = str(metadata.get("fontWeight", "normal"))
        metadata = {**metadata, "text_sprite": {
            "version": 1, "text": metadata.get("text"), "font_size": metadata.get("fontSize", 24),
            "font_family": "monospace" if any(part in family for part in ("mono", "courier", "console"))
                else "serif" if family in {"serif", "times new roman", "georgia"} else "sans-serif",
            "font_weight": 700 if weight == "bold" or weight.isdigit() and int(weight) >= 600 else 400,
            "font_style": "normal", "color": metadata.get("color", "#ffffff"), "language": "und", "direction": "auto",
        }}
    if not isinstance(metadata, dict) or "text_sprite" not in metadata:
        if not required:
            return None
        raise TextSpriteValidationError("Text updates require a text_sprite descriptor")
    try:
        encoded = json.dumps(metadata, ensure_ascii=False, allow_nan=False).encode("utf-8")
    except (TypeError, ValueError) as exc:
        raise TextSpriteValidationError("Text metadata must contain finite JSON values") from exc
    if len(encoded) > _schema()["x-limits"]["maxMetadataBytes"]:
        raise TextSpriteValidationError("Text metadata exceeds 32 KiB")
    descriptor = metadata["text_sprite"]
    errors = list(_validator().iter_errors(descriptor))
    if errors:
        raise TextSpriteValidationError(f"Invalid text descriptor: {errors[0].message}")
    text = descriptor["text"]
    if not text.strip() or len(text.split("\n")) > _schema()["x-limits"]["maxLines"]:
        raise TextSpriteValidationError("Text must be non-empty and contain at most 32 lines")
    if any(ord(char) < 32 and char not in "\n\t" for char in text):
        raise TextSpriteValidationError("Text contains unsupported control characters")
    return metadata


def encode_text_metadata(metadata: dict[str, Any]) -> str:
    return json.dumps(metadata, ensure_ascii=False, allow_nan=False, separators=(",", ":"))
