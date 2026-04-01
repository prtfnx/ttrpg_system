#!/usr/bin/env python3
"""
Test script to verify navigation button logic fix
"""

import sys
import os
sys.path.append(os.path.dirname(__file__))

from gui.windows.character_creator import CharacterCreator
from gui.windows.character_creator.enums import CreationStep
from CompendiumManager import CompendiumManager

class MockContext:
    def __init__(self):
        self.CompendiumManager = CompendiumManager()
        # Load character data
        self.CompendiumManager.load_characters()

def test_navigation_fix():
    """Test the fixed navigation button logic"""
    # Create a character creator instance with mocked context
    context = MockContext()
    creator = CharacterCreator(context=context)
    
    print("=== Testing Fixed Navigation Logic ===")
    
    # Test 1: Start at RACE step, select a race, try to go forward
    print(f"\n1. Starting at step: {creator.current_step.name}")
    print(f"   Race selected: {creator.character_data['race'] is not None}")
    
    # Select a race
    if creator.races:
        first_race_id = list(creator.races.keys())[0]
        first_race_data = creator.races[first_race_id]
        
        creator.selected_race_id = first_race_id
        creator.character_data['race'] = first_race_data
        print(f"   Selected race: {first_race_data.get('name', 'Unknown')}")
        
        # Test navigation conditions
        next_step_value = creator.current_step.value + 1
        can_go_forward = (next_step_value < len(CreationStep) and 
                         creator._can_access_step(CreationStep(next_step_value)))
        print(f"   Can go forward: {can_go_forward}")
        
        # Simulate clicking "Next" button
        if can_go_forward:
            print("   Simulating 'Next' button click...")
            creator.current_step = CreationStep(next_step_value)
            print(f"   New step: {creator.current_step.name}")
        else:
            print("   Cannot go forward!")
    
    # Test 2: Now at CLASS step, select a class, try to go forward
    print(f"\n2. Current step: {creator.current_step.name}")
    print(f"   Class selected: {creator.character_data['class'] is not None}")
    
    # Select a class
    if creator.classes:
        first_class_id = list(creator.classes.keys())[0]
        first_class_data = creator.classes[first_class_id]
        
        creator.selected_class_id = first_class_id
        creator.character_data['class'] = first_class_data
        print(f"   Selected class: {first_class_data.get('name', 'Unknown')}")
        
        # Test navigation conditions
        next_step_value = creator.current_step.value + 1
        can_go_forward = (next_step_value < len(CreationStep) and 
                         creator._can_access_step(CreationStep(next_step_value)))
        print(f"   Can go forward: {can_go_forward}")
        
        # Simulate clicking "Next" button
        if can_go_forward:
            print("   Simulating 'Next' button click...")
            creator.current_step = CreationStep(next_step_value)
            print(f"   New step: {creator.current_step.name}")
        else:
            print("   Cannot go forward!")
    
    # Test 3: Test all step access now
    print(f"\n3. Final step access test:")
    for step in CreationStep:
        can_access = creator._can_access_step(step)
        print(f"   Can access {step.name}: {can_access}")
    
    print("\n=== Navigation Test Complete ===")

if __name__ == "__main__":
    test_navigation_fix()
