"""
Comprehensive test of all compendium systems
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from services.compendium_service import CompendiumService


def test_data_loading():
    """Test data loading"""
    print("\n" + "="*60)
    print("TEST 1: Data Loading")
    print("="*60)
    
    compendium = CompendiumService()
    counts = compendium.load_all()
    
    assert counts['spells'] == 361, f"Expected 361 spells, got {counts['spells']}"
    assert counts['classes'] == 15, f"Expected 15 classes, got {counts['classes']}"
    assert counts['equipment'] == 115, f"Expected 115 equipment, got {counts['equipment']}"
    assert counts['monsters'] == 450, f"Expected 450 monsters, got {counts['monsters']}"
    
    print("✓ All data loaded correctly")
    return compendium


def test_spell_features(compendium):
    """Test spell-specific features"""
    print("\n" + "="*60)
    print("TEST 2: Spell Features")
    print("="*60)
    
    # Test spell retrieval
    fireball = compendium.get_spell("Fireball")
    assert fireball is not None, "Fireball not found"
    assert fireball.level == 3, f"Expected level 3, got {fireball.level}"
    assert fireball.school.full_name == "Evocation", f"Expected Evocation, got {fireball.school.full_name}"
    
    # Test serialization
    spell_dict = fireball.to_dict()
    assert 'name' in spell_dict, "Serialization missing name"
    assert spell_dict['name'] == "Fireball", "Serialization name mismatch"
    
    # Test search
    fire_spells = compendium.spells.search_spells(query="fire")
    assert len(fire_spells) > 0, "No fire spells found"
    
    print(f"✓ Spell system working ({len(fire_spells)} fire-related spells)")


def test_class_features(compendium):
    """Test class-specific features"""
    print("\n" + "="*60)
    print("TEST 3: Class Features")
    print("="*60)
    
    # Get all classes
    all_classes = compendium.classes.get_all_classes()
    assert len(all_classes) == 15, f"Expected 15 classes, got {len(all_classes)}"
    
    # Create a custom class
    from models.character_class import CharacterClass, AbilityScore
    wizard = CharacterClass()
    wizard.name = "Wizard"
    wizard.hit_die = 6
    wizard.spellcasting_ability = AbilityScore.INTELLIGENCE
    
    # Test proficiency calculation
    prof_1 = wizard.get_proficiency_bonus(1)
    prof_5 = wizard.get_proficiency_bonus(5)
    prof_17 = wizard.get_proficiency_bonus(17)
    
    assert prof_1 == 2, f"Expected +2 at level 1, got +{prof_1}"
    assert prof_5 == 3, f"Expected +3 at level 5, got +{prof_5}"
    assert prof_17 == 6, f"Expected +6 at level 17, got +{prof_17}"
    
    print(f"✓ Class system working (proficiency bonuses correct)")


def test_equipment_features(compendium):
    """Test equipment-specific features"""
    print("\n" + "="*60)
    print("TEST 4: Equipment Features")
    print("="*60)
    
    # Search equipment
    all_equipment = list(compendium.equipment.equipment.values())
    assert len(all_equipment) == 115, f"Expected 115 items, got {len(all_equipment)}"
    
    # Create magic item
    from models.equipment import Equipment, ItemRarity, ItemType
    magic_sword = Equipment()
    magic_sword.name = "+1 Longsword"
    magic_sword.is_magic = True
    magic_sword.rarity = ItemRarity.UNCOMMON
    magic_sword.bonus = 1
    magic_sword.requires_attunement = False
    
    # Test attunement check
    can_attune = magic_sword.can_attune()
    assert can_attune == True, "Should be able to attune"
    
    magic_sword.requires_attunement = True
    magic_sword.attunement_requirements = "by a wizard"
    
    assert magic_sword.can_attune("wizard") == True, "Wizard should be able to attune"
    
    print(f"✓ Equipment system working (attunement logic correct)")


def test_monster_features(compendium):
    """Test monster-specific features"""
    print("\n" + "="*60)
    print("TEST 5: Monster Features")
    print("="*60)
    
    # Get legendary monsters
    legendary = compendium.monsters.get_legendary_monsters()
    assert len(legendary) == 37, f"Expected 37 legendary monsters, got {len(legendary)}"
    
    # Get specific monster
    dragon = compendium.get_monster("Adult Red Dragon")
    assert dragon is not None, "Adult Red Dragon not found"
    assert dragon.is_legendary == True, "Dragon should be legendary"
    
    # Test CR-based search
    cr1_monsters = compendium.monsters.get_by_cr("1")
    assert len(cr1_monsters) > 0, "No CR 1 monsters found"
    
    # Test ability modifier
    from models.monster import Monster, AbilityScores
    test_monster = Monster()
    test_monster.abilities = AbilityScores(strength=20)
    str_mod = test_monster.get_ability_modifier('strength')
    assert str_mod == 5, f"Expected +5 modifier, got +{str_mod}"
    
    print(f"✓ Monster system working ({len(legendary)} legendary monsters)")


def test_unified_search(compendium):
    """Test unified search across all categories"""
    print("\n" + "="*60)
    print("TEST 6: Unified Search")
    print("="*60)
    
    # Search for "dragon"
    results = compendium.search("dragon")
    total = sum(len(v) for v in results.values())
    
    assert total > 0, "No results found for 'dragon'"
    assert 'spells' in results, "Missing spells category"
    assert 'monsters' in results, "Missing monsters category"
    
    print(f"✓ Unified search working ({total} total results for 'dragon')")
    print(f"  - Spells: {len(results['spells'])}")
    print(f"  - Equipment: {len(results['equipment'])}")
    print(f"  - Monsters: {len(results['monsters'])}")


def test_serialization(compendium):
    """Test WebSocket serialization"""
    print("\n" + "="*60)
    print("TEST 7: WebSocket Serialization")
    print("="*60)
    
    # Test spell serialization
    fireball = compendium.get_spell("Fireball")
    from models.spell import Spell
    
    spell_dict = fireball.to_dict()
    spell_restored = Spell.from_dict(spell_dict)
    assert spell_restored.name == fireball.name, "Spell deserialization failed"
    
    # Test monster serialization
    from models.monster import Monster
    dragon = compendium.get_monster("Aboleth")
    if dragon:
        monster_dict = dragon.to_dict()
        monster_restored = Monster.from_dict(monster_dict)
        assert monster_restored.name == dragon.name, "Monster deserialization failed"
        assert len(monster_restored.legendary_actions) == len(dragon.legendary_actions), "Legendary actions not preserved"
    
    print(f"✓ Serialization working (spell and monster round-trip successful)")


def main():
    print("\n" + "#"*60)
    print("# COMPREHENSIVE COMPENDIUM SYSTEM TEST")
    print("#"*60)
    
    try:
        compendium = test_data_loading()
        test_spell_features(compendium)
        test_class_features(compendium)
        test_equipment_features(compendium)
        test_monster_features(compendium)
        test_unified_search(compendium)
        test_serialization(compendium)
        
        print("\n" + "#"*60)
        print("# ALL TESTS PASSED ✓")
        print("#"*60)
        
        # Print summary
        stats = compendium.get_stats()
        print("\n📊 SYSTEM SUMMARY:")
        print(f"  Total Items: {sum([stats['total_spells'], stats['total_classes'], stats['total_equipment'], stats['total_monsters']])}")
        print(f"  Spells: {stats['total_spells']} ({stats['cantrips']} cantrips, {stats['ritual_spells']} rituals)")
        print(f"  Classes: {stats['total_classes']}")
        print(f"  Equipment: {stats['total_equipment']} ({stats['magic_items']} magic items)")
        print(f"  Monsters: {stats['total_monsters']} ({stats['legendary_monsters']} legendary)")
        
        return True
        
    except AssertionError as e:
        print(f"\n❌ TEST FAILED: {e}")
        return False
    except Exception as e:
        print(f"\n❌ ERROR: {e}")
        import traceback
        traceback.print_exc()
        return False


if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)
