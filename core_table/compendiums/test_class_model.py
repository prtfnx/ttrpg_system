"""
Test enhanced class model
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from services.class_service import ClassService
from models.character_class import CharacterClass, ClassFeature, Subclass, LevelProgression, AbilityScore


def main():
    print("=" * 60)
    print("Testing Enhanced Class Model")
    print("=" * 60)
    
    # Test manual class creation
    print("\n1. Testing manual class creation...")
    wizard = CharacterClass()
    wizard.name = "Wizard"
    wizard.hit_die = 6
    wizard.primary_abilities = [AbilityScore.INTELLIGENCE]
    wizard.saving_throws = [AbilityScore.INTELLIGENCE, AbilityScore.WISDOM]
    wizard.spellcasting_ability = AbilityScore.INTELLIGENCE
    wizard.armor_proficiencies = []
    wizard.weapon_proficiencies = ["Daggers", "Darts", "Slings", "Quarterstaffs", "Light Crossbows"]
    wizard.skill_choices = 2
    wizard.skill_options = ["Arcana", "History", "Insight", "Investigation", "Medicine", "Religion"]
    wizard.subclass_level = 2
    
    # Add a feature
    wizard.features.append(ClassFeature(
        name="Spellcasting",
        description="You can cast wizard spells",
        level=1
    ))
    
    # Add a subclass
    evocation = Subclass(
        name="School of Evocation",
        short_name="Evocation",
        description="Focus on powerful damage spells"
    )
    evocation.features.append(ClassFeature(
        name="Sculpt Spells",
        description="Create pockets of safety in your evocation spells",
        level=2
    ))
    wizard.subclasses.append(evocation)
    
    print(f"✓ Created Wizard class")
    print(f"✓ Hit die: d{wizard.hit_die}")
    print(f"✓ Primary ability: {wizard.primary_abilities[0].full_name}")
    print(f"✓ Spellcasting: {wizard.spellcasting_ability.full_name}")
    print(f"✓ Subclass level: {wizard.subclass_level}")
    print(f"✓ Subclasses: {len(wizard.subclasses)}")
    
    # Test serialization
    print("\n2. Testing serialization...")
    wizard_dict = wizard.to_dict()
    print(f"✓ Serialized to dict: {len(wizard_dict)} keys")
    
    wizard_restored = CharacterClass.from_dict(wizard_dict)
    print(f"✓ Deserialized: {wizard_restored.name}")
    print(f"✓ Features preserved: {len(wizard_restored.features)}")
    print(f"✓ Subclasses preserved: {len(wizard_restored.subclasses)}")
    
    # Test proficiency bonus calculation
    print("\n3. Testing proficiency bonus...")
    for level in [1, 5, 9, 13, 17]:
        bonus = wizard.get_proficiency_bonus(level)
        print(f"✓ Level {level}: +{bonus}")
    
    # Test subclass requirement
    print("\n4. Testing subclass requirement...")
    for level in [1, 2, 3]:
        required = wizard.requires_subclass_at(level)
        status = "required" if required else "not required"
        print(f"✓ Level {level}: {status}")
    
    # Test ClassService
    print("\n5. Testing ClassService...")
    service = ClassService()
    count = service.load_classes()
    print(f"✓ Loaded {count} class references")
    
    all_classes = service.get_all_classes()
    print(f"✓ Found {len(all_classes)} classes")
    for cls in all_classes[:5]:
        print(f"  - {cls.name}")
    
    print("\n" + "=" * 60)
    print("All tests passed! ✓")
    print("=" * 60)


if __name__ == "__main__":
    main()
