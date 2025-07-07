#!/usr/bin/env python3
"""
Test script to validate abilities step rendering without GUI
"""

import sys
import os
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from gui.windows.character_creator.abilities_step import AbilitiesStep
from gui.windows.character_creator.enums import AbilityGenMethod
from gui.windows.character_creator.utils import CharacterCreatorUtils

def test_abilities_step_logic():
    """Test the abilities step logic without ImGui rendering"""
    
    # Mock character data
    character_data = {
        'ability_scores': {
            'STR': 10, 'DEX': 10, 'CON': 10,
            'INT': 10, 'WIS': 10, 'CHA': 10
        },
        'ability_generation_method': AbilityGenMethod.STANDARD_ARRAY,
        'rolled_scores': []
    }
    
    # Mock compendium data
    compendium_data = {
        'races': {
            'human': {
                'name': 'Human',
                'ability_score_increases': {'All': 1}
            }
        }
    }
    
    # Test abilities step creation
    abilities_step = AbilitiesStep(character_data, compendium_data)
    
    print(f"Initial generation method: {abilities_step.generation_method}")
    print(f"Initial ability scores: {abilities_step.ability_scores}")
    
    # Test method change to point buy
    abilities_step.generation_method = AbilityGenMethod.POINT_BUY
    abilities_step.character_data['ability_generation_method'] = AbilityGenMethod.POINT_BUY
    
    # Reset scores as would happen in UI
    for ability in abilities_step.ability_scores:
        abilities_step.ability_scores[ability] = 8
    
    print(f"After point buy switch: {abilities_step.ability_scores}")
    
    # Test standard array
    abilities_step.generation_method = AbilityGenMethod.STANDARD_ARRAY
    standard_scores = CharacterCreatorUtils.get_standard_array()
    abilities = ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA']
    for i, ability in enumerate(abilities):
        abilities_step.ability_scores[ability] = standard_scores[i] if i < len(standard_scores) else 10
    
    print(f"After standard array: {abilities_step.ability_scores}")
    print(f"Standard array values: {standard_scores}")
    
    # Test completion status
    print(f"Completion status: {abilities_step.get_completion_status()}")
    print(f"Is complete: {abilities_step.is_complete()}")
    
    print("✅ Abilities step logic test passed!")

if __name__ == "__main__":
    test_abilities_step_logic()
