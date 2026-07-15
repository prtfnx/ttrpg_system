"""Strict SQLite schema runner used by release and readiness workflows."""

from __future__ import annotations

import argparse
import importlib
import os
import sqlite3
import sys
import time
from pathlib import Path

SERVER_DIR = Path(__file__).resolve().parents[2]
if str(SERVER_DIR) not in sys.path:
    sys.path.insert(0, str(SERVER_DIR))

from utils.logger import setup_logger

logger = setup_logger(__name__)


def expected_migration_names() -> list[str]:
    migrations_dir = Path(__file__).parent
    return [path.stem for path in sorted(migrations_dir.glob("[0-9][0-9][0-9]_*.py"))]


class MigrationRunner:
    def __init__(self, db_path: str):
        self.db_path = str(Path(db_path).resolve())
        self.migrations_dir = Path(__file__).parent

    def migration_names(self) -> list[str]:
        return expected_migration_names()

    def ensure_migrations_table(self) -> None:
        with sqlite3.connect(self.db_path) as connection:
            connection.execute(
                """
                CREATE TABLE IF NOT EXISTS schema_migrations (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    migration_name VARCHAR(255) UNIQUE NOT NULL,
                    applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
                """
            )

    def get_applied_migrations(self) -> list[str]:
        with sqlite3.connect(self.db_path) as connection:
            exists = connection.execute(
                "SELECT 1 FROM sqlite_master WHERE type='table' AND name='schema_migrations'"
            ).fetchone()
            if not exists:
                return []
            return [
                row[0]
                for row in connection.execute(
                    "SELECT migration_name FROM schema_migrations ORDER BY id"
                ).fetchall()
            ]

    def mark_migration_applied(self, migration_name: str) -> None:
        with sqlite3.connect(self.db_path) as connection:
            connection.execute(
                "INSERT OR IGNORE INTO schema_migrations (migration_name) VALUES (?)",
                (migration_name,),
            )

    def schema_status(self) -> dict[str, list[str] | bool]:
        expected = self.migration_names()
        applied = self.get_applied_migrations()
        return {
            "current": applied == expected,
            "missing": [name for name in expected if name not in applied],
            "unexpected": [name for name in applied if name not in expected],
        }

    def _has_application_schema(self) -> bool:
        if not Path(self.db_path).exists() or Path(self.db_path).stat().st_size == 0:
            return False
        with sqlite3.connect(self.db_path) as connection:
            tables = {
                row[0]
                for row in connection.execute(
                    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
                )
            }
        return bool(tables - {"schema_migrations"})

    def _bootstrap_current_schema(self) -> None:
        from sqlalchemy import create_engine

        from database.models import Base

        bootstrap_engine = create_engine(f"sqlite:///{Path(self.db_path).as_posix()}")
        try:
            Base.metadata.create_all(bind=bootstrap_engine)
        finally:
            bootstrap_engine.dispose()
        self.ensure_migrations_table()
        for migration_name in self.migration_names():
            self.mark_migration_applied(migration_name)
        logger.info(
            "Fresh database schema bootstrapped at migration head",
            extra={"event_name": "database.schema.bootstrapped"},
        )

    def provision(self) -> bool:
        """Create a fresh schema or apply every pending numbered migration."""
        Path(self.db_path).parent.mkdir(parents=True, exist_ok=True)
        if not self._has_application_schema():
            self._bootstrap_current_schema()
            return True
        return self.run_migrations()

    def run_migrations(self) -> bool:
        if not Path(self.db_path).is_file():
            logger.error(
                "Migration database does not exist",
                extra={"event_name": "database.migration.failed", "reason": "missing_database"},
            )
            return False

        self.ensure_migrations_table()
        applied = set(self.get_applied_migrations())
        expected = self.migration_names()
        unexpected = sorted(applied - set(expected))
        if unexpected:
            logger.error(
                "Database has unknown migration revisions",
                extra={
                    "event_name": "database.migration.failed",
                    "reason": "schema_ahead",
                    "unexpected_revisions": unexpected,
                },
            )
            return False

        for migration_name in expected:
            if migration_name in applied:
                continue
            try:
                migration_module = importlib.import_module(
                    f"database.migrations.{migration_name}"
                )
                migration_module.upgrade(self.db_path)
                self.mark_migration_applied(migration_name)
                logger.info(
                    "Database migration applied",
                    extra={
                        "event_name": "database.migration.applied",
                        "migration": migration_name,
                    },
                )
            except Exception:
                logger.exception(
                    "Database migration failed",
                    extra={
                        "event_name": "database.migration.failed",
                        "migration": migration_name,
                    },
                )
                return False
        return bool(self.schema_status()["current"])

    def create_verified_backup(self) -> Path:
        """Create and verify a consistent online SQLite backup before upgrade."""
        backup_path = Path(f"{self.db_path}.backup_{int(time.time())}")
        with sqlite3.connect(self.db_path) as source, sqlite3.connect(backup_path) as target:
            source.backup(target)
            integrity = target.execute("PRAGMA integrity_check").fetchone()
            if not integrity or integrity[0] != "ok":
                raise RuntimeError("Backup integrity verification failed")
        if backup_path.stat().st_size == 0:
            raise RuntimeError("Backup is empty")
        return backup_path


def sqlite_path_from_database_url(database_url: str) -> str:
    from sqlalchemy.engine import make_url

    url = make_url(database_url)
    if url.get_backend_name() != "sqlite" or not url.database or url.database == ":memory:":
        raise ValueError("The numbered migration runner requires a file-backed SQLite DATABASE_URL")
    return str(Path(url.database).resolve())


def main() -> int:
    parser = argparse.ArgumentParser(description="Provision or verify the SQLite schema")
    parser.add_argument("--check", action="store_true", help="Only verify migration head")
    parser.add_argument("--no-backup", action="store_true", help="Skip pre-upgrade backup")
    args = parser.parse_args()

    from database.database import DATABASE_URL

    try:
        runner = MigrationRunner(sqlite_path_from_database_url(DATABASE_URL))
        if args.check:
            return 0 if runner.schema_status()["current"] else 1
        if runner._has_application_schema() and not args.no_backup:
            backup_path = runner.create_verified_backup()
            logger.info(
                "Pre-migration backup verified",
                extra={"event_name": "database.backup.verified", "backup_path": str(backup_path)},
            )
        return 0 if runner.provision() else 1
    except Exception:
        logger.exception(
            "Database provisioning failed",
            extra={"event_name": "database.provision.failed", "outcome": "error"},
        )
        return 1


if __name__ == "__main__":
    sys.exit(main())
