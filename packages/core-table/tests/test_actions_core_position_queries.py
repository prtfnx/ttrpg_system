import pytest
from core_table.actions_core import ActionsCore
from core_table.async_actions_protocol import Position
from core_table.server import TableManager


@pytest.fixture
def positioned_actions():
    manager = TableManager()
    table = manager.create_table("Large", 10_000, 10_000)
    token = table.add_entity({
        "name": "Token",
        "x": 4_000,
        "y": 5_000,
        "layer": "tokens",
    })
    map_entity = table.add_entity({
        "name": "Map marker",
        "x": 4_001,
        "y": 5_001,
        "layer": "map",
    })
    return ActionsCore(manager), str(table.table_id), token, map_entity


@pytest.mark.asyncio
async def test_get_sprite_at_position_uses_table_position_index(positioned_actions):
    actions, table_id, token, _ = positioned_actions

    result = await actions.get_sprite_at_position(
        table_id,
        Position(4_000, 5_000),
        "tokens",
    )

    assert result.success
    assert result.data["sprite_id"] == token.sprite_id


@pytest.mark.asyncio
async def test_get_sprites_in_area_returns_entities_across_layers(positioned_actions):
    actions, table_id, token, map_entity = positioned_actions

    result = await actions.get_sprites_in_area(
        table_id,
        Position(3_999, 4_999),
        Position(4_002, 5_002),
    )

    assert result.success
    assert set(result.data["sprites"]) == {token.sprite_id, map_entity.sprite_id}
