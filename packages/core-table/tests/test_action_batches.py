import copy

import pytest
from core_table.actions_core import ActionsCore
from core_table.server import TableManager


@pytest.fixture
def scene():
    manager = TableManager()
    table = manager.create_table("Actions", 1000, 1000)
    entity = table.add_entity({"sprite_id": "s", "x": 10, "y": 20, "layer": "tokens", "metadata": '{"text":"Привіт"}'})
    return ActionsCore(manager), table, entity.sprite_id


def update(sprite_id, **changes):
    return {"type": "update_sprite", "params": {"sprite_id": sprite_id, **changes}}


@pytest.mark.asyncio
async def test_batch_is_one_reversible_step_and_restores_metadata_and_indexes(scene):
    actions, table, sprite_id = scene
    before = copy.deepcopy(table.to_dict())
    result = await actions.batch_actions([update(sprite_id, rotation=90), {
        "type": "move_sprite", "params": {"sprite_id": sprite_id, "old_position": {"x": 10, "y": 20}, "new_position": {"x": 30, "y": 40}},
    }], table_id=str(table.table_id), actor_id=1)
    assert result.success and result.data["atomic"] is True
    assert len(actions.undo_stack) == 1
    after = copy.deepcopy(table.to_dict())
    assert (await actions.undo_action(table_id=str(table.table_id), actor_id=1)).success
    assert table.to_dict() == before
    entity = table.find_entity_by_sprite_id(sprite_id)
    assert entity.entity_id in table.entity_index["tokens"][(10, 20)]
    assert (await actions.redo_action(table_id=str(table.table_id), actor_id=1)).success
    assert table.to_dict() == after


@pytest.mark.asyncio
async def test_failed_command_rolls_back_entire_batch(scene):
    actions, table, sprite_id = scene
    before = copy.deepcopy(table.to_dict())
    result = await actions.batch_actions([update(sprite_id, rotation=90), update("missing", rotation=90)], table_id=str(table.table_id))
    assert not result.success and result.data["failed_index"] == 1
    assert table.to_dict() == before
    assert not actions.action_history and not actions.undo_stack


@pytest.mark.asyncio
@pytest.mark.parametrize("commands", [[], [{}] * 101, [{"type": "delete_table", "params": {}}],
                                     [{"type": "update_sprite", "params": {"table_id": "other"}}],
                                     [{"type": "update_sprite", "params": {"sprite_id": "s", "controlled_by": [2]}}],
                                     [{"type": "update_table", "params": {"table_id": "wrong"}}]])
async def test_malformed_or_cross_table_batches_reject_before_mutation(scene, commands):
    actions, table, _ = scene
    before = copy.deepcopy(table.to_dict())
    assert not (await actions.batch_actions(commands, table_id=str(table.table_id))).success
    assert table.to_dict() == before


@pytest.mark.asyncio
async def test_history_cannot_overwrite_later_edits_or_another_actors_scope(scene):
    actions, table, sprite_id = scene
    await actions.batch_actions([update(sprite_id, rotation=90)], table_id=str(table.table_id), actor_id=1)
    assert not (await actions.undo_action(table_id=str(table.table_id), actor_id=2)).success
    table.find_entity_by_sprite_id(sprite_id).rotation = 45
    result = await actions.undo_action(table_id=str(table.table_id), actor_id=1)
    assert not result.success and result.data["code"] == "history_conflict"
    assert len(actions.undo_stack) == 1 and not actions.redo_stack
    assert table.find_entity_by_sprite_id(sprite_id).rotation == 45


@pytest.mark.asyncio
async def test_legacy_audit_entries_do_not_pretend_to_be_reversible(scene):
    actions, table, sprite_id = scene
    assert (await actions.rotate_sprite(str(table.table_id), sprite_id, 90)).success
    assert actions.action_history and not actions.undo_stack
    assert not (await actions.undo_action(table_id=str(table.table_id))).success


@pytest.mark.asyncio
async def test_new_actor_batch_does_not_clear_another_actors_redo(scene):
    actions, table, sprite_id = scene
    table_id = str(table.table_id)
    await actions.batch_actions([update(sprite_id, rotation=90)], table_id=table_id, actor_id=1)
    await actions.undo_action(table_id=table_id, actor_id=1)
    await actions.batch_actions([update(sprite_id, rotation=45)], table_id=table_id, actor_id=2)
    assert len(actions.redo_stack) == 1
    assert not (await actions.redo_action(table_id=table_id, actor_id=1)).success


@pytest.mark.asyncio
async def test_expected_state_and_history_budgets_are_enforced(scene):
    actions, table, sprite_id = scene
    assert not (await actions.batch_actions([update(sprite_id, rotation=90)], table_id=str(table.table_id), expected_state="stale")).success
    for index in range(105):
        await actions.batch_actions([update(sprite_id, rotation=index)], table_id=str(table.table_id))
    assert len(actions.action_history) == len(actions.undo_stack) == 100


@pytest.mark.asyncio
async def test_snapshot_byte_limit_rejects_before_writing(scene):
    actions, table, sprite_id = scene
    table.find_entity_by_sprite_id(sprite_id).metadata = "a" * (1024 * 1024)
    result = await actions.batch_actions([update(sprite_id, rotation=90)], table_id=str(table.table_id))
    assert not result.success and not actions.action_history
    assert table.find_entity_by_sprite_id(sprite_id).rotation == 0


@pytest.mark.asyncio
async def test_evicted_audit_entries_cannot_leave_unbounded_undo_data(scene, monkeypatch):
    from core_table import action_batches
    monkeypatch.setattr(action_batches, "MAX_HISTORY_BYTES", 2500)
    actions, table, sprite_id = scene
    for angle in range(10):
        assert (await actions.batch_actions([update(sprite_id, rotation=angle)], table_id=str(table.table_id))).success
    assert sum(entry["history_bytes"] for entry in actions.action_history) <= 2500
    assert len(actions.undo_stack) == len(actions.action_history) < 10
