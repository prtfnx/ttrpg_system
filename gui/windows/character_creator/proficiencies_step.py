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
        
        self._analyze_available_proficiencies()
    
    def _analyze_available_proficiencies(self):
        """Analyze available skill proficiencies from class and background"""
        # Get class proficiencies
        selected_class = self.character_data.get('character_class', '')
        if selected_class and selected_class in self.compendium_data.get('classes', {}):
            class_data = self.compendium_data['classes'][selected_class]
            self.available_class_skills = class_data.get('skills', [])
            self.class_choices = class_data.get('skill_choices', 0)
        
        # Get background proficiencies (usually automatic)
        selected_background = self.character_data.get('background', '')
        if selected_background and selected_background in self.compendium_data.get('backgrounds', {}):
            background_data = self.compendium_data['backgrounds'][selected_background]
            background_skills = background_data.get('skills', [])
            
            # Background skills are usually automatic, add them to selected
            for skill in background_skills:
                if skill in self.all_skills:
                    self.selected_proficiencies.add(skill)
            
            self.available_background_skills = background_skills
        
        # Update character data
        self.character_data['skill_proficiencies'] = list(self.selected_proficiencies)
        
        logger.debug(f"Class skills available: {self.available_class_skills}")
        logger.debug(f"Class choices: {self.class_choices}")
        logger.debug(f"Background skills (auto): {self.available_background_skills}")
    
    def render(self) -> bool:
        """Render the proficiencies selection step. Returns True if step is complete."""
        imgui.text("Select your skill proficiencies:")
        imgui.separator()
        
        # Show background proficiencies (automatic)
        if self.available_background_skills:
            imgui.text_colored((0.0, 0.8, 0.0, 1.0), "Background Proficiencies (Automatic):")
            for skill in self.available_background_skills:
                if skill in self.all_skills:
                    imgui.bullet_text(skill)
            imgui.separator()
        
        # Show class skill choices
        if self.available_class_skills and self.class_choices > 0:
            class_selections = len([s for s in self.selected_proficiencies 
                                  if s in self.available_class_skills and s not in self.available_background_skills])
            remaining_choices = max(0, self.class_choices - class_selections)
            
            imgui.text(f"Class Skill Choices (choose {self.class_choices}):")
            imgui.text(f"Selected: {class_selections} / {self.class_choices}")
            if remaining_choices > 0:
                imgui.text_colored((0.8, 0.8, 0.0, 1.0), f"You need to select {remaining_choices} more skill(s)")
            else:
                imgui.text_colored((0.0, 0.8, 0.0, 1.0), "✓ All class skills selected")
            
            imgui.separator()
            
            # Render class skill selection with comboboxes/checkboxes
            self._render_class_skill_selection()
        
        # Show all selected proficiencies summary
        imgui.separator()
        imgui.text("Final Skill Proficiencies:")
        if self.selected_proficiencies:
            for skill in sorted(self.selected_proficiencies):
                source = ""
                if skill in self.available_background_skills:
                    source = " (Background)"
                elif skill in self.available_class_skills:
                    source = " (Class)"
                imgui.bullet_text(f"{skill}{source}")
        else:
            imgui.text("No skill proficiencies selected")
        
        return self.is_complete()
    
    def _render_class_skill_selection(self):
        """Render the class skill selection interface"""
        if not self.available_class_skills:
            imgui.text("No class skills available for selection")
            return
        
        # Calculate current selections from class skills only (excluding background)
        class_selections = [s for s in self.selected_proficiencies 
                           if s in self.available_class_skills and s not in self.available_background_skills]
        can_select_more = len(class_selections) < self.class_choices
        
        imgui.text("Available Class Skills:")
        imgui.begin_child("class_skills", (0, 200), True)
        
        for skill in sorted(self.available_class_skills):
            # Skip if this skill is already granted by background
            if skill in self.available_background_skills:
                continue
            
            is_selected = skill in self.selected_proficiencies
            
            # Disable checkbox if we've reached the limit and this skill isn't selected
            disabled = not can_select_more and not is_selected
            if disabled:
                imgui.push_style_color(imgui.Col_.text.value, (0.5, 0.5, 0.5, 1.0))
            
            changed, new_selected = imgui.checkbox(f"##{skill}_checkbox", is_selected)
            
            if disabled:
                imgui.pop_style_color()
            
            imgui.same_line()
            ability = self.skill_abilities.get(skill, "???")
            imgui.text(f"{skill} ({ability})")
            
            # Handle selection change
            if changed and not disabled:
                if new_selected:
                    if can_select_more:
                        self.selected_proficiencies.add(skill)
                        logger.debug(f"Added class skill proficiency: {skill}")
                    else:
                        logger.debug(f"Cannot add {skill}, limit reached")
                else:
                    self.selected_proficiencies.discard(skill)
                    logger.debug(f"Removed class skill proficiency: {skill}")
                
                # Update character data
                self.character_data['skill_proficiencies'] = list(self.selected_proficiencies)
        
        imgui.end_child()
        
        # Alternative: Combobox selection method
        imgui.separator()
        imgui.text("Alternative: Select using dropdowns")
        self._render_class_skill_comboboxes()
    
    def _render_class_skill_comboboxes(self):
        """Render class skill selection using comboboxes"""
        if not self.available_class_skills:
            return
        
        # Get current class-only selections (excluding background skills)
        class_only_skills = [s for s in self.selected_proficiencies 
                            if s in self.available_class_skills and s not in self.available_background_skills]
        
        # Ensure we have enough slots
        while len(class_only_skills) < self.class_choices:
            class_only_skills.append("")
        
        # Available skills for selection (excluding already selected and background skills)
        available_for_selection = [s for s in self.available_class_skills 
                                 if s not in self.available_background_skills]
        
        changed = False
        new_selections = []
        
        for i in range(self.class_choices):
            current_selection = class_only_skills[i] if i < len(class_only_skills) else ""
            
            imgui.text(f"Choice {i + 1}:")
            imgui.same_line()
            imgui.set_next_item_width(200)
            
            if imgui.begin_combo(f"##class_skill_{i}", current_selection):
                # Empty option
                clicked, _ = imgui.selectable("", current_selection == "")
                if clicked:
                    new_selections.append("")
                    changed = True
                
                # Available skills
                for skill in available_for_selection:
                    # Don't show skills that are already selected in other comboboxes
                    if skill in new_selections or (skill in class_only_skills and skill != current_selection):
                        continue
                    
                    is_selected = skill == current_selection
                    clicked, _ = imgui.selectable(skill, is_selected)
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
            # Remove old class selections
            for skill in list(self.selected_proficiencies):
                if skill in self.available_class_skills and skill not in self.available_background_skills:
                    self.selected_proficiencies.discard(skill)
            
            # Add new selections
            for skill in new_selections:
                if skill and skill in self.available_class_skills:
                    self.selected_proficiencies.add(skill)
            
            # Update character data
            self.character_data['skill_proficiencies'] = list(self.selected_proficiencies)
            logger.debug(f"Updated class skill selections: {new_selections}")
    
    def get_completion_status(self) -> str:
        """Get a string describing the completion status"""
        total_selected = len(self.selected_proficiencies)
        return f"Skills: {total_selected} selected"
    
    def is_complete(self) -> bool:
        """Check if this step is complete"""
        # Check if we have selected the required number of class skills
        if self.class_choices > 0:
            # Count only class skills that aren't provided by background
            class_only_selections = [s for s in self.selected_proficiencies 
                                   if s in self.available_class_skills and s not in self.available_background_skills]
            return len(class_only_selections) >= self.class_choices
        
        # If no class choices required, always complete
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
