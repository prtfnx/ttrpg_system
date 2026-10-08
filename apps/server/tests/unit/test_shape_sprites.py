"""Procedural table objects use the same authoritative Entity persistence."""
import json
from unittest.mock import AsyncMock

import pytest
from core_table.actions_core import ActionsCore
from core_table.protocol import Message, MessageType
from core_table.server import TableManager
from database import crud
from service.protocol.sprites import _SpritesMixin
from sqlalchemy.orm import sessionmaker


@pytest.mark.asyncio
@pytest.mark.parametrize("shape", ["rectangle", "circle", "line"])
async def test_shape_creation_reloads_from_database(shape, monkeypatch, test_db, test_db_engine, test_game_session, test_user):
    monkeypatch.setattr("service.canvas_persistence_service.SessionLocal", sessionmaker(bind=test_db_engine))
    manager = TableManager(test_db)
    table = manager.create_table("Objects", 1000, 1000)
    proto = _SpritesMixin()
    proto.table_manager = manager
    proto.actions = ActionsCore(manager)
    monkeypatch.setattr(proto, "_get_session_id", lambda _msg: test_game_session.id)
    monkeypatch.setattr(proto, "_get_session_code", lambda: test_game_session.session_code)
    monkeypatch.setattr(proto, "_get_client_role", lambda _client: "owner")
    monkeypatch.setattr(proto, "_get_user_id", lambda _msg, _client: test_user.id)
    proto.broadcast_filtered = AsyncMock()
    geometry = {"x": 10, "y": 20, "width": 80, "height": 40}
    if shape == "circle":
        geometry = {"x": 50, "y": 40, "radius": 40}
    if shape == "line":
        geometry = {"x1": 10, "y1": 20, "x2": 90, "y2": 60}
    metadata = {"shape_color": "#123456", "shape_filled": True, "opacity": 0.5}
    result = await proto.handle_create_sprite(Message(MessageType.SPRITE_CREATE, {
        "table_id": str(table.table_id), "sprite_data": {"sprite_id": f"object-{shape}", "x": 10, "y": 20,
        "width": 80, "height": 40, "layer": "obstacles", "texture_path": "", "obstacle_type": shape,
        "obstacle_data": geometry, "metadata": json.dumps(metadata)}}), "client")
    assert result.type == MessageType.SPRITE_RESPONSE
    test_db.expire_all()
    restored, ok = crud.load_table_from_db(test_db, str(table.table_id))
    assert ok
    entity = restored.find_entity_by_sprite_id(f"object-{shape}")
    assert entity is not None and entity.obstacle_type == shape
    assert entity.layer == "obstacles" and entity.width == 80
    assert entity.obstacle_data == geometry
    assert json.loads(entity.metadata) == metadata
    proto.broadcast_filtered.assert_awaited_once()
    if shape == "line":
        moved = await proto.actions.move_sprite(str(table.table_id), "object-line", {"x": 10, "y": 20},
                                                {"x": 30, "y": 50}, session_id=test_game_session.id)
        assert moved.success
        test_db.expire_all()
        loaded, ok = crud.load_table_from_db(test_db, str(table.table_id))
        assert ok
        assert loaded.find_entity_by_sprite_id("object-line").obstacle_data == {"x1": 30, "y1": 50, "x2": 110, "y2": 90}
