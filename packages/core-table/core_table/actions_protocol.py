from abc import ABC, abstractmethod
from typing import Dict, Any, List, Optional, Tuple
from dataclasses import dataclass

@dataclass
class Position:
    x: float
    y: float

@dataclass
class ActionResult:
    success: bool
    message: str = ""
    data: Optional[Dict[str, Any]] = None

class ActionsProtocol(ABC):
    """
    Protocol for all actions that can be performed on tables, sprites, and layers.
    This protocol defines the interface that both client (SDL/GUI) and server (VirtualTable) 
    implementations must follow.
    """
    
    # Table Actions
    @abstractmethod
    def create_table(self, name: str, width: int, height: int) -> ActionResult:
        """Create a new table"""
        pass
    
    @abstractmethod
    def delete_table(self, table_id: str) -> ActionResult:
        """Delete a table"""
        pass
    @abstractmethod
    def get_table(self, table_id: str) -> ActionResult:
        """Get table"""
        pass

    @abstractmethod
    def update_table(self, table_id: str, **kwargs) -> ActionResult:
        """Update table properties (name, dimensions, etc.)"""
        pass
    
    @abstractmethod
    def move_table(self, table_id: str, position: Position) -> ActionResult:
        """Move table to new position"""
        pass
    
    @abstractmethod
    def scale_table(self, table_id: str, scale_x: float, scale_y: float) -> ActionResult:
        """Scale table by given factors"""
        pass
    
    # Sprite Actions
    @abstractmethod
    def create_sprite(self, table_id: str, sprite_id: str, position: Position, 
                     image_path: str, layer: str = "tokens") -> ActionResult:
        """Create a new sprite on a table"""
        pass
    
    @abstractmethod
    def delete_sprite(self, table_id: str, sprite_id: str) -> ActionResult:
        """Delete a sprite from a table"""
        pass
    
    @abstractmethod
    def move_sprite(self, table_id: str, sprite_id: str, position: Position) -> ActionResult:
        """Move sprite to new position"""
        pass
    
    @abstractmethod
    def scale_sprite(self, table_id: str, sprite_id: str, scale_x: float, scale_y: float) -> ActionResult:
        """Scale sprite by given factors"""
        pass
    
    @abstractmethod
    def rotate_sprite(self, table_id: str, sprite_id: str, angle: float) -> ActionResult:
        """Rotate sprite by given angle (in degrees)"""
        pass
    
    @abstractmethod
    def update_sprite(self, table_id: str, sprite_id: str, **kwargs) -> ActionResult:
        """Update sprite properties (image, layer, visibility, etc.)"""
        pass
    
    # Layer Actions
    @abstractmethod
    def set_layer_visibility(self, table_id: str, layer: str, visible: bool) -> ActionResult:
        """Set layer visibility"""
        pass
    
    @abstractmethod
    def get_layer_visibility(self, table_id: str, layer: str) -> ActionResult:
        """Get layer visibility status"""
        pass
    
    @abstractmethod
    def move_sprite_to_layer(self, table_id: str, sprite_id: str, new_layer: str) -> ActionResult:
        """Move sprite to different layer"""
        pass
    
    @abstractmethod
    def get_layer_sprites(self, table_id: str, layer: str) -> ActionResult:
        """Get all sprites on a specific layer"""
        pass
    
    # Query Actions
    @abstractmethod
    def get_table_info(self, table_id: str) -> ActionResult:
        """Get table information"""
        pass
    
    @abstractmethod
    def get_sprite_info(self, table_id: str, sprite_id: str) -> ActionResult:
        """Get sprite information"""
        pass
    
    @abstractmethod
    def get_all_tables(self) -> ActionResult:
        """Get all tables"""
        pass
    
    @abstractmethod
    def get_table_sprites(self, table_id: str, layer: Optional[str] = None) -> ActionResult:
        """Get all sprites on a table, optionally filtered by layer"""
        pass
    
    # Batch Actions
    @abstractmethod
    def batch_actions(self, actions: List[Dict[str, Any]]) -> ActionResult:
        """Execute multiple actions in a batch"""
        pass
    
    # Undo/Redo Actions
    @abstractmethod
    def undo_action(self) -> ActionResult:
        """Undo the last action"""
        pass
    
    @abstractmethod
    def redo_action(self) -> ActionResult:
        """Redo the last undone action"""
        pass
    
    # Utility Actions
    @abstractmethod
    def get_sprite_at_position(self, table_id: str, position: Position, layer: Optional[str] = None) -> ActionResult:
        """Get sprite at specific position"""
        pass
    
    @abstractmethod
    def get_sprites_in_area(self, table_id: str, top_left: Position, bottom_right: Position, 
                           layer: Optional[str] = None) -> ActionResult:
        """Get all sprites in a rectangular area"""
        pass
    
    # Fog of War Actions
    @abstractmethod
    def update_fog_rectangles(self, table_id: str, hide_rectangles: List[Tuple[Tuple[float, float], Tuple[float, float]]], 
                             reveal_rectangles: List[Tuple[Tuple[float, float], Tuple[float, float]]]) -> ActionResult:
        """Update fog of war rectangles"""
        pass
    
    @abstractmethod
    def get_fog_rectangles(self, table_id: str) -> ActionResult:
        """Get current fog of war rectangles"""
        pass

# Constants for layers
LAYERS = {
    'map': 0,
    'tokens': 1,    
    'dungeon_master': 2,
    'light': 3,
    'height': 4,
    'obstacles': 5,
    'fog_of_war': 6
}

# Constants for action types (for batch operations)
ACTION_TYPES = {
    'CREATE_TABLE': 'create_table',
    'DELETE_TABLE': 'delete_table',
    'GET_TABLE:': 'get_table',
    'UPDATE_TABLE': 'update_table',
    'MOVE_TABLE': 'move_table',
    'SCALE_TABLE': 'scale_table',
    'CREATE_SPRITE': 'create_sprite',
    'DELETE_SPRITE': 'delete_sprite',
    'MOVE_SPRITE': 'move_sprite',
    'SCALE_SPRITE': 'scale_sprite',
    'ROTATE_SPRITE': 'rotate_sprite',
    'UPDATE_SPRITE': 'update_sprite',
    'SET_LAYER_VISIBILITY': 'set_layer_visibility',
    'MOVE_SPRITE_TO_LAYER': 'move_sprite_to_layer'
}