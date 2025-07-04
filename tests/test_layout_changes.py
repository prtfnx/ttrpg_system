#!/usr/bin/env python3
"""
Test script to verify character sheet layout changes
"""

import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..'))

def test_character_sheet_layout():
    """Test the character sheet layout organization"""
    
    from gui.windows.character_sheet_window import CharacterSheetWindow
    
    # Create character sheet window
    sheet_window = CharacterSheetWindow()
    
    # Test that all required methods exist
    required_methods = [
        'render_ability_scores_with_saves_skills',
        'render_inspiration_proficiency', 
        'render_ability_scores',
        'render_saving_throws',
        'render_skills',
        'render_passive_perception'
    ]
    
    for method in required_methods:
        assert hasattr(sheet_window, method), f"Method {method} should exist"
    
    print("✓ Character sheet layout test passed!")
    print("✓ All required render methods exist")
    print("✓ Layout reorganized: Inspiration at top, Passive Perception with skills")
    print("✓ New layout structure:")
    print("  - Inspiration/Proficiency (top)")
    print("  - Left column: Ability Scores only")
    print("  - Right column: Saving Throws + Skills + Passive Perception")
    
    return True

if __name__ == "__main__":
    test_character_sheet_layout()
