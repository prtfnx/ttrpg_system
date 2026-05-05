"""Tests for combat model extensions (Phase 3-6, 10)."""
from core_table.combat import Combatant


def make_combatant(**kw) -> Combatant:
    return Combatant(
        combatant_id='c1', entity_id='e1', name='Hero',
        hp=20, max_hp=20, armor_class=14,
        movement_speed=30, movement_remaining=30,
        **kw,
    )


def test_combatant_temp_hp_default():
    c = make_combatant()
    assert c.temp_hp == 0


def test_combatant_temp_hp_field():
    c = make_combatant(temp_hp=5)
    assert c.temp_hp == 5


def test_combatant_resistance_fields_default():
    c = make_combatant()
    assert c.damage_resistances == []
    assert c.damage_vulnerabilities == []
    assert c.damage_immunities == []


def test_combatant_resistance_fields():
    c = make_combatant(damage_resistances=['fire'], damage_immunities=['poison'])
    assert 'fire' in c.damage_resistances
    assert 'poison' in c.damage_immunities
    assert c.damage_vulnerabilities == []


def test_combatant_concentration_field():
    c = make_combatant(concentration_spell='Bless')
    assert c.concentration_spell == 'Bless'


def test_combatant_concentration_default_none():
    c = make_combatant()
    assert c.concentration_spell is None


def test_death_saves_track_correctly():
    c = make_combatant()
    assert c.death_save_successes == 0
    assert c.death_save_failures == 0
    c.death_save_successes = 2
    c.death_save_failures = 1
    assert c.death_save_successes == 2
    assert c.death_save_failures == 1


def test_combatant_surprised_field():
    c = make_combatant(surprised=True)
    assert c.surprised is True


def test_combatant_has_reaction_field():
    c = make_combatant()
    assert c.has_reaction is True
    c.has_reaction = False
    assert c.has_reaction is False


def test_combatant_to_dict_includes_extensions():
    c = make_combatant(
        temp_hp=3, damage_resistances=['fire'],
        concentration_spell='Bless', surprised=True,
    )
    d = c.to_dict()
    assert d['temp_hp'] == 3
    assert 'fire' in d['damage_resistances']
    assert d['concentration_spell'] == 'Bless'
    assert d['surprised'] is True
