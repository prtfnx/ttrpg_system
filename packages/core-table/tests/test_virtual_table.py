import json
import uuid

import pytest
from core_table.entities import Wall
from core_table.actions_core import ActionsCore
from core_table.server import TableManager
from core_table.table import CoverZone, Entity, VirtualTable, create_table_from_json


def make_table(w: int = 20, h: int = 20) -> VirtualTable:
    return VirtualTable(name='Test Table', width=w, height=h)


def add_entity(table: VirtualTable, x: int = 0, y: int = 0, layer: str = 'tokens', **kwargs) -> Entity:
    data = {'name': 'Hero', 'x': x, 'y': y, 'layer': layer, **kwargs}
    return table.add_entity(data)


def entity_id(entity: Entity) -> int:
    assert entity.entity_id is not None
    return entity.entity_id


class TestVirtualTableInit:
    def test_defaults(self):
        t = make_table()
        assert t.width == 20
        assert t.height == 20
        assert isinstance(t.table_id, uuid.UUID)

    def test_empty_name_raises(self):
        with pytest.raises(ValueError):
            VirtualTable(name='', width=10, height=10)

    def test_zero_width_raises(self):
        with pytest.raises(ValueError):
            VirtualTable(name='X', width=0, height=10)

    def test_zero_height_raises(self):
        with pytest.raises(ValueError):
            VirtualTable(name='X', width=10, height=0)

    def test_custom_uuid_string(self):
        uid = str(uuid.uuid4())
        t = VirtualTable(name='T', width=5, height=5, table_id=uid)
        assert str(t.table_id) == uid

    def test_invalid_uuid_raises(self):
        with pytest.raises(ValueError):
            VirtualTable(name='T', width=5, height=5, table_id='not-a-uuid')

    def test_pixels_per_unit(self):
        t = VirtualTable(name='T', width=5, height=5, grid_cell_px=50.0, cell_distance=5.0)
        assert t.pixels_per_unit == 10.0

    def test_large_empty_table_uses_sparse_position_index(self):
        t = VirtualTable(name='Large', width=10_000, height=10_000)

        assert set(t.entity_index) == set(t.layers)
        assert all(not layer_index for layer_index in t.entity_index.values())


class TestAddEntity:
    def test_returns_entity(self):
        t = make_table()
        e = add_entity(t, x=1, y=1)
        assert isinstance(e, Entity)

    def test_entity_stored(self):
        t = make_table()
        e = add_entity(t)
        assert e.entity_id in t.entities

    def test_sprite_id_indexed(self):
        t = make_table()
        e = add_entity(t, x=2, y=3)
        assert t.sprite_to_entity[e.sprite_id] == e.entity_id

    def test_custom_sprite_id_honored(self):
        t = make_table()
        sid = str(uuid.uuid4())
        e = add_entity(t, x=0, y=0, sprite_id=sid)
        assert e.sprite_id == sid

    def test_invalid_layer_raises(self):
        t = make_table()
        with pytest.raises(ValueError):
            t.add_entity({'name': 'X', 'x': 0, 'y': 0, 'layer': 'nonexistent'})

    def test_position_clamped_to_bounds(self):
        t = make_table(w=10, h=10)
        e = add_entity(t, x=99, y=99)
        assert e.position == (9, 9)

    def test_increments_next_entity_id(self):
        t = make_table()
        e1 = add_entity(t, x=0, y=0)
        e2 = add_entity(t, x=1, y=1)
        assert entity_id(e2) == entity_id(e1) + 1

    def test_normalizes_json_encoded_controller_ids(self):
        entity = add_entity(
            make_table(),
            controlled_by='["4", 7, -1, true, "invalid"]',
        )

        assert entity.controlled_by == [4, 7]

    @pytest.mark.parametrize("controlled_by", ['{}', 'null', '4', 'not-json', {"id": 4}])
    def test_non_list_controller_metadata_is_ignored(self, controlled_by):
        entity = add_entity(make_table(), controlled_by=controlled_by)

        assert entity.controlled_by == []


class TestFindEntity:
    def test_find_by_sprite_id(self):
        t = make_table()
        e = add_entity(t, x=5, y=5)
        found = t.find_entity_by_sprite_id(e.sprite_id)
        assert found is e

    def test_find_missing_returns_none(self):
        t = make_table()
        assert t.find_entity_by_sprite_id('no-such-id') is None


