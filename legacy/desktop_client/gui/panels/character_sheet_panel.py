#!/usr/bin/env python3
"""
D&D 5E Character Sheet Panel - Official Layout Recreation
Matches the official D&D 5E character sheet PDF with fantasy styling
"""
import re
from imgui_bundle import imgui
import math
import random
from typing import Dict, List, Optional, Tuple
from core_table.compendiums.characters.character import (
    Character, AbilityScore, Skill, Race, CharacterClass, Background, Feat,
    AbilityScoreIncrease, Size
)
from gui.windows.character_sheet_window import CharacterSheetWindow
from logger import setup_logger
logger = setup_logger(__name__)


class CharacterSheetPanel:
    def __init__(self, context=None, actions_bridge=None):
        self.context = context
        self.actions_bridge = actions_bridge
        self.character = Character()
        
        # Window state
        self.show_full_window = False
        self.selected_entity_id = None
        self.CharacterWindow = None
        
        # Track when character object changes to avoid unnecessary syncing
        self._last_character_hash = None
        
        # Character sheet fields for performance (panel display cache)
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
        
    def get_ability_score(self, ability_str):
        """Get ability score from character object"""
        if not self.character or not hasattr(self.character, 'ability_scores'):
            return 10
        
        ability_map = {
            "STR": AbilityScore.STRENGTH,
            "DEX": AbilityScore.DEXTERITY,
            "CON": AbilityScore.CONSTITUTION,
            "INT": AbilityScore.INTELLIGENCE,
            "WIS": AbilityScore.WISDOM,
            "CHA": AbilityScore.CHARISMA
        }
        
        ability_enum = ability_map.get(ability_str)
        if ability_enum and ability_enum in self.character.ability_scores:
            return self.character.ability_scores[ability_enum]
        return 10
    
    def set_ability_score(self, ability_str, value):
        """Set ability score in character object"""
        if not self.character:
            return
            
        ability_map = {
            "STR": AbilityScore.STRENGTH,
            "DEX": AbilityScore.DEXTERITY,
            "CON": AbilityScore.CONSTITUTION,
            "INT": AbilityScore.INTELLIGENCE,
            "WIS": AbilityScore.WISDOM,
            "CHA": AbilityScore.CHARISMA
        }
        
        ability_enum = ability_map.get(ability_str)
        if ability_enum:
            self.character.ability_scores[ability_enum] = value
        

        
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
        
    
   
    def render(self):
        """Internal render method wrapped by error handling"""
        # Check for entity selection updates
        self._check_entity_selection()
        
        # Only sync panel data from Character object if it has changed
        if self.character:
            self._sync_panel_if_character_changed()
        
        # Render mini character sheet in sidebar
        self.render_mini_character_sheet()
        
        # Render full window if open
        if self.show_full_window and self.CharacterWindow:
            self.CharacterWindow.render_full_window()
            # Sync window state - if window was closed, update our flag
            if not self.CharacterWindow.show_full_window:
                self.show_full_window = False
    
    def _check_entity_selection(self):
        """Check if a new entity is selected and load its character data"""
        if not self.actions_bridge:
            return
            
        # Get currently selected entity from actions bridge
        current_selected = self.actions_bridge.get_selected_entity()
        
        # If selection changed, load new data (but don't save panel data to Character object)
        if current_selected != self.selected_entity_id:
            if current_selected:
                # Try to load character data for the new selection
                success = self.load_from_entity(current_selected)
                if success:
                    logger.info(f"Loaded character data for entity: {current_selected}")
                else:
                    logger.debug(f"No character data found for entity: {current_selected}")
                    # Clear character data if entity has no character
                    self._clear_character_data()
                    self.selected_entity_id = current_selected
            else:
                # No entity selected, clear data
                self._clear_character_data()
                self.selected_entity_id = None
        
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
        if not entity_id:
            logger.debug(f"Cannot load entity: no entity_id provided")
            return False
        
        # First try to get character data from journal panel
        if self.context and hasattr(self.context, 'journal_panel'):
            entity_data = self.context.journal_panel.get_entity_data(entity_id)
            if entity_data and entity_data.get('type') == 'character':
                # Check for character object first
                character_obj = entity_data.get('character_object')
                if character_obj:
                    self.selected_entity_id = entity_id
                    self._load_character_data(character_obj)
                    logger.info(f"Successfully loaded character object for entity: {entity_id}")
                    return True
                    
                # Fall back to character data dict
                character_data = entity_data.get('character_data')
                if character_data:
                    self.selected_entity_id = entity_id
                    self._load_character_data(character_data)
                    logger.info(f"Successfully loaded character data for entity: {entity_id}")
                    return True
        
        # Fall back to sprite info (for backwards compatibility)
        if self.actions_bridge:
            sprite_info = self.actions_bridge.get_sprite_info(entity_id)
            logger.debug(f"Sprite info for {entity_id}: {sprite_info}")
            
            if sprite_info:
                character_data = sprite_info.get('character_data')
                if character_data:
                    self.selected_entity_id = entity_id
                    self._load_character_data(character_data)
                    logger.info(f"Successfully loaded character data from sprite for entity: {entity_id}")
                    return True
                else:
                    logger.debug(f"No character_data field in sprite info for entity: {entity_id}")
            else:
                logger.debug(f"No sprite info found for entity: {entity_id}")
        
        logger.warning(f"No character data found for entity: {entity_id}")
        return False
    
    def _load_character_data(self, character_data):
        """Load character data from Character object or dictionary"""
        logger.debug(f"Loading character data: {character_data}")
        
        # Handle Character objects directly
        if hasattr(character_data, 'to_dict'):
            # Store reference to the Character object
            self.character = character_data
            
            # Always load data from Character object to ensure panel displays current state
            self._sync_panel_from_character()
            
            logger.info(f"Successfully loaded character object for entity: {self.selected_entity_id}")
            
        elif isinstance(character_data, dict):
            # It's a dictionary - create a new Character object or use existing one
            char_dict = character_data
            
            self.character_name = char_dict.get('name', '')
            self.class_level = char_dict.get('class_level', '')
            self.race = char_dict.get('race', '')
            self.background = char_dict.get('background', '')
            self.alignment = char_dict.get('alignment', '')
            self.experience_points = char_dict.get('experience_points', 0)
            
            # Load ability scores
            ability_scores = char_dict.get('ability_scores', {})
            if isinstance(ability_scores, dict):
                for ability, score in ability_scores.items():
                    if ability.upper() in self.ability_scores:
                        self.ability_scores[ability.upper()] = score
            else:
                logger.warning(f"Ability scores data is not a dict: {type(ability_scores)}")
                    
            # Load combat stats
            combat_stats = char_dict.get('combat_stats', {})
            self.armor_class = combat_stats.get('armor_class', 10)
            self.current_hit_points = combat_stats.get('current_hit_points', 8)
            self.hit_point_maximum = combat_stats.get('hit_point_maximum', 8)
            self.temporary_hit_points = combat_stats.get('temporary_hit_points', 0)
            
            # Load skills and saving throws
            skills = char_dict.get('skills', {})
            if isinstance(skills, dict):
                for skill_name, skill_data in skills.items():
                    if skill_name in self.skills and isinstance(skill_data, dict):
                        self.skills[skill_name].update(skill_data)
            else:
                logger.warning(f"Skills data is not a dict: {type(skills)}")
                    
            saving_throws = char_dict.get('saving_throws', {})
            if isinstance(saving_throws, dict):
                for ability, save_data in saving_throws.items():
                    if ability in self.saving_throws and isinstance(save_data, dict):
                        self.saving_throws[ability].update(save_data)
            else:
                logger.warning(f"Saving throws data is not a dict: {type(saving_throws)}")
            
            logger.debug(f"Loaded from dictionary: {self.character_name}")
        else:
            logger.error(f"Invalid character data type: {type(character_data)}")
            return
        
        logger.debug(f"Set character name: {self.character_name}")
        self.update_derived_stats()
        
    def _sync_panel_if_character_changed(self):
        """Sync panel display fields from Character object only if it has changed"""
        if not self.character:
            return
            
        # Create a simple hash of key character properties to detect changes
        try:
            character_hash = hash((
                self.character.name,
                self.character.player_name,
                self.character.experience_points,
                self.character.level,
                self.character.armor_class,
                self.character.hit_points,
                self.character.max_hit_points,
                str(self.character.ability_scores) if hasattr(self.character, 'ability_scores') else "",
                getattr(self.character, 'last_modified', 0)  # If Character has a last_modified timestamp
            ))
        except Exception as e:
            logger.debug(f"Error creating character hash: {e}")
            character_hash = hash(str(self.character))
        
        # Only sync if character has actually changed
        if character_hash != self._last_character_hash:
            logger.debug("Character object changed, syncing panel display")
            self._sync_panel_from_character()
            self._last_character_hash = character_hash
        
    def _sync_panel_from_character(self):
        """Sync panel display fields from Character object"""
        if not self.character:
            return
            
        logger.debug("Syncing panel display from Character object")
        
        # Load basic character data
        self.character_name = self.character.name or ""
        self.player_name = self.character.player_name or ""
        self.experience_points = self.character.experience_points or 0
        self.alignment = self.character.alignment or ""
        
        logger.debug(f"Panel synced character_name: '{self.character_name}', selected_entity_id: '{self.selected_entity_id}'")
        
        # Load combat stats - all combat-related fields
        self.armor_class = self.character.armor_class or 10
        self.current_hit_points = self.character.hit_points or 8
        self.hit_point_maximum = self.character.max_hit_points or 8
        self.temporary_hit_points = getattr(self.character, 'temporary_hit_points', 0)
        self.proficiency_bonus = self.character.proficiency_bonus or 2
        self.speed = getattr(self.character, 'speed', 30)
        self.initiative = getattr(self.character, 'initiative', 0)
        
        # Hit dice information
        self.hit_dice = getattr(self.character, 'hit_dice', '1d8')
        self.total_hit_dice = getattr(self.character, 'total_hit_dice', '1d8')
        
        # Load class and level info
        if hasattr(self.character, 'character_class') and self.character.character_class:
            class_name = self.character.character_class.name if hasattr(self.character.character_class, 'name') else str(self.character.character_class)
            self.class_level = f"{class_name} {self.character.level}"
        else:
            self.class_level = f"Level {self.character.level}"
        
        # Load race, background if they exist
        if hasattr(self.character, 'race') and self.character.race:
            self.race = self.character.race.name if hasattr(self.character.race, 'name') else str(self.character.race)
        else:
            self.race = ""
            
        if hasattr(self.character, 'background') and self.character.background:
            self.background = self.character.background.name if hasattr(self.character.background, 'name') else str(self.character.background)
        else:
            self.background = ""
        
        # Load ability scores if available
        if hasattr(self.character, 'ability_scores') and self.character.ability_scores:
            try:
                # Map from enum keys to string keys
                ability_map = {
                    "STRENGTH": "STR",
                    "DEXTERITY": "DEX", 
                    "CONSTITUTION": "CON",
                    "INTELLIGENCE": "INT",
                    "WISDOM": "WIS",
                    "CHARISMA": "CHA"
                }
                
                for ability_enum, score in self.character.ability_scores.items():
                    ability_name = ability_enum.name if hasattr(ability_enum, 'name') else str(ability_enum)
                    if ability_name in ability_map:
                        self.ability_scores[ability_map[ability_name]] = score
                        
            except Exception as e:
                logger.debug(f"Error syncing ability scores: {e}")
        # Load additional combat stats if available
        self.temporary_hit_points = getattr(self.character, 'temporary_hit_points', 0)
        self.speed = getattr(self.character, 'speed', 30)
        self.initiative = getattr(self.character, 'initiative', 0)
        self.inspiration = getattr(self.character, 'inspiration', False)
        self.hit_dice = getattr(self.character, 'hit_dice', '1d8')
        self.total_hit_dice = getattr(self.character, 'total_hit_dice', '1d8')
        
        # Load death saves if available
        death_successes = getattr(self.character, 'death_save_successes', [False, False, False])
        death_failures = getattr(self.character, 'death_save_failures', [False, False, False])
        self.death_save_successes = death_successes.copy() if isinstance(death_successes, list) else [False, False, False]
        self.death_save_failures = death_failures.copy() if isinstance(death_failures, list) else [False, False, False]
        
        # Load skills if available
        character_skills = getattr(self.character, 'skills', {})
        if isinstance(character_skills, dict):
            for skill_name, skill_data in character_skills.items():
                if skill_name in self.skills and isinstance(skill_data, dict):
                    self.skills[skill_name].update(skill_data)
        
        # Load saving throws if available
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
                
        logger.debug(f"Panel synced from Character object: {self.character_name}")
    
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
        
        # Full window button - only enable if we have a character with data
        button_enabled = bool(self.character and (self.character_name or self.character.name) and self.selected_entity_id)
        if not button_enabled:
            imgui.push_style_color(imgui.Col_.button.value, (0.5, 0.5, 0.5, 0.5))
            imgui.push_style_color(imgui.Col_.button_hovered.value, (0.5, 0.5, 0.5, 0.5))
            imgui.push_style_color(imgui.Col_.button_active.value, (0.5, 0.5, 0.5, 0.5))
        
        clicked = imgui.button("Open Full Sheet", (-1, 30))
        
        if not button_enabled:
            imgui.pop_style_color(3)
            if imgui.is_item_hovered():
                imgui.set_tooltip("Select a character to open the full sheet")
        elif clicked:
            self._create_window()
            
            
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
            self.save_to_character_object()  # Save changes to Character object
            
        imgui.text("HP:")
        imgui.same_line()
        imgui.set_next_item_width(50)
        changed, new_hp = imgui.input_int("##mini_hp", self.current_hit_points, 0, 0)
        if changed:
            self.current_hit_points = max(0, min(self.hit_point_maximum, new_hp))
            self.save_to_character_object()  # Save changes to Character object
            
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
                    self.save_to_character_object()  # Save changes to Character object
                    
            # Failures
            imgui.text("Failures:")
            for i in range(3):
                imgui.same_line()
                changed, new_failure = imgui.checkbox(f"##death_failure_mini_{i}", self.death_save_failures[i])
                if changed:
                    self.death_save_failures[i] = new_failure
                    self.save_to_character_object()  # Save changes to Character object
                    
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
    
    def _create_window(self):
        """Create and show the full character sheet window"""
        # Always check if the journal panel already has a window for this entity
        if (hasattr(self.context, 'journal_panel') and 
            self.context.journal_panel and 
            self.selected_entity_id and
            self.selected_entity_id in self.context.journal_panel.character_windows):
            
            # Use the existing window from journal panel
            existing_window = self.context.journal_panel.character_windows[self.selected_entity_id]
            if existing_window and hasattr(existing_window, 'show_full_window'):
                existing_window.show_full_window = True
                self.CharacterWindow = existing_window  # Reference the existing window
                self.show_full_window = True
                logger.info("Using existing character sheet window from journal panel.")
                return
        
        # Only create a new window if no entity is selected or journal panel doesn't have one
        if not self.CharacterWindow or not self.CharacterWindow.show_full_window:
            self.show_full_window = True
            
            if not self.CharacterWindow:
                self.CharacterWindow = CharacterSheetWindow(context=self.context, actions_bridge=self.actions_bridge)
                
                # Add the window to the external_windows list for rendering
                if hasattr(self.context, 'imgui') and self.context.imgui:
                    if self.CharacterWindow not in self.context.imgui.external_windows:
                        self.context.imgui.external_windows.append(self.CharacterWindow)
                        logger.info("Character sheet window added to external windows for rendering.")
                
                logger.info("Character sheet window created.")
            else:
                self.CharacterWindow.show_full_window = True
                logger.info("Character sheet window reactivated.")
            
            # Pass character object directly to window and load data
            self.CharacterWindow.character = self.character
            self.CharacterWindow.parent_panel = self  # Set parent reference
            self.CharacterWindow.load_from_character()  # Load data into window cache
            logger.info("Character object passed to window and data loaded.")
        else:
            logger.warning("Character sheet window is already open.")
    
    def _handle_attack_action(self):
        """Handle attack action"""
        if self.actions_bridge:
            self.actions_bridge.add_chat_message(f"{self.character.name or 'Character'} makes an attack!")
    
    def _handle_cast_spell_action(self):
        """Handle cast spell action"""
        if self.actions_bridge:
            self.actions_bridge.add_chat_message(f"{self.character.name or 'Character'} casts a spell!")
            
    def _handle_short_rest(self):
        """Handle short rest"""
        if self.actions_bridge:              
            self.actions_bridge.add_chat_message(f"{self.character.name or 'Character'} takes a short rest.")
    
   
    
    def set_selected_entity(self, entity_id: str):
        """Set the selected entity and try to load its character data"""
        if entity_id != self.selected_entity_id:
            # Always update the selected entity ID regardless of whether character data is found
            self.selected_entity_id = entity_id
            if self.load_from_entity(entity_id):
                return True
            else:
                # Clear character data if entity has no character
                self._clear_character_data()
                return False
        return True
    
    def open_for_entity(self, entity_id: str):
        """Open character sheet for a specific entity and show full window"""
        if self.set_selected_entity(entity_id):
            self._create_window()
            return True
        return False
    
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
        
        # Save to Character object
        self.save_to_character_object()
    
    def save_to_character_object(self):
        """Save panel data to the underlying Character object"""
        if not self.character:
            logger.debug("No character object to save to")
            return
            
        logger.info("Saving panel data to Character object")
        
        try:
            # Update basic character fields that we know work
            self.character.name = self.character_name
            self.character.player_name = self.player_name
            self.character.experience_points = self.experience_points
            self.character.alignment = self.alignment
            
            # Extract level from class_level field
            if self.class_level:
                level_match = re.search(r'\d+', self.class_level)
                if level_match:
                    self.character.level = int(level_match.group())
            
            # Update ability scores using the enum
            from core_table.compendiums.characters.character import AbilityScore
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
            
            # Update combat stats - all combat-related fields
            self.character.armor_class = self.armor_class
            self.character.hit_points = self.current_hit_points
            self.character.max_hit_points = self.hit_point_maximum
            # Note: proficiency_bonus is calculated automatically, not saved manually
            
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
            
            logger.info(f"Character object updated: {self.character.name}")
        except Exception as e:
            logger.error(f"Error updating character object: {e}")
    
    def save_to_entity(self):
        """Save character data back to the sprite entity if possible"""
        if not self.selected_entity_id or not self.actions_bridge:
            logger.debug("Cannot save to entity: no selected entity or actions bridge")
            return
            
        try:
            # First save to character object
            self.save_to_character_object()
            
            # For now, just log that we're attempting to save to entity
            # The actual entity update would require more complex sprite management
            logger.info(f"Character data saved for entity: {self.selected_entity_id}")
                
        except Exception as e:
            logger.error(f"Failed to save character data to entity: {e}")
    
    def auto_save_changes(self):
        """Auto-save panel changes to Character object"""
        self.save_to_character_object()

