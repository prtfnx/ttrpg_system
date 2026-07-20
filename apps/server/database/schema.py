"""Alembic-backed database schema lifecycle helpers."""

from __future__ import annotations

from pathlib import Path

from alembic import command
from alembic.config import Config
from alembic.migration import MigrationContext
from alembic.script import ScriptDirectory
from sqlalchemy import text
from sqlalchemy.engine import Connection, Engine

SERVER_ROOT = Path(__file__).resolve().parents[1]
ALEMBIC_CONFIG_PATH = SERVER_ROOT / "alembic.ini"


def alembic_config(database_url=None) -> Config:
    """Build an Alembic config without placing credentials in config or logs."""
    config = Config(ALEMBIC_CONFIG_PATH)
    if database_url is not None:
        config.attributes["database_url"] = database_url
    return config


def alembic_config_for_connection(connection: Connection) -> Config:
    config = alembic_config()
    config.attributes["connection"] = connection
    return config


def repository_heads() -> tuple[str, ...]:
    """Return the bounded revision identifiers shipped by the repository."""
    script = ScriptDirectory.from_config(alembic_config())
    return tuple(sorted(script.get_heads()))


def database_heads(connection: Connection) -> tuple[str, ...]:
    """Return the Alembic heads applied to an open database connection."""
    context = MigrationContext.configure(connection)
    return tuple(sorted(context.get_current_heads()))


def schema_is_current_for_connection(connection: Connection) -> bool:
    return database_heads(connection) == repository_heads()


def schema_is_current(engine: Engine) -> bool:
    """Return whether the database and repository have exactly the same heads."""
    with engine.connect() as connection:
        return schema_is_current_for_connection(connection)


def database_revision(engine: Engine) -> tuple[str, ...]:
    """Return applied revision identifiers without connection details."""
    with engine.connect() as connection:
        return database_heads(connection)


def upgrade_database_to_head(database_url) -> None:
    """Apply all repository migrations to the configured database."""
    command.upgrade(alembic_config(database_url), "head")


MIGRATION_ADVISORY_LOCK_ID = 0x54545250475


def migrate_database_for_start(engine: Engine) -> tuple[str, ...]:
    """Serialize PostgreSQL startup migrations and verify repository head."""
    with engine.connect() as connection:
        is_postgresql = connection.dialect.name == "postgresql"
        if is_postgresql:
            connection.execute(
                text("SELECT pg_advisory_lock(:lock_id)"),
                {"lock_id": MIGRATION_ADVISORY_LOCK_ID},
            )
            connection.commit()

        try:
            command.upgrade(alembic_config_for_connection(connection), "head")
            if not schema_is_current_for_connection(connection):
                raise RuntimeError("Database schema is not at repository head")
            return database_heads(connection)
        finally:
            if is_postgresql:
                connection.execute(
                    text("SELECT pg_advisory_unlock(:lock_id)"),
                    {"lock_id": MIGRATION_ADVISORY_LOCK_ID},
                )
                connection.commit()
