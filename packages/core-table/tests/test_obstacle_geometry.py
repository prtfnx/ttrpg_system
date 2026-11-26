from types import SimpleNamespace

import pytest
from core_table.obstacle_geometry import obstacle_boundary
from core_table.pathfinding import PathfindingSystem, SpatialHashGrid


def shape(**overrides):
    return SimpleNamespace(**{'entity_id': 1, 'sprite_id': 'shape', 'position': (100, 100),
        'width': 20, 'height': 10, 'layer': 'obstacles', 'obstacle_type': 'rectangle',
        'scale_x': 1, 'scale_y': 1, 'rotation': 0, 'obstacle_data': None, **overrides})



@pytest.mark.parametrize('indexed', [False, True])
def test_rotated_scaled_shapes_block_their_actual_boundary(indexed):
    obstacle = shape(scale_x=2, scale_y=3, rotation=90)
    grid = SpatialHashGrid.build([], [obstacle], 10) if indexed else None
    assert PathfindingSystem.is_path_blocked_by_obstacles((120, 90), (120, 140), [obstacle], spatial_hash=grid)
    assert not PathfindingSystem.is_path_blocked_by_obstacles((95, 100), (95, 140), [obstacle], spatial_hash=grid)


@pytest.mark.parametrize('kind', ['line', 'polygon'])
def test_world_vertex_obstacles_use_geometry_instead_of_the_anchor_box(kind):
    obstacle = shape(obstacle_type=kind, obstacle_data={'vertices': [[10, 10], [30, 10], [30, 30]]})
    grid = SpatialHashGrid.build([], [obstacle], 10)
    assert PathfindingSystem.is_path_blocked_by_obstacles((20, 0), (20, 20), [obstacle], spatial_hash=grid)
    assert not PathfindingSystem.is_path_blocked_by_obstacles((100, 95), (100, 115), [obstacle], spatial_hash=grid)


def test_moving_an_obstacle_excludes_its_authoritative_sprite_identity():
    obstacle = shape()
    assert not PathfindingSystem.is_path_blocked_by_obstacles((105, 105), (150, 105), [obstacle], 'shape')


def test_large_boundaries_use_bounded_index_fallback_without_losing_collision():
    obstacle = shape(width=100_000, height=100_000)
    grid = SpatialHashGrid.build([], [obstacle], 10)
    assert not grid._obstacles
    assert PathfindingSystem.is_path_blocked_by_obstacles((105, 105), (115, 105), [obstacle], spatial_hash=grid)


def test_malformed_vertices_fail_closed_for_movement():
    obstacle = shape(obstacle_type='polygon', obstacle_data={'vertices': [[float('nan'), 10], [20, 20]]})
    with pytest.raises(ValueError):
        obstacle_boundary(obstacle)
    assert PathfindingSystem.is_path_blocked_by_obstacles((0, 0), (1, 1), [obstacle])


@pytest.mark.parametrize('rule', ['standard', 'alternate', 'realistic'])
def test_terrain_cost_does_not_depend_on_client_waypoint_placement(rule):
    direct = PathfindingSystem.get_path_movement_cost(
        [(25, 25), (175, 25)], grid_size=50, diagonal_rule=rule, difficult_cells={(1, 0)})
    split = PathfindingSystem.get_path_movement_cost(
        [(25, 25), (50, 25), (100, 25), (175, 25)], grid_size=50, diagonal_rule=rule, difficult_cells={(1, 0)})
    assert direct == split == 20
