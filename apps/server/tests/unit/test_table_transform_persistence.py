import pytest
from core_table.actions_core import ActionsCore
from core_table.async_actions_protocol import Position
from core_table.server import TableManager
from database import crud


@pytest.mark.asyncio
@pytest.mark.parametrize("operation", ["move", "scale"])
async def test_table_transform_survives_persistence(test_db, test_game_session, operation):
    manager = TableManager(test_db)
    table = manager.create_table("Transform", 1000, 1000)
    crud.save_table_to_db(test_db, table, test_game_session.id)
    actions = ActionsCore(manager)
    table_id = str(table.table_id)
    if operation == "move":
        result = await actions.move_table(table_id, Position(15, 30), session_id=test_game_session.id)
    else:
        result = await actions.scale_table(table_id, 2, 3, session_id=test_game_session.id)
    assert result.success
    await actions.flush_all_pending_saves()
    test_db.expire_all()
    loaded, success = crud.load_table_from_db(test_db, table_id)
    assert success
    if operation == "move":
        assert loaded.position == (15, 30)
    else:
        assert loaded.scale == (2, 3)


@pytest.mark.asyncio
@pytest.mark.parametrize("operation", ["move", "scale"])
async def test_invalid_transform_does_not_mutate_table(operation):
    manager = TableManager()
    table = manager.create_table("Transform", 1000, 1000)
    actions = ActionsCore(manager)
    before = (table.position, table.scale)
    if operation == "move":
        result = await actions.move_table(str(table.table_id), Position(float("nan"), 0))
    else:
        result = await actions.scale_table(str(table.table_id), -1, 1)
    assert not result.success
    assert (table.position, table.scale) == before
    assert not actions.action_history
