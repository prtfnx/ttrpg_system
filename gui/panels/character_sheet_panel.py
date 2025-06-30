#!/usr/bin/env python3
"""
D&D 5E Character Sheet Panel - Official Layout Recreation
Matches the official D&D 5E character sheet PDF with fantasy styling
"""

from imgui_bundle import imgui
import math
import logging
from typing import Dict, List, Optional, Tuple
from core_table.compendiums.characters.character import (
    Character, AbilityScore, Skill, Race, CharacterClass, Background, Feat,
    AbilityScoreIncrease, Size
)

logger = logging.getLogger(__name__)


class CharacterSheetPanel:
    def __init__(self, context=None, actions_bridge=None):
        self.context = context
        self.actions_bridge = actions_bridge
        self.character = Character()
        
        # Window state
        self.show_full_window = False
        self.selected_entity_id = None
          # Error handling and crash prevention
        self._error_count = 0
        self._max_errors = 5
        self._last_error_time = 0
        self._window_error_occurred = False
        self._crash_prevention_mode = False
        self._imgui_flood_detected = False
        self._emergency_close = False
        
        # Character sheet fields matching official PDF
        self.character_name = ""
        self.class_level = ""
        self.background = ""
        self.player_name = ""
        self.race = ""
        self.alignment = ""
        self.experience_points = 0
        
        # Ability scores
        self.ability_scores = {
            "STR": 10, "DEX": 10, "CON": 10, 
            "INT": 10, "WIS": 10, "CHA": 10
        }
        
        # Inspiration and Proficiency Bonus
        self.inspiration = False
        self.proficiency_bonus = 2
        
        # Saving throws
        self.saving_throws = {
            "STR": {"proficient": False, "value": 0},
            "DEX": {"proficient": False, "value": 0},
            "CON": {"proficient": False, "value": 0},
            "INT": {"proficient": False, "value": 0},
            "WIS": {"proficient": False, "value": 0},
            "CHA": {"proficient": False, "value": 0}
        }
        
        # Skills (matching official sheet order)
        self.skills = {
            "Acrobatics": {"ability": "DEX", "proficient": False, "value": 0},
            "Animal Handling": {"ability": "WIS", "proficient": False, "value": 0},
            "Arcana": {"ability": "INT", "proficient": False, "value": 0},
            "Athletics": {"ability": "STR", "proficient": False, "value": 0},
            "Deception": {"ability": "CHA", "proficient": False, "value": 0},
            "History": {"ability": "INT", "proficient": False, "value": 0},
            "Insight": {"ability": "WIS", "proficient": False, "value": 0},
            "Intimidation": {"ability": "CHA", "proficient": False, "value": 0},
            "Investigation": {"ability": "INT", "proficient": False, "value": 0},
            "Medicine": {"ability": "WIS", "proficient": False, "value": 0},
            "Nature": {"ability": "INT", "proficient": False, "value": 0},
            "Perception": {"ability": "WIS", "proficient": False, "value": 0},
            "Performance": {"ability": "CHA", "proficient": False, "value": 0},
            "Persuasion": {"ability": "CHA", "proficient": False, "value": 0},
            "Religion": {"ability": "INT", "proficient": False, "value": 0},
            "Sleight of Hand": {"ability": "DEX", "proficient": False, "value": 0},
            "Stealth": {"ability": "DEX", "proficient": False, "value": 0},
            "Survival": {"ability": "WIS", "proficient": False, "value": 0}
        }
        
        # Combat stats
        self.armor_class = 10
        self.initiative = 0
        self.speed = 30
        self.hit_point_maximum = 8
        self.current_hit_points = 8
        self.temporary_hit_points = 0
        self.total_hit_dice = "1d8"
        self.hit_dice = "1d8"
        
        # Death saves
        self.death_save_successes = [False, False, False]
        self.death_save_failures = [False, False, False]
        
        # Passive perception
        self.passive_perception = 10
        
        # Attacks and spellcasting
        self.attacks_spellcasting = ""
        
        # Equipment
        self.equipment = ""
          # Other proficiencies and languages
        self.other_proficiencies_languages = ""
        
        # Features and traits
        self.features_traits = ""
        
    def calculate_modifier(self, score: int) -> int:
        """Calculate ability score modifier"""
        return (score - 10) // 2
        
    def format_modifier(self, modifier: int) -> str:
        """Format modifier with + or - sign"""
        return f"+{modifier}" if modifier >= 0 else str(modifier)
        
    def update_derived_stats(self):
        """Update stats that depend on ability scores"""
        # Update saving throws
        for ability in self.saving_throws:
            modifier = self.calculate_modifier(self.ability_scores[ability])
            if self.saving_throws[ability]["proficient"]:
                self.saving_throws[ability]["value"] = modifier + self.proficiency_bonus
            else:
                self.saving_throws[ability]["value"] = modifier
                
        # Update skills
        for skill_name, skill_data in self.skills.items():
            ability = skill_data["ability"]
            modifier = self.calculate_modifier(self.ability_scores[ability])
            if skill_data["proficient"]:
                skill_data["value"] = modifier + self.proficiency_bonus
            else:
                skill_data["value"] = modifier
                  # Update passive perception
        perception_modifier = self.skills["Perception"]["value"]
        self.passive_perception = 10 + perception_modifier
        
    def render_text_field(self, label: str, value: str, width: float = 200) -> str:
        """Render a labeled text input field"""
        imgui.text(label)
        imgui.same_line()
        imgui.set_next_item_width(width)
        changed, new_value = imgui.input_text(f"##{label}", value)
        if changed:
            return new_value
        return value
        
    def render_int_field(self, label: str, value: int, width: float = 100, min_val: int = 0, max_val: int = 999) -> int:
        """Render a labeled integer input field"""
        imgui.text(label)
        imgui.same_line()
        imgui.set_next_item_width(width)
        changed, new_value = imgui.input_int(f"##{label}", value)
        if changed:
            return max(min_val, min(max_val, new_value))
        return value
        
    def render_checkbox_field(self, label: str, value: bool) -> bool:
        """Render a checkbox field"""
        changed, new_value = imgui.checkbox(label, value)
        return new_value if changed else value
        
    def render_header_section(self):
        """Render the character header information"""
        imgui.text("CHARACTER NAME")
        imgui.same_line(200)
        imgui.text("CLASS & LEVEL")
        imgui.same_line(400)
        imgui.text("BACKGROUND")
        imgui.same_line(600)
        imgui.text("PLAYER NAME")
        
        # First row inputs
        imgui.set_next_item_width(180)
        changed, new_name = imgui.input_text("##char_name", self.character_name)
        if changed:
            self.character_name = new_name
            
        imgui.same_line()
        imgui.set_next_item_width(180)
        changed, new_class = imgui.input_text("##class_level", self.class_level)
        if changed:
            self.class_level = new_class
            
        imgui.same_line()
        imgui.set_next_item_width(180)
        changed, new_bg = imgui.input_text("##background", self.background)
        if changed:
            self.background = new_bg
            
        imgui.same_line()
        imgui.set_next_item_width(180)
        changed, new_player = imgui.input_text("##player_name", self.player_name)
        if changed:
            self.player_name = new_player
            
        imgui.spacing()
        
        # Second row labels
        imgui.text("RACE")
        imgui.same_line(200)
        imgui.text("ALIGNMENT")
        imgui.same_line(400)
        imgui.text("EXPERIENCE POINTS")
        
        # Second row inputs
        imgui.set_next_item_width(180)
        changed, new_race = imgui.input_text("##race", self.race)
        if changed:
            self.race = new_race
            
        imgui.same_line()
        imgui.set_next_item_width(180)
        changed, new_align = imgui.input_text("##alignment", self.alignment)
        if changed:
            self.alignment = new_align
            
        imgui.same_line()
        imgui.set_next_item_width(180)
        changed, new_xp = imgui.input_int("##experience", self.experience_points, 0, 0)
        if changed:
            self.experience_points = max(0, new_xp)
            
        imgui.separator()
        
    def render_ability_scores(self):
        """Render the ability scores section"""
        imgui.text("ABILITY SCORES")
        imgui.spacing()
        
        abilities = ["STR", "DEX", "CON", "INT", "WIS", "CHA"]
        ability_names = ["STRENGTH", "DEXTERITY", "CONSTITUTION", "INTELLIGENCE", "WISDOM", "CHARISMA"]
        
        # Create ability score boxes vertically (one per row)
        for ability, full_name in zip(abilities, ability_names):
            # Create a group for each ability score
            imgui.begin_group()            # Ability name (centered) - clickable
            name_size = imgui.calc_text_size(ability)
            imgui.set_cursor_pos_x(imgui.get_cursor_pos_x() + (120 - name_size.x) * 0.5)
            
            # Make ability name clickable for ability check
            imgui.text(ability)
            if imgui.is_item_clicked():
                modifier = self.calculate_modifier(self.ability_scores[ability])
                self._make_roll("check", ability, modifier)
            
            # Modifier (large circle)
            modifier = self.calculate_modifier(self.ability_scores[ability])
            modifier_text = self.format_modifier(modifier)
            
            # Draw modifier circle
            draw_list = imgui.get_window_draw_list()
            pos = imgui.get_cursor_screen_pos()
            center = imgui.ImVec2(pos.x + 60, pos.y + 25)
            draw_list.add_circle(center, 25, imgui.color_convert_float4_to_u32(imgui.ImVec4(0.63, 0.47, 0.31, 1.0)), 0, 2.0)
            
            # Center the modifier text
            text_size = imgui.calc_text_size(modifier_text)
            text_pos = imgui.ImVec2(center.x - text_size.x * 0.5, center.y - text_size.y * 0.5)
            draw_list.add_text(text_pos, imgui.color_convert_float4_to_u32(imgui.ImVec4(0.35, 0.27, 0.13, 1.0)), modifier_text)
            
            # Move cursor down past the circle
            imgui.dummy(imgui.ImVec2(120, 50))            # Score input (centered)
            imgui.set_next_item_width(60)
            imgui.set_cursor_pos_x(imgui.get_cursor_pos_x() + 30)
            changed, new_score = imgui.input_int(f"##{ability}", self.ability_scores[ability], 0, 0)
            if changed:
                self.ability_scores[ability] = max(1, min(30, new_score))
                self.update_derived_stats()
                
            imgui.end_group()
            imgui.spacing()
            
        imgui.separator()
        
    def render_inspiration_proficiency(self):
        """Render inspiration and proficiency bonus"""
        imgui.text("INSPIRATION")
        imgui.same_line(150)
        imgui.text("PROFICIENCY BONUS")
        
        # Inspiration checkbox (styled as circle)
        imgui.set_next_item_width(30)
        changed, new_inspiration = imgui.checkbox("##inspiration", self.inspiration)
        if changed:
            self.inspiration = new_inspiration
            
        imgui.same_line(150)
        # Proficiency bonus input (editable)
        imgui.set_next_item_width(80)
        changed, new_prof_bonus = imgui.input_int("##prof_bonus", self.proficiency_bonus, 0, 0)
        if changed:
            self.proficiency_bonus = max(0, min(10, new_prof_bonus))
            self.update_derived_stats()
            
        imgui.separator()
        
    def render_saving_throws(self):
        """Render saving throws section"""
        imgui.text("SAVING THROWS")
        imgui.spacing()
        
        for ability in ["STR", "DEX", "CON", "INT", "WIS", "CHA"]:
            # Proficiency checkbox
            changed, new_prof = imgui.checkbox(f"##save_{ability}", self.saving_throws[ability]["proficient"])
            if changed:
                self.saving_throws[ability]["proficient"] = new_prof
                self.update_derived_stats()
                
            imgui.same_line()
              # Bonus display - clickable for rolling
            bonus = self.saving_throws[ability]["value"]
            bonus_text = self.format_modifier(bonus)
            
            imgui.text(f"{bonus_text} {ability} Save")
            if imgui.is_item_clicked():
                self._make_roll("saving throw", f"{ability} Save", bonus)
            
        imgui.separator()
        
    def render_skills(self):
        """Render skills section"""
        imgui.text("SKILLS")
        imgui.spacing()
        
        for skill_name, skill_data in self.skills.items():
            # Proficiency checkbox
            changed, new_prof = imgui.checkbox(f"##skill_{skill_name}", skill_data["proficient"])
            if changed:
                skill_data["proficient"] = new_prof
                self.update_derived_stats()
                
            imgui.same_line()
              # Skill bonus display - clickable for rolling
            bonus = skill_data["value"]
            bonus_text = self.format_modifier(bonus)
            ability = skill_data["ability"]
            
            imgui.text(f"{bonus_text} {skill_name} ({ability})")
            if imgui.is_item_clicked():
                self._make_roll("skill check", skill_name, bonus)
            
        imgui.separator()
        
    def render_combat_stats(self):
        """Render combat statistics"""
        imgui.text("COMBAT")
        imgui.spacing()
        
        # First row: AC, Initiative, Speed
        imgui.text("Armor Class")
        imgui.same_line(120)
        imgui.text("Initiative")
        imgui.same_line(240)
        imgui.text("Speed")
        
        imgui.set_next_item_width(80)
        changed, new_ac = imgui.input_int("##ac", self.armor_class, 0, 0)
        if changed:
            self.armor_class = max(0, new_ac)
            
        imgui.same_line(120)
        imgui.set_next_item_width(80)
        changed, new_init = imgui.input_int("##initiative", self.initiative, 0, 0)
        if changed:
            self.initiative = new_init
        
        imgui.same_line(240)
        imgui.set_next_item_width(80)
        changed, new_speed = imgui.input_int("##speed", self.speed, 0, 0)
        if changed:
            self.speed = max(0, new_speed)
            
        imgui.spacing()
        
        # Hit Points section
        imgui.text("Hit Point Maximum")
        imgui.same_line(180)
        imgui.text("Current Hit Points")
        imgui.same_line(360)
        imgui.text("Temporary Hit Points")
        
        imgui.set_next_item_width(80)
        changed, new_max_hp = imgui.input_int("##max_hp", self.hit_point_maximum, 0, 0)
        if changed:
            self.hit_point_maximum = max(1, new_max_hp)
            
        imgui.same_line(180)
        imgui.set_next_item_width(80)
        changed, new_curr_hp = imgui.input_int("##curr_hp", self.current_hit_points, 0, 0)
        if changed:
            self.current_hit_points = max(0, min(self.hit_point_maximum, new_curr_hp))
            
        imgui.same_line(360)
        imgui.set_next_item_width(80)
        changed, new_temp_hp = imgui.input_int("##temp_hp", self.temporary_hit_points, 0, 0)
        if changed:
            self.temporary_hit_points = max(0, new_temp_hp)
            
        imgui.spacing()
        
        # Hit Dice and Death Saves
        imgui.text("Hit Dice")
        imgui.same_line(150)
        imgui.text("Death Saves")
        
        imgui.set_next_item_width(100)
        changed, new_hit_dice = imgui.input_text("##hit_dice", self.hit_dice)
        if changed:
            self.hit_dice = new_hit_dice
            
        imgui.same_line(150)
        imgui.text("Successes:")
        for i in range(3):
            imgui.same_line()
            changed, new_success = imgui.checkbox(f"##death_success_{i}", self.death_save_successes[i])
            if changed:
                self.death_save_successes[i] = new_success
                
        # Move to next line for failures
        imgui.text("")  # Empty text to move to next line
        imgui.same_line(150)
        imgui.text("Failures:")
        for i in range(3):
            imgui.same_line()
            changed, new_failure = imgui.checkbox(f"##death_failure_{i}", self.death_save_failures[i])
            if changed:
                self.death_save_failures[i] = new_failure
                
        imgui.separator()
        
    def render_attacks_equipment(self):
        """Render attacks and equipment section"""
        imgui.text("ATTACKS & SPELLCASTING")
        imgui.set_next_item_width(-1)
        changed, new_attacks = imgui.input_text_multiline("##attacks", self.attacks_spellcasting, imgui.ImVec2(-1, 100))
        if changed:
            self.attacks_spellcasting = new_attacks
            
        imgui.spacing()
        
        imgui.text("EQUIPMENT")
        imgui.set_next_item_width(-1)
        changed, new_equipment = imgui.input_text_multiline("##equipment", self.equipment, imgui.ImVec2(-1, 150))
        if changed:
            self.equipment = new_equipment
            
        imgui.spacing()
        
        imgui.text("OTHER PROFICIENCIES & LANGUAGES")
        imgui.set_next_item_width(-1)
        changed, new_prof = imgui.input_text_multiline("##other_prof", self.other_proficiencies_languages, imgui.ImVec2(-1, 80))
        if changed:
            self.other_proficiencies_languages = new_prof
            
        imgui.separator()
    def render_features_traits(self):
        """Render features and traits section"""
        imgui.text("FEATURES & TRAITS")
        imgui.set_next_item_width(-1)
        # Use simple sizing without negative values to avoid viewport issues
        changed, new_features = imgui.input_text_multiline("##features", self.features_traits, imgui.ImVec2(0, 200))        
        if changed:
            self.features_traits = new_features
            
        imgui.separator()
        
    def render_passive_perception(self):
        """Render passive perception"""
        imgui.text(f"Passive Wisdom (Perception): {self.passive_perception}")
        imgui.separator()
        
    def render(self):
        """Main render method for the character sheet"""
        self._safe_render_with_error_limit(self._render_internal, "main_render")
    
    def _render_internal(self):
        """Internal render method wrapped by error handling"""
        # Check for entity selection updates
        self._check_entity_selection()
        
        # Render mini character sheet in sidebar
        self.render_mini_character_sheet()
        
        # Render full window if open
        if self.show_full_window:
            self.render_full_window()
    
    def _check_entity_selection(self):
        """Check if a new entity is selected and load its character data"""
        if not self.actions_bridge:
            return
            
        # This would be called by the entities panel when selection changes
        # For now, we'll implement a basic check
        pass
        
    def load_character_from_compendium(self, character_data):
        """Load character from compendium data"""
        if hasattr(character_data, 'name'):
            self.character_name = character_data.name
        if hasattr(character_data, 'character_class'):
            self.class_level = f"{character_data.character_class} {getattr(character_data, 'level', 1)}"
        if hasattr(character_data, 'race'):
            self.race = character_data.race
        if hasattr(character_data, 'background'):
            self.background = character_data.background
        if hasattr(character_data, 'alignment'):
            self.alignment = character_data.alignment
            
        # Load ability scores
        if hasattr(character_data, 'ability_scores'):
            for ability, score in character_data.ability_scores.items():
                if ability.upper() in self.ability_scores:
                    self.ability_scores[ability.upper()] = score
                    
        self.update_derived_stats()
        
    def export_character(self):
        """Export current character sheet data"""
        return {
            'name': self.character_name,
            'class_level': self.class_level,
            'background': self.background,
            'player_name': self.player_name,
            'race': self.race,
            'alignment': self.alignment,
            'experience_points': self.experience_points,
            'ability_scores': self.ability_scores.copy(),
            'inspiration': self.inspiration,
            'proficiency_bonus': self.proficiency_bonus,
            'saving_throws': self.saving_throws.copy(),
            'skills': self.skills.copy(),
            'combat_stats': {
                'armor_class': self.armor_class,
                'initiative': self.initiative,
                'speed': self.speed,
                'hit_point_maximum': self.hit_point_maximum,
                'current_hit_points': self.current_hit_points,
                'temporary_hit_points': self.temporary_hit_points,
                'hit_dice': self.hit_dice
            },
            'death_saves': {
                'successes': self.death_save_successes.copy(),
                'failures': self.death_save_failures.copy()
            },
            'attacks_spellcasting': self.attacks_spellcasting,
            'equipment': self.equipment,
            'other_proficiencies_languages': self.other_proficiencies_languages,
            'features_traits': self.features_traits,
            'passive_perception': self.passive_perception
        }
    
    def load_from_entity(self, entity_id: str):
        """Load character data from selected entity"""
        if not self.actions_bridge or not entity_id:
            return False
            
        # Get entity data that might contain character information
        sprite_info = self.actions_bridge.get_sprite_info(entity_id)
        if not sprite_info:
            return False
            
        # Check if entity has character data
        character_data = sprite_info.get('character_data')
        if character_data:
            self.selected_entity_id = entity_id
            self._load_character_data(character_data)
            return True
        return False
    
    def _load_character_data(self, character_data: dict):
        """Load character data from dictionary"""
        self.character_name = character_data.get('name', '')
        self.class_level = character_data.get('class_level', '')
        self.race = character_data.get('race', '')
        self.background = character_data.get('background', '')
        self.alignment = character_data.get('alignment', '')
        self.experience_points = character_data.get('experience_points', 0)
        
        # Load ability scores
        ability_scores = character_data.get('ability_scores', {})
        for ability, score in ability_scores.items():
            if ability.upper() in self.ability_scores:
                self.ability_scores[ability.upper()] = score
                
        # Load combat stats
        combat_stats = character_data.get('combat_stats', {})
        self.armor_class = combat_stats.get('armor_class', 10)
        self.current_hit_points = combat_stats.get('current_hit_points', 8)
        self.hit_point_maximum = combat_stats.get('hit_point_maximum', 8)
        self.temporary_hit_points = combat_stats.get('temporary_hit_points', 0)
        
        # Load skills and saving throws
        skills = character_data.get('skills', {})
        for skill_name, skill_data in skills.items():
            if skill_name in self.skills:
                self.skills[skill_name].update(skill_data)
                
        saving_throws = character_data.get('saving_throws', {})
        for ability, save_data in saving_throws.items():
            if ability in self.saving_throws:
                self.saving_throws[ability].update(save_data)
                
        self.update_derived_stats()
    
    def render_mini_character_sheet(self):
        """Render mini character sheet for sidebar"""
        # Character name and basic info
        if self.character_name:
            imgui.text(f"Character: {self.character_name}")
        else:
            imgui.text_colored((0.7, 0.7, 0.7, 1.0), "No character selected")
            
        if self.class_level:
            imgui.text(f"Class: {self.class_level}")
            
        imgui.separator()
        
        # Full window button
        if imgui.button("Open Full Sheet", (-1, 30)):
            self.show_full_window = True
            
        imgui.separator()
        
        # Ability scores (compact)
        imgui.text("Ability Scores:")
        abilities = ["STR", "DEX", "CON", "INT", "WIS", "CHA"]
        
        for i, ability in enumerate(abilities):
            if i % 3 == 0 and i > 0:
                imgui.separator()
                
            if i % 3 != 0:
                imgui.same_line()
                
            score = self.ability_scores[ability]
            modifier = self.calculate_modifier(score)
            modifier_text = self.format_modifier(modifier)
            
            imgui.text(f"{ability}: {score} ({modifier_text})")
            
        imgui.separator()
        
        # HP and AC (editable)
        imgui.text("Health & Defense:")
        
        imgui.text("AC:")
        imgui.same_line()
        imgui.set_next_item_width(60)
        changed, new_ac = imgui.input_int("##mini_ac", self.armor_class, 0, 0)
        if changed:
            self.armor_class = max(0, new_ac)
            
        imgui.text("HP:")
        imgui.same_line()
        imgui.set_next_item_width(50)
        changed, new_hp = imgui.input_int("##mini_hp", self.current_hit_points, 0, 0)
        if changed:
            self.current_hit_points = max(0, min(self.hit_point_maximum, new_hp))
            
        imgui.same_line()
        imgui.text(f"/ {self.hit_point_maximum}")
        
        # Temp HP
        if self.temporary_hit_points > 0:
            imgui.text(f"Temp HP: {self.temporary_hit_points}")
            
        imgui.separator()
        
        # Quick actions
        imgui.text("Quick Actions:")
        
        if imgui.button("Attack", (-1, 25)):
            self._handle_attack_action()
            
        if imgui.button("Cast Spell", (-1, 25)):
            self._handle_cast_spell_action()
            
        if imgui.button("Short Rest", (-1, 25)):
            self._handle_short_rest()
            
        imgui.separator()
        
        # Death saves if unconscious
        if self.current_hit_points <= 0:
            imgui.text("Death Saves:")
            
            # Successes
            imgui.text("Successes:")
            for i in range(3):
                imgui.same_line()
                changed, new_success = imgui.checkbox(f"##death_success_mini_{i}", self.death_save_successes[i])
                if changed:
                    self.death_save_successes[i] = new_success
                    
            # Failures
            imgui.text("Failures:")
            for i in range(3):
                imgui.same_line()
                changed, new_failure = imgui.checkbox(f"##death_failure_mini_{i}", self.death_save_failures[i])
                if changed:
                    self.death_save_failures[i] = new_failure
                    
        imgui.separator()
          # Most used skills
        imgui.text("Key Skills:")
        key_skills = ["Perception", "Investigation", "Stealth", "Athletics"]
        
        for skill in key_skills:
            if skill in self.skills:
                bonus = self.skills[skill]["value"]
                bonus_text = self.format_modifier(bonus)
                proficient = "●" if self.skills[skill]["proficient"] else "○"
                imgui.text(f"{proficient} {skill}: {bonus_text}")
    
    def _handle_attack_action(self):
        """Handle attack action"""
        if self.actions_bridge:
            self.actions_bridge.add_chat_message(f"{self.character_name} makes an attack!")
    
    def _handle_cast_spell_action(self):
        """Handle cast spell action"""
        if self.actions_bridge:
            self.actions_bridge.add_chat_message(f"{self.character_name} casts a spell!")
    def _handle_short_rest(self):
        """Handle short rest"""
        if self.actions_bridge:              
            self.actions_bridge.add_chat_message(f"{self.character_name} takes a short rest.")
    
    def render_full_window(self):
        """Render full character sheet in separate window"""
        if not self.show_full_window:
            return
              # Simple window setup without viewport complications
        flags = imgui.WindowFlags_.no_collapse.value
        imgui.set_next_window_size((1200, 800), imgui.Cond_.first_use_ever.value)
        imgui.set_next_window_pos((100, 100), imgui.Cond_.first_use_ever.value)
        
        expanded, self.show_full_window = imgui.begin("Character Sheet - Full View", self.show_full_window, flags)
        if expanded:
            # Close button and character info
            if imgui.button("Close", (100, 30)):
                self.show_full_window = False
                
            imgui.same_line()
            imgui.text(f"Character: {self.character_name or 'Unnamed'}")
            imgui.separator()
              # Tab bar for different sections
            if imgui.begin_tab_bar("CharacterSheetTabs"):
                # Character tab
                if imgui.begin_tab_item("Character")[0]:
                    self.render_main_character_sheet()
                    imgui.end_tab_item()
                
                # Spells tab
                if imgui.begin_tab_item("Spells")[0]:
                    self.render_tab_spells()
                    imgui.end_tab_item()
                
                # Equipment tab
                if imgui.begin_tab_item("Equipment")[0]:
                    self.render_tab_equipment()
                    imgui.end_tab_item()
                
                imgui.end_tab_bar()
        
        imgui.end()
    
    def render_main_character_sheet(self):
        """Render the main character sheet content (Tab 1)"""
        try:
            # Header section (spans full width)
            self.render_header_section()
              # Create main content table with 3 columns - disable resizing to prevent child window conflicts
            table_begun = imgui.begin_table("CharacterSheetTable", 3, 
                                imgui.TableFlags_.borders_inner_v.value)
            if table_begun:
                # Setup columns with fixed sizes to prevent resize conflicts
                imgui.table_setup_column("Left", imgui.TableColumnFlags_.width_fixed.value, 300.0)
                imgui.table_setup_column("Center", imgui.TableColumnFlags_.width_fixed.value, 350.0)
                imgui.table_setup_column("Right", imgui.TableColumnFlags_.width_fixed.value, 300.0)
                imgui.table_next_row()                  # Left column - Ability Scores alongside Inspiration/Proficiency/Saves/Skills
                imgui.table_next_column()
                # Render content directly without child windows to avoid resize conflicts
                self.render_ability_scores()
                imgui.separator()
                self.render_inspiration_proficiency()
                self.render_saving_throws()
                self.render_skills()
                self.render_passive_perception()                  # Center column - Combat Stats, Attacks & Equipment
                imgui.table_next_column()
                # Render content directly without child windows
                self.render_combat_stats()
                self.render_attacks_equipment()
                
                # Right column - Features & Traits
                imgui.table_next_column()
                # Render content directly without child windows
                self.render_features_traits()
                
                imgui.end_table()
            
        except Exception as e:
            # Mark window for position reset on next render
            self._window_error_occurred = True
            logger.error(f"Character Sheet Error: {e}")
            imgui.text(f"Character Sheet Error: {str(e)}")
            imgui.text("Please check the console for details.")
            imgui.text("Window will reset position on next open.")
    
    def set_selected_entity(self, entity_id: str):
        """Set the selected entity and try to load its character data"""
        if entity_id != self.selected_entity_id:
            if self.load_from_entity(entity_id):
                self.selected_entity_id = entity_id
                return True
            else:
                # Clear character data if entity has no character
                self.selected_entity_id = None
                self._clear_character_data()
                return False
        return True
    
    def _clear_character_data(self):
        """Clear all character data"""
        self.character_name = ""
        self.class_level = ""
        self.background = ""
        self.player_name = ""
        self.race = ""
        self.alignment = ""
        self.experience_points = 0
        
        # Reset ability scores to default
        for ability in self.ability_scores:
            self.ability_scores[ability] = 10
            
        # Reset other stats
        self.armor_class = 10
        self.current_hit_points = 8
        self.hit_point_maximum = 8
        self.temporary_hit_points = 0
        
        self.update_derived_stats()
        
    def _make_roll(self, roll_type: str, name: str, modifier: int, advantage: bool = False, disadvantage: bool = False):
        """Make a dice roll and send to chat"""
        if not self.actions_bridge:
            return
            
        # Roll d20
        import random
        roll1 = random.randint(1, 20)
        roll2 = random.randint(1, 20) if advantage or disadvantage else roll1
        
        # Apply advantage/disadvantage
        if advantage:
            final_roll = max(roll1, roll2)
            roll_text = f"({roll1}, {roll2}) keep higher"
        elif disadvantage:
            final_roll = min(roll1, roll2)
            roll_text = f"({roll1}, {roll2}) keep lower"
        else:
            final_roll = roll1
            roll_text = str(roll1)
            
        total = final_roll + modifier
        modifier_text = self.format_modifier(modifier)
        
        # Create roll message
        character_name = self.character_name or "Character"
        message = f"{character_name} rolls {name} {roll_type}: {roll_text} {modifier_text} = {total}"
        
        self.actions_bridge.add_chat_message(message)
    
    def render_spells_features_tab(self):
        """Render the spells and features tab (Tab 2)"""
        try:
            # Create two columns for spells and features
            if imgui.begin_table("SpellsFeaturesTable", 2, imgui.TableFlags_.resizable.value):
                
                # Setup columns
                imgui.table_setup_column("Spells", imgui.TableColumnFlags_.width_stretch.value)
                imgui.table_setup_column("Features", imgui.TableColumnFlags_.width_stretch.value)
                
                imgui.table_next_row()
                
                # Left column: Spells
                imgui.table_next_column()
                imgui.begin_child("SpellsColumn", imgui.ImVec2(0, 0))
                imgui.text("SPELLCASTING")
                imgui.separator()
                
                # Spellcasting class
                imgui.text("Spellcasting Class:")
                imgui.set_next_item_width(-1)
                changed, new_spell_class = imgui.input_text("##spell_class", getattr(self, 'spellcasting_class', ''))
                if changed:
                    self.spellcasting_class = new_spell_class
                
                imgui.spacing()
                
                # Spell save DC and attack bonus
                imgui.text("Spell Save DC:")
                imgui.same_line(120)
                imgui.set_next_item_width(80)
                changed, new_dc = imgui.input_int("##spell_dc", getattr(self, 'spell_save_dc', 13), 0, 0)
                if changed:
                    self.spell_save_dc = max(8, new_dc)
                
                imgui.text("Spell Attack Bonus:")
                imgui.same_line(120)
                imgui.set_next_item_width(80)
                changed, new_attack = imgui.input_int("##spell_attack", getattr(self, 'spell_attack_bonus', 5), 0, 0)
                if changed:
                    self.spell_attack_bonus = new_attack
                
                imgui.separator()
                
                # Spell slots
                imgui.text("SPELL SLOTS")
                for level in range(1, 10):
                    if hasattr(self, f'spell_slots_level_{level}'):
                        slots = getattr(self, f'spell_slots_level_{level}', 0)
                        if slots > 0:
                            imgui.text(f"Level {level}:")
                            imgui.same_line(80)
                            imgui.set_next_item_width(60)
                            changed, new_slots = imgui.input_int(f"##slots_{level}", slots, 0, 0)
                            if changed:
                                setattr(self, f'spell_slots_level_{level}', max(0, new_slots))
                
                imgui.separator()
                
                # Known spells
                imgui.text("KNOWN SPELLS")
                imgui.set_next_item_width(-1)
                changed, new_spells = imgui.input_text_multiline("##known_spells", 
                                                                getattr(self, 'known_spells', ''), 
                                                                imgui.ImVec2(-1, 300))
                if changed:
                    self.known_spells = new_spells
                
                imgui.end_child()
                
                # Right column: Features & Traits
                imgui.table_next_column()
                imgui.begin_child("FeaturesColumn", imgui.ImVec2(0, 0))
                imgui.text("FEATURES & TRAITS")
                imgui.separator()
                
                # Class features
                imgui.text("Class Features:")
                imgui.set_next_item_width(-1)
                changed, new_class_features = imgui.input_text_multiline("##class_features", 
                                                                       getattr(self, 'class_features', ''), 
                                                                       imgui.ImVec2(-1, 200))
                if changed:
                    self.class_features = new_class_features
                
                imgui.spacing()
                
                # Racial traits
                imgui.text("Racial Traits:")
                imgui.set_next_item_width(-1)
                changed, new_racial_traits = imgui.input_text_multiline("##racial_traits", 
                                                                      getattr(self, 'racial_traits', ''), 
                                                                      imgui.ImVec2(-1, 150))
                if changed:
                    self.racial_traits = new_racial_traits
                
                imgui.spacing()
                
                # Feats
                imgui.text("Feats:")
                imgui.set_next_item_width(-1)
                changed, new_feats = imgui.input_text_multiline("##feats", 
                                                               getattr(self, 'feats', ''), 
                                                               imgui.ImVec2(-1, 150))
                if changed:
                    self.feats = new_feats
                
                imgui.end_child()
                
                imgui.end_table()
                
        except Exception as e:
            imgui.text(f"Spells & Features Error: {str(e)}")
    
    def render_equipment_notes_tab(self):
        """Render the equipment and notes tab (Tab 3)"""
        try:
            # Create two columns for equipment and notes
            if imgui.begin_table("EquipmentNotesTable", 2, imgui.TableFlags_.resizable.value):
                
                # Setup columns
                imgui.table_setup_column("Equipment", imgui.TableColumnFlags_.width_stretch.value)
                imgui.table_setup_column("Notes", imgui.TableColumnFlags_.width_stretch.value)
                
                imgui.table_next_row()
                
                # Left column: Equipment
                imgui.table_next_column()
                imgui.begin_child("EquipmentColumn", imgui.ImVec2(0, 0))
                imgui.text("EQUIPMENT & INVENTORY")
                imgui.separator()
                
                # Currency
                imgui.text("Currency:")
                
                currencies = [("Copper", "cp"), ("Silver", "sp"), ("Electrum", "ep"), 
                            ("Gold", "gp"), ("Platinum", "pp")]
                
                for name, code in currencies:
                    imgui.text(f"{name}:")
                    imgui.same_line(80)
                    imgui.set_next_item_width(80)
                    current_value = getattr(self, f'currency_{code}', 0)
                    changed, new_value = imgui.input_int(f"##{code}", current_value, 0, 0)
                    if changed:
                        setattr(self, f'currency_{code}', max(0, new_value))
                
                imgui.separator()
                
                # Equipment list
                imgui.text("Equipment List:")
                imgui.set_next_item_width(-1)
                changed, new_equipment_list = imgui.input_text_multiline("##equipment_list", 
                                                                       getattr(self, 'equipment_list', ''), 
                                                                       imgui.ImVec2(-1, 300))
                if changed:
                    self.equipment_list = new_equipment_list
                
                imgui.spacing()
                
                # Weapons
                imgui.text("Weapons:")
                imgui.set_next_item_width(-1)
                changed, new_weapons = imgui.input_text_multiline("##weapons", 
                                                                 getattr(self, 'weapons', ''), 
                                                                 imgui.ImVec2(-1, 150))
                if changed:
                    self.weapons = new_weapons
                
                imgui.end_child()
                
                # Right column: Notes
                imgui.table_next_column()
                imgui.begin_child("NotesColumn", imgui.ImVec2(0, 0))
                imgui.text("CHARACTER NOTES")
                imgui.separator()
                
                # Backstory
                imgui.text("Backstory:")
                imgui.set_next_item_width(-1)
                changed, new_backstory = imgui.input_text_multiline("##backstory", 
                                                                   getattr(self, 'backstory', ''), 
                                                                   imgui.ImVec2(-1, 200))
                if changed:
                    self.backstory = new_backstory
                
                imgui.spacing()
                
                # Personality traits
                imgui.text("Personality Traits:")
                imgui.set_next_item_width(-1)
                changed, new_personality = imgui.input_text_multiline("##personality", 
                                                                     getattr(self, 'personality_traits', ''), 
                                                                     imgui.ImVec2(-1, 100))
                if changed:
                    self.personality_traits = new_personality
                
                imgui.spacing()
                
                # Ideals
                imgui.text("Ideals:")
                imgui.set_next_item_width(-1)
                changed, new_ideals = imgui.input_text_multiline("##ideals", 
                                                                getattr(self, 'ideals', ''), 
                                                                imgui.ImVec2(-1, 100))
                if changed:
                    self.ideals = new_ideals
                
                imgui.spacing()
                
                # Bonds
                imgui.text("Bonds:")
                imgui.set_next_item_width(-1)
                changed, new_bonds = imgui.input_text_multiline("##bonds", 
                                                               getattr(self, 'bonds', ''), 
                                                               imgui.ImVec2(-1, 100))
                if changed:
                    self.bonds = new_bonds
                
                imgui.spacing()
                
                # Flaws
                imgui.text("Flaws:")
                imgui.set_next_item_width(-1)
                changed, new_flaws = imgui.input_text_multiline("##flaws", 
                                                               getattr(self, 'flaws', ''), 
                                                               imgui.ImVec2(-1, 100))
                if changed:
                    self.flaws = new_flaws
                
                imgui.spacing()
                
                # General notes
                imgui.text("General Notes:")
                imgui.set_next_item_width(-1)
                changed, new_notes = imgui.input_text_multiline("##general_notes", 
                                                               getattr(self, 'general_notes', ''), 
                                                               imgui.ImVec2(-1, 150))
                if changed:
                    self.general_notes = new_notes
                
                imgui.end_child()
                
                imgui.end_table()
                
        except Exception as e:
            imgui.text(f"Equipment & Notes Error: {str(e)}")
    
    def render_tab_spells(self):
        """Render the spells tab content"""
        imgui.text("SPELLCASTING")
        imgui.separator()
        
        # Spellcasting ability
        imgui.text("Spellcasting Ability:")
        imgui.same_line()
        imgui.set_next_item_width(100)
        spellcasting_ability = getattr(self, 'spellcasting_ability', 'INT')
        abilities = ["INT", "WIS", "CHA"]
        if imgui.begin_combo("##spell_ability", spellcasting_ability):
            for ability in abilities:
                is_selected = spellcasting_ability == ability
                if imgui.selectable(ability, is_selected):
                    self.spellcasting_ability = ability
                if is_selected:
                    imgui.set_item_default_focus()
            imgui.end_combo()
        
        imgui.separator()
        
        # Spell attack bonus and save DC
        if hasattr(self, 'spellcasting_ability'):
            spell_mod = self.calculate_modifier(self.ability_scores.get(self.spellcasting_ability, 10))
            spell_attack = spell_mod + self.proficiency_bonus
            spell_save_dc = 8 + spell_mod + self.proficiency_bonus
            
            imgui.text(f"Spell Attack Bonus: {self.format_modifier(spell_attack)}")
            imgui.text(f"Spell Save DC: {spell_save_dc}")
            
        imgui.separator()
        
        # Spell slots
        imgui.text("SPELL SLOTS")
        for level in range(1, 10):
            imgui.text(f"Level {level}:")
            imgui.same_line()
            
            # Current slots
            current_slots = getattr(self, f'spell_slots_{level}_current', 0)
            imgui.set_next_item_width(50)
            changed, new_current = imgui.input_int(f"##slots_{level}_current", current_slots, 0, 0)
            if changed:
                setattr(self, f'spell_slots_{level}_current', max(0, new_current))
            
            imgui.same_line()
            imgui.text("/")
            imgui.same_line()
            
            # Max slots
            max_slots = getattr(self, f'spell_slots_{level}_max', 0)
            imgui.set_next_item_width(50)
            changed, new_max = imgui.input_int(f"##slots_{level}_max", max_slots, 0, 0)
            if changed:
                setattr(self, f'spell_slots_{level}_max', max(0, new_max))
        
        imgui.separator()
        
        # Spells known/prepared
        imgui.text("SPELLS")
        spell_text = getattr(self, 'spells_text', '')
        imgui.set_next_item_width(-1)
        changed, new_spells = imgui.input_text_multiline("##spells", spell_text, imgui.ImVec2(-1, 300))
        if changed:
            self.spells_text = new_spells
    
    def render_tab_equipment(self):
        """Render the equipment tab content"""
        imgui.text("EQUIPMENT & INVENTORY")
        imgui.separator()
        
        # Currency
        imgui.text("CURRENCY")
        currencies = [("Copper", "cp"), ("Silver", "sp"), ("Electrum", "ep"), ("Gold", "gp"), ("Platinum", "pp")]
        
        for name, abbrev in currencies:
            imgui.text(f"{name} ({abbrev}):")
            imgui.same_line()
            imgui.set_next_item_width(80)
            current_amount = getattr(self, f'currency_{abbrev}', 0)
            changed, new_amount = imgui.input_int(f"##{abbrev}", current_amount, 0, 0)
            if changed:
                setattr(self, f'currency_{abbrev}', max(0, new_amount))
        
        imgui.separator()
        
        # Equipment list
        imgui.text("EQUIPMENT LIST")
        equipment_text = getattr(self, 'equipment_detailed', self.equipment)
        imgui.set_next_item_width(-1)
        changed, new_equipment = imgui.input_text_multiline("##equipment_detailed", equipment_text, imgui.ImVec2(-1, 200))
        if changed:
            self.equipment_detailed = new_equipment
            
        imgui.separator()
        
        # Carrying capacity
        str_score = self.ability_scores["STR"]
        carrying_capacity = str_score * 15
        imgui.text(f"Carrying Capacity: {carrying_capacity} lbs")
        
        # Current weight
        current_weight = getattr(self, 'current_weight', 0)
        imgui.text("Current Weight:")
        imgui.same_line()
        imgui.set_next_item_width(80)
        changed, new_weight = imgui.input_int("##current_weight", current_weight, 0, 0)
        if changed:
            self.current_weight = max(0, new_weight)
            
        # Weight status
        if hasattr(self, 'current_weight'):
            if self.current_weight > carrying_capacity:
                imgui.text_colored((1.0, 0.0, 0.0, 1.0), "OVERLOADED!")
            elif self.current_weight > carrying_capacity * 0.8:
                imgui.text_colored((1.0, 0.8, 0.0, 1.0), "Heavy Load")
            else:
                imgui.text_colored((0.0, 1.0, 0.0, 1.0), "Normal Load")
        
        imgui.separator()
        
        # Treasure
        imgui.text("TREASURE & VALUABLES")
        treasure_text = getattr(self, 'treasure_text', '')
        imgui.set_next_item_width(-1)
        changed, new_treasure = imgui.input_text_multiline("##treasure", treasure_text, imgui.ImVec2(-1, 150))
        if changed:
            self.treasure_text = new_treasure
    
    def _safe_render_with_error_limit(self, render_func, context_name="render"):
        """Safely execute a render function with error limiting"""
        import time
        
        current_time = time.time()
        
        # If we're in crash prevention mode, just show a message
        if self._crash_prevention_mode:
            imgui.text(f"Character Sheet in crash prevention mode.")
            imgui.text("Click 'Reset' to try again.")
            if imgui.button("Reset Character Sheet"):
                self._reset_error_state()
            return
        
        # Check if we've had too many errors recently
        if current_time - self._last_error_time > 10.0:  # Reset error count after 10 seconds
            self._error_count = 0
        
        try:
            render_func()
        except Exception as e:
            self._error_count += 1
            self._last_error_time = current_time
            
            # Log error only once per type to prevent flooding
            error_msg = f"Error in {context_name}: {str(e)[:100]}"
            if self._error_count <= 3:  # Only log first 3 errors
                logger.error(error_msg)
            
            # Enter crash prevention mode if too many errors
            if self._error_count >= self._max_errors:
                self._crash_prevention_mode = True
                logger.error(f"Character Sheet entering crash prevention mode after {self._error_count} errors")
                self.show_full_window = False
            
            # Show user-friendly error message
            imgui.text_colored((1.0, 0.3, 0.3, 1.0), f"Render Error #{self._error_count}")
            imgui.text(f"Context: {context_name}")
            if self._error_count < self._max_errors:
                imgui.text("Attempting to continue...")
            else:
                imgui.text("Too many errors - entering safe mode")
    
    def _reset_error_state(self):
        """Reset error tracking state"""
        self._error_count = 0
        self._last_error_time = 0
        self._window_error_occurred = False
        self._crash_prevention_mode = False
        logger.info("Character Sheet error state reset")
        
    def _check_for_imgui_flood(self):
        """Detect if ImGui is flooding with errors and force emergency close"""
        import time
        current_time = time.time()
        
        # Check if we've seen this specific error pattern
        if hasattr(self, '_flood_detection_start'):
            time_since_start = current_time - self._flood_detection_start
            if time_since_start > 2.0:  # If flooding for more than 2 seconds
                self._imgui_flood_detected = True
                self._emergency_close = True
                self.show_full_window = False
                logger.error("EMERGENCY: ImGui flooding detected - forcing window close")
                return True
        else:
            self._flood_detection_start = current_time
        
        return False
