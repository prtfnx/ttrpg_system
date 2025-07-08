#!/usr/bin/env python3
"""
Journal Panel - Manages characters, monsters, handouts, and NPCs
"""

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
                if entity_data.get('type') == EntityType.CHARACTER.value:
                    # Create and store a persistent window instance
                    if entity_id not in self.character_windows:
                        from ..windows.character_sheet_window import CharacterSheetWindow
                        window = CharacterSheetWindow(self.context, self.actions_bridge)
                        
                        # Load the character data into the window
                        character_obj = entity_data.get('character_object')
                        
                        if character_obj:
                            # If we have a Character object, set it and load from it
                            window.character = character_obj
                            window.load_from_character()
                        else:
                            # For legacy data or manual characters, set basic info
                            character_data = entity_data.get('character_data', {})
                            window.character_name = character_data.get('name', 'Unnamed Character')
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
                        
                        self.character_windows[entity_id] = window
                    
                    # Show the window
                    self.character_windows[entity_id].show_full_window = True
                    # Only open character window, not character sheet panel
                elif entity_data.get('type') == EntityType.HANDOUT.value:
                    self._open_handout_window(entity_id)
            
            # Right-click context menu for characters
            if (entity_data.get('type') == EntityType.CHARACTER.value and 
                imgui.begin_popup_context_item(f"character_context_{entity_id}")):
                
                if imgui.menu_item("Level Up", "", False)[0]:
                    self._level_up_character(entity_id)
                
                if imgui.menu_item("Edit Character", "", False)[0]:
                    self._edit_character(entity_id)
                
                if imgui.menu_item("Duplicate", "", False)[0]:
                    self._duplicate_character(entity_id)
                
                imgui.separator()
                
                if imgui.menu_item("Delete", "", False)[0]:
                    self._delete_entity(entity_id)
                
                imgui.end_popup()
    
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
        """Render character sheet windows"""
        to_remove = []
        for entity_id, window in list(self.character_windows.items()):
            if window and window.show_full_window:
                entity_data = self.entities.get(entity_id)
                if entity_data:
                    # Render the window and check if it's still open
                    is_still_open = window.render_full_window()
                    
                    # Update window state - if window was closed, mark for removal
                    if not window.show_full_window:
                        to_remove.append(entity_id)
                else:
                    to_remove.append(entity_id)
        
        # Clean up closed windows
        for entity_id in to_remove:
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
            # Launch the character creator window
            if self.context and hasattr(self.context, 'character_creator'):
                self.context.character_creator.open_creator()
            else:
                # Fallback: create a basic character
                import uuid
                entity_id = str(uuid.uuid4())
                
                character_data = {
                    'id': entity_id,
                    'type': EntityType.CHARACTER.value,
                    'name': f"New Character {len(self.entities) + 1}",
                    'creation_type': creation_type.value,
                    'character_data': self._get_default_character_data()
                }
                
                self.entities[entity_id] = character_data
                self.selected_entity_id = entity_id
                
                if self.actions_bridge:
                    self.actions_bridge.add_chat_message(f"Created new character: {character_data['name']}")
        else:
            # For NPC and manual creation, use the existing method
            import uuid
            entity_id = str(uuid.uuid4())
            
            character_data = {
                'id': entity_id,
                'type': EntityType.CHARACTER.value,
                'name': f"New Character {len(self.entities) + 1}",
                'creation_type': creation_type.value,
                'character_data': self._get_default_character_data()
            }
            
            self.entities[entity_id] = character_data
            self.selected_entity_id = entity_id
            
            if self.actions_bridge:
                self.actions_bridge.add_chat_message(f"Created new character: {character_data['name']}")
    
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
        """Level up an existing character using the character creator"""
        entity_data = self.entities.get(entity_id)
        if entity_data and entity_data.get('type') == EntityType.CHARACTER.value:
            # Get the character object if available
            character_obj = entity_data.get('character_object')
            if character_obj and self.context and hasattr(self.context, 'character_creator'):
                self.context.character_creator.open_creator(character_obj)
            else:
                if self.actions_bridge:
                    self.actions_bridge.add_chat_message("Character object not available for level up")
    
    def _edit_character(self, entity_id: str):
        """Edit an existing character"""
        entity_data = self.entities.get(entity_id)
        if entity_data and entity_data.get('type') == EntityType.CHARACTER.value:
            # Open the character creator in edit mode
            character_obj = entity_data.get('character_object')
            if character_obj and self.context and hasattr(self.context, 'character_creator'):
                # For now, treat edit as level-up - could be extended for different edit modes
                self.context.character_creator.open_creator(character_obj)
            else:
                # Fallback: trigger window opening through selection
                self.selected_entity_id = entity_id
                # Window will be created when character is selected
    
    def _duplicate_character(self, entity_id: str):
        """Duplicate an existing character"""
        entity_data = self.entities.get(entity_id)
        if entity_data and entity_data.get('type') == EntityType.CHARACTER.value:
            
            new_entity_id = str(uuid.uuid4())
            
            # Create a copy of the character data
            import copy
            new_character_data = copy.deepcopy(entity_data)
            new_character_data['id'] = new_entity_id
            new_character_data['name'] = f"{entity_data['name']} (Copy)"
            
            self.entities[new_entity_id] = new_character_data
            self.selected_entity_id = new_entity_id
            
            if self.actions_bridge:
                self.actions_bridge.add_chat_message(f"Duplicated character: {new_character_data['name']}")
    
    def notify_entity_selected(self, entity_id: str):
        """Notify other panels (e.g. character sheet) about entity selection."""
        if self.actions_bridge and hasattr(self.actions_bridge, 'on_entity_selected'):
            self.actions_bridge.on_entity_selected(entity_id)
    
    def add_character_from_creator(self, character_obj, character_data: Dict):
        """Add a character created from the character creator"""
        entity_id = str(uuid.uuid4())
        
        entity_data = {
            'id': entity_id,
            'type': EntityType.CHARACTER.value,
            'name': character_obj.name or 'Unnamed Character',
            'creation_type': CharacterCreationType.CHARACTER_MANAGER.value,
            'character_object': character_obj,  # Store the Character object
            'character_data': character_data  # Store legacy format for compatibility
        }
        
        self.entities[entity_id] = entity_data
        self.selected_entity_id = entity_id
        
        if self.actions_bridge:
            self.actions_bridge.add_chat_message(f"Character '{character_obj.name}' added to journal")
        
        logger.info(f"Added character '{character_obj.name}' to journal with ID: {entity_id}")
        return entity_id
