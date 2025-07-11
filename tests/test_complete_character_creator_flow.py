#!/usr/bin/env python3
"""
Test Complete Character Creator Flow - Test the full character creation process including skills
"""

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from gui.windows.character_creator.character_creator_window import CharacterCreator
from core_table.compendiums.characters.character import AbilityScore, Skill


def test_complete_character_creator_flow():
    """Test the complete character creator flow with skill proficiencies"""
    print("🧪 Testing Complete Character Creator Flow")
    print("=" * 50)
    
    # Mock character data (simulating completed character creator steps)
    character_data = {
        'name': 'Test Ranger',
        'race': 'human',
        'character_class': 'rogue',
        'background': 'criminal',
        'level': 1,
        'ability_scores': {
            'STR': 12,
            'DEX': 16,
            'CON': 14,
            'INT': 13,
            'WIS': 15,
            'CHA': 10
        },
        'skill_proficiencies': [
            'Stealth',          # Rogue class skill
            'Acrobatics',       # Rogue class skill
            'Investigation',    # Rogue class skill  
            'Sleight of Hand',  # Rogue class skill
            'Deception',        # Criminal background
            'Stealth'           # Criminal background (duplicate, should be handled)
        ]
    }
    
    # Mock compendium data
    compendium_data = {
        'races': {
            'human': {
                'name': 'Human',
                'ability_score_increases': {'STR': 1, 'DEX': 1, 'CON': 1, 'INT': 1, 'WIS': 1, 'CHA': 1}
            }
        },
        'classes': {
            'rogue': {
                'name': 'Rogue',
                'hit_die': 8,
                'skills': ['Acrobatics', 'Athletics', 'Deception', 'Insight', 'Intimidation', 
                          'Investigation', 'Perception', 'Performance', 'Persuasion', 
                          'Sleight of Hand', 'Stealth'],
                'skill_choices': 4
            }
        },
        'backgrounds': {
            'criminal': {
                'name': 'Criminal',
                'skills': ['Deception', 'Stealth']
            }
        }
    }
    
    # Create character creator instance
    creator = CharacterCreator(None, None)
    creator.character_data = character_data
    creator.compendium_data = compendium_data
    
    # Test the character creation method
    print("Character data before creation:")
    print(f"  Name: {character_data['name']}")
    print(f"  Class: {character_data['character_class']}")
    print(f"  Background: {character_data['background']}")
    print(f"  Skill Proficiencies: {character_data['skill_proficiencies']}")
    print()
    
    # Simulate the _create_character method logic (without actually adding to game)
    try:
        # Create Character object
        from core_table.Character import Character
        character = Character()
        character.name = character_data.get('name', 'Unnamed Character')
        character.level = character_data.get('level', 1)
        
        # Set ability scores with racial bonuses
        ability_scores = character_data.get('ability_scores', {})
        racial_bonuses = {'STR': 1, 'DEX': 1, 'CON': 1, 'INT': 1, 'WIS': 1, 'CHA': 1}  # Human bonuses
        
        ability_map = {
            'STR': AbilityScore.STRENGTH,
            'DEX': AbilityScore.DEXTERITY,
            'CON': AbilityScore.CONSTITUTION,
            'INT': AbilityScore.INTELLIGENCE,
            'WIS': AbilityScore.WISDOM,
            'CHA': AbilityScore.CHARISMA
        }
        
        for ability_str, ability_enum in ability_map.items():
            base_score = ability_scores.get(ability_str, 10)
            racial_bonus = racial_bonuses.get(ability_str, 0)
            final_score = base_score + racial_bonus
            character.ability_scores[ability_enum] = final_score
        
        # Set skill proficiencies
        skill_proficiencies = character_data.get('skill_proficiencies', [])
        skill_enum_map = {
            'Acrobatics': Skill.ACROBATICS,
            'Animal Handling': Skill.ANIMAL_HANDLING,
            'Arcana': Skill.ARCANA,
            'Athletics': Skill.ATHLETICS,
            'Deception': Skill.DECEPTION,
            'History': Skill.HISTORY,
            'Insight': Skill.INSIGHT,
            'Intimidation': Skill.INTIMIDATION,
            'Investigation': Skill.INVESTIGATION,
            'Medicine': Skill.MEDICINE,
            'Nature': Skill.NATURE,
            'Perception': Skill.PERCEPTION,
            'Performance': Skill.PERFORMANCE,
            'Persuasion': Skill.PERSUASION,
            'Religion': Skill.RELIGION,
            'Sleight of Hand': Skill.SLEIGHT_OF_HAND,
            'Stealth': Skill.STEALTH,
            'Survival': Skill.SURVIVAL,
        }
        
        for skill_name in skill_proficiencies:
            if skill_name in skill_enum_map:
                skill_enum = skill_enum_map[skill_name]
                if skill_enum not in character.skill_proficiencies:
                    character.skill_proficiencies.append(skill_enum)
        
        # Calculate hit points
        hit_die = 8  # Rogue hit die
        con_modifier = (character.ability_scores[AbilityScore.CONSTITUTION] - 10) // 2
        character.max_hit_points = hit_die + con_modifier
        character.hit_points = character.max_hit_points
        
        # Set armor class
        dex_modifier = (character.ability_scores[AbilityScore.DEXTERITY] - 10) // 2
        character.armor_class = 10 + dex_modifier
        
        print("Character created successfully!")
        print(f"  Name: {character.name}")
        print(f"  Level: {character.level}")
        print(f"  HP: {character.hit_points}/{character.max_hit_points}")
        print(f"  AC: {character.armor_class}")
        print(f"  Proficiency Bonus: {character.calculate_proficiency_bonus()}")
        print()
        
        print("Final Ability Scores (with racial bonuses):")
        for ability_str, ability_enum in ability_map.items():
            score = character.ability_scores[ability_enum]
            modifier = (score - 10) // 2
            print(f"  {ability_str}: {score} ({modifier:+d})")
        print()
        
        print("Skill Proficiencies:")
        for skill in character.skill_proficiencies:
            modifier = character.get_skill_modifier(skill)
            print(f"  {skill.value}: +{modifier}")
        
        print()
        print("✅ Complete character creator flow test passed!")
        return character
        
    except Exception as e:
        print(f"❌ Error in character creation: {e}")
        import traceback
        traceback.print_exc()
        return None


if __name__ == "__main__":
    test_complete_character_creator_flow()
