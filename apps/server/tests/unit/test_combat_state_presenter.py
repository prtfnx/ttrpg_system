from core_table.combat import Combatant, CombatPhase, CombatSettings, CombatState
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
    assert pc['hp'] == 20
    assert pc['controlled_by'] == ['7']


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
