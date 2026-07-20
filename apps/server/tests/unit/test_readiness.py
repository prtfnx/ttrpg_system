import hashlib
import json
from pathlib import Path
from types import SimpleNamespace

from database.schema import repository_heads
from service.compendium_artifact import CompendiumArtifact, REQUIRED_FILES
from service.readiness import ReadinessChecker
from sqlalchemy import create_engine, text


class FakeR2Manager:
    def __init__(self, configured=True):
        self.configured = configured

    def is_r2_configured(self):
        return self.configured


class FakeCompendiumArtifact:
    def __init__(self, *, verified=True, ok=True):
        self.verified = verified
        self.ok = ok

    def readiness(self):
        if not self.ok:
            return {"ok": False, "code": "compendium_artifact_invalid"}
        return {"ok": True, "verified": self.verified, "artifact_version": "test-v1"}


def _engine_at_head(*, omit_last_migration=False):
    engine = create_engine("sqlite:///:memory:")
    with engine.begin() as connection:
        for table in (
            "assets",
            "asset_upload_intents",
            "game_sessions",
            "session_assets",
            "users",
        ):
            connection.execute(text(f"CREATE TABLE {table} (id INTEGER PRIMARY KEY)"))
        connection.execute(text("CREATE TABLE alembic_version (version_num VARCHAR(32) PRIMARY KEY)"))
        names = repository_heads()
        if not omit_last_migration:
            connection.execute(
                text("INSERT INTO alembic_version (version_num) VALUES (:name)"),
                {"name": names[0]},
            )
    return engine


def _settings(production=True):
    return SimpleNamespace(is_production=production)


def test_production_readiness_passes_at_schema_head(tmp_path):
    static_ui = tmp_path / "index.html"
    static_ui.write_text("ready", encoding="utf-8")
    checker = ReadinessChecker(
        _settings(), _engine_at_head(), FakeR2Manager(), static_ui, FakeCompendiumArtifact()
    )

    result = checker.run()

    assert result["status"] == "ready"
    assert result["checks"]["database"]["revision"] == repository_heads()[0]


def test_readiness_rejects_schema_behind_head(tmp_path):
    static_ui = tmp_path / "index.html"
    static_ui.write_text("ready", encoding="utf-8")
    checker = ReadinessChecker(
        _settings(), _engine_at_head(omit_last_migration=True), FakeR2Manager(), static_ui,
        FakeCompendiumArtifact()
    )

    result = checker.run()

    assert result["status"] == "not_ready"
    assert result["checks"]["database"]["code"] == "schema_revision_mismatch"


def test_database_failure_is_bounded_and_does_not_log_connection_details(tmp_path, caplog):
    class UnavailableEngine:
        def connect(self):
            raise RuntimeError("postgresql://role:secret@database.example/ttrpg")

    checker = ReadinessChecker(
        _settings(production=False),
        UnavailableEngine(),
        FakeR2Manager(configured=False),
        tmp_path / "missing.html",
        FakeCompendiumArtifact(),
    )

    result = checker._check_database()

    assert result == {"ok": False, "code": "database_unavailable"}
    assert "secret" not in caplog.text
    assert "database.example" not in caplog.text


def test_production_readiness_reports_missing_r2_configuration(tmp_path):
    static_ui = tmp_path / "index.html"
    static_ui.write_text("ready", encoding="utf-8")
    checker = ReadinessChecker(
        _settings(), _engine_at_head(), FakeR2Manager(configured=False), static_ui,
        FakeCompendiumArtifact()
    )

    result = checker.run()

    assert result["status"] == "not_ready"
    assert result["checks"]["asset_storage"]["code"] == "asset_storage_not_configured"


def test_development_skips_optional_ui_and_r2_checks():
    checker = ReadinessChecker(
        _settings(production=False),
        _engine_at_head(),
        FakeR2Manager(configured=False),
        Path("missing.html"), FakeCompendiumArtifact(verified=False),
    )

    result = checker.run()

    assert result["status"] == "ready"
    assert result["checks"]["static_ui"]["skipped"] is True
    assert result["checks"]["asset_storage"]["skipped"] is True
    assert result["checks"]["compendium"]["skipped"] is True


def test_production_readiness_rejects_unverified_compendium(tmp_path):
    static_ui = tmp_path / "index.html"
    static_ui.write_text("ready", encoding="utf-8")
    checker = ReadinessChecker(
        _settings(), _engine_at_head(), FakeR2Manager(), static_ui,
        FakeCompendiumArtifact(verified=False),
    )

    result = checker.run()

    assert result["status"] == "not_ready"
    assert result["checks"]["compendium"]["code"] == "compendium_manifest_required"


def _write_compendium_artifact(directory: Path):
    documents = {
        "character_data.json": {"races": [], "classes": [], "backgrounds": []},
        "spellbook_optimized.json": {"metadata": {}, "spells": {}},
        "equipment_data.json": {"metadata": {}, "equipment": {}},
        "bestiary_optimized.json": {"metadata": {}, "monsters": {}},
        "feats_data.json": {"feats": []},
    }
    files = {}
    for filename, document in documents.items():
        raw = json.dumps(document).encode("utf-8")
        (directory / filename).write_bytes(raw)
        files[filename] = {
            "sha256": hashlib.sha256(raw).hexdigest(),
            "bytes": len(raw),
            "source": {"name": "SRD", "url": "https://example.test/source", "version": "5.1"},
            "license": {
                "id": "CC-BY-4.0",
                "url": "https://creativecommons.org/licenses/by/4.0/",
                "attribution": "Example test data",
            },
        }
    manifest = {"schema_version": 1, "artifact_version": "test-v1", "files": files}
    (directory / "manifest.json").write_text(json.dumps(manifest), encoding="utf-8")


def test_compendium_artifact_verifies_complete_manifest(tmp_path):
    _write_compendium_artifact(tmp_path)

    artifact = CompendiumArtifact(tmp_path, require_manifest=True)

    assert artifact.readiness() == {
        "ok": True,
        "artifact_version": "test-v1",
        "verified": True,
    }
    assert set(artifact.data) == set(REQUIRED_FILES)


def test_compendium_artifact_rejects_checksum_mismatch_atomically(tmp_path):
    _write_compendium_artifact(tmp_path)
    (tmp_path / "feats_data.json").write_text('{"feats": [{"name": "changed"}]}', encoding="utf-8")

    artifact = CompendiumArtifact(tmp_path, require_manifest=True)

    assert artifact.data == {}
    assert artifact.readiness() == {"ok": False, "code": "compendium_artifact_invalid"}
