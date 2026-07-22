import importlib.util
import json
from pathlib import Path

import pytest

SCRIPT = Path(__file__).resolve().parents[4] / "scripts" / "compendium" / "create_manifest.py"
SPEC = importlib.util.spec_from_file_location("create_compendium_manifest", SCRIPT)
assert SPEC is not None and SPEC.loader is not None
manifest_tool = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(manifest_tool)


def _write_generation(directory: Path):
    documents = {
        "character_data.json": {"races": [], "classes": [], "backgrounds": []},
        "spellbook_optimized.json": {"metadata": {}, "spells": {}},
        "equipment_data.json": {"metadata": {}, "equipment": {}},
        "bestiary_optimized.json": {"metadata": {}, "monsters": {}},
        "feats_data.json": {"feats": []},
    }
    for filename, document in documents.items():
        (directory / filename).write_text(json.dumps(document), encoding="utf-8")


def _create(directory: Path, *, replace: bool = False):
    return manifest_tool.create_manifest(
        directory,
        artifact_version="licensed-full-v1",
        ruleset="dnd5e-2014-v1",
        scope="full",
        source={"name": "Licensed source", "url": "https://example.test/source", "version": "1"},
        license_data={
            "id": "CC-BY-4.0",
            "url": "https://creativecommons.org/licenses/by/4.0/legalcode",
            "attribution": "Example attribution",
        },
        replace=replace,
    )


def test_manifest_tool_hashes_a_complete_generation(tmp_path):
    _write_generation(tmp_path)

    manifest_path = _create(tmp_path)
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))

    assert manifest["artifact_version"] == "licensed-full-v1"
    assert manifest["scope"] == "full"
    assert set(manifest["files"]) == set(manifest_tool.REQUIRED_FILES)
    assert all(len(entry["sha256"]) == 64 for entry in manifest["files"].values())


def test_manifest_tool_rejects_incomplete_or_existing_generation(tmp_path):
    _write_generation(tmp_path)
    (tmp_path / "feats_data.json").write_text("{}", encoding="utf-8")

    with pytest.raises(ValueError, match="missing required keys"):
        _create(tmp_path)

    (tmp_path / "feats_data.json").write_text('{"feats": []}', encoding="utf-8")
    _create(tmp_path)
    with pytest.raises(FileExistsError, match="--replace"):
        _create(tmp_path)
