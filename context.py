import ctypes
import os
import queue
import logging
import time
import uuid
import xxhash  # Add xxhash import
from typing import Optional, Dict, List, Any, Union, TYPE_CHECKING
from net.protocol import Message, MessageType
from Actions import Actions  
from GeometricManager import GeometricManager
from ContextTable import ContextTable
from AssetManager import ClientAssetManager
from RenderManager import RenderManager
from Sprite import Sprite

# SDL3 type hints using actual SDL3 types
if TYPE_CHECKING:  
    from ctypes import c_void_p
    from CompendiumManager import CompendiumManager
    from LightManager import LightManager
    from LayoutManager import LayoutManager
    from gui.gui_imgui import SimplifiedGui
    
    SDL_Renderer = c_void_p
    SDL_Window = c_void_p 
    SDL_GLContext = c_void_p
else:
    # At runtime, SDL3 objects are what they are - use Any for typing
    SDL_Renderer = Any
    SDL_Window = Any
    SDL_GLContext = Any


logger = logging.getLogger(__name__)

CELL_SIDE: int = 20
MIN_SCALE: float = 0.1
MAX_SCALE: float = 10.0
MAX_TABLE_X: float = 200.0
MIN_TABLE_X: float = -1000.0
MAX_TABLE_Y: float = 200.0
MIN_TABLE_Y: float = -1000.0

