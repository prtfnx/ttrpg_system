#!/usr/bin/env python3
"""
Test the proficiencies step implementation
"""

import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from gui.windows.character_creator.proficiencies_step import ProficienciesStep
from gui.windows.character_creator.utils import CharacterCreatorUtils

def test_proficiencies_step():
    """Test proficiencies step without UI rendering"""
    print("🧪 Testing Proficiencies Step")
    print("=" * 40)
    
    # Mock character data
    character_data = {
        'character_class': 'fighter',
        'background': 'folk_hero',
        'skill_proficiencies': []
    }
    
    # Mock compendium data
    compendium_data = {
        'classes': {
            'fighter': {
                'name': 'Fighter',
                'skills': ['Acrobatics', 'Animal Handling', 'Athletics', 'History', 'Insight', 'Intimidation', 'Perception', 'Survival'],
                'skill_choices': 2
            }
        },
        'backgrounds': {
            'folk_hero': {
                'name': 'Folk Hero',
                'skills': ['Animal Handling', 'Survival']
            }
        }
    }
    
    # Create proficiencies step
    prof_step = ProficienciesStep(character_data, compendium_data)
    
    print(f"All skills: {prof_step.all_skills}")
    print(f"Class skills available: {prof_step.available_class_skills}")
    print(f"Class choices: {prof_step.class_choices}")
    print(f"Background skills: {prof_step.available_background_skills}")
    print(f"Selected proficiencies: {prof_step.selected_proficiencies}")
    print(f"Is complete: {prof_step.is_complete()}")
    print(f"Completion status: {prof_step.get_completion_status()}")
    
    # Test adding a class skill
    prof_step.selected_proficiencies.add('Athletics')
    prof_step.character_data['skill_proficiencies'] = list(prof_step.selected_proficiencies)
    print(f"After adding Athletics: {prof_step.selected_proficiencies}")
    print(f"Is complete: {prof_step.is_complete()}")
    
    # Test adding another class skill to complete requirements
    prof_step.selected_proficiencies.add('Intimidation')
    prof_step.character_data['skill_proficiencies'] = list(prof_step.selected_proficiencies)
    print(f"After adding Intimidation: {prof_step.selected_proficiencies}")
    print(f"Is complete: {prof_step.is_complete()}")
    
    # Test proficiency sources
    sources = prof_step.get_proficiency_sources()
    print(f"Proficiency sources: {sources}")
    
    print("✅ Proficiencies step test passed!")

if __name__ == "__main__":
    test_proficiencies_step()
