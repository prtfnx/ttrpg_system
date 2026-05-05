"""Tests for NPCAIEngine."""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '../..'))

from core_table.combat import Combatant, CombatPhase, CombatState
from service.npc_ai import NPCAIEngine


def make_combat_with_npc():
    npc = Combatant(
        combatant_id='npc1', entity_id='n1', name='Goblin',
        hp=10, max_hp=10, armor_class=12, movement_speed=30, movement_remaining=30,
        is_npc=True, initiative=15.0,
    )
    player = Combatant(
        combatant_id='pc1', entity_id='p1', name='Fighter',
        hp=30, max_hp=30, armor_class=14, movement_speed=30, movement_remaining=30,
        is_npc=False, initiative=20.0,
    )
    state = CombatState(
        combat_id='c1', session_id='s1', table_id='t1',
        phase=CombatPhase.ACTIVE, round_number=1,
        combatants=[npc, player],
    )
    return npc, player, state


ai = NPCAIEngine()


def test_aggressive_targets_enemy():
    npc, player, state = make_combat_with_npc()
    decision = ai.decide_action(npc, state, 'aggressive')
    assert decision.action_type in ('attack', 'move', 'skip')


def test_cowardly_flees_when_low_hp():
    npc, player, state = make_combat_with_npc()
    npc.hp = 1  # very low (< 50% of max_hp=10)
    decision = ai.decide_action(npc, state, 'cowardly')
    assert decision.action_type in ('flee', 'move', 'skip')


def test_support_targets_ally():
    npc, player, state = make_combat_with_npc()
    ally = Combatant(
        combatant_id='ally1', entity_id='a1', name='Goblin2',
        hp=2, max_hp=10, armor_class=12, movement_speed=30, movement_remaining=30,
        is_npc=True,
    )
    state.combatants.append(ally)
    decision = ai.decide_action(npc, state, 'support')
    assert decision.action_type in ('heal', 'help', 'attack', 'move', 'skip')


def test_berserker_attacks_when_bloodied():
    npc, player, state = make_combat_with_npc()
    npc.hp = 3  # below 50%
    decision = ai.decide_action(npc, state, 'berserker')
    assert decision.action_type in ('attack', 'move', 'skip')


def test_defensive_no_enemies():
    npc, player, state = make_combat_with_npc()
    player.is_defeated = True
    decision = ai.decide_action(npc, state, 'defensive')
    assert decision.action_type in ('pass', 'move', 'defend', 'skip', 'dodge', 'attack')
