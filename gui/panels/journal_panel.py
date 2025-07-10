#!/usr/bin/env python3
"""
Journal Panel - Manages characters, monsters, handouts, and NPCs
"""
from ..windows.character_sheet_window import CharacterSheetWindow
from imgui_bundle import imgui
from typing import Dict, List, Optional
from enum import Enum
import uuid
from logger import setup_logger
logger = setup_logger(__name__)


class EntityType(Enum):
    CHARACTER = "character"
    MONSTER = "monster" 
    HANDOUT = "handout"
    NPC = "npc"


class CharacterCreationType(Enum):
    NPC = "npc"
    CHARACTER_MANAGER = "character_manager"
    MANUAL = "manual"


class JournalPanel:
    def __init__(self, context=None, actions_bridge=None):
        self.context = context
        self.actions_bridge = actions_bridge
        
        # Entity management
        self.entities: Dict[str, Dict] = {}
        self.selected_entity_id: Optional[str] = None
        self.entity_filter = EntityType.CHARACTER
        
        # UI state
        self.show_character_creation_popup = False
        self.new_entity_name = ""
        
        # Windows - store actual window instances instead of just boolean flags
        self.character_windows = {}  # entity_id -> CharacterSheetWindow
        
        # Handout windows
        self.handout_windows: Dict[str, bool] = {}
        
        # Window state for handouts
        self.handout_texts: Dict[str, str] = {}
        
    def render(self):
        """Main render method"""
        # Filter buttons
        self._render_filter_buttons()
        imgui.separator()
        
        # Action buttons
        self._render_action_buttons()
        imgui.separator()
        
        # Entity list
        self._render_entity_list()
        
        # Character creation popup
        if self.show_character_creation_popup:
            self._render_character_creation_popup()
            
        # Character windows
        self._render_character_windows()
        
        # Handout windows
        self._render_handout_windows()
    
    def _render_filter_buttons(self):
        """Render entity type filter buttons"""
        for entity_type in EntityType:
            if entity_type == self.entity_filter:
                imgui.push_style_color(imgui.Col_.button.value, (0.2, 0.7, 0.2, 1.0))
            
            clicked, _ = imgui.selectable(entity_type.value.title(), 
                                        entity_type == self.entity_filter)
            if clicked:
                self.entity_filter = entity_type
                
            if entity_type == self.entity_filter:
                imgui.pop_style_color()
                
            imgui.same_line()
        imgui.new_line()
    
    def _render_action_buttons(self):
        """Render action buttons"""
        # Add buttons based on current filter
        if self.entity_filter == EntityType.CHARACTER:
            if imgui.button("Add Character", (-1, 30)):
                self.show_character_creation_popup = True
        elif self.entity_filter == EntityType.HANDOUT:
            if imgui.button("Add Handout", (-1, 30)):
                self._add_handout()
        elif self.entity_filter == EntityType.MONSTER:
            if imgui.button("Add Monster", (-1, 30)):
                self._add_monster()
        elif self.entity_filter == EntityType.NPC:
            if imgui.button("Add NPC", (-1, 30)):
                self._add_npc()
        
        # Delete button (only if entity selected)
        if self.selected_entity_id:
            if imgui.button("Delete", (-1, 30)):
                self._delete_entity(self.selected_entity_id)
    
    def _render_entity_list(self):
        """Render filtered entity list"""
        # For characters, get them from CharacterManager via Actions
        if self.entity_filter == EntityType.CHARACTER:
            if self.actions_bridge and hasattr(self.actions_bridge, 'list_characters'):
                characters = self.actions_bridge.list_characters()
                if not characters:
                    imgui.text_colored((0.6, 0.6, 0.6, 1.0), "No characters found")
                    return
                
                for character_id, character_data in characters.items():
                    is_selected = character_id == self.selected_entity_id
                    character_name = character_data.get('name', 'Unnamed Character')
                    
                    clicked, _ = imgui.selectable(character_name, is_selected)
                    if clicked:
                        self.selected_entity_id = character_id
                        self.notify_entity_selected(character_id)
                        
                        # Create and store a persistent window instance
                        if character_id not in self.character_windows:
                            
                            window = CharacterSheetWindow(self.context, self.actions_bridge)
                            
                            # Set the character ID for saving purposes
                            window.character_id = character_id
                            
                            # Load the character data into the window
                            character_obj = character_data.get('character_object')
                            
                            if character_obj:
                                # If we have a Character object, set it and load from it
                                window.character = character_obj
                                window.load_from_character()
                            else:
                                # For legacy data, set basic info
                                window.character_name = character_name
                                window.class_level = character_data.get('class_level', '')
                                window.race = character_data.get('race', '')
                                window.background = character_data.get('background', '')
                                window.alignment = character_data.get('alignment', '')
                                
                                # Load ability scores
                                ability_scores = character_data.get('ability_scores', {})
                                for ability, score in ability_scores.items():
                                    if ability.upper() in window.ability_scores:
                                        window.ability_scores[ability.upper()] = score
                                
                                window.update_derived_stats()
                            
                            self.character_windows[character_id] = window
                            
                            # Add to external_windows for rendering
                            if hasattr(self.context, 'imgui') and self.context.imgui:
                                if window not in self.context.imgui.external_windows:
                                    self.context.imgui.external_windows.append(window)
                                    logger.info("Character sheet window added to external windows from journal panel.")
                        else:
                            # Window already exists, reload fresh data from CharacterManager
                            window = self.character_windows[character_id]
                            character_obj = character_data.get('character_object')
                            if character_obj:
                                window.character = character_obj
                                window.load_from_character()
                                logger.info(f"Reloaded fresh character data for existing window: {character_id}")
                        
                        # Always ensure the window has the latest character data
                        window = self.character_windows[character_id]
                        character_obj = character_data.get('character_object')
                        if character_obj:
                            window.character = character_obj
                            window.load_from_character()
                            logger.debug(f"Ensured character object is set for window: {character_id}")
                        else:
                            logger.warning(f"No character object available for window: {character_id}")
                        
                        window.show_full_window = True
                        # Only open character window, not character sheet panel
                    
                    # Right-click context menu for characters
                    if imgui.begin_popup_context_item(f"character_context_{character_id}"):
                        
                        if imgui.menu_item("Level Up", "", False)[0]:
                            self._level_up_character(character_id)
                        
                        if imgui.menu_item("Edit Character", "", False)[0]:
                            self._edit_character(character_id)
                        
                        if imgui.menu_item("Duplicate", "", False)[0]:
                            self._duplicate_character(character_id)
                        
                        imgui.separator()
                        
                        if imgui.menu_item("Delete", "", False)[0]:
                            self._delete_character(character_id)
                        
                        imgui.end_popup()
            else:
                imgui.text_colored((0.6, 0.6, 0.6, 1.0), "Actions bridge not available")
                return
        else:
            # For other entity types, use the existing system
            filtered_entities = {k: v for k, v in self.entities.items() 
                               if v.get('type') == self.entity_filter.value}
            
            if not filtered_entities:
                imgui.text_colored((0.6, 0.6, 0.6, 1.0), f"No {self.entity_filter.value}s found")
                return
            
            for entity_id, entity_data in filtered_entities.items():
                is_selected = entity_id == self.selected_entity_id
                
                clicked, _ = imgui.selectable(entity_data.get('name', 'Unnamed'), is_selected)
                if clicked:
                    self.selected_entity_id = entity_id
                    self.notify_entity_selected(entity_id)
                    
                    # Open appropriate window based on entity type
                    if entity_data.get('type') == EntityType.HANDOUT.value:
                        self._open_handout_window(entity_id)
    
    def _render_character_creation_popup(self):
        """Render character creation method popup"""
        imgui.open_popup("Character Creation")
        
        if imgui.begin_popup_modal("Character Creation", None, 
                                 imgui.WindowFlags_.always_auto_resize.value)[0]:
            imgui.text("Select character creation method:")
            imgui.separator()
            
            # NPC option
            if imgui.button("NPC", (150, 40)):
                self._create_character(CharacterCreationType.NPC)
                self.show_character_creation_popup = False
                imgui.close_current_popup()
            
            # Character Manager option  
            if imgui.button("Character Manager", (150, 40)):
                self._create_character(CharacterCreationType.CHARACTER_MANAGER)
                self.show_character_creation_popup = False
                imgui.close_current_popup()
            
            # Manual option
            if imgui.button("Manual Character", (150, 40)):
                self._create_character(CharacterCreationType.MANUAL)
                self.show_character_creation_popup = False
                imgui.close_current_popup()
            
            imgui.separator()
            if imgui.button("Cancel", (150, 30)):
                self.show_character_creation_popup = False
                imgui.close_current_popup()
            
            imgui.end_popup()
    
    def _render_character_windows(self):
        """Manage character sheet windows lifecycle"""
        to_remove = []
        for entity_id, window in list(self.character_windows.items()):
            if window:
                # Check if character still exists in CharacterManager
                character_exists = False
                if self.actions_bridge and hasattr(self.actions_bridge, 'get_character'):
                    try:
                        character_data = self.actions_bridge.get_character(entity_id)
                        character_exists = character_data is not None
                    except:
                        character_exists = False
                
                if character_exists:
                    # Window is managed by external_windows rendering system
                    # Just check if it was closed and mark for removal
                    if not window.show_full_window:
                        to_remove.append(entity_id)
                else:
                    # Character no longer exists, remove the window
                    to_remove.append(entity_id)
        
        # Clean up closed windows
        for entity_id in to_remove:
            window = self.character_windows.get(entity_id)
            if window and hasattr(self.context, 'imgui') and self.context.imgui:
                # Remove from external_windows if it's there
                if window in self.context.imgui.external_windows:
                    self.context.imgui.external_windows.remove(window)
                    logger.debug(f"Removed character window from external_windows: {entity_id}")
            del self.character_windows[entity_id]
    
    def _open_handout_window(self, entity_id: str):
        """Open handout window for editing"""
        self.handout_windows[entity_id] = True
        # Initialize text if not exists
        if entity_id not in self.handout_texts:
            entity_data = self.entities.get(entity_id, {})
            self.handout_texts[entity_id] = entity_data.get('content', '')
    
    def _render_handout_windows(self):
        """Render handout editing windows"""
        to_remove = []
        for entity_id in list(self.handout_windows.keys()):
            if self.handout_windows[entity_id]:
                entity_data = self.entities.get(entity_id)
                if entity_data:
                    still_open = self._render_handout_window(entity_id, entity_data)
                    if not still_open:
                        to_remove.append(entity_id)
                else:
                    to_remove.append(entity_id)
        
        # Clean up closed windows
        for entity_id in to_remove:
            del self.handout_windows[entity_id]
    
    def _render_handout_window(self, entity_id: str, entity_data: Dict) -> bool:
        """Render a single handout window"""
        window_title = f"Handout - {entity_data.get('name', 'Unnamed')}"
        
        imgui.set_next_window_size((600, 400), imgui.Cond_.first_use_ever.value)
        imgui.set_next_window_pos((300, 200), imgui.Cond_.first_use_ever.value)
        
        expanded, window_open = imgui.begin(window_title, True)
        
        if expanded:
            # Title editing
            imgui.text("Title:")
            imgui.same_line()
            imgui.set_next_item_width(400)
            changed, new_name = imgui.input_text("##handout_title", entity_data.get('name', ''))
            if changed:
                entity_data['name'] = new_name
                self.entities[entity_id] = entity_data
            
            imgui.separator()
            
            # Content editing
            imgui.text("Content:")
            current_text = self.handout_texts.get(entity_id, '')
            imgui.set_next_item_width(-1)
            changed, new_text = imgui.input_text_multiline("##handout_content", current_text, 
                                                         imgui.ImVec2(-1, 300))
            if changed:
                self.handout_texts[entity_id] = new_text
                entity_data['content'] = new_text
                self.entities[entity_id] = entity_data
            
            imgui.separator()
            
            # Action buttons
            if imgui.button("Save", (100, 30)):
                self._save_handout(entity_id)
                
            imgui.same_line()
            if imgui.button("Close", (100, 30)):
                window_open = False
        
        imgui.end()
        return window_open or False
    
    def _save_handout(self, entity_id: str):
        """Save handout data"""
        if self.actions_bridge:
            entity_data = self.entities.get(entity_id)
            if entity_data:
                self.actions_bridge.add_chat_message(f"Handout '{entity_data.get('name', 'Unnamed')}' saved.")
    
    def _create_character(self, creation_type: CharacterCreationType):
        """Create a new character based on type"""
        if creation_type == CharacterCreationType.CHARACTER_MANAGER:
            # Launch the character creator window via Actions
            if self.actions_bridge and hasattr(self.actions_bridge, 'open_character_creator'):
                self.actions_bridge.open_character_creator()
            else:
                logger.warning("Character creator not available via Actions")
                if self.actions_bridge:
                    self.actions_bridge.add_chat_message("Character creator not available")
        else:
            # For NPC and manual creation, create through CharacterManager via Actions
            if self.actions_bridge and hasattr(self.actions_bridge, 'create_character'):
                character_name = f"New {creation_type.value.title()}"
                character_data = {
                    'name': character_name,
                    'creation_type': creation_type.value,
                    'class_level': 'Level 1',
                    'race': '',
                    'background': '',
                    'alignment': '',
                    'ability_scores': {
                        'STR': 10, 'DEX': 10, 'CON': 10,
                        'INT': 10, 'WIS': 10, 'CHA': 10
                    },
                    'hit_points': {'current': 8, 'maximum': 8, 'temporary': 0},
                    'armor_class': 10,
                    'skills': {},
                    'equipment': '',
                    'features': ''
                }
                
                character_id = self.actions_bridge.create_character(character_data)
                if character_id:
                    self.selected_entity_id = character_id
                    if self.actions_bridge:
                        self.actions_bridge.add_chat_message(f"Created new {creation_type.value}: {character_name}")
                else:
                    logger.error("Failed to create character via Actions")
                    if self.actions_bridge:
                        self.actions_bridge.add_chat_message("Failed to create character")
            else:
                logger.warning("CharacterManager not available via Actions")
                if self.actions_bridge:
                    self.actions_bridge.add_chat_message("CharacterManager not available")
    
    def _add_handout(self):
        """Add a new handout"""
        
        entity_id = str(uuid.uuid4())
        
        handout_data = {
            'id': entity_id,
            'type': EntityType.HANDOUT.value,
            'name': f"New Handout {len(self.entities) + 1}",
            'content': "Enter handout content here..."
        }
        
        self.entities[entity_id] = handout_data
        self.selected_entity_id = entity_id
        
        # Initialize handout text and open window for editing
        self.handout_texts[entity_id] = handout_data['content']
        self._open_handout_window(entity_id)
    
    def _add_monster(self):
        """Add a new monster"""
        
        entity_id = str(uuid.uuid4())
        
        monster_data = {
            'id': entity_id,
            'type': EntityType.MONSTER.value,
            'name': f"New Monster {len(self.entities) + 1}",
            'stats': {}
        }
        
        self.entities[entity_id] = monster_data
        self.selected_entity_id = entity_id
    
    def _add_npc(self):
        """Add a new NPC"""
       
        entity_id = str(uuid.uuid4())
        
        npc_data = {
            'id': entity_id,
            'type': EntityType.NPC.value,
            'name': f"New NPC {len(self.entities) + 1}",
            'description': ""
        }
        
        self.entities[entity_id] = npc_data
        self.selected_entity_id = entity_id
    
    def _delete_entity(self, entity_id: str):
        """Delete an entity"""
        # Check if this is a character (if we're in character filter mode)
        if self.entity_filter == EntityType.CHARACTER:
            self._delete_character(entity_id)
            return
            
        # For other entity types, use the old system
        if entity_id in self.entities:
            entity_name = self.entities[entity_id].get('name', 'Unnamed')
            del self.entities[entity_id]
            
            if self.selected_entity_id == entity_id:
                self.selected_entity_id = None
                
            # Close character window if open
            if entity_id in self.character_windows:
                del self.character_windows[entity_id]
                
            if self.actions_bridge:
                self.actions_bridge.add_chat_message(f"Deleted entity: {entity_name}")
    
    def _delete_character(self, character_id: str):
        """Delete a character through CharacterManager"""
        if self.context and hasattr(self.context, 'CharacterManager') and self.context.CharacterManager:
            # Get character name before deletion for the message
            character_name = "Unknown"
            if character_id in self.context.CharacterManager.characters:
                character_name = self.context.CharacterManager.characters[character_id].name
            
            success = self.context.CharacterManager.delete_character(character_id)
            if success:
                # Close character window if open
                if character_id in self.character_windows:
                    window = self.character_windows[character_id]
                    # Remove from external_windows if it's there
                    if window and hasattr(self.context, 'imgui') and self.context.imgui:
                        if window in self.context.imgui.external_windows:
                            self.context.imgui.external_windows.remove(window)
                            logger.debug(f"Removed deleted character window from external_windows: {character_id}")
                    del self.character_windows[character_id]
                
                # Update selection
                if self.selected_entity_id == character_id:
                    self.selected_entity_id = None
                
                if self.actions_bridge:
                    self.actions_bridge.add_chat_message(f"Deleted character: {character_name}")
                
                logger.info(f"Character deleted: {character_id}")
            else:
                logger.error(f"Failed to delete character: {character_id}")
                if self.actions_bridge:
                    self.actions_bridge.add_chat_message(f"Failed to delete character: {character_name}")
        else:
            logger.warning("CharacterManager not available for character deletion")
    
    def _get_default_character_data(self) -> Dict:
        """Get default character data structure"""
        return {
            'name': '',
            'class_level': '',
            'race': '',
            'background': '',
            'alignment': '',
            'ability_scores': {
                'STR': 10, 'DEX': 10, 'CON': 10,
                'INT': 10, 'WIS': 10, 'CHA': 10
            },
            'hit_points': {'current': 8, 'maximum': 8, 'temporary': 0},
            'armor_class': 10,
            'skills': {},
            'equipment': '',
            'features': ''
        }
    
    def get_selected_entity(self) -> Optional[str]:
        """Get the currently selected entity ID"""
        return self.selected_entity_id
    
    def get_entity_data(self, entity_id: str) -> Optional[Dict]:
        """Get entity data by ID"""
        return self.entities.get(entity_id)
    
    def _level_up_character(self, entity_id: str):
        """Level up an existing character using the character creator via Actions"""
        if self.actions_bridge and hasattr(self.actions_bridge, 'open_character_creator_for_character'):
            self.actions_bridge.open_character_creator_for_character(entity_id)
        else:
            if self.actions_bridge:
                self.actions_bridge.add_chat_message("Character level up not available")
    
    def _edit_character(self, entity_id: str):
        """Edit an existing character via Actions"""
        if self.actions_bridge and hasattr(self.actions_bridge, 'open_character_creator_for_character'):
            # For now, treat edit as level-up - could be extended for different edit modes
            self.actions_bridge.open_character_creator_for_character(entity_id)
        else:
            # Fallback: trigger window opening through selection
            self.selected_entity_id = entity_id
            # Window will be created when character is selected
    
    def _duplicate_character(self, entity_id: str):
        """Duplicate an existing character via Actions"""
        if self.actions_bridge and hasattr(self.actions_bridge, 'duplicate_character'):
            # Get the original character name to create a better duplicate name
            character_name = "Character"
            if self.actions_bridge and hasattr(self.actions_bridge, 'get_character'):
                character_data = self.actions_bridge.get_character(entity_id)
                if character_data and 'name' in character_data:
                    character_name = character_data['name']
            
            # Create new name for the duplicate
            new_name = f"{character_name} (Copy)"
            
            new_character_id = self.actions_bridge.duplicate_character(entity_id, new_name)
            if new_character_id:
                self.selected_entity_id = new_character_id
                if self.actions_bridge:
                    self.actions_bridge.add_chat_message(f"Character '{new_name}' duplicated successfully")
            else:
                if self.actions_bridge:
                    self.actions_bridge.add_chat_message("Failed to duplicate character")
        else:
            logger.warning("Character duplication not available via Actions")
    
    def notify_entity_selected(self, entity_id: str):
        """Notify other panels (e.g. character sheet) about entity selection."""
        if self.actions_bridge and hasattr(self.actions_bridge, 'on_entity_selected'):
            self.actions_bridge.on_entity_selected(entity_id)
    
    def add_character_from_creator(self, character_obj, character_data: Dict):
        """Add a character created from the character creator - now delegates to Actions"""
        if self.actions_bridge and hasattr(self.actions_bridge, 'add_character_from_creator'):
            entity_id = self.actions_bridge.add_character_from_creator(character_obj, character_data)
            if entity_id:
                self.selected_entity_id = entity_id
                if self.actions_bridge:
                    self.actions_bridge.add_chat_message(f"Character '{character_obj.name}' added to journal")
                logger.info(f"Added character '{character_obj.name}' to journal with ID: {entity_id}")
                return entity_id
            else:
                logger.error("Failed to add character via Actions")
                return None
        else:
            logger.warning("Actions bridge not available for adding character from creator")
            return None
