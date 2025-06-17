from typing import Dict, Any, List, Optional
from abc import ABC, abstractmethod
from .actions_protocol import ActionResult, Position, LAYERS

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
    async def create_sprite(self, table_id: str, sprite_id: str, position: Position, 
                     image_path: str, layer: str = "tokens") -> ActionResult:
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
