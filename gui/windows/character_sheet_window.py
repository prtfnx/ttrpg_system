#!/usr/bin/env python3
"""
Character Sheet Window - Standalone character sheet in popup window
"""

from imgui_bundle import imgui
from typing import Dict, Optional

from logger import setup_logger
logger = setup_logger(__name__)


class CharacterSheetWindow:
    def __init__(self, context=None, character_data=None):
        self.context = context
        self.character_data = character_data or {}
        self.window_open = True
        
        # Character fields
        self.name = self.character_data.get('name', '')
        self.class_level = self.character_data.get('class_level', '')
        self.race = self.character_data.get('race', '')
        self.background = self.character_data.get('background', '')
        self.alignment = self.character_data.get('alignment', '')
        
        # Ability scores
        self.ability_scores = self.character_data.get('ability_scores', {
            'STR': 10, 'DEX': 10, 'CON': 10,
            'INT': 10, 'WIS': 10, 'CHA': 10
        })
        
        # Combat stats
        hp_data = self.character_data.get('hit_points', {})
        self.current_hp = hp_data.get('current', 8)
        self.max_hp = hp_data.get('maximum', 8)
        self.temp_hp = hp_data.get('temporary', 0)
        self.armor_class = self.character_data.get('armor_class', 10)
        
        # Other data
        self.equipment = self.character_data.get('equipment', '')
        self.features = self.character_data.get('features', '')
    
    def render(self) -> bool:
        """Render character sheet window. Returns True if window should stay open."""
        if not self.window_open:
            return False
            
        imgui.set_next_window_size((800, 600), imgui.Cond_.first_use_ever.value)
        imgui.set_next_window_pos((200, 100), imgui.Cond_.first_use_ever.value)
        
        window_title = f"Character Sheet - {self.name or 'Unnamed'}"
        expanded, self.window_open = imgui.begin(window_title, self.window_open)
        
        if expanded:
            self._render_character_sheet()
        
        imgui.end()
        return self.window_open or False
    
    def _render_character_sheet(self):
        """Render the character sheet content"""
        # Header section
        self._render_header()
        imgui.separator()
        
        # Main content in columns
        if imgui.begin_table("CharacterTable", 2, imgui.TableFlags_.resizable.value):
            imgui.table_setup_column("Left", imgui.TableColumnFlags_.width_fixed.value, 350.0)
            imgui.table_setup_column("Right", imgui.TableColumnFlags_.width_stretch.value)
            imgui.table_next_row()
            
            # Left column
            imgui.table_next_column()
            self._render_ability_scores()
            imgui.separator()
            self._render_combat_stats()
            
            # Right column  
            imgui.table_next_column()
            self._render_equipment()
            imgui.separator()
            self._render_features()
            
            imgui.end_table()
    
    def _render_header(self):
        """Render character header info"""
        imgui.text("Name:")
        imgui.same_line()
        imgui.set_next_item_width(200)
        changed, self.name = imgui.input_text("##name", self.name)
        
        imgui.same_line()
        imgui.text("Class/Level:")
        imgui.same_line()
        imgui.set_next_item_width(150)
        changed, self.class_level = imgui.input_text("##class", self.class_level)
        
        imgui.text("Race:")
        imgui.same_line()
        imgui.set_next_item_width(150)
        changed, self.race = imgui.input_text("##race", self.race)
        
        imgui.same_line()
        imgui.text("Background:")
        imgui.same_line() 
        imgui.set_next_item_width(150)
        changed, self.background = imgui.input_text("##background", self.background)
        
        imgui.text("Alignment:")
        imgui.same_line()
        imgui.set_next_item_width(150)
        changed, self.alignment = imgui.input_text("##alignment", self.alignment)
    
    def _render_ability_scores(self):
        """Render ability scores section"""
        imgui.text("ABILITY SCORES")
        
        abilities = [("STR", "Strength"), ("DEX", "Dexterity"), ("CON", "Constitution"),
                    ("INT", "Intelligence"), ("WIS", "Wisdom"), ("CHA", "Charisma")]
        
        for abbrev, full_name in abilities:
            score = self.ability_scores.get(abbrev, 10)
            modifier = (score - 10) // 2
            mod_text = f"+{modifier}" if modifier >= 0 else str(modifier)
            
            imgui.text(f"{abbrev}:")
            imgui.same_line()
            imgui.set_next_item_width(60)
            changed, new_score = imgui.input_int(f"##score_{abbrev}", score, 0, 0)
            if changed:
                self.ability_scores[abbrev] = max(1, min(30, new_score))
            
            imgui.same_line()
            imgui.text(f"({mod_text})")
    
    def _render_combat_stats(self):
        """Render combat statistics"""
        imgui.text("COMBAT STATS")
        
        # Armor Class
        imgui.text("AC:")
        imgui.same_line()
        imgui.set_next_item_width(80)
        changed, self.armor_class = imgui.input_int("##ac", self.armor_class, 0, 0)
        
        # Hit Points
        imgui.text("HP:")
        imgui.same_line()
        imgui.set_next_item_width(60)
        changed, self.current_hp = imgui.input_int("##current_hp", self.current_hp, 0, 0)
        if changed:
            self.current_hp = max(0, min(self.max_hp, self.current_hp))
        
        imgui.same_line()
        imgui.text("/")
        imgui.same_line()
        imgui.set_next_item_width(60)
        changed, self.max_hp = imgui.input_int("##max_hp", self.max_hp, 0, 0)
        if changed:
            self.max_hp = max(1, self.max_hp)
        
        # Temp HP
        if self.temp_hp > 0 or imgui.button("Add Temp HP"):
            imgui.text("Temp HP:")
            imgui.same_line()
            imgui.set_next_item_width(60)
            changed, self.temp_hp = imgui.input_int("##temp_hp", self.temp_hp, 0, 0)
            if changed:
                self.temp_hp = max(0, self.temp_hp)
    
    def _render_equipment(self):
        """Render equipment section"""
        imgui.text("EQUIPMENT")
        imgui.set_next_item_width(-1)
        changed, self.equipment = imgui.input_text_multiline("##equipment", self.equipment, 
                                                            imgui.ImVec2(-1, 200))
    
    def _render_features(self):
        """Render features and traits"""
        imgui.text("FEATURES & TRAITS")
        imgui.set_next_item_width(-1)
        changed, self.features = imgui.input_text_multiline("##features", self.features,
                                                           imgui.ImVec2(-1, 200))
    
    def get_character_data(self) -> Dict:
        """Export current character data"""
        return {
            'name': self.name,
            'class_level': self.class_level,
            'race': self.race,
            'background': self.background,
            'alignment': self.alignment,
            'ability_scores': self.ability_scores.copy(),
            'hit_points': {
                'current': self.current_hp,
                'maximum': self.max_hp,
                'temporary': self.temp_hp
            },
            'armor_class': self.armor_class,
            'equipment': self.equipment,
            'features': self.features
        }
