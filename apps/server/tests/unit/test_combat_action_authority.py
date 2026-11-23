"""Exercise authority through the real command boundary, including rejected resources."""
from copy import deepcopy
from dataclasses import replace
from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest
from core_table.dice import DiceEngine, DiceRollResult
from core_table.table import VirtualTable
from service.combat_actions import available_combat_actions
from service.combat_command_service import CombatCommandContext, CombatCommandService
from service.combat_engine import CombatEngine


@pytest.fixture
def scenario(monkeypatch):
    table = VirtualTable('Authority', 1000, 1000)
    for sprite, position in [('hero', [100, 100]), ('enemy', [150, 100])]:
        table.add_entity({'sprite_id': sprite, 'position': position, 'layer': 'tokens'})
    state = CombatEngine.start_combat('authority', 'table', [], combatants=[
        {'entity_id': 'hero', 'hp': 20, 'max_hp': 20, 'controlled_by': ['1']},
        {'entity_id': 'enemy', 'hp': 20, 'max_hp': 20, 'armor_class': 10},
    ])
    hero = next(actor for actor in state.combatants if actor.entity_id == 'hero')
    enemy = next(actor for actor in state.combatants if actor.entity_id == 'enemy')
    state.current_turn_index = state.active_combatants().index(hero)
    hero.spell_slots = {1: 2}
    hero.actor_actions = [
        {'name': 'Sword', 'combat': {'kind': 'attack', 'effect': 'attack_roll',
            'damage_formula': '6', 'damage_type': 'slashing', 'range_ft': 5.0, 'attack_bonus': 5}},
        {'name': 'Bolt', 'combat': {'kind': 'spell', 'effect': 'automatic',
            'damage_formula': '6', 'damage_type': 'force', 'range_ft': 30.0, 'spell_level': 1}},
    ]
    definitions = available_combat_actions(hero)
    context = CombatCommandContext('authority', 'player', 'player', 1, table_lookup=lambda _: table)
    persistence = MagicMock()
    persistence.find_result.return_value = None
    service = CombatCommandService(persistence=persistence)
    monkeypatch.setattr(DiceEngine, 'roll', staticmethod(lambda formula: DiceRollResult(
        total=20 if 'd20' in formula else 6, rolls=[15] if 'd20' in formula else [],
        modifier=5 if 'd20' in formula else 6, formula=formula)))
    # Exercise application without coupling these tests to SQL serialization.
    monkeypatch.setattr(service, '_persist', lambda *args: args[2])
    commands = {
        'attack': {'type': 'attack', 'actor_id': hero.combatant_id,
                   'target_id': enemy.combatant_id, 'action_id': definitions[0].action_id},
        'cast_spell': {'type': 'cast_spell', 'actor_id': hero.combatant_id,
                       'target_ids': [enemy.combatant_id], 'action_id': definitions[1].action_id},
    }
    yield SimpleNamespace(table=table, state=state, hero=hero, enemy=enemy, context=context,
                          service=service, persistence=persistence, commands=commands)
    CombatEngine._active.pop('authority', None)


def execute(game, kind='attack', context=None, **overrides):
    command = {**game.commands[kind], **overrides}
    return game.service.apply(game.service.parse_envelope({'commands': [command]}), context or game.context)


@pytest.mark.parametrize('kind', ['attack', 'cast_spell'])
def test_server_uses_actor_mechanics_and_spends_resources_once(scenario, kind):
    result = execute(scenario, kind)
    assert result.accepted, result.reason
    assert scenario.enemy.hp == 14
    assert not scenario.hero.has_action
    assert scenario.hero.spell_slots[1] == (1 if kind == 'cast_spell' else 2)


