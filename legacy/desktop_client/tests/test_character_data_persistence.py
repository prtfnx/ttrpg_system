#!/usr/bin/env python3
"""
Test script to verify character data persistence between panel and window
"""

import sys
import os
sys.path.append(os.path.dirname(__file__))

from gui.panels.character_sheet_panel import CharacterSheetPanel
from gui.windows.character_sheet_window import CharacterSheetWindow
from core_table.Character import Character
from logger import setup_logger

logger = setup_logger(__name__)

def test_character_data_persistence():
    """Test that character data is properly saved between panel and window"""
    
    print("Testing character data persistence...")
    
    # Create character sheet panel (without actions bridge for this test)
    panel = CharacterSheetPanel()
    
    # Set some test data in the panel
    panel.character_name = "Test Hero"
    panel.class_level = "Fighter 5"
    panel.race = "Human"
    panel.background = "Soldier"
    panel.ability_scores["STR"] = 16
    panel.ability_scores["DEX"] = 14
    panel.current_hit_points = 45
    panel.hit_point_maximum = 50
    panel.armor_class = 18
    
    print(f"Panel data set: {panel.character_name}, {panel.class_level}")
    print(f"Panel HP: {panel.current_hit_points}/{panel.hit_point_maximum}")
    print(f"Panel AC: {panel.armor_class}")
    
    # Create a character object for the panel
    panel.character = Character(name="Test Hero")
    panel.selected_entity_id = "test_sprite"
    
    # Save panel data to character object
    panel.save_to_character_object()
    print(f"Saved to character object: {panel.character.name}")
    
    # Create character window and link to panel
    window = CharacterSheetWindow()
    window.set_parent_panel(panel)
    
    # Load data from panel to window
    window.load_from_panel(panel)
    
    print(f"Window data loaded: {window.character_name}, {window.class_level}")
    print(f"Window HP: {window.current_hit_points}/{window.hit_point_maximum}")
    print(f"Window AC: {window.armor_class}")
    
    # Modify data in window
    window.character_name = "Modified Hero"
    window.current_hit_points = 40
    window.armor_class = 19
    
    print(f"Window data modified: {window.character_name}")
    print(f"Window HP modified: {window.current_hit_points}")
    print(f"Window AC modified: {window.armor_class}")
    
    # Save window data back to panel
    window.save_to_panel()
    
    print(f"Panel after save: {panel.character_name}")
    print(f"Panel HP after save: {panel.current_hit_points}")
    print(f"Panel AC after save: {panel.armor_class}")
    
    # Verify data was saved correctly
    if panel.character_name == "Modified Hero":
        print("✅ Character name saved correctly")
    else:
        print(f"❌ Character name not saved: expected 'Modified Hero', got '{panel.character_name}'")
    
    if panel.current_hit_points == 40:
        print("✅ Hit points saved correctly")
    else:
        print(f"❌ Hit points not saved: expected 40, got {panel.current_hit_points}")
    
    if panel.armor_class == 19:
        print("✅ Armor class saved correctly")
    else:
        print(f"❌ Armor class not saved: expected 19, got {panel.armor_class}")
    
    print("\nTest completed!")

if __name__ == "__main__":
    test_character_data_persistence()
