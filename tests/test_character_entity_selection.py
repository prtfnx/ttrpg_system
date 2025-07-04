#!/usr/bin/env python3
"""
Test script to verify character panel entity selection and loading
"""

import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..'))

from typing import Optional

from gui.panels.character_sheet_panel import CharacterSheetPanel
from gui.gui_actions_bridge import GuiActionsBridge

class MockTable:
    def __init__(self):
        self.table_id = "test_table"

class MockContext:
    def __init__(self, actions):
        self.current_table = MockTable()
        self.Actions = actions
        self.character_sheet_panel: Optional[CharacterSheetPanel] = None

class MockActions:
    def __init__(self):
        self.test_sprite_data = {}
    
    def get_sprite_info(self, table_id, sprite_id):
        class MockResult:
            def __init__(self, success, data):
                self.success = success
                self.data = data
        
        if sprite_id in self.test_sprite_data:
            return MockResult(True, self.test_sprite_data[sprite_id])
        else:
            return MockResult(False, {})
    
    def set_test_sprite_data(self, sprite_id, data):
        """Helper to set test data"""
        self.test_sprite_data[sprite_id] = data

def test_character_panel_entity_selection():
    """Test that character panel loads data when entity is selected"""
    
    # Create mock objects
    actions = MockActions()
    context = MockContext(actions)
    
    # Create actions bridge and character panel
    actions_bridge = GuiActionsBridge(context)
    panel = CharacterSheetPanel(context=context, actions_bridge=actions_bridge)
    
    # Connect the panel to the context so actions bridge can find it
    context.character_sheet_panel = panel
    
    # Set up test character data
    test_character_data = {
        'name': 'Test Hero',
        'class_level': 'Fighter 5',
        'race': 'Human',
        'background': 'Soldier',
        'alignment': 'Lawful Good',
        'ability_scores': {
            'STR': 16,
            'DEX': 14,
            'CON': 15,
            'INT': 12,
            'WIS': 13,
            'CHA': 10
        },
        'combat_stats': {
            'armor_class': 18,
            'current_hit_points': 45,
            'hit_point_maximum': 52,
            'temporary_hit_points': 0
        }
    }
    
    # Set up test sprite with character data
    test_sprite_data = {
        'character_data': test_character_data,
        'position': {'x': 100, 'y': 100}
    }
    
    actions.set_test_sprite_data('test_sprite_123', test_sprite_data)
    
    # Verify initial state
    assert panel.character_name == "", "Should start with empty character name"
    assert panel.selected_entity_id is None, "Should start with no selected entity"
    
    # Test entity selection through actions bridge
    actions_bridge.on_entity_selected('test_sprite_123')
    
    # Verify the character data was loaded
    assert panel.character_name == 'Test Hero', f"Character name should be loaded, got: {panel.character_name}"
    assert panel.class_level == 'Fighter 5', f"Class level should be loaded, got: {panel.class_level}"
    assert panel.race == 'Human', f"Race should be loaded, got: {panel.race}"
    assert panel.armor_class == 18, f"AC should be loaded, got: {panel.armor_class}"
    assert panel.ability_scores['STR'] == 16, f"STR should be loaded, got: {panel.ability_scores['STR']}"
    assert panel.selected_entity_id == 'test_sprite_123', f"Entity ID should be set, got: {panel.selected_entity_id}"
    
    # Test selection change to entity without character data
    actions.set_test_sprite_data('test_sprite_456', {'position': {'x': 200, 'y': 200}})  # No character_data
    actions_bridge.on_entity_selected('test_sprite_456')
    
    # Character data should be cleared
    assert panel.character_name == "", f"Character name should be cleared, got: {panel.character_name}"
    assert panel.selected_entity_id == 'test_sprite_456', f"Entity ID should be updated, got: {panel.selected_entity_id}"
    
    # Test the render method entity checking
    panel.selected_entity_id = None  # Reset
    actions_bridge._selected_entity_id = 'test_sprite_123'  # Set in actions bridge
    
    # Call the entity check method
    panel._check_entity_selection()
    
    # Should have loaded the character again
    assert panel.character_name == 'Test Hero', f"Character should be reloaded on render check, got: {panel.character_name}"
    assert panel.selected_entity_id == 'test_sprite_123', f"Entity ID should be synced, got: {panel.selected_entity_id}"
    
    print("✓ Character panel entity selection test passed!")
    print("✓ Character data loads when entity with character_data is selected")
    print("✓ Character data clears when entity without character_data is selected") 
    print("✓ Entity selection checking in render works correctly")
    print("✓ Actions bridge correctly tracks and notifies about entity selection")
    
    return True

if __name__ == "__main__":
    test_character_panel_entity_selection()