@pytest.mark.parametrize('kind', ['attack', 'cast_spell'])
@pytest.mark.parametrize('attack_fields', [
    {'damage_formula': '100'}, {'attack_bonus': 100}, {'range_ft': 1000},
    {'manual': True}, {'action_id': 'foreign-action'}, {'action_id': None},
    {'table_id': 'other-table'},
])
def test_forged_or_unsupported_commands_preserve_state(scenario, kind, attack_fields):
    before = deepcopy(scenario.state.to_dict())
    result = execute(scenario, kind, **attack_fields)
    assert not result.accepted
    assert CombatEngine.get_state('authority').to_dict() == before
    scenario.persistence.persist_accepted.assert_not_called()


@pytest.mark.parametrize('fault', ['table', 'token', 'range', 'meters', 'wall', 'obstacle', 'hidden', 'duplicate'])
def test_geometry_and_targets_are_validated_before_spell_slots(scenario, fault):
    context = scenario.context
    extra = {}
    if fault == 'table':
        context = replace(context, table_lookup=lambda _: None)
    elif fault == 'token':
        scenario.hero.entity_id = 'missing'
    elif fault == 'range':
        scenario.table.find_entity_by_sprite_id('enemy').position = (500, 100)
    elif fault == 'meters':
        scenario.table.distance_unit = 'm'
        scenario.table.cell_distance = 10
    elif fault == 'wall':
        scenario.table.walls['wall'] = SimpleNamespace(blocks_sight=True, is_door=False,
                                                      x1=125, y1=0, x2=125, y2=200)
    elif fault == 'obstacle':
        scenario.table.add_entity({'sprite_id': 'private-boundary', 'position': [125, 0], 'layer': 'obstacles',
            'obstacle_type': 'line', 'obstacle_data': {'vertices': [[125, 0], [125, 200]]}})
    elif fault == 'hidden':
        scenario.enemy.is_hidden = True
    else:
        extra['target_ids'] = [scenario.enemy.combatant_id] * 2
    before = deepcopy(scenario.state.to_dict())
    result = execute(scenario, 'cast_spell', context=context, **extra)
    assert not result.accepted
    assert CombatEngine.get_state('authority').to_dict() == before


def test_action_reference_cannot_be_reused_after_source_mechanics_change(scenario):
    scenario.hero.actor_actions[0]['combat']['damage_formula'] = '100'
    assert not execute(scenario).accepted


def test_ranged_spell_uses_encounter_geometry_for_adjacent_attack_disadvantage(scenario, monkeypatch):
    source = scenario.hero.actor_actions[1]['combat']
    source.update(effect='attack_roll', attack_type='ranged')
    reference = available_combat_actions(scenario.hero)[1].action_id
    disadvantage = MagicMock(wraps=DiceEngine.roll)
    monkeypatch.setattr(DiceEngine, 'roll_with_disadvantage', disadvantage)
    result = execute(scenario, 'cast_spell', action_id=reference)
    assert result.accepted, result.reason
    disadvantage.assert_called_once()


def test_explicit_manual_damage_requires_a_dm(scenario):
    manual = {'action_id': None, 'manual': True, 'effect': 'automatic', 'spell_name': 'Manual damage',
              'damage_formula': '4', 'damage_type': 'force', 'range_ft': 30.0, 'spell_level': 1}
    assert not execute(scenario, 'cast_spell', **manual).accepted
    result = execute(scenario, 'cast_spell', context=replace(scenario.context, role='owner'), **manual)
    assert result.accepted, result.reason


def test_effectless_manual_spell_does_not_consume_a_slot(scenario):
    result = execute(scenario, 'cast_spell', context=replace(scenario.context, role='owner'),
                     action_id=None, manual=True)
    assert not result.accepted
    assert CombatEngine.get_state('authority').combatants[0].spell_slots.get(1, 2) == 2


def test_player_cannot_invent_an_opportunity_trigger(scenario):
    before = deepcopy(scenario.state.to_dict())
    result = execute(scenario, type='resolve_opportunity_attack')
    assert not result.accepted and 'DM manual resolution' in result.reason
    assert CombatEngine.get_state('authority').to_dict() == before
