"""Database engine, session factory, and explicit schema lifecycle."""

from __future__ import annotations

import os

from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker

from .models import Base

current_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB_PATH = os.path.join(current_dir, "ttrpg.db")
DATABASE_URL = os.getenv("DATABASE_URL", f"sqlite:///{DB_PATH}")

engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False, "timeout": 30} if "sqlite" in DATABASE_URL else {},
    pool_pre_ping=True,
)


@event.listens_for(engine, "connect")
def _configure_sqlite_connection(dbapi_connection, connection_record) -> None:
    """Make SQLite integrity and writer behavior explicit on every connection."""
    if dbapi_connection.__class__.__module__.split(".")[0] != "sqlite3":
        return
    cursor = dbapi_connection.cursor()
    try:
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.execute("PRAGMA busy_timeout=30000")
        cursor.execute("PRAGMA journal_mode=WAL")
    finally:
        cursor.close()


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


def get_db():
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
