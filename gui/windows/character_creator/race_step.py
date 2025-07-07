#!/usr/bin/env python3
"""
Race Step - Race selection step for character creation
"""

from imgui_bundle import imgui
from typing import Dict, List, Optional, Any
from .utils import CharacterCreatorUtils

from logger import setup_logger
logger = setup_logger(__name__)


class RaceStep:
    """Race selection step for character creation"""
    
    def __init__(self, character_data: Dict, compendium_data: Dict):
        self.character_data = character_data
        self.compendium_data = compendium_data
        self.selected_race = character_data.get('race', '')
    
    def render(self) -> bool:
        """Render the race selection step. Returns True if step is complete."""
        imgui.text("Choose your character's race:")
        imgui.separator()
        
        # Race selection list
        imgui.begin_child("race_list", (300, 400), True)
        races = self.compendium_data.get('races', {})
        
        for race_id, race_data in races.items():
            is_selected = race_id == self.selected_race
            race_display_name = race_data.get('name', race_id)
            
            clicked, _ = imgui.selectable(race_display_name, is_selected)
            if clicked:
                self.selected_race = race_id
                self.character_data['race'] = race_id
                logger.debug(f"Selected race: {race_id}")
            
            if is_selected:
                imgui.set_item_default_focus()
        
        imgui.end_child()
        
        # Race details
        imgui.same_line()
        imgui.begin_child("race_details", (400, 400), True)
        if self.selected_race and self.selected_race in self.compendium_data.get('races', {}):
            self._render_race_details(self.compendium_data['races'][self.selected_race])
        else:
            imgui.text("Select a race to see details")
        
        imgui.end_child()
        
        # Return True if a race is selected
        return bool(self.selected_race)
    
    def _render_race_details(self, race_data: Dict):
        """Render detailed information about the selected race"""
        imgui.text(f"Race: {race_data.get('name', 'Unknown')}")
        imgui.separator()
        
        # Description
        description = race_data.get('description', 'No description available')
        imgui.text_wrapped(description)
        imgui.separator()
        
        # Size and Speed
        imgui.text(f"Size: {race_data.get('size', 'Medium')}")
        imgui.text(f"Speed: {race_data.get('speed', 30)} feet")
        imgui.separator()
        
        # Ability Score Increases
        imgui.text("Ability Score Increases:")
        asi = race_data.get('ability_score_increases', {})
        for ability, increase in asi.items():
            if ability == "All":
                imgui.text(f"  All abilities: +{increase}")
            else:
                imgui.text(f"  {ability}: +{increase}")
        
        imgui.separator()
        
        # Traits
        traits = race_data.get('traits', [])
        if traits:
            imgui.text("Racial Traits:")
            for trait in traits:
                if isinstance(trait, dict):
                    trait_name = trait.get('name', 'Unknown Trait')
                    imgui.bullet_text(trait_name)
                else:
                    imgui.bullet_text(str(trait))
    
    def get_completion_status(self) -> str:
        """Get a string describing the completion status"""
        if self.selected_race:
            race_data = self.compendium_data.get('races', {}).get(self.selected_race, {})
            race_name = race_data.get('name', self.selected_race)
            return f"Race: {race_name}"
        return "No race selected"
    
    def is_complete(self) -> bool:
        """Check if this step is complete"""
        return bool(self.selected_race)
