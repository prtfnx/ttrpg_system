"""Benchmarks for pathfinding hot paths (pytest-benchmark)."""
from types import SimpleNamespace

import pytest
from core_table.pathfinding import PathfindingSystem, SpatialHashGrid

# --- fixtures ---

def _make_walls(n):
    return [
        SimpleNamespace(x1=i * 64, y1=0, x2=i * 64, y2=640,
                        is_door=False, door_open=False, door_state='closed',
                        blocks_movement=True)
        for i in range(n)
    ]

def _make_obstacles(n):
    return [
        SimpleNamespace(entity_id=f"o{i}", obstacle_type="circle",
                        position=(i * 80 + 40, 320),
                        width=40, height=40, radius=20, vertices=[])
        for i in range(n)
    ]


SIZES = [10, 50, 200]


@pytest.fixture(params=SIZES, ids=[f"n={s}" for s in SIZES])
def scene(request):
    n = request.param
    walls = _make_walls(n)
    obstacles = _make_obstacles(n // 2)
    sh = SpatialHashGrid.build(walls, obstacles, 64.0)
    return walls, obstacles, sh


# --- benchmarks ---

def test_bench_spatial_hash_build(benchmark, scene):
    walls, obstacles, _ = scene
    benchmark(SpatialHashGrid.build, walls, obstacles, 64.0)


def test_bench_line_blocked_walls(benchmark, scene):
    walls, _, sh = scene
    benchmark(PathfindingSystem.is_path_blocked_by_walls, (0, 0), (800, 600), walls, sh)


def test_bench_line_blocked_obstacles(benchmark, scene):
    _, obstacles, sh = scene
    benchmark(PathfindingSystem.is_path_blocked_by_obstacles, (0, 0), (800, 600), obstacles, spatial_hash=sh)


def test_bench_find_path_astar(benchmark, scene):
    walls, obstacles, sh = scene
    benchmark(
        PathfindingSystem.find_path_astar,
        (0, 0), (512, 512), walls, obstacles, 64.0,
        spatial_hash=sh,
    )


def test_bench_reachable_cells(benchmark, scene):
    walls, obstacles, sh = scene
    benchmark(
        PathfindingSystem.get_reachable_cells,
        (256, 256), 30.0, walls, obstacles, 64.0,
        spatial_hash=sh,
    )
