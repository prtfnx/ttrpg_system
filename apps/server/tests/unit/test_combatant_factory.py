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
