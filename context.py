import ctypes
import sprite
import queue
import json
import sdl3
import logging

logger = logging.getLogger(__name__)

CELL_SIDE: int = 20
MIN_SCALE: float = 0.1
MAX_SCALE: float = 10.0
MAX_TABLE_X: float = 0.0
MIN_TABLE_X: float = -1000.0
MAX_TABLE_Y: float = 0.0
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
        self.queue_to_send = queue.Queue(1000)
        self.queue_to_read = queue.Queue(1000)
        self.waiting_for_table = False
        self.current_table = None
        self.list_of_tables = []
        self.moving_table = False

    def add_sprite(self, texture_path, scale_x, scale_y, layer='tokens',
                   character=None, moving=False, speed=None,
                   collidable=False, table=None):
        table = table if table else self.current_table
        if table:
            table.dict_of_sprites_list[layer].append(sprite.Sprite(self.renderer, texture_path,
                                               scale_x=scale_x, scale_y=scale_y, character=character,
                                               moving=moving, speed=speed, collidable=collidable))
            if table.selected_sprite == None:
                table.selected_sprite = table.dict_of_sprites_list[layer][-1]
            return table.dict_of_sprites_list[layer][-1]
        else:
            print("No table selected")
            return None
    def add_table(self, name, width, height):
        table = ContextTable(name, width, height)
        self.list_of_tables.append(table)
        self.current_table = table
        return table    
    
    def create_table_from_json(self, json_data):
        # Assuming json_data is a dictionary with the necessary information
        table=self.add_table(json_data['name'], json_data['width'], json_data['height'])
        # Add layers
        for layer, entities in json_data['layers'].items():
            for entity_data in entities.values():
                self.add_sprite(
                    texture_path=entity_data['texture_path'].encode(),
                    scale_x=entity_data['scale_x'],
                    scale_y=entity_data['scale_y'],
                    layer=layer,
                    character=entity_data.get('character'),
                    moving=entity_data.get('moving', False),
                    speed=entity_data.get('speed'),
                    collidable=entity_data.get('collidable', False),
                    table=self.current_table
                )
        #self.table.update_grid()
        return table

    def setup_protocol(self, send_callback):
        """Initialize protocol handler"""
        from client_protocol import ClientProtocol
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

