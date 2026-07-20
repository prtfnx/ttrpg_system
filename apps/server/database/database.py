"""Database engine, session factory, and explicit schema lifecycle."""

from __future__ import annotations

from collections.abc import Iterator
from typing import Any

from sqlalchemy import create_engine, event
from sqlalchemy.engine import Engine, URL, make_url
from sqlalchemy.orm import Session, sessionmaker

from config import Settings
from .models import Base


def normalize_database_url(raw_database_url: str) -> URL:
    """Return a SQLAlchemy URL using Psycopg 3 for provider PostgreSQL URLs."""
    url = make_url(raw_database_url)
    if url.drivername == "postgresql":
        return url.set(drivername="postgresql+psycopg")
    return url


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


def create_database_engine(settings: Settings) -> Engine:
    """Build a database engine with dialect-specific connection behavior."""
    url = normalize_database_url(settings.DATABASE_URL)
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


database_settings = Settings()
DATABASE_URL = database_settings.DATABASE_URL
engine = create_database_engine(database_settings)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

from utils.observability import install_database_metrics

install_database_metrics(engine, SessionLocal)


def provision_database() -> None:
    """Provision the file-backed SQLite schema through the single numbered runner."""
    from .migrations.run_migrations import MigrationRunner, sqlite_path_from_database_url

    runner = MigrationRunner(sqlite_path_from_database_url(DATABASE_URL))
    if not runner.provision():
        raise RuntimeError("Database schema provisioning failed")


def schema_is_current() -> bool:
    from .migrations.run_migrations import MigrationRunner, sqlite_path_from_database_url

    runner = MigrationRunner(sqlite_path_from_database_url(DATABASE_URL))
    return bool(runner.schema_status()["current"])


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
