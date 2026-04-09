import pytest
from core_table.pathfinding import PathfindingSystem


def test_segments_cross():
    assert PathfindingSystem.line_segments_intersect(0, 0, 10, 10, 0, 10, 10, 0)


def test_segments_parallel_no_cross():
    assert not PathfindingSystem.line_segments_intersect(0, 0, 10, 0, 0, 5, 10, 5)


def test_segments_touching_endpoint():
    assert PathfindingSystem.line_segments_intersect(0, 0, 5, 5, 5, 5, 10, 0)


def test_segments_no_cross():
    assert not PathfindingSystem.line_segments_intersect(0, 0, 2, 2, 5, 0, 10, 5)


def test_aabb_intersects():
    assert PathfindingSystem.line_intersects_aabb(0, 5, 20, 5, 5, 0, 10, 10)


def test_aabb_no_intersect():
    assert not PathfindingSystem.line_intersects_aabb(0, 0, 0, 20, 5, 5, 10, 10)


def test_circle_intersects():
    assert PathfindingSystem.line_intersects_circle(0, 5, 20, 5, 10, 5, 3)


def test_circle_no_intersect():
    assert not PathfindingSystem.line_intersects_circle(0, 0, 20, 0, 10, 20, 3)


class FakeWall:
    def __init__(self, x1, y1, x2, y2, blocks_movement=True, is_door=False, door_state='closed'):
        self.x1, self.y1, self.x2, self.y2 = x1, y1, x2, y2
        self.blocks_movement = blocks_movement
        self.is_door = is_door
        self.door_state = door_state


def test_wall_blocks_path():
    wall = FakeWall(50, 0, 50, 100)
    assert PathfindingSystem.is_path_blocked_by_walls((0, 50), (100, 50), [wall])


def test_open_door_does_not_block():
    wall = FakeWall(50, 0, 50, 100, is_door=True, door_state='open')
    assert not PathfindingSystem.is_path_blocked_by_walls((0, 50), (100, 50), [wall])


def test_ethereal_wall_does_not_block():
    wall = FakeWall(50, 0, 50, 100, blocks_movement=False)
    assert not PathfindingSystem.is_path_blocked_by_walls((0, 50), (100, 50), [wall])


def test_movement_cost_standard():
    # 3 cells right, 4 cells down at grid_size=50 -> 7 cells = 35ft in standard mode
    cost = PathfindingSystem.get_movement_cost((0, 0), (150, 200), grid_size=50, diagonal_rule='standard')
    # standard: max(3,4)*5 = 20... wait. Chebyshev diagonal = min, straight = abs(dx-dy)
    # dx=3, dy=4: diag=3, straight=1, cost=(3+1)*5=20... no:
    # cost = (straight + diag)*5 actually just max(dx,dy)*5 = 4*5 = 20
    assert cost == pytest.approx(20.0)


def test_astar_finds_path_around_wall():
    # Wall at x=100 from y=0 to y=80 (gap at bottom)
    wall = FakeWall(100, 0, 100, 80)
    path = PathfindingSystem.find_path_astar(
        (25, 25), (175, 25), [wall], [], grid_size=50
    )
    assert path is not None
    # Path should navigate around the wall gap
    assert path[-1][0] == pytest.approx(175, abs=30)


def test_astar_returns_none_unreachable():
    # Horizontal wall spanning full width with strict max_distance — no way around in budget
    wall = FakeWall(0, 100, 300, 100)
    # Start below the wall (y=25), target above (y=175) with only 5ft budget -> impossible
    path = PathfindingSystem.find_path_astar(
        (150, 25), (150, 175), [wall], [], grid_size=50, max_distance=5
    )
    assert path is None


def test_reachable_cells_returns_cells():
    cells = PathfindingSystem.get_reachable_cells(
        start=(100, 100), speed=30, walls=[], obstacles=[], grid_size=50
    )
    assert len(cells) > 0
    assert all(c['cost'] <= 30 for c in cells)
