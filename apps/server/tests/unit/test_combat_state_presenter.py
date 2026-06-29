from core_table.combat import (
    ActionCost,
    CombatAction,
    Combatant,
    CombatPhase,
    CombatSettings,
    CombatState,
)
from service.combat_state_presenter import CombatStatePresenter


def _state() -> CombatState:
    return CombatState(
        combat_id='combat-1',
        session_id='session-1',
        table_id='table-1',
        phase=CombatPhase.ACTIVE,
        settings=CombatSettings(show_npc_hp_to_players='descriptor'),
        combatants=[
            Combatant(
                combatant_id='pc-1',
                entity_id='sprite-pc',
                name='Ada',
                hp=20,
                max_hp=20,
                armor_class=16,
                controlled_by=['7'],
            ),
            Combatant(
                combatant_id='npc-1',
                entity_id='sprite-npc',
                name='Goblin',
                hp=3,
                max_hp=12,
                armor_class=13,
                is_npc=True,
                ai_enabled=True,
                constitution_modifier=2,
                damage_resistances=['fire'],
                spell_slots={'1': 2},
            ),
            Combatant(
                combatant_id='npc-hidden',
                entity_id='sprite-hidden',
                name='Hidden Stalker',
                hp=30,
                max_hp=30,
                armor_class=15,
                is_npc=True,
                is_hidden=True,
                ai_enabled=True,
            ),
        ],
        action_log=[
            CombatAction(
                action_id='action-visible',
                combat_id='combat-1',
                round_number=1,
                turn_index=0,
                actor_id='pc-1',
                action_type='attack',
                action_cost=ActionCost.ACTION.value,
                target_ids=['npc-1', 'npc-hidden'],
                state_before={'combatants': [{'combatant_id': 'npc-1', 'hp': 12}]},
                is_dm_override=True,
            ),
            CombatAction(
                action_id='action-hidden',
                combat_id='combat-1',
                round_number=1,
                turn_index=0,
                actor_id='npc-hidden',
                action_type='attack',
                action_cost=ActionCost.ACTION.value,
                target_ids=['pc-1'],
                state_before={'combatants': []},
            ),
        ],
    )


def test_dm_receives_full_combat_state():
    view = CombatStatePresenter.for_client(_state(), 'owner', user_id=1)

    npc = next(c for c in view['combatants'] if c['combatant_id'] == 'npc-1')
    hidden = next(c for c in view['combatants'] if c['combatant_id'] == 'npc-hidden')
    assert npc['hp'] == 3
    assert npc['ai_enabled'] is True
    assert hidden['name'] == 'Hidden Stalker'


def test_player_receives_filtered_npc_state_and_no_hidden_npcs():
    view = CombatStatePresenter.for_client(_state(), 'player', user_id=7)

    ids = {c['combatant_id'] for c in view['combatants']}
    npc = next(c for c in view['combatants'] if c['combatant_id'] == 'npc-1')
    pc = next(c for c in view['combatants'] if c['combatant_id'] == 'pc-1')
    assert 'npc-hidden' not in ids
    assert 'hp' not in npc
    assert npc['hp_descriptor'] == 'bloodied'
    assert 'ai_enabled' not in npc
    assert 'armor_class' not in npc
    assert 'constitution_modifier' not in npc
    assert 'damage_resistances' not in npc
    assert 'spell_slots' not in npc
    assert pc['hp'] == 20
    assert pc['controlled_by'] == ['7']
    assert [action['action_id'] for action in view['action_log']] == ['action-visible']
    assert view['action_log'][0]['target_ids'] == ['npc-1']
    assert 'state_before' not in view['action_log'][0]
    assert 'is_dm_override' not in view['action_log'][0]


def test_spectator_does_not_receive_control_ownership():
    view = CombatStatePresenter.for_client(_state(), 'spectator', user_id=None)

    pc = next(c for c in view['combatants'] if c['combatant_id'] == 'pc-1')
    assert 'controlled_by' not in pc


def test_boolean_hp_visibility_is_normalized():
    state = _state()
    state.settings.show_npc_hp_to_players = False

    view = CombatStatePresenter.for_client(state, 'player', user_id=7)

    npc = next(c for c in view['combatants'] if c['combatant_id'] == 'npc-1')
    assert 'hp' not in npc
    assert 'hp_descriptor' not in npc


def test_player_receives_npc_ac_when_session_setting_allows_it():
    state = _state()
    state.settings.show_npc_ac_to_players = True

    view = CombatStatePresenter.for_client(state, 'player', user_id=7)

    npc = next(c for c in view['combatants'] if c['combatant_id'] == 'npc-1')
    assert npc['armor_class'] == 13


def test_player_event_context_uses_only_visible_combatants():
    data = CombatStatePresenter.message_for_client(
        _state(),
        'player',
        user_id=7,
        context={
            'combatant_id': 'npc-hidden',
            'name': 'Hidden Stalker',
            'value': 18,
            'order': [
                {'combatant_id': 'npc-hidden', 'name': 'Hidden Stalker', 'initiative': 18},
                {'combatant_id': 'pc-1', 'name': 'Spoofed Name', 'initiative': 12},
            ],
            'current_combatant': {
                'combatant_id': 'npc-hidden',
                'name': 'Hidden Stalker',
                'hp': 30,
            },
            'result': {'new_hp': 4, 'temp_hp': 2, 'damage': 6},
        },
    )

    assert 'combatant_id' not in data
    assert 'name' not in data
    assert 'value' not in data
    assert [entry['combatant_id'] for entry in data['order']] == ['pc-1', 'npc-1']
    assert data['order'][0]['name'] == 'Ada'
    assert data['current_combatant'] is None
    assert data['result'] == {'damage': 6}


def test_dm_event_context_remains_complete():
    context = {
        'combatant_id': 'npc-hidden',
        'result': {'new_hp': 24},
    }

    data = CombatStatePresenter.message_for_client(
        _state(),
        'owner',
        user_id=1,
        context=context,
    )

    assert data['combatant_id'] == 'npc-hidden'
    assert data['result']['new_hp'] == 24
