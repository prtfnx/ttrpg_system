from typing import Dict, Any, List, Optional, TYPE_CHECKING
from core_table.actions_protocol import ActionsProtocol, ActionResult, Position, LAYERS
import uuid
import copy
import logging
from net.protocol import Message, MessageType
if TYPE_CHECKING:
    from Context import Context
    from ContextTable import ContextTable
    from Sprite import Sprite
    from AssetManager import ClientAssetManager


logger = logging.getLogger(__name__)

class Actions(ActionsProtocol):
    """
    Client-side implementation of ActionsProtocol for game logic.
    Central bus for actions on all entities in game.
    """
    
    def __init__(self, context: 'Context'):
        self.context = context
        self.action_history: List[Dict[str, Any]] = []
        self.undo_stack: List[Dict[str, Any]] = []
        self.redo_stack: List[Dict[str, Any]] = []
        self.max_history = 100
        self.layer_visibility = {layer: True for layer in LAYERS.keys()}
        self.AssetManager: Optional[ClientAssetManager] = None

    def _add_to_history(self, action: Dict[str, Any]):
        """Add action to history for undo/redo functionality"""
        self.action_history.append(action)
        if len(self.action_history) > self.max_history:
            self.action_history.pop(0)
        self.undo_stack.append(action)
        self.redo_stack.clear()
    
    def _get_table_by_id(self, table_id: str) -> Optional['ContextTable']:
        """Get table by ID (using table_id UUID)"""
        return self.context._get_table_by_id(table_id)
    
    def _get_table_by_name(self, name: str) -> Optional['ContextTable']:
        """Get table by name"""
        for table in self.context.list_of_tables:
            if table.name == name:
                return table
        return None
    
    def _find_sprite_in_table(self, table, sprite_id: str):
        """Find sprite directly in a table"""
        for layer, sprite_list in table.dict_of_sprites_list.items():
            for sprite_obj in sprite_list:
                if hasattr(sprite_obj, 'sprite_id') and sprite_obj.sprite_id == sprite_id:
                    return sprite_obj                
        return None
      
    
    # Table Actions
    def _process_table_assets(self, table_data: dict):
        """Process table assets and request downloads for missing assets"""
        try:
            layers = table_data.get('layers', {})
            
            for layer_name, layer_entities in layers.items():
                if not isinstance(layer_entities, dict):
                    continue
                
                for entity_id, entity_data in layer_entities.items():
                    if not isinstance(entity_data, dict):
                        continue
                    
                    asset_xxhash = entity_data.get('asset_xxhash')
                    asset_id = entity_data.get('asset_id')
                    texture_path = entity_data.get('texture_path')
                    
                    if asset_xxhash and asset_id:
                        # Check if we have this asset cached by xxHash
                        cached_path = self.AssetManager.get_asset_for_sprite_by_xxhash(asset_xxhash)
                        
                        if cached_path:
                            logger.debug(f"Asset {asset_id} found in cache by xxHash: {cached_path}")
                            # Update entity to use cached path
                            entity_data['texture_path'] = cached_path
                        else:                     
                            # Asset not found locally, request download
                            logger.info(f"Asset {asset_id} not found locally, requesting download (xxHash: {asset_xxhash})")
                            self._request_asset_download(asset_id)
                    else:
                        logger.warning(f"Entity {entity_id} missing asset hash information")
                        
        except Exception as e:
            logger.error(f"Error processing table assets: {e}")

    def process_creating_table(self, table_data: dict) -> ActionResult:
        """Process creating a table from a dictionary representation"""
          
        # Process assets before creating the table
        self._process_table_assets(table_data)
        
        result = self.create_table_from_dict(table_data)
        if not result.success:
            logger.error(f"Failed to create table from dict: {table_data}")


    def create_table(self, name: str, width: int, height: int) -> ActionResult:
        """Create a new table"""
        try:
                     
            # Check if table already exists
            if self._get_table_by_name(name):
                logger.info(f"Table with name {name} already exists")
                return ActionResult(False, f"Table with name {name} already exists")              
            # Create new table using Context method - pass table_id to constructor
            table = self.context.add_table(name, width, height, table_id=table_id)
            if not table:
                return ActionResult(False, f"Failed to create table {name}")            
           
            action = {
                'type': 'create_table',
                'table_name': table.name,
                'table_id': table.table_id,
                'name': name,
                'width': width,
                'height': height
            }
            self._add_to_history(action)
            
            return ActionResult(True, f"Table {name} created successfully", {
                'table_id': table.table_id,
                'name': name,
                'width': width,
                'height': height
            })
        except Exception as e:
            logger.error(f"Failed to create table: {e}")
            return ActionResult(False, f"Failed to create table: {str(e)}")
    
    def create_table_from_dict(self, table_dict: Dict[str, Any]) -> ActionResult:
        """Create a table from a dictionary representation"""
        try:
            logger.info(f"Creating table from dict")
            logger.debug(f"Creating table from dict: {table_dict}")
            # Validate required fields
            required_fields = ['table_name', 'width', 'height' ]
            for field in required_fields:
                if field not in table_dict:
                    logger.error(f"Missing required field: {field}")
                    return ActionResult(False, f"Missing required field: {field}")              # Create table using Context method
            table = self.context.create_table_from_dict(table_dict)
            if not table:
                return ActionResult(False, f"Failed to create table {table_dict['name']}")          

            action = {
                'type': 'create_table_from_dict',
                'table_data': copy.deepcopy(table_dict)
            }
            self._add_to_history(action)
            
            return ActionResult(True, f"Table {table.name} created successfully", {
                'table': table
            })
        except Exception as e:
            logger.error(f"Failed to create table from dict: {e}")
            return ActionResult(False, f"Failed to create table from dict: {str(e)}")
    def get_table(self, table_id: str) -> ActionResult:
        """Get a table by ID"""
        try:
            table = self._get_table_by_id(table_id)
            if not table:
                return ActionResult(False, f"Table {table_id} not found")

            return ActionResult(True, f"Table {table_id} retrieved", {'table': table})
        except Exception as e:
            logger.error(f"Failed to get table {table_id}: {e}")
            return ActionResult(False, f"Failed to get table: {str(e)}")
    
    def delete_table(self, table_id: str) -> ActionResult:
        """Delete a table"""
        try:
            table = self._get_table_by_id(table_id)
            if not table:
                return ActionResult(False, f"Table {table_id} not found")
            
            # Store table data for undo
            table_data = {
                'name': table.name,
                'width': table.width,
                'height': table.height,
                'scale': table.scale,
                'x_moved': table.x_moved,
                'y_moved': table.y_moved
            }
            
            # Clean up table resources
            self.context.cleanup_table(table)
            
            # Remove from list of tables
            self.context.list_of_tables.remove(table)
            
            # Update current table if it was deleted
            if self.context.current_table == table:
                self.context.current_table = self.context.list_of_tables[0] if self.context.list_of_tables else None
            
            action = {
                'type': 'delete_table',
                'table_id': table_id,
                'table_data': table_data
            }
            self._add_to_history(action)
            
            return ActionResult(True, f"Table {table_id} deleted successfully")
        except Exception as e:
            return ActionResult(False, f"Failed to delete table: {str(e)}")
    
    def update_table(self, table_id: str, **kwargs) -> ActionResult:
        """Update table properties"""
        try:
            table = self._get_table_by_id(table_id)
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
            self._add_to_history(action)
            
            return ActionResult(True, f"Table {table_id} updated successfully", kwargs)
        except Exception as e:
            return ActionResult(False, f"Failed to update table: {str(e)}")
    
    def move_table(self, table_id: str, position: Position) -> ActionResult:
        """Move table to new position"""
        try:
            table = self._get_table_by_id(table_id)
            if not table:
                return ActionResult(False, f"Table {table_id} not found")
            
            old_position = (table.x_moved, table.y_moved)
            table.move_table(position.x - table.x_moved, position.y - table.y_moved)
            
            action = {
                'type': 'move_table',
                'table_id': table_id,
                'old_position': old_position,
                'new_position': (position.x, position.y)
            }
            self._add_to_history(action)
            
            return ActionResult(True, f"Table {table_id} moved to ({position.x}, {position.y})")
        except Exception as e:
            return ActionResult(False, f"Failed to move table: {str(e)}")
    
    def scale_table(self, table_id: str, scale_x: float, scale_y: float) -> ActionResult:
        """Scale table by given factors"""
        try:
            table = self._get_table_by_id(table_id)
            if not table:
                return ActionResult(False, f"Table {table_id} not found")
            
            old_scale = table.scale
            table.scale = scale_x  # Assuming uniform scaling
            
            action = {
                'type': 'scale_table',
                'table_id': table_id,
                'old_scale': old_scale,
                'new_scale': scale_x
            }
            self._add_to_history(action)
            
            return ActionResult(True, f"Table {table_id} scaled to {scale_x}")
        except Exception as e:
            return ActionResult(False, f"Failed to scale table: {str(e)}")
    
    # Sprite Actions
    def create_sprite(self, table_id: str,  position: Position, 
                     image_path: str, layer: str = "tokens", **kwargs) -> ActionResult:
        """Create a new sprite on a table"""
        try:
            table = self._get_table_by_id(table_id)
            if not table:
                return ActionResult(False, f"Table {table_id} not found")
            if layer not in LAYERS:
                return ActionResult(False, f"Invalid layer: {layer}")
            
            sprite_id = str(uuid.uuid4())[:8]  # Generate unique sprite ID
            # Create sprite using Context method
            sprite = self.context.add_sprite(
                texture_path=image_path.encode() if isinstance(image_path, str) else image_path,
                layer=layer,
                table=table,
                coord_x=position.x,
                coord_y=position.y,                
                sprite_id=sprite_id,
                **kwargs
            )
            # Start io operations to load asset texture
            if self.AssetManager and sprite:
                logger.info(f"Loading asset for sprite {sprite_id} from {image_path}")    
                self.AssetManager.load_asset_for_sprite(sprite, image_path)
            if not sprite:
                return ActionResult(False, f"Failed to create sprite {sprite_id} with path {image_path}")
            
            action = {
                'sprite_id': sprite_id,
                'type': 'create_sprite',
                'table_id': table_id,                
                'position': position,
                'image_path': image_path,
                'layer': layer
            }
            self._add_to_history(action)
            
            return ActionResult(True, f"Sprite {sprite_id} created on layer {layer}", {
                'sprite_id': sprite_id,
                'position': position,
                'image_path': image_path,
                'layer': layer
            })
        except Exception as e:
            return ActionResult(False, f"Failed to create sprite: {str(e)}")
    def delete_sprite(self, table_id: str, sprite_id: str) -> ActionResult:
        """Delete a sprite from a table"""
        try:
            table = self._get_table_by_id(table_id)
            if not table:
                return ActionResult(False, f"Table {table_id} not found")
            
            sprite = self._find_sprite_in_table(table, sprite_id)
            if not sprite:
                return ActionResult(False, f"Sprite {sprite_id} not found")
            
            # Store sprite data for undo
            sprite_data = {
                'id': sprite_id,
                'table_id': table_id,
                'position': (sprite.coord_x.value, sprite.coord_y.value),
                'texture_path': sprite.texture_path,
                'layer': sprite.layer,
                'scale': (sprite.scale_x, sprite.scale_y)
            }
            
            # Remove sprite using Context method
            success = self.context.remove_sprite(sprite, table)
            if not success:
                return ActionResult(False, f"Failed to remove sprite {sprite_id}")
            
            action = {
                'type': 'delete_sprite',
                'table_id': table_id,
                'sprite_id': sprite_id,
                'sprite_data': sprite_data
            }
            self._add_to_history(action)
            
            return ActionResult(True, f"Sprite {sprite_id} deleted successfully")
        except Exception as e:
            return ActionResult(False, f"Failed to delete sprite: {str(e)}")
    
    def move_sprite(self, table_id: str, sprite_id: str, position: Position) -> ActionResult:
        """Move sprite to new position"""
        try:
            table = self._get_table_by_id(table_id)
            if not table:
                return ActionResult(False, f"Table {table_id} not found")
            sprite = self._find_sprite_in_table(table, sprite_id)
            if not sprite:
                return ActionResult(False, f"Sprite {sprite_id} not found")
            
            old_position = (sprite.coord_x.value, sprite.coord_y.value)
            sprite.coord_x.value = position.x
            sprite.coord_y.value = position.y
            
            action = {
                'type': 'move_sprite',
                'table_id': table_id,
                'sprite_id': sprite_id,
                'old_position': old_position,
                'new_position': (position.x, position.y)
            }
            self._add_to_history(action)
            
            return ActionResult(True, f"Sprite {sprite_id} moved to ({position.x}, {position.y})")
        except Exception as e:
            return ActionResult(False, f"Failed to move sprite: {str(e)}")
    
    def scale_sprite(self, table_id: str, sprite_id: str, scale_x: float, scale_y: float) -> ActionResult:
        """Scale sprite by given factors"""
        try:
            table = self._get_table_by_id(table_id)
            if not table:
                return ActionResult(False, f"Table {table_id} not found")
            sprite = self._find_sprite_in_table(table, sprite_id)
            if not sprite:
                return ActionResult(False, f"Sprite {sprite_id} not found")
            
            old_scale = (sprite.scale_x, sprite.scale_y)
            sprite.scale_x = scale_x
            sprite.scale_y = scale_y
            
            action = {
                'type': 'scale_sprite',
                'table_id': table_id,
                'sprite_id': sprite_id,
                'old_scale': old_scale,
                'new_scale': (scale_x, scale_y)
            }
            self._add_to_history(action)
            
            return ActionResult(True, f"Sprite {sprite_id} scaled to ({scale_x}, {scale_y})")
        except Exception as e:
            return ActionResult(False, f"Failed to scale sprite: {str(e)}")
    
    def rotate_sprite(self, table_id: str, sprite_id: str, angle: float) -> ActionResult:
        """Rotate sprite by given angle"""
        try:
            table = self._get_table_by_id(table_id)
            if not table:
                return ActionResult(False, f"Table {table_id} not found")
            sprite = self._find_sprite_in_table(table, sprite_id)
            if not sprite:
                return ActionResult(False, f"Sprite {sprite_id} not found")
            
            # Note: Sprite class doesn't have rotation attribute, so we'll add it
            old_rotation = getattr(sprite, 'rotation', 0.0)
            sprite.rotation = angle
            
            action = {
                'type': 'rotate_sprite',
                'table_id': table_id,
                'sprite_id': sprite_id,
                'old_rotation': old_rotation,
                'new_rotation': angle
            }
            self._add_to_history(action)
            
            return ActionResult(True, f"Sprite {sprite_id} rotated to {angle} degrees")
        except Exception as e:
            return ActionResult(False, f"Failed to rotate sprite: {str(e)}")
    
    def update_sprite(self, table_id: str, sprite_id: str, **kwargs) -> ActionResult:
        """Update sprite properties"""
        try:
            table = self._get_table_by_id(table_id)
            if not table:
                return ActionResult(False, f"Table {table_id} not found")
            sprite = self._find_sprite_in_table(table, sprite_id)
            if not sprite:
                return ActionResult(False, f"Sprite {sprite_id} not found")
            
            old_values = {}
            for key, value in kwargs.items():
                if hasattr(sprite, key):
                    old_values[key] = getattr(sprite, key)
                    setattr(sprite, key, value)
            
            action = {
                'type': 'update_sprite',
                'table_id': table_id,
                'sprite_id': sprite_id,
                'old_values': old_values,
                'new_values': kwargs
            }
            self._add_to_history(action)
            
            return ActionResult(True, f"Sprite {sprite_id} updated successfully", kwargs)
        except Exception as e:
            return ActionResult(False, f"Failed to update sprite: {str(e)}")
    
    # Layer Actions
    def set_layer_visibility(self, table_id: str, layer: str, visible: bool) -> ActionResult:
        """Set layer visibility"""
        try:
            table = self._get_table_by_id(table_id)
            if not table:
                return ActionResult(False, f"Table {table_id} not found")
            
            if layer not in LAYERS:
                return ActionResult(False, f"Invalid layer: {layer}")
            
            old_visibility = self.layer_visibility.get(layer, True)
            self.layer_visibility[layer] = visible
            
            # Update sprites visibility based on layer
            if layer in table.dict_of_sprites_list:
                for sprite in table.dict_of_sprites_list[layer]:
                    if hasattr(sprite, 'visible'):
                        sprite.visible = visible
            
            action = {
                'type': 'set_layer_visibility',
                'table_id': table_id,
                'layer': layer,
                'old_visibility': old_visibility,
                'new_visibility': visible
            }
            self._add_to_history(action)
            
            return ActionResult(True, f"Layer {layer} visibility set to {visible}")
        except Exception as e:
            return ActionResult(False, f"Failed to set layer visibility: {str(e)}")
    
    def get_layer_visibility(self, table_id: str, layer: str) -> ActionResult:
        """Get layer visibility status"""
        try:
            if layer not in LAYERS:
                return ActionResult(False, f"Invalid layer: {layer}")
            
            visibility = self.layer_visibility.get(layer, True)
            return ActionResult(True, f"Layer {layer} visibility: {visibility}", {'visible': visibility})
        except Exception as e:
            return ActionResult(False, f"Failed to get layer visibility: {str(e)}")
    
    def move_sprite_to_layer(self, table_id: str, sprite_id: str, new_layer: str) -> ActionResult:
        """Move sprite to different layer"""
        try:
            table = self._get_table_by_id(table_id)
            if not table:
                return ActionResult(False, f"Table {table_id} not found")
            
            if new_layer not in LAYERS:
                return ActionResult(False, f"Invalid layer: {new_layer}")
            sprite = self._find_sprite_in_table(table, sprite_id)
            if not sprite:
                return ActionResult(False, f"Sprite {sprite_id} not found")
            
            old_layer = sprite.layer
            
            # Remove from old layer
            if old_layer in table.dict_of_sprites_list:
                if sprite in table.dict_of_sprites_list[old_layer]:
                    table.dict_of_sprites_list[old_layer].remove(sprite)
            
            # Add to new layer
            sprite.layer = new_layer
            if new_layer in table.dict_of_sprites_list:
                table.dict_of_sprites_list[new_layer].append(sprite)
            
            # Update visibility based on new layer
            if hasattr(sprite, 'visible'):
                sprite.visible = self.layer_visibility.get(new_layer, True)
            
            action = {
                'type': 'move_sprite_to_layer',
                'table_id': table_id,
                'sprite_id': sprite_id,
                'old_layer': old_layer,
                'new_layer': new_layer
            }
            self._add_to_history(action)
            
            return ActionResult(True, f"Sprite {sprite_id} moved from {old_layer} to {new_layer}")
        except Exception as e:
            return ActionResult(False, f"Failed to move sprite to layer: {str(e)}")
    
    def get_layer_sprites(self, table_id: str, layer: str) -> ActionResult:
        """Get all sprites on a specific layer"""
        try:
            table = self._get_table_by_id(table_id)
            if not table:
                return ActionResult(False, f"Table {table_id} not found")
            
            if layer not in LAYERS:
                return ActionResult(False, f"Invalid layer: {layer}")
            
            sprites = {}
            if layer in table.dict_of_sprites_list:
                for sprite in table.dict_of_sprites_list[layer]:
                    sprites[sprite.sprite_id] = {
                        'position': Position(sprite.coord_x.value, sprite.coord_y.value),
                        'scale': (sprite.scale_x, sprite.scale_y),
                        'rotation': getattr(sprite, 'rotation', 0.0),
                        'image_path': sprite.texture_path,
                        'layer': layer
                    }
            
            return ActionResult(True, f"Found {len(sprites)} sprites on layer {layer}", {'sprites': sprites})
        except Exception as e:
            return ActionResult(False, f"Failed to get layer sprites: {str(e)}")
    
    # Query Actions
    def get_table_info(self, table_id: str) -> ActionResult:
        """Get table information"""
        try:
            table = self._get_table_by_id(table_id)
            if not table:
                return ActionResult(False, f"Table {table_id} not found")
            
            # Count sprites in all layers
            sprite_count = sum(len(sprites) for sprites in table.dict_of_sprites_list.values())
            
            info = {
                'table_id': table_id,
                'name': table.name,
                'width': table.width,
                'height': table.height,
                'sprite_count': sprite_count,
                'position': (table.x_moved, table.y_moved),
                'scale': table.scale,
                'show_grid': table.show_grid,
                'cell_side': table.cell_side
            }
            
            return ActionResult(True, f"Table {table_id} info retrieved", info)
        except Exception as e:
            return ActionResult(False, f"Failed to get table info: {str(e)}")
    def get_sprite_info(self, table_id: str, sprite_id: str) -> ActionResult:
        """Get sprite information"""
        try:
            table = self._get_table_by_id(table_id)
            if not table:
                return ActionResult(False, f"Table {table_id} not found")
            
            # Search directly in the table's sprite lists to avoid ID lookup issues
            sprite = None
            for layer, sprite_list in table.dict_of_sprites_list.items():
                for sprite_obj in sprite_list:
                    if hasattr(sprite_obj, 'sprite_id') and sprite_obj.sprite_id == sprite_id:
                        sprite = sprite_obj
                        break
                if sprite:
                    break
            
            if not sprite:
                return ActionResult(False, f"Sprite {sprite_id} not found")
            
            info = {
                'sprite_id': sprite_id,
                'position': Position(sprite.coord_x.value, sprite.coord_y.value),
                'scale': (sprite.scale_x, sprite.scale_y),
                'rotation': getattr(sprite, 'rotation', 0.0),
                'image_path': sprite.texture_path,
                'layer': sprite.layer,
                'visible': getattr(sprite, 'visible', True)
            }
            
            return ActionResult(True, f"Sprite {sprite_id} info retrieved", info)
        except Exception as e:
            return ActionResult(False, f"Failed to get sprite info: {str(e)}")
    
    def get_all_tables(self) -> ActionResult:
        """Get all tables"""
        try:
            tables_info = {}
            for table in self.context.list_of_tables:
                sprite_count = sum(len(sprites) for sprites in table.dict_of_sprites_list.values())
                tables_info[table.name] = {
                    'name': table.name,
                    'width': table.width,
                    'height': table.height,
                    'sprite_count': sprite_count
                }
            
            return ActionResult(True, f"Retrieved {len(tables_info)} tables", {'tables': tables_info})
        except Exception as e:
            return ActionResult(False, f"Failed to get all tables: {str(e)}")
    
    def get_table_sprites(self, table_id: str, layer: Optional[str] = None) -> ActionResult:
        """Get all sprites on a table, optionally filtered by layer"""
        try:
            table = self._get_table_by_id(table_id)
            if not table:
                return ActionResult(False, f"Table {table_id} not found")
            
            sprites = {}
            layers_to_check = [layer] if layer else table.dict_of_sprites_list.keys()
            
            for layer_name in layers_to_check:
                if layer_name in table.dict_of_sprites_list:
                    for sprite in table.dict_of_sprites_list[layer_name]:
                        sprites[sprite.sprite_id] = {
                            'position': Position(sprite.coord_x.value, sprite.coord_y.value),
                            'scale': (sprite.scale_x, sprite.scale_y),
                            'rotation': getattr(sprite, 'rotation', 0.0),
                            'image_path': sprite.texture_path,
                            'layer': sprite.layer,
                            'visible': getattr(sprite, 'visible', True)
                        }
            
            layer_msg = f" on layer {layer}" if layer else ""
            return ActionResult(True, f"Found {len(sprites)} sprites{layer_msg}", {'sprites': sprites})
        except Exception as e:
            return ActionResult(False, f"Failed to get table sprites: {str(e)}")
    
    # Batch Actions
    def batch_actions(self, actions: List[Dict[str, Any]]) -> ActionResult:
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
                    result = method_map[action_type](**params)
                    results.append(result)
                else:
                    results.append(ActionResult(False, f"Unknown action type: {action_type}"))
            
            success_count = sum(1 for r in results if r.success)
            return ActionResult(True, f"Batch completed: {success_count}/{len(results)} successful", 
                              {'results': results})
        except Exception as e:
            return ActionResult(False, f"Failed to execute batch actions: {str(e)}")
    
    # Undo/Redo Actions
    def undo_action(self) -> ActionResult:
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
    
    def redo_action(self) -> ActionResult:
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
    def get_sprite_at_position(self, table_id: str, position: Position, layer: Optional[str] = None) -> ActionResult:
        """Get sprite at specific position"""
        try:
            table = self._get_table_by_id(table_id)
            if not table:
                return ActionResult(False, f"Table {table_id} not found")
            
            layers_to_check = [layer] if layer else table.dict_of_sprites_list.keys()
            
            for layer_name in layers_to_check:
                if layer_name in table.dict_of_sprites_list:
                    for sprite in table.dict_of_sprites_list[layer_name]:
                        # Simple collision detection
                        sprite_size = 32  # Default sprite size
                        if (sprite.coord_x.value <= position.x <= sprite.coord_x.value + sprite_size and
                            sprite.coord_y.value <= position.y <= sprite.coord_y.value + sprite_size):
                            return ActionResult(True, f"Found sprite {sprite.sprite_id} at position", {
                                'sprite_id': sprite.sprite_id,
                                'position': Position(sprite.coord_x.value, sprite.coord_y.value),
                                'layer': sprite.layer
                            })
            
            return ActionResult(True, "No sprite found at position", {'sprite_id': None})
        except Exception as e:
            return ActionResult(False, f"Failed to get sprite at position: {str(e)}")
    
    def get_sprites_in_area(self, table_id: str, top_left: Position, bottom_right: Position, 
                           layer: Optional[str] = None) -> ActionResult:
        """Get all sprites in a rectangular area"""
        try:
            table = self._get_table_by_id(table_id)
            if not table:
                return ActionResult(False, f"Table {table_id} not found")
            
            sprites_in_area = {}
            layers_to_check = [layer] if layer else table.dict_of_sprites_list.keys()
            
            for layer_name in layers_to_check:
                if layer_name in table.dict_of_sprites_list:
                    for sprite in table.dict_of_sprites_list[layer_name]:
                        # Check if sprite is within the rectangular area
                        if (top_left.x <= sprite.coord_x.value <= bottom_right.x and
                            top_left.y <= sprite.coord_y.value <= bottom_right.y):
                            sprites_in_area[sprite.sprite_id] = {
                                'position': Position(sprite.coord_x.value, sprite.coord_y.value),
                                'layer': sprite.layer
                            }
            
            return ActionResult(True, f"Found {len(sprites_in_area)} sprites in area", {
                'sprites': sprites_in_area
            })
        except Exception as e:
            return ActionResult(False, f"Failed to get sprites in area: {str(e)}")
    def ask_for_table(self, table_name):
        """Request a specific table from the server"""
        if not hasattr(self.context, 'protocol') or not self.context.protocol:
            logger.error("No protocol available to request table")
            return ActionResult(False, "No protocol available to request table")
            
        msg = Message(MessageType.TABLE_REQUEST, {'table_name': table_name},
                     getattr(self.context.protocol, 'client_id', 'unknown'))
        
        try:
            if hasattr(self.context.protocol, 'send'):
                self.context.protocol.send(msg.to_json())
                
            logger.info(f"Requested new table: {table_name}")
            return ActionResult(True, f"Requested table: {table_name}")
            
        except Exception as e:
            logger.error(f"Failed to request table: {e}")
            return ActionResult(False, f"Failed to request table: {str(e)}")
    
    def handle_file_loaded(self, operation_id: str, filename: str, data: Any) -> ActionResult:
        """Handle successful file load operation"""
        try:
            filetype = filename.split('.')[-1].lower() if filename and '.' in filename else None
            
            if filetype in {'jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'tiff'}:
                # Handle image file loading
                if not self.AssetManager:
                    logger.error("AssetManager not initialized, cannot handle image load operation")
                    return ActionResult(False, "AssetManager not initialized")
                
                logger.info(f"Loading image file: {filename}")
                self.AssetManager.handle_load_file(operation_id, filename, data)
                logger.info(f"Image file loaded: {filename}")
                
            elif filetype in {'json', 'txt', 'csv', 'yaml', 'yml'}:
                # Handle text/data file loading
                self._handle_text_file_loaded(operation_id, filename, data, filetype)
                logger.info(f"Text file loaded: {filename}")
                
            else:
                # Handle binary/unknown file types
                logger.info(f"Binary file loaded: {filename} ({len(data) if data else 0} bytes)")
            
            action = {
                'type': 'file_loaded',
                'operation_id': operation_id,
                'filename': filename,
                'filetype': filetype
            }
            self._add_to_history(action)
            
            return ActionResult(True, f"File loaded successfully: {filename}")
            
        except Exception as e:
            logger.error(f"Error handling file load for {filename}: {e}")
            return ActionResult(False, f"Error handling file load: {str(e)}")
    
    def handle_file_saved(self, operation_id: str, filename: str) -> ActionResult:
        """Handle successful file save operation"""
        try:
            logger.info(f"File saved successfully: {filename}")
            
            # Update any UI elements or caches that depend on this file
            if filename.endswith('.json'):
                # Handle config or save file updates
                self._handle_config_file_saved(filename)
            
            action = {
                'type': 'file_saved',
                'operation_id': operation_id,
                'filename': filename
            }
            self._add_to_history(action)
            
            return ActionResult(True, f"File saved successfully: {filename}")
            
        except Exception as e:
            logger.error(f"Error handling file save for {filename}: {e}")
            return ActionResult(False, f"Error handling file save: {str(e)}")
    
    def handle_file_list(self, operation_id: str, file_list: List[str]) -> ActionResult:
        """Handle successful file list operation"""
        try:
            logger.info(f"File list retrieved: {len(file_list)} files")
            
            # Process file list for UI or cache updates
            if hasattr(self.context, 'file_browser'):
                self.context.file_browser.update_file_list(file_list)
            
            action = {
                'type': 'file_list',
                'operation_id': operation_id,
                'file_count': len(file_list)
            }
            self._add_to_history(action)
            
            return ActionResult(True, f"File list retrieved: {len(file_list)} files")
            
        except Exception as e:
            logger.error(f"Error handling file list: {e}")
            return ActionResult(False, f"Error handling file list: {str(e)}")
    
    def handle_file_operation_error(self, operation_id: str, operation_type: str, error_msg: str) -> ActionResult:
        """Handle failed file operation"""
        try:
            logger.error(f"File operation failed - Type: {operation_type}, ID: {operation_id}, Error: {error_msg}")
            
            # Handle specific error types
            if "not found" in error_msg.lower():
                self._handle_file_not_found_error(operation_id, operation_type, error_msg)
            elif "permission" in error_msg.lower():
                self._handle_permission_error(operation_id, operation_type, error_msg)
            else:
                self._handle_generic_file_error(operation_id, operation_type, error_msg)
            
            action = {
                'type': 'file_operation_error',
                'operation_id': operation_id,
                'operation_type': operation_type,
                'error': error_msg
            }
            self._add_to_history(action)
            
            return ActionResult(False, f"File operation failed: {error_msg}")
            
        except Exception as e:
            logger.error(f"Error handling file operation error: {e}")
            return ActionResult(False, f"Error handling file operation error: {str(e)}")
    
    def _handle_text_file_loaded(self, operation_id: str, filename: str, data: Any, filetype: str):
        """Handle loaded text files (JSON, TXT, CSV, etc.)"""
        try:
            if filetype == 'json':
                # Handle JSON configuration or save files
                if 'config' in filename.lower():
                    self._apply_config_data(data)
                elif 'save' in filename.lower():
                    self._apply_save_data(data)
                elif 'table' in filename.lower():
                    self._load_table_data(data)
                    
            elif filetype in {'txt', 'log'}:
                # Handle text/log files
                if hasattr(self.context, 'log_viewer'):
                    self.context.log_viewer.display_content(data)
                    
            elif filetype == 'csv':
                # Handle CSV data files
                self._process_csv_data(filename, data)
                
        except Exception as e:
            logger.error(f"Error processing text file {filename}: {e}")
    
    def _handle_config_file_saved(self, filename: str):
        """Handle configuration file save completion"""
        try:
            if 'settings' in filename.lower() or 'config' in filename.lower():
                logger.info("Configuration saved - applying any pending changes")
                # Trigger any configuration reload if needed
                if hasattr(self.context, 'reload_config'):
                    self.context.reload_config()
                    
        except Exception as e:
            logger.error(f"Error handling config file save: {e}")
    
    def _handle_file_not_found_error(self, operation_id: str, operation_type: str, error_msg: str):
        """Handle file not found errors"""
        try:
            if operation_type == 'load':
                # Try to create default file or prompt user
                logger.warning(f"File not found for operation {operation_id} - consider creating default")
                
        except Exception as e:
            logger.error(f"Error handling file not found: {e}")
    
    def _handle_permission_error(self, operation_id: str, operation_type: str, error_msg: str):
        """Handle permission errors"""
        try:
            logger.error(f"Permission denied for {operation_type} operation {operation_id}")
            # Could trigger permission request or fallback location
            
        except Exception as e:
            logger.error(f"Error handling permission error: {e}")
    
    def _handle_generic_file_error(self, operation_id: str, operation_type: str, error_msg: str):
        """Handle other file operation errors"""
        try:
            logger.error(f"Generic file error for {operation_type} operation {operation_id}: {error_msg}")
            # Could trigger retry mechanism or user notification
            
        except Exception as e:
            logger.error(f"Error handling generic file error: {e}")
    
    def _apply_config_data(self, config_data: Dict[str, Any]):
        """Apply loaded configuration data"""
        try:
            if hasattr(self.context, 'apply_settings'):
                self.context.apply_settings(config_data)
            logger.info("Configuration data applied")
            
        except Exception as e:
            logger.error(f"Error applying config data: {e}")
    
    def _apply_save_data(self, save_data: Dict[str, Any]):
        """Apply loaded save game data"""
        try:
            # Process save game data
            logger.info("Save data loaded - applying to game state")
            
        except Exception as e:
            logger.error(f"Error applying save data: {e}")
    
    def _load_table_data(self, table_data: Dict[str, Any]):
        """Load table data from file"""
        try:
            result = self.create_table_from_dict(table_data)
            if result.success:
                logger.info(f"Table loaded from file: {table_data.get('table_name', 'unknown')}")
            else:
                logger.error(f"Failed to load table from file: {result.message}")
                
        except Exception as e:
            logger.error(f"Error loading table data: {e}")
    
    def _process_csv_data(self, filename: str, csv_data: str):
        """Process CSV data"""
        try:
            # Handle CSV data processing
            logger.info(f"Processing CSV data from {filename}")
            
        except Exception as e:
            logger.error(f"Error processing CSV data: {e}")
    
    def handle_completed_io_operations(self, operations: list[Dict[str, Any]]) -> ActionResult:
        """Legacy handler - delegates to specific handlers"""
        try:
            for operation in operations:
                op_type = operation.get('type')
                operation_id = operation.get('operation_id', 'unknown')
                success = operation.get('success', False)
                
                if success:
                    if op_type == 'load':
                        filename = operation.get('filename', '')
                        data = operation.get('data')
                        if filename and data is not None:
                            self.handle_file_loaded(operation_id, filename, data)
                        else:
                            logger.warning(f"Incomplete load operation data: {operation}")
                            
                    elif op_type == 'save':
                        filename = operation.get('filename', '')
                        if filename:
                            self.handle_file_saved(operation_id, filename)
                        else:
                            logger.warning(f"Incomplete save operation data: {operation}")
                            
                    elif op_type == 'list':
                        file_list = operation.get('data', [])
                        self.handle_file_list(operation_id, file_list)
                        
                else:
                    # Handle failed operations
                    error_msg = operation.get('error', 'Unknown error')
                    self.handle_file_operation_error(operation_id, op_type, error_msg)
            
            return ActionResult(True, f"Processed {len(operations)} I/O operations")
            
        except Exception as e:
            logger.error(f"Error in handle_completed_io_operations: {e}")
            return ActionResult(False, f"Error processing I/O operations: {str(e)}")
    
