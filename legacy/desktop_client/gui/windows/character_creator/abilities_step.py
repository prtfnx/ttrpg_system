#!/usr/bin/env python3
"""
Abilities Step - Ability score generation step for character creation
"""

from imgui_bundle import imgui
from typing import Dict, List, Optional, Any
from .enums import AbilityGenMethod
from .utils import CharacterCreatorUtils

from logger import setup_logger
logger = setup_logger(__name__)


class AbilitiesStep:
    """Ability score generation step for character creation"""
    
    def __init__(self, character_data: Dict, compendium_data: Dict):
        self.character_data = character_data
        self.compendium_data = compendium_data
        
        # Initialize ability scores if not present
        if 'ability_scores' not in self.character_data:
            self.character_data['ability_scores'] = {
                'STR': 10, 'DEX': 10, 'CON': 10,
                'INT': 10, 'WIS': 10, 'CHA': 10
            }
        
        self.ability_scores = self.character_data['ability_scores']
        self.generation_method = character_data.get('ability_generation_method', AbilityGenMethod.POINT_BUY)
        self.rolled_scores = character_data.get('rolled_scores', [])
    
    def render(self) -> bool:
        """Render the abilities step. Returns True if step is complete."""
        imgui.text("Determine your character's ability scores:")
        imgui.separator()
        
        # Generation method selection
        self._render_generation_method_selection()
        imgui.separator()
        
        # Render based on selected method
        if self.generation_method == AbilityGenMethod.POINT_BUY:
            self._render_point_buy()
        elif self.generation_method == AbilityGenMethod.STANDARD_ARRAY:
            self._render_standard_array()
        elif self.generation_method == AbilityGenMethod.ROLL_4D6:
            self._render_rolled_scores()
        elif self.generation_method == AbilityGenMethod.MANUAL:
            self._render_manual_entry()
        
        # Show final scores with racial bonuses
        imgui.separator()
        self._render_final_scores()
        
        return True  # Always complete once method is selected
    
    def _render_generation_method_selection(self):
        """Render the generation method selection buttons"""
        imgui.text("Generation Method:")
        
        methods = [
            (AbilityGenMethod.POINT_BUY, "Point Buy"),
            (AbilityGenMethod.STANDARD_ARRAY, "Standard Array"),
            (AbilityGenMethod.ROLL_4D6, "Roll 4d6"),
            (AbilityGenMethod.MANUAL, "Manual Entry")
        ]
        
        for method, label in methods:
            # Use a more robust style color handling
            is_current = method == self.generation_method
            
            if is_current:
                imgui.push_style_color(imgui.Col_.button.value, (0.2, 0.7, 0.2, 1.0))
            
            try:
                clicked = imgui.button(label, (120, 30))
                if clicked:
                    self.generation_method = method
                    self.character_data['ability_generation_method'] = method
                    
                    # Reset scores when changing method
                    if method == AbilityGenMethod.POINT_BUY:
                        for ability in self.ability_scores:
                            self.ability_scores[ability] = 8
                    elif method == AbilityGenMethod.STANDARD_ARRAY:
                        scores = CharacterCreatorUtils.get_standard_array()
                        abilities = ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA']
                        for i, ability in enumerate(abilities):
                            self.ability_scores[ability] = scores[i] if i < len(scores) else 10
                    elif method == AbilityGenMethod.ROLL_4D6:
                        if not self.rolled_scores:
                            self.rolled_scores = CharacterCreatorUtils.roll_ability_scores()
                            self.character_data['rolled_scores'] = self.rolled_scores
                    elif method == AbilityGenMethod.MANUAL:
                        pass  # Keep current scores
            finally:
                # Always pop the style color if we pushed it
                if is_current:
                    imgui.pop_style_color()
            
            imgui.same_line()
        
        imgui.new_line()
    
    def _render_point_buy(self):
        """Render point buy interface"""
        imgui.text("Point Buy (27 points)")
        
        costs = CharacterCreatorUtils.get_point_buy_costs()
        total_spent = CharacterCreatorUtils.calculate_point_buy_total(self.ability_scores)
        remaining = 27 - total_spent
        
        imgui.text(f"Points remaining: {remaining}")
        imgui.separator()
        
        abilities = ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA']
        ability_names = ['Strength', 'Dexterity', 'Constitution', 'Intelligence', 'Wisdom', 'Charisma']
        
        for ability, full_name in zip(abilities, ability_names):
            current_score = self.ability_scores[ability]
            
            imgui.text(f"{full_name}:")
            imgui.same_line(120)
            
            # Decrease button
            dec_clicked = imgui.button(f"-##{ability}", (25, 25))
            if dec_clicked:
                if current_score > 8:
                    new_score = current_score - 1
                    cost_diff = costs.get(current_score, 0) - costs.get(new_score, 0)
                    self.ability_scores[ability] = new_score
            
            imgui.same_line()
            imgui.text(f"{current_score:2d}")
            imgui.same_line()
            
            # Increase button
            inc_clicked = imgui.button(f"+##{ability}", (25, 25))
            if inc_clicked:
                if current_score < 15:
                    new_score = current_score + 1
                    cost_diff = costs.get(new_score, 0) - costs.get(current_score, 0)
                    if remaining >= cost_diff:
                        self.ability_scores[ability] = new_score
            
            # Show cost
            imgui.same_line()
            imgui.text(f"(Cost: {costs.get(current_score, 0)})")
    
    def _render_standard_array(self):
        """Render standard array assignment"""
        imgui.text("Assign the standard array [15, 14, 13, 12, 10, 8] to your abilities:")
        
        standard_scores = CharacterCreatorUtils.get_standard_array()
        abilities = ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA']
        ability_names = ['Strength', 'Dexterity', 'Constitution', 'Intelligence', 'Wisdom', 'Charisma']
        
        for ability, full_name in zip(abilities, ability_names):
            imgui.text(f"{full_name}:")
            imgui.same_line(120)
            
            current_score = self.ability_scores[ability]
            imgui.set_next_item_width(80)
            
            if imgui.begin_combo(f"##{ability}_combo", str(current_score)):
                for score in standard_scores:
                    is_selected = score == current_score
                    clicked, _ = imgui.selectable(str(score), is_selected)
                    if clicked:
                        self.ability_scores[ability] = score
                    if is_selected:
                        imgui.set_item_default_focus()
                imgui.end_combo()
    
    def _render_rolled_scores(self):
        """Render rolled scores assignment"""
        imgui.text("Assign your rolled scores to abilities:")
        
        reroll_clicked = imgui.button("Reroll Scores", (120, 30))
        if reroll_clicked:
            self.rolled_scores = CharacterCreatorUtils.roll_ability_scores()
            self.character_data['rolled_scores'] = self.rolled_scores
        
        imgui.text(f"Rolled scores: {self.rolled_scores}")
        imgui.separator()
        
        abilities = ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA']
        ability_names = ['Strength', 'Dexterity', 'Constitution', 'Intelligence', 'Wisdom', 'Charisma']
        
        for ability, full_name in zip(abilities, ability_names):
            imgui.text(f"{full_name}:")
            imgui.same_line(120)
            
            current_score = self.ability_scores[ability]
            imgui.set_next_item_width(80)
            
            if imgui.begin_combo(f"##{ability}_rolled_combo", str(current_score)):
                for score in self.rolled_scores:
                    is_selected = score == current_score
                    clicked, _ = imgui.selectable(str(score), is_selected)
                    if clicked:
                        self.ability_scores[ability] = score
                    if is_selected:
                        imgui.set_item_default_focus()
                imgui.end_combo()
    
    def _render_manual_entry(self):
        """Render manual score entry"""
        imgui.text("Enter ability scores manually:")
        
        abilities = ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA']
        ability_names = ['Strength', 'Dexterity', 'Constitution', 'Intelligence', 'Wisdom', 'Charisma']
        
        for ability, full_name in zip(abilities, ability_names):
            imgui.text(f"{full_name}:")
            imgui.same_line(120)
            
            imgui.set_next_item_width(80)
            changed, new_score = imgui.input_int(f"##{ability}_manual", self.ability_scores[ability], 0, 0)
            if changed:
                self.ability_scores[ability] = max(1, min(30, new_score))
    
    def _render_final_scores(self):
        """Render final scores with racial bonuses"""
        imgui.text("Final Ability Scores (with racial bonuses):")
        
        # Get racial bonuses
        race_name = self.character_data.get('race', '')
        racial_bonuses = {}
        if race_name and race_name in self.compendium_data.get('races', {}):
            race_data = self.compendium_data['races'][race_name]
            asi = race_data.get('ability_score_increases', {})
            for ability, bonus in asi.items():
                if ability == "All":
                    for ab in ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA']:
                        racial_bonuses[ab] = racial_bonuses.get(ab, 0) + bonus
                else:
                    racial_bonuses[ability] = racial_bonuses.get(ability, 0) + bonus
        
        # Display final scores
        abilities = ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA']
        ability_names = ['Strength', 'Dexterity', 'Constitution', 'Intelligence', 'Wisdom', 'Charisma']
        
        for ability, full_name in zip(abilities, ability_names):
            base_score = self.ability_scores[ability]
            racial_bonus = racial_bonuses.get(ability, 0)
            final_score = base_score + racial_bonus
            modifier = CharacterCreatorUtils.calculate_modifier(final_score)
            modifier_text = CharacterCreatorUtils.format_modifier(modifier)
            
            bonus_text = f" (+{racial_bonus})" if racial_bonus > 0 else ""
            imgui.text(f"{full_name}: {base_score}{bonus_text} = {final_score} ({modifier_text})")
    
    def get_completion_status(self) -> str:
        """Get a string describing the completion status"""
        return f"Method: {self.generation_method.value}"
    
    def is_complete(self) -> bool:
        """Check if this step is complete"""
        return True  # Always complete once we have a method
