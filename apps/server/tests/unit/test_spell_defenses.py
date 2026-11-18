import pytest
from core_table.combat import Combatant, CombatPhase, CombatState
from core_table.session_rules import SessionRules
from service.attack_resolver import AttackResolver
from service.combat_engine import CombatEngine


@pytest.mark.parametrize(('stored', 'requested'), [
    ('dexterity', 'DEX'), ('dex', 'dexterity'),
    ('strength', 'str'), ('constitution', 'con'),
    ('intelligence', 'int'), ('wisdom', 'wis'), ('charisma', 'cha'),
])
def test_saving_throw_uses_canonical_ability_modifier(monkeypatch, stored, requested):
    monkeypatch.setattr('core_table.dice.random.randint', lambda _low, _high: 10)
    target = Combatant(combatant_id='target', entity_id='target', name='Target',
                       save_modifiers={stored: 5})
    result = AttackResolver(SessionRules.defaults('test')).resolve_saving_throw(target, requested, 15)
    assert result.success
    assert result.roll.total == 15


@pytest.mark.parametrize('bonus', [0, -3])
def test_explicit_save_bonus_overrides_canonical_modifier(monkeypatch, bonus):
    monkeypatch.setattr('core_table.dice.random.randint', lambda _low, _high: 10)
    target = Combatant(combatant_id='target', entity_id='target', name='Target',
                       save_modifiers={'dexterity': 20})
    result = AttackResolver(SessionRules.defaults('test')).resolve_saving_throw(target, 'dex', 15, bonus)
    assert not result.success
    assert result.roll.total == 10 + bonus


@pytest.mark.parametrize('attack_roll', [False, True], ids=['saving-throw', 'attack-roll'])
@pytest.mark.parametrize(('trait', 'damage'), [
    (None, 8), ('damage_resistances', 4), ('damage_immunities', 0), ('damage_vulnerabilities', 16),
])
def test_spell_damage_applies_the_targets_typed_defenses(monkeypatch, attack_roll, trait, damage):
    monkeypatch.setattr('core_table.dice.random.randint', lambda _low, high: min(high, 10))
    caster = Combatant(combatant_id='caster', entity_id='caster', name='Caster', spell_slots={1: 2})
    target = Combatant(combatant_id='target', entity_id='target', name='Target', hp=40, max_hp=40,
                       armor_class=5)
    if trait:
        setattr(target, trait, ['fire'])
    state = CombatState(combat_id='spell-defenses', session_id='spell-defenses', table_id='table',
                        phase=CombatPhase.ACTIVE, combatants=[caster, target])
    monkeypatch.setitem(CombatEngine._active, 'spell-defenses', state)

    result = CombatEngine.execute_spell(
        'spell-defenses', 'caster', 'Test fire spell', 1, ['target'], damage_formula='1d8',
        save_ability='dex', save_dc=99, damage_type='fire', requires_attack_roll=attack_roll,
    )

    assert 'error' not in result
    assert target.hp == 40 - damage
    assert caster.spell_slots[1] == 1
    assert not caster.has_action


def test_spell_saving_throw_reduces_damage_using_the_targets_modifier(monkeypatch):
    monkeypatch.setattr('core_table.dice.random.randint', lambda _low, high: min(high, 10))
    caster = Combatant(combatant_id='caster', entity_id='caster', name='Caster', spell_slots={1: 1})
    target = Combatant(combatant_id='target', entity_id='target', name='Target', hp=20, max_hp=20,
                       save_modifiers={'dexterity': 5})
    state = CombatState(combat_id='spell-save', session_id='spell-save', table_id='table',
                        phase=CombatPhase.ACTIVE, combatants=[caster, target])
    monkeypatch.setitem(CombatEngine._active, 'spell-save', state)

    result = CombatEngine.execute_spell(
        'spell-save', 'caster', 'Test save spell', 1, ['target'], damage_formula='1d8',
        save_ability='dex', save_dc=15, damage_type='fire',
    )

    assert result['damage_results'][0]['saved']
    assert target.hp == 16


@pytest.mark.parametrize(('effect', 'save_half', 'expected_hp'), [
    ('automatic', False, 12), ('saving_throw', False, 20), ('saving_throw', True, 16),
])
def test_explicit_effects_and_nonconcentration_casts(monkeypatch, effect, save_half, expected_hp):
    monkeypatch.setattr('core_table.dice.random.randint', lambda _low, high: min(high, 10))
    caster = Combatant(combatant_id='caster', entity_id='caster', name='Caster',
                       spell_slots={1: 1}, concentration_spell='Bless')
    target = Combatant(combatant_id='target', entity_id='target', name='Target', hp=20, max_hp=20)
    state = CombatState(combat_id='effects', session_id='effects', table_id='table',
                        phase=CombatPhase.ACTIVE, combatants=[caster, target])
    monkeypatch.setitem(CombatEngine._active, 'effects', state)

    result = CombatEngine.execute_spell(
        'effects', 'caster', 'Explicit damage', 1, ['target'], damage_formula='1d8',
        save_ability='dex', save_dc=5, effect=effect, save_half=save_half,
    )

    assert 'error' not in result
    assert target.hp == expected_hp
    assert caster.spell_slots[1] == 0
    assert caster.concentration_spell == 'Bless'
