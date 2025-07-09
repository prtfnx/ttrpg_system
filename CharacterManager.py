#!/usr/bin/env python3
"""
Character Manager - Centralized character management system
Handles character creation, storage, loading, and manipulation for the VTT system.
"""

import json
import uuid
from pathlib import Path
from typing import Dict, List, Optional, Any, Union
from dataclasses import asdict
import time

# Import the unified Character class from core_table
from core_table.Character import Character, Player, NPC
from core_table.compendiums.characters.character import (
    Race, CharacterClass, Background, AbilityScore, Skill, Size
)
from CompendiumManager import get_compendium_manager
from logger import setup_logger
import settings

logger = setup_logger(__name__)


class CharacterManager:
    """Centralized manager for all character operations in the VTT system"""
    
    def __init__(self, storage_root: Optional[str] = None):
        # Use settings-defined storage directory if none provided
        if storage_root is None:
            storage_root = settings.DEFAULT_STORAGE_PATH
            
        self.storage_root = Path(storage_root)
        self.storage_root.mkdir(parents=True, exist_ok=True)
        
        self.characters_file = self.storage_root / "characters.json"
        self.characters: Dict[str, Character] = {}  # character_id -> Character object
        
        # Get compendium manager for race/class/background data
        self.compendium_manager = get_compendium_manager()
        
        # Character creation state tracking
        self.active_creations: Dict[str, Dict] = {}  # session_id -> creation_data
        
        # Context reference for sprite creation (set externally)
        self.context = None
        
        # Statistics
        self.stats = {
            'total_characters': 0,
            'players': 0,
            'npcs': 0,
            'created_today': 0,
            'last_created': None,
            'last_loaded': None
        }
        
        self._load_characters()
        logger.info(f"CharacterManager initialized with storage: {self.storage_root}")
    
    def _load_characters(self):
        """Load characters from disk"""
        if self.characters_file.exists():
            try:
                with open(self.characters_file, 'r') as f:
                    data = json.load(f)
                
                # Load character objects from saved data
                for char_id, char_data in data.get('characters', {}).items():
                    try:
                        character = self._create_character_from_data(char_data)
                        self.characters[char_id] = character
                    except Exception as e:
                        logger.error(f"Failed to load character {char_id}: {e}")
                
                # Load statistics
                self.stats.update(data.get('stats', {}))
                
                logger.info(f"Loaded {len(self.characters)} characters from storage")
                
            except Exception as e:
                logger.error(f"Failed to load characters file: {e}")
                self.characters = {}
    
    def set_context(self, context):
        """Set the context reference for sprite creation"""
        self.context = context
        logger.debug("CharacterManager context reference set")
    
    def _save_characters(self):
        """Save characters to disk"""
        try:
            # Convert characters to serializable format
            characters_data = {}
            for char_id, character in self.characters.items():
                characters_data[char_id] = character.to_dict()
            
            # Update statistics
            self.stats['total_characters'] = len(self.characters)
            self.stats['players'] = sum(1 for c in self.characters.values() 
                                      if isinstance(c, Player))
            self.stats['npcs'] = sum(1 for c in self.characters.values() 
                                   if isinstance(c, NPC))
            
            data = {
                'characters': characters_data,
                'stats': self.stats,
                'last_saved': time.time()
            }
            
            with open(self.characters_file, 'w') as f:
                json.dump(data, f, indent=2)
                
            logger.debug(f"Saved {len(self.characters)} characters to storage")
            
        except Exception as e:
            logger.error(f"Failed to save characters: {e}")
    
    def _create_character_from_data(self, char_data: Dict[str, Any]) -> Character:
        """Create a Character object from saved data"""
        # Determine character type
        if char_data.get('is_player_character', True):
            character = Player()
        else:
            character = NPC()
        
        # Restore basic attributes
        character.name = char_data.get('name', '')
        character.player_name = char_data.get('player_name', '')
        character.level = char_data.get('level', 1)
        character.hit_points = char_data.get('hit_points', 0)
        character.max_hit_points = char_data.get('max_hit_points', 0)
        character.temporary_hit_points = char_data.get('temporary_hit_points', 0)
        character.armor_class = char_data.get('armor_class', 10)
        character.speed = char_data.get('speed', 30)
        character.initiative = char_data.get('initiative', 0)
        character.inspiration = char_data.get('inspiration', False)
        character.alignment = char_data.get('alignment', '')
        character.experience_points = char_data.get('experience_points', 0)
        character.backstory = char_data.get('backstory', '')
        
        # Restore ability scores
        ability_scores = char_data.get('ability_scores', {})
        for ability_name, score in ability_scores.items():
            for ability in AbilityScore:
                if ability.value == ability_name:
                    character.ability_scores[ability] = score
                    break
        
        # Restore race, class, background from compendium
        race_name = char_data.get('race', '')
        if race_name and self.compendium_manager:
            character.race = self.compendium_manager.get_race(race_name)
        
        class_name = char_data.get('character_class', '')
        if class_name and self.compendium_manager:
            character.character_class = self.compendium_manager.get_character_class(class_name)
        
        background_name = char_data.get('background', '')
        if background_name and self.compendium_manager:
            character.background = self.compendium_manager.get_background(background_name)
        
        # Restore other attributes
        character.inventory = char_data.get('inventory', [])
        character.death_save_successes = char_data.get('death_save_successes', [False, False, False])
        character.death_save_failures = char_data.get('death_save_failures', [False, False, False])
        
        # VTT-specific attributes
        character.sprite_id = char_data.get('sprite_id')
        character.position_x = char_data.get('position_x', 0.0)
        character.position_y = char_data.get('position_y', 0.0)
        character.token_size = char_data.get('token_size', 1)
        character.visibility = char_data.get('visibility', True)
        
        # Update calculated values
        character.update_calculated_values()
        
        return character
    
    def create_character(self, name: str, is_player: bool = True, 
                        player_name: str = "", **kwargs) -> str:
        """Create a new character and return its ID"""
        char_id = str(uuid.uuid4())
        
        # Create appropriate character type
        if is_player:
            character = Player(name=name, player_name=player_name, **kwargs)
        else:
            character = NPC(name=name, **kwargs)
        
        # Store character
        self.characters[char_id] = character
        
        # Create default sprite for the character if context is available
        self._create_default_sprite_for_character(char_id, character)
        
        # Update statistics
        self.stats['last_created'] = time.time()
        today = time.strftime('%Y-%m-%d')
        if self.stats.get('last_created_date') != today:
            self.stats['created_today'] = 1
            self.stats['last_created_date'] = today
        else:
            self.stats['created_today'] += 1
        
        # Save to disk
        self._save_characters()
        
        logger.info(f"Created {'player' if is_player else 'NPC'} character: {name} (ID: {char_id})")
        return char_id
    
    def get_character(self, character_id: str) -> Optional[Character]:
        """Get a character by ID"""
        return self.characters.get(character_id)
    
    def update_character(self, character_id: str, character: Character) -> bool:
        """Update an existing character"""
        if character_id not in self.characters:
            logger.warning(f"Attempted to update non-existent character: {character_id}")
            return False
        
        self.characters[character_id] = character
        self._save_characters()
        
        logger.debug(f"Updated character: {character.name} (ID: {character_id})")
        return True
    
    def delete_character(self, character_id: str) -> bool:
        """Delete a character"""
        if character_id not in self.characters:
            logger.warning(f"Attempted to delete non-existent character: {character_id}")
            return False
        
        character_name = self.characters[character_id].name
        del self.characters[character_id]
        self._save_characters()
        
        logger.info(f"Deleted character: {character_name} (ID: {character_id})")
        return True
    
    def get_all_characters(self) -> Dict[str, Character]:
        """Get all characters"""
        return self.characters.copy()
    
    def list_characters(self) -> Dict[str, Dict[str, Any]]:
        """Get all characters in a format suitable for GUI display"""
        result = {}
        for char_id, character in self.characters.items():
            try:
                # Convert character to dictionary format for GUI
                char_data = character.to_dict()
                char_data['id'] = char_id
                char_data['character_id'] = char_id
                result[char_id] = char_data
            except Exception as e:
                logger.error(f"Error serializing character {char_id}: {e}, type {type(character)}")
                # Provide minimal fallback data
                result[char_id] = {
                    'id': char_id,
                    'character_id': char_id,
                    'name': getattr(character, 'name', 'Unknown'),
                    'level': getattr(character, 'level', 1),
                    'character_class': getattr(character, 'character_class', {}).get('name', 'Unknown') if hasattr(character, 'character_class') and character.character_class else 'Unknown',
                    'race': getattr(character, 'race', {}).get('name', 'Unknown') if hasattr(character, 'race') and character.race else 'Unknown',
                    'hit_points': getattr(character, 'hit_points', 0),
                    'max_hit_points': getattr(character, 'max_hit_points', 0),
                    'is_player_character': isinstance(character, Player)
                }
        return result
    
    def create_character_from_creator_data(self, creator_data: Dict[str, Any]) -> str:
        """Create a character from character creator data"""
        # Extract basic info
        name = creator_data.get('name', 'Unnamed Character')
        is_player = creator_data.get('is_player', True)
        player_name = creator_data.get('player_name', '')
        
        # Create base character
        char_id = self.create_character(name, is_player, player_name)
        character = self.characters[char_id]
        
        # Set ability scores
        ability_scores = creator_data.get('ability_scores', {})
        for ability_name, score in ability_scores.items():
            for ability in AbilityScore:
                if ability.value.upper() == ability_name.upper():
                    character.ability_scores[ability] = score
                    break
        
        # Set race, class, background from compendium
        race_name = creator_data.get('race', '')
        if race_name and self.compendium_manager:
            character.race = self.compendium_manager.get_race(race_name)
        
        class_name = creator_data.get('character_class', '')
        if class_name and self.compendium_manager:
            character.character_class = self.compendium_manager.get_character_class(class_name)
        
        background_name = creator_data.get('background', '')
        if background_name and self.compendium_manager:
            character.background = self.compendium_manager.get_background(background_name)
        
        # Set other attributes
        character.alignment = creator_data.get('alignment', '')
        character.backstory = creator_data.get('backstory', '')
        
        # Add equipment
        equipment = creator_data.get('equipment', [])
        for item in equipment:
            character.add_item(item)
        
        # Set image/sprite info
        selected_image = creator_data.get('selected_image')
        if selected_image:
            # Store image path in backstory or a custom field for later sprite creation
            if not hasattr(character, '_selected_image'):
                character.__dict__['_selected_image'] = selected_image
        
        # Update calculated values (HP, AC, etc.)
        character.update_calculated_values()
        
        # Save updated character
        self.update_character(char_id, character)
        
        logger.info(f"Created character from creator data: {name} (ID: {char_id})")
        return char_id
    
    def get_character_for_journal(self, character_id: str) -> Optional[Dict[str, Any]]:
        """Get character data formatted for journal panel"""
        character = self.get_character(character_id)
        if not character:
            return None
        
        return {
            'id': character_id,
            'type': 'character',
            'name': character.name,
            'character_object': character,
            'character_data': character.to_dict(),
            'creation_type': 'character_manager'
        }
    
    def level_up_character(self, character_id: str) -> bool:
        """Level up a character"""
        character = self.get_character(character_id)
        if not character:
            return False
        
        old_level = character.level
        character.level += 1
        
        # Recalculate derived stats
        character.update_calculated_values()
        
        # Save changes
        self.update_character(character_id, character)
        
        logger.info(f"Leveled up character {character.name} from {old_level} to {character.level}")
        return True
    
    def apply_damage(self, character_id: str, damage: int) -> Optional[Dict[str, Any]]:
        """Apply damage to a character"""
        character = self.get_character(character_id)
        if not character:
            return None
        
        result = character.take_damage(damage)
        self.update_character(character_id, character)
        
        logger.info(f"Applied {damage} damage to {character.name}: {result}")
        return result
    
    def heal_character(self, character_id: str, healing: int) -> Optional[int]:
        """Heal a character"""
        character = self.get_character(character_id)
        if not character:
            return None
        
        actual_healing = character.heal(healing)
        self.update_character(character_id, character)
        
        logger.info(f"Healed {character.name} for {actual_healing} HP")
        return actual_healing
    
    def create_sprite_for_character(self, character_id: str, actions_bridge) -> bool:
        """Create a sprite for a character if they have an image"""
        character = self.get_character(character_id)
        if not character:
            return False
        
        # Check if character has an image selected
        selected_image = character.__dict__.get('_selected_image', None)
        if not selected_image:
            logger.debug(f"No image selected for character {character.name}")
            return False
        
        try:
            # Use actions bridge to create sprite
            if actions_bridge and hasattr(actions_bridge, 'create_character_sprite'):
                sprite_id = actions_bridge.create_character_sprite(character, selected_image)
                if sprite_id:
                    character.sprite_id = sprite_id
                    self.update_character(character_id, character)
                    logger.info(f"Created sprite for character {character.name}: {sprite_id}")
                    return True
            
        except Exception as e:
            logger.error(f"Failed to create sprite for character {character.name}: {e}")
        
        return False
    
    def get_compendium_data(self) -> Dict[str, Any]:
        """Get compendium data for character creation"""
        if not self.compendium_manager:
            logger.warning("No compendium manager available")
            return {'races': {}, 'classes': {}, 'backgrounds': {}}
        
        try:
            # Get all compendium data
            races = self.compendium_manager.get_all_races()
            classes = self.compendium_manager.get_all_classes()
            backgrounds = self.compendium_manager.get_all_backgrounds()
            
            # Convert to dictionaries for UI consumption
            races_dict = {}
            for name, race in races.items():
                race_id = name.lower().replace(' ', '_').replace("'", "")
                races_dict[race_id] = {
                    'name': race.name,
                    'size': race.size.value if race.size else 'Medium',
                    'speed': race.speed,
                    'description': f"Size: {race.size.value if race.size else 'Medium'}, Speed: {race.speed} ft",
                    'race_object': race
                }
            
            classes_dict = {}
            for name, char_class in classes.items():
                class_id = name.lower().replace(' ', '_').replace("'", "")
                classes_dict[class_id] = {
                    'name': char_class.name,
                    'hit_die': char_class.hit_die,
                    'description': f"Hit Die: d{char_class.hit_die}",
                    'class_object': char_class
                }
            
            backgrounds_dict = {}
            for name, background in backgrounds.items():
                bg_id = name.lower().replace(' ', '_').replace("'", "")
                backgrounds_dict[bg_id] = {
                    'name': background.name,
                    'description': "Background with skills and equipment",
                    'background_object': background
                }
            
            return {
                'races': races_dict,
                'classes': classes_dict,
                'backgrounds': backgrounds_dict
            }
            
        except Exception as e:
            logger.error(f"Failed to get compendium data: {e}")
            return {'races': {}, 'classes': {}, 'backgrounds': {}}
    
    def get_stats(self) -> Dict[str, Any]:
        """Get character manager statistics"""
        return {
            **self.stats,
            'current_characters': len(self.characters),
            'current_players': len(self.get_player_characters()),
            'current_npcs': len(self.get_npcs())
        }
    
    def cleanup_orphaned_data(self):
        """Clean up any orphaned character data"""
        # This can be extended to clean up related data like sprites, etc.
        logger.info("Character cleanup completed")
    
    def get_player_characters(self) -> Dict[str, Character]:
        """Get all player characters"""
        return {char_id: char for char_id, char in self.characters.items() 
                if isinstance(char, Player)}
    
    def get_npcs(self) -> Dict[str, Character]:
        """Get all NPC characters"""
        return {char_id: char for char_id, char in self.characters.items() 
                if isinstance(char, NPC)}
    
    def search_characters(self, query: str) -> Dict[str, Character]:
        """Search characters by name"""
        query_lower = query.lower()
        return {char_id: char for char_id, char in self.characters.items() 
                if query_lower in char.name.lower()}
    
    def duplicate_character(self, character_id: str, new_name: Optional[str] = None) -> Optional[str]:
        """Duplicate an existing character"""
        original = self.get_character(character_id)
        if not original:
            logger.warning(f"Cannot duplicate non-existent character: {character_id}")
            return None
        
        # Create a copy of the character data
        char_data = original.to_dict()
        
        # Set new name
        if new_name:
            char_data['name'] = new_name
        else:
            char_data['name'] = f"{original.name} (Copy)"
        
        # Create new character from the data
        new_char_id = self.create_character_from_creator_data(char_data)
        
        logger.info(f"Duplicated character {original.name} -> {char_data['name']} (ID: {new_char_id})")
        return new_char_id
    
    def add_character(self, character_obj: Character, legacy_data: Optional[Dict] = None) -> str:
        """Add an existing character object to the manager"""
        char_id = str(uuid.uuid4())
        
        # Store the character object
        self.characters[char_id] = character_obj
        
        # Create default sprite for the character if context is available
        self._create_default_sprite_for_character(char_id, character_obj)
        
        # Update statistics
        self.stats['last_created'] = time.time()
        today = time.strftime('%Y-%m-%d')
        if self.stats.get('last_created_date') != today:
            self.stats['created_today'] = 1
            self.stats['last_created_date'] = today
        else:
            self.stats['created_today'] += 1
        
        # Save to disk
        self._save_characters()
        
        logger.info(f"Added character object: {character_obj.name} (ID: {char_id})")
        return char_id
    
    def save_character(self, character_id: str, character_obj: Optional[Character] = None, legacy_data: Optional[Dict] = None) -> bool:
        """Save character data (explicit save operation)"""
        if character_obj:
            return self.update_character(character_id, character_obj)
        else:
            # Just trigger a save of existing data
            self._save_characters()
            return True
    
    def load_character(self, character_id: str) -> Optional[Character]:
        """Load character data (alias for get_character for API consistency)"""
        return self.get_character(character_id)
    
    def _create_default_sprite_for_character(self, char_id: str, character: Character):
        """Create a default sprite for a character if no sprite exists and context is available"""
        try:
            # Import here to avoid circular imports
            from core_table.actions_protocol import Position
            
            # Check if we have access to context
            context = self.context
            if not context:
                logger.debug(f"No context available to create sprite for character {character.name}")
                return
            
            # Check if context has required components
            if not (hasattr(context, 'Actions') and hasattr(context, 'current_table') and 
                   context.Actions and context.current_table):
                logger.debug(f"Context missing required components for sprite creation")
                return
            
            # Check if character already has a sprite
            table = context.current_table
            for layer_sprites in table.dict_of_sprites_list.values():
                for sprite in layer_sprites:
                    if hasattr(sprite, 'character') and sprite.character == character:
                        logger.debug(f"Character {character.name} already has a sprite")
                        return
            
            # Create default sprite for character
            import random
            sprite_x = 50 + random.randint(0, 200)  # Random position to avoid overlap
            sprite_y = 50 + random.randint(0, 200)
            
            result = context.Actions.create_sprite(
                table.table_id,
                char_id,  # Use character ID as sprite ID
                Position(sprite_x, sprite_y),
                image_path="res/default.png",
                scale_x=0.5,
                scale_y=0.5,
                character=character,
                layer='tokens'
            )
            
            if result.success:
                logger.info(f"Created default sprite for character {character.name} at ({sprite_x}, {sprite_y})")
            else:
                logger.warning(f"Failed to create default sprite for character {character.name}: {result.message}")
                
        except Exception as e:
            logger.warning(f"Error creating default sprite for character {character.name}: {e}")
        

# Global character manager instance (lazy loaded)
_character_manager = None

def get_character_manager(storage_root: Optional[str] = None) -> CharacterManager:
    """Get the global character manager instance"""
    global _character_manager
    if _character_manager is None:
        _character_manager = CharacterManager(storage_root)
    return _character_manager


# Convenience functions for common operations
def create_character(name: str, is_player: bool = True, **kwargs) -> str:
    """Create a new character"""
    return get_character_manager().create_character(name, is_player, **kwargs)

def get_character(character_id: str) -> Optional[Character]:
    """Get a character by ID"""
    return get_character_manager().get_character(character_id)

def search_characters(query: str) -> Dict[str, Character]:
    """Search characters by name"""
    return get_character_manager().search_characters(query)
