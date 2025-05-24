import json
import logging
from typing import Dict, Tuple, List, Optional



logging.basicConfig(level=logging.INFO, format='%(asctime)s %(levelname)s:%(message)s')

LAYER_NAMES = ['map', 'tokens', 'dungeon_master', 'light', 'height']

class Entity:
    def __init__(self, entity_id: int, name: str, position: Tuple[int, int], 
                 layer: str = 'tokens', texture_path: [str] = None,
                 scale_x: float = 1.0, scale_y: float = 1.0,
                 character: Optional[object] = None, moving: bool = False,
                 speed: Optional[float] = None, collidable: bool = False):
        self.entity_id = entity_id
        self.name = name
        self.position = position
        self.layer = layer
        self.texture_path = texture_path
        self.scale_x = scale_x
        self.scale_y = scale_y
        self.character = character
        self.moving = moving
        self.speed = speed
        self.collidable = collidable

    def to_dict(self):
        return {
            'entity_id': self.entity_id,
            'name': self.name,
            'position': self.position,
            'layer': self.layer,
            'texture_path': self.texture_path,
            'scale_x': self.scale_x,
            'scale_y': self.scale_y,
            'character': self.character,
            'moving': self.moving,
            'speed': self.speed,
            'collidable': self.collidable
        }

    @staticmethod
    def from_dict(data):
        return Entity(data['entity_id'], data['name'], tuple(data['position']), data.get('layer', 'tokens'))

class VirtualTable:
    def __init__(self, name: str, width: int, height: int):
        self.name = name
        self.width = width
        self.height = height
        # Each layer is a 2D grid
        self.grid: Dict[str, List[List[Optional[int]]]] = {
            layer: [[None for _ in range(width)] for _ in range(height)]
            for layer in LAYER_NAMES
        }
        # Entities by id
        self.entities: Dict[int, Entity] = {}
        # Layers dict: each layer has a list of entity ids in that layer
        self.layers: Dict[str, List[int]] = {layer: [] for layer in LAYER_NAMES}
        self.next_entity_id = 1
        logging.info(f"Initialized virtual table {width}x{height} with layers {LAYER_NAMES}")
        

    def add_entity(self, name: str, position: Tuple[int, int], layer: str = 'tokens', path_to_texture: Optional[str] = None) -> Entity:
        if not self.is_valid_position(position):
            logging.error(f"Invalid position {position}")
            raise ValueError("Invalid position")
        if layer not in LAYER_NAMES:
            logging.error(f"Invalid layer {layer}")
            raise ValueError("Invalid layer")
        entity = Entity(self.next_entity_id, name, position, layer, path_to_texture)
        self.entities[self.next_entity_id] = entity
        self.grid[layer][position[1]][position[0]] = entity.entity_id
        self.next_entity_id += 1
        logging.info(f"Added entity {entity.name} at {entity.position} on layer {layer}")
        return entity

    def move_entity(self, entity_id: int, new_position: Tuple[int, int], new_layer: Optional[str] = None):
        if entity_id not in self.entities:
            logging.error(f"Entity {entity_id} not found")
            raise ValueError("Entity not found")
        if not self.is_valid_position(new_position):
            logging.error(f"Invalid move to {new_position}")
            raise ValueError("Invalid position")
        entity = self.entities[entity_id]
        old_x, old_y = entity.position
        old_layer = entity.layer
        self.grid[old_layer][old_y][old_x] = None
        entity.position = new_position
        if new_layer:
            if new_layer not in LAYER_NAMES:
                logging.error(f"Invalid layer {new_layer}")
                raise ValueError("Invalid layer")
            entity.layer = new_layer
        self.grid[entity.layer][new_position[1]][new_position[0]] = entity_id
        logging.info(f"Moved entity {entity_id} to {new_position} on layer {entity.layer}")

    def is_valid_position(self, position: Tuple[int, int]) -> bool:
        x, y = position
        return 0 <= x < self.width and 0 <= y < self.height

    def table_to_layered_dict(table: 'VirtualTable') -> dict:
        layers_dict = {layer: {} for layer in LAYER_NAMES}
        for entity in table.entities.values():
            if entity.layer in layers_dict:
                layers_dict[entity.layer][str(entity.entity_id)] = entity.to_dict()
        return {
            'name': table.name,
            'width': table.width,
            'height': table.height,
            'layers': layers_dict
        }
    def to_dict(self):
        return {
            'name': self.name,
            'width': self.width,
            'height': self.height,
            'layers': LAYER_NAMES,
            'entities': [e.to_dict() for e in self.entities.values()]
        }
    def to_json(self):
        return json.dumps(self.table_to_layered_dict(), indent=2)
    
    def save_to_disk(self, filename: str):
        with open(filename, 'w') as f:
            json.dump(self.table_to_layered_dict(), f, indent=2)
        logging.info(f"Saved table to {filename}")

    @staticmethod
    def load_from_disk(filename: str):
        with open(filename, 'r') as f:
            data = json.load(f)
        table = VirtualTable(data['name'], data['width'], data['height'])
        for layer_name, entities in data['layers'].items():
            for e_data in entities.values():
                entity = Entity.from_dict(e_data)
                table.entities[entity.entity_id] = entity
                table.grid[layer_name][entity.position[1]][entity.position[0]] = entity.entity_id
                table.next_entity_id = max(table.next_entity_id, entity.entity_id + 1)
        logging.info(f"Loaded table from {filename}")
        return table


def create_table_from_json(json_data: str) -> VirtualTable:
    data = json.loads(json_data)
    table = VirtualTable(data['width'], data['height'])
    for e_data in data['entities']:
        entity = Entity.from_dict(e_data)
        table.entities[entity.entity_id] = entity
        table.grid[entity.layer][entity.position[1]][entity.position[0]] = entity.entity_id
        table.next_entity_id = max(table.next_entity_id, entity.entity_id + 1)
    logging.info(f"Created table from JSON data")
    return table
# Example usage:
if __name__ == "__main__":
    table = VirtualTable('test_table',10, 10)
    table.add_entity("Hero", (2, 3), layer='tokens', path_to_texture='resources/hero.png')
    table.add_entity("Goblin", (5, 6), layer='dungeon_master', path_to_texture='resources/goblin.png')
    table.save_to_disk("table.json")
    test_table = VirtualTable.load_from_disk("table.json")
    # Start server in background
    # Client fetches table

    #logging.info(f"Received table data: {table_data}")