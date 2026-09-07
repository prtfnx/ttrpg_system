from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from core_table.actions_core import ActionsCore
from core_table.protocol import Message, MessageType
from core_table.server import TableManager
from core_table.table import VirtualTable
from database import crud, models, schemas
from service.protocol.sprites import _SpritesMixin
from sqlalchemy.orm import sessionmaker


@pytest.fixture
def victim(test_db, test_game_session):
    table = VirtualTable("Victim", 1000, 1000)
    entity = table.add_entity({"sprite_id": "shared-id", "name": "Protected", "controlled_by": [42]})
    saved = crud.save_table_to_db(test_db, table, test_game_session.id)
    assert saved is not None
    return table, entity, saved


def test_cross_session_snapshot_cannot_overwrite_sprite(test_db, test_user, victim):
    _, _, saved = victim
    session = crud.create_game_session(test_db, schemas.GameSessionCreate(name="Other"), test_user.id, "OTHER01")
    attacker = VirtualTable("Attacker", 1000, 1000)
    attacker.add_entity({"sprite_id": "shared-id", "name": "Overwritten", "controlled_by": [99]})
    with pytest.raises(ValueError, match="Sprite ID"):
        crud.save_table_to_db(test_db, attacker, session.id)
    test_db.expire_all()
    row = crud.get_entity_by_sprite_id(test_db, "shared-id")
    assert row is not None
    assert row.table_id == saved.id
    assert row.name == "Protected"
    assert row.controlled_by == "[42]"
    assert crud.get_virtual_table_by_id(test_db, str(attacker.table_id)) is None


def test_table_snapshot_cannot_cross_session_boundary(test_db, test_user, victim):
    table, _, _ = victim
    session = crud.create_game_session(test_db, schemas.GameSessionCreate(name="Other"), test_user.id, "OTHER01")
    table.display_name = "Overwritten"
    with pytest.raises(ValueError, match="session"):
        crud.save_table_to_db(test_db, table, session.id)
    test_db.expire_all()
    stored_table = crud.get_virtual_table_by_id(test_db, str(table.table_id))
    assert stored_table is not None
    assert stored_table.name == "Victim"


def test_direct_entity_save_also_checks_ownership(test_db, test_game_session, victim):
    _, entity, _ = victim
    other = VirtualTable("Other", 1000, 1000)
    saved = crud.save_table_to_db(test_db, other, test_game_session.id)
    assert saved is not None
    entity.name = "Overwritten"
    with pytest.raises(ValueError, match="Sprite ID"):
        crud.save_entity_to_db(test_db, entity, saved.id)
    stored_entity = crud.get_entity_by_sprite_id(test_db, entity.sprite_id)
    assert stored_entity is not None
    assert stored_entity.name == "Protected"


def test_duplicate_in_memory_id_preserves_original_indexes():
    table = VirtualTable("Local", 1000, 1000)
    original = table.add_entity({"sprite_id": "duplicate", "position": [10, 10]})
    with pytest.raises(ValueError, match="Sprite ID"):
        table.add_entity({"sprite_id": "duplicate", "position": [20, 20]})
    assert len(table.entities) == 1
    assert table.sprite_to_entity["duplicate"] == original.entity_id
    assert table.get_entity_at_position((10, 10)) is original
    assert table.get_entity_at_position((20, 20)) is None


@pytest.mark.asyncio
async def test_creation_rejects_duplicate_across_loaded_tables():
    manager = TableManager()
    first = manager.create_table("First", 1000, 1000)
    second = manager.create_table("Second", 1000, 1000)
    first.add_entity({"sprite_id": "duplicate"})
    result = await ActionsCore(manager).create_sprite(str(second.table_id), {"sprite_id": "duplicate"})
    assert not result.success
    assert not second.entities


@pytest.mark.asyncio
async def test_protocol_rejects_persisted_id_before_mutation(monkeypatch, test_db_engine, victim):
    monkeypatch.setattr("service.canvas_persistence_service.SessionLocal", sessionmaker(bind=test_db_engine))
    proto = _SpritesMixin()
    monkeypatch.setattr(proto, "_get_session_id", lambda _msg: 1)
    monkeypatch.setattr(proto, "_get_client_role", lambda _client: "owner")
    proto.actions = SimpleNamespace(create_sprite=AsyncMock())
    response = await _SpritesMixin.handle_create_sprite(proto, Message(MessageType.SPRITE_CREATE, {
        "table_id": "other-table", "sprite_data": {"sprite_id": "shared-id"},
    }), "attacker")
    assert response.type == MessageType.ERROR
    proto.actions.create_sprite.assert_not_awaited()


def test_existing_sprite_can_still_update_in_its_own_table(test_db, test_game_session, victim):
    table, entity, _ = victim
    entity.name = "Legitimate edit"
    crud.save_table_to_db(test_db, table, test_game_session.id)
    test_db.expire_all()
    stored_entity = crud.get_entity_by_sprite_id(test_db, entity.sprite_id)
    assert stored_entity is not None
    assert stored_entity.name == "Legitimate edit"
    assert test_db.query(models.Entity).count() == 1
