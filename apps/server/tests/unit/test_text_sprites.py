import json
from unittest.mock import AsyncMock

import pytest
from core_table.actions_core import ActionsCore
from core_table.protocol import Message, MessageType
from core_table.server import TableManager
from database import crud
from service.protocol.sprites import _SpritesMixin
from service.text_sprite import TextSpriteValidationError, text_metadata
from sqlalchemy.orm import sessionmaker


def descriptor(**changes):
    return {"version": 1, "text": "Привіт\nمرحبا", "font_size": 24, "font_family": "sans-serif",
            "font_weight": 400, "font_style": "normal", "color": "#ffcc88", "language": "uk", "direction": "auto", **changes}


@pytest.mark.parametrize("changes", [{"font_size": True}, {"font_size": 129}, {"font_size": float("nan")},
    {"font_family": "url(evil)"}, {"font_weight": 500}, {"language": "<script>"}, {"color": "red"},
    {"direction": "inherit"}, {"text": " "}, {"text": "x" * 4097}, {"text": "\n" * 33}, {"text": "bad\x00"}])
def test_text_descriptor_validation(changes):
    with pytest.raises(TextSpriteValidationError):
        text_metadata({"text_sprite": descriptor(**changes)}, required=True)


def test_non_text_metadata_remains_opaque():
    assert text_metadata('{"radius":50}') is None
    assert text_metadata({"text_sprite": descriptor()})["text_sprite"]["text"] == "Привіт\nمرحبا"


def test_legacy_text_is_normalized_without_losing_metadata():
    result = text_metadata({"is_text": True, "text": "Legacy", "fontSize": 32,
                           "fontFamily": "Courier New", "fontWeight": "bold", "custom": "kept"}, required=True)
    assert result["text_sprite"]["font_family"] == "monospace"
    assert result["text_sprite"]["font_weight"] == 700
    assert result["custom"] == "kept"


@pytest.fixture
def text_protocol(monkeypatch, test_db, test_db_engine, test_game_session, test_user):
    monkeypatch.setattr("service.canvas_persistence_service.SessionLocal", sessionmaker(bind=test_db_engine))
    manager = TableManager(test_db)
    table = manager.create_table("Text", 1000, 1000)
    proto = _SpritesMixin()
    proto.table_manager = manager
    proto.actions = ActionsCore(manager)
    monkeypatch.setattr(proto, "_get_session_id", lambda _msg: test_game_session.id)
    monkeypatch.setattr(proto, "_get_client_role", lambda _client: "owner")
    monkeypatch.setattr(proto, "_get_user_id", lambda _msg, _client: test_user.id)
    proto.broadcast_filtered = AsyncMock()
    return proto, table


async def create_text(proto, table, **changes):
    return await proto.handle_create_sprite(Message(MessageType.SPRITE_CREATE, {
        "table_id": str(table.table_id), "sprite_data": {"sprite_id": "text-persist", "x": 20, "y": 30,
        "width": 150, "height": 60, "layer": "tokens", "metadata": {"text_sprite": descriptor()}, **changes}}), "client")


@pytest.mark.asyncio
async def test_text_create_edit_reload_is_database_persistent(text_protocol, test_db):
    proto, table = text_protocol
    created = await create_text(proto, table)
    assert created.type == MessageType.SPRITE_RESPONSE
    row = crud.get_entity_by_sprite_id(test_db, "text-persist")
    assert row is not None and row.texture_path == "__TEXT__"
    assert json.loads(row.entity_metadata)["text_revision"] == 1
    updated = await proto.handle_sprite_update(Message(MessageType.SPRITE_UPDATE, {
        "table_id": str(table.table_id), "sprite_id": "text-persist", "expected_text_revision": 1,
        "width": 180, "height": 75, "metadata": {"text_sprite": descriptor(text="Edited українською", color="#123456", font_size=32)},
    }), "client")
    assert updated.type == MessageType.SUCCESS
    assert json.loads(updated.data["updates"]["metadata"])["text_revision"] == 2
    test_db.expire_all()
    restored, ok = crud.load_table_from_db(test_db, str(table.table_id))
    assert ok
    entity = restored.find_entity_by_sprite_id("text-persist")
    assert json.loads(entity.metadata)["text_sprite"]["text"] == "Edited українською"
    assert entity.width == 180 and entity.height == 75
    assert proto.broadcast_filtered.await_count == 2


@pytest.mark.asyncio
async def test_stale_text_editor_cannot_overwrite(text_protocol):
    proto, table = text_protocol
    await create_text(proto, table)
    proto.broadcast_filtered.reset_mock()
    result = await proto.handle_sprite_update(Message(MessageType.SPRITE_UPDATE, {
        "table_id": str(table.table_id), "sprite_id": "text-persist", "expected_text_revision": 2,
        "width": 180, "height": 75, "metadata": {"text_sprite": descriptor(text="Stale")},
    }), "client")
    assert result.type == MessageType.ERROR and result.data["code"] == "text_version_conflict"
    assert json.loads(table.find_entity_by_sprite_id("text-persist").metadata)["text_revision"] == 1
    proto.broadcast_filtered.assert_not_awaited()


@pytest.mark.asyncio
@pytest.mark.parametrize("changes", [{"layer": "obstacles"}, {"width": 5000}, {"x": float("nan")},
    {"metadata": {"text_sprite": descriptor(text="bad\x00")}}, {"obstacle_type": "rectangle"},
    {"texture_path": "__TEXT__", "metadata": "not JSON"}])
async def test_invalid_text_never_mutates_or_broadcasts(text_protocol, changes):
    proto, table = text_protocol
    result = await create_text(proto, table, **changes)
    assert result.type == MessageType.ERROR
    assert not table.entities
    proto.broadcast_filtered.assert_not_awaited()


@pytest.mark.asyncio
async def test_spectator_cannot_edit_even_a_controlled_text(text_protocol, monkeypatch):
    proto, table = text_protocol
    await create_text(proto, table)
    monkeypatch.setattr(proto, "_get_client_role", lambda _client: "spectator")
    monkeypatch.setattr(proto, "_can_control_sprite", AsyncMock(return_value=True))
    result = await proto.handle_sprite_update(Message(MessageType.SPRITE_UPDATE, {
        "table_id": str(table.table_id), "sprite_id": "text-persist", "expected_text_revision": 1,
        "width": 150, "height": 60, "metadata": {"text_sprite": descriptor(text="Forbidden")}}), "client")
    assert result.type == MessageType.ERROR
