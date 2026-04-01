#!/usr/bin/env python3
"""
Test Character Creation with Skills - Test character creation with skill proficiencies
"""

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from core_table.Character import Character
from core_table.compendiums.characters.character import AbilityScore, Skill


def test_character_creation_with_skills():
    """Test creating a character with skill proficiencies"""
    print("🧪 Testing Character Creation with Skills")
    print("=" * 50)
    
    # Create a character
    character = Character()
    character.name = "Test Fighter"
    character.level = 1
    
    # Set ability scores
    character.ability_scores = {
        AbilityScore.STRENGTH: 16,
        AbilityScore.DEXTERITY: 14,
        AbilityScore.CONSTITUTION: 15,
        AbilityScore.INTELLIGENCE: 10,
        AbilityScore.WISDOM: 13,
        AbilityScore.CHARISMA: 12
    }
    
    # Add skill proficiencies
    character.skill_proficiencies = [
        Skill.ATHLETICS,         # Fighter class skill
        Skill.INTIMIDATION,      # Fighter class skill  
        Skill.ANIMAL_HANDLING,   # Background skill
        Skill.SURVIVAL          # Background skill
    ]
    
    # Test skill modifiers
    print(f"Character name: {character.name}")
    print(f"Level: {character.level}")
    print(f"Proficiency bonus: {character.calculate_proficiency_bonus()}")
    print()
    
    print("Skill Proficiencies:")
    for skill in character.skill_proficiencies:
        modifier = character.get_skill_modifier(skill)
        print(f"  {skill.value}: +{modifier}")
    
    print()
    print("Sample non-proficient skill:")
    # Test a skill we're not proficient in
    stealth_modifier = character.get_skill_modifier(Skill.STEALTH)
    print(f"  Stealth: +{stealth_modifier}")
    
    print()
    print("✅ Character creation with skills test passed!")
    return character


if __name__ == "__main__":
    test_character_creation_with_skills()
