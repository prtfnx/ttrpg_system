import os
from contextlib import redirect_stdout
from io import StringIO
from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from database.models import Base
from database.url import normalize_database_url
from sqlalchemy import create_engine, inspect, text

SERVER_ROOT = Path(__file__).resolve().parents[2]
ALEMBIC_INI = SERVER_ROOT / "alembic.ini"
HEAD_REVISION = "0003_shared_canvas_state"


def _config(monkeypatch, database_url: str) -> Config:
    monkeypatch.setenv("DATABASE_URL", database_url)
    config = Config(ALEMBIC_INI)
    config.attributes["database_url"] = database_url
    return config


def test_baseline_upgrades_an_empty_database_to_model_head(tmp_path, monkeypatch):
    database_path = tmp_path / "baseline.db"
    database_url = f"sqlite:///{database_path.as_posix()}"
    config = _config(monkeypatch, database_url)

    command.upgrade(config, "head")

    engine = create_engine(database_url)
    try:
        tables = set(inspect(engine).get_table_names())
        with engine.connect() as connection:
            revision = connection.execute(
                text("SELECT version_num FROM alembic_version")
            ).scalar_one()
    finally:
        engine.dispose()

    assert tables == set(Base.metadata.tables) | {"alembic_version"}
    assert revision == HEAD_REVISION
    command.check(config)


def test_baseline_downgrade_drops_application_schema(tmp_path, monkeypatch):
    database_path = tmp_path / "downgrade.db"
    database_url = f"sqlite:///{database_path.as_posix()}"
    config = _config(monkeypatch, database_url)

    command.upgrade(config, "head")
    command.downgrade(config, "base")

    engine = create_engine(database_url)
    try:
        assert set(inspect(engine).get_table_names()) <= {"alembic_version"}
    finally:
        engine.dispose()


def test_alembic_commands_prefer_dedicated_migration_url(tmp_path, monkeypatch):
    runtime_path = tmp_path / "runtime.db"
    migration_path = tmp_path / "migration.db"
    monkeypatch.setenv("DATABASE_URL", f"sqlite:///{runtime_path.as_posix()}")
    monkeypatch.setenv(
        "DATABASE_MIGRATION_URL",
        f"sqlite:///{migration_path.as_posix()}",
    )

    command.upgrade(Config(ALEMBIC_INI), "head")

    assert migration_path.is_file()
    assert not runtime_path.exists()


def test_baseline_compiles_for_postgresql(monkeypatch):
    config = _config(
        monkeypatch,
        "postgresql://app:placeholder@database.invalid/ttrpg?sslmode=require",
    )
    output = StringIO()

    with redirect_stdout(output):
        command.upgrade(config, "head", sql=True)

    sql = output.getvalue()
    assert "CREATE TABLE users" in sql
    assert "CREATE TABLE character_drafts" in sql
    assert "INSERT INTO alembic_version" in sql
    assert "SERIAL" in sql
    assert "PRAGMA" not in sql
    assert "schema_migrations" not in sql


@pytest.mark.skipif(
    not os.getenv("TEST_POSTGRESQL_DATABASE_URL"),
    reason="TEST_POSTGRESQL_DATABASE_URL is not configured",
)
def test_baseline_upgrades_postgresql_database_to_head(monkeypatch):
    database_url = os.environ["TEST_POSTGRESQL_DATABASE_URL"]
    normalized_url = normalize_database_url(database_url)
    assert normalized_url.database is not None
    assert (
        "test" in normalized_url.database.lower()
        or os.getenv("ALLOW_POSTGRESQL_INTEGRATION_TARGET") == "1"
    ), (
        "Refusing PostgreSQL integration tests unless the database name contains "
        "'test' or ALLOW_POSTGRESQL_INTEGRATION_TARGET=1 is explicitly set"
    )
    engine = create_engine(normalized_url)
    try:
        existing_tables = set(inspect(engine).get_table_names())
        expected_tables = set(Base.metadata.tables) | {"alembic_version"}
        unexpected_tables = existing_tables - expected_tables
        assert not unexpected_tables, (
            "TEST_POSTGRESQL_DATABASE_URL contains tables outside the application schema: "
            f"{sorted(unexpected_tables)}"
        )
        assert not existing_tables or "alembic_version" in existing_tables, (
            "Refusing to migrate a non-empty PostgreSQL database without alembic_version"
        )
        with engine.connect() as connection:
            nonempty_tables = {
                table_name: connection.execute(
                    text(f'SELECT COUNT(*) FROM "{table_name}"')
                ).scalar_one()
                for table_name in Base.metadata.tables
                if table_name in existing_tables
            }
        assert not {
            table_name: count
            for table_name, count in nonempty_tables.items()
            if count
        }, "Refusing Alembic integration test against nonempty application tables"

        config = _config(monkeypatch, database_url)
        command.upgrade(config, "head")
        assert set(inspect(engine).get_table_names()) == expected_tables
        command.check(config)
    finally:
        engine.dispose()
