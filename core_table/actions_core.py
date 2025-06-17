from typing import Dict, Any, List, Optional
from .async_actions_protocol import AsyncActionsProtocol
from .actions_protocol import ActionResult, Position, LAYERS
from .table import VirtualTable, Entity
import uuid
import copy
import typing
if typing.TYPE_CHECKING:
    from .server import TableManager
import logging

logger = logging.getLogger(__name__)
class ActionsCore(AsyncActionsProtocol):
    """
    Server-side implementation of ActionsProtocol for VirtualTable.
    Handles game logic, validation, and state management on the server.
    """

    def __init__(self, table_manager):
        self.table_manager = table_manager
        self.action_history: List[Dict[str, Any]] = []
        self.undo_stack: List[Dict[str, Any]] = []
        self.redo_stack: List[Dict[str, Any]] = []
        self.tables: Dict[str, VirtualTable] = table_manager.tables
        self.max_history = 100
    
    async def _add_to_history(self, action: Dict[str, Any]):
        """Add action to history for undo/redo functionality"""
        self.action_history.append(action)
        if len(self.action_history) > self.max_history:
            self.action_history.pop(0)
        self.undo_stack.append(action)
        self.redo_stack.clear()  # Clear redo stack when new action is performed
    
    async def _get_table(self, table_id: str) -> Optional[VirtualTable]:
        """Get table by ID"""
        return self.tables.get(table_id)
    
    # Table Actions
    async def create_table(self, name: str, width: int, height: int) -> ActionResult:
        """Create a new table"""       

        table = VirtualTable(name, width, height)
        self.tables[table.table_id] = table

        action = {
            'type': 'create_table',
            'table_id': table.table_id,
            'name': name,
            'width': width,
            'height': height
        }
        await self._add_to_history(action)
        
        return ActionResult(True, f"Table {name} created successfully", {'table': table})
      
    
    async def delete_table(self, table_id: str) -> ActionResult:
        
        """Delete a table"""
        try:
            table = await self._get_table(table_id)
            if not table:
                return ActionResult(False, f"Table {table_id} not found")
            
            # Store table data for undo
            table_data = {
                'table_id': table_id,
                'name': table.name,
                'width': table.width,
                'height': table.height,
                'entities': copy.deepcopy(table.entities)
            }
            
            del self.tables[table_id]
            
            action = {
                'type': 'delete_table',
                'table_data': table_data
            }
            await self._add_to_history(action)
            
            return ActionResult(True, f"Table {table_id} deleted successfully")
        except Exception as e:
            return ActionResult(False, f"Failed to delete table: {str(e)}")
    
    async def get_table(self, table_id: str, **kwargs) -> ActionResult:
        """Get table properties"""
        try:
            table = await self._get_table(table_id)
            if not table:
                return ActionResult(False, f"Table {table_id} not found")
            return ActionResult(True, f"Table {table_id} retrieved successfully", {'table': table})
        except Exception as e:
            return ActionResult(False, f"Failed to get table: {str(e)}")

    async def update_table(self, table_id: str, **kwargs) -> ActionResult:
        """Update table properties"""
        try:
            table = await self._get_table(table_id)
            if not table:
                return ActionResult(False, f"Table {table_id} not found")
            
            old_values = {}
            for key, value in kwargs.items():
                if hasattr(table, key):
                    old_values[key] = getattr(table, key)
                    setattr(table, key, value)
            
            action = {
                'type': 'update_table',
                'table_id': table_id,
                'old_values': old_values,
                'new_values': kwargs
            }
            await self._add_to_history(action)
            
            return ActionResult(True, f"Table {table_id} updated successfully", kwargs)
        except Exception as e:
            return ActionResult(False, f"Failed to update table: {str(e)}")
    
    async def update_table_from_data(self, data: Dict[str, Any]) -> ActionResult:
        """Update table properties from data dictionary"""
        table_id = data.get('table_id')
        if not table_id:
            return ActionResult(False, "Table ID is required")

        # Update table properties
        return await self.update_table(table_id, **data)

    async def move_table(self, table_id: str, position: Position) -> ActionResult:
        """Move table to new position (add position attribute if needed)"""
        try:
            table = await self._get_table(table_id)
            if not table:
                return ActionResult(False, f"Table {table_id} not found")
            
            # Add position attribute if it doesn't exist
            if not hasattr(table, 'position'):
                table.position = (0.0, 0.0)
            
            old_pos = table.position
            table.position = (position.x, position.y)
            
            action = {
                'type': 'move_table',
                'table_id': table_id,
                'old_position': old_pos,
                'new_position': position
            }
            await self._add_to_history(action)
            
            return ActionResult(True, f"Table {table_id} moved to ({position.x}, {position.y})")
        except Exception as e:
            return ActionResult(False, f"Failed to move table: {str(e)}")
    
    async def scale_table(self, table_id: str, scale_x: float, scale_y: float) -> ActionResult:
        """Scale table by given factors (add scale attribute if needed)"""
        try:
            table = await self._get_table(table_id)
            if not table:
                return ActionResult(False, f"Table {table_id} not found")
            
            # Add scale attribute if it doesn't exist
            if not hasattr(table, 'scale'):
                table.scale = (1.0, 1.0)
            
            old_scale = table.scale
            table.scale = (scale_x, scale_y)
            
            action = {
                'type': 'scale_table',
                'table_id': table_id,
                'old_scale': old_scale,
                'new_scale': (scale_x, scale_y)
            }
            await self._add_to_history(action)
            
            return ActionResult(True, f"Table {table_id} scaled to ({scale_x}, {scale_y})")
        except Exception as e:
            return ActionResult(False, f"Failed to scale table: {str(e)}")
    
    # Sprite Actions
    async def create_sprite(self, table_id: str, sprite_id: str, position: Position, 
                     image_path: str, layer: str = "tokens") -> ActionResult:
        """Create a new sprite on a table"""
        try:
            table = await self._get_table(table_id)
            if not table:
                return ActionResult(False, f"Table {table_id} not found")
            
            if layer not in LAYERS:
                return ActionResult(False, f"Invalid layer: {layer}")
            
            # Check if sprite already exists by sprite_id
            existing_entity = table.find_entity_by_sprite_id(sprite_id)
            if existing_entity:
                return ActionResult(False, f"Sprite {sprite_id} already exists")
            
            # Convert position to grid coordinates
            grid_x, grid_y = int(position.x), int(position.y)
            
            # Create entity using VirtualTable method
            entity = table.add_entity(
                name=f"sprite_{sprite_id}",
                position=(grid_x, grid_y),
                layer=layer,
                path_to_texture=image_path
            )
            
            if not entity:
                return ActionResult(False, f"Failed to create sprite {sprite_id}")
            
            # Override the auto-generated sprite_id with our provided one
            del table.sprite_to_entity[entity.sprite_id]  # Remove old mapping
            entity.sprite_id = sprite_id
            table.sprite_to_entity[sprite_id] = entity.entity_id  # Add new mapping
            
            action = {
                'type': 'create_sprite',
                'table_id': table_id,
                'sprite_id': sprite_id,
                'position': position,
                'image_path': image_path,
                'layer': layer
            }
            await self._add_to_history(action)
            
            return ActionResult(True, f"Sprite {sprite_id} created on layer {layer}", {
                'sprite_id': sprite_id,
                'position': position,
                'image_path': image_path,
                'layer': layer
            })
        except Exception as e:
            return ActionResult(False, f"Failed to create sprite: {str(e)}")
    
    async def create_sprite_from_data(self, data: Dict[str, Any]) -> ActionResult:
        """Create a sprite from message data"""
        try:
            table_id = data.get('table_id')
            sprite_id = data.get('sprite_id')
            position = Position(data['position']['x'], data['position']['y'])
            image_path = data.get('image_path', '')
            layer = data.get('layer', 'tokens')
            
            return await self.create_sprite(table_id, sprite_id, position, image_path, layer)
        except KeyError as e:
            return ActionResult(False, f"Missing required field: {str(e)}")
        except Exception as e:
            return ActionResult(False, f"Failed to create sprite from message: {str(e)}")
        
    async def delete_sprite(self, table_id: str, sprite_id: str) -> ActionResult:
        """Delete a sprite from a table"""
        try:
            table = await self._get_table(table_id)
            if not table:
                return ActionResult(False, f"Table {table_id} not found")
            
            entity = table.find_entity_by_sprite_id(sprite_id)
            if not entity:
                return ActionResult(False, f"Sprite {sprite_id} not found")
            
            sprite_data = {
                'entity_id': entity.entity_id,
                'sprite_id': entity.sprite_id,
                'name': entity.name,
                'position': entity.position,
                'layer': entity.layer,
                'texture_path': entity.texture_path,
                'scale_x': entity.scale_x,
                'scale_y': entity.scale_y,
                'rotation': getattr(entity, 'rotation', 0.0)
            }
            table.remove_entity(entity.entity_id)
            
            action = {
                'type': 'delete_sprite',
                'table_id': table_id,
                'sprite_id': sprite_id,
                'sprite_data': sprite_data
            }
            await self._add_to_history(action)
            
            return ActionResult(True, f"Sprite {sprite_id} deleted successfully")
        except Exception as e:
            return ActionResult(False, f"Failed to delete sprite: {str(e)}")
    
    async def move_sprite(self, table_id: str, sprite_id: str, old_position: Position, new_position: Position) -> ActionResult:
        """Move sprite to new position"""
        try:
            logger.info(f"Moving sprite {sprite_id} from {old_position} to {new_position} on table {table_id}")
            table = await self._get_table(table_id)
            if not table:
                return ActionResult(False, f"Table {table_id} not found")
            
            entity = table.find_entity_by_sprite_id(sprite_id)
            if not entity:
                return ActionResult(False, f"Sprite {sprite_id} not found")
            
            old_position_entity = Position(entity.position[0], entity.position[1])
            if old_position_entity == old_position:
                logger.warning(f"Sprite position desynchronization detected for {sprite_id}. Expected {old_position}, found {old_position_entity}.")
                #TODO implement desync handling

            
            # Convert position to grid coordinates
            grid_x, grid_y = int(new_position.x), int(new_position.y)
            
            table.move_entity(entity.entity_id, (grid_x, grid_y))
            logger.info(f"Moved sprite {sprite_id} to new position ({entity.entity_id}, {grid_x}, {grid_y})")
            action = {
                'type': 'move_sprite',
                'table_id': table_id,
                'sprite_id': sprite_id,
                'old_position': old_position,
                'new_position': new_position
            }
            await self._add_to_history(action)
            
            return ActionResult(True, f"Sprite {sprite_id} moved to ({position.x}, {position.y})")
        except Exception as e:
            return ActionResult(False, f"Failed to move sprite: {str(e)}")
    
    async def scale_sprite(self, table_id: str, sprite_id: str, scale_x: float, scale_y: float) -> ActionResult:
        """Scale sprite by given factors"""
        try:
            table = await self._get_table(table_id)
            if not table:
                return ActionResult(False, f"Table {table_id} not found")
            
            entity = table.find_entity_by_sprite_id(sprite_id)
            if not entity:
                return ActionResult(False, f"Sprite {sprite_id} not found")
            
            old_scale = (entity.scale_x, entity.scale_y)
            entity.scale_x = scale_x
            entity.scale_y = scale_y
            
            action = {
                'type': 'scale_sprite',
                'table_id': table_id,
                'sprite_id': sprite_id,
                'old_scale': old_scale,
                'new_scale': (scale_x, scale_y)
            }
            await self._add_to_history(action)
            
            return ActionResult(True, f"Sprite {sprite_id} scaled to ({scale_x}, {scale_y})")
        except Exception as e:
            return ActionResult(False, f"Failed to scale sprite: {str(e)}")
    
    async def rotate_sprite(self, table_id: str, sprite_id: str, angle: float) -> ActionResult:
        """Rotate sprite by given angle"""
        try:
            table = await self._get_table(table_id)
            if not table:
                return ActionResult(False, f"Table {table_id} not found")
            
            entity = table.find_entity_by_sprite_id(sprite_id)
            if not entity:
                return ActionResult(False, f"Sprite {sprite_id} not found")
            
            # Add rotation attribute if it doesn't exist
            if not hasattr(entity, 'rotation'):
                entity.rotation = 0.0
            
            old_rotation = entity.rotation
            entity.rotation = angle
            
            action = {
                'type': 'rotate_sprite',
                'table_id': table_id,
                'sprite_id': sprite_id,
                'old_rotation': old_rotation,
                'new_rotation': angle
            }
            await self._add_to_history(action)
            
            return ActionResult(True, f"Sprite {sprite_id} rotated to {angle} degrees")
        except Exception as e:
            return ActionResult(False, f"Failed to rotate sprite: {str(e)}")
    
    async def update_sprite(self, table_id: str, sprite_id: str, **kwargs) -> ActionResult:
        """Update sprite properties"""
        try:
            table = await self._get_table(table_id)
            if not table:
                return ActionResult(False, f"Table {table_id} not found")
            
            entity = table.find_entity_by_sprite_id(sprite_id)
            if not entity:
                return ActionResult(False, f"Sprite {sprite_id} not found")
            
            old_values = {}
            for key, value in kwargs.items():
                if hasattr(entity, key):
                    old_values[key] = getattr(entity, key)
                    setattr(entity, key, value)
            
            action = {
                'type': 'update_sprite',
                'table_id': table_id,
                'sprite_id': sprite_id,
                'old_values': old_values,
                'new_values': kwargs
            }
            await self._add_to_history(action)
            
            return ActionResult(True, f"Sprite {sprite_id} updated successfully", kwargs)
        except Exception as e:
            return ActionResult(False, f"Failed to update sprite: {str(e)}")
    
    # Layer Actions
    async def set_layer_visibility(self, table_id: str, layer: str, visible: bool) -> ActionResult:
        """Set layer visibility"""
        try:
            table = await self._get_table(table_id)
            if not table:
                return ActionResult(False, f"Table {table_id} not found")
            
            if layer not in LAYERS:
                return ActionResult(False, f"Invalid layer: {layer}")
            
            # Add layer_visibility attribute if it doesn't exist
            if not hasattr(table, 'layer_visibility'):
                table.layer_visibility = {l: True for l in LAYERS.keys()}
            
            old_visibility = table.layer_visibility.get(layer, True)
            table.layer_visibility[layer] = visible
            
            action = {
                'type': 'set_layer_visibility',
                'table_id': table_id,
                'layer': layer,
                'old_visibility': old_visibility,
                'new_visibility': visible
            }
            await self._add_to_history(action)
            
            return ActionResult(True, f"Layer {layer} visibility set to {visible}")
        except Exception as e:
            return ActionResult(False, f"Failed to set layer visibility: {str(e)}")
    
    async def get_layer_visibility(self, table_id: str, layer: str) -> ActionResult:
        """Get layer visibility status"""
        try:
            table = await self._get_table(table_id)
            if not table:
                return ActionResult(False, f"Table {table_id} not found")
            
            if layer not in LAYERS:
                return ActionResult(False, f"Invalid layer: {layer}")
            
            if not hasattr(table, 'layer_visibility'):
                table.layer_visibility = {l: True for l in LAYERS.keys()}
            
            visibility = table.layer_visibility.get(layer, True)
            return ActionResult(True, f"Layer {layer} visibility: {visibility}", {'visible': visibility})
        except Exception as e:
            return ActionResult(False, f"Failed to get layer visibility: {str(e)}")
    
    async def move_sprite_to_layer(self, table_id: str, sprite_id: str, new_layer: str) -> ActionResult:
        """Move sprite to different layer"""
        try:
            table = await self._get_table(table_id)
            if not table:
                return ActionResult(False, f"Table {table_id} not found")
            
            entity = table.find_entity_by_sprite_id(sprite_id)
            if not entity:
                return ActionResult(False, f"Sprite {sprite_id} not found")
            
            if new_layer not in LAYERS:
                return ActionResult(False, f"Invalid layer: {new_layer}")
            
            old_layer = entity.layer
            
            # Use VirtualTable's move_entity method to change layer
            table.move_entity(entity.entity_id, entity.position, new_layer)
            
            action = {
                'type': 'move_sprite_to_layer',
                'table_id': table_id,
                'sprite_id': sprite_id,
                'old_layer': old_layer,
                'new_layer': new_layer
            }
            await self._add_to_history(action)
            
            return ActionResult(True, f"Sprite {sprite_id} moved from {old_layer} to {new_layer}")
        except Exception as e:
            return ActionResult(False, f"Failed to move sprite to layer: {str(e)}")
    
    async def get_layer_sprites(self, table_id: str, layer: str) -> ActionResult:
        """Get all sprites on a specific layer"""
        try:
            table = await self._get_table(table_id)
            if not table:
                return ActionResult(False, f"Table {table_id} not found")
            
            if layer not in LAYERS:
                return ActionResult(False, f"Invalid layer: {layer}")
            
            sprites = {}
            for entity_id, entity in table.entities.items():
                if entity.layer == layer:
                    sprites[entity.sprite_id] = {
                        'position': Position(entity.position[0], entity.position[1]),
                        'scale': (entity.scale_x, entity.scale_y),
                        'rotation': getattr(entity, 'rotation', 0.0),
                        'image_path': entity.texture_path or '',
                        'layer': entity.layer
                    }
            
            return ActionResult(True, f"Found {len(sprites)} sprites on layer {layer}", {'sprites': sprites})
        except Exception as e:
            return ActionResult(False, f"Failed to get layer sprites: {str(e)}")
    
    # Query Actions
    async def get_table_info(self, table_id: str) -> ActionResult:
        """Get table information"""
        try:
            table = await self._get_table(table_id)
            if not table:
                return ActionResult(False, f"Table {table_id} not found")
            
            info = {
                'table_id': table_id,
                'name': table.name,
                'width': table.width,
                'height': table.height,
                'entity_count': len(table.entities),
                'position': getattr(table, 'position', Position(0, 0)),
                'scale': getattr(table, 'scale', (1.0, 1.0)),
                'layer_visibility': getattr(table, 'layer_visibility', {l: True for l in LAYERS.keys()})
            }
            
            return ActionResult(True, f"Table {table_id} info retrieved", info)
        except Exception as e:
            return ActionResult(False, f"Failed to get table info: {str(e)}")
    
    async def get_sprite_info(self, table_id: str, sprite_id: str) -> ActionResult:
        """Get sprite information"""
        try:
            table = await self._get_table(table_id)
            if not table:
                return ActionResult(False, f"Table {table_id} not found")
            
            entity = table.find_entity_by_sprite_id(sprite_id)
            if not entity:
                return ActionResult(False, f"Sprite {sprite_id} not found")
            
            info = {
                'sprite_id': sprite_id,
                'position': Position(entity.position[0], entity.position[1]),
                'scale': (entity.scale_x, entity.scale_y),
                'rotation': getattr(entity, 'rotation', 0.0),
                'image_path': entity.texture_path or '',
                'layer': entity.layer
            }
            
            return ActionResult(True, f"Sprite {sprite_id} info retrieved", info)
        except Exception as e:
            return ActionResult(False, f"Failed to get sprite info: {str(e)}")
    
    async def get_all_tables(self) -> ActionResult:
        """Get all tables"""
        try:
            tables_info = {}
            for table_id, table in self.tables.items():
                tables_info[table_id] = {
                    'name': table.name,
                    'width': table.width,
                    'height': table.height,
                    'entity_count': len(table.entities)
                }
            
            return ActionResult(True, f"Retrieved {len(tables_info)} tables", {'tables': tables_info})
        except Exception as e:
            return ActionResult(False, f"Failed to get all tables: {str(e)}")
    
    async def get_table_sprites(self, table_id: str, layer: Optional[str] = None) -> ActionResult:
        """Get all sprites on a table, optionally filtered by layer"""
        try:
            table = await self._get_table(table_id)
            if not table:
                return ActionResult(False, f"Table {table_id} not found")
            
            sprites = {}
            for entity_id, entity in table.entities.items():
                if layer is None or entity.layer == layer:
                    sprites[entity.sprite_id] = {
                        'position': Position(entity.position[0], entity.position[1]),
                        'scale': (entity.scale_x, entity.scale_y),
                        'rotation': getattr(entity, 'rotation', 0.0),
                        'image_path': entity.texture_path or '',
                        'layer': entity.layer
                    }
            
            layer_msg = f" on layer {layer}" if layer else ""
            return ActionResult(True, f"Found {len(sprites)} sprites{layer_msg}", {'sprites': sprites})
        except Exception as e:
            return ActionResult(False, f"Failed to get table sprites: {str(e)}")
    
    # Batch Actions
    async def batch_actions(self, actions: List[Dict[str, Any]]) -> ActionResult:
        """Execute multiple actions in a batch"""
        try:
            results = []
            for action in actions:
                action_type = action.get('type')
                params = action.get('params', {})
                
                # Map action types to methods
                method_map = {
                    'create_table': self.create_table,
                    'delete_table': self.delete_table,
                    'update_table': self.update_table,
                    'move_table': self.move_table,
                    'scale_table': self.scale_table,
                    'create_sprite': self.create_sprite,
                    'delete_sprite': self.delete_sprite,
                    'move_sprite': self.move_sprite,
                    'scale_sprite': self.scale_sprite,
                    'rotate_sprite': self.rotate_sprite,
                    'update_sprite': self.update_sprite,
                    'set_layer_visibility': self.set_layer_visibility,
                    'move_sprite_to_layer': self.move_sprite_to_layer
                }
                
                if action_type in method_map:
                    result = await method_map[action_type](**params)
                    results.append(result)
                else:
                    results.append(ActionResult(False, f"Unknown action type: {action_type}"))
            
            success_count = sum(1 for r in results if r.success)
            return ActionResult(True, f"Batch completed: {success_count}/{len(results)} successful", 
                              {'results': results})
        except Exception as e:
            return ActionResult(False, f"Failed to execute batch actions: {str(e)}")
    
    # Undo/Redo Actions
    async def undo_action(self) -> ActionResult:
        """Undo the last action"""
        try:
            if not self.undo_stack:
                return ActionResult(False, "No actions to undo")
            
            action = self.undo_stack.pop()
            self.redo_stack.append(action)
            
            # Implement undo logic based on action type
            # This is a simplified version - full implementation would reverse each action
            return ActionResult(True, f"Undid action: {action.get('type', 'unknown')}")
        except Exception as e:
            return ActionResult(False, f"Failed to undo action: {str(e)}")
    
    async def redo_action(self) -> ActionResult:
        """Redo the last undone action"""
        try:
            if not self.redo_stack:
                return ActionResult(False, "No actions to redo")
            
            action = self.redo_stack.pop()
            self.undo_stack.append(action)
            
            # Implement redo logic based on action type
            return ActionResult(True, f"Redid action: {action.get('type', 'unknown')}")
        except Exception as e:
            return ActionResult(False, f"Failed to redo action: {str(e)}")
    
    # Utility Actions
    async def get_sprite_at_position(self, table_id: str, position: Position, layer: Optional[str] = None) -> ActionResult:
        """Get sprite at specific position"""
        try:
            table = await self._get_table(table_id)
            if not table:
                return ActionResult(False, f"Table {table_id} not found")
            
            # Convert position to grid coordinates
            grid_x, grid_y = int(position.x), int(position.y)
            
            # Check if position is valid
            if not table.is_valid_position((grid_x, grid_y)):
                return ActionResult(True, "Position out of bounds", {'sprite_id': None})
            
            # Check each layer or specific layer
            layers_to_check = [layer] if layer else table.layers
            
            for check_layer in layers_to_check:
                if check_layer in table.grid:
                    entity_id = table.grid[check_layer][grid_y][grid_x]
                    if entity_id is not None:
                        entity = table.entities.get(entity_id)
                        if entity:
                            return ActionResult(True, f"Found sprite {entity.sprite_id} at position", {
                                'sprite_id': entity.sprite_id,
                                'position': Position(entity.position[0], entity.position[1]),
                                'layer': entity.layer
                            })
            
            return ActionResult(True, "No sprite found at position", {'sprite_id': None})
        except Exception as e:
            return ActionResult(False, f"Failed to get sprite at position: {str(e)}")
    
    async def get_sprites_in_area(self, table_id: str, top_left: Position, bottom_right: Position, 
                           layer: Optional[str] = None) -> ActionResult:
        """Get all sprites in a rectangular area"""
        try:
            table = await self._get_table(table_id)
            if not table:
                return ActionResult(False, f"Table {table_id} not found")
            
            sprites_in_area = {}
            
            # Convert positions to grid coordinates
            start_x, start_y = int(top_left.x), int(top_left.y)
            end_x, end_y = int(bottom_right.x), int(bottom_right.y)
            
            # Ensure coordinates are within bounds
            start_x = max(0, min(start_x, table.width - 1))
            start_y = max(0, min(start_y, table.height - 1))
            end_x = max(0, min(end_x, table.width - 1))
            end_y = max(0, min(end_y, table.height - 1))
            
            # Check each position in the area
            for y in range(start_y, end_y + 1):
                for x in range(start_x, end_x + 1):
                    layers_to_check = [layer] if layer else table.layers
                    
                    for check_layer in layers_to_check:
                        if check_layer in table.grid:
                            entity_id = table.grid[check_layer][y][x]
                            if entity_id is not None:
                                entity = table.entities.get(entity_id)
                                if entity and entity.sprite_id not in sprites_in_area:
                                    sprites_in_area[entity.sprite_id] = {
                                        'position': Position(entity.position[0], entity.position[1]),
                                        'layer': entity.layer
                                    }
            
            return ActionResult(True, f"Found {len(sprites_in_area)} sprites in area", {
                'sprites': sprites_in_area
            })
        except Exception as e:
            return ActionResult(False, f"Failed to get sprites in area: {str(e)}")
