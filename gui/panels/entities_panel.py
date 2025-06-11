"""
Entities Panel - Right sidebar panel for character and entity management
Updated to use Actions protocol bridge
"""

from imgui_bundle import imgui
import logging
from core_table.actions_protocol import Position

logger = logging.getLogger(__name__)


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
        
    def render(self):
        """Render the entities panel content"""
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
                self.selected_layer = layer
        
        imgui.separator()
        
        # Filter controls
        imgui.text("Filter:")
        changed, self.entity_filter = imgui.input_text("##filter", self.entity_filter, 64)
        
        imgui.separator()
        
        # Entity list
        if imgui.begin_child("entity_list", (0, -150)):
            entities = self._get_filtered_entities()
            
            if not entities:
                imgui.text_colored((0.7, 0.7, 0.7, 1.0), "No sprites found")
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
                if search_text in sprite_id.lower():
                    filtered[sprite_id] = sprite_data
            return filtered
        
        return sprites
    def _render_entity_item(self, sprite_id: str, sprite_data: dict):
        """Render a single sprite item in the list"""
        # Get position for display
        position = sprite_data.get('position', Position(0, 0))
        
        # Selectable item
        is_selected = self.selected_entity == sprite_id
        
        if imgui.selectable(f"{sprite_id}##{sprite_id}", is_selected):
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
        
        for layer in layers:
            visible = self.actions_bridge.get_layer_visibility(layer)
            clicked, new_visible = imgui.checkbox(f"{layer.title()}##vis", visible)
            if clicked and new_visible != visible:
                self.actions_bridge.set_layer_visibility(layer, new_visible)
                logger.info(f"Layer {layer} visibility: {new_visible}")
        
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
        """Handle sprite selection"""
        pass
        #logger.info(f"Sprite selected: {sprite_id}")
    
    def _handle_add_sprite(self):
        """Handle adding a new sprite"""
        # This would typically open a file dialog
        # For now, we'll add a placeholder sprite
        sprite_id = f"sprite_{len(self._get_filtered_entities()) + 1}"
        
        # Default position
        x, y = 0.0, 0.0
        
        # Try to add sprite (this will fail without a valid image path)
        # In a real implementation, you'd open a file dialog here
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
