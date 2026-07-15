import importlib.util
import json
import sqlite3
from pathlib import Path

import pytest

SCRIPT_PATH = Path(__file__).resolve().parents[4] / "scripts" / "backup_database.py"
spec = importlib.util.spec_from_file_location("backup_database", SCRIPT_PATH)
backup_database = importlib.util.module_from_spec(spec)
assert spec and spec.loader
spec.loader.exec_module(backup_database)


def _database(path: Path, value: str) -> None:
    connection = sqlite3.connect(path)
    connection.executescript(
        "CREATE TABLE schema_migrations (id INTEGER PRIMARY KEY, migration_name TEXT);"
        "CREATE TABLE records (value TEXT);"
    )
    connection.execute("INSERT INTO schema_migrations VALUES (1, '001_initial.sql')")
    connection.execute("INSERT INTO records VALUES (?)", (value,))
    connection.commit()
    connection.close()


def _value(path: Path) -> str:
    connection = sqlite3.connect(path)
    try:
        return connection.execute("SELECT value FROM records").fetchone()[0]
    finally:
        connection.close()


def test_backup_set_records_and_verifies_integrity(tmp_path, monkeypatch):
    database = tmp_path / "active.sqlite3"
    _database(database, "before")
    monkeypatch.setattr(backup_database, "_git_commit", lambda: "abc123")
    manager = backup_database.SQLiteBackupSet(database, tmp_path / "backups")

    manifest_path = manager.create("release-1", r2_snapshot="release-1")
    manifest = manager.verify(manifest_path)

    assert manifest["application_commit"] == "abc123"
    assert manifest["r2_snapshot"] == "release-1"
    assert manifest["database"]["bytes"] > 0
    assert manifest["database"]["quick_check"] == "ok"
    assert manifest["database"]["migrations"] == ["001_initial.sql"]


def test_backup_verification_rejects_tampering(tmp_path):
    database = tmp_path / "active.sqlite3"
    _database(database, "before")
    manager = backup_database.SQLiteBackupSet(database, tmp_path / "backups")
    manifest_path = manager.create("release-1")
    backup_path = manifest_path.parent / "database.sqlite3"
    backup_path.write_bytes(backup_path.read_bytes() + b"tampered")

    with pytest.raises(ValueError, match="byte count"):
        manager.verify(manifest_path)


def test_restore_is_verified_dry_run_then_atomic_apply(tmp_path):
    database = tmp_path / "active.sqlite3"
    _database(database, "before")
    backup_root = tmp_path / "backups"
    manager = backup_database.SQLiteBackupSet(database, backup_root)
    manifest_path = manager.create("release-1")
    database.unlink()
    _database(database, "after")

    assert manager.restore(manifest_path) == {
        "backup_set_id": "release-1",
        "verified": True,
        "dry_run": True,
    }
    assert _value(database) == "after"

    result = manager.restore(manifest_path, apply=True)

    assert result["dry_run"] is False
    assert _value(database) == "before"
    assert list(backup_root.glob("pre-restore-*/manifest.json"))


def test_manifest_database_path_cannot_escape_backup_set(tmp_path):
    database = tmp_path / "active.sqlite3"
    _database(database, "before")
    manager = backup_database.SQLiteBackupSet(database, tmp_path / "backups")
    manifest_path = manager.create("release-1")
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    manifest["database"]["filename"] = "../active.sqlite3"
    manifest_path.write_text(json.dumps(manifest), encoding="utf-8")

    with pytest.raises(ValueError, match="Invalid database entry"):
        manager.verify(manifest_path)


def test_relative_database_url_resolves_from_server_root(monkeypatch):
    monkeypatch.setenv("DATABASE_URL", "sqlite:///./data/ttrpg.db")

    path = backup_database._database_path(None)

    assert path == (backup_database.REPO_ROOT / "apps/server/data/ttrpg.db").resolve()


def test_non_sqlite_database_requires_provider_tooling(monkeypatch):
    monkeypatch.setenv("DATABASE_URL", "postgresql://database.example/test")

    with pytest.raises(ValueError, match="provider-native"):
        backup_database._database_path(None)
