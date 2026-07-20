"""PostgreSQL-only schema, constraint, and locking contracts."""

from __future__ import annotations

import os
import threading
import time
import uuid
from pathlib import Path
from types import SimpleNamespace

import pytest
from alembic import command
from alembic.config import Config
from database import models
from database.models import Base
from database.schema import repository_heads, schema_is_current
from database.url import normalize_database_url
from service.readiness import ReadinessChecker
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from sqlalchemy.pool import NullPool

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
    normalized_url = normalize_database_url(POSTGRESQL_URL)
    assert normalized_url.database is not None
    assert (
        "test" in normalized_url.database.lower()
        or os.getenv("ALLOW_POSTGRESQL_INTEGRATION_TARGET") == "1"
    ), (
        "Refusing PostgreSQL integration tests unless the database name contains "
        "'test' or ALLOW_POSTGRESQL_INTEGRATION_TARGET=1 is explicitly set"
    )
    engine = create_engine(normalized_url, pool_pre_ping=True)
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
    with engine.connect() as connection:
        nonempty_tables = {
            table_name: connection.execute(
                text(f'SELECT COUNT(*) FROM "{table_name}"')
            ).scalar_one()
            for table_name in Base.metadata.tables
        }
    nonempty_tables = {
        table_name: count
        for table_name, count in nonempty_tables.items()
        if count
    }
    assert not nonempty_tables, (
        "Refusing PostgreSQL integration tests against nonempty application tables: "
        f"{sorted(nonempty_tables)}"
    )

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


def test_postgresql_rejects_invalid_foreign_keys(postgresql_engine):
    suffix = uuid.uuid4().hex[:12]
    with postgresql_engine.connect() as connection:
        transaction = connection.begin()
        try:
            with pytest.raises(IntegrityError) as error:
                with connection.begin_nested():
                    connection.execute(
                        text(
                            "INSERT INTO game_sessions "
                            "(name, session_code, owner_id, is_active, is_demo) "
                            "VALUES (:name, :code, :owner_id, true, false)"
                        ),
                        {
                            "name": "Invalid owner",
                            "code": suffix.upper(),
                            "owner_id": 2_147_483_647,
                        },
                    )

            assert (
                error.value.orig.diag.constraint_name
                == "fk_game_sessions_owner_id_users"
            )
        finally:
            transaction.rollback()


def _run_competing_inserts(
    engine,
    statement: str,
    parameters: list[dict],
) -> list[str]:
    barrier = threading.Barrier(len(parameters))
    outcomes: list[str] = []
    failures: list[BaseException] = []
    outcome_lock = threading.Lock()

    def insert(parameters_for_writer: dict) -> None:
        try:
            with engine.connect() as connection:
                transaction = connection.begin()
                try:
                    barrier.wait(timeout=5)
                    connection.execute(text(statement), parameters_for_writer)
                    transaction.commit()
                    outcome = "committed"
                except IntegrityError as exc:
                    transaction.rollback()
                    outcome = exc.orig.diag.constraint_name
                with outcome_lock:
                    outcomes.append(outcome)
        except BaseException as exc:
            with outcome_lock:
                failures.append(exc)

    threads = [
        threading.Thread(target=insert, args=(item,), daemon=True)
        for item in parameters
    ]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join(timeout=10)

    assert all(not thread.is_alive() for thread in threads)
    assert not failures
    return outcomes


