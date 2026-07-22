"""Verified, atomic loading for generated compendium artifacts."""

from __future__ import annotations

import hashlib
import json
import re
from pathlib import Path
from typing import Any

from utils.logger import setup_logger

logger = setup_logger(__name__)

MANIFEST_NAME = "manifest.json"
MANIFEST_SCHEMA_VERSION = 1
REQUIRED_FILES = {
    "character_data": "character_data.json",
    "spell_data": "spellbook_optimized.json",
    "equipment_data": "equipment_data.json",
    "bestiary_data": "bestiary_optimized.json",
    "feats_data": "feats_data.json",
}
_SHA256 = re.compile(r"^[0-9a-f]{64}$")
_VERSION = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$")


class CompendiumArtifactError(RuntimeError):
    """Raised when a compendium release artifact cannot be trusted."""


class CompendiumArtifact:
    """Load a complete compendium generation into memory before publishing it."""

    def __init__(self, directory: Path, *, require_manifest: bool):
        self.directory = directory.resolve()
        self.require_manifest = require_manifest
        self.data: dict[str, dict[str, Any]] = {}
        self.artifact_version: str | None = None
        self.verified = False
        self.metadata: dict[str, Any] = {}
        self.error_code: str | None = None
        self.load()

    def load(self) -> None:
        """Replace the active generation only after every file validates."""
        try:
            manifest = self._read_manifest()
            loaded: dict[str, dict[str, Any]] = {}
            content_hash = hashlib.sha256()
            for data_key, filename in REQUIRED_FILES.items():
                path = self.directory / filename
                raw = path.read_bytes()
                content_hash.update(filename.encode("utf-8"))
                content_hash.update(raw)
                if manifest is not None:
                    self._verify_file(filename, raw, manifest)
                value = json.loads(raw)
                if not isinstance(value, dict):
                    raise CompendiumArtifactError(f"{filename} must contain a JSON object")
                loaded[data_key] = value

            self._validate_shapes(loaded)
            self.data = loaded
            self.verified = manifest is not None
            self.metadata = self._manifest_metadata(manifest)
            self.artifact_version = (
                manifest["artifact_version"]
                if manifest is not None
                else f"unverified-{content_hash.hexdigest()[:16]}"
            )
            self.error_code = None
            logger.info(
                "Compendium artifact loaded",
                extra={
                    "event_name": "compendium.artifact.loaded",
                    "artifact_version": self.artifact_version,
                    "verified": self.verified,
                },
            )
        except (OSError, ValueError, KeyError, json.JSONDecodeError, CompendiumArtifactError):
            self.error_code = "compendium_artifact_invalid"
            logger.exception(
                "Compendium artifact validation failed",
                extra={"event_name": "compendium.artifact.invalid", "outcome": "error"},
            )

    def readiness(self) -> dict[str, Any]:
        if self.error_code:
            return {"ok": False, "code": self.error_code}
        if self.require_manifest and not self.verified:
            return {"ok": False, "code": "compendium_manifest_required"}
        return {
            "ok": True,
            "artifact_version": self.artifact_version,
            "verified": self.verified,
        }

    def _read_manifest(self) -> dict[str, Any] | None:
        path = self.directory / MANIFEST_NAME
        if not path.is_file():
            if self.require_manifest:
                raise CompendiumArtifactError("production compendium manifest is missing")
            return None
        manifest = json.loads(path.read_text(encoding="utf-8"))
        if not isinstance(manifest, dict):
            raise CompendiumArtifactError("compendium manifest must be a JSON object")
        if manifest.get("schema_version") != MANIFEST_SCHEMA_VERSION:
            raise CompendiumArtifactError("unsupported compendium manifest schema")
        version = manifest.get("artifact_version")
        if not isinstance(version, str) or not _VERSION.fullmatch(version):
            raise CompendiumArtifactError("invalid compendium artifact version")
        files = manifest.get("files")
        if not isinstance(files, dict) or set(files) != set(REQUIRED_FILES.values()):
            raise CompendiumArtifactError("manifest must describe exactly the required files")
        for filename, entry in files.items():
            self._validate_provenance(filename, entry)
        return manifest

    @staticmethod
    def _manifest_metadata(manifest: dict[str, Any] | None) -> dict[str, Any]:
        if manifest is None:
            return {}

        def unique_entries(field: str) -> list[dict[str, Any]]:
            entries: list[dict[str, Any]] = []
            seen: set[str] = set()
            for file_entry in manifest["files"].values():
                value = file_entry[field]
                identity = json.dumps(value, sort_keys=True)
                if identity not in seen:
                    seen.add(identity)
                    entries.append(value)
            return entries

        return {
            "ruleset": manifest.get("ruleset"),
            "scope": manifest.get("scope"),
            "sources": unique_entries("source"),
            "licenses": unique_entries("license"),
        }

    @staticmethod
    def _validate_provenance(filename: str, entry: Any) -> None:
        if not isinstance(entry, dict):
            raise CompendiumArtifactError(f"invalid manifest entry for {filename}")
        digest = entry.get("sha256")
        size = entry.get("bytes")
        source = entry.get("source")
        license_data = entry.get("license")
        if not isinstance(digest, str) or not _SHA256.fullmatch(digest):
            raise CompendiumArtifactError(f"invalid checksum for {filename}")
        if not isinstance(size, int) or size <= 0:
            raise CompendiumArtifactError(f"invalid byte count for {filename}")
        for label, value, required in (
            ("source", source, ("name", "url", "version")),
            ("license", license_data, ("id", "url", "attribution")),
        ):
            if not isinstance(value, dict) or any(
                not isinstance(value.get(field), str) or not value[field].strip()
                for field in required
            ):
                raise CompendiumArtifactError(f"incomplete {label} metadata for {filename}")

    @staticmethod
    def _verify_file(filename: str, raw: bytes, manifest: dict[str, Any]) -> None:
        entry = manifest["files"][filename]
        if len(raw) != entry["bytes"]:
            raise CompendiumArtifactError(f"byte count mismatch for {filename}")
        if hashlib.sha256(raw).hexdigest() != entry["sha256"]:
            raise CompendiumArtifactError(f"checksum mismatch for {filename}")

    @staticmethod
    def _validate_shapes(loaded: dict[str, dict[str, Any]]) -> None:
        required_keys = {
            "character_data": ("races", "classes", "backgrounds"),
            "spell_data": ("metadata", "spells"),
            "equipment_data": ("metadata", "equipment"),
            "bestiary_data": ("metadata", "monsters"),
            "feats_data": ("feats",),
        }
        for data_key, keys in required_keys.items():
            if any(key not in loaded[data_key] for key in keys):
                raise CompendiumArtifactError(f"invalid structure in {REQUIRED_FILES[data_key]}")
