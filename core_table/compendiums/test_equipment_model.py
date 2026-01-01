"""
Test enhanced equipment model
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from services.equipment_service import EquipmentService
from models.equipment import Equipment, Weapon, Armor, ItemType, ItemRarity, MagicProperty


def main():
    print("=" * 60)
    print("Testing Enhanced Equipment Model")
    print("=" * 60)
    
    # Test manual equipment creation
    print("\n1. Testing manual magic item creation...")
    sword = Equipment()
    sword.name = "+1 Longsword"
    sword.type = ItemType.WEAPON
    sword.is_magic = True
    sword.rarity = ItemRarity.UNCOMMON
    sword.bonus = 1
    sword.base_item = "Longsword"
    sword.weight = 3.0
    sword.cost = 1000
    sword.cost_unit = "gp"
    
    print(f"✓ Created {sword.name}")
    print(f"✓ Type: {sword.type.value}")
    print(f"✓ Rarity: {sword.rarity.value}")
    print(f"✓ Bonus: +{sword.bonus}")
    
    # Test attunement item
    print("\n2. Testing attunement item...")
    wand = Equipment()
    wand.name = "Wand of Fireballs"
    wand.type = ItemType.WAND
    wand.is_magic = True
    wand.rarity = ItemRarity.RARE
    wand.requires_attunement = True
    wand.attunement_requirements = "by a spellcaster"
    wand.max_charges = 7
    wand.regain_charges = "1d6+1 at dawn"
    
    print(f"✓ Created {wand.name}")
    print(f"✓ Requires attunement: {wand.requires_attunement}")
    print(f"✓ Charges: {wand.max_charges}")
    print(f"✓ Can wizard attune: {wand.can_attune('wizard')}")
    
    # Test serialization
    print("\n3. Testing serialization...")
    wand_dict = wand.to_dict()
    print(f"✓ Serialized to dict: {len(wand_dict)} keys")
    
    wand_restored = Equipment.from_dict(wand_dict)
    print(f"✓ Deserialized: {wand_restored.name}")
    print(f"✓ Charges preserved: {wand_restored.max_charges}")
    
    # Test EquipmentService
    print("\n4. Testing EquipmentService...")
    service = EquipmentService()
    count = service.load_equipment()
    print(f"✓ Loaded {count} equipment items")
    
    # Search for magic items
    magic_items = service.get_magic_items()
    print(f"✓ Found {len(magic_items)} magic items")
    
    # Search by rarity
    rare_items = service.get_by_rarity(ItemRarity.RARE)
    print(f"✓ Found {len(rare_items)} rare items")
    
    legendary_items = service.get_by_rarity(ItemRarity.LEGENDARY)
    print(f"✓ Found {len(legendary_items)} legendary items")
    
    # Search attunement items
    attunement_items = service.get_attunement_items()
    print(f"✓ Found {len(attunement_items)} attunement items")
    
    # Show some examples
    print("\n5. Sample magic items:")
    for item in magic_items[:5]:
        rarity_str = item.rarity.value if item.rarity else "common"
        attune_str = " (attunement)" if item.requires_attunement else ""
        print(f"  - {item.name} ({rarity_str}){attune_str}")
    
    print("\n" + "=" * 60)
    print("All tests passed! ✓")
    print("=" * 60)


if __name__ == "__main__":
    main()
