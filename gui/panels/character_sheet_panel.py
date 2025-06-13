#!/usr/bin/env python3
"""
D&D 5E Character Sheet Panel - Official Layout Recreation
Matches the official D&D 5E character sheet PDF with fantasy styling
"""

from imgui_bundle import imgui
import math
from typing import Dict, List, Optional, Tuple
from core_table.compendiums.characters.character import (
    Character, AbilityScore, Skill, Race, CharacterClass, Background, Feat,
    AbilityScoreIncrease, Size
)


class CharacterSheetPanel:
    def __init__(self, context=None, actions_bridge=None):
        self.context = context
        self.actions_bridge = actions_bridge
        self.character = Character()
        
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
        
    def setup_fantasy_style(self):
        """Setup fantasy parchment-style theme"""
        style = imgui.get_style()
        
        # Apply colors using the correct imgui_bundle syntax
        # Use .value to get the integer value from the enum
        style.color_(imgui.Col_.window_bg.value).x = 0.96
        style.color_(imgui.Col_.window_bg.value).y = 0.92
        style.color_(imgui.Col_.window_bg.value).z = 0.86
        style.color_(imgui.Col_.window_bg.value).w = 1.00
        
        style.color_(imgui.Col_.child_bg.value).x = 0.98
        style.color_(imgui.Col_.child_bg.value).y = 0.94
        style.color_(imgui.Col_.child_bg.value).z = 0.82
        style.color_(imgui.Col_.child_bg.value).w = 1.00
        
        style.color_(imgui.Col_.frame_bg.value).x = 0.98
        style.color_(imgui.Col_.frame_bg.value).y = 0.94
        style.color_(imgui.Col_.frame_bg.value).z = 0.82
        style.color_(imgui.Col_.frame_bg.value).w = 1.00
        
        style.color_(imgui.Col_.text.value).x = 0.35
        style.color_(imgui.Col_.text.value).y = 0.27
        style.color_(imgui.Col_.text.value).z = 0.13
        style.color_(imgui.Col_.text.value).w = 1.00
        
        style.color_(imgui.Col_.border.value).x = 0.63
        style.color_(imgui.Col_.border.value).y = 0.47
        style.color_(imgui.Col_.border.value).z = 0.31
        style.color_(imgui.Col_.border.value).w = 1.00
        
        # Styling
        style.frame_rounding = 5.0
        style.window_rounding = 10.0
        style.child_rounding = 8.0
        style.frame_padding = imgui.ImVec2(12, 8)
        style.item_spacing = imgui.ImVec2(12, 8)
        style.window_padding = imgui.ImVec2(20, 20)
        
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
        
        # Update initiative
        self.initiative = self.calculate_modifier(self.ability_scores["DEX"])
        
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
        changed, new_xp = imgui.input_int("##experience", self.experience_points)
        if changed:
            self.experience_points = max(0, new_xp)
            
        imgui.separator()
        
    def render_ability_scores(self):
        """Render the ability scores section"""
        imgui.text("ABILITY SCORES")
        imgui.spacing()
        
        abilities = ["STR", "DEX", "CON", "INT", "WIS", "CHA"]
        ability_names = ["STRENGTH", "DEXTERITY", "CONSTITUTION", "INTELLIGENCE", "WISDOM", "CHARISMA"]
        
        # Create ability score boxes in a row
        for i, (ability, full_name) in enumerate(zip(abilities, ability_names)):
            if i > 0:
                imgui.same_line()
                
            # Create a group for each ability score
            imgui.begin_group()
            
            # Ability name
            imgui.text(full_name)
            imgui.spacing()
            
            # Modifier (large circle)
            modifier = self.calculate_modifier(self.ability_scores[ability])
            modifier_text = self.format_modifier(modifier)
            
            # Draw modifier circle
            draw_list = imgui.get_window_draw_list()
            pos = imgui.get_cursor_screen_pos()
            center = imgui.ImVec2(pos.x + 30, pos.y + 25)
            draw_list.add_circle(center, 25, imgui.color_convert_float4_to_u32(imgui.ImVec4(0.63, 0.47, 0.31, 1.0)), 0, 2.0)
            
            # Center the modifier text
            text_size = imgui.calc_text_size(modifier_text)
            text_pos = imgui.ImVec2(center.x - text_size.x * 0.5, center.y - text_size.y * 0.5)
            draw_list.add_text(text_pos, imgui.color_convert_float4_to_u32(imgui.ImVec4(0.35, 0.27, 0.13, 1.0)), modifier_text)
            
            # Move cursor down
            imgui.dummy(imgui.ImVec2(60, 50))
            
            # Score input
            imgui.set_next_item_width(60)
            changed, new_score = imgui.input_int(f"##{ability}", self.ability_scores[ability])
            if changed:
                self.ability_scores[ability] = max(1, min(30, new_score))
                self.update_derived_stats()
                
            imgui.end_group()
            
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
        # Proficiency bonus display
        prof_text = self.format_modifier(self.proficiency_bonus)
        imgui.text(prof_text)
        
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
            
            # Bonus display
            bonus = self.saving_throws[ability]["value"]
            bonus_text = self.format_modifier(bonus)
            imgui.text(f"{bonus_text} {ability}")
            
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
            
            # Skill bonus display
            bonus = skill_data["value"]
            bonus_text = self.format_modifier(bonus)
            ability = skill_data["ability"]
            imgui.text(f"{bonus_text} {skill_name} ({ability})")
            
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
        changed, new_ac = imgui.input_int("##ac", self.armor_class)
        if changed:
            self.armor_class = max(0, new_ac)
            
        imgui.same_line(120)
        initiative_text = self.format_modifier(self.initiative)
        imgui.text(initiative_text)
        
        imgui.same_line(240)
        imgui.set_next_item_width(80)
        changed, new_speed = imgui.input_int("##speed", self.speed)
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
        changed, new_max_hp = imgui.input_int("##max_hp", self.hit_point_maximum)
        if changed:
            self.hit_point_maximum = max(1, new_max_hp)
            
        imgui.same_line(180)
        imgui.set_next_item_width(80)
        changed, new_curr_hp = imgui.input_int("##curr_hp", self.current_hit_points)
        if changed:
            self.current_hit_points = max(0, min(self.hit_point_maximum, new_curr_hp))
            
        imgui.same_line(360)
        imgui.set_next_item_width(80)
        changed, new_temp_hp = imgui.input_int("##temp_hp", self.temporary_hit_points)
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
        changed, new_features = imgui.input_text_multiline("##features", self.features_traits, imgui.ImVec2(-1, 200))
        if changed:
            self.features_traits = new_features
            
        imgui.separator()
        
    def render_passive_perception(self):
        """Render passive perception"""
        imgui.text(f"Passive Wisdom (Perception): {self.passive_perception}")
        imgui.separator()    
    def render(self):
        """Main render method for the character sheet"""
        try:
            self.setup_fantasy_style()
            
            # Header section (spans full width)
            self.render_header_section()
            
            # Create main content table with 3 columns
            if imgui.begin_table("CharacterSheetTable", 3, 
                                imgui.TableFlags_.resizable.value | 
                                imgui.TableFlags_.borders_inner_v.value):
                
                # Setup columns
                imgui.table_setup_column("Left", imgui.TableColumnFlags_.width_fixed.value, 300.0)
                imgui.table_setup_column("Center", imgui.TableColumnFlags_.width_fixed.value, 350.0)
                imgui.table_setup_column("Right", imgui.TableColumnFlags_.width_stretch.value)
                
                imgui.table_next_row()
                
                # Left column - Ability Scores, Saving Throws, Skills
                imgui.table_next_column()
                if imgui.begin_child("LeftColumn", imgui.ImVec2(0, 0)):
                    self.render_ability_scores()
                    self.render_inspiration_proficiency()
                    self.render_saving_throws()
                    self.render_skills()
                    self.render_passive_perception()
                imgui.end_child()
                    
                # Center column - Combat Stats, Attacks & Equipment
                imgui.table_next_column()
                if imgui.begin_child("CenterColumn", imgui.ImVec2(0, 0)):
                    self.render_combat_stats()
                    self.render_attacks_equipment()
                imgui.end_child()
                    
                # Right column - Features & Traits
                imgui.table_next_column()
                if imgui.begin_child("RightColumn", imgui.ImVec2(0, 0)):
                    self.render_features_traits()
                imgui.end_child()
                    
                imgui.end_table()
            
        except Exception as e:
            imgui.text(f"Character Sheet Error: {str(e)}")
            imgui.text("Please check the console for details.")
        
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
