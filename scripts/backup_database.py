#!/usr/bin/env python3
"""Create, verify, and atomically restore SQLite backup sets."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import shutil
import sqlite3
import subprocess
import sys
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import unquote

REPO_ROOT = Path(__file__).resolve().parents[1]
SERVER_ROOT = REPO_ROOT / "apps" / "server"
if str(SERVER_ROOT) not in sys.path:
    sys.path.insert(0, str(SERVER_ROOT))

from utils.audit import persist_operational_event  # noqa: E402

DEFAULT_DATABASE = REPO_ROOT / "apps" / "server" / "ttrpg.db"
DEFAULT_BACKUP_ROOT = REPO_ROOT / "backups"
_BACKUP_SET_ID = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$")


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _database_path(value: str | Path | None) -> Path:
    if value:
        return Path(value).expanduser().resolve()
    database_url = os.getenv("DATABASE_URL", "")
    if not database_url:
        return DEFAULT_DATABASE.resolve()
    prefix = "sqlite:///"
    if not database_url.startswith(prefix):
        raise ValueError("Only SQLite backup sets are supported; use provider-native tooling")
    raw_path = unquote(database_url.removeprefix(prefix))
    if not raw_path or raw_path == ":memory:":
        raise ValueError("A file-backed SQLite DATABASE_URL is required")
    path = Path(raw_path)
    if not path.is_absolute():
        path = REPO_ROOT / "apps" / "server" / path
    return path.resolve()


def _inspect_database(path: Path) -> dict:
    if not path.is_file() or path.stat().st_size == 0:
        raise ValueError(f"Database backup is missing or empty: {path}")
    connection = sqlite3.connect(f"file:{path.as_posix()}?mode=ro", uri=True)
    try:
        quick_check = connection.execute("PRAGMA quick_check").fetchone()[0]
        if quick_check != "ok":
            raise ValueError(f"SQLite quick_check failed: {quick_check}")
        foreign_key_errors = connection.execute("PRAGMA foreign_key_check").fetchall()
        if foreign_key_errors:
            raise ValueError(f"SQLite foreign_key_check found {len(foreign_key_errors)} violation(s)")
        table = connection.execute(
            "SELECT 1 FROM sqlite_master WHERE type='table' AND name='schema_migrations'"
        ).fetchone()
        migrations = []
        if table:
            migrations = [
                row[0]
                for row in connection.execute(
                    "SELECT migration_name FROM schema_migrations ORDER BY id"
                ).fetchall()
            ]
        return {"quick_check": "ok", "foreign_key_errors": 0, "migrations": migrations}
    finally:
        connection.close()


def _git_commit() -> str:
    override = os.getenv("RENDER_GIT_COMMIT")
    if override:
        return override
    try:
        return subprocess.run(
            ["git", "rev-parse", "HEAD"],
            cwd=REPO_ROOT,
            check=True,
            capture_output=True,
            text=True,
        ).stdout.strip()
    except (OSError, subprocess.CalledProcessError):
        return "unknown"


class SQLiteBackupSet:
    def __init__(self, database: Path, backup_root: Path = DEFAULT_BACKUP_ROOT):
        self.database = database.resolve()
        self.backup_root = backup_root.resolve()

    def create(self, backup_set_id: str | None = None, *, r2_snapshot: str | None = None) -> Path:
        backup_set_id = backup_set_id or datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
        if not _BACKUP_SET_ID.fullmatch(backup_set_id):
            raise ValueError("Invalid backup-set ID")
        if not self.database.is_file():
            raise FileNotFoundError(f"Database not found: {self.database}")

        destination = self.backup_root / backup_set_id
        destination.mkdir(parents=True, exist_ok=False)
        database_backup = destination / "database.sqlite3"
        temporary = destination / ".database.sqlite3.tmp"
        try:
            source = sqlite3.connect(str(self.database))
            target = sqlite3.connect(str(temporary))
            try:
                source.backup(target)
            finally:
                target.close()
                source.close()
            inspection = _inspect_database(temporary)
            temporary.replace(database_backup)
            database_backup.chmod(0o600)
            manifest = {
                "schema_version": 1,
                "backup_set_id": backup_set_id,
                "created_at": datetime.now(timezone.utc).isoformat(),
                "application_commit": _git_commit(),
                "database": {
                    "filename": database_backup.name,
                    "bytes": database_backup.stat().st_size,
                    "sha256": _sha256(database_backup),
                    **inspection,
                },
                "r2_snapshot": r2_snapshot or backup_set_id,
            }
            manifest_path = destination / "manifest.json"
            manifest_path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
            manifest_path.chmod(0o600)
            return manifest_path
        except Exception:
            shutil.rmtree(destination, ignore_errors=True)
            raise

    @staticmethod
    def verify(manifest_path: Path) -> dict:
        manifest_path = manifest_path.resolve()
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        if manifest.get("schema_version") != 1:
            raise ValueError("Unsupported backup manifest schema")
        backup_set_id = manifest.get("backup_set_id")
        if not isinstance(backup_set_id, str) or not _BACKUP_SET_ID.fullmatch(backup_set_id):
            raise ValueError("Invalid backup-set ID in manifest")
        database = manifest.get("database")
        if not isinstance(database, dict) or database.get("filename") != "database.sqlite3":
            raise ValueError("Invalid database entry in backup manifest")
        backup_path = manifest_path.parent / database["filename"]
        if backup_path.stat().st_size != database.get("bytes"):
            raise ValueError("Database backup byte count does not match manifest")
        if _sha256(backup_path) != database.get("sha256"):
            raise ValueError("Database backup checksum does not match manifest")
        inspection = _inspect_database(backup_path)
        if inspection["migrations"] != database.get("migrations"):
            raise ValueError("Database migration ledger does not match manifest")
        return manifest

    def restore(self, manifest_path: Path, *, apply: bool = False) -> dict:
        manifest = self.verify(manifest_path)
        if not apply:
            return {"backup_set_id": manifest["backup_set_id"], "verified": True, "dry_run": True}

        self.database.parent.mkdir(parents=True, exist_ok=True)
        if self.database.exists():
            pre_restore_id = datetime.now(timezone.utc).strftime("pre-restore-%Y%m%dT%H%M%S%fZ")
            self.create(pre_restore_id, r2_snapshot="not-applicable")
        source = manifest_path.resolve().parent / manifest["database"]["filename"]
        descriptor, temporary_name = tempfile.mkstemp(
            prefix=f".{self.database.name}.", suffix=".restore", dir=self.database.parent
        )
        os.close(descriptor)
        temporary = Path(temporary_name)
        try:
            source_connection = sqlite3.connect(str(source))
            target_connection = sqlite3.connect(str(temporary))
            try:
                source_connection.backup(target_connection)
            finally:
                target_connection.close()
                source_connection.close()
            _inspect_database(temporary)
            os.replace(temporary, self.database)
        finally:
            temporary.unlink(missing_ok=True)
        return {"backup_set_id": manifest["backup_set_id"], "verified": True, "dry_run": False}


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Verified SQLite backup-set operations")
    subparsers = parser.add_subparsers(dest="command", required=True)
    backup = subparsers.add_parser("backup")
    backup.add_argument("--database", type=Path)
    backup.add_argument("--output-dir", type=Path, default=DEFAULT_BACKUP_ROOT)
    backup.add_argument("--backup-set-id")
    backup.add_argument("--r2-snapshot")
    verify = subparsers.add_parser("verify")
    verify.add_argument("--manifest", type=Path, required=True)
    restore = subparsers.add_parser("restore")
    restore.add_argument("--manifest", type=Path, required=True)
    restore.add_argument("--database", type=Path)
    restore.add_argument("--output-dir", type=Path, default=DEFAULT_BACKUP_ROOT)
    restore.add_argument("--apply", action="store_true")
    return parser


def main() -> int:
    args = _parser().parse_args()
    action = f"database.{args.command}"
    try:
        if args.command == "verify":
            result = SQLiteBackupSet.verify(args.manifest)
        else:
            manager = SQLiteBackupSet(_database_path(args.database), args.output_dir)
            if args.command == "backup":
                manifest_path = manager.create(args.backup_set_id, r2_snapshot=args.r2_snapshot)
                result = SQLiteBackupSet.verify(manifest_path)
                result["manifest_path"] = str(manifest_path)
            else:
                result = manager.restore(args.manifest, apply=args.apply)
    except Exception:
        persist_operational_event(
            action,
            "failure",
            target_type="database_backup",
            fail_closed=False,
        )
        raise

    persist_operational_event(
        action,
        "success",
        target_type="database_backup",
        details={
            "backup_set_id": result.get("backup_set_id"),
            "dry_run": result.get("dry_run"),
        },
    )
    print(json.dumps(result, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
