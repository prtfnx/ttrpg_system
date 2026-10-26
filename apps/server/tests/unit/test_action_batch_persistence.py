import asyncio
import copy
from unittest.mock import AsyncMock

import pytest
from core_table.action_batches import state_hash
from core_table.actions_core import ActionsCore
from core_table.async_actions_protocol import Position
from core_table.server import TableManager
from database import crud


@pytest.fixture
def batch_scene(test_db, test_game_session, test_user):
    manager = TableManager(test_db)
    table = manager.create_table("Batch", 1000, 1000)
    entity = table.add_entity({"sprite_id": "batch-sprite", "x": 10, "y": 20, "layer": "tokens", "metadata": '{"text":"Привіт"}'})
    crud.save_table_to_db(test_db, table, test_game_session.id)
    return ActionsCore(manager), table, entity.sprite_id, {"table_id": str(table.table_id), "session_id": test_game_session.id, "actor_id": test_user.id}


def changes(sprite_id):
    return [{"type": "rotate_sprite", "params": {"sprite_id": sprite_id, "angle": 90}},
            {"type": "scale_sprite", "params": {"sprite_id": sprite_id, "scale_x": 2, "scale_y": 3}}]


@pytest.mark.asyncio
async def test_batch_and_inverse_survive_database_reload(batch_scene, test_db):
    actions, table, sprite_id, context = batch_scene
    before = copy.deepcopy(table.to_dict())
    assert (await actions.batch_actions(changes(sprite_id), expected_state=state_hash(before)[0], **context)).success
    test_db.expire_all()
    loaded, success = crud.load_table_from_db(test_db, context["table_id"])
    assert success and loaded is not None
    entity = loaded.find_entity_by_sprite_id(sprite_id)
    assert entity is not None and entity.rotation == 90
    assert (await actions.undo_action(**context)).success
    test_db.expire_all()
    loaded, success = crud.load_table_from_db(test_db, context["table_id"])
    assert success and loaded is not None and loaded.to_dict() == before
    assert (await actions.redo_action(**context)).success
    assert table.find_entity_by_sprite_id(sprite_id).scale_x == 2


@pytest.mark.asyncio
@pytest.mark.parametrize("raises", [False, True])
async def test_failed_save_does_not_publish_or_record_batch(batch_scene, monkeypatch, raises):
    actions, table, sprite_id, context = batch_scene
    before = copy.deepcopy(table.to_dict())
    save = AsyncMock(return_value=False)
    if raises:
        save.side_effect = RuntimeError("private database details")
    monkeypatch.setattr(actions.table_manager, "save_table_async", save)
    result = await actions.batch_actions(changes(sprite_id), **context)
    assert not result.success and "private" not in result.message
    save.assert_awaited_once()
    assert table.to_dict() == before and not actions.action_history
    assert not actions._dirty_tables and not actions._save_tasks


@pytest.mark.asyncio
async def test_failed_inverse_keeps_current_state_and_history(batch_scene, monkeypatch):
    actions, table, sprite_id, context = batch_scene
    assert (await actions.batch_actions(changes(sprite_id), **context)).success
    before = copy.deepcopy(table.to_dict())
    monkeypatch.setattr(actions.table_manager, "save_table_async", AsyncMock(return_value=False))
    assert not (await actions.undo_action(**context)).success
    assert table.to_dict() == before and len(actions.undo_stack) == 1 and not actions.redo_stack


@pytest.mark.asyncio
@pytest.mark.parametrize("undo", [False, True])
async def test_cancellation_waits_for_commit_publication_and_history(batch_scene, monkeypatch, undo):
    actions, table, sprite_id, context = batch_scene
    if undo:
        assert (await actions.batch_actions(changes(sprite_id), **context)).success
    started, release = asyncio.Event(), asyncio.Event()
    original = actions.table_manager.save_table_async

    async def wait_before_save(*args, **kwargs):
        started.set()
        await release.wait()
        return await original(*args, **kwargs)

    monkeypatch.setattr(actions.table_manager, "save_table_async", wait_before_save)
    task = asyncio.create_task(actions.undo_action(**context) if undo else actions.batch_actions(changes(sprite_id), **context))
    await started.wait()
    task.cancel()
    await asyncio.sleep(0)
    task.cancel()
    await asyncio.sleep(0)
    assert not task.done() and table.find_entity_by_sprite_id(sprite_id).rotation == (90 if undo else 0)
    release.set()
    with pytest.raises(asyncio.CancelledError):
        await task
    assert table.find_entity_by_sprite_id(sprite_id).rotation == (0 if undo else 90)
    assert len(actions.redo_stack if undo else actions.undo_stack) == 1


@pytest.mark.asyncio
async def test_persistent_history_requires_context_and_excludes_rejected_legacy_changes(batch_scene, monkeypatch):
    actions, table, sprite_id, context = batch_scene
    assert not (await actions.batch_actions(changes(sprite_id), table_id=context["table_id"])).success
    monkeypatch.setattr(actions.table_manager, "save_table_async", AsyncMock(return_value=False))
    actions._save_delay = 60
    assert not (await actions.move_table(context["table_id"], Position(20, 30), context["session_id"])).success
    assert not actions.action_history
    await actions.stop_persistence()