class TestMoveEntity:
    def test_move_to_valid_position(self):
        t = make_table()
        e = add_entity(t, x=0, y=0)
        t.move_entity(entity_id(e), (3, 3))
        assert e.position == (3, 3)

    def test_old_position_cleared(self):
        t = make_table()
        e = add_entity(t, x=0, y=0)
        t.move_entity(entity_id(e), (1, 1))
        assert t.get_entity_at_position((0, 0), 'tokens') is None
        assert t.get_entity_at_position((1, 1), 'tokens') is e

    def test_move_occupied_raises_and_rolls_back(self):
        t = make_table()
        e1 = add_entity(t, x=0, y=0)
        add_entity(t, x=1, y=1)
        with pytest.raises(ValueError, match='occupied'):
            t.move_entity(entity_id(e1), (1, 1))
        assert e1.position == (0, 0)

    def test_move_missing_entity_raises(self):
        t = make_table()
        with pytest.raises(ValueError):
            t.move_entity(999, (0, 0))


class TestRemoveEntity:
    def test_entity_removed_from_dict(self):
        t = make_table()
        e = add_entity(t)
        t.remove_entity(entity_id(e))
        assert e.entity_id not in t.entities

    def test_sprite_mapping_cleaned_up(self):
        t = make_table()
        e = add_entity(t)
        sid = e.sprite_id
        t.remove_entity(entity_id(e))
        assert sid not in t.sprite_to_entity

    def test_grid_cell_cleared(self):
        t = make_table()
        e = add_entity(t, x=2, y=3)
        t.remove_entity(entity_id(e))
        assert t.get_entity_at_position((2, 3), 'tokens') is None

    def test_removing_overlapped_entity_keeps_current_position_index(self):
        t = make_table()
        first = add_entity(t, x=2, y=3)
        second = add_entity(t, x=2, y=3)

        t.remove_entity(entity_id(first))

        assert t.get_entity_at_position((2, 3), 'tokens') is second

    def test_removing_current_overlapped_entity_reveals_previous_entity(self):
        t = make_table()
        first = add_entity(t, x=2, y=3)
        second = add_entity(t, x=2, y=3)

        t.remove_entity(entity_id(second))

        assert t.get_entity_at_position((2, 3), 'tokens') is first

    def test_remove_missing_raises(self):
        t = make_table()
        with pytest.raises(ValueError):
            t.remove_entity(999)


class TestPositionQueries:
    def test_invalid_restore_does_not_replace_indexed_entity(self):
        table = make_table()
        existing = add_entity(table, x=4, y=5)
        replacement = Entity(
            name='Invalid replacement',
            position=(table.width, table.height),
            layer='tokens',
            entity_id=entity_id(existing),
        )

        assert table.restore_entity(replacement) is False
        assert table.entities[entity_id(existing)] is existing
        assert table.sprite_to_entity[existing.sprite_id] == entity_id(existing)
        assert replacement.sprite_id not in table.sprite_to_entity
        assert table.get_entity_at_position((4, 5), 'tokens') is existing

    def test_get_entity_at_position_checks_requested_layer(self):
        t = make_table()
        token = add_entity(t, x=4, y=5, layer='tokens')
        add_entity(t, x=4, y=5, layer='map')

        assert t.get_entity_at_position((4, 5), 'tokens') is token
        assert t.get_entity_at_position((4, 5), 'light') is None

    def test_get_entities_in_area_filters_sparse_index(self):
        t = make_table()
        inside = add_entity(t, x=4, y=5)
        outside = add_entity(t, x=15, y=15)
        map_entity = add_entity(t, x=6, y=6, layer='map')

        assert t.get_entities_in_area((3, 3), (7, 7)) == [map_entity, inside]
        assert t.get_entities_in_area((3, 3), (7, 7), 'tokens') == [inside]
        assert outside not in t.get_entities_in_area((3, 3), (7, 7))


