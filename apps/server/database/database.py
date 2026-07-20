"""Database engine, session factory, and explicit schema lifecycle."""

from __future__ import annotations

from collections.abc import Iterator
from typing import Any

from config import Settings
from sqlalchemy import create_engine, event
from sqlalchemy.engine import URL, Engine
from sqlalchemy.orm import Session, sessionmaker
from utils.observability import install_database_metrics

from .schema import schema_is_current as _schema_is_current
from .schema import upgrade_database_to_head
from .url import normalize_database_url


def _engine_options(settings: Settings, url: URL) -> dict[str, Any]:
    backend = url.get_backend_name()
    options: dict[str, Any] = {"pool_pre_ping": True}
    if backend == "postgresql":
        options.update(
            pool_size=settings.DB_POOL_SIZE,
            max_overflow=settings.DB_MAX_OVERFLOW,
            pool_timeout=settings.DB_POOL_TIMEOUT_SECONDS,
            connect_args={"connect_timeout": settings.DB_CONNECT_TIMEOUT_SECONDS},
        )
    elif backend == "sqlite":
        options["connect_args"] = {"check_same_thread": False, "timeout": 30}
    else:
        raise ValueError(f"Unsupported database backend: {backend}")
    return options


def create_database_engine(
    settings: Settings,
    database_url: str | URL | None = None,
) -> Engine:
    """Build a database engine with dialect-specific connection behavior."""
    url = normalize_database_url(database_url or settings.DATABASE_URL)
    database_engine = create_engine(url, **_engine_options(settings, url))

    if url.get_backend_name() == "sqlite":

        @event.listens_for(database_engine, "connect")
        def _configure_sqlite_connection(dbapi_connection, connection_record) -> None:
            """Make SQLite integrity and writer behavior explicit."""
            del connection_record
            cursor = dbapi_connection.cursor()
            try:
                cursor.execute("PRAGMA foreign_keys=ON")
                cursor.execute("PRAGMA busy_timeout=30000")
                if url.database not in {None, "", ":memory:"}:
                    cursor.execute("PRAGMA journal_mode=WAL")
            finally:
                cursor.close()

    return database_engine


def create_migration_engine(settings: Settings) -> Engine:
    """Build the short-lived schema-owner engine used only by Alembic."""
    database_url = settings.DATABASE_MIGRATION_URL or settings.DATABASE_URL
    return create_database_engine(settings, database_url)


database_settings = Settings()
DATABASE_URL = database_settings.DATABASE_URL
engine = create_database_engine(database_settings)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

install_database_metrics(engine, SessionLocal)


def provision_database() -> None:
    """Upgrade the configured database to the repository's Alembic head."""
    database_url = (
        database_settings.DATABASE_MIGRATION_URL
        or database_settings.DATABASE_URL
    )
    upgrade_database_to_head(normalize_database_url(database_url))


def schema_is_current() -> bool:
    return _schema_is_current(engine)


def get_db() -> Iterator[Session]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db():
    """Explicitly provision a development database and optional seed account."""
    provision_database()

    db = SessionLocal()
    try:
        from .crud import create_user, get_user_by_username
        from .schemas import UserCreate

        if not get_user_by_username(db, "johndoe"):
            create_user(
                db,
                UserCreate(
                    username="johndoe",
                    email="johndoe@example.com",
                    full_name="John Doe",
                    password="secret",
                ),
            )
    finally:
        db.close()
