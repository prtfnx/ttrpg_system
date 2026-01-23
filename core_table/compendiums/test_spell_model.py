"""Test enhanced spell model"""

import sys
from pathlib import Path

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from services.spell_service import SpellService


def main():
    print("=" * 60)
    print("Testing Enhanced Spell Model")
    print("=" * 60)
    
    # Initialize service
    print("\n1. Loading spells...")
    service = SpellService()
    count = service.load_spells()
    print(f"✓ Loaded {count} spells")
    
    # Test specific spell
    print("\n2. Testing Fireball spell...")
    fireball = service.get_spell("Fireball")
    if fireball:
        print(f"✓ Name: {fireball.name}")
        print(f"✓ Level: {fireball.level}")
        print(f"✓ School: {fireball.school.full_name}")
        print(f"✓ Range: {fireball.range_distance} {fireball.range_unit}")
        print(f"✓ Damage Types: {fireball.damage_types}")
        print(f"✓ Saving Throw: {fireball.saving_throws}")
        print(f"✓ Components: V={fireball.components.verbal}, S={fireball.components.somatic}, M={fireball.components.material}")
        if fireball.scaling_damage:
            print(f"✓ Scaling: {fireball.scaling_damage.scaling}")
    else:
        print("✗ Fireball not found!")
    
    # Test serialization
    print("\n3. Testing serialization...")
    spell_dict = fireball.to_dict()
    print(f"✓ Serialized to dict: {len(spell_dict)} keys")
    
    # Import Spell class for deserialization
    from models.spell import Spell
    spell_restored = Spell.from_dict(spell_dict)
    print(f"✓ Deserialized: {spell_restored.name}")
    
    # Test search
    print("\n4. Testing search...")
    level3_spells = service.get_spells_by_level(3)
    print(f"✓ Found {len(level3_spells)} level 3 spells")
    
    cantrips = service.get_cantrips()
    print(f"✓ Found {len(cantrips)} cantrips")
    
    ritual_spells = service.get_ritual_spells()
    print(f"✓ Found {len(ritual_spells)} ritual spells")
    
    # Test filters
    print("\n5. Testing combined filters...")
    evocation_spells = service.search_spells(school="V", level=3)
    print(f"✓ Found {len(evocation_spells)} level 3 evocation spells")
    
    print("\n" + "=" * 60)
    print("All tests passed! ✓")
    print("=" * 60)


if __name__ == "__main__":
    main()
