"""PostgreSQL-only schema, constraint, and locking contracts."""

from __future__ import annotations

import os
import threading
import time
import uuid
from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from database.models import Base
from database.schema import repository_heads, schema_is_current
from database.url import normalize_database_url
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.exc import IntegrityError

SERVER_ROOT = Path(__file__).resolve().parents[2]
ALEMBIC_INI = SERVER_ROOT / "alembic.ini"
POSTGRESQL_URL = os.getenv("TEST_POSTGRESQL_DATABASE_URL")

pytestmark = [
    pytest.mark.integration,
    pytest.mark.skipif(
        not POSTGRESQL_URL,
        reason="TEST_POSTGRESQL_DATABASE_URL is not configured",
    ),
]


@pytest.fixture(scope="module")
def postgresql_engine():
    engine = create_engine(normalize_database_url(POSTGRESQL_URL), pool_pre_ping=True)
    expected_tables = set(Base.metadata.tables) | {"alembic_version"}
    existing_tables = set(inspect(engine).get_table_names())
    unexpected_tables = existing_tables - expected_tables
    assert not unexpected_tables, (
        "TEST_POSTGRESQL_DATABASE_URL contains tables outside the application schema: "
        f"{sorted(unexpected_tables)}"
    )
    assert not existing_tables or "alembic_version" in existing_tables, (
        "Refusing to migrate a non-empty PostgreSQL database without alembic_version"
    )

    config = Config(ALEMBIC_INI)
    config.attributes["database_url"] = POSTGRESQL_URL
    command.upgrade(config, "head")

    try:
        yield engine
    finally:
        engine.dispose()


def _constraint_names(inspector, table_name: str) -> set[str]:
    names = {
        inspector.get_pk_constraint(table_name).get("name"),
        *(item.get("name") for item in inspector.get_foreign_keys(table_name)),
        *(item.get("name") for item in inspector.get_unique_constraints(table_name)),
        *(item.get("name") for item in inspector.get_indexes(table_name)),
    }
    return {name for name in names if name}


def test_postgresql_schema_is_at_head_with_bounded_identifiers(postgresql_engine):
    inspector = inspect(postgresql_engine)

    assert postgresql_engine.dialect.name == "postgresql"
    assert schema_is_current(postgresql_engine)
    assert repository_heads() == ("0001_postgresql_baseline",)
    assert set(inspector.get_table_names()) == set(Base.metadata.tables) | {
        "alembic_version"
    }

    for table_name in Base.metadata.tables:
        for constraint_name in _constraint_names(inspector, table_name):
            assert len(constraint_name.encode("utf-8")) <= 63


def test_postgresql_foreign_key_actions_match_character_contract(postgresql_engine):
    inspector = inspect(postgresql_engine)
    permission_keys = {
        tuple(item["constrained_columns"]): item
        for item in inspector.get_foreign_keys("character_permissions")
    }
    draft_keys = {
        tuple(item["constrained_columns"]): item
        for item in inspector.get_foreign_keys("character_drafts")
    }

    assert permission_keys[("character_id",)]["options"]["ondelete"] == "CASCADE"
    assert permission_keys[("session_id",)]["options"]["ondelete"] == "CASCADE"
    assert permission_keys[("user_id",)]["options"]["ondelete"] == "CASCADE"
    assert draft_keys[("converted_character_id",)]["options"]["ondelete"] == "SET NULL"
    assert draft_keys[("last_modified_by",)]["options"]["ondelete"] == "SET NULL"


def test_postgresql_enforces_named_membership_uniqueness(postgresql_engine):
    suffix = uuid.uuid4().hex[:12]
    with postgresql_engine.connect() as connection:
        transaction = connection.begin()
        try:
            user_id = connection.execute(
                text(
                    "INSERT INTO users "
                    "(username, hashed_password, disabled, is_verified, session_version) "
                    "VALUES (:username, :password, false, false, 0) RETURNING id"
                ),
                {"username": f"member-{suffix}", "password": "not-a-real-hash"},
            ).scalar_one()
            session_id = connection.execute(
                text(
                    "INSERT INTO game_sessions "
                    "(name, session_code, owner_id, is_active, is_demo) "
                    "VALUES (:name, :code, :owner_id, true, false) RETURNING id"
                ),
                {
                    "name": "PostgreSQL contract",
                    "code": suffix.upper(),
                    "owner_id": user_id,
                },
            ).scalar_one()
            membership = {"session_id": session_id, "user_id": user_id}
            connection.execute(
                text(
                    "INSERT INTO game_players "
                    "(session_id, user_id, is_connected) "
                    "VALUES (:session_id, :user_id, false)"
                ),
                membership,
            )

            with pytest.raises(IntegrityError) as error:
                with connection.begin_nested():
                    connection.execute(
                        text(
                            "INSERT INTO game_players "
                            "(session_id, user_id, is_connected) "
                            "VALUES (:session_id, :user_id, false)"
                        ),
                        membership,
                    )

            assert error.value.orig.diag.constraint_name == "uq_gameplayer_session_user"
        finally:
            transaction.rollback()


def test_postgresql_for_update_serializes_competing_writers(postgresql_engine):
    suffix = uuid.uuid4().hex[:12]
    with postgresql_engine.begin() as connection:
        user_id = connection.execute(
            text(
                "INSERT INTO users "
                "(username, hashed_password, disabled, is_verified, session_version) "
                "VALUES (:username, :password, false, false, 0) RETURNING id"
            ),
            {"username": f"locker-{suffix}", "password": "not-a-real-hash"},
        ).scalar_one()

    attempted = threading.Event()
    acquired = threading.Event()
    failures: list[BaseException] = []

    def competing_writer() -> None:
        try:
            with postgresql_engine.connect() as connection:
                transaction = connection.begin()
                try:
                    connection.execute(text("SET LOCAL lock_timeout = '5s'"))
                    attempted.set()
                    connection.execute(
                        text("SELECT id FROM users WHERE id = :id FOR UPDATE"),
                        {"id": user_id},
                    ).scalar_one()
                    acquired.set()
                finally:
                    transaction.rollback()
        except BaseException as exc:  # surfaced in the main pytest thread
            failures.append(exc)

    first_connection = postgresql_engine.connect()
    first_transaction = first_connection.begin()
    contender = threading.Thread(target=competing_writer, daemon=True)
    try:
        first_connection.execute(
            text("SELECT id FROM users WHERE id = :id FOR UPDATE"),
            {"id": user_id},
        ).scalar_one()
        contender.start()
        assert attempted.wait(timeout=2)
        time.sleep(0.2)
        assert not acquired.is_set()

        first_transaction.commit()

        assert acquired.wait(timeout=5)
        contender.join(timeout=2)
        assert not failures
    finally:
        if first_transaction.is_active:
            first_transaction.rollback()
        first_connection.close()
        contender.join(timeout=2)
        with postgresql_engine.begin() as connection:
            connection.execute(text("DELETE FROM users WHERE id = :id"), {"id": user_id})
