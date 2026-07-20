"""Alembic migration environment."""

from __future__ import annotations

import os
from logging.config import fileConfig
from pathlib import Path

from alembic import context
from database.models import Base
from database.url import normalize_database_url
from dotenv import load_dotenv
from sqlalchemy import create_engine, pool

config = context.config
load_dotenv(Path(__file__).resolve().parents[2] / ".env", override=False)

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


def _database_url():
    raw_database_url = (
        config.attributes.get("database_url")
        or os.getenv("DATABASE_MIGRATION_URL")
        or os.getenv("DATABASE_URL")
    )
    if not raw_database_url:
        raise RuntimeError(
            "DATABASE_MIGRATION_URL or DATABASE_URL is required for Alembic commands"
        )
    return normalize_database_url(raw_database_url)


def run_migrations_offline() -> None:
    """Run migrations without creating an Engine."""
    context.configure(
        url=_database_url(),
        target_metadata=target_metadata,
        literal_binds=True,
        compare_type=True,
        dialect_opts={"paramstyle": "named"},
    )

    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """Run migrations against the configured database."""
    supplied_connection = config.attributes.get("connection")
    if supplied_connection is not None:
        context.configure(
            connection=supplied_connection,
            target_metadata=target_metadata,
            compare_type=True,
        )
        with context.begin_transaction():
            context.run_migrations()
        return

    connectable = create_engine(
        _database_url(),
        poolclass=pool.NullPool,
        pool_pre_ping=True,
    )

    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            compare_type=True,
        )

        with context.begin_transaction():
            context.run_migrations()

    connectable.dispose()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
