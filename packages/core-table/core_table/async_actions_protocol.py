from typing import Dict, Any, List, Optional
from abc import ABC, abstractmethod


LAYERS = ['map', 'tokens', 'dungeon_master', 'light', 'height', 'obstacles', 'fog_of_war']


class Position:
    def __init__(self, x: float, y: float):
        self.x = x
        self.y = y

    def get(self, key: str, default=None):
        return getattr(self, key, default)

    def __eq__(self, other):
        if isinstance(other, Position):
            return self.x == other.x and self.y == other.y
        if isinstance(other, (list, tuple)) and len(other) >= 2:
            return self.x == other[0] and self.y == other[1]
        return False

    def __repr__(self):
        return f"Position({self.x}, {self.y})"


class ActionResult:
    def __init__(self, success: bool, message: str = '', data: Any = None):
        self.success = success
        self.message = message
        self.data = data

    def __bool__(self):
        return self.success

    def __repr__(self):
        return f"ActionResult(success={self.success}, message={self.message!r})"

class AsyncActionsProtocol(ABC):
    """
    Async version of ActionsProtocol for server-side operations.
    All methods are async to support database operations and network calls.
    """
    
    # Table Actions
    @abstractmethod
    async def create_table(self, name: str, width: int, height: int) -> ActionResult:
        pass
    
    @abstractmethod
    async def delete_table(self, table_id: str) -> ActionResult:
        pass
    
    @abstractmethod
    async def get_table(self, table_id: str, **kwargs) -> ActionResult:
        pass
    
    @abstractmethod
    async def update_table(self, table_id: str, **kwargs) -> ActionResult:
        pass
    
    @abstractmethod
    async def update_table_from_data(self, data: Dict[str, Any]) -> ActionResult:
        pass
    
    @abstractmethod
    async def move_table(self, table_id: str, position: Position) -> ActionResult:
        pass
    
    @abstractmethod
    async def scale_table(self, table_id: str, scale_x: float, scale_y: float) -> ActionResult:
        pass
    
    # Sprite Actions
    @abstractmethod
    async def create_sprite(self, table_id: str, sprite_data: Dict[str, Any], 
                     session_id: Optional[int] = None) -> ActionResult:
        pass
    
    @abstractmethod
    async def create_sprite_from_data(self, data: Dict[str, Any]) -> ActionResult:
        pass
    
    @abstractmethod
    async def delete_sprite(self, table_id: str, sprite_id: str) -> ActionResult:
        pass
    
    @abstractmethod
    async def move_sprite(self, table_id: str, sprite_id: str, old_position: Position, new_position: Position) -> ActionResult:
        pass
    
    @abstractmethod
    async def scale_sprite(self, table_id: str, sprite_id: str, scale_x: float, scale_y: float) -> ActionResult:
        pass
    
    @abstractmethod
    async def rotate_sprite(self, table_id: str, sprite_id: str, angle: float) -> ActionResult:
        pass
    
    @abstractmethod
    async def update_sprite(self, table_id: str, sprite_id: str, **kwargs) -> ActionResult:
        pass
    
    # Layer Actions
    @abstractmethod
    async def set_layer_visibility(self, table_id: str, layer: str, visible: bool) -> ActionResult:
        pass
    
    @abstractmethod
    async def get_layer_visibility(self, table_id: str, layer: str) -> ActionResult:
        pass
    
    @abstractmethod
    async def move_sprite_to_layer(self, table_id: str, sprite_id: str, new_layer: str) -> ActionResult:
        pass
    
    @abstractmethod
    async def get_layer_sprites(self, table_id: str, layer: str) -> ActionResult:
        pass
    
    # Query Actions
    @abstractmethod
    async def get_table_info(self, table_id: str) -> ActionResult:
        pass
    
    @abstractmethod
    async def get_sprite_info(self, table_id: str, sprite_id: str) -> ActionResult:
        pass
    
    @abstractmethod
    async def get_all_tables(self) -> ActionResult:
        pass
    
    @abstractmethod
    async def get_table_sprites(self, table_id: str, layer: Optional[str] = None) -> ActionResult:
        pass
    
    # Batch Actions
    @abstractmethod
    async def batch_actions(self, actions: List[Dict[str, Any]]) -> ActionResult:
        pass
    
    # Undo/Redo Actions
    @abstractmethod
    async def undo_action(self) -> ActionResult:
        pass
    
    @abstractmethod
    async def redo_action(self) -> ActionResult:
        pass
    
    # Utility Actions
    @abstractmethod
    async def get_sprite_at_position(self, table_id: str, position: Position, layer: Optional[str] = None) -> ActionResult:
        pass
    
    @abstractmethod
    async def get_sprites_in_area(self, table_id: str, top_left: Position, bottom_right: Position, 
                           layer: Optional[str] = None) -> ActionResult:
        pass
