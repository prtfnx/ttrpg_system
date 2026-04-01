#!/usr/bin/env python3
"""
Proficiencies Step - Skill proficiency selection step for character creation
"""

from imgui_bundle import imgui
from typing import Dict, List, Optional, Any, Set
from .utils import CharacterCreatorUtils

from logger import setup_logger
logger = setup_logger(__name__)


class ProficienciesStep:
    """Skill proficiency selection step for character creation"""
    
    def __init__(self, character_data: Dict, compendium_data: Dict):
        self.character_data = character_data
        self.compendium_data = compendium_data
        
        # All available D&D 5e skills
        self.all_skills = CharacterCreatorUtils.get_all_skills()
        self.skill_abilities = CharacterCreatorUtils.get_skill_ability_mapping()
        
        # Initialize selected proficiencies if not present
        if 'skill_proficiencies' not in self.character_data:
            self.character_data['skill_proficiencies'] = []
        
        self.selected_proficiencies = set(self.character_data['skill_proficiencies'])
        
        # Track available choices from class and background
        self.class_choices = 0
        self.background_choices = 0
        self.available_class_skills = []
        self.available_background_skills = []
        
        # Track if we need to update proficiencies
        self.last_class = ""
        self.last_background = ""
    
    def update_available_proficiencies(self):
        """Update available proficiencies when entering this step"""
        selected_class = self.character_data.get('character_class', '')
        selected_background = self.character_data.get('background', '')
        
        # Check if class or background changed
        class_changed = selected_class != self.last_class
        background_changed = selected_background != self.last_background
        
        if class_changed or background_changed:
            logger.debug(f"Updating proficiencies - Class: {selected_class}, Background: {selected_background}")
            
            # Clear old selections when class/background changes
            if class_changed:
                # Remove old class-based selections
                for skill in list(self.selected_proficiencies):
                    if skill in self.available_class_skills and skill not in self.available_background_skills:
                        self.selected_proficiencies.discard(skill)
                        
            if background_changed:
                # Remove old background-based selections
                for skill in list(self.selected_proficiencies):
                    if skill in self.available_background_skills:
                        self.selected_proficiencies.discard(skill)
            
            # Update available skills
            self._analyze_available_proficiencies()
            
            # Update tracking
            self.last_class = selected_class
            self.last_background = selected_background
    
    def _analyze_available_proficiencies(self):
        """Analyze available skill proficiencies from class and background"""
        # Get class proficiencies
        selected_class = self.character_data.get('character_class', '')
        if selected_class and selected_class in self.compendium_data.get('classes', {}):
            class_data = self.compendium_data['classes'][selected_class]
            
            # Get available class skills and number of choices
            self.available_class_skills = class_data.get('skill_proficiencies', [])
            self.class_choices = class_data.get('num_skills', 0)

        # Get background proficiencies (these are automatically granted)
        selected_background = self.character_data.get('background', '')
        if selected_background and selected_background in self.compendium_data.get('backgrounds', {}):
            background_data = self.compendium_data['backgrounds'][selected_background]
            
            # Background skills are automatically granted (no choice)
            self.available_background_skills = background_data.get('skill_proficiencies', [])
            
            # Automatically add background skills to selected proficiencies
            for skill in self.available_background_skills:
                self.selected_proficiencies.add(skill)
        
        # Update character data
        self.character_data['skill_proficiencies'] = list(self.selected_proficiencies)
        
        logger.debug(f"Class skills available: {self.available_class_skills}")
        logger.debug(f"Class choices: {self.class_choices}")
        logger.debug(f"Background skills (automatic): {self.available_background_skills}")
        logger.debug(f"Total selected proficiencies: {list(self.selected_proficiencies)}")
    
    def update_available_proficiencies_on_step_change(self):
        """Update available proficiencies when class/background changes - called by character creator"""
        self._analyze_available_proficiencies()
        logger.debug("Updated available proficiencies after step change")
    
    def render(self) -> bool:
        """Render the proficiencies selection step. Returns True if step is complete."""
        imgui.text("Character Proficiencies:")
        imgui.separator()
        
        # Check if class and background are selected
        selected_class = self.character_data.get('character_class', '')
        selected_background = self.character_data.get('background', '')
        selected_race = self.character_data.get('race', '')
        
        if not selected_class:
            imgui.text_colored((0.8, 0.8, 0.0, 1.0), "⚠ Please select a class in the previous step first")
            return False
        
        if not selected_background:
            imgui.text_colored((0.8, 0.8, 0.0, 1.0), "⚠ Please select a background in the previous step first")
            return False
        
        # Show fixed proficiencies (informational)
        self._render_fixed_proficiencies(selected_class, selected_background, selected_race)
        
        imgui.separator()
        
        # Show skill selection section
        self._render_skill_selection_section()
        
        return self.is_complete()
    
    def _render_fixed_proficiencies(self, selected_class: str, selected_background: str, selected_race: str):
        """Render fixed proficiencies that are automatically granted (informational only)"""
        imgui.text_colored((0.0, 0.8, 0.0, 1.0), "Fixed Proficiencies (automatically granted):")
        
        # Armor proficiencies from class
        if selected_class and selected_class in self.compendium_data.get('classes', {}):
            class_data = self.compendium_data['classes'][selected_class]
            armor_profs = class_data.get('armor_proficiencies', [])
            if armor_profs:
                imgui.text("Armor Proficiencies (Class):")
                for armor in armor_profs:
                    imgui.bullet_text(armor)
        
        # Weapon proficiencies from class
        if selected_class and selected_class in self.compendium_data.get('classes', {}):
            class_data = self.compendium_data['classes'][selected_class]
            weapon_profs = class_data.get('weapon_proficiencies', [])
            if weapon_profs:
                imgui.text("Weapon Proficiencies (Class):")
                for weapon in weapon_profs:
                    imgui.bullet_text(weapon)
        
        # Tool proficiencies from background
        if selected_background and selected_background in self.compendium_data.get('backgrounds', {}):
            background_data = self.compendium_data['backgrounds'][selected_background]
            tool_profs = background_data.get('tool_proficiencies', [])
            if tool_profs:
                imgui.text("Tool Proficiencies (Background):")
                for tool in tool_profs:
                    imgui.bullet_text(tool)
        
        # Proficiencies from race
        if selected_race and selected_race in self.compendium_data.get('races', {}):
            race_data = self.compendium_data['races'][selected_race]
            race_profs = race_data.get('proficiencies', [])
            if race_profs:
                imgui.text("Proficiencies (Race):")
                for prof in race_profs:
                    imgui.bullet_text(prof)
    
    def _render_skill_selection_section(self):
        """Render the skill selection section with class skills"""
        imgui.text_colored((0.0, 0.6, 0.8, 1.0), "Skill Proficiencies Selection:")
        
        # Get available skills
        class_skills = self.available_class_skills
        background_skills = self.available_background_skills
        
        # Show automatic background skills first
        if background_skills:
            imgui.text_colored((0.0, 0.8, 0.0, 1.0), "Background Skills (automatically granted):")
            for skill in sorted(background_skills):
                ability = self.skill_abilities.get(skill, "???")
                imgui.bullet_text(f"✓ {skill} ({ability})")
            imgui.separator()
        
        # Show class skills available for selection
        if class_skills:
            imgui.text("Class Skills Available for Selection:")
            imgui.text_colored((0.8, 0.8, 0.0, 1.0), f"(Choose {self.class_choices} from the following)")
            for skill in sorted(class_skills):
                ability = self.skill_abilities.get(skill, "???")
                imgui.bullet_text(f"{skill} ({ability})")
            imgui.separator()
        
        # Debug info for troubleshooting
        if class_skills and self.class_choices == 0:
            imgui.text_colored((0.8, 0.0, 0.0, 1.0), f"⚠ WARNING: Class has {len(class_skills)} available skills but num_skills=0")
            imgui.text_colored((0.8, 0.0, 0.0, 1.0), "This may be a data error in the compendium.")
        
        # Show selection comboboxes for class skills only
        if self.class_choices > 0:
            self._render_skill_selection_comboboxes()
        else:
            imgui.text_colored((0.0, 0.8, 0.0, 1.0), "✓ No class skill choices required (or num_skills=0)")
    
    def _render_skill_selection_comboboxes(self):
        """Render comboboxes for class skill selection only"""
        # Only show class skills for selection (background skills are automatic)
        available_skills = self.available_class_skills
        
        if not available_skills:
            imgui.text("No class skills available for selection")
            return
        
        imgui.text(f"Choose {self.class_choices} class skill proficiencies:")
        
        # Get current CLASS skill selections (exclude background skills)
        class_skill_selections = [skill for skill in self.selected_proficiencies 
                                if skill in self.available_class_skills]
        
        # Ensure we have enough slots
        while len(class_skill_selections) < self.class_choices:
            class_skill_selections.append("")
        
        # Track if any changes were made
        changed = False
        new_selections = []
        
        for i in range(self.class_choices):
            current_selection = class_skill_selections[i] if i < len(class_skill_selections) else ""
            
            imgui.text(f"Class Choice {i + 1}:")
            imgui.same_line()
            imgui.set_next_item_width(250)
            
            if imgui.begin_combo(f"##class_skill_choice_{i}", current_selection or "Select a skill..."):
                # Empty option
                clicked, _ = imgui.selectable("(None)", current_selection == "")
                if clicked:
                    new_selections.append("")
                    changed = True
                
                # Available class skills only
                for skill in sorted(available_skills):
                    # Don't show skills that are already selected in other comboboxes
                    if skill in new_selections:
                        continue
                    
                    # Show skill with ability
                    ability = self.skill_abilities.get(skill, "???")
                    display_name = f"{skill} ({ability})"
                    is_selected = skill == current_selection
                    clicked, _ = imgui.selectable(display_name, is_selected)
                    
                    if clicked:
                        new_selections.append(skill)
                        changed = True
                    
                    if is_selected:
                        imgui.set_item_default_focus()
                
                imgui.end_combo()
            else:
                new_selections.append(current_selection)
        
        # Apply changes if any were made
        if changed:
            # Keep background skills and update class skill selections
            self.selected_proficiencies.clear()
            
            # Re-add background skills (automatic)
            for skill in self.available_background_skills:
                self.selected_proficiencies.add(skill)
            
            # Add new class skill selections
            for skill in new_selections:
                if skill:  # Skip empty selections
                    self.selected_proficiencies.add(skill)
            
            # Update character data
            self.character_data['skill_proficiencies'] = list(self.selected_proficiencies)
            logger.debug(f"Updated class skill selections: {new_selections}")
            logger.debug(f"Total skills (background + class): {list(self.selected_proficiencies)}")
        
        # Show current selection status
        class_selections_count = len([s for s in new_selections if s])
        imgui.separator()
        if class_selections_count < self.class_choices:
            remaining = self.class_choices - class_selections_count
            imgui.text_colored((0.8, 0.8, 0.0, 1.0), f"Please select {remaining} more class skill(s)")
        else:
            imgui.text_colored((0.0, 0.8, 0.0, 1.0), "✓ All required class skills selected")
        
        # Show total summary
        total_skills = len(self.available_background_skills) + class_selections_count
        imgui.text(f"Total skill proficiencies: {total_skills} (Background: {len(self.available_background_skills)}, Class: {class_selections_count})")
    
    def get_completion_status(self) -> str:
        """Get a string describing the completion status"""
        total_selected = len(self.selected_proficiencies)
        return f"Skills: {total_selected} selected"
    
    def is_complete(self) -> bool:
        """Check if this step is complete"""
        # Background skills are automatic, so we only need to check class skill choices
        if self.class_choices > 0:
            # Count how many class skills have been selected
            class_skill_count = len([skill for skill in self.selected_proficiencies 
                                   if skill in self.available_class_skills])
            return class_skill_count >= self.class_choices
        
        # If no class skill choices required, step is complete
        # (background skills are automatically added)
        return True
    
    def get_selected_proficiencies(self) -> List[str]:
        """Get the list of selected skill proficiencies"""
        return list(self.selected_proficiencies)
    
    def get_proficiency_sources(self) -> Dict[str, str]:
        """Get the source of each proficiency (background or class)"""
        sources = {}
        for skill in self.selected_proficiencies:
            if skill in self.available_background_skills:
                sources[skill] = "Background"
            elif skill in self.available_class_skills:
                sources[skill] = "Class"
            else:
                sources[skill] = "Other"
        return sources
