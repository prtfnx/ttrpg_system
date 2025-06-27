import ctypes
import os
import queue
import time
import uuid
from typing import Optional, Dict, List, Any, Union, TYPE_CHECKING
from net.protocol import Message, MessageType
from Actions import Actions  
from GeometricManager import GeometricManager
from ContextTable import ContextTable
from AssetManager import ClientAssetManager
from RenderManager import RenderManager
from Sprite import Sprite
from logger import setup_logger

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


logger = setup_logger(__name__)

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
        # Actions protocol
        self.Actions: Optional[Actions] = None        
        # Managers
        self.LayoutManager: Optional[LayoutManager] = None
        self.LightingManager: Optional[LightManager] = None
        self.CompendiumManager: Optional[CompendiumManager] = None
        self.GeometryManager: Optional[GeometricManager] = None
        self.AssetManager: Optional[ClientAssetManager] = None
        self.RenderManager: Optional[RenderManager] = None
        # Note: StorageManager and DownloadManager are now owned by AssetManager
        # Network
        self.net_client_started: bool = False
        self.net_socket: Optional[Any] = None
        self.queue_to_send: queue.PriorityQueue[Any] = queue.PriorityQueue(0)
        self.queue_to_read: queue.PriorityQueue[Any] = queue.PriorityQueue(0)
        self.waiting_for_table: bool = False
        
        # Protocol handlers
        self.protocol: Optional[Any] = None  # protocol handler
          # GUI system
        self.imgui: Optional['SimplifiedGui'] = None     
        self.chat_messages: List[str] = []
        
        # Current tool selection
        self.current_tool: str = "Select"      

        
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


    def add_sprite(self, texture_path, scale_x=1, scale_y=1, layer='tokens',
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
            if not new_sprite:
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
    
    def create_table_from_dict(self, dict_data):
        """Create table from dictionary data"""
        try:
            logger.info(f"Creating table from dict: {dict_data}")   
            # Get table info from dict data
            table_name = dict_data.get('table_name')
            table_id = dict_data.get('table_id')  # May be None for legacy saves
            
            # Create the table
            table = ContextTable(
                table_name=table_name,
                width=dict_data.get('width', 1920), 
                height=dict_data.get('height', 1080),
                table_id=table_id
            )
            
            self.list_of_tables.append(table)
            
            # Set as current table if it's the first one
            if not self.current_table:
                self.current_table = table
              # Set table properties
            table.scale = dict_data.get('scale', 1.0)
            table.x_moved = dict_data.get('x_moved', 1.0)
            table.y_moved = dict_data.get('y_moved', 1.0)
            table.show_grid = dict_data.get('show_grid', True)
            table.cell_side = dict_data.get('cell_side', CELL_SIDE)
            print(dict_data)
            # Add sprites from layers
            layers_data = dict_data.get('layers', {})
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
            
            logger.info(f"Successfully created table '{table.name}' from dict")
            return table
            
        except Exception as e:
            logger.error(f"Error creating table from dict: {e}")
            return None

    def send_table_update(self, update_type: str, data: dict):
        """Send table update to server"""
        if hasattr(self, 'protocol'):
            self.protocol.send_update(update_type, data)    
  
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
   
     

  

   