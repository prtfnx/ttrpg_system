import pytest
from core_table.combat import Combatant
from service.combat_actions import available_combat_actions, find_combat_action


def definition(**changes):
    return {'kind': 'attack', 'effect': 'attack_roll', 'damage_formula': '1d8+3',
            'damage_type': 'slashing', 'range_ft': 5, 'attack_bonus': 5, **changes}


def actor(*actions):
    return Combatant(combatant_id='actor', entity_id='token', name='Hero',
                     actor_actions=list(actions), spell_attack_bonus=7, spell_save_dc=15)


def test_only_explicit_supported_metadata_becomes_executable():
    source = actor(
        {'name': 'Descriptive', 'description': 'Deal 100d100 force damage'},
        {'name': 'Sword', 'combat': definition()},
        {'name': 'Bonus action', 'action_cost': 'bonus_action', 'combat': definition()},
        {'name': 'Malformed', 'combat': definition(damage_formula='1000000000d8')},
    )
    actions = available_combat_actions(source)
    assert [action.name for action in actions] == ['Sword']
    assert actions[0].damage_formula == '1d8+3'
    assert find_combat_action(source, actions[0].action_id) == actions[0]
    assert find_combat_action(source, 'action_unknown') is None


def test_ids_follow_complete_resolved_mechanics():
    source = actor({'name': 'Sword', 'combat': definition()})
    original = available_combat_actions(source)[0].action_id
    assert available_combat_actions(source)[0].action_id == original
    source.actor_actions[0]['combat']['range_ft'] = 10
    assert available_combat_actions(source)[0].action_id != original
    assert find_combat_action(source, original) is None


@pytest.mark.parametrize('effect', ['attack_roll', 'saving_throw', 'automatic'])
def test_spell_bonus_and_save_dc_come_from_the_encounter_actor(effect):
    source = actor({'name': 'Spell', 'combat': definition(
        kind='spell', effect=effect, attack_bonus=99, save_dc=99,
        save_ability='dexterity' if effect == 'saving_throw' else None,
    )})
    action = available_combat_actions(source)[0]
    assert action.attack_bonus == 7
    assert action.save_dc == (15 if effect == 'saving_throw' else 0)
    assert action.to_public()['action_id'] == action.action_id


@pytest.mark.parametrize('changes', [
    {'range_ft': float('nan')}, {'range_ft': 0}, {'effect': 'heal'},
    {'damage_formula': '1d0'}, {'damage_type': 'untyped'}, {'max_targets': 2},
    {'kind': 'spell', 'effect': 'saving_throw'}, {'effect': 'automatic'},
])
def test_incomplete_or_unsupported_actions_are_not_offered(changes):
    assert available_combat_actions(actor({'name': 'Bad', 'combat': definition(**changes)})) == []
