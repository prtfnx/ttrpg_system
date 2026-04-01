#!/usr/bin/env python3
"""
Overview Step - Final overview and character creation step
"""

from imgui_bundle import imgui
from typing import Dict, List, Optional, Any, Tuple
from .utils import CharacterCreatorUtils

from logger import setup_logger
logger = setup_logger(__name__)


class OverviewStep:
    """Final overview and character creation step"""
    
    def __init__(self, character_data: Dict, compendium_data: Dict):
        self.character_data = character_data
        self.compendium_data = compendium_data
        
        # Initialize character name if not present
        if 'name' not in self.character_data:
            self.character_data['name'] = ""
        
        self.character_name = self.character_data['name']
    
    def render(self) -> Tuple[bool, bool]:
        """Render the overview step. Returns (is_complete, should_create_character)."""
        imgui.text("Character Overview:")
        imgui.separator()
        
        # Character name
        imgui.text("Character Name:")
        imgui.same_line()
        imgui.set_next_item_width(200)
        changed, new_name = imgui.input_text("##char_name", self.character_name)
        if changed:
            self.character_name = new_name
            self.character_data['name'] = new_name
        
        imgui.separator()
        
        # Character summary
        self._render_character_summary()
        
        imgui.separator()
        
        # Action buttons
        create_character = False
        if imgui.button("Create Character", (150, 40)):
            if self.character_name.strip():
                create_character = True
            else:
                logger.warning("Character name is required")
        
        imgui.same_line()
        if imgui.button("Cancel", (100, 40)):
            # This will be handled by the main window
            pass
        
        # Show validation errors
        if not self.character_name.strip():
            imgui.text_colored((1.0, 0.0, 0.0, 1.0), "Character name is required!")
        
        is_complete = bool(self.character_name.strip())
        return is_complete, create_character
    
    def _render_character_summary(self):
        """Render a summary of the character being created"""
        # Basic info
        race = self.character_data.get('race', 'None')
        character_class = self.character_data.get('character_class', 'None')
        level = self.character_data.get('level', 1)
        background = self.character_data.get('background', 'None')
        
        imgui.text(f"Race: {race}")
        imgui.text(f"Class: {character_class} (Level {level})")
        imgui.text(f"Background: {background}")
        
        imgui.separator()
        
        # Ability scores
        imgui.text("Ability Scores:")
        ability_scores = self.character_data.get('ability_scores', {})
        
        # Get racial bonuses
        racial_bonuses = self._get_racial_bonuses()
        
        abilities = ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA']
        ability_names = ['Strength', 'Dexterity', 'Constitution', 'Intelligence', 'Wisdom', 'Charisma']
        
        for ability, full_name in zip(abilities, ability_names):
            base_score = ability_scores.get(ability, 10)
            racial_bonus = racial_bonuses.get(ability, 0)
            final_score = base_score + racial_bonus
            modifier = CharacterCreatorUtils.calculate_modifier(final_score)
            modifier_text = CharacterCreatorUtils.format_modifier(modifier)
            
            bonus_text = f" (+{racial_bonus})" if racial_bonus > 0 else ""
            imgui.text(f"  {ability}: {base_score}{bonus_text} = {final_score} ({modifier_text})")
        
        imgui.separator()
        
        # Derived stats
        self._render_derived_stats()
    
    def _get_racial_bonuses(self) -> Dict[str, int]:
        """Get racial ability score bonuses"""
        racial_bonuses = {}
        race_name = self.character_data.get('race', '')
        
        if race_name and race_name in self.compendium_data.get('races', {}):
            race_data = self.compendium_data['races'][race_name]
            asi = race_data.get('ability_score_increases', {})
            
            for ability, bonus in asi.items():
                if ability == "All":
                    for ab in ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA']:
                        racial_bonuses[ab] = racial_bonuses.get(ab, 0) + bonus
                else:
                    racial_bonuses[ability] = racial_bonuses.get(ability, 0) + bonus
        
        return racial_bonuses
    
    def _render_derived_stats(self):
        """Render derived character statistics"""
        # Calculate derived stats
        ability_scores = self.character_data.get('ability_scores', {})
        racial_bonuses = self._get_racial_bonuses()
        level = self.character_data.get('level', 1)
        
        # Final ability scores
        final_scores = {}
        for ability in ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA']:
            base = ability_scores.get(ability, 10)
            bonus = racial_bonuses.get(ability, 0)
            final_scores[ability] = base + bonus
        
        # Hit Points
        character_class = self.character_data.get('character_class', '')
        hit_die = 8  # Default
        if character_class and character_class in self.compendium_data.get('classes', {}):
            class_data = self.compendium_data['classes'][character_class]
            hit_die_value = class_data.get('hit_die', 8)
            # Handle both integer and string formats
            if isinstance(hit_die_value, str):
                hit_die = int(hit_die_value[1:]) if hit_die_value.startswith('d') else 8
            else:
                hit_die = int(hit_die_value) if hit_die_value else 8
        
        con_modifier = CharacterCreatorUtils.calculate_modifier(final_scores.get('CON', 10))
        max_hp = hit_die + con_modifier
        
        # Armor Class (base 10 + DEX modifier)
        dex_modifier = CharacterCreatorUtils.calculate_modifier(final_scores.get('DEX', 10))
        base_ac = 10 + dex_modifier
        
        # Proficiency bonus
        prof_bonus = CharacterCreatorUtils.get_proficiency_bonus(level)
        
        imgui.text("Derived Stats:")
        imgui.text(f"  Hit Points: {max_hp}")
        imgui.text(f"  Armor Class: {base_ac} (base)")
        imgui.text(f"  Proficiency Bonus: +{prof_bonus}")
        
        # Initiative
        imgui.text(f"  Initiative: {CharacterCreatorUtils.format_modifier(dex_modifier)}")
    
    def get_completion_status(self) -> str:
        """Get a string describing the completion status"""
        if self.character_name.strip():
            return f"Ready to create: {self.character_name}"
        return "Enter character name to complete"
    
    def is_complete(self) -> bool:
        """Check if this step is complete"""
        return bool(self.character_name.strip())
