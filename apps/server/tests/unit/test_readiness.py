from pathlib import Path
from types import SimpleNamespace

from database.migrations.run_migrations import expected_migration_names
from service.readiness import ReadinessChecker
from sqlalchemy import create_engine, text


class FakeR2Manager:
    def __init__(self, configured=True):
        self.configured = configured

    def is_r2_configured(self):
        return self.configured


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
        connection.execute(
            text(
                "CREATE TABLE schema_migrations ("
                "id INTEGER PRIMARY KEY AUTOINCREMENT, migration_name VARCHAR(255) UNIQUE NOT NULL)"
            )
        )
        names = expected_migration_names()
        if omit_last_migration:
            names = names[:-1]
        for name in names:
            connection.execute(
                text("INSERT INTO schema_migrations (migration_name) VALUES (:name)"),
                {"name": name},
            )
    return engine


def _settings(production=True):
    return SimpleNamespace(is_production=production)


def test_production_readiness_passes_at_schema_head(tmp_path):
    static_ui = tmp_path / "index.html"
    static_ui.write_text("ready", encoding="utf-8")
    checker = ReadinessChecker(
        _settings(), _engine_at_head(), FakeR2Manager(), static_ui
    )

    result = checker.run()

    assert result["status"] == "ready"
    assert result["checks"]["database"]["revision"] == expected_migration_names()[-1]


def test_readiness_rejects_schema_behind_head(tmp_path):
    static_ui = tmp_path / "index.html"
    static_ui.write_text("ready", encoding="utf-8")
    checker = ReadinessChecker(
        _settings(), _engine_at_head(omit_last_migration=True), FakeR2Manager(), static_ui
    )

    result = checker.run()

    assert result["status"] == "not_ready"
    assert result["checks"]["database"]["code"] == "schema_revision_mismatch"


def test_production_readiness_reports_missing_r2_configuration(tmp_path):
    static_ui = tmp_path / "index.html"
    static_ui.write_text("ready", encoding="utf-8")
    checker = ReadinessChecker(
        _settings(), _engine_at_head(), FakeR2Manager(configured=False), static_ui
    )

    result = checker.run()

    assert result["status"] == "not_ready"
    assert result["checks"]["asset_storage"]["code"] == "asset_storage_not_configured"


def test_development_skips_optional_ui_and_r2_checks():
    checker = ReadinessChecker(
        _settings(production=False),
        _engine_at_head(),
        FakeR2Manager(configured=False),
        Path("missing.html"),
    )

    result = checker.run()

    assert result["status"] == "ready"
    assert result["checks"]["static_ui"]["skipped"] is True
    assert result["checks"]["asset_storage"]["skipped"] is True