def test_postgresql_serializes_chat_and_combat_idempotency(postgresql_engine):
    suffix = uuid.uuid4().hex[:12]
    with postgresql_engine.begin() as connection:
        user_id = connection.execute(
            text(
                "INSERT INTO users "
                "(username, hashed_password, disabled, is_verified, session_version) "
                "VALUES (:username, :password, false, false, 0) RETURNING id"
            ),
            {"username": f"idempotency-{suffix}", "password": "not-a-real-hash"},
        ).scalar_one()
        session_id = connection.execute(
            text(
                "INSERT INTO game_sessions "
                "(name, session_code, owner_id, is_active, is_demo) "
                "VALUES (:name, :code, :owner_id, true, false) RETURNING id"
            ),
            {
                "name": "Idempotency contract",
                "code": suffix.upper(),
                "owner_id": user_id,
            },
        ).scalar_one()
        encounter_id = str(uuid.uuid4())
        connection.execute(
            text(
                "INSERT INTO combat_encounters "
                "(encounter_id, session_id, table_id, round_number, "
                "current_turn_index, state_version) "
                "VALUES (:encounter_id, :session_id, :table_id, 0, 0, 0)"
            ),
            {
                "encounter_id": encounter_id,
                "session_id": session_id,
                "table_id": str(uuid.uuid4()),
            },
        )

    try:
        operation_id = f"chat-{suffix}"
        chat_outcomes = _run_competing_inserts(
            postgresql_engine,
            "INSERT INTO chat_messages "
            "(message_id, client_operation_id, session_id, user_id, channel, "
            "text, message_json) "
            "VALUES (:message_id, :operation_id, :session_id, :user_id, "
            "'public', 'hello', '{}')",
            [
                {
                    "message_id": str(uuid.uuid4()),
                    "operation_id": operation_id,
                    "session_id": session_id,
                    "user_id": user_id,
                }
                for _ in range(2)
            ],
        )
        assert sorted(chat_outcomes) == [
            "committed",
            "uq_chat_sender_operation",
        ]

        action_parameters = {
            "encounter_id": encounter_id,
            "requester_key": f"user:{user_id}",
            "sequence_id": 1,
            "created_by": user_id,
        }
        combat_outcomes = _run_competing_inserts(
            postgresql_engine,
            "INSERT INTO combat_actions "
            "(encounter_id, requester_key, sequence_id, command_type, "
            "command_payload_json, result_payload_json, state_before_json, "
            "state_after_hash, state_version, created_by) "
            "VALUES (:encounter_id, :requester_key, :sequence_id, 'test', "
            "'{}', '{}', '{}', :state_hash, 1, :created_by)",
            [
                {**action_parameters, "state_hash": character}
                for character in ("a" * 64, "b" * 64)
            ],
        )
        assert sorted(combat_outcomes) == [
            "committed",
            "uq_combat_action_request",
        ]
    finally:
        with postgresql_engine.begin() as connection:
            connection.execute(
                text("DELETE FROM combat_actions WHERE encounter_id = :encounter_id"),
                {"encounter_id": encounter_id},
            )
            connection.execute(
                text("DELETE FROM chat_messages WHERE session_id = :session_id"),
                {"session_id": session_id},
            )
            connection.execute(
                text(
                    "DELETE FROM combat_encounters "
                    "WHERE encounter_id = :encounter_id"
                ),
                {"encounter_id": encounter_id},
            )
            connection.execute(
                text("DELETE FROM game_sessions WHERE id = :session_id"),
                {"session_id": session_id},
            )
            connection.execute(
                text("DELETE FROM users WHERE id = :user_id"),
                {"user_id": user_id},
            )


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


def test_postgresql_readiness_detects_revision_mismatch(postgresql_engine):
    checker = ReadinessChecker(
        SimpleNamespace(is_production=False),
        postgresql_engine,
        r2_manager=None,
        static_ui_path=Path("unused"),
        compendium_artifact=None,
    )
    assert checker._check_database() == {
        "ok": True,
        "revision": "0001_postgresql_baseline",
    }

    with postgresql_engine.begin() as connection:
        connection.execute(text("DELETE FROM alembic_version"))
    try:
        result = checker._check_database()
        assert result["ok"] is False
        assert result["code"] == "schema_revision_mismatch"
        assert result["applied_revision"] is None
    finally:
        with postgresql_engine.begin() as connection:
            connection.execute(
                text(
                    "INSERT INTO alembic_version (version_num) "
                    "VALUES ('0001_postgresql_baseline')"
                )
            )


def test_postgresql_pre_ping_recycles_terminated_connection(postgresql_engine):
    engine = create_engine(
        postgresql_engine.url,
        pool_pre_ping=True,
        pool_size=1,
        max_overflow=0,
    )
    terminator = create_engine(
        postgresql_engine.url,
        poolclass=NullPool,
    )
    try:
        with engine.connect() as connection:
            stale_backend_pid = connection.execute(
                text("SELECT pg_backend_pid()")
            ).scalar_one()

        with terminator.begin() as connection:
            assert connection.execute(
                text("SELECT pg_terminate_backend(:pid)"),
                {"pid": stale_backend_pid},
            ).scalar_one()

        with engine.connect() as connection:
            replacement_backend_pid = connection.execute(
                text("SELECT pg_backend_pid()")
            ).scalar_one()
            assert connection.execute(text("SELECT 1")).scalar_one() == 1
        assert replacement_backend_pid != stale_backend_pid
    finally:
        engine.dispose()
        terminator.dispose()


