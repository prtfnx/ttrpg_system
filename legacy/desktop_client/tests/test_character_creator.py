#!/usr/bin/env python3
"""
Test script for the Character Creator integration
"""

import os
import sys

# Add the project root to sys.path
project_root = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, project_root)

from logger import setup_logger
from CompendiumManager import CompendiumManager

logger = setup_logger(__name__)

def test_character_creator():
    """Test the character creator compendium integration"""
    
    # Test CompendiumManager directly
    try:
        logger.info("Initializing CompendiumManager...")
        compendium_manager = CompendiumManager()
        
        # Load compendiums
        results = compendium_manager.load_all_systems()
        logger.info(f"Compendium load results: {results}")
        
        # Test character data access
        if results.get('characters', False):
            races = compendium_manager.get_all_races()
            classes = compendium_manager.get_all_classes()
            backgrounds = compendium_manager.get_all_backgrounds()
            
            logger.info(f"Loaded {len(races)} races")
            logger.info(f"Loaded {len(classes)} classes")
            logger.info(f"Loaded {len(backgrounds)} backgrounds")
            
            # Show some examples
            if races:
                race_names = list(races.keys())[:5]
                logger.info(f"Sample races: {race_names}")
            
            if classes:
                class_names = list(classes.keys())[:5]
                logger.info(f"Sample classes: {class_names}")
            
            if backgrounds:
                bg_names = list(backgrounds.keys())[:5]
                logger.info(f"Sample backgrounds: {bg_names}")
        else:
            logger.warning("Characters not loaded - using direct character loader test")
        
        # Test character creator initialization with mock context
        class MockContext:
            def __init__(self):
                self.CompendiumManager = compendium_manager
        
        from gui.windows.character_creator import CharacterCreator
        
        logger.info("Testing CharacterCreator initialization...")
        mock_context = MockContext()
        creator = CharacterCreator(mock_context)
        
        logger.info(f"Creator loaded {len(creator.compendium_data.get('races', {}))} races")
        logger.info(f"Creator loaded {len(creator.compendium_data.get('classes', {}))} classes")
        logger.info(f"Creator loaded {len(creator.compendium_data.get('backgrounds', {}))} backgrounds")
        
        # Test custom race creation
        logger.info("Testing custom race creation...")
        if 'races' in creator.compendium_data:
            original_count = len(creator.compendium_data['races'])
            
            # Simulate custom race creation
            from core_table.compendiums.characters.character import Race, Size
            custom_race = Race()
            custom_race.name = "Test Custom Race"
            custom_race.size = Size.MEDIUM
            custom_race.speed = 30
            
            race_data = {
                'name': custom_race.name,
                'description': f"Custom race: {custom_race.name}",
                'size': custom_race.size.value,
                'speed': custom_race.speed,
                'traits': [],
                'ability_score_increases': [],
                'languages': ["Common"],
                'darkvision': 0,
                'race_object': custom_race
            }
            
            creator.compendium_data['races']['test_custom'] = race_data
            logger.info(f"Custom race added. Total races: {len(creator.compendium_data['races'])} (was {original_count})")
        
        logger.info("Character creator test completed successfully!")
        return True
        
    except Exception as e:
        logger.error(f"Character creator test failed: {e}")
        import traceback
        traceback.print_exc()
        return False

if __name__ == "__main__":
    success = test_character_creator()
    if success:
        print("✅ Character creator test passed!")
    else:
        print("❌ Character creator test failed!")
        sys.exit(1)
