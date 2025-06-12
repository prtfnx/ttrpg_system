import ctypes
import sprite
import queue
import json
import sdl3
import logging
import time
import ctypes
import uuid
from net.protocol import Message, MessageType
from Actions import Actions  
from GeometricManager import GeometricManager  

logger = logging.getLogger(__name__)

CELL_SIDE: int = 20
MIN_SCALE: float = 0.1
MAX_SCALE: float = 10.0
MAX_TABLE_X: float = 200.0
MIN_TABLE_X: float = -1000.0
MAX_TABLE_Y: float = 200.0
MIN_TABLE_Y: float = -1000.0

class Context:
    def __init__(self, renderer, window, base_width, base_height):
        self.step = ctypes.c_float(1)
        self.sprites_list=[]
        self.window= window
        self.renderer = renderer
        
        # For manage  mouse state:
        self.resizing = False
        self.grabing= False
        self.mouse_state = None
        self.cursor = None
        self.moving_table = False
        self.cursor_position_x = 0.0
        self.cursor_position_y = 0.0
        
        # Window dimensions
        self.base_width = base_width
        self.base_height = base_height
        self.window_width, self.window_height = ctypes.c_int(), ctypes.c_int()
        # Layout information for window areas
        self.table_viewport = None
        self.layout = {
            'table_area': (0, 0, 0, 0),
            'gui_area': (0, 0, 0, 0),
            'spacing': 0
        }
        # Time management
        self.last_time = 0
        self.current_time = 0     

        # Tables management
        self.current_table = None
        self.list_of_tables = []       
        
        # Managers
        self.network_context = NetworkedContext(self)
        self.LightingManager = None        
        self.compendium_manager = None
        self.GeometryManager = GeometricManager

        # Net section
        self.net_client_started = False
        self.net_socket = None
        self.queue_to_send = queue.PriorityQueue(0)
        self.queue_to_read = queue.PriorityQueue(0)
        self.waiting_for_table = False
        # GUI system
        self.imgui = None     
        self.chat_messages = []
        # Current tool selection
        self.current_tool = "Select"
          
        # Actions protocol integration
        self.actions = Actions(self)
        #Light
        self.point_of_view_changed = True 
        # Settings
        self.light_on = True
        self.net= True
        self.gui= True
        
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
            new_sprite = sprite.Sprite(
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
                sprite_id=sprite_id
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
                    return sprite_obj
                # Fallback for alternate id attribute
                if hasattr(sprite_obj, 'id') and sprite_obj.id == sprite_id:
                    return sprite_obj
        
        logger.warning(f"Sprite with ID '{sprite_id}' not found in table '{table_identifier}'")
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
            table_name = json_data.get('table_name', json_data.get('name', 'Loaded Table'))
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
            #print(json_data)
            # Add sprites from layers
            layers_data = json_data.get('layers', {})
            #print('4')
            #print(layers_data.items())
            for layer, sprites_data in layers_data.items():
                #print(f"sprite data: {sprites_data}, layer: {layer}")
                #print(f"Processing layer: {layer} with {len(sprites_data)} sprites")
                if layer in table.layers:  # Only add to valid layers
                    for sprite_data in sprites_data.values():
                        #print(f"Creating sprite from data: {sprite_data}")
                        try:
                            # Create sprite with proper parameters
                            #print(f"Adding sprite with id: {sprite_data.get('sprite_id', None)}")
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

class ContextTable:
    def __init__(self, table_name: str, width: int, height: int, scale: float = 1.0, table_id: str | None = None):
        # Use provided table_id or generate a new UUID
        self.table_id = table_id or str(uuid.uuid4())
        self.table_name = table_name  # Display name
        self.name = table_name  # Legacy compatibility
        self.width = width
        self.height = height
        self.layers = ['map','tokens', 'dungeon_master', 'light', 'height']
        self.dict_of_sprites_list = {layer: [] for layer in self.layers}
        self.selected_sprite: sprite.Sprite | None = None
        self.scale= scale
        
        # Table coordinate system - independent of screen
        self.table_x = 0.0  # Table position in its own coordinate space
        self.table_y = 0.0
        self.table_scale = 1.0  # Internal table scaling
        
        # Viewport position within table (for panning)
        self.viewport_x = 0.0
        self.viewport_y = 0.0
        
        # Screen area allocated to this table (set by layout manager)
        self.screen_area = None  # (x, y, width, height) 
        
        # Legacy properties for backward compatibility
        self.x_moved= 1.0        
        self.y_moved= 1.0
        
        self.show_grid = True
        self.cell_side = CELL_SIDE

    def set_screen_area(self, x: int, y: int, width: int, height: int):
        """Set the screen area allocated to this table."""
        self.screen_area = (x, y, width, height)

    def table_to_screen(self, table_x: float, table_y: float) -> tuple[float, float]:
        """Convert table coordinates to screen coordinates."""
        if not self.screen_area:
            return table_x, table_y
            
        screen_x, screen_y, screen_width, screen_height = self.screen_area
        
        # Apply viewport offset and scaling
        relative_x = (table_x - self.viewport_x) * self.table_scale
        relative_y = (table_y - self.viewport_y) * self.table_scale
        
        # Map to screen area
        final_x = screen_x + relative_x
        final_y = screen_y + relative_y
        
        return final_x, final_y

    def screen_to_table(self, screen_x: float, screen_y: float) -> tuple[float, float]:
        """Convert screen coordinates to table coordinates."""
        if not self.screen_area:
            return screen_x, screen_y
            
        area_x, area_y, area_width, area_height = self.screen_area
        
        # Convert to relative coordinates within table area
        relative_x = screen_x - area_x
        relative_y = screen_y - area_y
        
        # Apply inverse scaling and viewport offset
        table_x = (relative_x / self.table_scale) + self.viewport_x
        table_y = (relative_y / self.table_scale) + self.viewport_y
        
        return table_x, table_y

    def is_point_in_table_area(self, screen_x: float, screen_y: float) -> bool:
        """Check if a screen point is within the table's allocated area."""
        if not self.screen_area:
            return True
            
        area_x, area_y, area_width, area_height = self.screen_area
        return (area_x <= screen_x <= area_x + area_width and 
                area_y <= screen_y <= area_y + area_height)

    def pan_viewport(self, dx: float, dy: float):
        """Pan the viewport within the table coordinate space."""
        self.viewport_x += dx / self.table_scale
        self.viewport_y += dy / self.table_scale
        
        # Clamp viewport to table bounds
        if self.screen_area:
            _, _, screen_width, screen_height = self.screen_area
            # Calculate visible area in table coordinates
            visible_width = screen_width / self.table_scale
            visible_height = screen_height / self.table_scale
            
            # Clamp viewport to keep it within table bounds
            self.viewport_x = max(0, min(self.width - visible_width, self.viewport_x))
            self.viewport_y = max(0, min(self.height - visible_height, self.viewport_y))

    def zoom_table(self, factor: float, center_x: float | None = None, center_y: float | None = None):
        """Zoom the table around a center point (in table coordinates)."""
        old_scale = self.table_scale
        self.table_scale *= factor
        self.table_scale = max(0.1, min(5.0, self.table_scale))  # Clamp zoom
          # If center point provided, adjust viewport to zoom around that point
        if center_x is not None and center_y is not None:
            scale_diff = self.table_scale / old_scale
            self.viewport_x = center_x - (center_x - self.viewport_x) * scale_diff
            self.viewport_y = center_y - (center_y - self.viewport_y) * scale_diff

    def draw_grid(self, renderer, window=None, color=(100, 100, 100, 255), table_area=None):
        """Draw the grid overlay using the new table coordinate system."""
        if not self.show_grid or not self.screen_area:
            return
            
        area_x, area_y, area_width, area_height = self.screen_area
        
        # Grid configuration
        grid_size = 50.0  # Grid cell size in table coordinates
        cells_per_row = int(area_width / (grid_size * self.table_scale)) + 2
        cells_per_col = int(area_height / (grid_size * self.table_scale)) + 2
        
        # Set color for grid lines
        try:
            sdl3.SDL_SetRenderDrawColor(renderer, ctypes.c_ubyte(color[0]), ctypes.c_ubyte(color[1]), 
                                       ctypes.c_ubyte(color[2]), ctypes.c_ubyte(color[3]))
        except:
            pass
        
        # Calculate starting grid position in table coordinates
        start_x = int(self.viewport_x / grid_size) * grid_size
        start_y = int(self.viewport_y / grid_size) * grid_size
          # Draw vertical grid lines
        for i in range(cells_per_row + 1):
            table_x = start_x + i * grid_size
            
            # Only draw if line is within table bounds
            if 0 <= table_x <= self.width:
                screen_x, screen_y1 = self.table_to_screen(table_x, max(0, self.viewport_y))
                screen_x, screen_y2 = self.table_to_screen(table_x, min(self.height, self.viewport_y + area_height / self.table_scale))
                
                # Only draw if line is within screen area
                if area_x <= screen_x <= area_x + area_width:
                    try:
                        sdl3.SDL_RenderLine(renderer, 
                                           ctypes.c_float(screen_x), ctypes.c_float(max(area_y, screen_y1)), 
                                           ctypes.c_float(screen_x), ctypes.c_float(min(area_y + area_height, screen_y2)))
                    except:
                        pass
        
        # Draw horizontal grid lines
        for i in range(cells_per_col + 1):
            table_y = start_y + i * grid_size
            
            # Only draw if line is within table bounds
            if 0 <= table_y <= self.height:
                screen_x1, screen_y = self.table_to_screen(max(0, self.viewport_x), table_y)
                screen_x2, screen_y = self.table_to_screen(min(self.width, self.viewport_x + area_width / self.table_scale), table_y)
                
                # Only draw if line is within screen area
                if area_y <= screen_y <= area_y + area_height:
                    try:
                        sdl3.SDL_RenderLine(renderer, 
                                           ctypes.c_float(max(area_x, screen_x1)), ctypes.c_float(screen_y),
                                           ctypes.c_float(min(area_x + area_width, screen_x2)), ctypes.c_float(screen_y))
                    except:
                        pass

    def toggle_grid(self):
        """Toggle grid visibility."""
        self.show_grid = not self.show_grid
        logger.info(f"Grid visibility: {self.show_grid}")
    
    def change_scale(self, increment):
        """Change the scale of the table"""
        self.scale += increment
        self.scale = max(MIN_SCALE, min(MAX_SCALE, self.scale))
        logger.info(f"Grid scale: {self.scale}")
    def move_table(self, x, y):
        """Move the table by a certain amount"""
        self.x_moved += x
        self.y_moved += y
        self.x_moved = max(MIN_TABLE_X, min(MAX_TABLE_X, self.x_moved))
        self.y_moved = max(MIN_TABLE_Y, min(MAX_TABLE_Y, self.y_moved))
        logger.info(f"Table moved to: ({self.x_moved}, {self.y_moved})")

    def update_position(self, dx: float, dy: float):
        """Update position and notify server"""
        self.x_moved = max(-1000, min(0, self.x_moved + dx))
        self.y_moved = max(-1000, min(0, self.y_moved + dy))
        # Note: removed _context reference for now    def save_to_dict(self):
        """Save table to dictionary format"""
        data = {
            'table_id': self.table_id,
            'table_name': self.table_name,
            'name': self.name,  # Legacy compatibility
            'width': self.width,
            'height': self.height,
            'scale': self.scale,
            'x_moved': self.x_moved,
            'y_moved': self.y_moved,
            'show_grid': self.show_grid,
            'cell_side': self.cell_side,
            'layers': {layer: [sprite.to_dict() for sprite in sprites] 
                       for layer, sprites in self.dict_of_sprites_list.items()}        }
        logger.info(f"Saved table as json")
        #print(data)
        return data
    
    def constrain_sprite_to_bounds(self, sprite):
        """Constrain sprite position to stay within table boundaries."""
        # Get sprite dimensions in table coordinates for boundary calculations
        # Convert from screen pixels to table coordinates
        sprite_width_table = sprite.original_w * sprite.scale_x 
        sprite_height_table = sprite.original_h * sprite.scale_y
        
        # Clamp sprite position to table bounds (accounting for sprite size)
        sprite.coord_x.value = max(0, min(self.width - sprite_width_table, sprite.coord_x.value))
        sprite.coord_y.value = max(0, min(self.height - sprite_height_table, sprite.coord_y.value))
    
    def out_of_bounds(self, sprite):
        """Check if sprite is out of table bounds."""
        # Get sprite dimensions in table coordinates for boundary calculations
        # Convert from screen pixels to table coordinates
        sprite_width_table = (sprite.original_w * sprite.scale_x) 
        sprite_height_table = (sprite.original_h * sprite.scale_y)
        
        # Check if sprite position is within table bounds
        return (sprite.coord_x.value < 0 or 
                sprite.coord_x.value + sprite_width_table > self.width or 
                sprite.coord_y.value < 0 or 
                sprite.coord_y.value + sprite_height_table > self.height)
class NetworkedContext:
    def __init__(self, context, is_server=False, is_client=True):
        self.is_server = is_server
        self.is_client = is_client
        self.state_version = 0
        self.pending_changes = []
        self.last_sync_time = 0
        self.context = context
        
    def sync_sprite_move(self, sprite, old_pos, new_pos):
        """Handle sprite movement with network sync"""
        if not hasattr(self.context, 'protocol') or not self.context.protocol:
            return  # No network connection
            
        # Ensure sprite has an ID
        if not hasattr(sprite, 'sprite_id') or not sprite.sprite_id:
            sprite.sprite_id = str(__import__('uuid').uuid4())

        # Send sprite movement update with proper protocol format
        change = {
            'category': 'sprite',
            'type': 'sprite_move',
            'data': {
                'sprite_id': sprite.sprite_id,
                'from': {'x': old_pos[0], 'y': old_pos[1]},
                'to': {'x': new_pos[0], 'y': new_pos[1]},
                'table_id': self.context.current_table.name if self.context.current_table else 'default',
                'timestamp': __import__('time').time()
            }
        }
        
        # Send via protocol using SPRITE_UPDATE message type
        
        msg = Message(MessageType.SPRITE_UPDATE, change, 
                    getattr(self.context.protocol, 'client_id', 'unknown'))
        
        #print(f"Sending sprite move: {sprite.sprite_id} from ({old_pos[0]:.1f}, {old_pos[1]:.1f}) to ({new_pos[0]:.1f}, {new_pos[1]:.1f})")
        #print(f"Sender: {self.context.protocol.send}")
        try:
            # Send the message (adapt based on your protocol's send method)
            self.context.protocol.send(msg.to_json())
            logger.info(f"Sent sprite move: {sprite.sprite_id} to ({new_pos[0]:.1f}, {new_pos[1]:.1f})")
            
        except Exception as e:
            logger.error(f"Failed to send sprite movement: {e}")
    
    def sync_sprite_scale(self, sprite, old_scale, new_scale):
        """Handle sprite scaling with network sync"""
        if not hasattr(self.context, 'protocol') or not self.context.protocol:
            return
              # Ensure sprite has an ID
        if not hasattr(sprite, 'sprite_id') or not sprite.sprite_id:
            sprite.sprite_id = str(__import__('uuid').uuid4())
            
        change = {
            'category': 'sprite',
            'type': 'sprite_scale',
            'data': {
                'sprite_id': sprite.sprite_id,
                'from': {'x': old_scale[0], 'y': old_scale[1]},
                'to': {'x': new_scale[0], 'y': new_scale[1]},
                'table_id': self.context.current_table.name if self.context.current_table else 'default',
                'timestamp': __import__('time').time()
            }
        }
        
        
        msg = Message(MessageType.TABLE_UPDATE, change,
                     getattr(self.context.protocol, 'client_id', 'unknown'))
        
        try:
            if hasattr(self.context.protocol, 'send'):
                self.context.protocol.send(msg.to_json())
            elif hasattr(self.context.protocol, 'send_message'):
                self.context.protocol.send_message(msg)
                logger.info(f"Sent sprite scale: {sprite.sprite_id} to ({new_scale[0]:.2f}, {new_scale[1]:.2f})")
            
        except Exception as e:
            logger.error(f"Failed to send sprite scaling: {e}")
    
    def ask_for_table(self, table_name):
        """Request a specific table from the server"""
        if not hasattr(self.context, 'protocol') or not self.context.protocol:
            logger.error("No protocol available to request table")
            return
            
        msg = Message(MessageType.TABLE_REQUEST, {'table_name': table_name},
                     getattr(self.context.protocol, 'client_id', 'unknown'))
        
        try:
            if hasattr(self.context.protocol, 'send'):
                self.context.protocol.send(msg.to_json())
            elif hasattr(self.context.protocol, 'send_message'):
                self.context.protocol.send_message(msg)
                
            logger.info(f"Requested new table: {table_name}")
            
        except Exception as e:
            logger.error(f"Failed to request table: {e}")

