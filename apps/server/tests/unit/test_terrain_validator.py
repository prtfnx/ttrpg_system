"""Tests for server-side movement validator terrain logic."""
from core_table.session_rules import SessionRules
from service.movement_validator import Combatant as MvCombatant
from service.movement_validator import MovementValidator


class _MockTable:
    def __init__(self, grid=50, difficult_cells=None):
        self.grid_cell_px = grid
        self.width = 20
        self.height = 20
        self.walls = {}
        self.entities = {}
        self.sprite_to_entity = {}
        self.difficult_terrain_cells = difficult_cells or set()


def test_normal_terrain_movement_cost():
    rules = SessionRules.defaults('test')
    rules.walls_block_movement = False
    rules.obstacles_block_movement = False
    rules.enforce_movement_speed = True
    rules.movement_mode = 'free'

    table = _MockTable(grid=50)
    combatant = MvCombatant(entity_id='e', movement_remaining=30)

    result = MovementValidator(rules).validate('e', (0, 0), (50, 0), table, combatant=combatant)
    assert result.valid
    assert result.movement_cost < 40  # ~10ft


def test_difficult_terrain_doubles_cost():
    rules = SessionRules.defaults('test')
    rules.walls_block_movement = False
    rules.obstacles_block_movement = False
    rules.enforce_movement_speed = True
    rules.enforce_difficult_terrain = True
    rules.movement_mode = 'free'

    table = _MockTable(grid=50, difficult_cells={(0, 0), (1, 0)})
    combatant = MvCombatant(entity_id='e', movement_remaining=60)

    result = MovementValidator(rules).validate('e', (0, 0), (50, 0), table, combatant=combatant)
    assert result.valid
    assert result.movement_cost >= 10  # doubled cost


def test_oa_no_trigger_when_stay_in_reach():
    """OA should NOT fire if mover stays within reach."""
    from unittest.mock import MagicMock

    from service.movement_validator import MovementValidator

    rules = SessionRules.defaults('test')
    rules.opportunity_attacks_enabled = True
    validator = MovementValidator(rules)

    # Hostile at (0,0), mover goes from (50,0) to (50,50) — both within ~70px reach
    combat_state = MagicMock()
    hostile = MagicMock()
    hostile.entity_id = 'h1'
    hostile.combatant_id = 'c1'
    hostile.name = 'Goblin'
    hostile.is_defeated = False
    hostile.has_reaction = True
    hostile.controlled_by = []
    combat_state.combatants = [hostile]

    table = MagicMock()
    table.grid_cell_px = 50
    table.sprite_to_entity = {'h1': 'ent_h1'}
    ent = MagicMock()
    ent.position = [0, 0]
    table.entities = {'ent_h1': ent}

    # Both from_pos and to_pos are within 75px reach → no OA
    triggers = validator.check_opportunity_attacks('mover', (50, 0), table, combat_state, to_pos=(50, 50))
    assert triggers == []


def test_oa_triggers_when_leaving_reach():
    """OA SHOULD fire when mover leaves reach."""
    from unittest.mock import MagicMock

    from service.movement_validator import MovementValidator

    rules = SessionRules.defaults('test')
    rules.opportunity_attacks_enabled = True
    validator = MovementValidator(rules)

    # Hostile at (0,0), mover goes from (50,0) to (200,0) — leaves reach
    combat_state = MagicMock()
    hostile = MagicMock()
    hostile.entity_id = 'h1'
    hostile.combatant_id = 'c1'
    hostile.name = 'Goblin'
    hostile.is_defeated = False
    hostile.has_reaction = True
    hostile.controlled_by = []
    combat_state.combatants = [hostile]

    table = MagicMock()
    table.grid_cell_px = 50
    table.sprite_to_entity = {'h1': 'ent_h1'}
    ent = MagicMock()
    ent.position = [0, 0]
    table.entities = {'ent_h1': ent}

    triggers = validator.check_opportunity_attacks('mover', (50, 0), table, combat_state, to_pos=(200, 0))
    assert len(triggers) == 1
    assert triggers[0]['combatant_id'] == 'c1'
