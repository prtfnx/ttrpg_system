#!/usr/bin/env python3
"""
Background Step - Background selection step for character creation
"""

from imgui_bundle import imgui
from typing import Dict, List, Optional, Any
from .utils import CharacterCreatorUtils

from logger import setup_logger
logger = setup_logger(__name__)


class BackgroundStep:
    """Background selection step for character creation"""
    
    def __init__(self, character_data: Dict, compendium_data: Dict):
        self.character_data = character_data
        self.compendium_data = compendium_data
        self.selected_background = character_data.get('background', '')
    
    def render(self) -> bool:
        """Render the background selection step. Returns True if step is complete."""
        imgui.text("Choose your character's background:")
        imgui.separator()
        
        # Background selection list
        imgui.begin_child("background_list", (300, 400), True)
        backgrounds = self.compendium_data.get('backgrounds', {})
        
        for bg_id, bg_data in backgrounds.items():
            is_selected = bg_id == self.selected_background
            bg_display_name = bg_data.get('name', bg_id)
            
            clicked, _ = imgui.selectable(bg_display_name, is_selected)
            if clicked:
                self.selected_background = bg_id
                self.character_data['background'] = bg_id
                logger.debug(f"Selected background: {bg_id}")
            
            if is_selected:
                imgui.set_item_default_focus()
        
        imgui.end_child()
        
        # Background details
        imgui.same_line()
        imgui.begin_child("background_details", (400, 400), True)
        if self.selected_background and self.selected_background in self.compendium_data.get('backgrounds', {}):
            self._render_background_details(self.compendium_data['backgrounds'][self.selected_background])
        else:
            imgui.text("Select a background to see details")
        
        imgui.end_child()
        
        # Return True if a background is selected
        return bool(self.selected_background)
    
    def _render_background_details(self, bg_data: Dict):
        """Render detailed information about the selected background"""
        imgui.text(f"Background: {bg_data.get('name', 'Unknown')}")
        imgui.separator()
        
        # Description
        description = bg_data.get('description', 'No description available')
        imgui.text_wrapped(description)
        imgui.separator()
        
        # Skill Proficiencies
        skills = bg_data.get('skills', [])
        if skills:
            imgui.text("Skill Proficiencies:")
            for skill in skills:
                imgui.bullet_text(skill)
            imgui.separator()
        
        # Tool Proficiencies
        tools = bg_data.get('tools', [])
        if tools:
            imgui.text("Tool Proficiencies:")
            for tool in tools:
                imgui.bullet_text(tool)
            imgui.separator()
        
        # Languages
        languages = bg_data.get('languages', 0)
        if languages:
            imgui.text(f"Languages: {languages} additional language(s)")
            imgui.separator()
        
        # Equipment
        equipment = bg_data.get('equipment', [])
        if equipment:
            imgui.text("Equipment:")
            for item in equipment:
                imgui.bullet_text(item)
    
    def get_completion_status(self) -> str:
        """Get a string describing the completion status"""
        if self.selected_background:
            return f"Background: {self.selected_background}"
        return "No background selected"
    
    def is_complete(self) -> bool:
        """Check if this step is complete"""
        return bool(self.selected_background)
