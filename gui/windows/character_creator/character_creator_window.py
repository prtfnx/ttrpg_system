#!/usr/bin/env python3
"""
Character Creator Window - Refactored modular D&D 5e character creator
"""

from imgui_bundle import imgui
from typing import Dict, List, Optional, Any
import uuid

from core_table.Character import Character
from core_table.compendiums.characters.character import Race, CharacterClass, Background, AbilityScore, Size, Skill
from core_table.actions_protocol import Position
from .enums import CreationStep, AbilityGenMethod
from .utils import CharacterCreatorUtils
from .race_step import RaceStep
from .class_step import ClassStep
from .abilities_step import AbilitiesStep
from .background_step import BackgroundStep
from .proficiencies_step import ProficienciesStep
from .equipment_step import EquipmentStep
from .image_step import ImageStep
from .overview_step import OverviewStep

from logger import setup_logger
logger = setup_logger(__name__)


class CharacterCreator:
    """Modular D&D 5e character creator with step-by-step GUI"""
    
    def __init__(self, context=None, actions_bridge=None):
        self.context = context
        self.actions_bridge = actions_bridge
        
        # Creation state
        self.current_step = CreationStep.RACE
        self.previous_step = None  # Track previous step for detecting changes
        self.is_open = False
        self.existing_character: Optional[Character] = None
        
        # Character data being created
        self.character_data = {}
        self.compendium_data = {}
        
        # Step instances
        self.race_step = None
        self.class_step = None
        self.abilities_step = None
        self.background_step = None
        self.proficiencies_step = None
        self.equipment_step = None
        self.image_step = None
        self.overview_step = None
        
        # Load compendium data
        self._load_compendium_data()
    
    def _load_compendium_data(self):
        """Load compendium data for character creation"""
        logger.debug("Loading compendium data for character creator")
        self.compendium_data = CharacterCreatorUtils.load_compendium_data(self.context)
        logger.debug(f"Loaded {len(self.compendium_data.get('races', {}))} races, "
                    f"{len(self.compendium_data.get('classes', {}))} classes, "
                    f"{len(self.compendium_data.get('backgrounds', {}))} backgrounds")
    
    def open_creator(self, existing_character: Optional[Character] = None):
        """Open the character creator"""
        logger.info("Opening character creator")
        self.is_open = True
        self.existing_character = existing_character
        
        if existing_character:
            self._load_existing_character(existing_character)
        else:
            self._reset_character_data()
        
        # Initialize step instances
        self._initialize_steps()
    
    def _load_existing_character(self, character: Character):
        """Load existing character data for editing/leveling"""
        logger.debug(f"Loading existing character: {character.name}")
        
        self.character_data = {
            'name': character.name or '',
            'race': character.race.name if hasattr(character, 'race') and character.race else '',
            'character_class': character.character_class.name if hasattr(character, 'character_class') and character.character_class else '',
            'level': character.level or 1,
            'background': character.background.name if hasattr(character, 'background') and character.background else '',
            'ability_scores': {},
            'equipment': []
        }
        
        # Load ability scores
        if hasattr(character, 'ability_scores') and character.ability_scores:
            ability_map = {
                AbilityScore.STRENGTH: 'STR',
                AbilityScore.DEXTERITY: 'DEX',
                AbilityScore.CONSTITUTION: 'CON',
                AbilityScore.INTELLIGENCE: 'INT',
                AbilityScore.WISDOM: 'WIS',
                AbilityScore.CHARISMA: 'CHA'
            }
            
            for ability_enum, score in character.ability_scores.items():
                if ability_enum in ability_map:
                    self.character_data['ability_scores'][ability_map[ability_enum]] = score
    
    def _reset_character_data(self):
        """Reset character data to defaults"""
        self.character_data = {
            'name': '',
            'race': '',
            'character_class': '',
            'level': 1,
            'background': '',
            'ability_scores': {
                'STR': 10, 'DEX': 10, 'CON': 10,
                'INT': 10, 'WIS': 10, 'CHA': 10
            },
            'ability_generation_method': AbilityGenMethod.POINT_BUY,
            'skill_proficiencies': [],
            'equipment': []
        }
        self.current_step = CreationStep.RACE
    
    def _initialize_steps(self):
        """Initialize all step instances"""
        self.race_step = RaceStep(self.character_data, self.compendium_data)
        self.class_step = ClassStep(self.character_data, self.compendium_data)
        self.abilities_step = AbilitiesStep(self.character_data, self.compendium_data)
        self.background_step = BackgroundStep(self.character_data, self.compendium_data)
        self.proficiencies_step = ProficienciesStep(self.character_data, self.compendium_data)
        self.equipment_step = EquipmentStep(self.character_data, self.compendium_data)
        self.image_step = ImageStep(self.character_data, self.compendium_data)
        self.overview_step = OverviewStep(self.character_data, self.compendium_data)
    
    def render(self):
        """Render the character creator window"""
        if not self.is_open:
            return
        
        # Set window properties
        imgui.set_next_window_size((1000, 700), imgui.Cond_.first_use_ever.value)
        imgui.set_next_window_pos((200, 100), imgui.Cond_.first_use_ever.value)
        
        window_title = "Character Creator"
        if self.existing_character:
            window_title += f" - Editing {self.existing_character.name}"
        
        expanded, self.is_open = imgui.begin(window_title, self.is_open)
        
        if expanded:
            # Debug: Log current step every few frames
            if hasattr(self, '_debug_frame_count'):
                self._debug_frame_count += 1
            else:
                self._debug_frame_count = 0
            
            if self._debug_frame_count % 60000 == 0:  # Log every 60 frames (~1 second at 60fps)
                logger.debug(f"Character creator current step: {self.current_step.name}")
                logger.debug(f"Steps initialized: Race={self.race_step is not None}, Class={self.class_step is not None}")
            
            # Render header with step navigation
            self._render_header()
            imgui.separator()
            
            # Render current step
            self._render_current_step()
            
            imgui.separator()
            
            # Render navigation buttons
            self._render_navigation_buttons()
        
        imgui.end()
    
    def _render_header(self):
        """Render the header with step indicators"""
        imgui.text("Character Creation Steps:")
        
        steps = [
            (CreationStep.RACE, "Race"),
            (CreationStep.CLASS, "Class"),
            (CreationStep.ABILITIES, "Abilities"),
            (CreationStep.BACKGROUND, "Background"),
            (CreationStep.PROFICIENCIES, "Proficiencies"),
            (CreationStep.EQUIPMENT, "Equipment"),
            (CreationStep.IMAGE, "Image"),
            (CreationStep.OVERVIEW, "Overview")
        ]
        
        for i, (step, label) in enumerate(steps):
            if i > 0:
                imgui.same_line()
                imgui.text(" > ")
                imgui.same_line()
            
            # Style current step
            if step == self.current_step:
                imgui.push_style_color(imgui.Col_.text.value, (0.2, 0.8, 0.2, 1.0))
            elif self._can_access_step(step):
                imgui.push_style_color(imgui.Col_.text.value, (0.8, 0.8, 0.8, 1.0))
            else:
                imgui.push_style_color(imgui.Col_.text.value, (0.5, 0.5, 0.5, 1.0))
            
            # Make clickable if accessible
            if self._can_access_step(step):
                clicked, _ = imgui.selectable(label, step == self.current_step)
                if clicked:
                    old_step = self.current_step
                    self.current_step = step
                    self._on_step_change(old_step, step)
                    logger.debug(f"Switched to step: {step.name}")
            else:
                imgui.text(label)
            
            imgui.pop_style_color()
    
    def _can_access_step(self, step: CreationStep) -> bool:
        """Check if a step can be accessed based on completion of previous steps"""
        if step == CreationStep.RACE:
            return True
        elif step == CreationStep.CLASS:
            return (self.race_step is not None and 
                   self.race_step.is_complete())
        elif step == CreationStep.ABILITIES:
            return (self.race_step is not None and self.race_step.is_complete() and 
                   self.class_step is not None and self.class_step.is_complete())
        elif step == CreationStep.BACKGROUND:
            return (self.race_step is not None and self.race_step.is_complete() and 
                   self.class_step is not None and self.class_step.is_complete() and
                   self.abilities_step is not None and self.abilities_step.is_complete())
        elif step == CreationStep.PROFICIENCIES:
            return (self.race_step is not None and self.race_step.is_complete() and 
                   self.class_step is not None and self.class_step.is_complete() and
                   self.abilities_step is not None and self.abilities_step.is_complete() and
                   self.background_step is not None and self.background_step.is_complete())
        elif step == CreationStep.EQUIPMENT:
            return (self.race_step is not None and self.race_step.is_complete() and 
                   self.class_step is not None and self.class_step.is_complete() and
                   self.abilities_step is not None and self.abilities_step.is_complete() and
                   self.background_step is not None and self.background_step.is_complete() and
                   self.proficiencies_step is not None and self.proficiencies_step.is_complete())
        elif step == CreationStep.IMAGE:
            return (self.race_step is not None and self.race_step.is_complete() and 
                   self.class_step is not None and self.class_step.is_complete() and
                   self.abilities_step is not None and self.abilities_step.is_complete() and
                   self.background_step is not None and self.background_step.is_complete() and
                   self.proficiencies_step is not None and self.proficiencies_step.is_complete() and
                   self.equipment_step is not None and self.equipment_step.is_complete())
        elif step == CreationStep.OVERVIEW:
            return (self.race_step is not None and self.race_step.is_complete() and 
                   self.class_step is not None and self.class_step.is_complete() and
                   self.abilities_step is not None and self.abilities_step.is_complete() and
                   self.background_step is not None and self.background_step.is_complete() and
                   self.proficiencies_step is not None and self.proficiencies_step.is_complete() and
                   self.equipment_step is not None and self.equipment_step.is_complete() and
                   self.image_step is not None and self.image_step.is_complete())
        return False
    
    def _render_current_step(self):
        """Render the current step content"""
        imgui.begin_child("step_content", (0, 500), True)
        
        should_create_character = False
        if self.current_step == CreationStep.RACE and self.race_step:
            self.race_step.render()
        elif self.current_step == CreationStep.CLASS and self.class_step:
            self.class_step.render()
        elif self.current_step == CreationStep.ABILITIES and self.abilities_step:
            self.abilities_step.render()
        elif self.current_step == CreationStep.BACKGROUND and self.background_step:
            self.background_step.render()
        elif self.current_step == CreationStep.PROFICIENCIES and self.proficiencies_step:
            self.proficiencies_step.render()
        elif self.current_step == CreationStep.EQUIPMENT and self.equipment_step:
            self.equipment_step.render()
        elif self.current_step == CreationStep.IMAGE and self.image_step:
            self.image_step.render()
        elif self.current_step == CreationStep.OVERVIEW and self.overview_step:
            is_complete, should_create = self.overview_step.render()
            if should_create:
                should_create_character = True
        else:
            imgui.text("Step not implemented yet")
        
        imgui.end_child()
        
        # Handle character creation after ending the child window
        if should_create_character:
            self._create_character()
    
    def _render_navigation_buttons(self):
        """Render navigation buttons"""
        # Previous button
        can_go_back = self.current_step.value > 0
        if not can_go_back:
            imgui.push_style_color(imgui.Col_.button.value, (0.5, 0.5, 0.5, 0.5))
        
        prev_clicked = imgui.button("< Previous", (100, 30))
        if prev_clicked and can_go_back:
            old_step = self.current_step
            self.current_step = CreationStep(self.current_step.value - 1)
            self._on_step_change(old_step, self.current_step)
            logger.debug(f"Moved to previous step: {self.current_step.name}")
        
        if not can_go_back:
            imgui.pop_style_color()
        
        imgui.same_line()
        
        # Next button
        can_go_forward = (self.current_step.value < len(CreationStep) - 1 and 
                         self._can_access_step(CreationStep(self.current_step.value + 1)))
        
        if not can_go_forward:
            imgui.push_style_color(imgui.Col_.button.value, (0.5, 0.5, 0.5, 0.5))
        
        next_clicked = imgui.button("Next >", (100, 30))
        if next_clicked and can_go_forward:
            old_step = self.current_step
            self.current_step = CreationStep(self.current_step.value + 1)
            self._on_step_change(old_step, self.current_step)
            logger.debug(f"Moved to next step: {self.current_step.name}")
        
        if not can_go_forward:
            imgui.pop_style_color()
        
        imgui.same_line()
        
        # Cancel button
        if imgui.button("Cancel", (100, 30)):
            self.is_open = False
            logger.debug("Character creator cancelled")
    
    def _create_character(self):
        """Create the character object and add it to the game"""
        try:
            logger.info("Creating character from creator data")
            
            # Create Character object
            character = Character()
            character.name = self.character_data.get('name', 'Unnamed Character')
            character.level = self.character_data.get('level', 1)
            character.player_name = "Player"  # Could be made configurable
            
            # Set ability scores
            ability_scores = self.character_data.get('ability_scores', {})
            racial_bonuses = self._get_racial_bonuses()
            
            ability_map = {
                'STR': AbilityScore.STRENGTH,
                'DEX': AbilityScore.DEXTERITY,
                'CON': AbilityScore.CONSTITUTION,
                'INT': AbilityScore.INTELLIGENCE,
                'WIS': AbilityScore.WISDOM,
                'CHA': AbilityScore.CHARISMA
            }
            
            for ability_str, ability_enum in ability_map.items():
                base_score = ability_scores.get(ability_str, 10)
                racial_bonus = racial_bonuses.get(ability_str, 0)
                final_score = base_score + racial_bonus
                character.ability_scores[ability_enum] = final_score
            
            # Calculate derived stats
            con_modifier = CharacterCreatorUtils.calculate_modifier(
                character.ability_scores.get(AbilityScore.CONSTITUTION, 10))
            
            # Set hit points (max at level 1)
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
            
            character.max_hit_points = hit_die + con_modifier
            character.hit_points = character.max_hit_points
            
            # Set armor class (base calculation)
            dex_modifier = CharacterCreatorUtils.calculate_modifier(
                character.ability_scores.get(AbilityScore.DEXTERITY, 10))
            character.armor_class = 10 + dex_modifier
            
            # Set skill proficiencies
            skill_proficiencies = self.character_data.get('skill_proficiencies', [])
            skill_enum_map = {
                'Acrobatics': Skill.ACROBATICS,
                'Animal Handling': Skill.ANIMAL_HANDLING,
                'Arcana': Skill.ARCANA,
                'Athletics': Skill.ATHLETICS,
                'Deception': Skill.DECEPTION,
                'History': Skill.HISTORY,
                'Insight': Skill.INSIGHT,
                'Intimidation': Skill.INTIMIDATION,
                'Investigation': Skill.INVESTIGATION,
                'Medicine': Skill.MEDICINE,
                'Nature': Skill.NATURE,
                'Perception': Skill.PERCEPTION,
                'Performance': Skill.PERFORMANCE,
                'Persuasion': Skill.PERSUASION,
                'Religion': Skill.RELIGION,
                'Sleight of Hand': Skill.SLEIGHT_OF_HAND,
                'Stealth': Skill.STEALTH,
                'Survival': Skill.SURVIVAL,
            }
            
            for skill_name in skill_proficiencies:
                if skill_name in skill_enum_map:
                    skill_enum = skill_enum_map[skill_name]
                    if skill_enum not in character.skill_proficiencies:
                        character.skill_proficiencies.append(skill_enum)
                        logger.debug(f"Added skill proficiency: {skill_name}")
            
            # Add character through Actions
            if self.actions_bridge and hasattr(self.actions_bridge, 'add_character_from_creator'):
                legacy_data = self._convert_to_legacy_format()
                entity_id = self.actions_bridge.add_character_from_creator(character, legacy_data)
                
                if entity_id:
                    logger.info(f"Character '{character.name}' added through Actions with ID: {entity_id}")
                    
                    # Create sprite if image was selected
                    if self.character_data.get('selected_image'):
                        self._create_character_sprite(entity_id)
                    
                    if self.actions_bridge:
                        self.actions_bridge.add_chat_message(f"Created character: {character.name}")
                else:
                    logger.warning("Failed to add character through Actions")
                    if self.actions_bridge:
                        self.actions_bridge.add_chat_message(f"Failed to create character: {character.name}")
            else:
                logger.warning("Actions bridge not available for character creation")
                if self.actions_bridge:
                    self.actions_bridge.add_chat_message(f"Character created but not added: {character.name}")
            
            # Close the creator
            self.is_open = False
            logger.info(f"Character creation completed: {character.name}")
            
        except Exception as e:
            logger.error(f"Error creating character: {e}")
            if self.actions_bridge:
                self.actions_bridge.add_chat_message(f"Error creating character: {str(e)}")
    
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
    
    def _convert_to_legacy_format(self) -> Dict:
        """Convert character data to legacy format for compatibility"""
        ability_scores = self.character_data.get('ability_scores', {})
        racial_bonuses = self._get_racial_bonuses()
        
        # Apply racial bonuses to final scores
        final_scores = {}
        for ability in ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA']:
            base = ability_scores.get(ability, 10)
            bonus = racial_bonuses.get(ability, 0)
            final_scores[ability] = base + bonus
        
        return {
            'name': self.character_data.get('name', ''),
            'class_level': f"{self.character_data.get('character_class', '')} {self.character_data.get('level', 1)}",
            'race': self.character_data.get('race', ''),
            'background': self.character_data.get('background', ''),
            'ability_scores': final_scores,
            'equipment': '\n'.join(self.character_data.get('equipment', [])),
            'level': self.character_data.get('level', 1)
        }
    
    def _create_character_sprite(self, entity_id: str):
        """Create a sprite for the character if an image was selected"""
        selected_image = self.character_data.get('selected_image', '')
        
        if not selected_image or not self.actions_bridge:
            logger.debug("No image selected or no actions bridge available for sprite creation")
            return
            
        try:
            # Check if current table exists
            if not self.context or not hasattr(self.context, 'current_table') or not self.context.current_table:
                logger.warning("No current table available for sprite creation")
                return
            
            # Create sprite at center of table - use actions bridge simple method
            result = self.actions_bridge.create_sprite(
                sprite_id=entity_id,
                image_path=selected_image,
                x=500.0,  # Default center position
                y=500.0,
                layer="tokens"
            )
            
            if result:
                logger.info(f"Created sprite for character {entity_id} with image {selected_image}")
                if self.actions_bridge:
                    self.actions_bridge.add_chat_message(f"Character sprite created")
            else:
                logger.error(f"Failed to create sprite for character {entity_id}")
                if self.actions_bridge:
                    self.actions_bridge.add_chat_message(f"Failed to create character sprite")
                    
        except Exception as e:
            logger.error(f"Error creating character sprite: {e}")
            if self.actions_bridge:
                self.actions_bridge.add_chat_message(f"Error creating sprite: {str(e)}")
    
    def _on_step_change(self, old_step: CreationStep, new_step: CreationStep):
        """Handle step changes - update steps that depend on previous step data"""
        # Update proficiencies when entering the proficiencies step
        if new_step == CreationStep.PROFICIENCIES and self.proficiencies_step:
            self.proficiencies_step.update_available_proficiencies_on_step_change()
            logger.debug("Updated proficiencies for step change")