class TestSerialization:
    def test_entity_roundtrip_preserves_render_and_gameplay_fields(self):
        entity = Entity(
            name='Gate',
            position=(3, 4),
            layer='obstacles',
            entity_id=7,
            obstacle_type='polygon',
            obstacle_data={'vertices': [[0, 0], [2, 0], [1, 2]]},
            character_id='char-1',
            controlled_by=[2, 3],
            hp=9,
            max_hp=12,
            ac=15,
            asset_id='asset-1',
            width=48,
            height=64,
            vision_radius=30,
            has_darkvision=True,
        )
        entity.rotation = 22.5

        restored = Entity.from_dict(entity.to_dict())

        assert restored.to_dict() == entity.to_dict()

    def test_table_to_json_can_be_loaded_without_losing_entities(self):
        table = make_table()
        entity = add_entity(
            table,
            x=3,
            y=4,
            obstacle_type='circle',
            obstacle_data={'radius': 2},
            character_id='char-1',
            controlled_by=[4],
            hp=8,
            max_hp=10,
            asset_id='asset-1',
            width=32,
            height=40,
            vision_radius=25,
            has_darkvision=True,
        )
        entity.rotation = 45
        wall = Wall(table_id=str(table.table_id), x1=0, y1=1, x2=2, y2=3, is_door=True)
        table.add_wall(wall)
        table.cover_zones = [CoverZone('cover-1', 'rect', [0, 0, 2, 2])]
        table.difficult_terrain_cells = {(2, 3)}
        table.grid_enabled = False
        table.snap_to_grid = False
        table.grid_color_hex = '#112233'
        table.background_color_hex = '#445566'

        restored = create_table_from_json(table.to_json())
        restored_entity = next(iter(restored.entities.values()))

        assert restored.display_name == table.display_name
        assert restored_entity.to_dict() == entity.to_dict()
        assert restored.get_all_walls()[0] == {
            **wall.to_dict(),
            'table_id': str(restored.table_id),
        }
        assert [zone.to_dict() for zone in restored.cover_zones] == [zone.to_dict() for zone in table.cover_zones]
        assert restored.difficult_terrain_cells == {(2, 3)}
        assert restored.grid_enabled is False
        assert restored.snap_to_grid is False
        assert restored.grid_color_hex == '#112233'
        assert restored.background_color_hex == '#445566'

    def test_flat_legacy_json_remains_supported(self):
        payload = {
            'name': 'Legacy',
            'width': 20,
            'height': 20,
            'entities': [Entity('Hero', (1, 2), 'tokens', entity_id=1).to_dict()],
        }

        restored = create_table_from_json(json.dumps(payload))

        assert restored.display_name == 'Legacy'
        assert len(restored.entities) == 1

    def test_malformed_settings_fall_back_to_safe_defaults(self):
        table = make_table()

        table.from_dict({
            'table_name': 'Malformed settings',
            'width': 20,
            'height': 20,
            'layers': {},
            'dynamic_lighting_enabled': 'false',
            'fog_exploration_mode': 'unlimited',
            'ambient_light_level': float('nan'),
            'grid_cell_px': -50,
            'cell_distance': 'invalid',
            'distance_unit': 'yards',
            'grid_enabled': 'false',
            'snap_to_grid': 0,
        })

        assert table.dynamic_lighting_enabled is False
        assert table.fog_exploration_mode == 'current_only'
        assert table.ambient_light_level == 1.0
        assert table.grid_cell_px == 50.0
        assert table.cell_distance == 5.0
        assert table.distance_unit == 'ft'
        assert table.grid_enabled is True
        assert table.snap_to_grid is True

    @pytest.mark.asyncio
    async def test_create_action_hydrates_initial_table_before_registration(self):
        source = make_table()
        add_entity(source, x=2, y=3, asset_id='asset-1', hp=7)
        manager = TableManager()
        actions = ActionsCore(manager)

        result = await actions.create_table(
            'Copy',
            20,
            20,
            initial_data=source.to_dict(),
        )

        assert result.success is True
        created = result.data['table']
        assert created.display_name == 'Copy'
        assert len(created.entities) == 1
        assert next(iter(created.entities.values())).asset_id == 'asset-1'


class TestWalls:
    def _wall(self, wall_id: str | None = None) -> Wall:
        return Wall(table_id='test', x1=0, y1=0, x2=10, y2=0, wall_id=wall_id or str(uuid.uuid4()))

    def test_add_wall(self):
        t = make_table()
        w = self._wall()
        t.add_wall(w)
        assert w.wall_id in t.walls

    def test_get_wall(self):
        t = make_table()
        w = self._wall()
        t.add_wall(w)
        assert t.get_wall(w.wall_id) is w

    def test_get_missing_wall_returns_none(self):
        assert make_table().get_wall('nope') is None

    def test_update_wall(self):
        t = make_table()
        w = self._wall()
        t.add_wall(w)
        t.update_wall(w.wall_id, {'door_state': 'open'})
        updated = t.get_wall(w.wall_id)
        assert updated is not None
        assert updated.door_state == 'open'

    def test_remove_wall(self):
        t = make_table()
        w = self._wall()
        t.add_wall(w)
        t.remove_wall(w.wall_id)
        assert w.wall_id not in t.walls

    def test_get_all_walls(self):
        t = make_table()
        t.add_wall(self._wall())
        t.add_wall(self._wall())
        assert len(t.get_all_walls()) == 2


class TestSerialization:
    def test_to_dict_roundtrip_preserves_dimensions(self):
        t = VirtualTable(name='Roundtrip', width=15, height=12)
        d = t.to_dict()
        assert d['width'] == 15
        assert d['height'] == 12

    def test_to_dict_has_required_keys(self):
        d = make_table().to_dict()
        for key in ('table_id', 'width', 'height', 'table_name'):
            assert key in d
