"""Cheap, deterministic readiness checks for release-critical local state."""

from pathlib import Path

from database.migrations.run_migrations import expected_migration_names
from sqlalchemy import inspect, text
from utils.logger import setup_logger

logger = setup_logger(__name__)

REQUIRED_TABLES = {
    "assets",
    "asset_upload_intents",
    "game_sessions",
    "schema_migrations",
    "session_assets",
    "users",
}


class ReadinessChecker:
    def __init__(self, settings, engine, r2_manager, static_ui_path: Path):
        self.settings = settings
        self.engine = engine
        self.r2_manager = r2_manager
        self.static_ui_path = static_ui_path

    def run(self) -> dict:
        checks = {
            "database": self._check_database(),
            "static_ui": self._check_static_ui(),
            "asset_storage": self._check_asset_storage_configuration(),
        }
        return {
            "status": "ready" if all(check["ok"] for check in checks.values()) else "not_ready",
            "checks": checks,
        }

    def _check_database(self) -> dict:
        try:
            with self.engine.connect() as connection:
                connection.execute(text("SELECT 1"))
                tables = set(inspect(connection).get_table_names())
                if REQUIRED_TABLES - tables:
                    return {"ok": False, "code": "required_schema_missing"}
                applied = [
                    row[0]
                    for row in connection.execute(
                        text("SELECT migration_name FROM schema_migrations ORDER BY id")
                    ).fetchall()
                ]
            expected = expected_migration_names()
            if applied != expected:
                return {
                    "ok": False,
                    "code": "schema_revision_mismatch",
                    "expected_revision": expected[-1] if expected else None,
                    "applied_revision": applied[-1] if applied else None,
                }
            return {"ok": True, "revision": expected[-1] if expected else None}
        except Exception:
            logger.exception(
                "Database readiness check failed",
                extra={"event_name": "readiness.database.failed", "outcome": "error"},
            )
            return {"ok": False, "code": "database_unavailable"}

    def _check_static_ui(self) -> dict:
        if not self.settings.is_production:
            return {"ok": True, "skipped": True}
        if not self.static_ui_path.is_file():
            return {"ok": False, "code": "static_ui_missing"}
        return {"ok": True}

    def _check_asset_storage_configuration(self) -> dict:
        if self.r2_manager.is_r2_configured():
            return {"ok": True}
        if self.settings.is_production:
            return {"ok": False, "code": "asset_storage_not_configured"}
        return {"ok": True, "skipped": True}
