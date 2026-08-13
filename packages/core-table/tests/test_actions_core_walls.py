import pytest
from core_table.actions_core import ActionsCore
from core_table.entities import Wall
from core_table.server import TableManager


@pytest.fixture
def wall_actions():
    manager = TableManager()
    first_table = manager.create_table("First", 100, 100)
    second_table = manager.create_table("Second", 100, 100)
    wall = Wall(
        table_id=str(first_table.table_id),
        x1=0,
        y1=0,
        x2=10,
        y2=10,
    )
    first_table.add_wall(wall)
    return ActionsCore(manager), first_table, second_table, wall


@pytest.mark.asyncio
async def test_update_wall_rejects_wall_from_another_table(wall_actions):
    actions, first_table, second_table, wall = wall_actions

    with pytest.raises(KeyError, match="not found"):
        await actions.update_wall(
            str(second_table.table_id),
            wall.wall_id,
            {"door_state": "open"},
        )

    assert first_table.get_wall(wall.wall_id).door_state == "closed"


@pytest.mark.asyncio
async def test_delete_wall_rejects_wall_from_another_table(wall_actions):
    actions, first_table, second_table, wall = wall_actions

    with pytest.raises(KeyError, match="not found"):
        await actions.delete_wall(str(second_table.table_id), wall.wall_id)

    assert first_table.get_wall(wall.wall_id) is wall


@pytest.mark.asyncio
async def test_create_wall_rejects_coordinates_outside_table(wall_actions):
    actions, first_table, _, _ = wall_actions

    with pytest.raises(ValueError, match="between 0 and 100"):
        await actions.create_wall(
            str(first_table.table_id),
            {"x1": 0, "y1": 0, "x2": 101, "y2": 10},
        )


@pytest.mark.asyncio
async def test_update_wall_rejects_non_finite_coordinates(wall_actions):
    actions, first_table, _, wall = wall_actions

    with pytest.raises(ValueError, match="must be finite"):
        await actions.update_wall(
            str(first_table.table_id),
            wall.wall_id,
            {"x2": float("nan")},
        )

    assert first_table.get_wall(wall.wall_id).x2 == 10
