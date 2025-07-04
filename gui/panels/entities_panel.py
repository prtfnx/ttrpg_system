"""
Entities Panel - Right sidebar panel for character and entity management
Updated to use Actions protocol bridge
"""

from imgui_bundle import imgui

import os
from core_table.actions_protocol import Position

from logger import setup_logger
logger = setup_logger(__name__)


class EntitiesPanel:
    """Entities panel for managing characters, NPCs, and objects on the table"""
    
    def __init__(self, context, actions_bridge):
        self.context = context
        self.actions_bridge = actions_bridge        
        self.entity_filter = ""
        self.selected_entity = None
        self.show_players_only = False
        self.show_npcs_only = False
        self.selected_layer = "tokens"
        self._last_sprite_selection = None  # Track last known table selection to prevent sync loops
        
    def render(self):
        """Render the entities panel content"""
        # Sync table selection to panel selection
        self._sync_table_selection_to_panel()        
        imgui.text("Entities & Sprites")
        imgui.separator()
        
        # Current table status
        if not self.actions_bridge.has_current_table():
            imgui.text_colored((0.8, 0.4, 0.4, 1.0), "No table selected")
            return
            
        table_name = self.actions_bridge.get_current_table_name()
        imgui.text(f"Table: {table_name}")
        imgui.separator()
          # Layer selection
        imgui.text("Layer:")
        layers = self.actions_bridge.get_available_layers()
        for layer in layers:
            if imgui.radio_button(layer.title(), self.selected_layer == layer):
                # Clear selected entity when switching layers
                self.selected_entity = None
                
                # Also clear table selection if it's not on the new layer
                if (self.context and self.context.current_table and 
                    self.context.current_table.selected_sprite):
                    current_sprite = self.context.current_table.selected_sprite
                    sprite_layer = getattr(current_sprite, 'layer', None)
                    if sprite_layer != layer:
                        self.context.current_table.selected_sprite = None
                        logger.debug(f"Cleared table selection when switching to layer {layer}")
                
                self.selected_layer = layer
        
        imgui.separator()
          # Filter controls
        imgui.text("Filter:")
        changed, self.entity_filter = imgui.input_text("##filter", self.entity_filter, 64)
        
        imgui.separator()        # Entity list
        imgui.begin_child("entity_list", (0, -150))
        
        entities = self._get_filtered_entities() or {}
        
        if not entities:
            imgui.text_colored((0.7, 0.7, 0.7, 1.0), f"No sprites found on layer '{self.selected_layer}'")
        else:
            for entity_id, entity_data in entities.items():
                self._render_entity_item(entity_id, entity_data)
        
        imgui.end_child()
        
        # Selected entity info
        imgui.separator()
        if self.selected_entity:
            self._render_entity_details()
        else:
            imgui.text("No sprite selected")
          # Entity actions
        imgui.separator()
        self._render_entity_actions()
    
    def _get_filtered_entities(self):
        """Get sprites from current layer with filtering applied"""
        # Get sprites from the selected layer
        sprites = self.actions_bridge.get_layer_sprites(self.selected_layer)
        
        # Apply text filter
        if self.entity_filter:
            filtered = {}
            search_text = self.entity_filter.lower()
            for sprite_id, sprite_data in sprites.items():
                # Search in sprite ID
                if search_text in sprite_id.lower():
                    filtered[sprite_id] = sprite_data
                    continue
                
                # Search in display name
                display_name = self._get_sprite_display_name(sprite_id, sprite_data)
                if search_text in display_name.lower():
                    filtered[sprite_id] = sprite_data
                    continue
                    
            return filtered
        
        return sprites
    
    def _get_sprite_display_name(self, sprite_id: str, sprite_data: dict) -> str:
        """Generate a display name for the sprite"""        # Try to get name from image path
        #TODO: temprorary / Rewrite for final design of sprite
        image_path = sprite_data.get('image_path', '')
        if image_path:
            # Extract filename without extension
            try:
                filename = os.path.basename(image_path)
                # Remove extension and decode if it's bytes
                if isinstance(filename, bytes):
                    filename = filename.decode('utf-8', errors='ignore')
                name_without_ext = os.path.splitext(filename)[0]
                # Clean up the name (replace underscores with spaces, capitalize)
                display_name = name_without_ext.replace('_', ' ').replace('-', ' ').title()
                if display_name and display_name.strip():
                    return display_name
            except Exception:
                pass
        
        # Fallback to sprite_id
        return sprite_id
    
    def _render_entity_item(self, sprite_id: str, sprite_data: dict):
        """Render a single sprite item in the list"""
        # Get position for display
        position = sprite_data.get('position', Position(0, 0))
        
        # Get display name
        display_name = self._get_sprite_display_name(sprite_id, sprite_data)
          # Create display text: "Name (ID)" or just "Name" if name is same as ID
        if display_name != sprite_id:
            display_text = f"{display_name} ({sprite_id})"
        else:
            display_text = sprite_id
              # Selectable item
        is_selected = self.selected_entity == sprite_id
        
        # imgui.selectable returns a tuple (clicked, selected) in Python!
        # This is different from C++ where it returns just a boolean
        imgui_id = f"sprite__{sprite_id}"
        clicked, new_selected = imgui.selectable(f"{display_text}##{imgui_id}", is_selected)        
        if clicked:
            # Only call _handle_entity_selection when the user actually clicked the item
            self.selected_entity = sprite_id
            self._handle_entity_selection(sprite_id, sprite_data)
        
        # Show position and scale info
        if imgui.is_item_hovered():
            scale = sprite_data.get('scale', (1.0, 1.0))
            rotation = sprite_data.get('rotation', 0.0)
            tooltip = f"Position: ({position.x:.1f}, {position.y:.1f})\\n"
            tooltip += f"Scale: ({scale[0]:.2f}, {scale[1]:.2f})\\n"
            tooltip += f"Rotation: {rotation:.1f}°"
            
            imgui.set_tooltip(tooltip)
            
        # Show position inline
        imgui.same_line()
        imgui.text_colored((0.7, 0.7, 0.7, 1.0), f"({position.x:.0f}, {position.y:.0f})")
    
    def _render_entity_details(self):
        """Render details for the selected sprite"""
        if not self.selected_entity:
            return
            
        sprite_info = self.actions_bridge.get_sprite_info(self.selected_entity)
        if not sprite_info:
            imgui.text("Failed to get sprite info")
            # Clear invalid selection
            self.selected_entity = None
            return
            
        # Check if the selected entity is on the current layer
        entity_layer = sprite_info.get('layer')
        if entity_layer != self.selected_layer:
            # Entity is not on current layer, clear selection
            self.selected_entity = None
            return
            
        imgui.text(f"Selected: {self.selected_entity}")
          # Position controls
        pos = sprite_info.get('position', Position(0, 0))
        imgui.text("Position:")
        new_x = imgui.drag_float("X##pos", pos.x, 0.1, -1000, 1000)[1]
        new_y = imgui.drag_float("Y##pos", pos.y, 0.1, -1000, 1000)[1]
        
        if new_x != pos.x or new_y != pos.y:
            if self.actions_bridge.move_sprite(self.selected_entity, new_x, new_y):
                logger.info(f"Moved {self.selected_entity} to ({new_x:.1f}, {new_y:.1f})")
        
        # Scale controls
        scale = sprite_info.get('scale', (1.0, 1.0))
        imgui.text("Scale:")
        new_scale_x = imgui.drag_float("Scale X##scale", scale[0], 0.01, 0.1, 5.0)[1]
        new_scale_y = imgui.drag_float("Scale Y##scale", scale[1], 0.01, 0.1, 5.0)[1]
        
        if new_scale_x != scale[0] or new_scale_y != scale[1]:
            if self.actions_bridge.scale_sprite(self.selected_entity, new_scale_x, new_scale_y):
                logger.info(f"Scaled {self.selected_entity} to ({new_scale_x:.2f}, {new_scale_y:.2f})")
        
        # Rotation control
        rotation = sprite_info.get('rotation', 0.0)
        new_rotation = imgui.drag_float("Rotation##rot", rotation, 1.0, -180, 180)[1]
        
        if new_rotation != rotation:
            if self.actions_bridge.rotate_sprite(self.selected_entity, new_rotation):
                logger.info(f"Rotated {self.selected_entity} to {new_rotation:.1f}°")
        
        # Layer controls
        current_layer = sprite_info.get('layer', 'tokens')
        imgui.text(f"Current Layer: {current_layer}")
        
        layers = self.actions_bridge.get_available_layers()
        for layer in layers:
            if layer != current_layer:
                if imgui.button(f"Move to {layer.title()}"):
                    if self.actions_bridge.move_sprite_to_layer(self.selected_entity, layer):
                        logger.info(f"Moved {self.selected_entity} to layer {layer}")
                        # Refresh selection if we moved to a different layer
                        if layer != self.selected_layer:
                            self.selected_entity = None
    
    def _render_entity_actions(self):
        """Render action buttons for sprite management"""
        # Layer visibility controls
        imgui.text("Layer Visibility:")
        layers = self.actions_bridge.get_available_layers()
        
        #for layer in layers:
        #    visible = self.actions_bridge.get_layer_visibility(layer)
        #    clicked, new_visible = imgui.checkbox(f"{layer.title()}##vis", visible)
        #    if clicked and new_visible != visible:
        #        self.actions_bridge.set_layer_visibility(layer, new_visible)
        #        logger.info(f"Layer {layer} visibility: {new_visible}")
        
        imgui.separator()
        
        # Sprite actions
        if imgui.button("Add Sprite", (-1, 25)):
            self._handle_add_sprite()
          # Actions for selected sprite
        if self.selected_entity:
            if imgui.button("Delete Selected", (-1, 25)):
                self._handle_delete_sprite()
            
            if imgui.button("Duplicate", (-1, 25)):
                self._handle_duplicate_sprite()    
    def _handle_entity_selection(self, sprite_id: str, sprite_data: dict):
        """Handle sprite selection and sync with table's selected sprite"""
        try:
            logger.debug(f"Handling entity selection for sprite_id: {sprite_id}")
            
            # Sync selection to table's select

            if self.context and self.context.current_table:
                # Find the sprite object in the context
                sprite_obj = self.context.find_sprite_by_id(sprite_id)
                if sprite_obj:
                    # Update tracking to prevent sync loops
                    self._last_sprite_selection = sprite_obj
                    self.context.current_table.selected_sprite = sprite_obj
                    logger.debug(f"Synced entities panel selection to table: {sprite_id} -> {sprite_obj}")
                    logger.debug(f"Selected sprite has ID: {getattr(sprite_obj, 'sprite_id', 'NO_ID')}")
                    
                    # Notify character sheet panel about the entity selection
                    if self.actions_bridge and hasattr(self.actions_bridge, 'on_entity_selected'):
                        self.actions_bridge.on_entity_selected(sprite_id)
                        logger.debug(f"Notified character sheet panel about entity selection: {sprite_id}")
                    
                else:
                    logger.warning(f"Could not find sprite object for ID: {sprite_id}")
                    # Let's see what sprites are actually available
                    current_layer_sprites = []
                    if self.selected_layer in self.context.current_table.dict_of_sprites_list:
                        for sprite in self.context.current_table.dict_of_sprites_list[self.selected_layer]:
                            current_layer_sprites.append(f"ID:{getattr(sprite, 'sprite_id', 'NO_ID')}")
                    logger.debug(f"Available sprites in layer {self.selected_layer}: {current_layer_sprites}")
            else:
                logger.warning("No current table to sync selection with")
        except Exception as e:
            logger.error(f"Error syncing entity selection to table: {e}")

    def _sync_table_selection_to_panel(self):
        """Sync table's selected sprite to entities panel selection"""
        try:
            if not self.context or not self.context.current_table:
                return
            
            sprite_selected= self.context.current_table.selected_sprite
              # Skip sync if this is the same selection we just set
            if sprite_selected== self._last_sprite_selection:
                return
            
            # Update our tracking
            self._last_sprite_selection = sprite_selected

            # If table has no selection, clear panel selection
            if not sprite_selected:
                if self.selected_entity:
                    self.selected_entity = None
                    logger.debug("Cleared entities panel selection (table has no selection)")
                return
            
            # Get the sprite ID from the table's selected sprite
            sprite_id = getattr(sprite_selected, 'sprite_id', None)
            if not sprite_id:
                return
            
            # Check if the table's selection is different from panel selection
            if self.selected_entity != sprite_id:
                # Verify the sprite is on the current layer
                sprite_info = self.actions_bridge.get_sprite_info(sprite_id)
                if sprite_info and sprite_info.get('layer') == self.selected_layer:
                    self.selected_entity = sprite_id
                    logger.debug(f"Synced table selection to entities panel: {sprite_id}")
                elif sprite_info:
                    # Sprite is on a different layer, switch to that layer
                    sprite_layer = sprite_info.get('layer')
                    if sprite_layer in self.actions_bridge.get_available_layers():
                        self.selected_layer = sprite_layer
                        self.selected_entity = sprite_id
                        logger.debug(f"Switched to layer {sprite_layer} and synced selection: {sprite_id}")
                    
        except Exception as e:
            logger.error(f"Error syncing table selection to panel: {e}")
    
    def _handle_add_sprite(self):
        """Handle adding a new sprite"""
        # This would typically open a file dialog
        # For now, we'll add a placeholder sprite
        sprite_id = f"sprite_{len(self._get_filtered_entities()) + 1}"
        
        # Default position
        x, y = 0.0, 0.0
        
        # pass TODO: implemet file dialog to select image
        
        logger.info("Add sprite requested - file dialog would open here")
        self.actions_bridge.add_chat_message("Add sprite: Please implement file dialog")
    
    def _handle_delete_sprite(self):
        """Handle deleting the selected sprite"""
        if not self.selected_entity:
            return
            
        if self.actions_bridge.delete_sprite(self.selected_entity):
            logger.info(f"Deleted sprite: {self.selected_entity}")
            self.selected_entity = None
    
    def _handle_duplicate_sprite(self):
        """Handle duplicating the selected sprite"""
        if not self.selected_entity:
            return
            
        # Get current sprite info
        sprite_info = self.actions_bridge.get_sprite_info(self.selected_entity)
        if not sprite_info:
            return
            
        # Create new sprite ID
        new_id = f"{self.selected_entity}_copy"
          # Get position and offset it slightly
        pos = sprite_info.get('position', Position(0, 0))
        new_x = pos.x + 50  # Offset by 50 units
        new_y = pos.y + 50
        
        # Get image path
        image_path = sprite_info.get('image_path', '')
        layer = sprite_info.get('layer', 'tokens')
        
        if image_path and self.actions_bridge.create_sprite(new_id, image_path, new_x, new_y, layer):
            # Apply same scale and rotation
            scale = sprite_info.get('scale', (1.0, 1.0))
            rotation = sprite_info.get('rotation', 0.0)
            
            self.actions_bridge.scale_sprite(new_id, scale[0], scale[1])
            self.actions_bridge.rotate_sprite(new_id, rotation)
            
            self.selected_entity = new_id
            logger.info(f"Duplicated sprite: {new_id}")
        else:
            logger.error("Failed to duplicate sprite")
