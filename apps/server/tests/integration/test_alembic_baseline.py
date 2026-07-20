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
BASELINE_REVISION = "0001_postgresql_baseline"


def _config(monkeypatch, database_url: str) -> Config:
    monkeypatch.setenv("DATABASE_URL", database_url)
    return Config(ALEMBIC_INI)


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
    assert revision == BASELINE_REVISION
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
    engine = create_engine(normalize_database_url(database_url))
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

        config = _config(monkeypatch, database_url)
        command.upgrade(config, "head")
        assert set(inspect(engine).get_table_names()) == expected_tables
        command.check(config)
    finally:
        engine.dispose()
