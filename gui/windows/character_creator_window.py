#!/usr/bin/env python3
"""
D&D 5e Character Creator - Step-by-step wizard for creating characters
Integrated with compendium data and character sheet system
"""

from imgui_bundle import imgui
from typing import Dict, List, Optional, Any, Tuple
from enum import Enum
import json
import os
import random

from core_table.compendiums.characters.character import Character, Race, CharacterClass, Background, AbilityScore, Size
from logger import setup_logger

logger = setup_logger(__name__)


class CreationStep(Enum):
    RACE = 0
    CLASS = 1
    ABILITIES = 2
    BACKGROUND = 3
    EQUIPMENT = 4
    OVERVIEW = 5


class AbilityGenMethod(Enum):
    POINT_BUY = "point_buy"
    STANDARD_ARRAY = "standard_array"
    ROLL_4D6 = "roll_4d6"
    MANUAL = "manual"


class CharacterCreator:
    """Step-by-step D&D 5e character creator with GUI"""
    
    def __init__(self, context=None, actions_bridge=None):
        self.context = context
        self.actions_bridge = actions_bridge
        
        # Character data loader - placeholder for now
        self.data_loader = None
        
        # Creation state
        self.current_step = CreationStep.RACE
        self.is_open = False
        
        # Character data being created
        self.character_data = {
            'name': '',
            'player_name': '',
            'race': None,
            'class': None,
            'background': None,
            'level': 1,
            'ability_scores': {'STR': 10, 'DEX': 10, 'CON': 10, 'INT': 10, 'WIS': 10, 'CHA': 10},
            'hit_points': 8,
            'equipment': [],
            'features': [],
            'proficiencies': [],
            'languages': [],
            'description': {
                'personality': '',
                'ideals': '',
                'bonds': '',
                'flaws': '',
                'appearance': '',
                'backstory': ''
            }
        }
        
        # UI state
        self.race_search = ""
        self.class_search = ""
        self.background_search = ""
        self.selected_race_id = None
        self.selected_class_id = None
        self.selected_background_id = None
        
        # Ability score generation
        self.ability_method = AbilityGenMethod.POINT_BUY
        self.point_buy_points = 27
        self.points_spent = 0
        
        # Equipment selection
        self.selected_equipment = {}
        self.starting_equipment = []
        
        # Custom options
        self.show_custom_race = False
        self.show_custom_class = False
        self.show_custom_background = False
        self.show_custom_equipment = False
        self.custom_race_name = ""
        self.custom_class_name = ""
        self.custom_background_name = ""
        self.custom_equipment_name = ""
        
        # Custom editing
        self.editing_custom_race = None
        self.editing_custom_class = None
        self.editing_custom_background = None
        
        # Custom race editing fields
        self.edit_race_speed = 30
        self.edit_race_size = 0  # Index for Size enum
        self.edit_race_darkvision = 0
        self.edit_race_trait_name = ""
        self.edit_race_trait_desc = ""
        
        # Custom class editing fields
        self.edit_class_hit_die = 8
        self.edit_class_num_skills = 2
        self.edit_class_feature_name = ""
        self.edit_class_feature_desc = ""
        
        # Load compendium data
        self._load_compendium_data()
    
    def _load_compendium_data(self):
        """Load race, class, and background data from compendium"""
        try:
            # Use CompendiumManager if available
            if self.context and hasattr(self.context, 'CompendiumManager') and self.context.CompendiumManager:
                compendium = self.context.CompendiumManager
                
                # Get all races, classes, and backgrounds from compendium
                compendium_races = compendium.get_all_races()
                compendium_classes = compendium.get_all_classes()
                compendium_backgrounds = compendium.get_all_backgrounds()
                
                # Convert Race objects to dictionaries for UI
                self.races = {}
                for name, race in compendium_races.items():
                    race_id = name.lower().replace(' ', '_').replace("'", "")
                    self.races[race_id] = {
                        'name': race.name,
                        'description': f"Size: {race.size.value}, Speed: {race.speed} ft",
                        'size': race.size.value,
                        'speed': race.speed,
                        'traits': [{'name': t.name, 'description': t.description} for t in race.traits],
                        'ability_score_increases': [{'ability': asi.ability.value, 'increase': asi.increase} 
                                                  for asi in race.ability_score_increases],
                        'languages': race.languages,
                        'darkvision': race.darkvision,
                        'race_object': race
                    }
                
                # Convert CharacterClass objects to dictionaries for UI
                self.classes = {}
                for name, char_class in compendium_classes.items():
                    class_id = name.lower().replace(' ', '_').replace("'", "")
                    self.classes[class_id] = {
                        'name': char_class.name,
                        'description': f"Hit Die: d{char_class.hit_die}, Skills: {char_class.num_skills}",
                        'hit_die': char_class.hit_die,
                        'primary_abilities': [ability.value for ability in char_class.primary_abilities],
                        'saving_throws': [ability.value for ability in char_class.saving_throw_proficiencies],
                        'skill_proficiencies': [skill.value for skill in char_class.skill_proficiencies],
                        'armor_proficiencies': char_class.armor_proficiencies,
                        'weapon_proficiencies': char_class.weapon_proficiencies,
                        'class_object': char_class
                    }
                
                # Convert Background objects to dictionaries for UI
                self.backgrounds = {}
                for name, background in compendium_backgrounds.items():
                    bg_id = name.lower().replace(' ', '_').replace("'", "")
                    self.backgrounds[bg_id] = {
                        'name': background.name,
                        'description': "Background with skills and equipment",
                        'skill_proficiencies': [skill.value for skill in background.skill_proficiencies],
                        'tool_proficiencies': background.tool_proficiencies,
                        'languages': background.language_proficiencies,
                        'equipment': background.equipment,
                        'features': [{'name': f.name, 'description': f.description} for f in background.features],
                        'background_object': background
                    }
                
                logger.info(f"Loaded from CompendiumManager: {len(self.races)} races, {len(self.classes)} classes, {len(self.backgrounds)} backgrounds")
                return
            
            # If no CompendiumManager, try to load directly from character loader
            character_data_file = os.path.join(os.path.dirname(__file__), 
                                             "../../core_table/compendiums/characters/character_data.json")
            
            if os.path.exists(character_data_file):
                from core_table.compendiums.characters.character_loader import CharacterLoader
                
                # Initialize character loader with proper path
                data_dir = os.path.dirname(character_data_file)
                loader = CharacterLoader(data_dir)
                
                if loader.load_character_data("character_data.json"):
                    # Convert Race objects to dictionaries for UI - same as above
                    self.races = {}
                    for name, race in loader.races.items():
                        race_id = name.lower().replace(' ', '_').replace("'", "")
                        self.races[race_id] = {
                            'name': race.name,
                            'description': f"Size: {race.size.value}, Speed: {race.speed} ft",
                            'size': race.size.value,
                            'speed': race.speed,
                            'traits': [{'name': t.name, 'description': t.description} for t in race.traits],
                            'ability_score_increases': [{'ability': asi.ability.value, 'increase': asi.increase} 
                                                      for asi in race.ability_score_increases],
                            'languages': race.languages,
                            'darkvision': race.darkvision,
                            'race_object': race
                        }
                    
                    # Convert CharacterClass objects to dictionaries for UI - same as above
                    self.classes = {}
                    for name, char_class in loader.classes.items():
                        class_id = name.lower().replace(' ', '_').replace("'", "")
                        self.classes[class_id] = {
                            'name': char_class.name,
                            'description': f"Hit Die: d{char_class.hit_die}, Skills: {char_class.num_skills}",
                            'hit_die': char_class.hit_die,
                            'primary_abilities': [ability.value for ability in char_class.primary_abilities],
                            'saving_throws': [ability.value for ability in char_class.saving_throw_proficiencies],
                            'skill_proficiencies': [skill.value for skill in char_class.skill_proficiencies],
                            'armor_proficiencies': char_class.armor_proficiencies,
                            'weapon_proficiencies': char_class.weapon_proficiencies,
                            'class_object': char_class
                        }
                    
                    # Convert Background objects to dictionaries for UI - same as above
                    self.backgrounds = {}
                    for name, background in loader.backgrounds.items():
                        bg_id = name.lower().replace(' ', '_').replace("'", "")
                        self.backgrounds[bg_id] = {
                            'name': background.name,
                            'description': "Background with skills and equipment",
                            'skill_proficiencies': [skill.value for skill in background.skill_proficiencies],
                            'tool_proficiencies': background.tool_proficiencies,
                            'languages': background.language_proficiencies,
                            'equipment': background.equipment,
                            'features': [{'name': f.name, 'description': f.description} for f in background.features],
                            'background_object': background
                        }
                    
                    logger.info(f"Loaded {len(self.races)} races, {len(self.classes)} classes, {len(self.backgrounds)} backgrounds from character data file")
                    return
            
            # If all else fails, no data available
            logger.error("No compendium data available - CompendiumManager not found and character data file missing")
            self.races = {}
            self.classes = {}
            self.backgrounds = {}
            
        except Exception as e:
            logger.error(f"Failed to load compendium data: {e}")
            self.races = {}
            self.classes = {}
            self.backgrounds = {}
    
    def open_creator(self, existing_character: Optional[Character] = None):
        """Open the character creator window"""
        self.is_open = True
        self.current_step = CreationStep.RACE
        
        if existing_character:
            # Level up existing character
            self._load_existing_character(existing_character)
        else:
            # Create new character
            self._reset_character_data()
    
    def _load_existing_character(self, character: Character):
        """Load existing character for level-up"""
        self.character_data['name'] = character.name
        self.character_data['player_name'] = character.player_name
        self.character_data['level'] = character.level + 1  # Level up
        
        # Set race/class/background from character
        if character.race:
            self.character_data['race'] = {
                'name': character.race.name,
                'race_object': character.race
            }
        
        if character.character_class:
            self.character_data['class'] = {
                'name': character.character_class.name,
                'class_object': character.character_class
            }
        
        if character.background:
            self.character_data['background'] = {
                'name': character.background.name,
                'background_object': character.background
            }
        
        # Set ability scores - map enum to correct string keys
        ability_mapping = {
            AbilityScore.STRENGTH: 'STR',
            AbilityScore.DEXTERITY: 'DEX',
            AbilityScore.CONSTITUTION: 'CON',
            AbilityScore.INTELLIGENCE: 'INT',
            AbilityScore.WISDOM: 'WIS',
            AbilityScore.CHARISMA: 'CHA'
        }
        for ability, score in character.ability_scores.items():
            if ability in ability_mapping:
                self.character_data['ability_scores'][ability_mapping[ability]] = score
        
        # Set current equipment
        self.character_data['equipment'] = character.equipment.copy()
        
        # Set hit points (will be recalculated for level up)
        self.character_data['hit_points'] = character.hit_points
    
    def _reset_character_data(self):
        """Reset character data to defaults"""
        self.character_data = {
            'name': '',
            'player_name': '',
            'race': None,
            'class': None,
            'background': None,
            'level': 1,
            'ability_scores': {'STR': 10, 'DEX': 10, 'CON': 10, 'INT': 10, 'WIS': 10, 'CHA': 10},
            'hit_points': 8,
            'equipment': [],
            'features': [],
            'proficiencies': [],
            'languages': [],
            'description': {
                'personality': '',
                'ideals': '',
                'bonds': '',
                'flaws': '',
                'appearance': '',
                'backstory': ''
            }
        }
        
        # Reset UI state
        self.selected_race_id = None
        self.selected_class_id = None
        self.selected_background_id = None
        self.points_spent = 0
    
    def render(self):
        """Main render method"""
        if not self.is_open:
            return
        
        # Character Creator window
        imgui.set_next_window_size((900, 700), imgui.Cond_.first_use_ever.value)
        imgui.set_next_window_pos((200, 100), imgui.Cond_.first_use_ever.value)
        
        expanded, self.is_open = imgui.begin("D&D 5e Character Creator", self.is_open)
        
        if expanded:
            self._render_header()
            imgui.separator()
            
            self._render_step_navigation()
            imgui.separator()
            
            self._render_current_step()
            imgui.separator()
            
            self._render_navigation_buttons()
        
        imgui.end()
    
    def _render_header(self):
        """Render creator header with progress"""
        imgui.text("Create New D&D 5e Character")
        
        # Progress bar
        step_names = ["Race", "Class", "Abilities", "Background", "Equipment", "Overview"]
        current_step_index = self.current_step.value
        progress = (current_step_index) / (len(step_names) - 1)
        
        imgui.text(f"Step {current_step_index + 1} of {len(step_names)}: {step_names[current_step_index]}")
        imgui.progress_bar(progress, (-1, 0))
    
    def _render_step_navigation(self):
        """Render step navigation tabs"""
        if imgui.begin_tab_bar("CreatorSteps"):
            step_names = ["Race", "Class", "Abilities", "Background", "Equipment", "Overview"]
            
            for i, (step, name) in enumerate(zip(CreationStep, step_names)):
                # Disable future steps if prerequisites not met
                disabled = not self._can_access_step(step)
                
                if disabled:
                    imgui.begin_disabled()
                
                # Check if this tab is currently selected
                flags = imgui.TabItemFlags_.none.value
                if step == self.current_step:
                    flags = imgui.TabItemFlags_.set_selected.value
                
                tab_open, tab_selected = imgui.begin_tab_item(name, None, flags)
                if tab_open:
                    if tab_selected and not disabled and step != self.current_step:
                        logger.info(f"Tab clicked, changing step from {self.current_step.name} to {step.name}")
                        self.current_step = step
                    imgui.end_tab_item()
                
                if disabled:
                    imgui.end_disabled()
            
            imgui.end_tab_bar()
    
    def _can_access_step(self, step: CreationStep) -> bool:
        """Check if a step can be accessed based on prerequisites"""
        if step == CreationStep.RACE:
            return True
        elif step == CreationStep.CLASS:
            return self.character_data['race'] is not None
        elif step == CreationStep.ABILITIES:
            return self.character_data['class'] is not None
        elif step == CreationStep.BACKGROUND:
            return True  # Can access after class
        elif step == CreationStep.EQUIPMENT:
            return self.character_data['background'] is not None
        elif step == CreationStep.OVERVIEW:
            return all([
                self.character_data['race'],
                self.character_data['class'],
                self.character_data['background']
            ])
        return False
    
    def _render_current_step(self):
        """Render the current step content"""
        if self.current_step == CreationStep.RACE:
            self._render_race_step()
        elif self.current_step == CreationStep.CLASS:
            self._render_class_step()
        elif self.current_step == CreationStep.ABILITIES:
            self._render_abilities_step()
        elif self.current_step == CreationStep.BACKGROUND:
            self._render_background_step()
        elif self.current_step == CreationStep.EQUIPMENT:
            self._render_equipment_step()
        elif self.current_step == CreationStep.OVERVIEW:
            self._render_overview_step()
    
    def _render_race_step(self):
        """Render race selection step"""
        imgui.text("Choose your character's race:")
        imgui.spacing()
        
        # Debug info
        imgui.text(f"Races loaded: {len(self.races)}")
        if len(self.races) == 0:
            imgui.text_colored((1.0, 0.5, 0.0, 1.0), "No races loaded from compendium!")
        
        # Search bar
        imgui.text("Search races:")
        imgui.same_line()
        imgui.set_next_item_width(200)
        changed, self.race_search = imgui.input_text("##race_search", self.race_search)
        
        imgui.same_line()
        if imgui.button("Custom Race"):
            self.show_custom_race = True
        
        # Race list
        if imgui.begin_child("RaceList", (0, 300)):
            filtered_races = self._filter_races(self.race_search)
            
            if not filtered_races:
                imgui.text_colored((0.7, 0.7, 0.7, 1.0), "No races match search criteria")
            
            for race_id, race_data in filtered_races.items():
                is_selected = race_id == self.selected_race_id
                
                clicked, new_selected = imgui.selectable(race_data.get('name', race_id), is_selected)
                if clicked:
                    self.selected_race_id = race_id
                    self.character_data['race'] = race_data
                    self._apply_racial_traits(race_data)
                    logger.info(f"Race selected: {race_data.get('name', race_id)}")
                    logger.debug(f"Character data race is now: {self.character_data['race'] is not None}")
                
                # Show selected race info
                if is_selected:
                    imgui.same_line()
                    imgui.text_colored((0.0, 1.0, 0.0, 1.0), "✓ Selected")
                
                # Right-click context menu for custom races
                if imgui.is_item_clicked(1) and race_id.startswith('custom_'):  # Right click
                    imgui.open_popup(f"race_context_{race_id}")
                
                if imgui.begin_popup(f"race_context_{race_id}"):
                    edit_clicked, _ = imgui.selectable("Edit Custom Race", False)
                    if edit_clicked:
                        self.custom_race_name = race_data.get('name', '')
                        self.edit_custom_race(race_id)
                    delete_clicked, _ = imgui.selectable("Delete Custom Race", False)
                    if delete_clicked:
                        if race_id in self.races:
                            del self.races[race_id]
                        if self.selected_race_id == race_id:
                            self.selected_race_id = None
                            self.character_data['race'] = None
                    imgui.end_popup()
                
                if is_selected and race_data:
                    imgui.indent()
                    self._render_race_details(race_data)
                    imgui.unindent()
        
        imgui.end_child()
        
        # Custom race dialog
        if self.show_custom_race:
            self._render_custom_race_dialog()
    
    def _render_class_step(self):
        """Render class selection step"""
        imgui.text("Choose your character's class:")
        imgui.spacing()
        
        # Search bar
        imgui.text("Search classes:")
        imgui.same_line()
        imgui.set_next_item_width(200)
        changed, self.class_search = imgui.input_text("##class_search", self.class_search)
        
        imgui.same_line()
        if imgui.button("Custom Class"):
            self.show_custom_class = True
        
        # Class list
        if imgui.begin_child("ClassList", (0, 300)):
            filtered_classes = self._filter_classes(self.class_search)
            
            for class_id, class_data in filtered_classes.items():
                is_selected = class_id == self.selected_class_id
                
                clicked, new_selected = imgui.selectable(class_data.get('name', class_id), is_selected)
                if clicked:
                    self.selected_class_id = class_id
                    self.character_data['class'] = class_data
                    self._apply_class_features(class_data)
                    logger.info(f"Class selected: {class_data.get('name', class_id)}")
                    logger.debug(f"Character data class is now: {self.character_data['class'] is not None}")
                
                # Show selected class info
                if is_selected:
                    imgui.same_line()
                    imgui.text_colored((0.0, 1.0, 0.0, 1.0), "✓ Selected")
                
                # Right-click context menu for custom classes
                if imgui.is_item_clicked(1) and class_id.startswith('custom_'):  # Right click
                    imgui.open_popup(f"class_context_{class_id}")
                
                if imgui.begin_popup(f"class_context_{class_id}"):
                    edit_clicked, _ = imgui.selectable("Edit Custom Class", False)
                    if edit_clicked:
                        self.custom_class_name = class_data.get('name', '')
                        self.edit_custom_class(class_id)
                    delete_clicked, _ = imgui.selectable("Delete Custom Class", False)
                    if delete_clicked:
                        if class_id in self.classes:
                            del self.classes[class_id]
                        if self.selected_class_id == class_id:
                            self.selected_class_id = None
                            self.character_data['class'] = None
                    imgui.end_popup()
                
                if is_selected and class_data:
                    imgui.indent()
                    self._render_class_details(class_data)
                    imgui.unindent()
        
        imgui.end_child()
        
        # Custom class dialog
        if self.show_custom_class:
            self._render_custom_class_dialog()
    
    def _render_abilities_step(self):
        """Render ability scores step"""
        imgui.text("Set your character's ability scores:")
        imgui.spacing()
        
        # Method selection
        imgui.text("Generation Method:")
        
        for method in AbilityGenMethod:
            if imgui.radio_button(method.value.replace('_', ' ').title(), self.ability_method == method):
                self.ability_method = method
                self._reset_ability_scores()
        
        imgui.separator()
        
        if self.ability_method == AbilityGenMethod.POINT_BUY:
            self._render_point_buy()
        elif self.ability_method == AbilityGenMethod.STANDARD_ARRAY:
            self._render_standard_array()
        elif self.ability_method == AbilityGenMethod.ROLL_4D6:
            self._render_roll_abilities()
        elif self.ability_method == AbilityGenMethod.MANUAL:
            self._render_manual_abilities()
    
    def _render_background_step(self):
        """Render background selection step"""
        imgui.text("Choose your character's background:")
        imgui.spacing()
        
        # Search bar
        imgui.text("Search backgrounds:")
        imgui.same_line()
        imgui.set_next_item_width(200)
        changed, self.background_search = imgui.input_text("##background_search", self.background_search)
        
        imgui.same_line()
        if imgui.button("Custom Background"):
            self.show_custom_background = True
        
        # Background list
        if imgui.begin_child("BackgroundList", (0, 300)):
            filtered_backgrounds = self._filter_backgrounds(self.background_search)
            
            for bg_id, bg_data in filtered_backgrounds.items():
                is_selected = bg_id == self.selected_background_id
                
                clicked, new_selected = imgui.selectable(bg_data.get('name', bg_id), is_selected)
                if clicked:
                    self.selected_background_id = bg_id
                    self.character_data['background'] = bg_data
                    self._apply_background_features(bg_data)
                
                if is_selected and bg_data:
                    imgui.indent()
                    self._render_background_details(bg_data)
                    imgui.unindent()
        
        imgui.end_child()
        
        # Custom background dialog
        if self.show_custom_background:
            self._render_custom_background_dialog()
    
    def _render_equipment_step(self):
        """Render equipment selection step"""
        imgui.text("Choose your starting equipment:")
        imgui.spacing()
        
        # Equipment from class
        if self.character_data['class']:
            imgui.text("Class Equipment:")
            class_equipment = self.character_data['class'].get('equipment', [])
            for item in class_equipment:
                imgui.bullet_text(item)
        
        imgui.separator()
        
        # Equipment from background
        if self.character_data['background']:
            imgui.text("Background Equipment:")
            bg_equipment = self.character_data['background'].get('equipment', [])
            for item in bg_equipment:
                imgui.bullet_text(item)
        
        imgui.separator()
        
        # Additional equipment selection
        imgui.text("Additional Equipment:")
        if imgui.button("Add Custom Item"):
            self.show_custom_equipment = True
        
        # Display current equipment
        imgui.text("Current Equipment:")
        for i, item in enumerate(self.character_data['equipment']):
            imgui.bullet_text(item)
            imgui.same_line()
            if imgui.button(f"Remove##{i}"):
                self.character_data['equipment'].pop(i)
                break
        
        # Custom equipment dialog
        if hasattr(self, 'show_custom_equipment') and self.show_custom_equipment:
            self._render_custom_equipment_dialog()
    
    def _render_overview_step(self):
        """Render character overview and confirmation step"""
        imgui.text("Character Overview:")
        imgui.spacing()
        
        # Character name
        imgui.text("Character Name:")
        imgui.same_line()
        imgui.set_next_item_width(200)
        changed, self.character_data['name'] = imgui.input_text("##char_name", self.character_data['name'])
        
        # Player name
        imgui.text("Player Name:")
        imgui.same_line()
        imgui.set_next_item_width(200)
        changed, self.character_data['player_name'] = imgui.input_text("##player_name", self.character_data['player_name'])
        
        imgui.separator()
        
        # Character summary
        if imgui.begin_child("CharacterSummary", (0, 400)):
            self._render_character_summary()
        imgui.end_child()
        
        imgui.separator()
        
        # Final actions
        if imgui.button("Create Character", (150, 40)):
            self._create_character()
    
    def _render_race_details(self, race_data: Dict):
        """Render detailed race information"""
        if 'description' in race_data:
            imgui.text_wrapped(race_data['description'])
        
        if 'traits' in race_data:
            imgui.text("Racial Traits:")
            for trait in race_data['traits']:
                imgui.bullet_text(trait.get('name', 'Unknown'))
    
    def _render_class_details(self, class_data: Dict):
        """Render detailed class information"""
        if 'description' in class_data:
            imgui.text_wrapped(class_data['description'])
        
        if 'hit_die' in class_data:
            imgui.text(f"Hit Die: d{class_data['hit_die']}")
        
        if 'primary_abilities' in class_data:
            abilities = ', '.join(class_data['primary_abilities'])
            imgui.text(f"Primary Abilities: {abilities}")
    
    def _render_background_details(self, bg_data: Dict):
        """Render detailed background information"""
        if 'description' in bg_data:
            imgui.text_wrapped(bg_data['description'])
        
        if 'skill_proficiencies' in bg_data:
            skills = ', '.join(bg_data['skill_proficiencies'])
            imgui.text(f"Skill Proficiencies: {skills}")
    
    def _render_point_buy(self):
        """Render point buy ability score system"""
        imgui.text(f"Points remaining: {self.point_buy_points - self.points_spent}")
        
        self.points_spent = 0
        abilities = ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA']
        
        for ability in abilities:
            current_score = self.character_data['ability_scores'][ability]
            cost = self._calculate_point_cost(current_score)
            self.points_spent += cost
            
            imgui.text(f"{ability}: {current_score} (Cost: {cost})")
            imgui.same_line()
            
            if imgui.button(f"-##{ability}") and current_score > 8:
                self.character_data['ability_scores'][ability] -= 1
            
            imgui.same_line()
            if imgui.button(f"+##{ability}") and current_score < 15:
                new_cost = self._calculate_point_cost(current_score + 1)
                if self.points_spent - cost + new_cost <= self.point_buy_points:
                    self.character_data['ability_scores'][ability] += 1
    
    def _render_standard_array(self):
        """Render standard array ability assignment"""
        standard_scores = [15, 14, 13, 12, 10, 8]
        abilities = ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA']
        
        imgui.text("Assign the standard array scores to abilities:")
        imgui.text("Standard Array: 15, 14, 13, 12, 10, 8")
        
        for ability in abilities:
            imgui.text(f"{ability}:")
            imgui.same_line()
            imgui.set_next_item_width(100)
            
            current_score = self.character_data['ability_scores'][ability]
            if imgui.begin_combo(f"##std_{ability}", str(current_score)):
                for score in standard_scores:
                    if imgui.selectable(str(score), score == current_score):
                        self.character_data['ability_scores'][ability] = score
                imgui.end_combo()
    
    def _render_roll_abilities(self):
        """Render 4d6 drop lowest ability generation"""
        imgui.text("Roll 4d6, drop lowest for each ability:")
        
        if imgui.button("Roll All Abilities"):
            self._roll_all_abilities()
        
        abilities = ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA']
        for ability in abilities:
            score = self.character_data['ability_scores'][ability]
            imgui.text(f"{ability}: {score}")
            imgui.same_line()
            if imgui.button(f"Reroll##{ability}"):
                self.character_data['ability_scores'][ability] = self._roll_ability()
    
    def _render_manual_abilities(self):
        """Render manual ability score entry"""
        imgui.text("Enter ability scores manually:")
        
        abilities = ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA']
        for ability in abilities:
            imgui.text(f"{ability}:")
            imgui.same_line()
            imgui.set_next_item_width(80)
            changed, new_score = imgui.input_int(f"##man_{ability}", 
                                               self.character_data['ability_scores'][ability], 0, 0)
            if changed:
                self.character_data['ability_scores'][ability] = max(1, min(30, new_score))
    
    def _render_character_summary(self):
        """Render complete character summary"""
        char = self.character_data
        
        # Basic info
        imgui.text(f"Name: {char['name'] or 'Unnamed'}")
        imgui.text(f"Player: {char['player_name'] or 'Unknown'}")
        imgui.text(f"Level: {char['level']}")
        
        if char['race']:
            imgui.text(f"Race: {char['race'].get('name', 'Unknown')}")
        
        if char['class']:
            imgui.text(f"Class: {char['class'].get('name', 'Unknown')}")
            if 'hit_die' in char['class']:
                imgui.text(f"Hit Die: d{char['class']['hit_die']}")
        
        if char['background']:
            imgui.text(f"Background: {char['background'].get('name', 'Unknown')}")
        
        imgui.text(f"Hit Points: {char['hit_points']}")
        
        imgui.separator()
        
        # Ability scores with racial bonuses
        imgui.text("Ability Scores:")
        for ability, score in char['ability_scores'].items():
            # Calculate racial bonus
            racial_bonus = 0
            if char['race'] and 'ability_score_increases' in char['race']:
                for asi in char['race']['ability_score_increases']:
                    if asi['ability'] == ability:
                        racial_bonus = asi['increase']
                        break
            
            final_score = score + racial_bonus
            modifier = (final_score - 10) // 2
            mod_text = f"+{modifier}" if modifier >= 0 else str(modifier)
            
            if racial_bonus > 0:
                imgui.text(f"  {ability}: {score} + {racial_bonus} = {final_score} ({mod_text})")
            else:
                imgui.text(f"  {ability}: {final_score} ({mod_text})")
        
        imgui.separator()
        
        # Proficiencies
        if char['proficiencies']:
            imgui.text("Proficiencies:")
            for prof in char['proficiencies']:
                imgui.bullet_text(prof)
        
        # Languages
        if char['languages']:
            imgui.text("Languages:")
            for lang in char['languages']:
                imgui.bullet_text(lang)
        
        # Equipment
        if char['equipment']:
            imgui.text("Equipment:")
            for item in char['equipment']:
                imgui.bullet_text(item)
        
        # Features and traits
        if char['features']:
            imgui.text("Features:")
            for feature in char['features']:
                imgui.bullet_text(feature)
    
    def _render_navigation_buttons(self):
        """Render step navigation buttons"""
        # Debug info
        imgui.text(f"Current step: {self.current_step.name}")
        imgui.text(f"Race selected: {self.character_data['race'] is not None}")
        imgui.text(f"Class selected: {self.character_data['class'] is not None}")
        imgui.text(f"Background selected: {self.character_data['background'] is not None}")
        imgui.separator()
        
        # Previous button
        can_go_back = self.current_step.value > 0
        if not can_go_back:
            imgui.begin_disabled()
        
        if imgui.button("< Previous"):
            if can_go_back:
                self.current_step = CreationStep(self.current_step.value - 1)
                logger.info(f"Navigated to step: {self.current_step.name}")
        
        if not can_go_back:
            imgui.end_disabled()
        
        imgui.same_line()
        
        # Next button
        next_step_value = self.current_step.value + 1
        can_go_forward = (next_step_value < len(CreationStep) and 
                         self._can_access_step(CreationStep(next_step_value)))
        
        if not can_go_forward:
            imgui.begin_disabled()
        
        next_button_text = "Next >"
        if next_step_value < len(CreationStep):
            next_step = CreationStep(next_step_value)
            next_button_text = f"Next > ({next_step.name})"
        
        if imgui.button(next_button_text):
            if can_go_forward:
                self.current_step = CreationStep(next_step_value)
                logger.info(f"Navigated to step: {self.current_step.name}")
            else:
                logger.debug(f"Cannot navigate forward. Prerequisites not met for step {next_step_value}")
        
        if not can_go_forward:
            imgui.end_disabled()
            # Show tooltip explaining why disabled
            if imgui.is_item_hovered():
                next_step = CreationStep(next_step_value) if next_step_value < len(CreationStep) else None
                if next_step:
                    tooltip_text = f"Complete prerequisites for {next_step.name}"
                    if next_step == CreationStep.CLASS:
                        tooltip_text += " (select a race first)"
                    elif next_step == CreationStep.ABILITIES:
                        tooltip_text += " (select a class first)"
                    elif next_step == CreationStep.EQUIPMENT:
                        tooltip_text += " (select a background first)"
                    elif next_step == CreationStep.OVERVIEW:
                        tooltip_text += " (complete race, class, and background)"
                    imgui.set_tooltip(tooltip_text)
        
        imgui.same_line()
        imgui.dummy((100, 0))  # Spacer
        imgui.same_line()
        
        # Cancel button
        if imgui.button("Cancel"):
            self.is_open = False
    
    def _filter_races(self, search: str) -> Dict:
        """Filter races by search term"""
        if not search:
            return self.races
        
        filtered = {}
        search_lower = search.lower()
        
        for race_id, race_data in self.races.items():
            name = race_data.get('name', race_id).lower()
            if search_lower in name:
                filtered[race_id] = race_data
        
        return filtered
    
    def _filter_classes(self, search: str) -> Dict:
        """Filter classes by search term"""
        if not search:
            return self.classes
        
        filtered = {}
        search_lower = search.lower()
        
        for class_id, class_data in self.classes.items():
            name = class_data.get('name', class_id).lower()
            if search_lower in name:
                filtered[class_id] = class_data
        
        return filtered
    
    def _filter_backgrounds(self, search: str) -> Dict:
        """Filter backgrounds by search term"""
        if not search:
            return self.backgrounds
        
        filtered = {}
        search_lower = search.lower()
        
        for bg_id, bg_data in self.backgrounds.items():
            name = bg_data.get('name', bg_id).lower()
            if search_lower in name:
                filtered[bg_id] = bg_data
        
        return filtered
    
    def _apply_racial_traits(self, race_data: Dict):
        """Apply racial traits to character"""
        # Add racial languages
        if 'languages' in race_data and race_data['languages']:
            self.character_data['languages'].extend(race_data['languages'])
        
        # Add racial features to character features list
        if 'traits' in race_data and race_data['traits']:
            for trait in race_data['traits']:
                if isinstance(trait, dict) and 'name' in trait:
                    feature_text = f"{trait['name']}: {trait.get('description', 'Racial trait')}"
                    if feature_text not in self.character_data['features']:
                        self.character_data['features'].append(feature_text)
        
        # Add ability score increases to a tracking list (applied in final character creation)
        self.character_data['racial_asi'] = race_data.get('ability_score_increases', [])
    
    def _apply_class_features(self, class_data: Dict):
        """Apply class features to character"""
        # Calculate hit points
        if 'hit_die' in class_data:
            hit_die = class_data['hit_die']
            con_modifier = (self.character_data['ability_scores']['CON'] - 10) // 2
            self.character_data['hit_points'] = hit_die + con_modifier
        
        # Add class proficiencies
        if 'armor_proficiencies' in class_data:
            for prof in class_data['armor_proficiencies']:
                prof_text = f"Armor: {prof}"
                if prof_text not in self.character_data['proficiencies']:
                    self.character_data['proficiencies'].append(prof_text)
        
        if 'weapon_proficiencies' in class_data:
            for prof in class_data['weapon_proficiencies']:
                prof_text = f"Weapon: {prof}"
                if prof_text not in self.character_data['proficiencies']:
                    self.character_data['proficiencies'].append(prof_text)
        
        # Add saving throw proficiencies
        if 'saving_throws' in class_data:
            for save in class_data['saving_throws']:
                prof_text = f"Saving Throw: {save}"
                if prof_text not in self.character_data['proficiencies']:
                    self.character_data['proficiencies'].append(prof_text)
    
    def _apply_background_features(self, bg_data: Dict):
        """Apply background features to character"""
        # Add background skill proficiencies
        if 'skill_proficiencies' in bg_data:
            for skill in bg_data['skill_proficiencies']:
                prof_text = f"Skill: {skill}"
                if prof_text not in self.character_data['proficiencies']:
                    self.character_data['proficiencies'].append(prof_text)
        
        # Add background tool proficiencies
        if 'tool_proficiencies' in bg_data:
            for tool in bg_data['tool_proficiencies']:
                prof_text = f"Tool: {tool}"
                if prof_text not in self.character_data['proficiencies']:
                    self.character_data['proficiencies'].append(prof_text)
        
        # Add background languages
        if 'languages' in bg_data and bg_data['languages']:
            self.character_data['languages'].extend(bg_data['languages'])
        
        # Add background equipment
        if 'equipment' in bg_data and bg_data['equipment']:
            self.character_data['equipment'].extend(bg_data['equipment'])
        
        # Add background features
        if 'features' in bg_data and bg_data['features']:
            for feature in bg_data['features']:
                if isinstance(feature, dict) and 'name' in feature:
                    feature_text = f"{feature['name']}: {feature.get('description', 'Background feature')}"
                    if feature_text not in self.character_data['features']:
                        self.character_data['features'].append(feature_text)
    
    def _calculate_point_cost(self, score: int) -> int:
        """Calculate point buy cost for an ability score"""
        if score <= 8:
            return 0
        elif score <= 13:
            return score - 8
        elif score == 14:
            return 7
        elif score == 15:
            return 9
        else:
            return 99  # Invalid
    
    def _reset_ability_scores(self):
        """Reset ability scores to base values"""
        if self.ability_method == AbilityGenMethod.POINT_BUY:
            for ability in self.character_data['ability_scores']:
                self.character_data['ability_scores'][ability] = 8
        else:
            for ability in self.character_data['ability_scores']:
                self.character_data['ability_scores'][ability] = 10
    
    def _roll_ability(self) -> int:
        """Roll 4d6, drop lowest"""
        import random
        rolls = [random.randint(1, 6) for _ in range(4)]
        rolls.sort(reverse=True)
        return sum(rolls[:3])
    
    def _roll_all_abilities(self):
        """Roll all ability scores"""
        for ability in self.character_data['ability_scores']:
            self.character_data['ability_scores'][ability] = self._roll_ability()
    
    def _render_custom_race_dialog(self):
        """Render custom race creation/editing dialog"""
        is_editing = self.editing_custom_race is not None
        title = "Edit Custom Race" if is_editing else "Create Custom Race"
        
        imgui.open_popup(title)
        
        if imgui.begin_popup_modal(title, None, 
                                 imgui.WindowFlags_.always_auto_resize.value)[0]:
            imgui.text("Create/Edit a custom race:")
            
            imgui.text("Name:")
            imgui.same_line()
            imgui.set_next_item_width(200)
            changed, self.custom_race_name = imgui.input_text("##custom_race_name", self.custom_race_name)
            
            # Size selection
            imgui.text("Size:")
            imgui.same_line()
            size_names = [size.value for size in Size]
            changed, self.edit_race_size = imgui.combo("##race_size", self.edit_race_size, size_names)
            
            # Speed input
            imgui.text("Speed:")
            imgui.same_line()
            imgui.set_next_item_width(100)
            changed, self.edit_race_speed = imgui.input_int("##race_speed", self.edit_race_speed)
            
            # Darkvision input
            imgui.text("Darkvision:")
            imgui.same_line()
            imgui.set_next_item_width(100)
            changed, self.edit_race_darkvision = imgui.input_int("##race_darkvision", self.edit_race_darkvision)
            
            imgui.separator()
            
            # Trait editing section
            imgui.text("Add Racial Trait:")
            imgui.set_next_item_width(150)
            changed, self.edit_race_trait_name = imgui.input_text("Trait Name##trait_name", self.edit_race_trait_name)
            imgui.set_next_item_width(300)
            changed, self.edit_race_trait_desc = imgui.input_text_multiline("Description##trait_desc", 
                                                                          self.edit_race_trait_desc, 
                                                                          (300, 80))
            
            if imgui.button("Add Trait") and self.edit_race_trait_name.strip():
                # This would add a trait - for now we'll skip implementation
                self.edit_race_trait_name = ""
                self.edit_race_trait_desc = ""
            
            imgui.separator()
            
            action_text = "Update" if is_editing else "Create"
            if imgui.button(action_text):
                if self.custom_race_name.strip():
                    # Create or update Race object
                    if is_editing and self.editing_custom_race in self.races:
                        # Update existing race
                        race = self.races[self.editing_custom_race]['race_object']
                        race_id = self.editing_custom_race
                    else:
                        # Create new race
                        race = Race()
                        race_id = f"custom_{self.custom_race_name.lower().replace(' ', '_')}"
                    
                    race.name = self.custom_race_name.strip()
                    race.size = list(Size)[self.edit_race_size]
                    race.speed = max(0, self.edit_race_speed)
                    race.darkvision = max(0, self.edit_race_darkvision)
                    race.languages = ["Common"]
                    race.source = "Custom"
                    
                    # Create/update the UI representation
                    race_data = {
                        'name': race.name,
                        'description': f"Custom race: {race.name} (Size: {race.size.value}, Speed: {race.speed} ft)",
                        'size': race.size.value,
                        'speed': race.speed,
                        'traits': [],
                        'ability_score_increases': [],
                        'languages': race.languages,
                        'darkvision': race.darkvision,
                        'race_object': race
                    }
                    
                    # Add/update in races list and select it
                    self.races[race_id] = race_data
                    self.character_data['race'] = race_data
                    self.selected_race_id = race_id
                    
                    # Reset state
                    self.show_custom_race = False
                    self.editing_custom_race = None
                    self.custom_race_name = ""
                    self.edit_race_speed = 30
                    self.edit_race_size = 0
                    self.edit_race_darkvision = 0
                    imgui.close_current_popup()
            
            imgui.same_line()
            if imgui.button("Cancel"):
                self.show_custom_race = False
                self.editing_custom_race = None
                self.custom_race_name = ""
                self.edit_race_speed = 30
                self.edit_race_size = 0
                self.edit_race_darkvision = 0
                imgui.close_current_popup()
            
            imgui.end_popup()
    
    def _render_custom_class_dialog(self):
        """Render custom class creation/editing dialog"""
        is_editing = self.editing_custom_class is not None
        title = "Edit Custom Class" if is_editing else "Create Custom Class"
        
        imgui.open_popup(title)
        
        if imgui.begin_popup_modal(title, None, 
                                 imgui.WindowFlags_.always_auto_resize.value)[0]:
            imgui.text("Create/Edit a custom class:")
            
            imgui.text("Name:")
            imgui.same_line()
            imgui.set_next_item_width(200)
            changed, self.custom_class_name = imgui.input_text("##custom_class_name", self.custom_class_name)
            
            # Hit die selection
            imgui.text("Hit Die:")
            imgui.same_line()
            hit_dice = [4, 6, 8, 10, 12]
            current_index = hit_dice.index(self.edit_class_hit_die) if self.edit_class_hit_die in hit_dice else 2
            changed, current_index = imgui.combo("##hit_die", current_index, [f"d{die}" for die in hit_dice])
            if changed:
                self.edit_class_hit_die = hit_dice[current_index]
            
            # Number of skills
            imgui.text("Skill Choices:")
            imgui.same_line()
            imgui.set_next_item_width(100)
            changed, self.edit_class_num_skills = imgui.input_int("##num_skills", self.edit_class_num_skills)
            self.edit_class_num_skills = max(0, min(self.edit_class_num_skills, 6))
            
            imgui.separator()
            
            # Feature editing section
            imgui.text("Add Class Feature:")
            imgui.set_next_item_width(150)
            changed, self.edit_class_feature_name = imgui.input_text("Feature Name##feature_name", self.edit_class_feature_name)
            imgui.set_next_item_width(300)
            changed, self.edit_class_feature_desc = imgui.input_text_multiline("Description##feature_desc", 
                                                                             self.edit_class_feature_desc, 
                                                                             (300, 80))
            
            if imgui.button("Add Feature") and self.edit_class_feature_name.strip():
                # This would add a feature - for now we'll skip implementation
                self.edit_class_feature_name = ""
                self.edit_class_feature_desc = ""
            
            imgui.separator()
            
            action_text = "Update" if is_editing else "Create"
            if imgui.button(action_text):
                if self.custom_class_name.strip():
                    # Create or update CharacterClass object
                    if is_editing and self.editing_custom_class in self.classes:
                        # Update existing class
                        char_class = self.classes[self.editing_custom_class]['class_object']
                        class_id = self.editing_custom_class
                    else:
                        # Create new class
                        char_class = CharacterClass()
                        class_id = f"custom_{self.custom_class_name.lower().replace(' ', '_')}"
                    
                    char_class.name = self.custom_class_name.strip()
                    char_class.hit_die = self.edit_class_hit_die
                    char_class.num_skills = self.edit_class_num_skills
                    char_class.source = "Custom"
                    
                    # Create/update the UI representation
                    class_data = {
                        'name': char_class.name,
                        'description': f"Custom class: {char_class.name} (Hit Die: d{char_class.hit_die}, Skills: {char_class.num_skills})",
                        'hit_die': char_class.hit_die,
                        'primary_abilities': [],
                        'saving_throws': [],
                        'skill_proficiencies': [],
                        'armor_proficiencies': [],
                        'weapon_proficiencies': [],
                        'class_object': char_class
                    }
                    
                    # Add/update in classes list and select it
                    self.classes[class_id] = class_data
                    self.character_data['class'] = class_data
                    self.selected_class_id = class_id
                    
                    # Reset state
                    self.show_custom_class = False
                    self.editing_custom_class = None
                    self.custom_class_name = ""
                    self.edit_class_hit_die = 8
                    self.edit_class_num_skills = 2
                    imgui.close_current_popup()
            
            imgui.same_line()
            if imgui.button("Cancel"):
                self.show_custom_class = False
                self.editing_custom_class = None
                self.custom_class_name = ""
                self.edit_class_hit_die = 8
                self.edit_class_num_skills = 2
                imgui.close_current_popup()
            
            imgui.end_popup()
    
    def _render_custom_background_dialog(self):
        """Render custom background creation dialog"""
        imgui.open_popup("Create Custom Background")
        
        if imgui.begin_popup_modal("Create Custom Background", None, 
                                 imgui.WindowFlags_.always_auto_resize.value)[0]:
            imgui.text("Create a custom background:")
            
            imgui.text("Name:")
            imgui.same_line()
            imgui.set_next_item_width(200)
            changed, self.custom_background_name = imgui.input_text("##custom_bg_name", self.custom_background_name)
            
            imgui.separator()
            imgui.text("This will create a basic custom background.")
            imgui.text("You can add skills and equipment manually after creation.")
            
            if imgui.button("Create"):
                if self.custom_background_name.strip():
                    # Create a proper Background object
                    custom_bg = Background()
                    custom_bg.name = self.custom_background_name.strip()
                    custom_bg.source = "Custom"
                    
                    # Create the UI representation
                    bg_id = f"custom_{self.custom_background_name.lower().replace(' ', '_')}"
                    bg_data = {
                        'name': custom_bg.name,
                        'description': f"Custom background: {custom_bg.name}",
                        'skill_proficiencies': [],
                        'tool_proficiencies': [],
                        'languages': [],
                        'equipment': [],
                        'features': [],
                        'background_object': custom_bg
                    }
                    
                    # Add to backgrounds list and select it
                    self.backgrounds[bg_id] = bg_data
                    self.character_data['background'] = bg_data
                    self.selected_background_id = bg_id
                    
                    self.show_custom_background = False
                    self.custom_background_name = ""
                    imgui.close_current_popup()
            
            imgui.same_line()
            if imgui.button("Cancel"):
                self.show_custom_background = False
                self.custom_background_name = ""
                imgui.close_current_popup()
            
            imgui.end_popup()
    
    def _render_custom_equipment_dialog(self):
        """Render custom equipment creation dialog"""
        imgui.open_popup("Add Custom Equipment")
        
        if imgui.begin_popup_modal("Add Custom Equipment", None, 
                                 imgui.WindowFlags_.always_auto_resize.value):
            imgui.text("Enter equipment name:")
            imgui.set_next_item_width(300)
            changed, self.custom_equipment_name = imgui.input_text("##equipment_name", self.custom_equipment_name)
            
            imgui.separator()
            
            if imgui.button("Add Equipment"):
                if self.custom_equipment_name.strip():
                    self.character_data['equipment'].append(self.custom_equipment_name.strip())
                    self.show_custom_equipment = False
                    self.custom_equipment_name = ""
                    imgui.close_current_popup()
            
            imgui.same_line()
            if imgui.button("Cancel"):
                self.show_custom_equipment = False
                self.custom_equipment_name = ""
                imgui.close_current_popup()
            
            imgui.end_popup()
    
    def _create_character(self) -> Optional[Character]:
        """Create final Character instance from collected data"""
        try:
            # Create Character instance
            character = Character()
            
            # Set basic properties
            character.name = self.character_data['name']
            character.player_name = self.character_data['player_name']
            character.level = self.character_data['level']
            
            # Set race, class, background objects
            if self.character_data['race']:
                if 'race_object' in self.character_data['race']:
                    character.race = self.character_data['race']['race_object']
                else:
                    # Create basic race object from data
                    race = Race()
                    race.name = self.character_data['race']['name']
                    character.race = race
            
            if self.character_data['class']:
                if 'class_object' in self.character_data['class']:
                    character.character_class = self.character_data['class']['class_object']
                else:
                    # Create basic class object from data
                    char_class = CharacterClass()
                    char_class.name = self.character_data['class']['name']
                    char_class.hit_die = self.character_data['class'].get('hit_die', 8)
                    character.character_class = char_class
            
            if self.character_data['background']:
                if 'background_object' in self.character_data['background']:
                    character.background = self.character_data['background']['background_object']
                else:
                    # Create basic background object from data
                    background = Background()
                    background.name = self.character_data['background']['name']
                    character.background = background
            
            # Set ability scores (base scores without racial bonuses)
            ability_score_mapping = {
                'STR': AbilityScore.STRENGTH,
                'DEX': AbilityScore.DEXTERITY,
                'CON': AbilityScore.CONSTITUTION,
                'INT': AbilityScore.INTELLIGENCE,
                'WIS': AbilityScore.WISDOM,
                'CHA': AbilityScore.CHARISMA
            }
            
            for ability_key, score in self.character_data['ability_scores'].items():
                if ability_key in ability_score_mapping:
                    ability_enum = ability_score_mapping[ability_key]
                    character.ability_scores[ability_enum] = score
            
            # Set hit points
            character.hit_points = self.character_data['hit_points']
            character.max_hit_points = self.character_data['hit_points']
            
            # Set equipment
            character.equipment = self.character_data['equipment'].copy()
            
            # Update calculated values
            character.update_calculated_values()
            
            # Add to journal via actions bridge
            if self.actions_bridge:
                self.actions_bridge.add_chat_message(f"Character '{character.name}' created successfully!")
                
                # Add character to journal if available
                if self.context and hasattr(self.context, 'journal_panel') and self.context.journal_panel:
                    import uuid
                    entity_id = str(uuid.uuid4())
                    character_entity = {
                        'id': entity_id,
                        'type': 'character',
                        'name': character.name,
                        'character_data': self.character_data,
                        'character_object': character
                    }
                    self.context.journal_panel.entities[entity_id] = character_entity
                    
                    # Select the new character in journal
                    self.context.journal_panel.selected_entity_id = entity_id
                    
                    # Notify other panels if available
                    if hasattr(self.context, 'character_sheet_panel'):
                        self.context.character_sheet_panel.character = character
                        self.context.character_sheet_panel.selected_entity_id = entity_id
            
            logger.info(f"Character created: {character.name} (Level {character.level} {character.race.name if character.race else 'Unknown'} {character.character_class.name if character.character_class else 'Unknown'})")
            
            # Close creator
            self.is_open = False
            
            return character
            
        except Exception as e:
            logger.error(f"Failed to create character: {e}")
            if self.actions_bridge:
                self.actions_bridge.add_chat_message(f"Error creating character: {e}")
            return None
    
    def edit_custom_race(self, race_id: str):
        """Start editing a custom race"""
        if race_id in self.races and 'race_object' in self.races[race_id]:
            race = self.races[race_id]['race_object']
            self.editing_custom_race = race_id
            self.edit_race_speed = race.speed
            self.edit_race_size = list(Size).index(race.size)
            self.edit_race_darkvision = race.darkvision
            self.show_custom_race = True

    def edit_custom_class(self, class_id: str):
        """Start editing a custom class"""
        if class_id in self.classes and 'class_object' in self.classes[class_id]:
            char_class = self.classes[class_id]['class_object']
            self.editing_custom_class = class_id
            self.edit_class_hit_die = char_class.hit_die
            self.edit_class_num_skills = char_class.num_skills
            self.show_custom_class = True

    def edit_custom_background(self, bg_id: str):
        """Start editing a custom background"""
        if bg_id in self.backgrounds and 'background_object' in self.backgrounds[bg_id]:
            background = self.backgrounds[bg_id]['background_object']
            self.editing_custom_background = bg_id
            self.show_custom_background = True
