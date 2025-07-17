import ctypes
from typing import Dict, Any, List, Optional, TYPE_CHECKING
from core_table.actions_protocol import ActionsProtocol, ActionResult, Position, LAYERS
import uuid
import copy
import os
import time
from pathlib import Path
from net.protocol import Message, MessageType
from logger import setup_logger
if TYPE_CHECKING:
    from Context import Context
    from ContextTable import ContextTable
    from Sprite import Sprite
    from AssetManager import ClientAssetManager




logger = setup_logger(__name__)

class Actions(ActionsProtocol):
    """
    Client-side implementation of ActionsProtocol for game logic.
    Central command bus for all game operations in the TTRPG system.
    
    This class follows a layered architecture pattern:
    1. Public API methods (create, read, update, delete operations)
    2. Internal utility methods (prefixed with _)
    3. Event handlers for async operations
    4. Protocol message handlers for network communication
    
    Architecture Notes:
    - AssetManager owns StorageManager and DownloadManager
    - ClientProtocol is messaging-only, delegates to Actions
    - All I/O operations use unified completion queues
    - Actions serves as central command bus for all game logic
    - Enhanced with server communication support for all sprite and table operations
    
    Function Index by Category:
    
    ═══════════════════════════════════════════════════════════════════════════════
    INITIALIZATION & CORE UTILITIES
    ═══════════════════════════════════════════════════════════════════════════════
    - __init__(context) -> Initialize Actions with context and settings
    - _add_to_history(action) -> Add action to undo/redo history
    - _get_table_by_id(table_id) -> Find table by UUID
    - _get_table_by_name(name) -> Find table by name  
    - _find_sprite_in_table(table, sprite_id) -> Find sprite in table
    
    ═══════════════════════════════════════════════════════════════════════════════
    TABLE MANAGEMENT (CRUD OPERATIONS)
    ═══════════════════════════════════════════════════════════════════════════════
    - create_table(name, width, height) -> Create new table with dimensions
    - create_table_from_dict(table_dict) -> Create table from dictionary data
    - process_creating_table(table_data) -> Create table with asset processing
    - get_table(table_id) -> Retrieve table by ID
    - update_table(table_id, to_server=True, **kwargs) -> Update table properties [WITH SERVER SYNC]
    - delete_table(table_id, to_server=True) -> Remove table and cleanup resources [WITH SERVER SYNC]
    - move_table(table_id, position) -> Move table to new position
    - scale_table(table_id, scale_x, scale_y) -> Scale table by factors
    - ask_for_table(table_name) -> Request table from server
    
    ═══════════════════════════════════════════════════════════════════════════════
    SPRITE MANAGEMENT (CRUD OPERATIONS)
    ═══════════════════════════════════════════════════════════════════════════════
    - create_sprite(table_id, sprite_id, position, image_path, layer, to_server=True) -> Create new sprite [WITH SERVER SYNC]
    - get_sprite_info(table_id, sprite_id) -> Get detailed sprite information
    - update_sprite(table_id, sprite_id, to_server=True, **kwargs) -> Update sprite properties [WITH SERVER SYNC]
    - delete_sprite(table_id, sprite_id, to_server=True) -> Remove sprite from table [WITH SERVER SYNC]
    - move_sprite(table_id, sprite_id, position, to_server=True) -> Move sprite to new position [WITH SERVER SYNC]
    - scale_sprite(table_id, sprite_id, scale_x, scale_y, to_server=True) -> Scale sprite [WITH SERVER SYNC]
    - rotate_sprite(table_id, sprite_id, angle, to_server=True) -> Rotate sprite by angle [WITH SERVER SYNC]
    
    ═══════════════════════════════════════════════════════════════════════════════
    ADVANCED SPRITE SERVER OPERATIONS
    ═══════════════════════════════════════════════════════════════════════════════
    - batch_sprite_update(table_id, sprite_updates, to_server=True) -> Update multiple sprites in batch
    - sync_sprite_with_server(table_id, sprite_id) -> Force sync sprite with server
    - request_sprite_from_server(table_id, sprite_id) -> Request specific sprite from server
    - broadcast_sprite_action(action_type, table_id, sprite_id, action_data) -> Broadcast sprite action
    
    ═══════════════════════════════════════════════════════════════════════════════
    ADVANCED TABLE SERVER OPERATIONS
    ═══════════════════════════════════════════════════════════════════════════════
    - sync_table_with_server(table_id) -> Force sync table with server
    - request_table_list_from_server() -> Request list of available tables from server
    - broadcast_table_action(action_type, table_id, action_data) -> Broadcast table action
    
    ═══════════════════════════════════════════════════════════════════════════════
    LAYER MANAGEMENT
    ═══════════════════════════════════════════════════════════════════════════════
    - set_layer_visibility(table_id, layer, visible) -> Show/hide layer
    - get_layer_visibility(table_id, layer) -> Check layer visibility status
    - get_layer_sprites(table_id, layer) -> Get all sprites on specific layer
    - move_sprite_to_layer(table_id, sprite_id, new_layer) -> Move sprite between layers
    
    ═══════════════════════════════════════════════════════════════════════════════
    QUERY & SEARCH OPERATIONS
    ═══════════════════════════════════════════════════════════════════════════════
    - get_table_info(table_id) -> Get detailed table information
    - get_all_tables() -> Get information about all tables
    - get_table_sprites(table_id, layer=None) -> Get sprites on table/layer
    - get_sprite_at_position(table_id, position, layer=None) -> Find sprite at position
    - get_sprites_in_area(table_id, top_left, bottom_right, layer=None) -> Get sprites in area
    
    ═══════════════════════════════════════════════════════════════════════════════
    FILE & STORAGE OPERATIONS
    ═══════════════════════════════════════════════════════════════════════════════
    - load_file(file_path, **kwargs) -> Load file from filesystem
    - handle_file_loaded(operation_id, filename, data) -> Process loaded file
    - handle_file_saved(operation_id, filename) -> Process saved file
    - handle_file_list(operation_id, file_list) -> Process file listing
    - handle_file_operation_error(operation_id, operation_type, error_msg) -> Handle file errors
    - handle_file_imported(self, operation_id: str, operation: dict) -> Handle imported file operation
    ═══════════════════════════════════════════════════════════════════════════════
    NETWORK & PROTOCOL OPERATIONS
    ═══════════════════════════════════════════════════════════════════════════════
    #TODO- ask_for_asset_download(asset_id) -> Request asset download from server
    #TODO- ask_for_asset_list() -> Request asset list from server
    - ask_for_upload_file(file_path, filename, file_type) -> Request file upload to server
    ═══════════════════════════════════════════════════════════════════════════════
    BATCH & HISTORY OPERATIONS
    ═══════════════════════════════════════════════════════════════════════════════
    - batch_actions(actions) -> Execute multiple actions in sequence
    - undo_action() -> Undo last action (basic implementation)
    - redo_action() -> Redo last undone action (basic implementation)
    
    ═══════════════════════════════════════════════════════════════════════════════
    I/O EVENT HANDLERS (New Architecture)
    ═══════════════════════════════════════════════════════════════════════════════
    - handle_completed_operation(operation) -> Dispatch completed I/O operations
    - handle_operation_error(operation) -> Handle failed I/O operations
    - _handle_storage_completion(operation) -> Process storage operation completion
    - _handle_download_completion(operation) -> Process download operation completion
    - _handle_upload_completion(operation) -> Process upload operation completion
    - _handle_download_error(operation) -> Handle download-specific errors
    
    ═══════════════════════════════════════════════════════════════════════════════
    ASSET MANAGEMENT HANDLERS (New Architecture)
    ═══════════════════════════════════════════════════════════════════════════════
    - handle_asset_download_response(data) -> Process asset download response from server
    - handle_asset_list_response(data) -> Process asset list response from server
    - handle_asset_upload_response(data) -> Process asset upload response from server
    - handle_welcome_message(data) -> Process welcome message from server
    - _request_asset_download(asset_id) -> Request asset download from server    
    ═══════════════════════════════════════════════════════════════════════════════
    GUI & UI EVENT HANDLERS 
    ═══════════════════════════════════════════════════════════════════════════════
    add_chat_message(message: str) -> Add message to chat log
    ═══════════════════════════════════════════════════════════════════════════════
    INTERNAL HELPER METHODS
    ═══════════════════════════════════════════════════════════════════════════════
    - _process_table_assets(table_data) -> Process assets when creating table
    - _trigger_sprite_reload_for_asset(asset_id) -> Reload textures for asset
    - _handle_text_file_loaded(operation_id, filename, data, filetype) -> Process loaded text files
    - _handle_config_file_saved(filename) -> Handle config file saves
    - _handle_file_not_found_error(operation_id, operation_type, error_msg) -> Handle file not found
    - _handle_permission_error(operation_id, operation_type, error_msg) -> Handle permission errors
    - _handle_generic_file_error(operation_id, operation_type, error_msg) -> Handle generic file errors
    - _apply_config_data(config_data) -> Apply loaded configuration
    - _apply_save_data(save_data) -> Apply loaded save game data
    - _load_table_data(table_data) -> Load table from file data
    - _process_csv_data(filename, csv_data) -> Process CSV file data
    
    Total Functions: 69 (14 public table ops + 7 advanced table ops, 7 public sprite ops + 4 advanced sprite ops, 
                        4 layer ops, 5 query ops, 5 file ops, 3 batch ops, 6 I/O handlers, 
                        5 asset handlers, 11 internal helpers)
    
    SERVER COMMUNICATION FEATURES:
    - All sprite operations (create, update, delete, move, scale, rotate) support server sync
    - All table operations (update, delete) support server sync
    - Batch operations for efficient sprite updates
    - Force sync methods for manual server synchronization
    - Broadcasting capabilities for real-time multiplayer updates
    - Request methods for pulling data from server
    # ============================================================================
    # CHARACTER MANAGEMENT METHODS
    # ============================================================================
    """
    
    # ============================================================================
    # INITIALIZATION & CORE UTILITIES
    # ============================================================================
    
    def __init__(self, context: 'Context'):
        """Initialize Actions with context and default settings"""
        self.context = context
        self.action_history: List[Dict[str, Any]] = []
        self.undo_stack: List[Dict[str, Any]] = []
        self.redo_stack: List[Dict[str, Any]] = []
        self.max_history = 100
        self.layer_visibility = {layer: True for layer in LAYERS.keys()}
        self.AssetManager: Optional[ClientAssetManager] = None
        self.pending_upload_operations: Dict[str, str] = {}  # asset_id -> file_path
        self.actions_bridge = None  # Will be connected to GUI actions bridge later

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

    # ============================================================================
    # TABLE MANAGEMENT (CRUD OPERATIONS)
    # ============================================================================
    
    def create_table(self, name: str, width: int, height: int) -> ActionResult:
        """Create a new table"""
        try:
            # Generate unique table ID
            table_id = str(uuid.uuid4())
                     
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
            logger.debug(f"Creating table from dict: {table_dict}")
            # Validate required fields
            required_fields = ['table_name', 'width', 'height' ]
            for field in required_fields:
                if field not in table_dict:
                    logger.error(f"Missing required field: {field}")
                    return ActionResult(False, f"Missing required field: {field}")
                    
            # Create table using Context method
            table = self.context.create_table_from_dict(table_dict)
            if not table:
                return ActionResult(False, f"Failed to create table {table_dict['table_name']}")          

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

    def process_creating_table(self, table_data: dict) -> ActionResult:
        """Process creating a table with asset handling"""
        try:
            # Process assets before creating the table
            self._process_table_assets(table_data)
            
            result = self.create_table_from_dict(table_data)
            if not result.success:
                logger.error(f"Failed to create table from dict: {table_data}")
                return result
            
            return result
        except Exception as e:
            logger.error(f"Error processing table creation: {e}")
            return ActionResult(False, f"Error processing table creation: {str(e)}")

    def get_table(self, table_id: Optional[str] = None, table_name: Optional[str] = None) -> ActionResult:
        """Get a table by ID or name"""
        try:
            table = self._get_table_by_id(table_id)
            if not table:
                table = self._get_table_by_name(table_name) if table_name else None
                if not table:
                    logger.error(f"Table {table_id or table_name} not found")
                    return ActionResult(False, f"Table {table_id} not found")

            return ActionResult(True, f"Table {table_id} with name {table_name} retrieved", {'table': table})
        except Exception as e:
            logger.error(f"Failed to get table {table_id}: {e}")
            return ActionResult(False, f"Failed to get table: {str(e)}")
    
    def update_table(self, table_id: str, to_server: bool = True, **kwargs) -> ActionResult:
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
            
            # Send update to server if requested and protocol available
            if to_server and hasattr(self.context, 'protocol') and self.context.protocol:
                try:
                    update_data = {
                        'table_id': table_id,
                        **kwargs
                    }
                    self.context.protocol.send_update('table_update', update_data)
                    logger.debug(f"Sent table update to server for {table_id}")
                except Exception as e:
                    logger.error(f"Failed to send table update to server: {e}")
            
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
    
    def delete_table(self, table_id: str, to_server: bool = True) -> ActionResult:
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
            
            # Send delete to server if requested and protocol available
            if to_server and hasattr(self.context, 'protocol') and self.context.protocol:
                try:
                    self.context.protocol.table_delete(table_id)
                    logger.debug(f"Sent table delete to server for {table_id}")
                except Exception as e:
                    logger.error(f"Failed to send table delete to server: {e}")
            
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

    def ask_for_table(self, table_name: str) -> ActionResult:
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

    # ============================================================================
    # SPRITE MANAGEMENT (CRUD OPERATIONS)
    # ============================================================================
    def create_sprite(self, table_id: str, sprite_id: str, position: Position , 
                     image_path: str, layer: str = "tokens", to_server: bool = True, **kwargs) -> ActionResult:
        """Create a new sprite on a table"""
        #TODO refactor to use sprite data dict
        if not isinstance(position, Position):
            position = Position(position[0], position[1]) if isinstance(position, (list, tuple)) else Position(0, 0)
        try:
            table = self._get_table_by_id(table_id)
            if not table:
                return ActionResult(False, f"Table {table_id} not found")
            if layer not in LAYERS:
                return ActionResult(False, f"Invalid layer: {layer}")
            
            # Create sprite using Context method
            sprite_data = {
                'texture_path': image_path,
                'layer': layer,
                'table_id': table.table_id,
                'coord_x': position.x,
                'coord_y': position.y,
                'sprite_id': sprite_id,               
                **kwargs
            }
            logger.debug(f"Creating sprite with data: {sprite_data}")
            sprite = self.context.add_sprite(
                **sprite_data
            )
           
            
            # Start io operations to load asset texture
            if self.AssetManager and sprite:
                # Check if we already have an asset_id (e.g., from copy/paste)
                provided_asset_id = kwargs.get('asset_id')
                if provided_asset_id:
                    logger.info(f"Using existing asset_id {provided_asset_id} for sprite {sprite_id}")
                    # Set the asset_id on the sprite before loading
                    sprite.asset_id = provided_asset_id
                    # Try to get cached texture directly
                    texture = self.AssetManager.find_texture_by_asset_id(provided_asset_id)
                    if texture:
                        logger.info(f"Found cached texture for asset {provided_asset_id}")                        
                        sprite.reload_texture(texture, int(sprite.frect.w), int(sprite.frect.h))
                        logger.debug(f"Sprite frect: {sprite.frect.w}x{sprite.frect.h}")
                    else:
                        logger.warning(f"Texture not found for asset {provided_asset_id}, loading from path")
                        self.AssetManager.load_asset_for_sprite(sprite, image_path, to_server=to_server)
                else:
                    logger.info(f"Loading asset for sprite {sprite_id} from {image_path}")    
                    self.AssetManager.load_asset_for_sprite(sprite, image_path, to_server=to_server)
            if to_server:
                logger.debug(f"Creating sprite {sprite_id} on server for table {table_id}")
                self.context.protocol.sprite_create(table_id=table.table_id,
                                            sprite_data=sprite.to_dict())
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
                'layer': layer,
                'sprite': sprite
            })
        except Exception as e:
            return ActionResult(False, f"Failed to create sprite: {str(e)}")
    def get_sprite_info(self, table_id: str, sprite_id: str) -> ActionResult:
        """Get sprite information"""
        try:
            table = self._get_table_by_id(table_id)
            if not table:
                return ActionResult(False, f"Table {table_id} not found")
            
            sprite = self._find_sprite_in_table(table, sprite_id)
            if not sprite:
                return ActionResult(False, f"Sprite {sprite_id} not found")
            
            info = {
                'sprite_id': sprite_id,
                'position': Position(sprite.coord_x.value, sprite.coord_y.value),
                'scale': (sprite.scale_x, sprite.scale_y),
                'rotation': getattr(sprite, 'rotation', 0.0),
                'image_path': sprite.texture_path,
                'layer': sprite.layer,
                'visible': getattr(sprite, 'visible', True),
                'character_data': getattr(sprite, 'character', None)  # Include character data
            }
            
            return ActionResult(True, f"Sprite {sprite_id} info retrieved", info)
        except Exception as e:
            return ActionResult(False, f"Failed to get sprite info: {str(e)}")

    def find_sprite(self, table_id: str, sprite_id: str) -> ActionResult:
        """Find a sprite by ID in a specific table"""
        try:
            table = self._get_table_by_id(table_id)
            if not table:
                logger.error(f"Table {table_id} not found")
                return None
            
            sprite = self._find_sprite_in_table(table, sprite_id)
            if not sprite:
                logger.error(f"Sprite {sprite_id} not found in table {table_id}")
                return None

            return ActionResult(True, f"Sprite {sprite_id} found", sprite)
        except Exception as e:
            logger.error(f"Failed to find sprite {sprite_id}: {str(e)}")
            return None
    def update_sprite(self, table_id: str, sprite_id: str, to_server: bool = True, **kwargs) -> ActionResult:
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
            
            # Send update to server if requested and protocol available
            if to_server and hasattr(self.context, 'protocol') and self.context.protocol:
                try:
                    sprite_data = {
                        'sprite_id': sprite_id,
                        'table_id': table_id,
                        **kwargs
                    }
                    self.context.protocol.send_sprite_update('update', sprite_data)
                    logger.debug(f"Sent sprite update to server for {sprite_id}")
                except Exception as e:
                    logger.error(f"Failed to send sprite update to server: {e}")
            
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
    
    def delete_sprite(self, table_id: str, sprite_id: str, to_server: bool = True) -> ActionResult:
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
            
            # Send delete to server if requested and protocol available
            if to_server and hasattr(self.context, 'protocol') and self.context.protocol:
                try:
                    self.context.protocol.sprite_delete(table_id, sprite_id)
                    logger.debug(f"Sent sprite delete to server for {sprite_id}")
                except Exception as e:
                    logger.error(f"Failed to send sprite delete to server: {e}")
            
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
    
    def move_sprite(self, table_id: str, sprite_id: str, position: Position, to_server: bool = True) -> ActionResult:
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
            
            # Send move to server if requested and protocol available
            if to_server and hasattr(self.context, 'protocol') and self.context.protocol:
                try:
                    from_pos = {'x': old_position[0], 'y': old_position[1]}
                    to_pos = {'x': position.x, 'y': position.y}
                    self.context.protocol.sprite_move(table_id, sprite_id, from_pos, to_pos)
                    logger.debug(f"Sent sprite move to server for {sprite_id}")
                except Exception as e:
                    logger.error(f"Failed to send sprite move to server: {e}")
            
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
    
    def scale_sprite(self, table_id: str, sprite_id: str, scale_x: float, scale_y: float, to_server: bool = True) -> ActionResult:
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
            
            # Send scale to server if requested and protocol available
            if to_server and hasattr(self.context, 'protocol') and self.context.protocol:
                try:
                    self.context.protocol.sprite_scale(table_id, sprite_id, scale_x, scale_y)
                    logger.debug(f"Sent sprite scale to server for {sprite_id}")
                except Exception as e:
                    logger.error(f"Failed to send sprite scale to server: {e}")
            
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
    
    def rotate_sprite(self, table_id: str, sprite_id: str, angle: float, to_server: bool = True) -> ActionResult:
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
            
            # Send rotation to server if requested and protocol available
            if to_server and hasattr(self.context, 'protocol') and self.context.protocol:
                try:
                    self.context.protocol.sprite_rotate(table_id, sprite_id, angle)
                    logger.debug(f"Sent sprite rotation to server for {sprite_id}")
                except Exception as e:
                    logger.error(f"Failed to send sprite rotation to server: {e}")
            
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
    
    # ============================================================================
    # LAYER MANAGEMENT
    # ============================================================================
    
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

    # ============================================================================
    # QUERY & SEARCH OPERATIONS  
    # ============================================================================
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

    # ============================================================================
    # FILE & STORAGE OPERATIONS
    # ============================================================================
    def load_file(self, file_path: str, **kwargs) -> ActionResult:
        """Load a file from the specified path"""
        try:
            if not os.path.exists(file_path):
                return ActionResult(False, f"File not found: {file_path}")
            _path= Path(file_path)
            filename = _path.name
            file_type = _path.suffix.lower()
            
            if file_type in {'.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.tiff'}:
                # Create sprite with generated ID
                sprite_id = str(uuid.uuid4())[:8]
                result = self.create_sprite(
                    table_id=kwargs.get('table_id', 'default_table'),
                    sprite_id=sprite_id,
                    position=kwargs.get('position', Position(0, 0)),
                    image_path=file_path,
                    layer=kwargs.get('layer', 'tokens')
                )
                if not result.success:
                    return result
                    
            elif file_type in {'.json', '.txt', '.csv', '.yaml', '.yml'}:
                # Load text/data file using StorageManager
                if self.AssetManager and self.AssetManager.StorageManager:
                    operation_id = self.AssetManager.StorageManager.load_file_async(
                        filename=filename
                    )
                    logger.info(f"Started loading text file: {filename} (operation {operation_id})")
                else:
                    logger.error("StorageManager not available for text file loading")
                    
            else:
                logger.error(f"Unsupported file type: {file_type} for file {file_path}")
                return ActionResult(False, f"Unsupported file type: {file_type} for file {file_path}")
                
            action = {
                'type': 'start_file_load',
                'file_path': file_path,
                'filename': filename,
                'filetype': file_type
            }

            self._add_to_history(action)               
            return ActionResult(True, f"File load started: {file_path}", action)
            
        except Exception as e:
            logger.error(f"Failed to load file {file_path}: {e}")
            return ActionResult(False, f"Failed to load file: {str(e)}")

    def handle_file_loaded(self, operation_id: str, filename: str, data: Any,to_server: bool, file_path: Optional[str] = None) -> ActionResult:
        """Handle successful file load operation"""
        try:
            if data is None:
                logger.error(f"No data received for file load operation {operation_id} for file {filename}")
                return ActionResult(False, f"No data received for file load operation {operation_id}")
            filetype = filename.split('.')[-1].lower() if filename and '.' in filename else None
            
            if filetype in {'jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'tiff'}:
                # Handle image file loading
                if not self.AssetManager:
                    logger.error("AssetManager not initialized, cannot handle image load operation")
                    return ActionResult(False, "AssetManager not initialized")
                
                logger.info(f"Loading image file: {filename}")
                result = self.AssetManager.handle_file_loaded(operation_id, filename, data)
                if result:
                    if to_server:
                        asset_id, xxhash = result
                    
                        self.ask_for_upload_file(
                            filename=filename,
                            file_size=len(data),
                            file_hash=xxhash,
                            asset_id=asset_id,
                            file_path=file_path,  
                            file_type=filetype
                        )
                else:
                    logger.error(f"Failed to handle image file load for {filename}")
                    return ActionResult(False, f"Failed to handle image file load for {filename}")
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
            # Note: Future integration point for file browser UI
            logger.debug(f"File list processed with {len(file_list)} files")
            
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
    
    def handle_file_imported(self, operation_id: str, operation: dict) -> ActionResult:
        """Handle successful file import operation"""
        try:
            external_path = operation.get('external_path', 'unknown')
            target_path = operation.get('target_path', 'unknown')
            filename = operation.get('filename', 'unknown')
            xxhash_value = operation.get('xxhash', '')
            
            logger.info(f"File imported successfully: {external_path} -> {target_path}")
            
            # Register the imported file in AssetManager
            if self.AssetManager and xxhash_value:
                asset_id = xxhash_value[:16]
                
                # Update registry with imported file info
                self.AssetManager.asset_registry[asset_id] = {
                    'asset_id': asset_id,
                    'filename': filename,
                    'local_path': target_path,
                    'cached_at': time.time(),
                    'source': 'imported',
                    'original_path': external_path,
                    'file_size': operation.get('file_size', 0),
                    'xxhash': xxhash_value,
                    'hash_verified': True
                }
                
                # Add to lookup tables
                self.AssetManager._add_to_hash_lookup(asset_id, xxhash_value)
                self.AssetManager._add_to_path_lookup(asset_id, external_path)
                
                # Save registry
                self.AssetManager._save_registry()
                
                # Check if there's a sprite waiting for this import
                sprite = self.AssetManager.dict_of_sprites.get(operation_id)
                if sprite and self.AssetManager.StorageManager:
                    # Load the imported file to create texture
                    subdir = operation.get('subdir', 'assets')
                    load_operation_id = self.AssetManager.StorageManager.load_file_async(
                        filename, subdir=subdir, as_json=False
                    )
                    # Transfer sprite association to the load operation
                    self.AssetManager.dict_of_sprites[load_operation_id] = sprite
                    del self.AssetManager.dict_of_sprites[operation_id]
                    logger.info(f"Initiated load for imported file, operation_id: {load_operation_id}")
            
            action = {
                'type': 'file_imported',
                'operation_id': operation_id,
                'external_path': external_path,
                'target_path': target_path,
                'filename': filename
            }
            self._add_to_history(action)
            
            return ActionResult(True, f"File imported successfully: {filename}")
            
        except Exception as e:
            logger.error(f"Error handling file import for operation {operation_id}: {e}")
            return ActionResult(False, f"Failed to handle file import: {str(e)}")
    # ═══════════════════════════════════════════════════════════════════════════════
    # NETWORK & PROTOCOL OPERATIONS
    # ═══════════════════════════════════════════════════════════════════════════════
    def ask_for_upload_file(self, filename: str, file_size: int, file_hash: str, asset_id: str, 
                           file_path: Optional[str] = None, file_type: Optional[str] = None) -> ActionResult:

        try:
            logger.info(f"Requesting upload for file: {filename}")
            
            # Store file path for later upload
            if file_path:
                self.pending_upload_operations[asset_id] = file_path
                logger.debug(f"Stored file path {file_path} for asset {asset_id}")

            self.context.protocol.request_asset_upload(filename, file_size, file_hash, asset_id=asset_id, content_type=file_type)
            action = {
                'type': 'request_upload',
                'filename': filename,
                'file_size': file_size,
                'file_hash': file_hash,
                'file_type': file_type,
                'asset_id': asset_id,
                'file_path': file_path
            }
            self._add_to_history(action)
            return ActionResult(True, f"Upload requested for file: {filename}")
        except Exception as e:
            logger.error(f"Error requesting upload for file {filename}: {e}")
            return ActionResult(False, f"Error requesting upload for file: {str(e)}")

    # ============================================================================
    # BATCH & HISTORY OPERATIONS
    # ============================================================================
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

    # ============================================================================
    # I/O EVENT HANDLERS (New Architecture)
    # ============================================================================
    def handle_completed_operation(self, operation: dict):
        """Handle successfully completed I/O operations"""
        op_type = operation.get('type', 'unknown')
        op_source = operation.get('source', 'unknown')
        op_id = operation.get('operation_id', 'unknown')
        
        logger.debug(f"Handling completed {op_source} operation: {op_type} ({op_id})")
        
        if op_source == 'storage':
            self._handle_storage_completion(operation)
        elif op_source == 'download':
            self._handle_download_completion(operation)
        else:
            logger.warning(f"Unknown operation source: {op_source}")

    def handle_operation_error(self, operation: dict):
        """Handle failed I/O operations"""
        op_id = operation.get('operation_id', 'unknown')
        op_type = operation.get('type', 'unknown')
        op_source = operation.get('source', 'unknown')
        error = operation.get('error', 'Unknown error')
        
        logger.error(f"{op_source.title()} operation {op_id} ({op_type}) failed: {error}")
        
        # Dispatch to specific error handlers
        if op_source == 'storage':
            self.handle_file_operation_error(op_id, op_type, error)
        elif op_source == 'download':
            self._handle_download_error(operation)
        else:
            logger.error(f"Unknown operation source for error handling: {op_source}")

    def _handle_storage_completion(self, operation: dict):
        """Handle completed storage operations"""
        op_type = operation.get('type')
        op_id = operation.get('operation_id', 'unknown')
        
        if op_type == 'load' and 'data' in operation:
            # Pass the file path from storage completion data
            file_path = operation.get('file_path', '')
            self.handle_file_loaded(op_id, operation['filename'], operation['data'], to_server=operation.get('to_server', False), file_path=file_path)
        elif op_type == 'save':
            self.handle_file_saved(op_id, operation['filename'])
        elif op_type == 'import':
            self.handle_file_imported(op_id, operation)
        elif op_type == 'list':
            self.handle_file_list(op_id, operation.get('data', []))
        else:
            logger.warning(f"Unknown storage operation type: {op_type}")

    def _handle_download_completion(self, operation: dict):
        """Handle completed download operations"""
        op_type = operation.get('type')
        metadata = operation.get('metadata', {})
        op_id = operation.get('operation_id', 'unknown')
        
        if op_type == 'download':
            # Handle completed download
            asset_id = metadata.get('asset_id')
            file_path = operation.get('file_path')
            
            if asset_id and file_path and self.AssetManager:
                try:
                    # Cache the downloaded asset
                    success = self.AssetManager.cache_downloaded_asset(asset_id, file_path)
                    if success:
                        logger.info(f"Asset {asset_id} downloaded and cached successfully")
                        # Trigger sprite texture reload if needed
                        self._trigger_sprite_reload_for_asset(asset_id)
                    else:
                        logger.error(f"Failed to cache downloaded asset {asset_id}")
                except Exception as e:
                    logger.error(f"Error caching downloaded asset {asset_id}: {e}")
            else:
                logger.warning(f"Incomplete download operation data: asset_id={asset_id}, file_path={file_path}")
                
        elif op_type == 'upload':
            # Handle completed upload
            self._handle_upload_completion(operation)
        else:
            logger.warning(f"Unknown download operation type: {op_type}")

    def _handle_upload_completion(self, operation: dict):
        """Handle completed upload operations"""
        op_id = operation.get('operation_id', 'unknown')
        metadata = operation.get('metadata', {})
        asset_id = metadata.get('asset_id')
        file_xxhash = metadata.get('required_xxhash', '')
        original_file_path = metadata.get('original_file_path', '')
        logger.info(f"Upload completed for asset {asset_id} (operation {op_id})")
        logger.debug(f"Upload metadata: {metadata}")
        
        # Notify server of successful upload if protocol is available
        if hasattr(self.context, 'protocol') and self.context.protocol:
            try:
                self.context.protocol.confirm_asset_upload(asset_id,file_xxhash, True)
            except Exception as e:
                logger.error(f"Failed to confirm upload for asset {asset_id}: {e}")

    def _handle_download_error(self, operation: dict):
        """Handle download-specific errors"""
        op_id = operation.get('operation_id', 'unknown')
        op_type = operation.get('type', 'unknown')
        error = operation.get('error', 'Unknown error')
        metadata = operation.get('metadata', {})
        asset_id = metadata.get('asset_id', 'unknown')
        
        logger.error(f"Download operation {op_id} failed for asset {asset_id}: {error}")
        
        # Could implement retry logic here if needed
        if 'network' in error.lower() or 'timeout' in error.lower():
            logger.info(f"Network error detected for asset {asset_id}, could retry later")
        
        # Notify server of failed upload if it was an upload operation
        if op_type == 'upload' and hasattr(self.context, 'protocol') and self.context.protocol:
            try:
                self.context.protocol.confirm_asset_upload(asset_id, False, error)
            except Exception as e:
                logger.error(f"Failed to confirm upload failure for asset {asset_id}: {e}")

    # ============================================================================
    # ASSET MANAGEMENT HANDLERS (New Architecture)
    # ============================================================================
    def handle_asset_download_response(self, data: dict):
        """Handle asset download response from protocol"""
        try:
            if data.get('success') is False:
                logger.warning(f"Asset download failed: {data.get('instructions')}")
                return
                
            asset_id = data.get('asset_id')
            download_url = data.get('download_url')
            
            if not asset_id or not download_url:
                logger.error("Invalid asset download response: missing asset_id or download_url")
                return

            # Use AssetManager's DownloadManager
            if self.AssetManager and self.AssetManager.DownloadManager:
                filename = f"{asset_id}.asset"
                if 'filename' in data:
                    filename = data['filename']
                    
                operation_id = self.AssetManager.DownloadManager.download_file_async(
                    url=download_url,
                    filename=filename,
                    subdir="",
                    metadata={
                        'asset_id': asset_id,
                        'source': 'server_download',
                        'type': 'asset'
                    }
                )
                logger.info(f"Started asset download {asset_id} with operation {operation_id}")
            else:
                logger.error("AssetManager or DownloadManager not available for asset download")
                
        except Exception as e:
            logger.error(f"Error handling asset download response: {e}")

    def handle_asset_list_response(self, data: dict):
        """Handle asset list response from protocol"""
        try:
            if data.get('success') is False:
                logger.warning(f"Asset list request failed: {data.get('instructions')}")
                return
                
            assets = data.get('assets', [])
            logger.info(f"Received asset list with {len(assets)} assets")
            
            # Process asset list - could update UI or cache
            for asset in assets:
                asset_id = asset.get('asset_id')
                filename = asset.get('filename')
                if asset_id and filename:
                    logger.debug(f"Available asset: {asset_id} - {filename}")
                    
        except Exception as e:
            logger.error(f"Error handling asset list response: {e}")

    def handle_asset_upload_response(self, data: dict):
        """Handle asset upload response from protocol"""
        try:
            if data.get('success') is False:
                logger.warning(f"Asset upload failed: {data.get('instructions')}")
                return
                
            asset_id = data.get('asset_id')
            upload_url = data.get('upload_url')
            required_xxhash = data.get('required_xxhash')
            
            if not asset_id or not upload_url or not required_xxhash:
                logger.error("Invalid asset upload response: missing asset_id, upload_url, or required_xxhash")
                return

            logger.info(f"Received upload URL for asset {asset_id}, required xxHash: {required_xxhash}")
            
            # Find the file path to upload (should be stored in pending operations)
            file_path = self.pending_upload_operations.get(asset_id)
            if not file_path:
                logger.error(f"No pending file path found for asset {asset_id}")
                return
            
            # Start upload via AssetManager
            if not self.AssetManager:
                logger.error("AssetManager not initialized, cannot start upload")
                return
            
            operation_id = self.AssetManager.upload_asset_async(
                file_path=file_path,
                upload_url=upload_url,
                asset_id=asset_id,
                required_xxhash=required_xxhash
            )
            
            if operation_id:
                logger.info(f"Started upload operation {operation_id} for asset {asset_id}")
                # Clean up pending operation and file path tracking
                self.pending_upload_operations.pop(asset_id, None)
                # Note: operation_file_paths in AssetManager will be cleaned up when upload completes
            else:
                logger.error(f"Failed to start upload for asset {asset_id}")
            
        except Exception as e:
            logger.error(f"Error handling asset upload response: {e}")

    def handle_welcome_message(self, data: dict):
        """Handle welcome message data from protocol"""
        try:
            user_id = data.get('user_id', 0)
            username = data.get('username', 'unknown')
            session_code = data.get('session_code', 'unknown')
            welcome_msg = data.get('message', f'Welcome to session {session_code}')
            
            logger.info(f"Processing welcome for user {username} (ID: {user_id}) in session {session_code}")
            
            # Store session information in context if needed
            if hasattr(self.context, 'user_id'):
                self.context.user_id = user_id
            if hasattr(self.context, 'username'):
                self.context.username = username
            if hasattr(self.context, 'session_code'):
                self.context.session_code = session_code
            
            # Notify GUI if available
            # Note: Future integration point for GUI messaging system
            logger.info(f"Welcome message processed for user {username} in session {session_code}")
            logger.debug(f"Welcome: {welcome_msg}")
            
        except Exception as e:
            logger.error(f"Error processing welcome message: {e}")

    def _request_asset_download(self, asset_id: str):
        """Request asset download from server via protocol"""
        if hasattr(self.context, 'protocol') and self.context.protocol:
            try:
                self.context.protocol.request_asset_download(asset_id)
                logger.info(f"Requested download for asset {asset_id}")
            except Exception as e:
                logger.error(f"Error requesting asset download for {asset_id}: {e}")
        else:
            logger.error("No protocol available to request asset download")

    # ============================================================================
    # GUI & UI EVENT HANDLERS 
    # ============================================================================
    def add_chat_message(self, message: str):
        """Add a message to the chat log"""
        if hasattr(self.context, 'gui_system') and hasattr(self.context.gui_system, 'gui_state'):
            self.context.gui_system.gui_state.chat_messages.append(message)
            logger.info(f"Chat message added: {message}")

    # ============================================================================
    # INTERNAL HELPER METHODS
    # ============================================================================
    def _process_table_assets(self, table_data: dict):
        """Process table assets and request downloads for missing assets"""
        try:
            layers = table_data.get('layers', {})
            logger.debug(f"start processing table assets for layers: {list(layers.keys())}")
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
                        if self.AssetManager:
                            logger.debug(f"Checking asset cache for xxHash {asset_xxhash} for entity {entity_id}")
                            cached_path = self.AssetManager.get_asset_for_sprite_by_xxhash(asset_xxhash)
                            logger.debug(f"Asset cache lookup for {asset_xxhash} returned: {cached_path}")
                            if cached_path:
                                logger.debug(f"Asset {asset_id} found in cache by xxHash: {cached_path}")
                                # Update entity to use cached path
                                entity_data['texture_path'] = cached_path
                            else:                     
                                # Asset not found locally, request download
                                logger.info(f"Asset {asset_id} not found locally, requesting download (xxHash: {asset_xxhash})")
                                self._request_asset_download(asset_id)
                        else:
                            logger.warning("AssetManager not initialized, cannot check asset cache")
                    elif asset_id:
                        self._request_asset_download(asset_id)
                        logger.info(f"Asset {asset_id} requested for download (no xxHash available)")
                    else:
                        logger.warning(f"Entity {entity_id} missing asset hash information")
                        
        except Exception as e:
            logger.error(f"Error processing table assets: {e}")

    def _trigger_sprite_reload_for_asset(self, asset_id: str):
        """Trigger texture reload for sprites using this asset"""
        try:
            # Find sprites that use this asset and trigger texture reload
            for table in self.context.list_of_tables:
                for layer, sprite_list in table.dict_of_sprites_list.items():
                    for sprite in sprite_list:
                        if hasattr(sprite, 'asset_id') and sprite.asset_id == asset_id:
                            # Reload texture for this sprite
                            if self.AssetManager:
                                self.AssetManager.load_asset_for_sprite(sprite, sprite.texture_path)
                                logger.debug(f"Triggered texture reload for sprite {sprite.sprite_id}")
        except Exception as e:
            logger.error(f"Error triggering sprite reload for asset {asset_id}: {e}")

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
                # Note: Future integration point for log viewer UI
                logger.debug(f"Text file loaded: {filename} ({len(data) if data else 0} chars)")
                    
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
                # Note: Future integration point for configuration reload
                logger.debug("Configuration file save processed")
                    
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
            # Note: Future integration point for settings application
            logger.info(f"Configuration data received with {len(config_data)} settings")
            logger.debug("Configuration data processed")
            
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

    # ============================================================================
    # ADVANCED SPRITE SERVER OPERATIONS
    # ============================================================================
    
    def batch_sprite_update(self, table_id: str, sprite_updates: List[Dict[str, Any]], to_server: bool = True) -> ActionResult:
        """Update multiple sprites in a batch operation"""
        try:
            results = []
            for update in sprite_updates:
                sprite_id = update.pop('sprite_id', None)
                if not sprite_id:
                    results.append(ActionResult(False, "Missing sprite_id in update"))
                    continue
                
                result = self.update_sprite(table_id, sprite_id, to_server=to_server, **update)
                results.append(result)
            
            success_count = sum(1 for r in results if r.success)
            return ActionResult(True, f"Batch sprite update: {success_count}/{len(results)} successful", 
                              {'results': results})
        except Exception as e:
            return ActionResult(False, f"Failed to batch update sprites: {str(e)}")
    
    def sync_sprite_with_server(self, table_id: str, sprite_id: str) -> ActionResult:
        """Force sync a sprite with the server"""
        try:
            table = self._get_table_by_id(table_id)
            if not table:
                return ActionResult(False, f"Table {table_id} not found")
            
            sprite = self._find_sprite_in_table(table, sprite_id)
            if not sprite:
                return ActionResult(False, f"Sprite {sprite_id} not found")
            
            # Send complete sprite data to server
            if hasattr(self.context, 'protocol') and self.context.protocol:
                try:
                    sprite_data = {
                        'sprite_id': sprite_id,
                        'table_id': table_id,
                        'position': {'x': sprite.coord_x.value, 'y': sprite.coord_y.value},
                        'scale': {'x': sprite.scale_x, 'y': sprite.scale_y},
                        'rotation': getattr(sprite, 'rotation', 0.0),
                        'layer': sprite.layer,
                        'visible': getattr(sprite, 'visible', True),
                        'texture_path': sprite.texture_path
                    }
                    self.context.protocol.send_sprite_update('sync', sprite_data)
                    logger.debug(f"Synced sprite {sprite_id} with server")
                    return ActionResult(True, f"Sprite {sprite_id} synced with server")
                except Exception as e:
                    logger.error(f"Failed to sync sprite with server: {e}")
                    return ActionResult(False, f"Failed to sync sprite with server: {str(e)}")
            else:
                return ActionResult(False, "No protocol available for server sync")
                
        except Exception as e:
            return ActionResult(False, f"Failed to sync sprite: {str(e)}")
    
    def request_sprite_from_server(self, table_id: str, sprite_id: str) -> ActionResult:
        """Request a specific sprite from the server"""
        try:
            if hasattr(self.context, 'protocol') and self.context.protocol:
                try:
                    # Use protocol to request sprite data
                    msg = Message(MessageType.SPRITE_REQUEST, {
                        'table_id': table_id,
                        'sprite_id': sprite_id
                    }, getattr(self.context.protocol, 'client_id', 'unknown'))
                    
                    if hasattr(self.context.protocol, 'send'):
                        self.context.protocol.send(msg.to_json())
                        logger.debug(f"Requested sprite {sprite_id} from server")
                        return ActionResult(True, f"Requested sprite {sprite_id} from server")
                    else:
                        return ActionResult(False, "Protocol send method not available")
                except Exception as e:
                    logger.error(f"Failed to request sprite from server: {e}")
                    return ActionResult(False, f"Failed to request sprite: {str(e)}")
            else:
                return ActionResult(False, "No protocol available for server communication")
                
        except Exception as e:
            return ActionResult(False, f"Failed to request sprite: {str(e)}")
    
    def broadcast_sprite_action(self, action_type: str, table_id: str, sprite_id: str, action_data: Dict[str, Any]) -> ActionResult:
        """Broadcast a sprite action to all connected clients"""
        try:
            if hasattr(self.context, 'protocol') and self.context.protocol:
                try:
                    broadcast_data = {
                        'action': action_type,
                        'table_id': table_id,
                        'sprite_id': sprite_id,
                        'data': action_data,
                        'timestamp': time.time()
                    }
                    self.context.protocol.send_sprite_update('broadcast', broadcast_data)
                    logger.debug(f"Broadcasted sprite action {action_type} for {sprite_id}")
                    return ActionResult(True, f"Broadcasted sprite action {action_type}")
                except Exception as e:
                    logger.error(f"Failed to broadcast sprite action: {e}")
                    return ActionResult(False, f"Failed to broadcast action: {str(e)}")
            else:
                return ActionResult(False, "No protocol available for broadcasting")
                
        except Exception as e:
            return ActionResult(False, f"Failed to broadcast sprite action: {str(e)}")

    # ============================================================================
    # ADVANCED TABLE SERVER OPERATIONS
    # ============================================================================
    
    def sync_table_with_server(self, table_id: str) -> ActionResult:
        """Force sync a table with the server"""
        try:
            table = self._get_table_by_id(table_id)
            if not table:
                return ActionResult(False, f"Table {table_id} not found")
            
            if hasattr(self.context, 'protocol') and self.context.protocol:
                try:
                    # Send complete table data to server
                    table_data = {
                        'table_id': table_id,
                        'name': table.name,
                        'width': table.width,
                        'height': table.height,
                        'position': {'x': table.x_moved, 'y': table.y_moved},
                        'scale': table.scale,
                        'show_grid': table.show_grid,
                        'cell_side': table.cell_side
                    }
                    self.context.protocol.send_update('table_sync', table_data)
                    logger.debug(f"Synced table {table_id} with server")
                    return ActionResult(True, f"Table {table_id} synced with server")
                except Exception as e:
                    logger.error(f"Failed to sync table with server: {e}")
                    return ActionResult(False, f"Failed to sync table: {str(e)}")
            else:
                return ActionResult(False, "No protocol available for server sync")
                
        except Exception as e:
            return ActionResult(False, f"Failed to sync table: {str(e)}")
    
    def request_table_list_from_server(self) -> ActionResult:
        """Request the list of available tables from server"""
        try:
            if hasattr(self.context, 'protocol') and self.context.protocol:
                try:
                    self.context.protocol.request_table_list()
                    logger.debug("Requested table list from server")
                    return ActionResult(True, "Requested table list from server")
                except Exception as e:
                    logger.error(f"Failed to request table list: {e}")
                    return ActionResult(False, f"Failed to request table list: {str(e)}")
            else:
                return ActionResult(False, "No protocol available for server communication")
                
        except Exception as e:
            return ActionResult(False, f"Failed to request table list: {str(e)}")
    
    def broadcast_table_action(self, action_type: str, table_id: str, action_data: Dict[str, Any]) -> ActionResult:
        """Broadcast a table action to all connected clients"""
        try:
            if hasattr(self.context, 'protocol') and self.context.protocol:
                try:
                    broadcast_data = {
                        'action': action_type,
                        'table_id': table_id,
                        'data': action_data,
                        'timestamp': time.time()
                    }
                    self.context.protocol.send_update('table_broadcast', broadcast_data)
                    logger.debug(f"Broadcasted table action {action_type} for {table_id}")
                    return ActionResult(True, f"Broadcasted table action {action_type}")
                except Exception as e:
                    logger.error(f"Failed to broadcast table action: {e}")
                    return ActionResult(False, f"Failed to broadcast action: {str(e)}")
            else:
                return ActionResult(False, "No protocol available for broadcasting")
                
        except Exception as e:
            return ActionResult(False, f"Failed to broadcast table action: {str(e)}")

    #═══════════════════════════════════════════════════════════════════════════════
    # NETWORK & PLAYER MANAGEMENT FUNCTIONS
    # ═══════════════════════════════════════════════════════════════════════════════

    def handle_player_list(self, players: List[Dict[str, Any]]) -> ActionResult:
        """Handle player list received from server"""
        try:
            # Store player list in context for GUI access
            if not hasattr(self.context, 'network_state'):
                self.context.network_state = {}
            
            self.context.network_state['players'] = players
            self.context.network_state['player_count'] = len(players)
            self.context.network_state['last_updated'] = time.time()
            
            # Log player list
            player_names = [p.get('username', 'unknown') for p in players]
            logger.info(f"Updated player list: {player_names}")
            
            # Add chat message for UI feedback
            self.add_chat_message(f"👥 {len(players)} players connected: {', '.join(player_names)}")
            
            return ActionResult(True, f"Updated player list with {len(players)} players")
            
        except Exception as e:
            logger.error(f"Error handling player list: {e}")
            return ActionResult(False, f"Failed to handle player list: {str(e)}")


    def update_connection_status(self, status: Dict[str, Any]) -> ActionResult:
        """Update connection status from server"""
        try:
            # Store connection status in context
            if not hasattr(self.context, 'network_state'):
                self.context.network_state = {}
            
            self.context.network_state['connection_status'] = status
            self.context.network_state['connected'] = status.get('connected', False)
            self.context.network_state['last_ping'] = time.time()
            
            # Log status change
            connected = status.get('connected', False)
            logger.info(f"Connection status updated: {'connected' if connected else 'disconnected'}")
            
            return ActionResult(True, "Connection status updated")
            
        except Exception as e:
            logger.error(f"Error updating connection status: {e}")
            return ActionResult(False, f"Failed to update connection status: {str(e)}")


    def player_joined(self, user_id: int, username: Optional[str] = None) -> ActionResult:
        """Handle player joined notification"""
        try:
            # Update player list if available
            if hasattr(self.context, 'network_state') and 'players' in self.context.network_state:
                players = self.context.network_state['players']
                # Check if player already in list
                existing_player = next((p for p in players if p.get('user_id') == user_id), None)
                if not existing_player:
                    new_player = {
                        'user_id': user_id,
                        'username': username or f'Player {user_id}',
                        'connected_at': time.time()
                    }
                    players.append(new_player)
                    self.context.network_state['player_count'] = len(players)
            
            # Add chat message
            player_name = username or f"Player {user_id}"
            self.add_chat_message(f"✅ {player_name} joined the session")
            
            logger.info(f"Player {player_name} (ID: {user_id}) joined")
            return ActionResult(True, f"Player {player_name} joined")
            
        except Exception as e:
            logger.error(f"Error handling player joined: {e}")
            return ActionResult(False, f"Failed to handle player joined: {str(e)}")


    def player_left(self, username: str, user_id: Optional[int] = None) -> ActionResult:
        """Handle player left notification"""
        try:
            # Update player list if available
            if hasattr(self.context, 'network_state') and 'players' in self.context.network_state:
                players = self.context.network_state['players']
                # Remove player from list
                if user_id:
                    self.context.network_state['players'] = [p for p in players if p.get('user_id') != user_id]
                else:
                    self.context.network_state['players'] = [p for p in players if p.get('username') != username]
                self.context.network_state['player_count'] = len(self.context.network_state['players'])
            
            # Add chat message
            self.add_chat_message(f"❌ {username} left the session")
            
            logger.info(f"Player {username} left")
            return ActionResult(True, f"Player {username} left")
            
        except Exception as e:
            logger.error(f"Error handling player left: {e}")
            return ActionResult(False, f"Failed to handle player left: {str(e)}")


    def request_player_list(self) -> ActionResult:
        """Request current player list from server"""
        try:
            if hasattr(self.context, 'protocol') and self.context.protocol:
                self.context.protocol.request_player_list()
                logger.debug("Requested player list from server")
                return ActionResult(True, "Requested player list from server")
            else:
                return ActionResult(False, "No protocol available for player list request")
                
        except Exception as e:
            logger.error(f"Error requesting player list: {e}")
            return ActionResult(False, f"Failed to request player list: {str(e)}")


    def kick_player(self, player_id: str, username: str, reason: str = "No reason provided") -> ActionResult:
        """Request to kick a player from the session"""
        try:
            if hasattr(self.context, 'protocol') and self.context.protocol:
                self.context.protocol.kick_player(player_id, username, reason)
                logger.info(f"Requested to kick player {username} (ID: {player_id}): {reason}")
                return ActionResult(True, f"Kick request sent for {username}")
            else:
                return ActionResult(False, "No protocol available for kick request")
                
        except Exception as e:
            logger.error(f"Error requesting player kick: {e}")
            return ActionResult(False, f"Failed to request player kick: {str(e)}")


    def ban_player(self, player_id: str, username: str, reason: str = "No reason provided", duration: str = "permanent") -> ActionResult:
        """Request to ban a player from the session"""
        try:
            if hasattr(self.context, 'protocol') and self.context.protocol:
                self.context.protocol.ban_player(player_id, username, reason, duration)
                logger.info(f"Requested to ban player {username} (ID: {player_id}) for {duration}: {reason}")
                return ActionResult(True, f"Ban request sent for {username}")
            else:
                return ActionResult(False, "No protocol available for ban request")
                
        except Exception as e:
            logger.error(f"Error requesting player ban: {e}")
            return ActionResult(False, f"Failed to request player ban: {str(e)}")


    def get_network_state(self) -> Dict[str, Any]:
        """Get current network state for GUI"""
        try:
            if hasattr(self.context, 'network_state'):
                return self.context.network_state.copy()
            else:
                return {
                    'connected': False,
                    'players': [],
                    'player_count': 0,
                    'connection_status': {},
                    'last_updated': 0
                }
        except Exception as e:
            logger.error(f"Error getting network state: {e}")
            return {'error': str(e)}


    def request_connection_status(self) -> ActionResult:
        """Request current connection status from server"""
        try:
            if hasattr(self.context, 'protocol') and self.context.protocol:
                self.context.protocol.request_connection_status()
                logger.debug("Requested connection status from server")
                return ActionResult(True, "Requested connection status from server")
            else:
                return ActionResult(False, "No protocol available for status request")
                
        except Exception as e:
            logger.error(f"Error requesting connection status: {e}")
            return ActionResult(False, f"Failed to request connection status: {str(e)}")


    def add_chat_message(self, message: str) -> ActionResult:
        """Add message to chat log"""
        try:
            if hasattr(self.context, 'chat_messages'):
                self.context.chat_messages.append({
                    'message': message,
                    'timestamp': time.time()
                })
                logger.debug(f"Added chat message: {message}")
                return ActionResult(True, "Chat message added")
            else:
                logger.warning(f"No chat system available, message: {message}")
                return ActionResult(False, "No chat system available")
                
        except Exception as e:
            logger.error(f"Error adding chat message: {e}")
            return ActionResult(False, f"Failed to add chat message: {str(e)}")

    # ============================================================================
    # CHARACTER MANAGEMENT METHODS
    # ============================================================================
    
    def create_character(self, character_data: Dict[str, Any]) -> ActionResult:
        """Create a new character through CharacterManager"""
        try:
            if not self.context.CharacterManager:
                return ActionResult(False, "CharacterManager not available")
            
            result = self.context.CharacterManager.create_character(character_data)
            if result['success']:
                logger.info(f"Character created: {character_data.get('name', 'Unknown')}")
                return ActionResult(True, "Character created", {"character_id": result['character_id']})
            else:
                return ActionResult(False, result.get('message', 'Character creation failed'))
                logger.error(f"Character creation failed: {result.get('message', 'Unknown error')}")
                
        except Exception as e:
            logger.error(f"Error creating character: {e}")
            return ActionResult(False, f"Failed to create character: {str(e)}")
    
    def add_character(self, character_obj, legacy_data: Optional[Dict] = None) -> ActionResult:
        """Add a character object through CharacterManager"""
        try:
            if not self.context.CharacterManager:
                return ActionResult(False, "CharacterManager not available")
            
            entity_id = self.context.CharacterManager.add_character(character_obj, legacy_data)
            logger.info(f"Character added: {character_obj.name}")
            return ActionResult(True, "Character added", {"entity_id": entity_id})
                
        except Exception as e:
            logger.error(f"Error adding character: {e}")
            return ActionResult(False, f"Failed to add character: {str(e)}")
    
    def get_character(self, character_id: str) -> ActionResult:
        """Get a character by ID through CharacterManager"""
        try:
            if not self.context.CharacterManager:
                return ActionResult(False, "CharacterManager not available")
            
            character = self.context.CharacterManager.get_character(character_id)
            if character:
                return ActionResult(True, "Character found", {"character": character})
            else:
                return ActionResult(False, "Character not found")
                
        except Exception as e:
            logger.error(f"Error getting character: {e}")
            return ActionResult(False, f"Failed to get character: {str(e)}")
    
    def list_characters(self) -> ActionResult:
        """Get all characters through CharacterManager"""
        try:
            if not self.context.CharacterManager:
                return ActionResult(False, "CharacterManager not available")
            
            characters = self.context.CharacterManager.list_characters()
            return ActionResult(True, f"Found {len(characters)} characters", {"characters": characters})
                
        except Exception as e:
            logger.error(f"Error listing characters: {e}")
            return ActionResult(False, f"Failed to list characters: {str(e)}")
    
    def update_character(self, character_id: str, character_obj=None, legacy_data: Optional[Dict] = None) -> ActionResult:
        """Update a character through CharacterManager"""
        try:
            if not self.context.CharacterManager:
                return ActionResult(False, "CharacterManager not available")
            
            # If we have a character object, update it directly
            if character_obj:
                result = self.context.CharacterManager.update_character(character_id, character_obj)
                if result:
                    logger.info(f"Character updated: {character_id}")
                    return ActionResult(True, "Character updated")
                else:
                    return ActionResult(False, "Character update failed")
            else:
                # If no character object, we can't update
                return ActionResult(False, "No character object provided for update")
                
        except Exception as e:
            logger.error(f"Error updating character: {e}")
            return ActionResult(False, f"Failed to update character: {str(e)}")
    
    def delete_character(self, character_id: str) -> ActionResult:
        """Delete a character through CharacterManager"""
        try:
            if not self.context.CharacterManager:
                return ActionResult(False, "CharacterManager not available")
            
            result = self.context.CharacterManager.delete_character(character_id)
            if result:
                logger.info(f"Character deleted: {character_id}")
                return ActionResult(True, "Character deleted")
            else:
                return ActionResult(False, "Character deletion failed")
                
        except Exception as e:
            logger.error(f"Error deleting character: {e}")
            return ActionResult(False, f"Failed to delete character: {str(e)}")
    
    def save_character(self, character_id: str, character_obj=None, legacy_data: Optional[Dict] = None) -> ActionResult:
        """Save a character through CharacterManager"""
        try:
            if not self.context.CharacterManager:
                return ActionResult(False, "CharacterManager not available")
            
            result = self.context.CharacterManager.save_character(character_id, character_obj, legacy_data)
            if result:
                logger.info(f"Character saved: {character_id}")
                return ActionResult(True, "Character saved")
            else:
                return ActionResult(False, "Character save failed")
                
        except Exception as e:
            logger.error(f"Error saving character: {e}")
            return ActionResult(False, f"Failed to save character: {str(e)}")
    
    def load_character(self, character_id: str) -> ActionResult:
        """Load a character from storage through CharacterManager"""
        try:
            if not self.context.CharacterManager:
                return ActionResult(False, "CharacterManager not available")
            
            result = self.context.CharacterManager.load_character(character_id)
            if result:
                logger.info(f"Character loaded: {character_id}")
                return ActionResult(True, "Character loaded", {"character": result})
            else:
                return ActionResult(False, "Character load failed")
                
        except Exception as e:
            logger.error(f"Error loading character: {e}")
            return ActionResult(False, f"Failed to load character: {str(e)}")
    
    def open_character_creator(self) -> ActionResult:
        """Open the character creator window"""
        try:
            if hasattr(self.context, 'character_creator') and self.context.character_creator:
                self.context.character_creator.open_creator()
                logger.info("Character creator opened successfully")
                return ActionResult(True, "Character creator opened")
            else:
                logger.error("Character creator not available in context")
                return ActionResult(False, "Character creator not available")
        except Exception as e:
            logger.error(f"Error opening character creator: {e}")
            return ActionResult(False, f"Failed to open character creator: {str(e)}")
    
    def open_character_creator_for_character(self, character_id: str) -> ActionResult:
        """Open the character creator for editing an existing character"""
        try:
            if not self.context.CharacterManager:
                return ActionResult(False, "CharacterManager not available")
            
            character = self.context.CharacterManager.get_character(character_id)
            if not character:
                return ActionResult(False, "Character not found")
            
            if hasattr(self.context, 'character_creator') and self.context.character_creator:
                self.context.character_creator.open_creator(character)
                logger.info(f"Character creator opened for character {character_id}")
                return ActionResult(True, "Character creator opened for editing")
            else:
                logger.error("Character creator not available in context")
                return ActionResult(False, "Character creator not available")
                
        except Exception as e:
            logger.error(f"Error opening character creator for character {character_id}: {e}")
            return ActionResult(False, f"Failed to open character creator: {str(e)}")
    
    def duplicate_character(self, character_id: str, new_name: Optional[str] = None) -> Optional[str]:
        """Duplicate an existing character"""
        try:
            if not self.context.CharacterManager:
                logger.error("CharacterManager not available")
                return None
            
            result = self.context.CharacterManager.duplicate_character(character_id, new_name)
            if result:
                logger.info(f"Character duplicated: {character_id} -> {result}")
                return result
            else:
                logger.error(f"Failed to duplicate character: {character_id}")
                return None
                
        except Exception as e:
            logger.error(f"Error duplicating character {character_id}: {e}")
            return None
    
    def add_character_from_creator(self, character_obj, character_data: Dict) -> Optional[str]:
        """Add a character created from the character creator"""
        try:
            if not self.context.CharacterManager:
                logger.error("CharacterManager not available")
                return None
            
            # Use the character object if available, otherwise use create_character_from_creator_data
            if character_obj:
                result = self.context.CharacterManager.add_character(character_obj, character_data)
                logger.info(f"Character added from creator: {character_obj.name}")
                return result
            else:
                # If no character object, use the creator data
                result = self.context.CharacterManager.create_character_from_creator_data(character_data)
                logger.info(f"Character created from creator data: {result}")
                return result
                
        except Exception as e:
            logger.error(f"Error adding character from creator: {e}")
            return None

    # ============================================================================
    # SERVER CHARACTER MANAGEMENT METHODS
    # ============================================================================
    
    def save_character_to_server(self, character_data: Dict[str, Any], session_code: Optional[str] = None) -> ActionResult:
        """Save character to server"""
        try:
            if not hasattr(self.context, 'protocol') or not self.context.protocol:
                return ActionResult(False, "Not connected to server")
            
            self.context.protocol.character_save(character_data, session_code)
            logger.info(f"Character save request sent: {character_data.get('name', 'Unknown')}")
            return ActionResult(True, "Character save request sent")
                
        except Exception as e:
            logger.error(f"Error saving character to server: {e}")
            return ActionResult(False, f"Failed to save character: {str(e)}")
    
    def load_character_from_server(self, character_id: str, session_code: Optional[str] = None) -> ActionResult:
        """Load character from server"""
        try:
            if not hasattr(self.context, 'protocol') or not self.context.protocol:
                return ActionResult(False, "Not connected to server")
            
            self.context.protocol.character_load(character_id, session_code)
            logger.info(f"Character load request sent: {character_id}")
            return ActionResult(True, "Character load request sent")
                
        except Exception as e:
            logger.error(f"Error loading character from server: {e}")
            return ActionResult(False, f"Failed to load character: {str(e)}")
    
    def list_server_characters(self, session_code: Optional[str] = None) -> ActionResult:
        """Request character list from server"""
        try:
            if not hasattr(self.context, 'protocol') or not self.context.protocol:
                return ActionResult(False, "Not connected to server")
            
            self.context.protocol.character_list(session_code)
            logger.info("Character list request sent")
            return ActionResult(True, "Character list request sent")
                
        except Exception as e:
            logger.error(f"Error requesting character list: {e}")
            return ActionResult(False, f"Failed to request character list: {str(e)}")
    
    def delete_server_character(self, character_id: str, session_code: Optional[str] = None) -> ActionResult:
        """Delete character from server"""
        try:
            if not hasattr(self.context, 'protocol') or not self.context.protocol:
                return ActionResult(False, "Not connected to server")
            
            self.context.protocol.character_delete(character_id, session_code)
            logger.info(f"Character delete request sent: {character_id}")
            return ActionResult(True, "Character delete request sent")
                
        except Exception as e:
            logger.error(f"Error deleting character from server: {e}")
            return ActionResult(False, f"Failed to delete character: {str(e)}")
    
    # Server response handlers
    def handle_character_save_response(self, data: Dict[str, Any]) -> None:
        """Handle character save response from server"""
        try:
            if data.get('success'):
                character_name = data.get('character_name', 'Unknown')
                self.add_chat_message(f"✅ Character saved to server: {character_name}")
                logger.info(f"Character saved to server: {character_name}")
            else:
                error = data.get('error', 'Unknown error')
                self.add_chat_message(f"❌ Failed to save character: {error}")
                logger.error(f"Character save failed: {error}")
        except Exception as e:
            logger.error(f"Error handling character save response: {e}")
    
    def handle_character_load_response(self, data: Dict[str, Any]) -> None:
        """Handle character load response from server"""
        try:
            if data.get('success'):
                character_data = data.get('character_data')
                if character_data:
                    # Add character to local character manager
                    if self.context.CharacterManager:
                        result = self.context.CharacterManager.create_character_from_creator_data(character_data)
                        if result:
                            character_name = character_data.get('name', 'Unknown')
                            self.add_chat_message(f"📥 Character loaded from server: {character_name}")
                            logger.info(f"Character loaded and added locally: {character_name}")
                        else:
                            self.add_chat_message("❌ Failed to add loaded character locally")
                    else:
                        self.add_chat_message("⚠️ Character loaded but CharacterManager not available")
                else:
                    self.add_chat_message("❌ Character load response missing data")
            else:
                error = data.get('error', 'Unknown error')
                self.add_chat_message(f"❌ Failed to load character: {error}")
                logger.error(f"Character load failed: {error}")
        except Exception as e:
            logger.error(f"Error handling character load response: {e}")
    
    def handle_character_list_response(self, data: Dict[str, Any]) -> None:
        """Handle character list response from server"""
        try:
            if data.get('success'):
                characters = data.get('characters', [])
                if characters:
                    char_names = [char.get('name', f"ID: {char.get('id', 'Unknown')}") for char in characters]
                    self.add_chat_message(f"📋 Server characters ({len(characters)}): {', '.join(char_names)}")
                else:
                    self.add_chat_message("📋 No characters found on server")
                logger.info(f"Character list received: {len(characters)} characters")
            else:
                error = data.get('error', 'Unknown error')
                self.add_chat_message(f"❌ Failed to get character list: {error}")
                logger.error(f"Character list failed: {error}")
        except Exception as e:
            logger.error(f"Error handling character list response: {e}")
    
    def handle_character_delete_response(self, data: Dict[str, Any]) -> None:
        """Handle character delete response from server"""
        try:
            if data.get('success'):
                character_name = data.get('character_name', 'Unknown')
                self.add_chat_message(f"🗑️ Character deleted from server: {character_name}")
                logger.info(f"Character deleted from server: {character_name}")
            else:
                error = data.get('error', 'Unknown error')
                self.add_chat_message(f"❌ Failed to delete character: {error}")
                logger.error(f"Character delete failed: {error}")
        except Exception as e:
            logger.error(f"Error handling character delete response: {e}")

    # ============================================================================
    # FOG OF WAR METHODS
    # ============================================================================
    
    def update_fog_rectangles(self, table_id: str, hide_rectangles: List, reveal_rectangles: List) -> ActionResult:
        """Update fog of war rectangles"""
        try:
            if not hasattr(self.context, 'protocol') or not self.context.protocol:
                return ActionResult(False, "Not connected to server")
            
            # Update local state
            if self.context.current_table and str(self.context.current_table.table_id) == table_id:
                fog_tool = getattr(self.context, 'fog_of_war_tool', None)
                if fog_tool:
                    fog_tool.hide_rectangles = hide_rectangles
                    fog_tool.reveal_rectangles = reveal_rectangles
                    fog_tool._update_fog_layer()
                    fog_tool._reset_fog_texture()
            
            # Send to server using table update message
            try:
                # Use Message format that matches ServerProtocol expectations
                
                
                msg = Message(MessageType.TABLE_UPDATE, {
                    'category': 'table',
                    'type': 'fog_update',
                    'data': {
                        'table_id': table_id,
                        'hide_rectangles': hide_rectangles,
                        'reveal_rectangles': reveal_rectangles
                    }
                })
                
                if hasattr(self.context.protocol, 'send'):
                    self.context.protocol.send(msg.to_json())
                    logger.debug(f"Sent fog update to server for {table_id}")
                else:
                    return ActionResult(False, "Protocol send method not available")
            except Exception as e:
                logger.error(f"Failed to send fog update to server: {e}")
                return ActionResult(False, f"Failed to send fog update: {str(e)}")
            
            return ActionResult(True, "Fog update sent")
        except Exception as e:
            return ActionResult(False, f"Failed to update fog: {str(e)}")

    def handle_fog_update_response(self, data: Dict[str, Any]) -> None:
        """Handle fog update response from server"""
        try:
            table_id = data.get('table_id')
            hide_rectangles = data.get('hide_rectangles', [])
            reveal_rectangles = data.get('reveal_rectangles', [])
            
            logger.debug(f"Handling fog update for table {table_id}: {len(hide_rectangles)} hide, {len(reveal_rectangles)} reveal")
            
            if (self.context.current_table and 
                str(self.context.current_table.table_id) == table_id):
                
                # Update the table's fog_rectangles directly for persistence
                if hasattr(self.context.current_table, 'fog_rectangles'):
                    self.context.current_table.fog_rectangles = {
                        'hide': hide_rectangles,
                        'reveal': reveal_rectangles
                    }
                
                # Update fog tool if available
                fog_tool = getattr(self.context, 'fog_of_war_tool', None)
                if fog_tool:
                    fog_tool.hide_rectangles = hide_rectangles
                    fog_tool.reveal_rectangles = reveal_rectangles
                    fog_tool._update_fog_layer()
                    fog_tool._reset_fog_texture()
                    logger.debug("Updated fog tool with new rectangles")
                else:
                    logger.warning("Fog tool not available to update")
                    
                # Also store in fog_of_war layer for consistency
                self._update_fog_layer_with_rectangles(table_id, hide_rectangles, reveal_rectangles)
                    
            self.add_chat_message("🌫️ Fog of war updated")
        except Exception as e:
            logger.error(f"Error handling fog update: {e}")

    def get_fog_rectangles(self, table_id: str) -> ActionResult:
        """Get current fog of war rectangles from local context"""
        try:
            if (self.context.current_table and 
                str(self.context.current_table.table_id) == table_id):
                
                fog_tool = getattr(self.context, 'fog_of_war_tool', None)
                if fog_tool:
                    fog_data = {
                        'hide': fog_tool.hide_rectangles,
                        'reveal': fog_tool.reveal_rectangles
                    }
                    return ActionResult(True, "Fog rectangles retrieved", {'fog_rectangles': fog_data})
                
            return ActionResult(True, "No fog data available", {'fog_rectangles': {'hide': [], 'reveal': []}})
        except Exception as e:
            return ActionResult(False, f"Failed to get fog rectangles: {str(e)}")

    def _update_fog_layer_with_rectangles(self, table_id: str, hide_rectangles: List, reveal_rectangles: List):
        """Update the table's fog rectangle data for persistence"""
        try:
            if not (self.context.current_table and 
                    str(self.context.current_table.table_id) == table_id):
                return
            
            # Store rectangles in the table for persistence AND rendering
            self.context.current_table.fog_rectangles = {
                'hide': hide_rectangles,
                'reveal': reveal_rectangles
            }
            
            logger.debug(f"Updated table fog data: {len(hide_rectangles)} hide, {len(reveal_rectangles)} reveal rectangles")
            
        except Exception as e:
            logger.error(f"Error updating fog data: {e}")



