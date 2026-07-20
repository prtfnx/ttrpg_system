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
from database import models
from database.models import Base
from database.schema import repository_heads, schema_is_current
from database.url import normalize_database_url
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

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
