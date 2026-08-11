"""Generate Python and TypeScript message-type registries from JSON Schema."""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path

PACKAGE_ROOT = Path(__file__).resolve().parents[1]
REPOSITORY_ROOT = PACKAGE_ROOT.parents[1]
SCHEMA_PATH = PACKAGE_ROOT / "protocol" / "message.schema.json"
PYTHON_TARGET = PACKAGE_ROOT / "core_table" / "protocol.py"
PYTHON_SCHEMA_TARGET = PYTHON_TARGET.with_name("message.schema.generated.json")
TYPESCRIPT_TARGET = (
    REPOSITORY_ROOT / "apps" / "web-ui" / "src" / "lib" / "websocket" / "message.ts"
)
TYPESCRIPT_SCHEMA_TARGET = TYPESCRIPT_TARGET.with_name("message.schema.generated.json")

PYTHON_BEGIN = (
    "# BEGIN GENERATED MESSAGE TYPES - "
    "run packages/core-table/scripts/generate_protocol_types.py"
)
PYTHON_END = "# END GENERATED MESSAGE TYPES"
TYPESCRIPT_BEGIN = (
    "// BEGIN GENERATED MESSAGE TYPES - "
    "run packages/core-table/scripts/generate_protocol_types.py"
)
TYPESCRIPT_END = "// END GENERATED MESSAGE TYPES"


def _load_message_types() -> list[tuple[str, str]]:
    schema = json.loads(SCHEMA_PATH.read_text(encoding="utf-8"))
    type_schema = schema["properties"]["type"]
    names = type_schema["x-enum-varnames"]
    values = type_schema["enum"]

    if len(names) != len(values):
        raise ValueError("x-enum-varnames must have one name for every enum value")
    if len(set(names)) != len(names) or len(set(values)) != len(values):
        raise ValueError("message type names and wire values must be unique")

    entries = list(zip(names, values, strict=True))
    for name, value in entries:
        if not re.fullmatch(r"[A-Z][A-Z0-9_]*", name):
            raise ValueError(f"invalid message type name: {name!r}")
        if not isinstance(value, str) or not value:
            raise ValueError(f"invalid wire value for {name}: {value!r}")
    return entries


def _python_block(entries: list[tuple[str, str]]) -> str:
    lines = [PYTHON_BEGIN, "class MessageType(enum.Enum):"]
    lines.extend(f"    {name} = {json.dumps(value)}" for name, value in entries)
    lines.append(PYTHON_END)
    return "\n".join(lines)


def _typescript_block(entries: list[tuple[str, str]]) -> str:
    lines = [TYPESCRIPT_BEGIN, "export const MessageType = {"]
    lines.extend(f"  {name}: {json.dumps(value)}," for name, value in entries)
    lines.extend(
        [
            "} as const;",
            "",
            "export type MessageType = typeof MessageType[keyof typeof MessageType];",
            "",
            "export const MESSAGE_TYPE_VALUES = [",
        ]
    )
    lines.extend(f"  {json.dumps(value)}," for _, value in entries)
    lines.extend(["] as const;", TYPESCRIPT_END])
    return "\n".join(lines)


def _replace_region(path: Path, begin: str, end: str, block: str) -> bytes:
    original = path.read_bytes()
    newline = "\r\n" if b"\r\n" in original else "\n"
    text = original.decode("utf-8")
    pattern = re.compile(f"{re.escape(begin)}.*?{re.escape(end)}", re.DOTALL)
    replaced, count = pattern.subn(block.replace("\n", newline), text)
    if count != 1:
        raise ValueError(f"expected one generated region in {path}, found {count}")
    return replaced.encode("utf-8")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--check",
        action="store_true",
        help="fail instead of writing when generated bindings are stale",
    )
    args = parser.parse_args()

    entries = _load_message_types()
    targets = {
        PYTHON_TARGET: _replace_region(
            PYTHON_TARGET,
            PYTHON_BEGIN,
            PYTHON_END,
            _python_block(entries),
        ),
        TYPESCRIPT_TARGET: _replace_region(
            TYPESCRIPT_TARGET,
            TYPESCRIPT_BEGIN,
            TYPESCRIPT_END,
            _typescript_block(entries),
        ),
        TYPESCRIPT_SCHEMA_TARGET: SCHEMA_PATH.read_bytes(),
        PYTHON_SCHEMA_TARGET: SCHEMA_PATH.read_bytes(),
    }

    stale = [
        path
        for path, generated in targets.items()
        if not path.exists() or path.read_bytes() != generated
    ]
    if args.check:
        if stale:
            for path in stale:
                print(f"stale generated protocol binding: {path.relative_to(REPOSITORY_ROOT)}")
            return 1
        print("Generated protocol bindings are current.")
        return 0

    for path in stale:
        path.write_bytes(targets[path])
        print(f"updated {path.relative_to(REPOSITORY_ROOT)}")
    if not stale:
        print("Generated protocol bindings are already current.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
