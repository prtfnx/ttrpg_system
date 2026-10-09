import asyncio
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from core_table.actions_core import ActionsCore
from core_table.entities import Wall
from core_table.protocol import Message, MessageType
from core_table.server import TableManager
from core_table.table import CoverZone, VirtualTable
from database import crud, models
from service.protocol.tables import _copy_table_data
from service.server_protocol import ServerProtocol


def test_copy_allocates_identities_without_changing_shared_links_or_source():
    source = {
        "table_id": "source",
        "layers": {"tokens": {"1": {"entity_id": 1, "sprite_id": "original", "character_id": "shared-character",
                                  "asset_id": "shared-asset", "controlled_by": [2]}}},
        "walls": [{"wall_id": "original-wall", "table_id": "source", "x1": 0}],
        "cover_zones": [{"zone_id": "original-zone"}],
    }
    copied = _copy_table_data(source)
    token = copied["layers"]["tokens"]["1"]
    assert token["sprite_id"] != "original"
    assert token["entity_id"] == 1
    assert token["character_id"] == "shared-character"
    assert token["asset_id"] == "shared-asset"
    assert token["controlled_by"] == [2]
    assert copied["walls"][0]["wall_id"] != "original-wall"
    assert "table_id" not in copied["walls"][0]
    assert copied["cover_zones"][0]["zone_id"] != "original-zone"
    assert source["layers"]["tokens"]["1"]["sprite_id"] == "original"
    assert source["walls"][0]["wall_id"] == "original-wall"


@pytest.mark.asyncio
async def test_populated_table_copy_persists_reloads_and_deletes_independently(test_db, test_game_session):
    source = VirtualTable("Original", 1000, 1000)
    token = source.add_entity({"name": "Hero", "layer": "tokens", "position": [10, 20]})
    source.add_entity({"name": "DM note", "layer": "dungeon_master", "position": [30, 40]})
    wall = Wall(table_id=str(source.table_id), x1=0, y1=0, x2=10, y2=10)
    source.add_wall(wall)
    source.difficult_terrain_cells = {(1, 2)}
    source.cover_zones = [CoverZone.from_dict({"zone_id": "source-cover", "shape_type": "rect", "coords": [0, 0, 10, 10]})]
    source.grid_enabled = False
    crud.save_table_to_db(test_db, source, test_game_session.id)
    manager = TableManager(test_db)
    manager.add_table(source)
    session = SimpleNamespace(game_session_db_id=test_game_session.id, session_code="TEST01",
                              client_info={"dm": {"role": "owner", "user_id": test_game_session.owner_id}})
    protocol = ServerProtocol(manager, session_manager=session)
    protocol.ensure_assets_in_r2 = AsyncMock()
    protocol.broadcast_to_session = AsyncMock()

    response = await protocol.handle_new_table_request(Message(MessageType.NEW_TABLE_REQUEST, {
        "table_name": "Copy", "width": 1000, "height": 1000, "source_table_id": str(source.table_id),
    }), "dm")
    assert response.type == MessageType.NEW_TABLE_RESPONSE
    copy_id = response.data["table_data"]["table_id"]
    assert copy_id != str(source.table_id)
    test_db.expire_all()
    loaded, success = crud.load_table_from_db(test_db, copy_id)
    assert success
    assert {entity.name for entity in loaded.entities.values()} == {"Hero", "DM note"}
    assert {entity.sprite_id for entity in loaded.entities.values()}.isdisjoint(
        {entity.sprite_id for entity in source.entities.values()})
    assert set(loaded.walls).isdisjoint(source.walls)
    assert all(item.table_id == copy_id for item in loaded.walls.values())
    assert loaded.difficult_terrain_cells == {(1, 2)}
    assert loaded.cover_zones[0].zone_id != "source-cover"
    assert loaded.grid_enabled is False
    assert not protocol.actions._dirty_tables
    assert not protocol.actions._save_tasks

    result = await protocol.actions.delete_table(copy_id, session_id=test_game_session.id)
    assert result.success
    test_db.expire_all()
    assert test_db.query(models.Entity).filter_by(sprite_id=token.sprite_id).one().name == "Hero"
    assert crud.get_table_walls(test_db, str(source.table_id))[0].wall_id == wall.wall_id
    assert crud.get_virtual_table_by_id(test_db, copy_id) is None


@pytest.mark.asyncio
async def test_identity_conflicting_import_does_not_leave_live_history_or_retry_state(test_db, test_game_session):
    source = VirtualTable("Original", 1000, 1000)
    source.add_entity({"name": "Hero"})
    crud.save_table_to_db(test_db, source, test_game_session.id)
    manager = TableManager(test_db)
    manager.add_table(source)
    actions = ActionsCore(manager)
    result = await actions.create_table("Invalid import", 1000, 1000, session_id=test_game_session.id,
                                        initial_data=source.to_dict())
    assert not result.success
    assert manager.get_table("Invalid import") is None
    assert len(manager.tables_id) == 1
    assert not actions.action_history and not actions.undo_stack
    assert not actions._dirty_tables and not actions._save_tasks
    test_db.expire_all()
    assert test_db.query(models.VirtualTable).count() == 1


@pytest.mark.asyncio
@pytest.mark.parametrize("saved", [False, True])
async def test_cancelled_create_waits_for_draft_save_before_installing_live_state(test_db, test_game_session, saved):
    manager = TableManager(test_db)
    actions = ActionsCore(manager)
    entered, release = asyncio.Event(), asyncio.Event()

    async def save_draft(table_id, session_id, *, draft):
        assert str(draft.table_id) == table_id
        assert session_id == test_game_session.id
        assert not manager.tables_id and not actions.action_history
        entered.set()
        await release.wait()
        return saved

    manager.save_table_async = save_draft
    task = asyncio.create_task(actions.create_table("Draft", 1000, 1000, session_id=test_game_session.id))
    await entered.wait()
    task.cancel()
    await asyncio.sleep(0)
    assert not task.done()
    assert not manager.tables_id and not actions.action_history
    release.set()
    with pytest.raises(asyncio.CancelledError):
        await task
    assert bool(manager.tables_id) is saved
    assert bool(actions.action_history) is saved
    assert not actions._dirty_tables and not actions._save_tasks


@pytest.mark.asyncio
async def test_unconfirmed_create_returns_reload_guidance(test_db, test_game_session):
    manager = TableManager(test_db)
    manager.save_table_async = AsyncMock(return_value=False)
    session = SimpleNamespace(game_session_db_id=test_game_session.id, session_code="TEST01",
                              client_info={"dm": {"role": "owner", "user_id": test_game_session.owner_id}})
    protocol = ServerProtocol(manager, session_manager=session)
    protocol.broadcast_to_session = AsyncMock()
    response = await protocol.handle_new_table_request(Message(MessageType.NEW_TABLE_REQUEST, {
        "table_name": "Draft", "width": 1000, "height": 1000,
    }), "dm")
    assert response.type == MessageType.ERROR
    assert response.data["code"] == "table_creation_save_failed"
    assert response.data["reload_required"] is True
    assert "Reload before retrying" in response.data["error"]
    protocol.broadcast_to_session.assert_not_awaited()
    assert not manager.tables_id
