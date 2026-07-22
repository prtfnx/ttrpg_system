"""Create an integrity and provenance manifest for a licensed compendium artifact."""

from __future__ import annotations

import argparse
import hashlib
import json
import re
from pathlib import Path
from typing import Any

REQUIRED_FILES = {
    "character_data.json": ("races", "classes", "backgrounds"),
    "spellbook_optimized.json": ("metadata", "spells"),
    "equipment_data.json": ("metadata", "equipment"),
    "bestiary_optimized.json": ("metadata", "monsters"),
    "feats_data.json": ("feats",),
}
VERSION = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$")


def _validated_file(directory: Path, filename: str, required_keys: tuple[str, ...]) -> bytes:
    path = directory / filename
    raw = path.read_bytes()
    value = json.loads(raw)
    if not isinstance(value, dict):
        raise ValueError(f"{filename} must contain a JSON object")
    missing = [key for key in required_keys if key not in value]
    if missing:
        raise ValueError(f"{filename} is missing required keys: {', '.join(missing)}")
    return raw


def create_manifest(
    directory: Path,
    *,
    artifact_version: str,
    ruleset: str,
    scope: str,
    source: dict[str, str],
    license_data: dict[str, str],
    replace: bool = False,
) -> Path:
    """Validate a complete generation and write its manifest atomically."""
    directory = directory.resolve()
    manifest_path = directory / "manifest.json"
    if manifest_path.exists() and not replace:
        raise FileExistsError("manifest.json already exists; pass --replace to overwrite it")
    if not VERSION.fullmatch(artifact_version):
        raise ValueError("artifact version must contain only letters, numbers, dot, underscore, and hyphen")
    if not ruleset.strip() or not scope.strip():
        raise ValueError("ruleset and scope must not be empty")
    for label, value, fields in (
        ("source", source, ("name", "url", "version")),
        ("license", license_data, ("id", "url", "attribution")),
    ):
        missing = [field for field in fields if not value.get(field, "").strip()]
        if missing:
            raise ValueError(f"{label} is missing required fields: {', '.join(missing)}")

    files: dict[str, Any] = {}
    for filename, keys in REQUIRED_FILES.items():
        raw = _validated_file(directory, filename, keys)
        files[filename] = {
            "bytes": len(raw),
            "sha256": hashlib.sha256(raw).hexdigest(),
            "source": source,
            "license": license_data,
        }
    manifest = {
        "schema_version": 1,
        "artifact_version": artifact_version,
        "ruleset": ruleset,
        "scope": scope,
        "files": files,
    }
    encoded = (json.dumps(manifest, ensure_ascii=False, indent=2, sort_keys=True) + "\n").encode()
    temporary = directory / "manifest.json.tmp"
    temporary.write_bytes(encoded)
    temporary.replace(manifest_path)
    return manifest_path


def _read_attribution(args: argparse.Namespace, parser: argparse.ArgumentParser) -> str:
    if bool(args.attribution) == bool(args.attribution_file):
        parser.error("supply exactly one of --attribution or --attribution-file")
    if args.attribution_file:
        return args.attribution_file.read_text(encoding="utf-8").strip()
    return args.attribution.strip()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("directory", type=Path)
    parser.add_argument("--artifact-version", required=True)
    parser.add_argument("--ruleset", default="dnd5e-2014-v1")
    parser.add_argument("--scope", default="full")
    parser.add_argument("--source-name", required=True)
    parser.add_argument("--source-url", required=True)
    parser.add_argument("--source-version", required=True)
    parser.add_argument("--license-id", required=True)
    parser.add_argument("--license-url", required=True)
    parser.add_argument("--attribution")
    parser.add_argument("--attribution-file", type=Path)
    parser.add_argument("--replace", action="store_true")
    args = parser.parse_args()
    attribution = _read_attribution(args, parser)
    path = create_manifest(
        args.directory,
        artifact_version=args.artifact_version,
        ruleset=args.ruleset,
        scope=args.scope,
        source={"name": args.source_name, "url": args.source_url, "version": args.source_version},
        license_data={"id": args.license_id, "url": args.license_url, "attribution": attribution},
        replace=args.replace,
    )
    print(path)


if __name__ == "__main__":
    main()
