"""
GUI Actions Bridge - Connects GUI panels to the Actions protocol system
Provides a clean interface for GUI panels to interact with game logic
"""

from typing import Dict, Any, Optional, List
import logging
import uuid
from core_table.actions_protocol import ActionResult, Position

logger = logging.getLogger(__name__)

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
    
    def delete_table(self, table_name: str) -> bool:
        """Delete a table"""
        # Find table by name to get its ID
        table = self.context._get_table_by_name(table_name)
        if not table:
            logger.error(f"Table '{table_name}' not found")
            return False
            
        result = self.actions.delete_table(table.table_id)
        
        if result.success:
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
            
        table_id = self.context.current_table.table_id  # Use table_id instead of name
        result = self.actions.set_layer_visibility(table_id, layer, visible)
        
        if result.success:
            logger.info(f"Layer visibility set: {result.message}")
            return True
        else:
            logger.error(f"Failed to set layer visibility: {result.message}")
            return False
    
    def get_layer_visibility(self, layer: str) -> bool:
        """Get layer visibility status"""
        if not self.context.current_table:
            logger.error("No current table for layer visibility check")
            return True  # Default to visible
            
        table_id = self.context.current_table.table_id  # Use table_id instead of name
        result = self.actions.get_layer_visibility(table_id, layer)
        
        if result.success:
            return result.data.get('visible', True)
        else:
            logger.error(f"Failed to get layer visibility: {result.message}")
            return True  # Default to visible
    
    # Utility Methods
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
        """Check if there is a current table"""
        return self.context.current_table is not None
    
    def get_available_layers(self) -> List[str]:
        """Get list of available layers"""
        if not self.context.current_table:
            return []
        return self.context.current_table.layers
    def add_chat_message(self, message: str) -> bool:
        """Add a chat message (placeholder for future implementation)"""
        # This is a placeholder - actual chat system would be implemented separately
        logger.info(f"Chat message: {message}")
        return True
    
    def get_chat_messages(self) -> List[str]:
        """Get chat messages (placeholder for future implementation)"""
        # This is a placeholder - actual chat system would be implemented separately
        return []
    
    def get_current_table_name(self) -> str:
        """Get current table name"""
        if not self.context.current_table:
            return ""
        return self.context.current_table.table_name
    
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
    
    def get_table_by_name(self, name: str):
        """Get table by name (helper method)"""
        return self.context._get_table_by_name(name)
    
    def get_table_by_id(self, table_id: str):
        """Get table by ID (helper method)"""
        return self.context._get_table_by_id(table_id)
