"""Tests for opportunity attack trigger detection."""
import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '../..'))

import pytest
from unittest.mock import MagicMock
from core_table.session_rules import SessionRules
from core_table.combat import Combatant, CombatState, CombatPhase, CombatSettings
from service.movement_validator import MovementValidator


def make_rules(**kw):
    rules = SessionRules.defaults('test')
    rules.opportunity_attacks_enabled = True
    rules.walls_block_movement = False
    rules.obstacles_block_movement = False
    rules.enforce_movement_speed = False
    for k, v in kw.items():
        setattr(rules, k, v)
    return rules


def make_table(grid=50):
    table = MagicMock()
    table.grid_cell_px = grid
    table.width = 20
    table.height = 20
    table.walls = {}
    table.entities = {}
    table.sprite_to_entity = {}
    table.difficult_terrain_cells = set()
    return table


def make_combatant(cid, eid, x, y, has_reaction=True):
    c = Combatant(combatant_id=cid, entity_id=eid, name=eid, hp=10, max_hp=10,
                  armor_class=10, movement_speed=30, movement_remaining=30)
    c.has_reaction = has_reaction
    return c


def make_combat(*combatants):
    state = CombatState(combat_id='c', session_id='s', table_id='t',
                        phase=CombatPhase.ACTIVE, settings=CombatSettings())
    state.combatants = list(combatants)
    return state


def add_entity_to_table(table, eid, x, y):
    mock = MagicMock()
    mock.position = [x, y]
    table.entities[eid] = mock
    table.sprite_to_entity[eid] = eid


def test_oa_detected_when_leaving_reach():
    table = make_table(grid=50)
    add_entity_to_table(table, 'e_att', 0, 0)
    add_entity_to_table(table, 'e_hostile', 50, 0)  # adjacent

    moving = make_combatant('c1', 'e_att', 0, 0)
    hostile = make_combatant('c2', 'e_hostile', 50, 0)
    combat = make_combat(moving, hostile)

    validator = MovementValidator(make_rules())
    triggers = validator.check_opportunity_attacks('e_att', (0, 0), table, combat)
    assert len(triggers) == 1
    assert triggers[0]['combatant_id'] == 'c2'


def test_oa_not_triggered_without_reaction():
    table = make_table(grid=50)
    add_entity_to_table(table, 'e_att', 0, 0)
    add_entity_to_table(table, 'e_hostile', 50, 0)

    moving = make_combatant('c1', 'e_att', 0, 0)
    hostile = make_combatant('c2', 'e_hostile', 50, 0, has_reaction=False)
    combat = make_combat(moving, hostile)

    validator = MovementValidator(make_rules())
    triggers = validator.check_opportunity_attacks('e_att', (0, 0), table, combat)
    assert len(triggers) == 0


def test_oa_not_triggered_when_out_of_reach():
    table = make_table(grid=50)
    add_entity_to_table(table, 'e_att', 0, 0)
    add_entity_to_table(table, 'e_hostile', 200, 0)  # far away

    moving = make_combatant('c1', 'e_att', 0, 0)
    hostile = make_combatant('c2', 'e_hostile', 200, 0)
    combat = make_combat(moving, hostile)

    validator = MovementValidator(make_rules())
    triggers = validator.check_opportunity_attacks('e_att', (0, 0), table, combat)
    assert len(triggers) == 0


def test_oa_not_triggered_when_oa_disabled():
    table = make_table(grid=50)
    add_entity_to_table(table, 'e_att', 0, 0)
    add_entity_to_table(table, 'e_hostile', 50, 0)

    moving = make_combatant('c1', 'e_att', 0, 0)
    hostile = make_combatant('c2', 'e_hostile', 50, 0)
    combat = make_combat(moving, hostile)

    rules = make_rules(opportunity_attacks_enabled=False)
    validator = MovementValidator(rules)
    triggers = validator.check_opportunity_attacks('e_att', (0, 0), table, combat)
    assert len(triggers) == 0


def test_oa_no_combat_state_returns_empty():
    table = make_table(grid=50)
    validator = MovementValidator(make_rules())
    triggers = validator.check_opportunity_attacks('e_att', (0, 0), table, None)
    assert triggers == []


def test_oa_self_not_triggered():
    table = make_table(grid=50)
    add_entity_to_table(table, 'e_att', 0, 0)

    moving = make_combatant('c1', 'e_att', 0, 0)
    combat = make_combat(moving)

    validator = MovementValidator(make_rules())
    triggers = validator.check_opportunity_attacks('e_att', (0, 0), table, combat)
    assert len(triggers) == 0


def test_defeated_hostile_ignored():
    table = make_table(grid=50)
    add_entity_to_table(table, 'e_att', 0, 0)
    add_entity_to_table(table, 'e_hostile', 50, 0)

    moving = make_combatant('c1', 'e_att', 0, 0)
    hostile = make_combatant('c2', 'e_hostile', 50, 0)
    hostile.is_defeated = True
    combat = make_combat(moving, hostile)

    validator = MovementValidator(make_rules())
    triggers = validator.check_opportunity_attacks('e_att', (0, 0), table, combat)
    assert len(triggers) == 0
