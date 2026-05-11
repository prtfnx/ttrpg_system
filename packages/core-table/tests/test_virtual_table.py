import uuid

import pytest
from core_table.entities import Wall
from core_table.table import Entity, VirtualTable


def make_table(w: int = 20, h: int = 20) -> VirtualTable:
    return VirtualTable(name='Test Table', width=w, height=h)


def add_entity(table: VirtualTable, x: int = 0, y: int = 0, layer: str = 'tokens', **kwargs) -> Entity:
    data = {'name': 'Hero', 'x': x, 'y': y, 'layer': layer, **kwargs}
    return table.add_entity(data)


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
        assert e2.entity_id == e1.entity_id + 1


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
        t.move_entity(e.entity_id, (3, 3))
        assert e.position == (3, 3)

    def test_old_position_cleared(self):
        t = make_table()
        e = add_entity(t, x=0, y=0)
        t.move_entity(e.entity_id, (1, 1))
        assert t.grid['tokens'][0][0] is None

    def test_move_occupied_raises_and_rolls_back(self):
        t = make_table()
        e1 = add_entity(t, x=0, y=0)
        add_entity(t, x=1, y=1)
        with pytest.raises(ValueError, match='occupied'):
            t.move_entity(e1.entity_id, (1, 1))
        assert e1.position == (0, 0)

    def test_move_missing_entity_raises(self):
        t = make_table()
        with pytest.raises(ValueError):
            t.move_entity(999, (0, 0))


class TestRemoveEntity:
    def test_entity_removed_from_dict(self):
        t = make_table()
        e = add_entity(t)
        t.remove_entity(e.entity_id)
        assert e.entity_id not in t.entities

    def test_sprite_mapping_cleaned_up(self):
        t = make_table()
        e = add_entity(t)
        sid = e.sprite_id
        t.remove_entity(e.entity_id)
        assert sid not in t.sprite_to_entity

    def test_grid_cell_cleared(self):
        t = make_table()
        e = add_entity(t, x=2, y=3)
        t.remove_entity(e.entity_id)
        assert t.grid['tokens'][3][2] is None

    def test_remove_missing_raises(self):
        t = make_table()
        with pytest.raises(ValueError):
            t.remove_entity(999)


class TestWalls:
    def _wall(self, wall_id: str = None) -> Wall:
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
        assert t.get_wall(w.wall_id).door_state == 'open'

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
