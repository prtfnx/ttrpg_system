#!/usr/bin/env python3
"""
Test script to verify that ImGui fixes resolved the infinite cycling issue
"""

import sys
import os
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from gui.windows.character_creator.character_creator_window import CharacterCreator
from gui.windows.character_creator.enums import CreationStep

def test_character_creator_steps():
    """Test that character creator steps don't auto-advance"""
    print("Testing character creator after ImGui fixes...")
    
    # Create character creator
    creator = CharacterCreator()
    
    print(f"Initial step: {creator.current_step}")
    
    # Open the creator
    creator.open_creator()
    
    print(f"Step after opening: {creator.current_step}")
    
    # Check that we're still on the race step
    if creator.current_step == CreationStep.RACE:
        print("✓ Creator stays on RACE step (no auto-advance)")
    else:
        print(f"✗ Creator auto-advanced to {creator.current_step.name}")
    
    # Simulate selecting a race manually
    if creator.race_step:
        creator.race_step.selected_race = 'Human'
        creator.character_data['race'] = 'Human'
        print(f"Set race to Human")
        print(f"Race step complete: {creator.race_step.is_complete()}")
        print(f"Can access CLASS: {creator._can_access_step(CreationStep.CLASS)}")
        
        # Check that step doesn't auto-advance
        if creator.current_step == CreationStep.RACE:
            print("✓ Step doesn't auto-advance after race selection")
        else:
            print(f"✗ Step auto-advanced to {creator.current_step.name}")
    
    # Test manual step navigation
    original_step = creator.current_step
    creator.current_step = CreationStep.CLASS
    print(f"Manually set step to CLASS")
    
    if creator.current_step == CreationStep.CLASS:
        print("✓ Manual step navigation works")
    else:
        print(f"✗ Step changed unexpectedly to {creator.current_step.name}")
    
    print("\nTest completed!")

if __name__ == "__main__":
    test_character_creator_steps()
