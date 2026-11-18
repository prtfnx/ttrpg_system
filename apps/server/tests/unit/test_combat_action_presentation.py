import pytest
from core_table.combat import Combatant, CombatState
from service.combat_state_presenter import CombatStatePresenter


@pytest.mark.parametrize(('role', 'user_id', 'offered'), [
    ('owner', 9, ['pc', 'npc']), ('co_dm', 9, ['pc', 'npc']),
    ('player', 7, ['pc']), ('trusted_player', 7, ['pc']),
    ('player', 8, []), ('spectator', 7, []),
])
def test_executable_actions_follow_recipient_authority(role, user_id, offered):
    def action(name):
        return {'name': name, 'combat': {'kind': 'attack', 'effect': 'attack_roll',
                'damage_formula': '1d6', 'damage_type': 'piercing', 'range_ft': 5}}

    pc = Combatant(combatant_id='pc', entity_id='pc', name='Hero', controlled_by=['7'],
                   actor_actions=[action('Private sword')])
    npc = Combatant(combatant_id='npc', entity_id='npc', name='Goblin', is_npc=True,
                    actor_actions=[action('Private bite')])
    state = CombatState(combat_id='actions', session_id='test', table_id='table', combatants=[pc, npc])

    view = CombatStatePresenter.for_client(state, role, user_id)

    assert [item['combatant_id'] for item in view['combatants'] if 'available_actions' in item] == offered
    for item in view['combatants']:
        if item['combatant_id'] in offered:
            assert len(item['available_actions']) == 1
            assert item['available_actions'][0]['action_id'].startswith('action_')
        elif role not in {'owner', 'co_dm'}:
            assert 'actor_actions' not in item
    assert 'available_actions' not in pc.to_dict()
