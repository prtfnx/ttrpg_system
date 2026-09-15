"""Runtime compatibility checks for server entry points."""

from __future__ import annotations

import sys
from collections.abc import Sequence

MINIMUM_PYTHON = (3, 11)


def require_supported_python(version_info: Sequence[int] | None = None) -> None:
    """Stop startup with actionable guidance on unsupported Python versions."""
    detected = tuple(sys.version_info[:3] if version_info is None else version_info)
    if detected[:2] >= MINIMUM_PYTHON:
        return

    required = ".".join(str(part) for part in MINIMUM_PYTHON)
    running = ".".join(str(part) for part in detected)
    raise SystemExit(
        f"TTRPG server requires Python {required} or newer; found Python {running} "
        f"at {sys.executable}. Activate the repository's .venv311 environment "
        "before starting the server."
    )
