"""
GUI Actions Bridge - Connects GUI panels to the Actions protocol system
Provides a clean interface for GUI panels to interact with game logic
"""

from typing import Dict, Any, Optional, List

import uuid
import sys
import os
from gui.tools.measurement_tool import MeasurementTool
from core_table.actions_protocol import ActionResult, Position

from logger import setup_logger
logger = setup_logger(__name__)

class GuiActionsBridge:
    """
    Bridge between GUI panels and the Actions protocol system.
    Provides simplified methods for common GUI operations.
    """
    
    def __init__(self, context):
        self.context = context
        self.actions = context.Actions
        
    # Table Management
    def get_current_table_info(self) -> Dict[str, Any]:
        """Get current table information for GUI display"""
        if not self.context.current_table:
            return {}
            
        table_id = self.context.current_table.table_id  # Use table_id instead of name
        result = self.actions.get_table_info(table_id)
        
        if result.success:
            return result.data
        else:
            logger.error(f"Failed to get table info: {result.message}")
            return {}
    
    def get_all_tables(self) -> Dict[str, Dict[str, Any]]:
        """Get all available tables for GUI display"""
        result = self.actions.get_all_tables()
        
        if result.success:
            return result.data.get('tables', {})
        else:
            logger.error(f"Failed to get tables: {result.message}")
            return {}
    
    def create_table(self, name: str, width: int, height: int) -> bool:
        """Create a new table"""
        table_id = str(uuid.uuid4())  # Generate unique table ID
        result = self.actions.create_table(table_id, name, width, height)
        
        if result.success:
            logger.info(f"Table created: {result.message}")
            return True
        else:
            logger.error(f"Failed to create table: {result.message}")
            return False
    
    def delete_table(self, table_name: str, to_server: bool = True) -> bool:
        """Delete a table with network awareness"""
        # Find table by name to get its ID
        table = self.context._get_table_by_name(table_name)
        if not table:
            logger.error(f"Table '{table_name}' not found")
            return False
        
        # Check network permissions
        if hasattr(self.context, 'validate_network_permission'):
            if not self.context.validate_network_permission('delete_table'):
                logger.warning(f"Cannot delete table '{table_name}' - insufficient network permissions")
                return False
            
        result = self.actions.delete_table(table.table_id, to_server=to_server)
        
        if result.success:
            # Broadcast table deletion to network
            if to_server and hasattr(self.context, 'broadcast_table_change'):
                self.context.broadcast_table_change(
                    table.table_id,
                    'table_deleted',
                    {'name': table_name}
                )
            
            logger.info(f"Table deleted: {result.message}")
            return True
        else:
            logger.error(f"Failed to delete table: {result.message}")
            return False
    
    # Sprite Management
    def get_table_sprites(self, layer: Optional[str] = None) -> Dict[str, Dict[str, Any]]:
        """Get sprites on current table, optionally filtered by layer"""
        if not self.context.current_table:
            return {}
            
        table_id = self.context.current_table.table_id  # Use table_id instead of name
        result = self.actions.get_table_sprites(table_id, layer)
        
        if result.success:
            return result.data.get('sprites', {})
        else:
            logger.error(f"Failed to get sprites: {result.message}")
            return {}
    
    def get_layer_sprites(self, layer: str) -> Dict[str, Dict[str, Any]]:
        """Get sprites on a specific layer"""
        if not self.context.current_table:
            return {}
            
        table_id = self.context.current_table.table_id  # Use table_id instead of name
        result = self.actions.get_layer_sprites(table_id, layer)
        
        if result.success:
            return result.data.get('sprites', {})
        else:
            logger.error(f"Failed to get layer sprites: {result.message}")
            return {}
    
    def create_sprite(self, sprite_id: str, image_path: str, x: float, y: float, layer: str = "tokens") -> bool:
        """Create a new sprite"""
        if not self.context.current_table:
            logger.error("No current table for sprite creation")
            return False
            
        table_id = self.context.current_table.table_id  # Use table_id instead of name
        position = Position(x, y)
        result = self.actions.create_sprite(table_id, sprite_id, position, image_path, layer)
        
        if result.success:
            logger.info(f"Sprite created: {result.message}")
            return True
        else:
            logger.error(f"Failed to create sprite: {result.message}")
            return False
    
    def delete_sprite(self, sprite_id: str) -> bool:
        """Delete a sprite"""
        if not self.context.current_table:
            logger.error("No current table for sprite deletion")
            return False
            
        table_id = self.context.current_table.table_id  # Use table_id instead of name
        result = self.actions.delete_sprite(table_id, sprite_id)
        
        if result.success:
            logger.info(f"Sprite deleted: {result.message}")
            return True
        else:
            logger.error(f"Failed to delete sprite: {result.message}")
            return False
    
    def move_sprite(self, sprite_id: str, x: float, y: float) -> bool:
        """Move a sprite to new position"""
        if not self.context.current_table:
            logger.error("No current table for sprite movement")
            return False
            
        table_id = self.context.current_table.table_id  # Use table_id instead of name
        position = Position(x, y)
        result = self.actions.move_sprite(table_id, sprite_id, position)
        
        if result.success:
            logger.info(f"Sprite moved: {result.message}")
            return True
        else:
            logger.error(f"Failed to move sprite: {result.message}")
            return False
    
    def scale_sprite(self, sprite_id: str, scale_x: float, scale_y: float) -> bool:
        """Scale a sprite"""
        if not self.context.current_table:
            logger.error("No current table for sprite scaling")
            return False
            
        table_id = self.context.current_table.table_id  # Use table_id instead of name
        result = self.actions.scale_sprite(table_id, sprite_id, scale_x, scale_y)
        
        if result.success:
            logger.info(f"Sprite scaled: {result.message}")
            return True
        else:
            logger.error(f"Failed to scale sprite: {result.message}")
            return False
    
    def rotate_sprite(self, sprite_id: str, angle: float) -> bool:
        """Rotate a sprite"""
        if not self.context.current_table:
            logger.error("No current table for sprite rotation")
            return False
            
        table_id = self.context.current_table.table_id  # Use table_id instead of name
        result = self.actions.rotate_sprite(table_id, sprite_id, angle)
        
        if result.success:
            logger.info(f"Sprite rotated: {result.message}")
            return True
        else:
            logger.error(f"Failed to rotate sprite: {result.message}")
            return False
    
    def move_sprite_to_layer(self, sprite_id: str, layer: str) -> bool:
        """Move sprite to different layer"""
        if not self.context.current_table:
            logger.error("No current table for sprite layer change")
            return False
            
        table_id = self.context.current_table.table_id  # Use table_id instead of name
        result = self.actions.move_sprite_to_layer(table_id, sprite_id, layer)
        
        if result.success:
            logger.info(f"Sprite moved to layer: {result.message}")
            return True
        else:
            logger.error(f"Failed to move sprite to layer: {result.message}")
            return False
    
    # Layer Management
    def set_layer_visibility(self, layer: str, visible: bool) -> bool:
        """Set layer visibility"""
        if not self.context.current_table:
            logger.error("No current table for layer visibility")
            return False
            
        table_id = self.context.current_table.table_id
        result = self.actions.set_layer_visibility(table_id, layer, visible)
        
        if result.success:
            # Also update RenderManager for immediate effect
            if hasattr(self.context, 'RenderManager'):
                self.context.RenderManager.set_layer_visibility(layer, visible)
            logger.info(f"Layer visibility set: {result.message}")
            return True
        else:
            logger.error(f"Failed to set layer visibility: {result.message}")
            return False
    
    def get_layer_visibility(self, layer: str) -> bool:
        """Get layer visibility status"""
        if not self.context.current_table:
            logger.error("No current table for layer visibility check")
            return True
            
        table_id = self.context.current_table.table_id
        result = self.actions.get_layer_visibility(table_id, layer)
        
        if result.success:
            return result.data.get('visible', True)
        else:
            logger.error(f"Failed to get layer visibility: {result.message}")
            return True
    
    def set_layer_opacity(self, layer: str, opacity: float) -> bool:
        """Set layer opacity (0.0 to 1.0)"""
        if not self.context.current_table:
            logger.error("No current table for layer opacity")
            return False
            
        try:
            # Update RenderManager for immediate visual effect
            if hasattr(self.context, 'RenderManager'):
                render_manager = self.context.RenderManager
                settings = render_manager.get_layer_settings(layer)
                settings.opacity = max(0.0, min(1.0, opacity))  # Clamp to 0-1 range
                render_manager.set_layer_settings(layer, settings)
                
            # Try to update via Actions protocol for persistence/network sync
            table_id = self.context.current_table.table_id
            if hasattr(self.actions, 'set_layer_opacity'):
                result = self.actions.set_layer_opacity(table_id, layer, opacity)
                if not result.success:
                    logger.warning(f"Actions protocol layer opacity update failed: {result.message}")
            
            logger.info(f"Layer {layer} opacity set to {opacity}")
            return True
        except Exception as e:
            logger.error(f"Failed to set layer opacity: {e}")
            return False
    
    def get_layer_opacity(self, layer: str) -> float:
        """Get layer opacity"""
        try:
            if hasattr(self.context, 'RenderManager'):
                render_manager = self.context.RenderManager
                settings = render_manager.get_layer_settings(layer)
                return settings.opacity
            else:
                logger.error("RenderManager not available for layer opacity")
                return 1.0
        except Exception as e:
            logger.error(f"Failed to get layer opacity: {e}")
            return 1.0
    
    def set_layer_z_order(self, layer: str, z_order: int) -> bool:
        """Set layer z-order (rendering order)"""
        if not self.context.current_table:
            logger.error("No current table for layer z-order")
            return False
            
        try:
            # Update RenderManager for immediate visual effect
            if hasattr(self.context, 'RenderManager'):
                render_manager = self.context.RenderManager
                settings = render_manager.get_layer_settings(layer)
                settings.z_order = z_order
                render_manager.set_layer_settings(layer, settings)
                
            # Try to update via Actions protocol for persistence/network sync
            table_id = self.context.current_table.table_id
            if hasattr(self.actions, 'set_layer_z_order'):
                result = self.actions.set_layer_z_order(table_id, layer, z_order)
                if not result.success:
                    logger.warning(f"Actions protocol layer z-order update failed: {result.message}")
            
            logger.info(f"Layer {layer} z-order set to {z_order}")
            return True
        except Exception as e:
            logger.error(f"Failed to set layer z-order: {e}")
            return False
    
    def get_layer_z_order(self, layer: str) -> int:
        """Get layer z-order"""
        try:
            if hasattr(self.context, 'RenderManager'):
                render_manager = self.context.RenderManager
                settings = render_manager.get_layer_settings(layer)
                return settings.z_order
            else:
                logger.error("RenderManager not available for layer z-order")
                return 0
        except Exception as e:
            logger.error(f"Failed to get layer z-order: {e}")
            return 0

    # Selected Layer Management
    def get_selected_layer(self) -> str:
        """Get the currently selected layer"""
        return self.context.selected_layer
    
    def set_selected_layer(self, layer: str) -> bool:
        """Set the currently selected layer"""
        try:
            # Validate layer exists
            if layer not in self.get_available_layers():
                logger.error(f"Invalid layer: {layer}")
                return False
                
            self.context.selected_layer = layer
            logger.info(f"Selected layer changed to: {layer}")
            return True
        except Exception as e:
            logger.error(f"Failed to set selected layer: {e}")
            return False

    # Sprite and Layer Management
    def get_sprite_at_position(self, x: float, y: float, layer: Optional[str] = None) -> Optional[str]:
        """Get sprite ID at position"""
        if not self.context.current_table:
            return None
            
        table_id = self.context.current_table.table_id  # Use table_id instead of name
        position = Position(x, y)
        result = self.actions.get_sprite_at_position(table_id, position, layer)
        
        if result.success:
            return result.data.get('sprite_id')
        else:
            return None
    
    def get_sprite_info(self, sprite_id: str) -> Dict[str, Any]:
        """Get sprite information"""
        if not self.context.current_table:
            return {}
            
        table_id = self.context.current_table.table_id  # Use table_id instead of name
        result = self.actions.get_sprite_info(table_id, sprite_id)
        
        if result.success:
            return result.data
        else:
            logger.error(f"Failed to get sprite info: {result.message}")
            return {}
    
    # Additional utility methods for GUI integration
    def has_current_table(self) -> bool:
        """Check if there's a current table"""
        return self.context.current_table is not None
    
    def get_available_layers(self) -> List[str]:
        """Get list of available layers"""
        try:
            if self.context.current_table and hasattr(self.context.current_table, 'dict_of_sprites_list'):
                # Get actual layers from current table
                return list(self.context.current_table.dict_of_sprites_list.keys())
            else:
                # Get from Actions protocol
                from core_table.actions_protocol import LAYERS
                return list(LAYERS.keys())
        except ImportError as e:
            logger.error(f"Failed to import LAYERS from actions_protocol: {e}")
            raise RuntimeError("Cannot determine available layers - actions_protocol not available")
    
    def get_chat_messages(self) -> List[str]:
        """Get chat messages from the system"""
        try:
            result = self.actions.get_chat_messages()
            if result.success:
                return result.data.get('messages', [])
            else:
                logger.error(f"Failed to get chat messages: {result.message}")
                return []
        except Exception as e:
            logger.error(f"Failed to get chat messages: {e}")
            return []
    
    def get_current_table_name(self) -> str:
        """Get current table name"""
        if self.context.current_table:
            return self.context.current_table.name
        return "No table"
    
    def set_current_tool(self, tool: str) -> bool:
        """Set current tool"""
        try:
            self.context.set_current_tool(tool)
            return True
        except Exception as e:
            logger.error(f"Failed to set current tool: {e}")
            return False
    
    def get_current_tool(self) -> str:
        """Get current tool"""
        return getattr(self.context, 'current_tool', 'Move')
    
    # Utility Methods
    def start_measurement_tool(self) -> bool:
        """Start the measurement/liner tool"""
        try:
            # Check if measurement_tool exists and is not None
            if hasattr(self.context, 'measurement_tool') and self.context.measurement_tool is not None:
                self.context.measurement_tool.start()
                self.context.current_tool = 'Measure'
                logger.info("Measurement tool started")
                return True
            else:
                # Initialize measurement tool if it doesn't exist or is None

                sys.path.append(os.path.join(os.path.dirname(__file__), '..'))
                
                self.context.measurement_tool = MeasurementTool(self.context)
                self.context.measurement_tool.start()
                self.context.current_tool = 'Measure'
                logger.info("Measurement tool initialized and started")
                return True
        except Exception as e:
            logger.error(f"Failed to start measurement tool: {e}")
            return False
    
    def start_fog_of_war_tool(self) -> bool:
        """Start the fog of war tool"""
        try:
            # Check if fog_of_war_tool exists and is not None
            if hasattr(self.context, 'fog_of_war_tool') and self.context.fog_of_war_tool is not None:
                self.context.fog_of_war_tool.start()
                self.context.current_tool = 'Fog of War'
                logger.info("Fog of war tool started")
                return True
            else:
                # Initialize fog of war tool if it doesn't exist or is None
                import sys
                import os
                sys.path.append(os.path.join(os.path.dirname(__file__), '..'))
                
                from gui.tools.fog_of_war_tool import FogOfWarTool
                self.context.fog_of_war_tool = FogOfWarTool(self.context)
                self.context.fog_of_war_tool.start()
                self.context.current_tool = 'Fog of War'
                logger.info("Fog of war tool initialized and started")
                return True
        except Exception as e:
            logger.error(f"Failed to start fog of war tool: {e}")
            return False

    def get_measurement_distance(self) -> Optional[float]:
        """Get current measurement distance"""
        try:
            if hasattr(self.context, 'measurement_tool') and self.context.measurement_tool is not None:
                return self.context.measurement_tool.get_distance()
            return None
        except Exception as e:
            logger.error(f"Failed to get measurement distance: {e}")
            return None
    
    def clear_measurement(self) -> bool:
        """Clear current measurement"""
        try:
            if hasattr(self.context, 'measurement_tool') and self.context.measurement_tool is not None:
                self.context.measurement_tool.clear()
                logger.info("Measurement cleared")
                return True
            return False
        except Exception as e:
            logger.error(f"Failed to clear measurement: {e}")
            return False
    
    def enable_paint_mode(self, enabled: bool = True) -> bool:
        """Enable or disable paint mode"""
        try:
            import PaintManager
            current_state = PaintManager.is_paint_mode_active()
            
            if enabled and not current_state:
                # Enable paint mode
                PaintManager.toggle_paint_mode()
                self.context.current_tool = 'Draw'
                logger.info("Paint mode enabled")
            elif not enabled and current_state:
                # Disable paint mode
                PaintManager.toggle_paint_mode()
                self.context.current_tool = 'Move'
                logger.info("Paint mode disabled")
            
            return True
        except Exception as e:
            logger.error(f"Failed to set paint mode: {e}")
            return False
    
    def is_paint_mode_active(self) -> bool:
        """Check if paint mode is active"""
        try:
            import PaintManager
            return PaintManager.is_paint_mode_active()
        except Exception as e:
            logger.error(f"Failed to check paint mode: {e}")
            return False
    
    def set_user_mode(self, is_gm: bool) -> bool:
        """Set user mode (GM or Player)"""
        try:
            self.context.is_gm = is_gm
            
            if is_gm:
                # GM mode - show all layers and panels
                logger.info("Switched to GM mode - full access enabled")
                if hasattr(self.context, 'RenderManager') and self.context.RenderManager:
                    render_manager = self.context.RenderManager
                    # Show all layers in GM mode
                    for layer_name in self.get_available_layers():
                        render_manager.set_layer_visibility(layer_name, True)
            else:
                # Player mode - restrict to specific layers but keep fog_of_war visible
                if hasattr(self.context, 'RenderManager') and self.context.RenderManager:
                    render_manager = self.context.RenderManager
                    # Hide most layers except tokens, light, and fog_of_war
                    for layer_name in self.get_available_layers():
                        if layer_name in ['tokens', 'light', 'fog_of_war']:
                            render_manager.set_layer_visibility(layer_name, True)
                        else:
                            render_manager.set_layer_visibility(layer_name, False)
                
                logger.info("Switched to Player mode - restricted access with fog visible")
            
            # Force fog texture regeneration for role change
            if hasattr(self.context, 'RenderManager') and self.context.RenderManager:
                self.context.RenderManager.reset_fog_texture()
            
            return True
        except Exception as e:
            logger.error(f"Failed to set user mode: {e}")
            return False
    
    def is_gm_mode(self) -> bool:
        """Check if current user is in GM mode"""
        if not hasattr(self.context, 'is_gm'):
            logger.error("User mode not initialized in context")
            raise RuntimeError("User mode not properly initialized")
        return self.context.is_gm
    
    def get_visible_layers_for_mode(self) -> List[str]:
        """Get layers that should be visible based on current mode"""
        if self.is_gm_mode():
            return self.get_available_layers()  # GM sees all layers including fog_of_war
        else:
            return ['tokens', 'light']  # Player only sees tokens and light, not fog_of_war
    
    def get_accessible_tables_for_mode(self) -> List[str]:
        """Get tables that are accessible based on current mode"""
        try:
            all_tables = list(self.get_all_tables().keys())
            
            if self.is_gm_mode():
                return all_tables  # GM has access to all tables
            else:
                # Player only has access to current table
                current_table_name = self.get_current_table_name()
                return [current_table_name] if current_table_name != "No table" else []
        except Exception as e:
            logger.error(f"Failed to get accessible tables: {e}")
            return []
    
    def can_access_panel(self, panel_name: str) -> bool:
        """Check if current user can access a specific panel based on mode"""
        
        if self.is_gm_mode():
            return True  # GM has access to all panels
        
        # Player mode restrictions - hide specific panels
        restricted_panels = [
            'entities',      # Entities panel must be hidden
            'compendium',  # Compendium panel must be hidden
            'layers',      # Layers panel must be hidden full
            'table'       # Table panel must be full hidden
        ]
        
        # Allow access if not in restricted list
        return panel_name not in restricted_panels
    
    def can_access_dm_tools(self) -> bool:
        """Check if current user can access DM tools"""
        return self.is_gm_mode()  # Only GM can access DM tools
    
    def get_allowed_tools_for_mode(self) -> List[str]:
        """Get list of allowed tools based on user mode"""
        if self.is_gm_mode():
            return ["Select", "Move", "Rotate", "Scale", "Measure", "Draw", "Erase", "Fog of War"]  # GM has all tools including fog of war
        else:
            return ["Select", "Measure", "Draw"]  # Player only has basic tools
    
    def get_default_right_panel_for_mode(self) -> str:
        """Get the default right panel based on user mode"""
        if self.is_gm_mode():
            return 'entity_panel'  # GM default
        else:
            return 'character_panel'  # Player default
    
    # =========================================================================
    # NETWORK-AWARE OPERATIONS
    # =========================================================================
    
    def create_sprite_networked(self, table_id: str, sprite_id: str, position: Position, 
                               image_path: str, layer: str = "tokens", to_server: bool = True) -> bool:
        """Create a sprite with network synchronization"""
        result = self.actions.create_sprite(
            table_id=table_id,
            sprite_id=sprite_id,
            position=position,
            image_path=image_path,
            layer=layer,
            to_server=to_server
        )
        
        if result.success:
            logger.info(f"Sprite created: {result.message}")
            return True
        else:
            logger.error(f"Failed to create sprite: {result.message}")
            return False
    
    def move_sprite_networked(self, table_id: str, sprite_id: str, position: Position, 
                             to_server: bool = True) -> bool:
        """Move a sprite with network synchronization"""
        result = self.actions.move_sprite(
            table_id=table_id,
            sprite_id=sprite_id,
            position=position,
            to_server=to_server
        )
        
        if result.success:
            logger.info(f"Sprite moved: {result.message}")
            return True
        else:
            logger.error(f"Failed to move sprite: {result.message}")
            return False
    
    def delete_sprite_networked(self, table_id: str, sprite_id: str, to_server: bool = True) -> bool:
        """Delete a sprite with network synchronization"""
        result = self.actions.delete_sprite(
            table_id=table_id,
            sprite_id=sprite_id,
            to_server=to_server
        )
        
        if result.success:
            logger.info(f"Sprite deleted: {result.message}")
            return True
        else:
            logger.error(f"Failed to delete sprite: {result.message}")
            return False
    
    def update_sprite_networked(self, table_id: str, sprite_id: str, to_server: bool = True, **kwargs) -> bool:
        """Update sprite properties with network synchronization"""
        result = self.actions.update_sprite(
            table_id=table_id,
            sprite_id=sprite_id,
            to_server=to_server,
            **kwargs
        )
        
        if result.success:
            logger.info(f"Sprite updated: {result.message}")
            return True
        else:
            logger.error(f"Failed to update sprite: {result.message}")
            return False
    
    def scale_sprite_networked(self, table_id: str, sprite_id: str, scale_x: float, scale_y: float, 
                              to_server: bool = True) -> bool:
        """Scale a sprite with network synchronization"""
        result = self.actions.scale_sprite(
            table_id=table_id,
            sprite_id=sprite_id,
            scale_x=scale_x,
            scale_y=scale_y,
            to_server=to_server
        )
        
        if result.success:
            logger.info(f"Sprite scaled: {result.message}")
            return True
        else:
            logger.error(f"Failed to scale sprite: {result.message}")
            return False
    
    def rotate_sprite_networked(self, table_id: str, sprite_id: str, angle: float, 
                               to_server: bool = True) -> bool:
        """Rotate a sprite with network synchronization"""
        result = self.actions.rotate_sprite(
            table_id=table_id,
            sprite_id=sprite_id,
            angle=angle,
            to_server=to_server
        )
        
        if result.success:
            logger.info(f"Sprite rotated: {result.message}")
            return True
        else:
            logger.error(f"Failed to rotate sprite: {result.message}")
            return False
    
    def sync_table_with_network(self, table_id: str) -> bool:
        """Force synchronize table with network"""
        try:
            if hasattr(self.context, 'sync_table_with_network'):
                self.context.sync_table_with_network(table_id)
                logger.info(f"Table {table_id} synchronized with network")
                return True
            else:
                logger.warning("Context does not support table network sync")
                return False
        except Exception as e:
            logger.error(f"Failed to sync table with network: {e}")
            return False
    
    def get_network_status(self) -> Dict[str, Any]:
        """Get current network status"""
        try:
            if hasattr(self.context, 'get_network_status'):
                return self.context.get_network_status()
            else:
                logger.error("Context does not have network status capability")
                raise RuntimeError("Network status not available - context not properly initialized")
        except Exception as e:
            logger.error(f"Failed to get network status: {e}")
            raise
    
    def broadcast_message(self, message: str, message_type: str = "info") -> bool:
        """Broadcast a message to all connected players"""
        try:
            if hasattr(self.context, 'notify_network_players'):
                self.context.notify_network_players(message, message_type)
                logger.info(f"Broadcasted message: {message}")
                return True
            else:
                logger.error("Context does not support network messaging")
                raise RuntimeError("Network messaging not available - context not properly initialized")
        except Exception as e:
            logger.error(f"Failed to broadcast message: {e}")
            raise
    
    # =========================================================================
    # NETWORK & PLAYER MANAGEMENT
    # =========================================================================
    
    def get_network_state(self) -> Dict[str, Any]:
        """Get current network state for GUI display"""
        try:
            return self.actions.get_network_state()
        except Exception as e:
            logger.error(f"Failed to get network state: {e}")
            return {
                'connected': False,
                'players': [],
                'player_count': 0,
                'connection_status': {},
                'last_updated': 0,
                'error': str(e)
            }
    
    def request_player_list(self) -> bool:
        """Request updated player list from server"""
        try:
            result = self.actions.request_player_list()
            return result.success
        except Exception as e:
            logger.error(f"Failed to request player list: {e}")
            return False
    
    def kick_player(self, player_id: str, username: str, reason: str = "No reason provided") -> bool:
        """Kick a player from the session"""
        try:
            result = self.actions.kick_player(player_id, username, reason)
            if result.success:
                logger.info(f"Kick request sent for {username}: {reason}")
            else:
                logger.error(f"Failed to kick player {username}: {result.message}")
            return result.success
        except Exception as e:
            logger.error(f"Failed to kick player {username}: {e}")
            return False
    
    def ban_player(self, player_id: str, username: str, reason: str = "No reason provided", duration: str = "permanent") -> bool:
        """Ban a player from the session"""
        try:
            result = self.actions.ban_player(player_id, username, reason, duration)
            if result.success:
                logger.info(f"Ban request sent for {username} ({duration}): {reason}")
            else:
                logger.error(f"Failed to ban player {username}: {result.message}")
            return result.success
        except Exception as e:
            logger.error(f"Failed to ban player {username}: {e}")
            return False
    
    def get_connected_players(self) -> List[Dict[str, Any]]:
        """Get list of connected players for GUI display"""
        try:
            network_state = self.actions.get_network_state()
            return network_state.get('players', [])
        except Exception as e:
            logger.error(f"Failed to get connected players: {e}")
            return []
    
    def get_player_count(self) -> int:
        """Get current number of connected players"""
        try:
            network_state = self.actions.get_network_state()
            return network_state.get('player_count', 0)
        except Exception as e:
            logger.error(f"Failed to get player count: {e}")
            return 0
    
    def is_connected_to_server(self) -> bool:
        """Check if connected to server"""
        try:
            network_state = self.actions.get_network_state()
            return network_state.get('connected', False)
        except Exception as e:
            logger.error(f"Failed to check server connection: {e}")
            return False
    
    def request_connection_status(self) -> bool:
        """Request updated connection status from server"""
        try:
            result = self.actions.request_connection_status()
            return result.success
        except Exception as e:
            logger.error(f"Failed to request connection status: {e}")
            return False
    
    def get_connection_quality(self) -> Dict[str, Any]:
        """Get connection quality information"""
        try:
            network_state = self.actions.get_network_state()
            connection_status = network_state.get('connection_status', {})
            last_ping = network_state.get('last_ping', 0)
            
            import time
            ping_age = time.time() - last_ping if last_ping > 0 else float('inf')
            
            return {
                'connected': network_state.get('connected', False),
                'ping_age_seconds': ping_age,
                'status_info': connection_status,
                'last_update': network_state.get('last_updated', 0)
            }
        except Exception as e:
            logger.error(f"Failed to get connection quality: {e}")
            return {
                'connected': False,
                'ping_age_seconds': float('inf'),
                'status_info': {},
                'last_update': 0
            }
    
    def send_chat_message(self, message: str) -> bool:
        """Send a chat message (using existing add_chat_message)"""
        try:
            result = self.actions.add_chat_message(message)
            return result.success
        except Exception as e:
            logger.error(f"Failed to send chat message: {e}")
            return False
    
    def get_user_permissions(self) -> Dict[str, bool]:
        """Get current user's permissions for player management"""
        try:
            # This would normally check the user's role/permissions
            # For now, return basic permissions based on connection status
            network_state = self.actions.get_network_state()
            connected = network_state.get('connected', False)
            
            # Simple permission system - can be enhanced based on user roles
            return {
                'can_kick': connected,  # Only if connected
                'can_ban': connected,   # Only if connected  
                'can_manage_players': connected,
                'can_view_players': True,
                'is_dm': False,  # This should come from actual user role
                'is_admin': False  # This should come from actual user role
            }
        except Exception as e:
            logger.error(f"Failed to get user permissions: {e}")
            return {
                'can_kick': False,
                'can_ban': False,
                'can_manage_players': False,
                'can_view_players': True,
                'is_dm': False,
                'is_admin': False
            }
    
    # =========================================================================
    # SESSION MANAGEMENT
    # =========================================================================
    
    def join_session(self, server_ip: str, port: int, username: str, password: Optional[str] = None) -> ActionResult:
        """Join a multiplayer session on dedicated server"""
        try:
            # Get ClientProtocol instance from context
            client_protocol = getattr(self.context, 'protocol', None)
            if not client_protocol:
                return ActionResult(False, "No network protocol available")
            
            # Use actual join implementation
            result = client_protocol.join_session(server_ip, port, username, password)
            
            if result.get('success', False):
                logger.info(f"Join session successful: {username}@{server_ip}:{port}")
                return ActionResult(True, result.get('message', f"Connected to {server_ip}:{port}"))
            else:
                error_msg = result.get('message', 'Unknown connection error')
                logger.error(f"Failed to join session: {error_msg}")
                return ActionResult(False, error_msg)
                
        except Exception as e:
            logger.error(f"Failed to join session: {e}")
            return ActionResult(False, f"Failed to join session: {str(e)}")

    def leave_session(self) -> ActionResult:
        """Leave the current multiplayer session"""
        try:
            # Get ClientProtocol instance from context
            client_protocol = getattr(self.context, 'protocol', None)
            if not client_protocol:
                return ActionResult(False, "No network protocol available")
            
            # Use actual disconnect implementation
            result = client_protocol.disconnect_session()
            
            if result.get('success', False):
                logger.info("Leave session successful")
                return ActionResult(True, result.get('message', "Disconnected from session"))
            else:
                error_msg = result.get('message', 'Unknown disconnect error')
                logger.error(f"Failed to leave session: {error_msg}")
                return ActionResult(False, error_msg)
                
        except Exception as e:
            logger.error(f"Failed to leave session: {e}")
            return ActionResult(False, f"Failed to leave session: {str(e)}")

    # =========================================================================
    # AUTHENTICATION MANAGEMENT
    # =========================================================================
    
    def register_user(self, server_url: str, username: str, password: str) -> ActionResult:
        """Register a new user on the server"""
        try:
            # Get ClientProtocol instance from context
            client_protocol = getattr(self.context, 'protocol', None)
            if not client_protocol:
                return ActionResult(False, "No network protocol available")
            
            result = client_protocol.register_user(server_url, username, password)
            
            if result['success']:
                return ActionResult(True, result['message'])
            else:
                return ActionResult(False, result['message'])
                
        except Exception as e:
            logger.error(f"Failed to register user: {e}")
            return ActionResult(False, f"Failed to register user: {str(e)}")

    def login_user(self, server_url: str, username: str, password: str) -> ActionResult:
        """Login user and get JWT token"""
        try:
            # Get ClientProtocol instance from context
            client_protocol = getattr(self.context, 'protocol', None)
            if not client_protocol:
                return ActionResult(False, "No network protocol available")
            
            result = client_protocol.login_user(server_url, username, password)
            
            if result['success']:
                # Store authentication info in context for GUI access
                if not hasattr(self.context, 'auth_state'):
                    self.context.auth_state = {}
                
                self.context.auth_state.update({
                    'is_authenticated': True,
                    'username': username,
                    'jwt_token': result['jwt_token'],
                    'server_url': server_url
                })
                
                return ActionResult(True, result['message'], result)
            else:
                return ActionResult(False, result['message'])
                
        except Exception as e:
            logger.error(f"Failed to login user: {e}")
            return ActionResult(False, f"Failed to login user: {str(e)}")

    def logout_user(self) -> ActionResult:
        """Logout user and clear authentication data"""
        try:
            # Get ClientProtocol instance from context
            client_protocol = getattr(self.context, 'protocol', None)
            if not client_protocol:
                return ActionResult(False, "No network protocol available")
            
            result = client_protocol.logout_user()
            
            # Clear authentication info from context
            if hasattr(self.context, 'auth_state'):
                self.context.auth_state = {
                    'is_authenticated': False,
                    'username': '',
                    'jwt_token': '',
                    'server_url': ''
                }
            
            if result['success']:
                return ActionResult(True, result['message'])
            else:
                return ActionResult(False, result['message'])
                
        except Exception as e:
            logger.error(f"Failed to logout user: {e}")
            return ActionResult(False, f"Failed to logout user: {str(e)}")

    def fetch_user_sessions(self, server_url: str, jwt_token: str) -> ActionResult:
        """Fetch user's available game sessions"""
        try:
            # Get ClientProtocol instance from context
            client_protocol = getattr(self.context, 'protocol', None)
            if not client_protocol:
                return ActionResult(False, "No network protocol available")
            
            result = client_protocol.fetch_user_sessions(server_url, jwt_token)
            
            if result['success']:
                # Store sessions in context for GUI access
                if not hasattr(self.context, 'auth_state'):
                    self.context.auth_state = {}
                
                self.context.auth_state['available_sessions'] = result['sessions']
                
                return ActionResult(True, result['message'], {'sessions': result['sessions']})
            else:
                return ActionResult(False, result['message'])
                
        except Exception as e:
            logger.error(f"Failed to fetch user sessions: {e}")
            return ActionResult(False, f"Failed to fetch user sessions: {str(e)}")

    def test_server_connection(self, server_url: str) -> ActionResult:
        """Test if the server URL is reachable"""
        try:
            # Get ClientProtocol instance from context
            client_protocol = getattr(self.context, 'protocol', None)
            if not client_protocol:
                return ActionResult(False, "No network protocol available")
            
            result = client_protocol.test_server_connection(server_url)
            
            if result['success']:
                return ActionResult(True, result['message'], result)
            else:
                return ActionResult(False, result['message'], result)
                
        except Exception as e:
            logger.error(f"Failed to test server connection: {e}")
            return ActionResult(False, f"Failed to test server connection: {str(e)}")

    def parse_server_url(self, server_url: str, default_port: str = "12345") -> Dict[str, str]:
        """Parse server URL to extract hostname and port"""
        try:
            # Get ClientProtocol instance from context
            client_protocol = getattr(self.context, 'protocol', None)
            if not client_protocol:
                logger.error("No network protocol available for URL parsing")
                raise RuntimeError("Network protocol not available")
            
            return client_protocol.parse_server_url(server_url, default_port)
                
        except Exception as e:
            logger.error(f"Failed to parse server URL: {e}")
            raise

    def get_authentication_state(self) -> Dict[str, Any]:
        """Get current authentication state"""
        try:
            # Get ClientProtocol instance from context
            client_protocol = getattr(self.context, 'protocol', None)
            if not client_protocol:
                return {
                    'is_authenticated': False,
                    'username': '',
                    'jwt_token': '',
                    'server_url': '',
                    'available_sessions': []
                }
            
            auth_info = client_protocol.get_authentication_info()
            context_auth = getattr(self.context, 'auth_state', {})
            
            # Merge protocol auth info with context state
            return {
                'is_authenticated': auth_info.get('is_authenticated', False),
                'username': auth_info.get('username', ''),
                'jwt_token': auth_info.get('jwt_token', ''),
                'session_code': auth_info.get('session_code', ''),
                'user_id': auth_info.get('user_id'),
                'server_url': context_auth.get('server_url', ''),
                'available_sessions': context_auth.get('available_sessions', [])
            }
                
        except Exception as e:
            logger.error(f"Failed to get authentication state: {e}")
            return {
                'is_authenticated': False,
                'username': '',
                'jwt_token': '',
                'server_url': '',
                'available_sessions': [],
                'error': str(e)
            }

    def set_session_info(self, session_code: str, user_id: Optional[int] = None) -> ActionResult:
        """Set session information for authenticated user"""
        try:
            # Get ClientProtocol instance from context
            client_protocol = getattr(self.context, 'protocol', None)
            if not client_protocol:
                return ActionResult(False, "No network protocol available")
            
            # Get current auth info
            auth_info = client_protocol.get_authentication_info()
            if not auth_info['is_authenticated']:
                return ActionResult(False, "User not authenticated")
            
            # Update session info
            client_protocol.set_authentication_info(
                username=auth_info['username'],
                jwt_token=auth_info['jwt_token'],
                session_code=session_code,
                user_id=user_id
            )
            
            return ActionResult(True, f"Session set to: {session_code}")
                
        except Exception as e:
            logger.error(f"Failed to set session info: {e}")
            return ActionResult(False, f"Failed to set session info: {str(e)}")

    def add_chat_message(self, message: str) -> ActionResult:
        """Add a chat message to the system"""
        try:
            return self.actions.add_chat_message(message)
        except Exception as e:
            logger.error(f"Failed to add chat message: {e}")
            return ActionResult(False, f"Failed to add chat message: {str(e)}")
    
    def initialize_user_mode(self) -> bool:
        """Initialize user mode based on context settings"""
        try:
            # Context must have is_gm attribute set from command line args
            if not hasattr(self.context, 'is_gm'):
                logger.error("Context missing is_gm attribute - command line args not properly processed")
                raise RuntimeError("User mode not initialized in context")
            
            is_gm = self.context.is_gm
            return self.set_user_mode(is_gm)
        except Exception as e:
            logger.error(f"Failed to initialize user mode: {e}")
            return False
    
    def find_sprite_layer(self, sprite) -> Optional[str]:
        """Find which layer a sprite is on"""
        if not self.context.current_table:
            return None
        
        for layer_name, layer_sprites in self.context.current_table.dict_of_sprites_list.items():
            if sprite in layer_sprites:
                return layer_name
        return None
    
    def select_sprite_and_layer(self, sprite) -> bool:
        """Select a sprite and automatically switch to its layer"""
        try:
            # Find which layer the sprite is on
            sprite_layer = self.find_sprite_layer(sprite)
            if sprite_layer is None:
                logger.warning("Cannot find layer for sprite")
                return False
            
            # Switch to that layer if it's different from current
            if sprite_layer != self.context.selected_layer:
                self.set_selected_layer(sprite_layer)
                logger.info(f"Switched to layer '{sprite_layer}' for sprite selection")
            
            # Select the sprite
            self.context.current_table.selected_sprite = sprite
            logger.info(f"Selected sprite on layer '{sprite_layer}'")
            return True
        except Exception as e:
            logger.error(f"Failed to select sprite and layer: {e}")
            return False
    #TODO: use existing structer to get selected entity    
    def set_selected_entity(self, entity_id: str):
        """Set selected entity across all panels"""
        # Store selected entity reference
        self._selected_entity_id = entity_id
        
        # Notify character sheet panel if it exists
        if hasattr(self, '_gui_reference') and self._gui_reference:
            character_panel = self._gui_reference.panel_instances.get('character_sheet')
            if character_panel and hasattr(character_panel, 'set_selected_entity'):
                character_panel.set_selected_entity(entity_id)
    
    def get_selected_entity(self) -> Optional[str]:
        """Get currently selected entity ID"""
        return getattr(self, '_selected_entity_id', None)
    
    def set_gui_reference(self, gui_instance):
        """Set reference to GUI instance for panel coordination"""
        self._gui_reference = gui_instance

    def on_entity_selected(self, entity_id: str):
        """Called when an entity is selected in the journal panel. Notifies character sheet panel."""
        # Track the selected entity
        self._selected_entity_id = entity_id
        logger.debug(f"Actions bridge tracking selected entity: {entity_id}")
        
        # Notify character sheet panel
        if hasattr(self.context, 'character_sheet_panel'):
            self.context.character_sheet_panel.set_selected_entity(entity_id)
        elif hasattr(self.context, 'panels') and 'character_sheet_panel' in self.context.panels:
            self.context.panels['character_sheet_panel'].set_selected_entity(entity_id)
        
        # Note: Window opening is now handled by the journal panel only
        # The character sheet panel will only open windows when the "Open Full Sheet" button is clicked
    
    def open_character_sheet(self, entity_id: str):
        """Open the character sheet full window for the given entity"""
        if hasattr(self.context, 'character_sheet_panel'):
            self.context.character_sheet_panel.open_for_entity(entity_id)
            self.context.character_sheet_panel.show_full_window = True
    
    # =========================================================================
    # CHARACTER MANAGEMENT
    # =========================================================================
    
    def add_character_from_creator(self, character_obj, legacy_data: Dict) -> Optional[str]:
        """Add a character created from the character creator"""
        try:
            result = self.actions.add_character_from_creator(character_obj, legacy_data)
            if result:
                logger.info(f"Character '{character_obj.name}' added via Actions with ID: {result}")
                return result
            else:
                logger.error(f"Failed to add character from creator")
                return None
        except Exception as e:
            logger.error(f"Error adding character from creator: {e}")
            return None
    
    def get_character(self, character_id: str) -> Optional[Dict[str, Any]]:
        """Get character data by ID"""
        try:
            result = self.actions.get_character(character_id)
            if result.success:
                return result.data
            else:
                logger.error(f"Failed to get character: {result.message}")
                return None
        except Exception as e:
            logger.error(f"Error getting character: {e}")
            return None
    
    def list_characters(self) -> Dict[str, Dict[str, Any]]:
        """Get all characters for GUI display"""
        try:
            result = self.actions.list_characters()
            if result.success:
                return result.data.get('characters', {})
            else:
                logger.error(f"Failed to list characters: {result.message}")
                return {}
        except Exception as e:
            logger.error(f"Error listing characters: {e}")
            return {}
    
    def update_character(self, character_id: str, character_obj=None, legacy_data: Optional[Dict] = None) -> bool:
        """Update character data"""
        try:
            result = self.actions.update_character(character_id, character_obj, legacy_data)
            if result.success:
                logger.info(f"Character {character_id} updated successfully")
                return True
            else:
                logger.error(f"Failed to update character: {result.message}")
                return False
        except Exception as e:
            logger.error(f"Error updating character: {e}")
            return False
    
    def delete_character(self, character_id: str) -> bool:
        """Delete a character"""
        try:
            result = self.actions.delete_character(character_id)
            if result.success:
                logger.info(f"Character {character_id} deleted successfully")
                return True
            else:
                logger.error(f"Failed to delete character: {result.message}")
                return False
        except Exception as e:
            logger.error(f"Error deleting character: {e}")
            return False
    
    def save_character(self, character_id: str, character_obj=None, legacy_data: Optional[Dict] = None) -> bool:
        """Save character data to storage"""
        try:
            result = self.actions.save_character(character_id, character_obj, legacy_data)
            if result.success:
                logger.info(f"Character {character_id} saved successfully")
                return True
            else:
                logger.error(f"Failed to save character: {result.message}")
                return False
        except Exception as e:
            logger.error(f"Error saving character: {e}")
            return False
    
    def load_character(self, character_id: str) -> Optional[Dict[str, Any]]:
        """Load character data from storage"""
        try:
            result = self.actions.load_character(character_id)
            if result.success:
                return result.data
            else:
                logger.error(f"Failed to load character: {result.message}")
                return None
        except Exception as e:
            logger.error(f"Error loading character: {e}")
            return None
    
    def duplicate_character(self, character_id: str, new_name: Optional[str] = None) -> Optional[str]:
        """Duplicate an existing character"""
        try:
            # If no new name provided, generate one based on the original character
            if new_name is None:
                # Get the original character to create a default name
                original_character = self.get_character(character_id)
                if original_character and 'name' in original_character:
                    original_name = original_character['name']
                    new_name = f"{original_name} (Copy)"
                else:
                    new_name = "Character Copy"
            
            result = self.actions.duplicate_character(character_id, new_name)
            if result.success:
                new_id = result.data.get('entity_id')
                logger.info(f"Character duplicated with new ID: {new_id}")
                return new_id
            else:
                logger.error(f"Failed to duplicate character: {result.message}")
                return None
        except Exception as e:
            logger.error(f"Error duplicating character: {e}")
            return None

    def open_character_creator(self) -> bool:
        """Open the character creator window"""
        try:
            result = self.actions.open_character_creator()
            if result.success:
                logger.info("Character creator opened successfully")
                return True
            else:
                logger.error(f"Failed to open character creator: {result.message}")
                return False
        except Exception as e:
            logger.error(f"Error opening character creator: {e}")
            return False
    
    def open_character_creator_for_character(self, character_id: str) -> bool:
        """Open the character creator window for editing an existing character"""
        try:
            result = self.actions.open_character_creator_for_character(character_id)
            if result.success:
                logger.info(f"Character creator opened for character {character_id}")
                return True
            else:
                logger.error(f"Failed to open character creator for character {character_id}: {result.message}")
                return False
        except Exception as e:
            logger.error(f"Error opening character creator for character {character_id}: {e}")
            return False
