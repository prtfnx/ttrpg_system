#!/usr/bin/env python3
"""
Character Sheet Window - Standalone character sheet in popup window
"""
import random
import re
from pathlib import Path
from imgui_bundle import imgui
from typing import Dict, Optional
from logger import setup_logger
logger = setup_logger(__name__)
from core_table.compendiums.characters.character import Character, AbilityScore

class CharacterSheetWindow:
    def __init__(self, context=None, actions_bridge=None):
        self.context = context
        self.actions_bridge = actions_bridge
        self.character: Optional[Character] = None
        
        # Window state
        self.show_full_window = True
        self.selected_entity_id = None
        self.parent_panel = None  # Reference to parent panel for signaling
        self.character_id = None  # ID for saving character changes back to CharacterManager
        
        # Character sheet fields for performance (window display cache)
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
    
    def render(self):
        """Main render method called by the GUI system"""
        return self.render_full_window()
    
    def render_full_window(self):
        """Render full character sheet in separate window"""
        if not self.show_full_window:
            return False
              # Simple window setup without viewport complications
        flags = imgui.WindowFlags_.no_collapse.value
        imgui.set_next_window_size((1300, 900), imgui.Cond_.first_use_ever.value)
        imgui.set_next_window_pos((100, 100), imgui.Cond_.first_use_ever.value)
        
        expanded, self.show_full_window = imgui.begin("Character Sheet - Full View", self.show_full_window, flags)
        if expanded:
            # Close button and character info
            if imgui.button("Close", (100, 30)):
                self.save_to_character()  # Save changes before closing
                self.show_full_window = False
                # Signal parent panel that window is closed and data updated
                if self.parent_panel:
                    self.parent_panel.show_full_window = False
                    # Force panel to reload character data
                    self.parent_panel._sync_panel_from_character()
                logger.info("Character sheet window closed via Close button")
                
            imgui.same_line()
            if imgui.button("Save", (80, 30)):
                self.save_to_character()
                logger.info("Character data manually saved")
                
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
                
                # Images tab
                if imgui.begin_tab_item("Images")[0]:
                    self.render_tab_images()
                    imgui.end_tab_item()
                
                imgui.end_tab_bar()
        else:
            # Window was closed via X button
            self.save_to_character()  # Save changes before closing
            self.show_full_window = False
            # Signal parent panel that window is closed and data updated
            if self.parent_panel:
                self.parent_panel.show_full_window = False
                # Force panel to reload character data
                self.parent_panel._sync_panel_from_character()
            logger.info("Character sheet window closed via X button")
            
        
        imgui.end()
        return self.show_full_window
    
    def render_main_character_sheet(self):
        """Render the main character sheet content (Tab 1)"""
        try:
            # Header section (spans full width)
            self.render_header_section()
            
            # Create main content table with 2 columns - wider combat section
            table_begun = imgui.begin_table("CharacterSheetTable", 2, 
                                imgui.TableFlags_.borders_inner_v.value)
            if table_begun:
                try:
                    # Setup columns with fixed sizes to prevent resize conflicts
                    imgui.table_setup_column("Left", imgui.TableColumnFlags_.width_fixed.value, 500.0)
                    imgui.table_setup_column("Right", imgui.TableColumnFlags_.width_fixed.value, 750.0)
                    imgui.table_next_row()
                    
                    # Left column - Ability Scores with Saves/Skills alongside
                    imgui.table_next_column()
                    self.render_ability_scores_with_saves_skills()
                    
                    # Right column - Combat Stats, Attacks & Equipment, Features & Traits
                    imgui.table_next_column()
                    self.render_combat_stats()
                    self.render_attacks_equipment()
                    self.render_features_traits()
                finally:
                    # Always end the table, even if an exception occurs
                    imgui.end_table()
            
        except Exception as e:
            logger.error(f"Character Sheet Error: {e}")
            imgui.text(f"Character Sheet Error: {str(e)}")
            imgui.text("Please check the console for details.")
    
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
            self.auto_save_changes()
            
        imgui.same_line()
        imgui.set_next_item_width(180)
        changed, new_class = imgui.input_text("##class_level", self.class_level)
        if changed:
            self.class_level = new_class
            self.auto_save_changes()
            
        imgui.same_line()
        imgui.set_next_item_width(180)
        changed, new_bg = imgui.input_text("##background", self.background)
        if changed:
            self.background = new_bg
            self.auto_save_changes()
            
        imgui.same_line()
        imgui.set_next_item_width(180)
        changed, new_player = imgui.input_text("##player_name", self.player_name)
        if changed:
            self.player_name = new_player
            self.auto_save_changes()
            
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
            self.auto_save_changes()
            
        imgui.same_line()
        imgui.set_next_item_width(180)
        changed, new_align = imgui.input_text("##alignment", self.alignment)
        if changed:
            self.alignment = new_align
            self.auto_save_changes()
            
        imgui.same_line()
        imgui.set_next_item_width(180)
        changed, new_xp = imgui.input_int("##experience", self.experience_points, 0, 0)
        if changed:
            self.experience_points = max(0, new_xp)
            self.auto_save_changes()
            
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
                self.auto_save_changes()
                
            imgui.end_group()
            imgui.spacing()
            
        imgui.separator()
        
    def render_ability_scores_with_saves_skills(self):
        """Render ability scores with saving throws and skills alongside"""
        # First render inspiration/proficiency at the top
        self.render_inspiration_proficiency()
        
        # Create a horizontal layout with ability scores on left, saves/skills on right
        if imgui.begin_table("AbilityScoresSavesSkills", 2, imgui.TableFlags_.borders_inner_v.value):
            # Setup columns
            imgui.table_setup_column("Abilities", imgui.TableColumnFlags_.width_fixed.value, 200.0)
            imgui.table_setup_column("SavesSkills", imgui.TableColumnFlags_.width_fixed.value, 240.0)
            imgui.table_next_row()
            
            # Left column - Ability Scores only
            imgui.table_next_column()
            self.render_ability_scores()
            
            # Right column - Saving Throws, Skills, and Passive Perception
            imgui.table_next_column()
            self.render_saving_throws()
            self.render_skills()
            self.render_passive_perception()
            
            imgui.end_table()
        
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
                self.auto_save_changes()
                
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
                self.auto_save_changes()
                
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
            self.auto_save_changes()
            
        imgui.same_line(180)
        imgui.set_next_item_width(80)
        changed, new_curr_hp = imgui.input_int("##curr_hp", self.current_hit_points, 0, 0)
        if changed:
            self.current_hit_points = max(0, min(self.hit_point_maximum, new_curr_hp))
            self.auto_save_changes()
            
        imgui.same_line(360)
        imgui.set_next_item_width(80)
        changed, new_temp_hp = imgui.input_int("##temp_hp", self.temporary_hit_points, 0, 0)
        if changed:
            self.temporary_hit_points = max(0, new_temp_hp)
            self.auto_save_changes()
            
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
            self.auto_save_changes()
            
        imgui.spacing()
        
        imgui.text("EQUIPMENT")
        imgui.set_next_item_width(-1)
        changed, new_equipment = imgui.input_text_multiline("##equipment", self.equipment, imgui.ImVec2(-1, 150))
        if changed:
            self.equipment = new_equipment
            self.auto_save_changes()
            
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
        
    def _make_roll(self, roll_type: str, name: str, modifier: int, advantage: bool = False, disadvantage: bool = False):
        """Make a dice roll and send to chat"""
        if not self.actions_bridge:
            return
            
        # Roll d20
        
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
            self.auto_save_changes()
            
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
    
    def load_from_character(self):
        """Load data from Character object into window cache fields"""
        if not self.character:
            return
            
        logger.debug("Loading data from Character object to window cache")
        
        # Load basic character data - ensure strings
        self.character_name = str(self.character.name or "")
        self.player_name = str(self.character.player_name or "")
        self.experience_points = self.character.experience_points or 0
        self.alignment = str(self.character.alignment or "")
        
        # Load combat stats
        self.armor_class = self.character.armor_class or 10
        self.current_hit_points = self.character.hit_points or 8
        self.hit_point_maximum = self.character.max_hit_points or 8
        self.temporary_hit_points = getattr(self.character, 'temporary_hit_points', 0)
        self.proficiency_bonus = self.character.proficiency_bonus or 2
        self.speed = getattr(self.character, 'speed', 30)
        self.initiative = getattr(self.character, 'initiative', 0)
        
        # Load class and level info - ensure strings
        if hasattr(self.character, 'character_class') and self.character.character_class:
            class_name = self.character.character_class.name if hasattr(self.character.character_class, 'name') else str(self.character.character_class)
            self.class_level = f"{class_name} {self.character.level}"
        else:
            self.class_level = f"Level {self.character.level}"
        
        # Load race, background if they exist - ensure strings
        if hasattr(self.character, 'race') and self.character.race:
            self.race = str(self.character.race.name if hasattr(self.character.race, 'name') else self.character.race)
        else:
            self.race = ""
            
        if hasattr(self.character, 'background') and self.character.background:
            self.background = str(self.character.background.name if hasattr(self.character.background, 'name') else self.character.background)
        else:
            self.background = ""
        
        # Load ability scores if available
        if hasattr(self.character, 'ability_scores'):
            try:
                ability_map = {
                    "STRENGTH": "STR",
                    "DEXTERITY": "DEX", 
                    "CONSTITUTION": "CON",
                    "INTELLIGENCE": "INT",
                    "WISDOM": "WIS",
                    "CHARISMA": "CHA"
                }
                
                ability_scores = getattr(self.character, 'ability_scores', {})
                if ability_scores and hasattr(ability_scores, 'items'):
                    for ability_enum, score in ability_scores.items():
                        ability_name = ability_enum.name if hasattr(ability_enum, 'name') else str(ability_enum)
                        if ability_name in ability_map:
                            self.ability_scores[ability_map[ability_name]] = score
                        
            except Exception as e:
                logger.debug(f"Error loading ability scores: {e}")
        
        # Load additional combat stats - ensure proper types
        self.inspiration = getattr(self.character, 'inspiration', False)
        self.hit_dice = str(getattr(self.character, 'hit_dice', '1d8'))
        self.total_hit_dice = str(getattr(self.character, 'total_hit_dice', '1d8'))
        
        # Load death saves
        death_successes = getattr(self.character, 'death_save_successes', [False, False, False])
        death_failures = getattr(self.character, 'death_save_failures', [False, False, False])
        self.death_save_successes = death_successes.copy() if isinstance(death_successes, list) else [False, False, False]
        self.death_save_failures = death_failures.copy() if isinstance(death_failures, list) else [False, False, False]
        
        # Load skills and saving throws
        character_skills = getattr(self.character, 'skills', {})
        if isinstance(character_skills, dict):
            for skill_name, skill_data in character_skills.items():
                if skill_name in self.skills and isinstance(skill_data, dict):
                    self.skills[skill_name].update(skill_data)
        
        character_saves = getattr(self.character, 'saving_throws', {})
        if isinstance(character_saves, dict):
            for ability, save_data in character_saves.items():
                if ability in self.saving_throws and isinstance(save_data, dict):
                    self.saving_throws[ability].update(save_data)
        
        # Load text fields - ensure they are strings, not lists
        # Convert lists to newline-separated strings if needed
        def convert_to_string(value):
            if isinstance(value, list):
                return '\n'.join(str(item) for item in value)
            return str(value) if value is not None else ''
        
        self.attacks_spellcasting = convert_to_string(getattr(self.character, 'attacks_spellcasting', ''))
        self.equipment = convert_to_string(getattr(self.character, 'equipment', ''))
        self.other_proficiencies_languages = convert_to_string(getattr(self.character, 'other_proficiencies_languages', ''))
        self.features_traits = convert_to_string(getattr(self.character, 'features_traits', ''))
        
        # Update derived stats
        self.update_derived_stats()
        
        logger.debug(f"Window cache loaded from Character object: {self.character_name}")
        
    def set_parent_panel(self, parent_panel):
        """Set reference to parent panel for signaling when window closes"""
        self.parent_panel = parent_panel
    
    def save_to_character(self):
        """Save character data directly to the Character object"""
        if not self.character:
            logger.debug("No character object to save to")
            return
            
        logger.info("Saving window data directly to Character object")
        logger.info(f"Character data saved: {self.character.name}")
        
        try:
            # Basic character info
            self.character.name = self.character_name
            self.character.player_name = self.player_name
            self.character.experience_points = self.experience_points
            self.character.alignment = self.alignment
            
            # Extract and set level
            level = self.extract_level_from_class_level()
            self.character.level = level
            
            # Ability scores - map from short names to enum values
            ability_map = {
                "STR": AbilityScore.STRENGTH,
                "DEX": AbilityScore.DEXTERITY,
                "CON": AbilityScore.CONSTITUTION,
                "INT": AbilityScore.INTELLIGENCE,
                "WIS": AbilityScore.WISDOM,
                "CHA": AbilityScore.CHARISMA
            }
            
            for ability_str, score in self.ability_scores.items():
                if ability_str in ability_map:
                    ability_enum = ability_map[ability_str]
                    self.character.ability_scores[ability_enum] = score
            
            # Combat stats - save all combat-related fields
            self.character.armor_class = self.armor_class
            self.character.hit_points = self.current_hit_points
            self.character.max_hit_points = self.hit_point_maximum
            # Note: proficiency_bonus is calculated automatically, not saved manually
            
            # Save skills and saving throws
            # Set additional fields dynamically if possible
            additional_fields = {
                'temporary_hit_points': self.temporary_hit_points,
                'speed': self.speed,
                'initiative': self.initiative,
                'inspiration': self.inspiration,
                'hit_dice': self.hit_dice,
                'total_hit_dice': self.total_hit_dice,
                'death_save_successes': self.death_save_successes.copy(),
                'death_save_failures': self.death_save_failures.copy(),
                'skills': self.skills.copy(),
                'saving_throws': self.saving_throws.copy(),
                'race': self.race if hasattr(self, 'race') else "",
                'background': self.background if hasattr(self, 'background') else "",
                # Text fields - save as strings or convert to lists if needed
                'attacks_spellcasting': self.attacks_spellcasting,
                'equipment': self.equipment,
                'other_proficiencies_languages': self.other_proficiencies_languages,
                'features_traits': self.features_traits
            }
            
            for field_name, value in additional_fields.items():
                try:
                    setattr(self.character, field_name, value)
                except AttributeError as e:
                    logger.debug(f"Could not set {field_name}: {e}")
            
            # Try to update calculated values if the method exists
            try:
                self.character.update_calculated_values()
            except AttributeError:
                logger.debug("Character object does not have update_calculated_values method")
            
            logger.info(f"Character object updated directly: {self.character.name}")
            
            # Also save to CharacterManager if available to ensure persistence
            if hasattr(self, 'actions_bridge') and self.actions_bridge:
                if hasattr(self.actions_bridge, 'update_character'):
                    # Get the character ID from the character sheet window or parent panel
                    character_id = getattr(self, 'character_id', None)
                    if not character_id and hasattr(self, 'parent_panel') and self.parent_panel:
                        character_id = getattr(self.parent_panel, 'selected_entity_id', None)
                    
                    if character_id:
                        success = self.actions_bridge.update_character(character_id, self.character)
                        if success:
                            logger.info(f"Character data persisted to CharacterManager: {character_id}")
                        else:
                            logger.warning(f"Failed to persist character data to CharacterManager: {character_id}")
                    else:
                        logger.warning("No character ID available for persisting character data")
                else:
                    logger.debug("Actions bridge does not have update_character method")
            else:
                logger.debug("No actions bridge available for persisting character data")
        except Exception as e:
            logger.error(f"Error updating character object: {e}")
    
    def extract_level_from_class_level(self):
        """Extract numeric level from class_level string"""
        
        match = re.search(r'\d+', self.class_level)
        return int(match.group()) if match else 1
    
    def extract_class_from_class_level(self):
        """Extract class name from class_level string"""
       
        # Remove numbers and extra whitespace
        class_name = re.sub(r'\d+', '', self.class_level).strip()
        return class_name if class_name else self.class_level

    def auto_save_changes(self):
        """Automatically save changes from window cache to Character object"""
        self.save_to_character()
        
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
    
    def render_tab_images(self):
        """Render the images tab content"""
        imgui.text("CHARACTER IMAGES")
        imgui.separator()
        
        # Token/Avatar selection
        imgui.text("Token Image (for table):")
        if hasattr(self, 'token_image_path'):
            token_display = f"Selected: {Path(self.token_image_path).name}" if self.token_image_path else "No token selected"
        else:
            self.token_image_path = ""
            token_display = "No token selected"
        
        imgui.text(token_display)
        
        if imgui.button("Browse for Token Image", (200, 30)):
            self._open_images_folder()
        
        imgui.same_line()
        if imgui.button("Clear Token", (120, 30)):
            self.token_image_path = ""
        
        imgui.separator()
        
        # Avatar image selection  
        imgui.text("Avatar Image (for character sheet):")
        if hasattr(self, 'avatar_image_path'):
            avatar_display = f"Selected: {Path(self.avatar_image_path).name}" if self.avatar_image_path else "No avatar selected"
        else:
            self.avatar_image_path = ""
            avatar_display = "No avatar selected"
            
        imgui.text(avatar_display)
        
        if imgui.button("Browse for Avatar Image", (200, 30)):
            self._open_images_folder()
        
        imgui.same_line()
        if imgui.button("Clear Avatar", (120, 30)):
            self.avatar_image_path = ""
        
        imgui.separator()
        
        # Manual path input
        imgui.text("Or enter image paths manually:")
        
        imgui.text("Token path:")
        imgui.set_next_item_width(400)
        changed, new_token = imgui.input_text("##token_path", self.token_image_path or "")
        if changed:
            self.token_image_path = new_token
        
        imgui.text("Avatar path:")
        imgui.set_next_item_width(400)
        changed, new_avatar = imgui.input_text("##avatar_path", self.avatar_image_path or "")
        if changed:
            self.avatar_image_path = new_avatar
        
        imgui.separator()
        
        # Update sprite button
        if imgui.button("Update Character Sprite", (200, 40)):
            self._update_character_sprite()
    
    def _open_images_folder(self):
        """Open the images folder in system file manager"""
        try:
            from pathlib import Path
            import subprocess
            import sys
            
            # Create images folder if it doesn't exist
            images_folder = Path("resources/images")
            images_folder.mkdir(parents=True, exist_ok=True)
            
            # Open folder in system file manager
            if sys.platform == "win32":
                subprocess.run(['explorer', str(images_folder)], shell=True)
            elif sys.platform == "darwin":
                subprocess.run(['open', str(images_folder)])
            else:
                subprocess.run(['xdg-open', str(images_folder)])
                
            logger.info(f"Opened images folder: {images_folder}")
            
        except Exception as e:
            logger.error(f"Error opening images folder: {e}")
    
    def _update_character_sprite(self):
        """Update the character's sprite on the table"""
        if not hasattr(self, 'selected_entity_id') or not self.selected_entity_id:
            logger.warning("No character selected for sprite update")
            return
            
        if not hasattr(self, 'token_image_path') or not self.token_image_path:
            logger.warning("No token image selected")
            return
            
        try:
            # Get actions bridge from context
            if hasattr(self, 'context') and self.context and hasattr(self.context, 'gui_bridge'):
                actions_bridge = self.context.gui_bridge
            elif hasattr(self, 'actions_bridge') and self.actions_bridge:
                actions_bridge = self.actions_bridge
            else:
                logger.warning("No actions bridge available for sprite update")
                return
            
            # Delete existing sprite if it exists
            try:
                actions_bridge.delete_sprite(self.selected_entity_id)
                logger.debug(f"Deleted existing sprite for {self.selected_entity_id}")
            except:
                logger.debug(f"No existing sprite found for {self.selected_entity_id}")
            
            # Create new sprite with updated image
            result = actions_bridge.create_sprite(
                sprite_id=self.selected_entity_id,
                image_path=self.token_image_path,
                x=500.0,
                y=500.0,
                layer="tokens"
            )
            
            if result:
                logger.info(f"Updated sprite for character {self.selected_entity_id}")
                actions_bridge.add_chat_message("Character sprite updated")
            else:
                logger.error(f"Failed to update sprite for character {self.selected_entity_id}")
                actions_bridge.add_chat_message("Failed to update character sprite")
                
        except Exception as e:
            logger.error(f"Error updating character sprite: {e}")

