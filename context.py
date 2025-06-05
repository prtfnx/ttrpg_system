import ctypes
import sprite
import queue
import json
import sdl3
import logging
import time
import ctypes
from net.protocol import Message, MessageType


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
        self.resizing = False
        self.grabing= False
        self.mouse_state = None
        self.cursor = None
        self.base_width = base_width
        self.base_height = base_height
        self.last_time = 0
        self.current_time = 0
        self.window_width, self.window_height = ctypes.c_int(), ctypes.c_int()
        self.net_client_started = False
        self.net_socket = None
        self.queue_to_send = queue.Queue(0)
        self.queue_to_read = queue.Queue(0)
        self.waiting_for_table = False
        self.current_table = None
        self.list_of_tables = []
        self.moving_table = False
        self.network_context = NetworkedContext(self)
        self.LightingManager = None
        # Compendium integration
        self.compendium_manager = None
        self.light_on = True
        self.cursor_position_x = 0.0
        self.cursor_position_y = 0.0


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
                        new_sprite.cleanup()  # You'll need to add this method to Sprite class
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
            
    def find_sprite_by_id(self, sprite_id, table_name=None):
        """Find and return a sprite by its ID from all layers in the table."""
        # Use current table if no table name provided
        if table_name is None:
            table = self.current_table
            if table:
                table_name = table.name
            else:
                logger.error("No current table and no table_name provided")
                return None
        else:
            table = next((t for t in self.list_of_tables if t.name == table_name), None)
        
        if not table or not sprite_id:
            logger.error(f"Table '{table_name}' not found or sprite_id is None")
            return None
            
        for layer, sprite_list in table.dict_of_sprites_list.items():
            for sprite_obj in sprite_list:
                if hasattr(sprite_obj, 'sprite_id') and sprite_obj.sprite_id == sprite_id:
                    return sprite_obj
                # Fallback for alternate id attribute
                if hasattr(sprite_obj, 'id') and sprite_obj.id == sprite_id:
                    return sprite_obj
        
        logger.warning(f"Sprite with ID '{sprite_id}' not found in table '{table_name}'")
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

    def add_table(self, name, width, height):
        """Add a new table and return it"""
        try:
            table = ContextTable(name, width, height)
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
            # Create the table
            table = self.add_table(
                json_data.get('name', 'Loaded Table'), 
                json_data.get('width', 1920), 
                json_data.get('height', 1080)
            )
            
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

class ContextTable:
    def __init__(self, name: str, width: int, height: int, scale: float = 1.0):
        self.name = name
        self.width = width
        self.height = height
        self.layers = ['map','tokens', 'dungeon_master', 'light', 'height']
        self.dict_of_sprites_list = {layer: [] for layer in self.layers}
        self.selected_sprite = None
        self.scale= scale
        self.x_moved= 1.0
        self.y_moved= 1.0
        self.show_grid = True
        self.cell_side = CELL_SIDE

    def draw_grid(self, renderer, window=None, color=(100, 100, 100, 255)):
        """Draw the grid overlay using SDL."""
        if not self.show_grid:
            return
            
        window_width = ctypes.c_int()
        window_height = ctypes.c_int()
        if window is None:
            logger.warning("No window provided to draw_grid")
            return
            
        sdl3.SDL_GetWindowSize(window, ctypes.byref(window_width), ctypes.byref(window_height))

        #cell_width = (window_width.value * self.grid_scale) / self.width
        #cell_height = (window_height.value * self.grid_scale) / self.height
        cell_width = self.width / self.cell_side * self.scale
        cell_height = self.height / self.cell_side * self.scale
        
        # Set color for grid lines
        sdl3.SDL_SetRenderDrawColor(renderer, *color)
        
        # Draw vertical grid lines
        for x in range(self.width + 1):
            x_pos = int(x * cell_width + self.x_moved)
            if 0 <= x_pos <= window_width.value:
                sdl3.SDL_RenderLine(renderer, x_pos, 0, x_pos, window_height.value)
        
        # Draw horizontal grid lines
        for y in range(self.height + 1):
            y_pos = int(y * cell_height + self.y_moved)
            if 0 <= y_pos <= window_height.value:
                sdl3.SDL_RenderLine(renderer, 0, y_pos, window_width.value, y_pos)

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
        if hasattr(self, '_context'):
            self._context.send_table_update('move', {
                'x_moved': self.x_moved, 
                'y_moved': self.y_moved
            })
    def save_to_dict(self):
        """Save table to dictionary format"""
        data = {
            'name': self.name,
            'width': self.width,
            'height': self.height,
            'scale': self.scale,
            'x_moved': self.x_moved,
            'y_moved': self.y_moved,
            'show_grid': self.show_grid,
            'cell_side': self.cell_side,
            'layers': {layer: [sprite.to_dict() for sprite in sprites] 
                       for layer, sprites in self.dict_of_sprites_list.items()}
        }
        logger.info(f"Saved table as json")
        #print(data)
        return data

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
            
        msg = Message(MessageType.NEW_TABLE_REQUEST, {'table_name': table_name},
                     getattr(self.context.protocol, 'client_id', 'unknown'))
        
        try:
            if hasattr(self.context.protocol, 'send'):
                self.context.protocol.send(msg.to_json())
            elif hasattr(self.context.protocol, 'send_message'):
                self.context.protocol.send_message(msg)
                
            logger.info(f"Requested new table: {table_name}")
            
        except Exception as e:
            logger.error(f"Failed to request table: {e}")

