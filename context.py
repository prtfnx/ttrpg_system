import ctypes
import sprite
import queue
import json

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

