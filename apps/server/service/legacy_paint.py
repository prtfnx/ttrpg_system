"""Compatibility responses for paint-stroke clients retired by the object protocol."""


LEGACY_PAINT_MESSAGE_TYPES = frozenset(
    {
        "paint_stroke_create",
        "paint_stroke_delete",
        "paint_stroke_clear",
        "paint_sync",
    }
)


def is_legacy_paint_message(message: object) -> bool:
    """Return whether a decoded message uses a retired paint-stroke command."""
    return (
        isinstance(message, dict)
        and message.get("type") in LEGACY_PAINT_MESSAGE_TYPES
    )


def legacy_paint_upgrade_data() -> dict[str, object]:
    """Build the stable terminal error payload returned to legacy clients."""
    return {
        "error": "Legacy paint strokes are retired; upgrade and request an object snapshot",
        "code": "upgrade_required",
    }