class Context:
    def __init__(self, 
                 renderer: SDL_Renderer, 
                 window: SDL_Window, 
                 base_width: int, 
                 base_height: int) -> None:
        
        self.step: ctypes.c_float = ctypes.c_float(1)
        self.sprites_list: List[Sprite] = []
        # Graphics context
        self.window: SDL_Window = window
        self.renderer: SDL_Renderer = renderer        
        self.gl_context: Optional[SDL_GLContext] = None
        
        # Window dimensions
        self.base_width: int = base_width
        self.base_height: int = base_height
        self.window_width: ctypes.c_int = ctypes.c_int()
        self.window_height: ctypes.c_int = ctypes.c_int()
       
        # For manage  mouse state:
        self.resizing: bool = False
        self.grabing: bool = False
        self.mouse_state: Optional[int] = None  # SDL mouse state flags
        self.cursor: Optional[Any] = None  # SDL cursor - could be typed more specifically
        self.moving_table: bool = False
        self.cursor_position_x: float = 0.0
        self.cursor_position_y: float = 0.0
        
        # Layout information for window areas
        self.table_viewport: Optional[tuple[int, int, int, int]] = None
        self.layout: Dict[str, Union[tuple[int, int, int, int], int]] = {
            'table_area': (0, 0, 0, 0),
            'gui_area': (0, 0, 0, 0),
            'spacing': 0
        }
        
        # Time management
        self.last_time: float = 0
        self.current_time: float = 0     

        # Tables management
        self.current_table: Optional[ContextTable] = None
        self.list_of_tables: List[ContextTable] = []       
        # Managers
        self.LayoutManager: Optional['LayoutManager'] = None
        self.LightingManager: Optional['LightManager'] = None        
        self.CompendiumManager: Optional['CompendiumManager'] = None
        self.GeometryManager: GeometricManager = GeometricManager() # Net section
        self.AssetManager: ClientAssetManager = ClientAssetManager()
        self.RenderManager: Optional[RenderManager] = None

        # Network
        self.net_client_started: bool = False
        self.net_socket: Optional[Any] = None
        self.queue_to_send: queue.PriorityQueue[Any] = queue.PriorityQueue(0)
        self.queue_to_read: queue.PriorityQueue[Any] = queue.PriorityQueue(0)
        self.waiting_for_table: bool = False
          # GUI system
        self.imgui: Optional['SimplifiedGui'] = None     
        self.chat_messages: List[str] = []
        
        # Current tool selection
        self.current_tool: str = "Select"
          
        # Actions protocol integration
        self.actions: Actions = Actions(self)
        
        # Light
        self.point_of_view_changed: bool = True 
        
        # Settings
        self.light_on: bool = True
        self.net: bool = True
        self.gui: bool = True
        
        # R2 Asset Management
        self.session_code: Optional[str] = None
        self.user_id: int = 1  # Default test user ID, will be updated by welcome message
        self.username: str = "Player"
        self.pending_uploads: Dict[str, Any] = {}  # {asset_id: upload_info}
        self.pending_upload_files: Dict[str, str] = {}  # {asset_id: file_path} for tracking files
        
        logger.info("Context initialized with Actions protocol")


    def add_sprite(self, texture_path, scale_x, scale_y, layer='tokens',
                   character=None, moving=False, speed=None,
                   collidable=False, table=None, coord_x=0.0, coord_y=0.0,sprite_id=None):
        """Add a sprite to the specified layer in the current table"""
        table = table if table else self.current_table
        if not table:
            logger.error("No table selected for sprite creation")
            return None
        
        # Validate layer exists
        if layer not in table.dict_of_sprites_list:
            logger.error(f"Invalid layer: {layer}")
            return None
        
        try:
            # Create sprite with error handling
            new_sprite = Sprite(
                self.renderer, 
                texture_path,
                scale_x=scale_x, 
                scale_y=scale_y, 
                character=character,
                moving=moving, 
                speed=speed, 
                collidable=collidable,
                coord_x=coord_x,
                coord_y=coord_y,
                sprite_id=sprite_id,
                layer=layer,
                context=self,  # Pass context for R2 requests
            )

            # Check if sprite creation was successful
            if not new_sprite or not hasattr(new_sprite, 'texture') or not new_sprite.texture:
                logger.error(f"Failed to create sprite from {texture_path}")
                # Clean up any partially created sprite
                if new_sprite:
                    try:
                        new_sprite.cleanup()  
                    except:
                        pass
                return None
            
            # Add to table's sprite list
            table.dict_of_sprites_list[layer].append(new_sprite)
            
            # Set as selected sprite if none selected
            if table.selected_sprite is None:
                table.selected_sprite = new_sprite
                
            logger.info(f"Successfully added sprite from {texture_path} to layer {layer}")
            return new_sprite
        except Exception as e:
            logger.error(f"Error creating sprite from {texture_path}: {e}")
            return None
    
    def find_sprite_by_id(self, sprite_id, table_id=None):
        """Find and return a sprite by its ID from all layers in the table.
        
        Args:
            sprite_id: The sprite ID to search for
            table_identifier: Either table name or table_id (UUID). If None, uses current table
        """
        # Use current table if no table identifier provided
        if table_id is None:
            table = self.current_table
            if table:
                table_id = table.table_id
            else:
                logger.error("No current table and no table_identifier provided")
                return None
        else:
            # Try to find table by name first, then by table_id
            table = next((t for t in self.list_of_tables if t.name == table_id), None)
            if not table:
                # Try finding by table_id (UUID)
                table = next((t for t in self.list_of_tables if t.table_id == table_id), None)
        
        if not table or not sprite_id:
            logger.error(f"Table '{table_id}' not found or sprite_id is None")
            return None
            
        for layer, sprite_list in table.dict_of_sprites_list.items():
            for sprite_obj in sprite_list:
                if hasattr(sprite_obj, 'sprite_id') and sprite_obj.sprite_id == sprite_id:
                    logger.debug(f"Found sprite {sprite_id} in layer {layer}")
                    return sprite_obj
                # Fallback for alternate id attribute
                if hasattr(sprite_obj, 'id') and sprite_obj.id == sprite_id:
                    logger.debug(f"Found sprite {sprite_id} (by id attr) in layer {layer}")
                    return sprite_obj
        logger.warning(f"Sprite with ID '{sprite_id}' not found in table '{table.name if table else 'Unknown'}'")
        return None
    
    def remove_sprite(self, sprite_to_remove, table=None):
        """Remove sprite and clean up its resources"""
        table = table if table else self.current_table
        if not table:
            logger.error("No table selected for sprite removal")
            return False
        
        try:
            # Find and remove sprite from all layers
            for layer, sprite_list in table.dict_of_sprites_list.items():
                if sprite_to_remove in sprite_list:
                    sprite_list.remove(sprite_to_remove)
                    
                    # Update selected sprite if it was removed
                    if table.selected_sprite == sprite_to_remove:
                        # Select another sprite or set to None
                        table.selected_sprite = None
                        for layer_sprites in table.dict_of_sprites_list.values():
                            if layer_sprites:
                                table.selected_sprite = layer_sprites[0]
                                break
                    
                    # Clean up sprite resources
                    if hasattr(sprite_to_remove, 'cleanup'):
                        sprite_to_remove.cleanup()
                    
                    logger.info(f"Successfully removed sprite from layer {layer}")
                    return True
            
            logger.warning("Sprite not found in any layer")
            return False
            
        except Exception as e:
            logger.error(f"Error removing sprite: {e}")
            return False

    def cleanup_table(self, table=None):
        """Clean up all sprites in a table"""
        table = table if table else self.current_table
        if not table:
            return
        
        try:
            for layer, sprite_list in table.dict_of_sprites_list.items():
                for sprite_obj in sprite_list:
                    if hasattr(sprite_obj, 'cleanup'):
                        sprite_obj.cleanup()
                sprite_list.clear()
            
            table.selected_sprite = None
            logger.info(f"Cleaned up table: {table.name}")
        except Exception as e:
            logger.error(f"Error cleaning up table: {e}")
    
    def add_table(self, name, width, height,table_id=None) -> 'ContextTable | None':
        """Add a new table and return it"""
        try:
            table = ContextTable(name, width, height)
            
            if table_id:
                table.table_id = table_id
            else:
                table.table_id = str(uuid.uuid4())
                
            self.list_of_tables.append(table)
            
            # Set as current table if it's the first one
            if not self.current_table:
                self.current_table = table
                
            logger.info(f"Added table: {name} ({width}x{height})")
            return table
            
        except Exception as e:
            logger.error(f"Error adding table: {e}")
            return None
    
    def create_table_from_json(self, json_data):
        """Create table from JSON data"""
        try:
            logger.info(f"Creating table from JSON: {json_data}")   
            # Get table info from JSON data
            table_name = json_data.get('table_name')
            table_id = json_data.get('table_id')  # May be None for legacy saves
            
            # Create the table
            table = ContextTable(
                table_name=table_name,
                width=json_data.get('width', 1920), 
                height=json_data.get('height', 1080),
                table_id=table_id
            )
            
            self.list_of_tables.append(table)
            
            # Set as current table if it's the first one
            if not self.current_table:
                self.current_table = table
            
            # Set table properties
            table.scale = json_data.get('scale', 1.0)
            table.x_moved = json_data.get('x_moved', 1.0)
            table.y_moved = json_data.get('y_moved', 1.0)
            table.show_grid = json_data.get('show_grid', True)
            table.cell_side = json_data.get('cell_side', CELL_SIDE)
            print(json_data)
            # Add sprites from layers
            layers_data = json_data.get('layers', {})
            print('4')
            print(layers_data.items())
            for layer, sprites_data in layers_data.items():
                print(f"sprite data: {sprites_data}, layer: {layer}")
                print(f"Processing layer: {layer} with {len(sprites_data)} sprites")
                if layer in table.layers:  # Only add to valid layers
                    for sprite_data in sprites_data.values():
                        print(f"Creating sprite from data: {sprite_data}")
                        try:
                            # Create sprite with proper parameters
                            print(f"Adding sprite with id: {sprite_data.get('sprite_id', None)}")
                            sprite = self.add_sprite(
                                texture_path=sprite_data.get('texture_path', '').encode(),
                                scale_x=sprite_data.get('scale_x', 1.0),
                                scale_y=sprite_data.get('scale_y', 1.0),
                                layer=layer,
                                character=sprite_data.get('character'),
                                moving=sprite_data.get('moving', False),
                                speed=sprite_data.get('speed'),
                                collidable=sprite_data.get('collidable', False),
                                table=table,
                                coord_x=sprite_data.get('position', ([0,0]))[0],
                                coord_y=sprite_data.get('position', ([0,0]))[1],
                                sprite_id=sprite_data.get('sprite_id', None)
                            )
                            
                            if not sprite:
                                logger.warning(f"Failed to create sprite from {sprite_data.get('texture_path')}")
                                
                        except Exception as e:
                            logger.error(f"Error creating sprite: {e}")
                            continue
            
            logger.info(f"Successfully created table '{table.name}' from JSON")
            return table
            
        except Exception as e:
            logger.error(f"Error creating table from JSON: {e}")
            return None

    def setup_protocol(self, send_callback):
        """Initialize protocol handler"""
        from net.client_protocol import ClientProtocol        
        self.protocol = ClientProtocol(self, send_callback)
        return self.protocol

    def send_table_update(self, update_type: str, data: dict):
        """Send table update to server"""
        if hasattr(self, 'protocol'):
            self.protocol.send_update(update_type, data)

    # Actions protocol convenience methods
    def create_table_via_actions(self, name: str, width: int, height: int):
        """Create table using Actions protocol"""
        table_id = name  # Use name as ID for simplicity
        result = self.actions.create_table(table_id, name, width, height)
        if result.success:
            logger.info(f"Table created via actions: {result.message}")
            return self._get_table_by_name(name)
        else:
            logger.error(f"Failed to create table: {result.message}")
            return None
    
    def add_sprite_via_actions(self, sprite_id: str, image_path: str, position_x: float, position_y: float, layer: str = "tokens"):
        """Add sprite using Actions protocol"""
        if not self.current_table:
            logger.error("No current table for sprite creation")
            return None
            
        from core_table.actions_protocol import Position
        position = Position(position_x, position_y)
        table_id = self.current_table.name
        
        result = self.actions.create_sprite(table_id, sprite_id, position, image_path, layer)
        if result.success:
            logger.info(f"Sprite created via actions: {result.message}")
            return True
        else:
            logger.error(f"Failed to create sprite: {result.message}")
            return False
    
    def move_sprite_via_actions(self, sprite_id: str, new_x: float, new_y: float):
        """Move sprite using Actions protocol"""
        if not self.current_table:
            return False
            
        from core_table.actions_protocol import Position
        position = Position(new_x, new_y)
        table_id = self.current_table.name
        
        result = self.actions.move_sprite(table_id, sprite_id, position)
        return result.success
    
    def delete_sprite_via_actions(self, sprite_id: str):
        """Delete sprite using Actions protocol"""
        if not self.current_table:
            return False
            
        table_id = self.current_table.name
        result = self.actions.delete_sprite(table_id, sprite_id)
        return result.success
    def get_table_sprites_via_actions(self, layer=None):
        """Get sprites using Actions protocol"""
        if not self.current_table:
            return {}
            
        table_id = self.current_table.name
        result = self.actions.get_table_sprites(table_id, layer)
        if result.success and result.data:
            return result.data.get('sprites', {})
        return {}
    
    def add_chat_message(self, message: str):
        """Add message to chat history"""
        timestamp = time.strftime("%H:%M:%S")
        self.chat_messages.append(f"[{timestamp}] {message}")
        # Keep only last 100 messages
        if len(self.chat_messages) > 100:
            self.chat_messages.pop(0)
        logger.info(f"Chat: {message}")
    
    def set_current_tool(self, tool: str):
        """Set the current tool"""
        self.current_tool = tool
        logger.info(f"Tool changed to: {tool}")
    def _get_table_by_name(self, name: str):
        """Helper to get table by name"""
        for table in self.list_of_tables:
            if table.name == name:
                return table
        return None
    
    def _get_table_by_id(self, table_id: str):
        """Helper to get table by table_id (UUID)"""
        for table in self.list_of_tables:
            if table.table_id == table_id:
                return table
        return None

    # R2 Asset Management Methods
    def request_asset_upload(self, file_path: str, filename: Optional[str] = None) -> bool:
        """Request an upload URL for an asset from the server with xxHash-based ID"""
        if not hasattr(self, 'queue_to_send'):
            logger.error("No network connection available for asset upload request")
            return False
            
        if not os.path.exists(file_path):
            logger.error(f"File not found: {file_path}")
            return False
            
        if not filename:
            filename = os.path.basename(file_path)
        
        try:
            # Calculate xxHash for the file (fast)
            file_xxhash = self._calculate_file_xxhash(file_path)
            if not file_xxhash:
                logger.error(f"Failed to calculate xxHash for {file_path}")
                return False
            
            # Check if file already exists by xxHash (duplicate detection)
            existing_asset_id = self.AssetManager.find_asset_by_xxhash(file_xxhash)
            if existing_asset_id:
                logger.info(f"File {filename} already exists as asset {existing_asset_id} (xxHash: {file_xxhash})")
                # Register the existing asset in our local cache if not already
                if not self.AssetManager.is_asset_cached(existing_asset_id):
                    self.AssetManager.register_uploaded_asset(existing_asset_id, file_path, filename)
                return True
            
            # Generate asset ID based on xxHash (deterministic)
            asset_id = f"asset_{file_xxhash[:16]}"  # Use first 16 chars of xxHash
            
            # Get file size and content type
            file_size = os.path.getsize(file_path)
            import mimetypes
            content_type, _ = mimetypes.guess_type(filename)
            content_type = content_type or "application/octet-stream"
            
            logger.info(f"Requesting upload for {filename} (xxHash: {file_xxhash}, size: {file_size} bytes)")
            
            upload_request = Message(
                MessageType.ASSET_UPLOAD_REQUEST,
                {
                    "filename": filename,
                    "asset_id": asset_id,
                    "file_size": file_size,
                    "content_type": content_type,
                    "xxhash": file_xxhash,  # Include xxHash in request
                    "session_code": self.session_code or "unknown",
                    "user_id": self.user_id or 0,
                    "username": self.username
                }
            )
            
            self.queue_to_send.put((1, upload_request))
            logger.info(f"Requested upload URL for asset {asset_id}: {filename} (xxHash: {file_xxhash})")
            
            # Store file path and upload info for when we get the upload URL
            self.pending_upload_files[asset_id] = file_path
            self.pending_uploads[asset_id] = {
                "filename": filename,
                "file_path": file_path,
                "file_size": file_size,
                "content_type": content_type,
                "xxhash": file_xxhash,
                "requested_at": time.time()
            }
            
            logger.debug(f"Stored upload info for asset {asset_id}")
            return True
            
        except Exception as e:
            logger.error(f"Failed to request asset upload for {filename}: {e}")
            return False

    def request_asset_download(self, asset_id: str) -> bool:
        """Request download URL for an asset from the server"""
        if not hasattr(self, 'queue_to_send'):
            logger.error("No network connection available for asset download request")
            return False
            
        asset_manager= self.AssetManager       
        # Don't request if already cached
        if asset_manager.is_asset_cached(asset_id):
            logger.debug(f"Asset {asset_id} already cached, no download needed")
            return True
            
        download_request = Message(
            MessageType.ASSET_DOWNLOAD_REQUEST,
            {
                "asset_id": asset_id,
                "session_code": self.session_code or "unknown",
                "user_id": self.user_id or 0,
                "username": self.username
            }
        )
        
        try:
            self.queue_to_send.put((1, download_request))
            logger.info(f"Requested download for asset {asset_id}")            
            return True
        except Exception as e:
            logger.error(f"Failed to request asset download {asset_id}: {e}")
            return False

    def request_session_assets(self) -> bool:
        """Request list of assets available for the current session"""
        if not hasattr(self, 'queue_to_send'):
            logger.error("No network connection available for asset list request")
            return False
            
        list_request = Message(
            MessageType.ASSET_LIST_REQUEST,
            {
                "session_code": self.session_code or "unknown",
                "user_id": self.user_id or 0,
                "username": self.username
            }
        )
        
        try:
            self.queue_to_send.put((1, list_request))
            logger.info(f"Requested asset list for session {self.session_code}")
            return True
        except Exception as e:
            logger.error(f"Failed to request session assets: {e}")
            return False

    def reload_sprites_from_r2_assets(self):
        """Reload all sprites that have R2 assets available"""
        if not self.current_table:
            return
            
        reloaded_count = 0
        for layer_name, sprites in self.current_table.dict_of_sprites_list.items():
            for sprite_obj in sprites:
                if hasattr(sprite_obj, 'reload_texture_from_r2') and sprite_obj.has_r2_asset():
                    if sprite_obj.is_r2_asset_cached():
                        success = sprite_obj.reload_texture_from_r2()
                        if success:
                            reloaded_count += 1
                            logger.debug(f"Reloaded sprite {sprite_obj.sprite_id} from R2 asset {sprite_obj.asset_id}")
                    else:
                        # Request download if not cached
                        self.request_asset_download(sprite_obj.asset_id)
                        
        if reloaded_count > 0:
            logger.info(f"Reloaded {reloaded_count} sprites from R2 assets")

    def add_sprite_from_r2_asset(self, asset_id: str, filename: Optional[str] = None, layer: str = 'tokens', 
                                 coord_x: float = 0.0, coord_y: float = 0.0) -> Sprite:
        """Add a sprite using an R2 asset"""
        if not self.current_table:
            logger.error("No table selected for sprite creation")
            return None
            
        
        asset_manager = self.AssetManager
        
        # Try to get cached asset path
        texture_path = asset_manager.get_cached_asset_path(asset_id)
        if not texture_path:
            # Use a placeholder texture and request download
            texture_path = "resources/placeholder.png"  # Fallback texture
            self.request_asset_download(asset_id)
            logger.info(f"Asset {asset_id} not cached, using placeholder and requesting download")
          # Create sprite with asset_id
        new_sprite = self.add_sprite(
            texture_path=texture_path,
            layer=layer,
            coord_x=coord_x,
            coord_y=coord_y,
            scale_x=1.0,
            scale_y=1.0
        )
        
        if new_sprite:
            logger.info(f"Created sprite {new_sprite.sprite_id} from R2 asset {asset_id}")
        
        return new_sprite

    def _calculate_file_xxhash(self, file_path: str) -> str:
        """Calculate xxHash for a file (fast hash for asset identification)"""
        try:
            hasher = xxhash.xxh64()  # xxh64 is fast and has good distribution
            with open(file_path, 'rb') as f:
                for chunk in iter(lambda: f.read(65536), b""):  # 64KB chunks for speed
                    hasher.update(chunk)
            return hasher.hexdigest()
        except Exception as e:
            logger.error(f"Error calculating xxHash for {file_path}: {e}")
            return ""

    def handle_upload_response(self, message_data: Dict) -> bool:
        """Handle upload URL response from server"""
        try:
            asset_id = message_data.get('asset_id')
            upload_url = message_data.get('upload_url')
            success = message_data.get('success', False)
            error = message_data.get('error')
            required_xxhash = message_data.get('required_xxhash')
            
            if not success:
                logger.error(f"Upload request failed for asset {asset_id}: {error}")
                # Clean up pending upload
                self.pending_uploads.pop(asset_id, None)
                self.pending_upload_files.pop(asset_id, None)
                return False
            
            if not asset_id or not upload_url:
                logger.error("Invalid upload response: missing asset_id or upload_url")
                return False
            
            # Get file path from pending uploads
            file_path = self.pending_upload_files.get(asset_id)
            if not file_path or not os.path.exists(file_path):
                logger.error(f"File not found for asset {asset_id}: {file_path}")
                return False
            
            upload_info = self.pending_uploads.get(asset_id)
            if not upload_info:
                logger.error(f"No upload info found for asset {asset_id}")
                return False
            
            # Verify xxHash matches
            if required_xxhash and upload_info['xxhash'] != required_xxhash:
                logger.error(f"Hash mismatch for asset {asset_id}: expected {required_xxhash}, got {upload_info['xxhash']}")
                return False
            
            logger.info(f"Starting upload for asset {asset_id}: {upload_info['filename']}")
            
            # Perform the upload using the AssetManager
            success = self._perform_upload(
                file_path, 
                upload_url, 
                upload_info['xxhash'],
                upload_info['content_type']
            )
            
            if success:
                # Register asset in cache after successful upload
                self.AssetManager.register_uploaded_asset(
                    asset_id, 
                    file_path, 
                    upload_info['filename']
                )
                logger.info(f"Successfully uploaded and registered asset {asset_id}")
            else:
                logger.error(f"Failed to upload asset {asset_id}")
            
            # Clean up pending upload
            self.pending_uploads.pop(asset_id, None)
            self.pending_upload_files.pop(asset_id, None)
            
            return success
            
        except Exception as e:
            logger.error(f"Error handling upload response: {e}")
            return False

    def _perform_upload(self, file_path: str, upload_url: str, xxhash: str, content_type: str) -> bool:
        """Perform the actual file upload using the presigned URL"""
        try:
            import requests
            
            # Verify local file hash before upload
            local_xxhash = self._calculate_file_xxhash(file_path)
            if local_xxhash != xxhash:
                logger.error(f"Local hash mismatch before upload: expected {xxhash}, got {local_xxhash}")
                return False
            
            # Prepare headers
            headers = {
                'Content-Type': content_type,
                'x-amz-meta-xxhash': xxhash,  # Store xxHash in metadata
                'x-amz-meta-upload-timestamp': str(int(time.time()))
            }
            
            # Upload file
            with open(file_path, 'rb') as f:
                response = requests.put(upload_url, data=f, headers=headers, timeout=300)
                response.raise_for_status()
            
            logger.info(f"Successfully uploaded file {file_path} (xxHash: {xxhash})")
            return True
            
        except requests.exceptions.RequestException as e:
            logger.error(f"Upload request failed: {e}")
            return False
        except Exception as e:
            logger.error(f"Upload error: {e}")
            return False

    def request_asset_upload_by_hash(self, file_path: str, filename: Optional[str] = None) -> Optional[str]:
        """Request upload and return the asset ID (or existing asset ID if duplicate)"""
        if not filename:
            filename = os.path.basename(file_path)
        
        # Calculate hash first
        file_xxhash = self._calculate_file_xxhash(file_path)
        if not file_xxhash:
            return None
        
        # Check for existing asset
        existing_asset_id = self.AssetManager.find_asset_by_xxhash(file_xxhash)
        if existing_asset_id:
            logger.info(f"File {filename} already exists as asset {existing_asset_id}")
            return existing_asset_id
        
        # Request upload
        success = self.request_asset_upload(file_path, filename)
        if success:
            # Generate the same asset ID that would be created
            return f"asset_{file_xxhash[:16]}"
        
        return None

    def upload_and_create_sprite(self, file_path: str, layer: str = 'tokens', 
                                coord_x: float = 0.0, coord_y: float = 0.0) -> Optional[Sprite]:
        """Upload file and create sprite in one operation"""
        if not self.current_table:
            logger.error("No table selected for sprite creation")
            return None
        
        # Get or create asset
        asset_id = self.request_asset_upload_by_hash(file_path)
        if not asset_id:
            logger.error(f"Failed to upload asset from {file_path}")
            return None
        
        # Create sprite using the asset
        sprite = self.add_sprite_from_r2_asset(
            asset_id=asset_id,
            filename=os.path.basename(file_path),
            layer=layer,
            coord_x=coord_x,
            coord_y=coord_y
        )
        
        if sprite:
            logger.info(f"Created sprite from uploaded asset {asset_id}")
        
        return sprite

    def get_upload_stats(self) -> Dict[str, Any]:
        """Get upload statistics"""
        pending_count = len(self.pending_uploads)
        pending_files = list(self.pending_uploads.keys())
        
        return {
            'pending_uploads': pending_count,
            'pending_files': pending_files,
            'asset_manager_stats': self.AssetManager.get_stats()
        }