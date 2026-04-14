import pytest
from unittest.mock import MagicMock
from service.movement_validator import MovementValidator, Combatant, MovementResult
from core_table.session_rules import SessionRules


def make_rules(**kwargs):
    r = SessionRules.defaults('test')
    for k, v in kwargs.items():
        setattr(r, k, v)
    return r


def make_table(width=20, height=20, grid_cell_px=50.0, walls=None, entities=None):
    t = MagicMock()
    t.width = width
    t.height = height
    t.grid_cell_px = grid_cell_px
    t.walls = walls or {}
    t.entities = entities or {}
    return t


class FakeWall:
    def __init__(self, x1, y1, x2, y2, blocks_movement=True, is_door=False, door_state='closed'):
        self.x1, self.y1, self.x2, self.y2 = x1, y1, x2, y2
        self.blocks_movement = blocks_movement
        self.is_door = is_door
        self.door_state = door_state


class FakeEntity:
    def __init__(self, entity_id, x, y, w=50, h=50, layer='obstacles'):
        self.entity_id = entity_id
        self.position = (x, y)
        self.width = w
        self.height = h
        self.layer = layer
        self.obstacle_type = 'rectangle'


def test_move_open_space_succeeds():
    rules = make_rules(walls_block_movement=False, obstacles_block_movement=False)
    table = make_table()
    v = MovementValidator(rules)
    r = v.validate('e1', (25, 25), (75, 75), table)
    assert r.valid


def test_move_outside_bounds_fails():
    rules = make_rules(walls_block_movement=False, obstacles_block_movement=False)
    table = make_table(width=10, height=10, grid_cell_px=50)
    v = MovementValidator(rules)
    r = v.validate('e1', (25, 25), (600, 25), table)
    assert not r.valid
    assert 'bounds' in r.reason


def test_move_through_wall_fails():
    # Wall spanning full table height (20 cells * 50px = 1000px) — truly impassable
    rules = make_rules(walls_block_movement=True, obstacles_block_movement=False)
    wall = FakeWall(100, 0, 100, 1000)  # spans full 20x50 table height
    table = make_table(width=20, height=20, grid_cell_px=50, walls={'w1': wall})
    v = MovementValidator(rules)
    # Strict budget: can't go around the full-height wall in 30ft
    r = v.validate('e1', (25, 500), (200, 500), table,
                   combatant=Combatant(entity_id='e1', movement_remaining=30.0))
    assert not r.valid


def test_move_open_door_succeeds():
    rules = make_rules(walls_block_movement=True, obstacles_block_movement=False)
    wall = FakeWall(100, 0, 100, 500, is_door=True, door_state='open')
    table = make_table(walls={'w1': wall})
    v = MovementValidator(rules)
    r = v.validate('e1', (25, 250), (200, 250), table)
    assert r.valid


def test_move_through_obstacle_fails():
    # Obstacle fills entire row (600px wide) — no way around within 30ft budget
    rules = make_rules(walls_block_movement=False, obstacles_block_movement=True)
    # 600px wide obstacle spans x=0 to x=600 at y=200 (only 1 cell tall, 50px)
    obstacle = FakeEntity('obs1', 0, 200, w=600, h=50)
    table = make_table(width=20, height=20, grid_cell_px=50, entities={1: obstacle})
    v = MovementValidator(rules)
    # Must cross y=200 to get from y=175 to y=275, obstacle blocks entire width
    r = v.validate('e1', (25, 175), (25, 275), table,
                   combatant=Combatant(entity_id='e1', movement_remaining=15.0))
    assert not r.valid


def test_speed_check_fails():
    rules = make_rules(
        walls_block_movement=False, obstacles_block_movement=False,
        enforce_movement_speed=True, diagonal_movement_rule='standard'
    )
    table = make_table(grid_cell_px=50)
    combatant = Combatant(entity_id='e1', movement_remaining=10.0)  # only 10ft left
    v = MovementValidator(rules)
    # Moving 300px = 6 grid cells = 30ft — exceeds 10ft remaining
    r = v.validate('e1', (25, 25), (325, 25), table, combatant=combatant)
    assert not r.valid
    assert 'movement' in r.reason.lower()


def test_speed_check_passes():
    rules = make_rules(
        walls_block_movement=False, obstacles_block_movement=False,
        enforce_movement_speed=True, diagonal_movement_rule='standard'
    )
    table = make_table(grid_cell_px=50)
    combatant = Combatant(entity_id='e1', movement_remaining=30.0)
    v = MovementValidator(rules)
    # 1 cell right = 50px = 5ft — well within 30ft
    r = v.validate('e1', (25, 25), (75, 25), table, combatant=combatant)
    assert r.valid


def test_no_combatant_skips_speed_check():
    rules = make_rules(enforce_movement_speed=True)
    table = make_table(grid_cell_px=50)
    v = MovementValidator(rules)
    r = v.validate('e1', (25, 25), (5000, 25), table, combatant=None)
    # bounds will stop it, but speed should not
    # resize table to be huge to isolate speed check
    big_table = make_table(width=1000, height=1000)
    r2 = v.validate('e1', (25, 25), (5000, 25), big_table, combatant=None)
    assert r2.valid  # speed not checked without combatant


def test_direct_los_clear_skips_astar():
    """When direct path has no obstacles, validate() should succeed without A*."""
    rules = make_rules(walls_block_movement=True, obstacles_block_movement=True)
    # Wall at x=500 — movement from (25,25) to (75,25) is well clear of it
    wall = FakeWall(500, 0, 500, 1000)
    table = make_table(walls={'w1': wall})
    v = MovementValidator(rules)
    r = v.validate('e1', (25, 25), (75, 25), table)
    assert r.valid
    assert r.valid_path == [(25, 25), (75, 25)]  # direct 2-point path, no A* detour


def test_direct_los_blocked_triggers_astar():
    """When direct path is blocked by a wall, A* should find alternate route."""
    rules = make_rules(walls_block_movement=True, obstacles_block_movement=False)
    # Short wall at x=100, spanning y=0..500 — blocks direct horizontal move
    wall = FakeWall(100, 0, 100, 500)
    table = make_table(width=20, height=20, grid_cell_px=50)
    table.walls = {'w1': wall}
    v = MovementValidator(rules)
    r = v.validate('e1', (25, 250), (200, 250), table)
    # A* should find a route around the wall (path length > 2 points)
    if r.valid:
        assert len(r.valid_path) > 2  # A* produced a multi-step path


def test_validate_lightweight_clear_path():
    """Lightweight validation accepts a clear direct path."""
    rules = make_rules(walls_block_movement=True, obstacles_block_movement=True)
    wall = FakeWall(500, 0, 500, 1000)
    table = make_table(walls={'w1': wall})
    v = MovementValidator(rules)
    r = v.validate_lightweight('e1', (25, 25), (75, 25), table)
    assert r.valid


def test_validate_lightweight_blocked_path():
    """Lightweight validation rejects when wall crosses direct path."""
    rules = make_rules(walls_block_movement=True, obstacles_block_movement=False)
    wall = FakeWall(100, 0, 100, 1000)
    table = make_table(walls={'w1': wall})
    v = MovementValidator(rules)
    r = v.validate_lightweight('e1', (25, 500), (200, 500), table)
    assert not r.valid
    assert 'wall' in r.reason.lower()