def test_postgresql_orm_round_trip_covers_core_persistence_families(
    postgresql_engine,
):
    suffix = uuid.uuid4().hex[:12]
    connection = postgresql_engine.connect()
    transaction = connection.begin()
    db = Session(bind=connection)
    try:
        owner = models.User(
            username=f"orm-{suffix}",
            email=f"orm-{suffix}@example.test",
            hashed_password="not-a-real-hash",
        )
        db.add(owner)
        db.flush()

        game = models.GameSession(
            name="PostgreSQL ORM smoke",
            session_code=suffix.upper(),
            owner_id=owner.id,
        )
        db.add(game)
        db.flush()

        membership = models.GamePlayer(session_id=game.id, user_id=owner.id)
        table = models.VirtualTable(
            table_id=str(uuid.uuid4()),
            name="ORM table",
            width=20,
            height=20,
            session_id=game.id,
        )
        db.add_all([membership, table])
        db.flush()

        character = models.SessionCharacter(
            character_id=str(uuid.uuid4()),
            session_id=game.id,
            character_name="ORM hero",
            character_data='{"name":"ORM hero"}',
            owner_user_id=owner.id,
        )
        entity = models.Entity(
            entity_id=1,
            sprite_id=str(uuid.uuid4()),
            table_id=table.id,
            name="ORM token",
            position_x=1,
            position_y=2,
            layer="tokens",
            character_id=character.character_id,
        )
        wall = models.Wall(
            wall_id=str(uuid.uuid4()),
            table_id=table.table_id,
            x1=0,
            y1=0,
            x2=5,
            y2=5,
        )
        stroke = models.PaintStroke(
            stroke_id=str(uuid.uuid4()),
            table_id=table.table_id,
            created_by=owner.id,
            stroke_data='{"points":[[0,0],[1,1]]}',
        )
        db.add_all([character, entity, wall, stroke])
        db.flush()

        permission = models.CharacterPermission(
            character_id=character.character_id,
            session_id=game.id,
            user_id=owner.id,
            granted_by=owner.id,
        )
        chat = models.ChatMessage(
            message_id=str(uuid.uuid4()),
            client_operation_id=f"chat-{suffix}",
            session_id=game.id,
            user_id=owner.id,
            username=owner.username,
            text="PostgreSQL ORM smoke",
            message_json='{"text":"PostgreSQL ORM smoke"}',
        )
        combat = models.CombatEncounter(
            encounter_id=str(uuid.uuid4()),
            session_id=game.id,
            table_id=table.table_id,
        )
        choice = models.ChoiceEncounter(
            encounter_id=str(uuid.uuid4()),
            session_id=game.id,
            session_code=game.session_code,
            table_id=table.table_id,
            title="ORM choice",
            description="Choose",
            phase="active",
            state_json="{}",
            participants_json="[]",
            choices_json="[]",
            dm_notes="",
            created_by=owner.id,
        )
        db.add_all([permission, chat, combat, choice])
        db.flush()

        combat_action = models.CombatActionJournal(
            encounter_id=combat.encounter_id,
            requester_key=f"user:{owner.id}",
            sequence_id=1,
            actor_id=character.character_id,
            command_type="orm_smoke",
            command_payload_json="{}",
            result_payload_json="{}",
            state_before_json="{}",
            state_after_hash="0" * 64,
            state_version=1,
            created_by=owner.id,
        )
        choice_event = models.ChoiceEncounterEvent(
            encounter_id=choice.encounter_id,
            sequence=1,
            event_type="created",
            actor_id=str(owner.id),
            payload_json="{}",
        )
        asset = models.Asset(
            asset_name="orm-smoke.png",
            r2_asset_id=f"orm-{suffix}",
            content_type="image/png",
            file_size=1,
            uploaded_by=owner.id,
            r2_key=f"assets/orm-{suffix}.png",
            r2_bucket="test-assets",
        )
        db.add_all([combat_action, choice_event, asset])
        db.flush()

        asset_link = models.SessionAsset(
            session_id=game.id,
            asset_id=asset.id,
            display_name="ORM smoke",
            added_by=owner.id,
        )
        db.add(asset_link)
        db.flush()

        assert db.get(models.User, owner.id).username == owner.username
        assert db.get(models.VirtualTable, table.id).table_id == table.table_id
        assert db.get(models.Entity, entity.id).character_id == character.character_id
        assert db.get(models.ChatMessage, chat.id).client_operation_id == f"chat-{suffix}"
        assert db.get(models.CombatActionJournal, combat_action.id).state_version == 1
        assert db.get(models.ChoiceEncounterEvent, choice_event.id).sequence == 1
        assert db.get(models.SessionAsset, asset_link.id).asset_id == asset.id
    finally:
        db.close()
        if transaction.is_active:
            transaction.rollback()
        connection.close()
