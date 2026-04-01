#!/usr/bin/env python3
"""
Class Step - Class selection step for character creation
"""

from imgui_bundle import imgui
from typing import Dict, List, Optional, Any
from .utils import CharacterCreatorUtils

from logger import setup_logger
logger = setup_logger(__name__)


class ClassStep:
    """Class selection step for character creation"""
    
    def __init__(self, character_data: Dict, compendium_data: Dict):
        self.character_data = character_data
        self.compendium_data = compendium_data
        self.selected_class = character_data.get('character_class', '')
        self.level = character_data.get('level', 1)
    
    def render(self) -> bool:
        """Render the class selection step. Returns True if step is complete."""
        imgui.text("Choose your character's class:")
        imgui.separator()
        
        # Class selection list
        imgui.begin_child("class_list", (300, 400), True)
        classes = self.compendium_data.get('classes', {})
        
        for class_id, class_data in classes.items():
            is_selected = class_id == self.selected_class
            class_display_name = class_data.get('name', class_id)
            
            clicked, _ = imgui.selectable(class_display_name, is_selected)
            if clicked:
                self.selected_class = class_id
                self.character_data['character_class'] = class_id
                logger.debug(f"Selected class: {class_id}")
            
            if is_selected:
                imgui.set_item_default_focus()
        
        imgui.end_child()
        
        # Class details
        imgui.same_line()
        imgui.begin_child("class_details", (400, 400), True)
        if self.selected_class and self.selected_class in self.compendium_data.get('classes', {}):
            self._render_class_details(self.compendium_data['classes'][self.selected_class])
        else:
            imgui.text("Select a class to see details")
        
        imgui.end_child()
        
        # Level selection
        imgui.spacing()
        imgui.text("Level:")
        imgui.same_line()
        imgui.set_next_item_width(100)
        changed, new_level = imgui.input_int("##level", self.level, 1, 1)
        if changed:
            self.level = max(1, min(20, new_level))
            self.character_data['level'] = self.level
        
        # Return True if a class is selected
        return bool(self.selected_class)
    
    def _render_class_details(self, class_data: Dict):
        """Render detailed information about the selected class"""
        imgui.text(f"Class: {class_data.get('name', 'Unknown')}")
        imgui.separator()
        
        # Description
        description = class_data.get('description', 'No description available')
        imgui.text_wrapped(description)
        imgui.separator()
        
        # Hit Die
        imgui.text(f"Hit Die: {class_data.get('hit_die', 'd8')}")
        
        # Primary Abilities
        primary = class_data.get('primary_ability', [])
        if primary:
            imgui.text(f"Primary Ability: {', '.join(primary)}")
        
        # Saving Throws
        saves = class_data.get('saving_throws', [])
        if saves:
            imgui.text(f"Saving Throw Proficiencies: {', '.join(saves)}")
        
        imgui.separator()
        
        # Skills
        skills = class_data.get('skills', [])
        skill_choices = class_data.get('skill_choices', 0)
        
        if skills:
            imgui.text(f"Skill Proficiencies (choose {skill_choices}):")
            for skill in skills[:8]:  # Show first 8 skills
                imgui.bullet_text(skill)
            if len(skills) > 8:
                imgui.text(f"... and {len(skills) - 8} more")
    
    def get_completion_status(self) -> str:
        """Get a string describing the completion status"""
        if self.selected_class:
            return f"Class: {self.selected_class} {self.level}"
        return "No class selected"
    
    def is_complete(self) -> bool:
        """Check if this step is complete"""
        return bool(self.selected_class)
