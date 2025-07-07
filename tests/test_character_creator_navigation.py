#!/usr/bin/env python3
"""
Test script for Character Creator Navigation
"""

import os
import sys

# Add the project root to sys.path
project_root = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, project_root)

from logger import setup_logger
from CompendiumManager import CompendiumManager

logger = setup_logger(__name__)

def test_character_creator_navigation():
    """Test character creator navigation logic"""
    
    try:
        logger.info("Testing Character Creator navigation...")
        
        # Initialize CompendiumManager
        compendium_manager = CompendiumManager()
        results = compendium_manager.load_all_systems()
        
        if not results.get('characters', False):
            logger.error("Characters not loaded - cannot test navigation")
            return False
        
        # Test character creator
        class MockContext:
            def __init__(self):
                self.CompendiumManager = compendium_manager
        
        from gui.windows.character_creator import CharacterCreator
        from gui.windows.character_creator.enums import CreationStep
        
        mock_context = MockContext()
        creator = CharacterCreator(mock_context)
        
        # Test initial state
        logger.info(f"Initial step: {creator.current_step.name}")
        logger.info(f"Can access class step initially: {creator._can_access_step(CreationStep.CLASS)}")
        
        # Test race selection
        if len(creator.races) > 0:
            first_race_id = list(creator.races.keys())[0]
            first_race_data = creator.races[first_race_id]
            
            logger.info(f"Selecting race: {first_race_data['name']}")
            
            # Simulate race selection
            creator.selected_race_id = first_race_id
            creator.character_data['race'] = first_race_data
            creator._apply_racial_traits(first_race_data)
            
            logger.info(f"Race in character_data: {creator.character_data['race'] is not None}")
            logger.info(f"Can access class step after race: {creator._can_access_step(CreationStep.CLASS)}")
        
        # Test class selection
        if len(creator.classes) > 0:
            first_class_id = list(creator.classes.keys())[0]
            first_class_data = creator.classes[first_class_id]
            
            logger.info(f"Selecting class: {first_class_data['name']}")
            
            # Simulate class selection
            creator.selected_class_id = first_class_id
            creator.character_data['class'] = first_class_data
            creator._apply_class_features(first_class_data)
            
            logger.info(f"Class in character_data: {creator.character_data['class'] is not None}")
            logger.info(f"Can access abilities step after class: {creator._can_access_step(CreationStep.ABILITIES)}")
        
        # Test navigation logic
        for step in CreationStep:
            can_access = creator._can_access_step(step)
            logger.info(f"Can access {step.name}: {can_access}")
        
        # Test that we can navigate forward
        if creator.current_step == CreationStep.RACE and creator.character_data['race']:
            next_step_value = creator.current_step.value + 1
            if next_step_value < len(CreationStep):
                next_step = CreationStep(next_step_value)
                can_go_forward = creator._can_access_step(next_step)
                logger.info(f"Can go from {creator.current_step.name} to {next_step.name}: {can_go_forward}")
        
        logger.info("✅ Character creator navigation test completed!")
        return True
        
    except Exception as e:
        logger.error(f"Character creator navigation test failed: {e}")
        import traceback
        traceback.print_exc()
        return False

if __name__ == "__main__":
    if test_character_creator_navigation():
        print("✅ Character creator navigation test passed!")
    else:
        print("❌ Character creator navigation test failed!")
        sys.exit(1)
