"""Tests for difficult terrain movement cost and table terrain model."""
import pytest
from unittest.mock import MagicMock
from core_table.session_rules import SessionRules
from core_table.table import CoverZone


# ── CoverZone model tests ─────────────────────────────────────────────────────

def test_cover_zone_to_dict():
    z = CoverZone(zone_id='z1', shape_type='rect', coords=[0, 0, 50, 50], cover_tier='half', label='Wall')
    d = z.to_dict()
    assert d['zone_id'] == 'z1'
    assert d['cover_tier'] == 'half'
    assert d['coords'] == [0, 0, 50, 50]


def test_cover_zone_from_dict():
    d = {'zone_id': 'z2', 'shape_type': 'circle', 'coords': [100, 100, 25], 'cover_tier': 'three_quarters', 'label': ''}
    z = CoverZone.from_dict(d)
    assert z.zone_id == 'z2'
    assert z.shape_type == 'circle'
    assert z.cover_tier == 'three_quarters'


def test_cover_zone_roundtrip():
    z = CoverZone(zone_id='z3', shape_type='polygon', coords=[[0, 0], [50, 0], [50, 50]], cover_tier='full')
    z2 = CoverZone.from_dict(z.to_dict())
    assert z2.zone_id == z.zone_id
    assert z2.cover_tier == z.cover_tier


# ── Difficult terrain movement cost tests ────────────────────────────────────

class _MockTable:
    """Minimal table mock for movement validator tests."""
    def __init__(self, grid=50, difficult_cells=None):
        self.grid_cell_px = grid
        self.width = 20
        self.height = 20
        self.walls = {}
        self.entities = {}
        self.sprite_to_entity = {}
        self.difficult_terrain_cells = difficult_cells or set()


def test_normal_terrain_movement_cost():
    from service.movement_validator import MovementValidator, Combatant as MvCombatant
    rules = SessionRules.defaults('test')
    rules.walls_block_movement = False
    rules.obstacles_block_movement = False
    rules.enforce_movement_speed = True
    rules.movement_mode = 'free'

    table = _MockTable(grid=50)
    combatant = MvCombatant(entity_id='e', movement_remaining=30)

    validator = MovementValidator(rules)
    result = validator.validate('e', (0, 0), (50, 0), table, combatant=combatant)
    assert result.valid
    assert result.movement_cost < 40  # ~10ft


def test_difficult_terrain_doubles_cost():
    from service.movement_validator import MovementValidator, Combatant as MvCombatant
    rules = SessionRules.defaults('test')
    rules.walls_block_movement = False
    rules.obstacles_block_movement = False
    rules.enforce_movement_speed = True
    rules.enforce_difficult_terrain = True
    rules.movement_mode = 'free'

    table = _MockTable(grid=50, difficult_cells={(0, 0), (1, 0)})
    combatant_ok = MvCombatant(entity_id='e', movement_remaining=60)

    validator = MovementValidator(rules)
    result = validator.validate('e', (0, 0), (50, 0), table, combatant=combatant_ok)
    assert result.valid
    # cost should be higher than without difficult terrain (normal=5, difficult=10)
    assert result.movement_cost >= 10


def test_session_rules_has_enforce_difficult_terrain():
    rules = SessionRules.defaults('test')
    assert hasattr(rules, 'enforce_difficult_terrain')
    assert rules.enforce_difficult_terrain is True


def test_session_rules_enforce_cover():
    rules = SessionRules.defaults('test')
    assert rules.enforce_cover is True


def test_session_rules_oa_fields():
    rules = SessionRules.defaults('test')
    assert rules.opportunity_attacks_enabled is True
    assert rules.opportunity_attack_timeout_sec == 30
