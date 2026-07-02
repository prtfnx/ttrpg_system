from types import SimpleNamespace

from service.combatant_factory import CombatantFactory, CombatantFactoryContext


def test_token_values_win_over_flat_client_stats():
    token = SimpleNamespace(
        sprite_id='sprite-1',
        entity_id=7,
        name='Server Token',
        character_id='char-1',
        controlled_by=[42],
        hp=12,
        max_hp=18,
        ac=15,
    )
    table = SimpleNamespace(entities={7: token})

    payload = CombatantFactory().build_payload(
        'sprite-1',
        {
            'name': 'Spoofed',
            'character_id': 'spoofed-char',
            'hp': 999,
            'max_hp': 999,
            'armor_class': 99,
            'controlled_by': ['999'],
        },
        CombatantFactoryContext(table=table),
    )

    assert payload['name'] == 'Server Token'
    assert payload['character_id'] == 'char-1'
    assert payload['hp'] == 12
    assert payload['max_hp'] == 18
    assert payload['armor_class'] == 15
    assert payload['controlled_by'] == ['42']


def test_character_values_fill_combat_resources():
    character = {
        'name': 'Ada',
        'data': {
            'stats': {'hp': 20, 'maxHp': 24, 'ac': 16, 'speed': 35, 'initiative': 3},
            'abilityScores': {'dex': 16, 'con': 14},
            'spellSlots': {'1': {'total': 4}, '2': {'total': 2}, 'cantrips': {'total': 3}},
            'spellSlotsUsed': {'1': 1},
        },
    }

    payload = CombatantFactory().build_payload(
        'sprite-1',
        {'character_id': 'char-1'},
        CombatantFactoryContext(load_character=lambda character_id: character),
    )

    assert payload['name'] == 'Ada'
    assert payload['hp'] == 20
    assert payload['max_hp'] == 24
    assert payload['armor_class'] == 16
    assert payload['movement_speed'] == 35
    assert payload['initiative_modifier'] == 3
    assert payload['constitution_modifier'] == 2
    assert payload['spell_slots_max'] == {1: 4, 2: 2}
    assert payload['spell_slots'] == {1: 3, 2: 2}


def test_flat_compendium_npc_gets_canonical_combat_stats():
    monster = {
        'name': 'Ash Drake',
        'type': 'npc',
        'current_hp': 34,
        'hit_points': 40,
        'armor_class': [{'value': 17, 'type': 'natural'}],
        'speed': {'walk': '40 ft.', 'fly': '80 ft.'},
        'stats': {'STR': 18, 'DEX': 14, 'CON': 16, 'INT': 6, 'WIS': 12, 'CHA': 8},
        'spell_slots': {'1': 3, '2': 2},
        'damage_resistances': ['fire', 'poison'],
        'damage_vulnerabilities': 'cold',
        'damage_immunities': 'sleep; paralysis',
        'attacks_per_action': 2,
    }

    payload = CombatantFactory().build_payload(
        'drake-token',
        {'character_id': 'monster-1'},
        CombatantFactoryContext(load_character=lambda character_id: monster),
    )

    assert payload['name'] == 'Ash Drake'
    assert payload['hp'] == 34
    assert payload['max_hp'] == 40
    assert payload['armor_class'] == 17
    assert payload['movement_speed'] == 40
    assert payload['initiative_modifier'] == 2
    assert payload['constitution_modifier'] == 3
    assert payload['attacks_per_action'] == 2
    assert payload['spell_slots'] == {1: 3, 2: 2}
    assert payload['damage_resistances'] == ['fire', 'poison']
    assert payload['damage_vulnerabilities'] == ['cold']
    assert payload['damage_immunities'] == ['sleep', 'paralysis']
    assert payload['is_npc'] is True


def test_explicit_dm_overrides_win_over_canonical_values():
    token = SimpleNamespace(
        sprite_id='sprite-1',
        entity_id=1,
        name='Token Name',
        character_id=None,
        controlled_by=[1],
        hp=8,
        max_hp=8,
        ac=12,
    )
    table = SimpleNamespace(entities={1: token})

    payload = CombatantFactory().build_payload(
        'sprite-1',
        {'overrides': {'name': 'Illusion', 'hp': 1, 'is_npc': True}},
        CombatantFactoryContext(table=table),
    )

    assert payload['name'] == 'Illusion'
    assert payload['hp'] == 1
    assert payload['armor_class'] == 12
    assert payload['is_npc'] is True


def test_dm_overrides_cannot_replace_ownership_or_derived_resources():
    token = SimpleNamespace(
        sprite_id='sprite-1',
        entity_id=1,
        name='Token Name',
        character_id='char-1',
        controlled_by=[7],
        hp=8,
        max_hp=8,
        ac=12,
    )
    character = {
        'data': {
            'stats': {'hp': 8, 'maxHp': 8, 'ac': 12},
            'abilityScores': {'dex': 14, 'con': 12},
            'spellSlots': {'1': 2},
        },
    }

    payload = CombatantFactory().build_payload(
        'sprite-1',
        {
            'overrides': {
                'name': 'Approved Override',
                'controlled_by': ['attacker'],
                'initiative_modifier': 99,
                'spell_slots': {9: 99},
            },
        },
        CombatantFactoryContext(
            table=SimpleNamespace(entities={1: token}),
            load_character=lambda character_id: character,
        ),
    )

    assert payload['name'] == 'Approved Override'
    assert payload['controlled_by'] == ['7']
    assert payload['initiative_modifier'] == 2
    assert payload['spell_slots'] == {1: 2}


def test_flat_client_payload_is_fallback_without_canonical_sources():
    payload = CombatantFactory().build_payload(
        'sprite-1',
        {
            'name': 'Fallback',
            'hp': 5,
            'max_hp': 6,
            'armor_class': 11,
            'movement_speed': 25,
            'controlled_by': [3],
        },
    )

    assert payload['name'] == 'Fallback'
    assert payload['hp'] == 5
    assert payload['max_hp'] == 6
    assert payload['armor_class'] == 11
    assert payload['movement_speed'] == 25
    assert payload['controlled_by'] == ['3']
    assert payload['is_npc'] is False
