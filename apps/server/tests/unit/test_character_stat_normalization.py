import json
from copy import deepcopy
from pathlib import Path

import pytest
from service.character_stat_normalization import compendium_npc_document, normalize_character_stats


def test_all_bundled_monsters_have_canonical_stats_and_preserve_combat_content():
    path = Path(__file__).resolve().parents[4] / "packages/core-table/core_table/compendiums/bundled_srd51/bestiary_optimized.json"
    monsters = json.loads(path.read_text(encoding="utf-8"))["monsters"]
    assert len(monsters) == 201
    for name, raw in monsters.items():
        source = compendium_npc_document({"name": name, "raw": raw}, character_id="new-npc")
        stats = source["data"]["stats"]
        assert stats["hp"] == stats["maxHp"] == int(raw["hit_points"].split()[0])
        assert stats["ac"] == raw["armor_class"]
        assert source["data"]["compendium"] == raw
        assert source["data"].get("actions") == raw.get("actions")
        assert all(stats[key] == value for key, value in raw["stats"].items())


def test_canonical_zero_and_null_win_without_mutating_the_source():
    document = {"character_id": "hero", "name": "Hero", "hp": 20,
                "stats": {"ac": 12, "custom": "kept"}, "data": {"stats": {"hp": 0, "ac": None}, "items": ["rope"]}}
    original = deepcopy(document)
    result = normalize_character_stats(document, character_id="hero")
    assert result["data"] == {"stats": {"hp": 0, "ac": None}, "items": ["rope"]}
    assert result["stats"] == {"custom": "kept"} and "hp" not in result
    assert document == original
    assert normalize_character_stats(result, character_id="hero") == result


@pytest.mark.parametrize("document", [
    {"hp": 1, "data": {"hp": 2}}, {"hp": True}, {"hp": -1}, {"armor_class": 101},
    {"hit_points": "roll 2d6"}, {"character_id": "other"},
])
def test_ambiguous_or_invalid_legacy_data_is_not_guessed(document):
    with pytest.raises(ValueError):
        normalize_character_stats({"name": "Hero", **document}, character_id="hero")


def test_existing_current_hp_does_not_invent_max_hp():
    result = normalize_character_stats({"name": "Hero", "hp": 3}, character_id="hero")
    assert result["data"]["stats"] == {"hp": 3}


def test_legacy_npc_keeps_actions_and_abilities_on_the_combat_consumers_data_path():
    source = {'character_id': 'old-npc', 'name': 'Goblin', 'npc': True,
              'hit_points': '7 (2d6)', 'armor_class': 15, 'stats': {'DEX': 14},
              'actions': [{'name': 'Scimitar'}], 'damage_immunities': ['poison']}
    result = normalize_character_stats(source, character_id='old-npc')
    assert result['data']['actions'] == source['actions']
    assert result['data']['damage_immunities'] == ['poison']
    assert result['data']['stats'] == {'hp': 7, 'maxHp': 7, 'ac': 15, 'DEX': 14}
    assert normalize_character_stats(result, character_id='old-npc') == result


def test_raw_monster_content_cannot_override_identity_or_sharing():
    result = compendium_npc_document({"name": "Goblin", "raw": {"character_id": "victim", "controlledBy": [999],
        "hp": 0, "ac": 0}}, character_id="new-npc")
    assert result["character_id"] == "new-npc" and result.get("controlledBy", []) == []
    assert result["data"]["stats"] == {"hp": 0, "maxHp": 0, "ac": 0}
