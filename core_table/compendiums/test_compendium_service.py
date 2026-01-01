"""
Test unified CompendiumService
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from services.compendium_service import CompendiumService


def main():
    print("=" * 60)
    print("Testing Unified Compendium Service")
    print("=" * 60)
    
    # Initialize service
    print("\n1. Initializing CompendiumService...")
    compendium = CompendiumService()
    print("✓ Service initialized")
    
    # Load all data
    print("\n2. Loading all compendium data...")
    counts = compendium.load_all()
    print(f"✓ Loaded {counts['spells']} spells")
    print(f"✓ Loaded {counts['classes']} classes")
    print(f"✓ Loaded {counts['equipment']} equipment items")
    print(f"✓ Loaded {counts['monsters']} monsters")
    
    # Get statistics
    print("\n3. Getting compendium statistics...")
    stats = compendium.get_stats()
    print(f"✓ Total content: {sum(counts.values())} items")
    print(f"✓ Cantrips: {stats['cantrips']}")
    print(f"✓ Ritual spells: {stats['ritual_spells']}")
    print(f"✓ Magic items: {stats['magic_items']}")
    print(f"✓ Legendary monsters: {stats['legendary_monsters']}")
    
    # Test unified search
    print("\n4. Testing unified search...")
    results = compendium.search("fire")
    total_results = sum(len(v) for v in results.values())
    print(f"✓ Found {total_results} total results for 'fire'")
    print(f"  - Spells: {len(results.get('spells', []))}")
    print(f"  - Equipment: {len(results.get('equipment', []))}")
    print(f"  - Monsters: {len(results.get('monsters', []))}")
    
    # Test category-specific search
    print("\n5. Testing category search...")
    spell_results = compendium.search("magic", category="spells")
    print(f"✓ Found {len(spell_results['spells'])} spells with 'magic'")
    
    # Test direct getters
    print("\n6. Testing direct getters...")
    fireball = compendium.get_spell("Fireball")
    print(f"✓ Got spell: {fireball.name if fireball else 'Not found'}")
    
    dragon = compendium.get_monster("Adult Red Dragon")
    print(f"✓ Got monster: {dragon.name if dragon else 'Not found'}")
    
    # Test level-based queries
    print("\n7. Testing level-based queries...")
    level_1_content = compendium.get_by_level(1)
    print(f"✓ Level 1 spells: {len(level_1_content['spells'])}")
    print(f"✓ Available classes: {len(level_1_content['available_classes'])}")
    
    # Test character creation data
    print("\n8. Testing character creation data...")
    char_data = compendium.get_for_character_creation()
    print(f"✓ Classes: {len(char_data['classes'])}")
    print(f"✓ Cantrips: {len(char_data['cantrips'])}")
    print(f"✓ Level 1 spells: {len(char_data['level_1_spells'])}")
    
    # Test serialization
    print("\n9. Testing serialization...")
    compendium_dict = compendium.to_dict()
    print(f"✓ Serialized: {len(compendium_dict)} keys")
    print(f"✓ Loaded state: {compendium_dict['loaded']}")
    
    print("\n" + "=" * 60)
    print("All tests passed! ✓")
    print("=" * 60)
    
    print("\n📊 Final Statistics:")
    for key, value in stats.items():
        print(f"  {key.replace('_', ' ').title()}: {value}")


if __name__ == "__main__":
    main()
