from unittest.mock import AsyncMock

import pytest
from core_table.actions_core import ActionsCore
from core_table.protocol import Message, MessageType
from core_table.server import TableManager
from database import crud
from service.protocol.sprites import _SpritesMixin
from sqlalchemy.orm import sessionmaker


@pytest.mark.asyncio
@pytest.mark.parametrize("compendium", [False, True])
async def test_quota_counts_accepted_creates_before_save(monkeypatch, test_db_engine, test_game_session, test_user, compendium):
    monkeypatch.setattr("service.canvas_persistence_service.SessionLocal", sessionmaker(bind=test_db_engine))
    proto = _SpritesMixin()
    manager = TableManager()
    table = manager.create_table("Quota", 100, 100)
    proto.table_manager = manager
    proto.actions = ActionsCore(manager)
    proto.broadcast_filtered = AsyncMock()
    monkeypatch.setattr(proto, "_get_session_id", lambda _msg: test_game_session.id)
    monkeypatch.setattr(proto, "_get_user_id", lambda *_: test_user.id)
    monkeypatch.setattr(proto, "_get_client_role", lambda _client: "player")
    handler = proto.handle_compendium_sprite_add if compendium else proto.handle_create_sprite
    for index in range(6):
        response = await handler(Message(MessageType.SPRITE_CREATE, {
            "table_id": str(table.table_id), "sprite_data": {"name": f"Token {index}"},
        }), "player")
        assert (response.type == MessageType.ERROR) is (index == 5)
    assert len(table.entities) == 5


@pytest.mark.asyncio
async def test_loaded_snapshots_replace_stored_counts_including_deletions(
    monkeypatch, test_db, test_db_engine, test_game_session, test_user,
):
    monkeypatch.setattr("service.canvas_persistence_service.SessionLocal", sessionmaker(bind=test_db_engine))
    manager = TableManager()
    table = manager.create_table("Quota", 100, 100)
    for _ in range(5):
        table.add_entity({"controlled_by": [test_user.id]})
    crud.save_table_to_db(test_db, table, test_game_session.id)
    proto = _SpritesMixin()
    proto.table_manager = manager
    assert await proto._sprite_quota_error(test_game_session.id, test_user.id, "player") is not None
    table.remove_entity(next(iter(table.entities)))
    assert await proto._sprite_quota_error(test_game_session.id, test_user.id, "player") is None
    manager.clear_tables()
    assert await proto._sprite_quota_error(test_game_session.id, test_user.id, "player") is not None
