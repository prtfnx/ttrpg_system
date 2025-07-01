"""
Layer Panel - Bottom left panel for layer management
"""

from imgui_bundle import imgui

from logger import setup_logger
logger = setup_logger(__name__)


class LayerPanel:
    """Layer panel for managing table layers"""
    
    def __init__(self, context, actions_bridge):
        self.context = context
        self.actions_bridge = actions_bridge
        # Get initial selected layer from context
        self.selected_layer = self.actions_bridge.get_selected_layer()

    def render(self):
        """Render the layer panel content"""
        imgui.text("Active Layers")
        imgui.separator()
        
        # Current table status
        if not self.actions_bridge.has_current_table():
            imgui.text_colored((0.8, 0.4, 0.4, 1.0), "No table selected")
            return
            
        table_name = self.actions_bridge.get_current_table_name()
        imgui.text(f"Table: {table_name}")
        imgui.separator()
        
        # Layer selection and visibility
        layers = self.actions_bridge.get_available_layers()
        visible_layers = self.actions_bridge.get_visible_layers_for_mode()
        
        for layer in layers:
            # Skip layers not accessible in current mode
            if layer not in visible_layers:
                continue
                
            # Layer visibility checkbox
            visible = self.actions_bridge.get_layer_visibility(layer)
            clicked, new_visible = imgui.checkbox(f"##vis_{layer}", visible)
            if clicked and new_visible != visible:
                self.actions_bridge.set_layer_visibility(layer, new_visible)
                logger.info(f"Layer {layer} visibility: {new_visible}")
            
            # Layer selection radio button
            imgui.same_line()
            if imgui.radio_button(f"{layer.title()}##sel_{layer}", self.selected_layer == layer):
                self.selected_layer = layer
                # Update selected layer in context through actions bridge
                self.actions_bridge.set_selected_layer(layer)
                logger.info(f"Selected layer: {layer}")
        
        # Show mode restrictions if in player mode
        if not self.actions_bridge.is_gm_mode():
            imgui.separator()
            imgui.text_colored((0.8, 0.8, 0.4, 1.0), "Player Mode:")
            imgui.text_colored((0.7, 0.7, 0.7, 1.0), "Limited layer access")
        
        imgui.separator()
        
        # Layer info
        imgui.text(f"Active: {self.selected_layer.title()}")
        
        # Layer-specific actions
        if self.selected_layer:
            layer_sprites = self.actions_bridge.get_layer_sprites(self.selected_layer)
            sprite_count = len(layer_sprites)
            imgui.text(f"Sprites: {sprite_count}")
            
            # Layer actions
            if imgui.button("Clear Layer", (-1, 25)):
                self._handle_clear_layer()
            
            if imgui.button("Hide Others", (-1, 25)):
                self._handle_hide_other_layers()

    def _handle_clear_layer(self):
        """Clear all sprites from the selected layer"""
        if not self.selected_layer:
            return
        
        logger.info(f"Clearing layer: {self.selected_layer}")
        
        # Get sprites and remove them
        layer_sprites = self.actions_bridge.get_layer_sprites(self.selected_layer)
        for sprite_id in layer_sprites.keys():
            success = self.actions_bridge.delete_sprite(sprite_id)
            if not success:
                logger.warning(f"Failed to delete sprite: {sprite_id}")
        
        if hasattr(self.context, 'add_chat_message'):
            self.context.add_chat_message(f"Cleared layer: {self.selected_layer}")

    def _handle_hide_other_layers(self):
        """Hide all layers except the selected one"""
        if not self.selected_layer:
            return
        
        logger.info(f"Hiding other layers, showing only: {self.selected_layer}")
        
        layers = self.actions_bridge.get_available_layers()
        for layer in layers:
            if layer != self.selected_layer:
                self.actions_bridge.set_layer_visibility(layer, False)
            else:
                self.actions_bridge.set_layer_visibility(layer, True)
        
        if hasattr(self.context, 'add_chat_message'):
            self.context.add_chat_message(f"Showing only layer: {self.selected_layer}")

    def get_selected_layer(self):
        """Get the currently selected layer"""
        return self.selected_layer
    
    def set_selected_layer(self, layer):
        """Set the selected layer"""
        if layer in self.actions_bridge.get_available_layers():
            self.selected_layer = layer
            # Update selected layer in context through actions bridge
            self.actions_bridge.set_selected_layer(layer)
            logger.info(f"Layer changed to: {layer}")