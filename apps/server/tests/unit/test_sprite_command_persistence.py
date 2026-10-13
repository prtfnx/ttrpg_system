"""Rejected legacy sprite writes cannot leak into live state or later saves."""
import asyncio
import copy
from unittest.mock import AsyncMock

import pytest
from core_table.actions_core import ActionsCore
from core_table.server import TableManager
from database import crud


@pytest.fixture
def scene(test_db, test_game_session):
    manager = TableManager(test_db)
    table = manager.create_table("Sprite commands", 1000, 1000)
    table.add_entity({"sprite_id": "sprite", "x": 10, "y": 20, "layer": "tokens", "metadata": '{"text":"Привіт"}'})
    crud.save_table_to_db(test_db, table, test_game_session.id)
    return ActionsCore(manager), table, test_game_session.id


def command(actions, table, session_id, kind):
    table_id = str(table.table_id)
    if kind == "create":
        return actions.create_sprite(table_id, {"sprite_id": "new", "x": 50, "y": 50, "layer": "tokens"}, session_id)
    if kind == "delete":
        return actions.delete_sprite(table_id, "sprite", session_id)
    if kind == "move":
        return actions.move_sprite(table_id, "sprite", {"x": 10, "y": 20}, {"x": 30, "y": 40}, session_id)
    if kind == "scale":
        return actions.scale_sprite(table_id, "sprite", 2, 3, session_id)
    if kind == "rotate":
        return actions.rotate_sprite(table_id, "sprite", 90, session_id)
    if kind == "layer":
        return actions.move_sprite_to_layer(table_id, "sprite", "map", session_id)
    return actions.update_sprite(table_id, "sprite", session_id, metadata='{"text":"Changed"}', width=120)


@pytest.mark.parametrize("kind", ["create", "delete", "move", "scale", "rotate", "update", "layer"])
@pytest.mark.parametrize("raises", [False, True])
async def test_failed_write_has_no_live_history_or_background_retry(scene, monkeypatch, kind, raises):
    actions, table, session_id = scene
    before = copy.deepcopy(table.to_dict())
    save = AsyncMock(side_effect=RuntimeError("private storage failure") if raises else None, return_value=False)
    monkeypatch.setattr(actions.table_manager, "save_table_async", save)
    actions._save_delay = 0.001
    result = await command(actions, table, session_id, kind)
    await asyncio.sleep(0.01)
    assert not result.success and "private" not in result.message
    assert table.to_dict() == before
    assert not actions.action_history and not actions._dirty_tables and not actions._save_tasks
    save.assert_awaited_once()
    assert save.call_args.kwargs["draft"] is not table


@pytest.mark.parametrize("kind", ["create", "delete", "move", "scale", "rotate", "update", "layer"])
async def test_success_is_published_only_after_storage_and_reloads_identically(scene, test_db, monkeypatch, kind):
    actions, table, session_id = scene
    before = copy.deepcopy(table.to_dict())
    original = actions.table_manager.save_table_async

    async def save(*args, **kwargs):
        assert table.to_dict() == before
        assert not actions.action_history
        return await original(*args, **kwargs)

    monkeypatch.setattr(actions.table_manager, "save_table_async", save)
    assert (await command(actions, table, session_id, kind)).success
    test_db.expire_all()
    loaded, success = crud.load_table_from_db(test_db, str(table.table_id))
    assert success and loaded.to_dict() == table.to_dict()
    assert len(actions.action_history) == 1


async def test_repeated_cancellation_waits_for_commit_and_live_publication(scene, monkeypatch):
    actions, table, session_id = scene
    started, release = asyncio.Event(), asyncio.Event()
    original = actions.table_manager.save_table_async

    async def save(*args, **kwargs):
        started.set()
        await release.wait()
        return await original(*args, **kwargs)

    monkeypatch.setattr(actions.table_manager, "save_table_async", save)
    task = asyncio.create_task(command(actions, table, session_id, "rotate"))
    await started.wait()
    task.cancel()
    await asyncio.sleep(0)
    task.cancel()
    await asyncio.sleep(0)
    assert not task.done() and table.find_entity_by_sprite_id("sprite").rotation == 0
    release.set()
    with pytest.raises(asyncio.CancelledError):
        await task
    assert table.find_entity_by_sprite_id("sprite").rotation == 90
    assert len(actions.action_history) == 1
