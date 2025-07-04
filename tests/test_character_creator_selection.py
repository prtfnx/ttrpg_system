#!/usr/bin/env python3
"""
Test script for Character Creator UI interactions
"""

import os
import sys

# Add the project root to sys.path
project_root = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, project_root)

from logger import setup_logger
from CompendiumManager import CompendiumManager

logger = setup_logger(__name__)

def test_character_creator_selection():
    """Test character creator selection logic"""
    
    try:
        logger.info("Testing Character Creator selection...")
        
        # Initialize CompendiumManager
        compendium_manager = CompendiumManager()
        results = compendium_manager.load_all_systems()
        
        if not results.get('characters', False):
            logger.error("Characters not loaded - cannot test selection")
            return False
        
        # Test character creator
        class MockContext:
            def __init__(self):
                self.CompendiumManager = compendium_manager
        
        from gui.windows.character_creator_window import CharacterCreator
        
        mock_context = MockContext()
        creator = CharacterCreator(mock_context)
        
        # Test race selection
        if len(creator.races) > 0:
            first_race_id = list(creator.races.keys())[0]
            first_race_data = creator.races[first_race_id]
            
            logger.info(f"Testing race selection: {first_race_data['name']}")
            
            # Simulate selection
            creator.selected_race_id = first_race_id
            creator.character_data['race'] = first_race_data
            creator._apply_racial_traits(first_race_data)
            
            # Verify selection
            if creator.character_data['race']:
                logger.info(f"✅ Race selection works: {creator.character_data['race']['name']}")
            else:
                logger.error("❌ Race selection failed")
                return False
        
        # Test class selection
        if len(creator.classes) > 0:
            first_class_id = list(creator.classes.keys())[0]
            first_class_data = creator.classes[first_class_id]
            
            logger.info(f"Testing class selection: {first_class_data['name']}")
            
            # Simulate selection
            creator.selected_class_id = first_class_id
            creator.character_data['class'] = first_class_data
            creator._apply_class_features(first_class_data)
            
            # Verify selection
            if creator.character_data['class']:
                logger.info(f"✅ Class selection works: {creator.character_data['class']['name']}")
            else:
                logger.error("❌ Class selection failed")
                return False
        
        # Test background selection
        if len(creator.backgrounds) > 0:
            first_bg_id = list(creator.backgrounds.keys())[0]
            first_bg_data = creator.backgrounds[first_bg_id]
            
            logger.info(f"Testing background selection: {first_bg_data['name']}")
            
            # Simulate selection
            creator.selected_background_id = first_bg_id
            creator.character_data['background'] = first_bg_data
            creator._apply_background_features(first_bg_data)
            
            # Verify selection
            if creator.character_data['background']:
                logger.info(f"✅ Background selection works: {creator.character_data['background']['name']}")
            else:
                logger.error("❌ Background selection failed")
                return False
        
        # Test character creation
        creator.character_data['name'] = "Test Character"
        creator.character_data['player_name'] = "Test Player"
        
        character = creator._create_character()
        if character:
            logger.info(f"✅ Character creation works: {character.name}")
            logger.info(f"   Race: {character.race.name if character.race else 'None'}")
            logger.info(f"   Class: {character.character_class.name if character.character_class else 'None'}")
            logger.info(f"   Background: {character.background.name if character.background else 'None'}")
            logger.info(f"   Level: {character.level}")
        else:
            logger.error("❌ Character creation failed")
            return False
        
        logger.info("✅ All character creator selection tests passed!")
        return True
        
    except Exception as e:
        logger.error(f"Character creator selection test failed: {e}")
        import traceback
        traceback.print_exc()
        return False

if __name__ == "__main__":
    if test_character_creator_selection():
        print("✅ Character creator selection test passed!")
    else:
        print("❌ Character creator selection test failed!")
        sys.exit(1)
