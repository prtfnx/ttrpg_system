#!/usr/bin/env python3
"""
Test the refactored character creator components
"""

import sys
import os

# Add the project root to the path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

def test_imports():
    """Test that all components import correctly"""
    try:
        from gui.windows.character_creator import CharacterCreator
        from gui.windows.character_creator.enums import CreationStep, AbilityGenMethod
        from gui.windows.character_creator.utils import CharacterCreatorUtils
        from gui.windows.character_creator.race_step import RaceStep
        from gui.windows.character_creator.class_step import ClassStep
        from gui.windows.character_creator.abilities_step import AbilitiesStep
        from gui.windows.character_creator.background_step import BackgroundStep
        from gui.windows.character_creator.equipment_step import EquipmentStep
        from gui.windows.character_creator.overview_step import OverviewStep
        
        print("✓ All imports successful")
        return True
    except ImportError as e:
        print(f"✗ Import error: {e}")
        return False

def test_character_creator_creation():
    """Test that character creator can be instantiated"""
    try:
        from gui.windows.character_creator import CharacterCreator
        
        creator = CharacterCreator()
        print("✓ CharacterCreator instantiated successfully")
        print(f"  - Compendium loaded: {len(creator.compendium_data)} categories")
        print(f"  - Races: {len(creator.compendium_data.get('races', {}))}")
        print(f"  - Classes: {len(creator.compendium_data.get('classes', {}))}")
        print(f"  - Backgrounds: {len(creator.compendium_data.get('backgrounds', {}))}")
        return True
    except Exception as e:
        print(f"✗ Creation error: {e}")
        return False

def test_step_creation():
    """Test that step components can be created"""
    try:
        from gui.windows.character_creator.utils import CharacterCreatorUtils
        from gui.windows.character_creator.race_step import RaceStep
        from gui.windows.character_creator.class_step import ClassStep
        
        # Load test data
        compendium_data = CharacterCreatorUtils.load_compendium_data()
        character_data = {
            'race': '',
            'character_class': '',
            'level': 1,
            'ability_scores': {'STR': 10, 'DEX': 10, 'CON': 10, 'INT': 10, 'WIS': 10, 'CHA': 10}
        }
        
        # Test step creation
        race_step = RaceStep(character_data, compendium_data)
        class_step = ClassStep(character_data, compendium_data)
        
        print("✓ Step components created successfully")
        print(f"  - Race step completion: {race_step.is_complete()}")
        print(f"  - Class step completion: {class_step.is_complete()}")
        return True
    except Exception as e:
        print(f"✗ Step creation error: {e}")
        return False

if __name__ == "__main__":
    print("Testing Refactored Character Creator")
    print("=" * 40)
    
    tests = [
        test_imports,
        test_character_creator_creation,
        test_step_creation
    ]
    
    passed = 0
    total = len(tests)
    
    for test in tests:
        print(f"\nRunning {test.__name__}...")
        if test():
            passed += 1
        print()
    
    print("=" * 40)
    print(f"Tests passed: {passed}/{total}")
    
    if passed == total:
        print("✓ All tests passed! The refactored character creator is working.")
    else:
        print("✗ Some tests failed. Check the errors above.")
