"""Benchmarks for server movement validation (pytest-benchmark)."""
from types import SimpleNamespace

import pytest
from core_table.session_rules import SessionRules
from service.movement_validator import MovementValidator


def _make_walls(n):
    return {
        f"w{i}": SimpleNamespace(
            x1=i * 64, y1=0, x2=i * 64, y2=640,
            is_door=False, door_open=False, door_state='closed',
            blocks_movement=True,
        )
        for i in range(n)
    }

def _make_obstacles(n):
    return {
        f"o{i}": SimpleNamespace(
            entity_id=f"o{i}", obstacle_type="circle",
            position=(i * 80 + 40, 320),
            width=40, height=40, radius=20, vertices=[],
            layer="obstacles",
        )
        for i in range(n)
    }

def _make_table(n_walls, n_obstacles, grid=64):
    return SimpleNamespace(
        grid_cell_px=grid,
        grid_size=grid,
        width=20,
        height=15,
        walls=_make_walls(n_walls),
        entities=_make_obstacles(n_obstacles),
    )


SIZES = [10, 50, 200]


@pytest.fixture(params=SIZES, ids=[f"n={s}" for s in SIZES])
def env(request):
    n = request.param
    table = _make_table(n, n // 2)
    rules = SessionRules(
        session_id="bench",
        movement_mode="cell",
        server_validation_tier="full",
    )
    validator = MovementValidator(rules)
    return validator, table


def test_bench_validate_full(benchmark, env):
    validator, table = env
    benchmark(validator.validate, "e1", (0, 0), (256, 256), table)


def test_bench_validate_lightweight(benchmark, env):
    validator, table = env
    benchmark(validator.validate_lightweight, "e1", (0, 0), (256, 256), table)
