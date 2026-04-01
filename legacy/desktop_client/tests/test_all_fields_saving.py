#!/usr/bin/env python3
"""
Test script to verify all character fields including death saves are saved correctly
"""
import sys
import os
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from core_table.compendiums.characters.character import Character, AbilityScore
from gui.panels.character_sheet_panel import CharacterSheetPanel
from gui.windows.character_sheet_window import CharacterSheetWindow

def test_comprehensive_character_saving():
    """Test that all character fields including death saves are saved correctly"""
    print("=== Testing Comprehensive Character Field Saving ===")
    
    # Create a Character object with death saves
    character = Character()
    character.name = "Test Hero"
    character.level = 3
    character.armor_class = 15
    character.hit_points = 10
    character.max_hit_points = 20
    character.temporary_hit_points = 5
    character.speed = 25
    character.initiative = 2
    character.inspiration = True
    character.hit_dice = "2d8"
    character.total_hit_dice = "3d8"
    character.death_save_successes = [True, False, True]
    character.death_save_failures = [False, True, False]
    character.ability_scores[AbilityScore.STRENGTH] = 16
    character.ability_scores[AbilityScore.DEXTERITY] = 14
    
    print(f"Initial Character: {character.name}")
    print(f"  AC: {character.armor_class}, HP: {character.hit_points}/{character.max_hit_points}")
    print(f"  Temp HP: {character.temporary_hit_points}, Speed: {character.speed}")
    print(f"  Initiative: {character.initiative}, Inspiration: {character.inspiration}")
    print(f"  Hit Dice: {character.hit_dice}/{character.total_hit_dice}")
    print(f"  Death Saves - Successes: {character.death_save_successes}")
    print(f"  Death Saves - Failures: {character.death_save_failures}")
    print(f"  STR: {character.ability_scores[AbilityScore.STRENGTH]}, DEX: {character.ability_scores[AbilityScore.DEXTERITY]}")
    
    # Create panel and load character
    panel = CharacterSheetPanel()
    panel.character = character
    panel._sync_panel_from_character()
    
    print(f"\nPanel loaded: {panel.character_name}")
    print(f"  AC: {panel.armor_class}, HP: {panel.current_hit_points}/{panel.hit_point_maximum}")
    print(f"  Temp HP: {panel.temporary_hit_points}, Speed: {panel.speed}")
    print(f"  Initiative: {panel.initiative}, Inspiration: {panel.inspiration}")
    print(f"  Hit Dice: {panel.hit_dice}/{panel.total_hit_dice}")
    print(f"  Death Saves - Successes: {panel.death_save_successes}")
    print(f"  Death Saves - Failures: {panel.death_save_failures}")
    print(f"  STR: {panel.ability_scores['STR']}, DEX: {panel.ability_scores['DEX']}")
    
    # Create window and load from panel
    window = CharacterSheetWindow()
    window.load_from_panel(panel)
    
    print(f"\nWindow loaded: {window.character_name}")
    print(f"  AC: {window.armor_class}, HP: {window.current_hit_points}/{window.hit_point_maximum}")
    print(f"  Temp HP: {window.temporary_hit_points}, Speed: {window.speed}")
    print(f"  Initiative: {window.initiative}, Inspiration: {window.inspiration}")
    print(f"  Hit Dice: {window.hit_dice}/{window.total_hit_dice}")
    print(f"  Death Saves - Successes: {window.death_save_successes}")
    print(f"  Death Saves - Failures: {window.death_save_failures}")
    print(f"  STR: {window.ability_scores['STR']}, DEX: {window.ability_scores['DEX']}")
    
    # Simulate user editing in window - modify ALL fields
    print("\n--- Simulating comprehensive user edits in window ---")
    window.character_name = "Modified Hero"
    window.armor_class = 18
    window.current_hit_points = 15
    window.hit_point_maximum = 25
    window.temporary_hit_points = 8
    window.speed = 30
    window.initiative = 4
    window.inspiration = False
    window.hit_dice = "1d8"
    window.total_hit_dice = "4d8"
    window.death_save_successes = [False, True, True]
    window.death_save_failures = [True, True, False]
    window.ability_scores["STR"] = 18
    window.ability_scores["DEX"] = 16
    
    # Save changes to Character object
    window.save_to_character()
    
    print(f"After window save - Character: {character.name}")
    print(f"  AC: {character.armor_class}, HP: {character.hit_points}/{character.max_hit_points}")
    print(f"  Temp HP: {getattr(character, 'temporary_hit_points', 'NOT SET')}")
    print(f"  Speed: {getattr(character, 'speed', 'NOT SET')}")
    print(f"  Initiative: {getattr(character, 'initiative', 'NOT SET')}")
    print(f"  Inspiration: {getattr(character, 'inspiration', 'NOT SET')}")
    print(f"  Hit Dice: {getattr(character, 'hit_dice', 'NOT SET')}/{getattr(character, 'total_hit_dice', 'NOT SET')}")
    print(f"  Death Saves - Successes: {getattr(character, 'death_save_successes', 'NOT SET')}")
    print(f"  Death Saves - Failures: {getattr(character, 'death_save_failures', 'NOT SET')}")
    print(f"  STR: {character.ability_scores[AbilityScore.STRENGTH]}, DEX: {character.ability_scores[AbilityScore.DEXTERITY]}")
    
    # Panel should sync from Character object
    panel._sync_panel_from_character()
    
    print(f"\nAfter panel sync - Panel: {panel.character_name}")
    print(f"  AC: {panel.armor_class}, HP: {panel.current_hit_points}/{panel.hit_point_maximum}")
    print(f"  Temp HP: {panel.temporary_hit_points}, Speed: {panel.speed}")
    print(f"  Initiative: {panel.initiative}, Inspiration: {panel.inspiration}")
    print(f"  Hit Dice: {panel.hit_dice}/{panel.total_hit_dice}")
    print(f"  Death Saves - Successes: {panel.death_save_successes}")
    print(f"  Death Saves - Failures: {panel.death_save_failures}")
    print(f"  STR: {panel.ability_scores['STR']}, DEX: {panel.ability_scores['DEX']}")
    
    # Verify all changes persisted
    print("\n--- Verification ---")
    errors = []
    
    # Basic fields
    if character.name != "Modified Hero": errors.append(f"Name: expected 'Modified Hero', got '{character.name}'")
    if character.armor_class != 18: errors.append(f"AC: expected 18, got {character.armor_class}")
    if character.hit_points != 15: errors.append(f"HP: expected 15, got {character.hit_points}")
    if character.max_hit_points != 25: errors.append(f"Max HP: expected 25, got {character.max_hit_points}")
    
    # Additional fields
    if getattr(character, 'temporary_hit_points', None) != 8: errors.append(f"Temp HP: expected 8, got {getattr(character, 'temporary_hit_points', 'NOT SET')}")
    if getattr(character, 'speed', None) != 30: errors.append(f"Speed: expected 30, got {getattr(character, 'speed', 'NOT SET')}")
    if getattr(character, 'initiative', None) != 4: errors.append(f"Initiative: expected 4, got {getattr(character, 'initiative', 'NOT SET')}")
    if getattr(character, 'inspiration', None) != False: errors.append(f"Inspiration: expected False, got {getattr(character, 'inspiration', 'NOT SET')}")
    if getattr(character, 'hit_dice', None) != "1d8": errors.append(f"Hit Dice: expected '1d8', got {getattr(character, 'hit_dice', 'NOT SET')}")
    if getattr(character, 'total_hit_dice', None) != "4d8": errors.append(f"Total Hit Dice: expected '4d8', got {getattr(character, 'total_hit_dice', 'NOT SET')}")
    
    # Death saves
    expected_successes = [False, True, True]
    expected_failures = [True, True, False]
    actual_successes = getattr(character, 'death_save_successes', None)
    actual_failures = getattr(character, 'death_save_failures', None)
    if actual_successes != expected_successes: errors.append(f"Death Save Successes: expected {expected_successes}, got {actual_successes}")
    if actual_failures != expected_failures: errors.append(f"Death Save Failures: expected {expected_failures}, got {actual_failures}")
    
    # Ability scores
    if character.ability_scores[AbilityScore.STRENGTH] != 18: errors.append(f"STR: expected 18, got {character.ability_scores[AbilityScore.STRENGTH]}")
    if character.ability_scores[AbilityScore.DEXTERITY] != 16: errors.append(f"DEX: expected 16, got {character.ability_scores[AbilityScore.DEXTERITY]}")
    
    # Panel sync verification
    if panel.character_name != "Modified Hero": errors.append(f"Panel name sync: expected 'Modified Hero', got '{panel.character_name}'")
    if panel.death_save_successes != expected_successes: errors.append(f"Panel death saves successes sync: expected {expected_successes}, got {panel.death_save_successes}")
    if panel.death_save_failures != expected_failures: errors.append(f"Panel death saves failures sync: expected {expected_failures}, got {panel.death_save_failures}")
    
    if errors:
        print("❌ Some fields failed to save:")
        for error in errors:
            print(f"  - {error}")
    else:
        print("✅ All comprehensive character saving tests passed!")
        print("✅ Window saves all fields correctly to Character object")
        print("✅ Panel syncs all fields correctly from Character object")
        print("✅ Death saves, combat stats, and ability scores all persist correctly")
        print("✅ Character object is the single source of truth for all data")

if __name__ == "__main__":
    test_comprehensive_character_saving()
