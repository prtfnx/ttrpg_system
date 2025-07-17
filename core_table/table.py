import json
import os
from server_host.utils.logger import setup_logger
from typing import Dict, Tuple, List, Optional, Any
import uuid

logger = setup_logger(__name__)

# logging.basicConfig removed - using central logger setup

LAYER_NAMES = ['map', 'tokens', 'dungeon_master', 'light', 'height', 'obstacles', 'fog_of_war']

class Entity:
    def __init__(self, name: str, position: Tuple[int, int], layer: str, 
                 path_to_texture: str = None, entity_id: int = None, coord_x: float = 0.0, coord_y: float = 0.0,):
        # Use entity_id consistently
        self.entity_id = entity_id
        self.id = entity_id  # Keep both for backward compatibility
        self.name = name
        self.position = position
        self.layer = layer
        self.texture_path = path_to_texture
        self.scale_x = 1.0
        self.scale_y = 1.0        # Add rotation attribute
        self.rotation = 0.0      

        self.sprite_id = str(uuid.uuid4())
        
    def to_dict(self):
        return {
            'entity_id': self.entity_id,
            'sprite_id': self.sprite_id,
            'name': self.name,
            'position': list(self.position),
            'layer': self.layer,
            'texture_path': self.texture_path,
            'scale_x': self.scale_x,
            'scale_y': self.scale_y,
            'rotation': self.rotation,
            'character': None,
            'moving': False,
            'speed': None,
            'collidable': False
        }
    
    @classmethod
    def from_dict(cls, data):
        """Create Entity from dictionary"""
        entity = cls(
            name=data['name'],
            position=tuple(data['position']),
            layer=data['layer'],
            path_to_texture=data.get('texture_path'),
            entity_id=data['entity_id']
        )
        entity.sprite_id = data.get('sprite_id', str(uuid.uuid4()))
        entity.scale_x = data.get('scale_x', 1.0)
        entity.scale_y = data.get('scale_y', 1.0)
        entity.rotation = data.get('rotation', 0.0)
        return entity

    def serialize(self) -> dict:
        """Serialize entity for database storage"""
        return self.to_dict()

class VirtualTable:
    def __init__(self, name: str, width: int, height: int, table_id: Optional[str] = None):
        # Validate parameters
        if not name or not name.strip():
            raise ValueError("Table name cannot be empty")
        if width <= 0:
            raise ValueError("Table width must be greater than 0")
        if height <= 0:
            raise ValueError("Table height must be greater than 0")
            
        self.name = name
        self.width = width
        self.height = height
        self.layers = ['map', 'tokens', 'dungeon_master', 'light', 'height', 'obstacles']
        self.entities: Dict[int, Entity] = {}
        self.next_entity_id = 1
        
        # Sprite ID to entity ID mapping for quick lookup
        self.sprite_to_entity: Dict[str, int] = {}
        
        # Fog of war rectangles
        self.fog_rectangles: Dict[str, List[Tuple[Tuple[float, float], Tuple[float, float]]]] = {
            'hide': [],
            'reveal': []
        }
        
        # Add missing attributes for the protocol
        self.position = (0.0, 0.0)
        self.scale = (1.0, 1.0)
        self.layer_visibility = {layer: True for layer in self.layers}
        if not table_id:
            self.table_id = uuid.uuid4()
        else:
            self.table_id = table_id

        # Initialize grid
        self.grid = {}
        for layer in self.layers:
            self.grid[layer] = [[None for _ in range(width)] for _ in range(height)]

    def add_entity(self, entity_data: Dict[str, Any]) -> Optional[Entity]:
        """Add entity and return it"""
        position = entity_data.get('position')
        if position:
            position = (int(position[0]), int(position[1])) 
        else:
            position = (int(entity_data.get('coord_x', 0)), int(entity_data.get('coord_y', 0)))
        layer = entity_data.get('layer', 'tokens')
        name = entity_data.get('name', 'Unnamed Entity')
        path_to_texture = entity_data.get('texture_path', None)
        asset_id = entity_data.get('asset_id', None)

        #TODO validate position 
        #if not self.is_valid_position(position):
        #    raise ValueError("Invalid position")
        if layer not in self.layers:
            raise ValueError("Invalid layer")
        #if self.grid[layer][position[1]][position[0]] is not None:
        #    raise ValueError("Position already occupied")
        logger.debug(f"Adding entity {name} at {position} on layer {layer} with texture {path_to_texture}")
        entity = Entity(name, position, layer, path_to_texture, self.next_entity_id)
        self.entities[self.next_entity_id] = entity
        self.sprite_to_entity[entity.sprite_id] = self.next_entity_id
        self.grid[layer][position[1]][position[0]] = self.next_entity_id
        
        logger.info(f"Added entity {name} (ID: {self.next_entity_id}, Sprite: {entity.sprite_id}) at {position}")
        self.next_entity_id += 1
        return entity
    
    def find_entity_by_sprite_id(self, sprite_id: str) -> Optional[Entity]:
        """Find entity by sprite ID"""
        entity_id = self.sprite_to_entity.get(sprite_id)
        if entity_id:
            return self.entities.get(entity_id)
        return None
    
    def move_entity(self, entity_id: int, new_position: Tuple[int, int], new_layer: Optional[str] = None):
        """Move entity with sprite ID tracking"""
        if entity_id not in self.entities:
            logger.error(f"Entity {entity_id} not found")
            raise ValueError("Entity not found")
        if not self.is_valid_position(new_position):
            logger.error(f"Invalid move to {new_position}")
            raise ValueError("Invalid position")
        logger.debug(f"Moving entity {entity_id} to {new_position} on layer {new_layer}")  
        entity = self.entities[entity_id]
        old_x, old_y = entity.position
        old_layer = entity.layer
        
        # Clear old position
        self.grid[old_layer][old_y][old_x] = None
        
        # Update entity
        entity.position = new_position
        if new_layer and new_layer in self.layers:
            entity.layer = new_layer
        
        # Check if new position is free
        logger.info(f"Moving entity {entity_id} (sprite: {entity.sprite_id}) from {entity.position} to {new_position} on layer {entity.layer}")
        if self.grid[entity.layer][new_position[1]][new_position[0]] is not None:
            # Rollback
            self.grid[old_layer][old_y][old_x] = entity_id
            entity.position = (old_x, old_y)
            entity.layer = old_layer
            raise ValueError("Target position occupied")
        
        # Place in new position
        self.grid[entity.layer][new_position[1]][new_position[0]] = entity_id
        logger.info(f"Moved entity {entity_id} (sprite: {entity.sprite_id}) to {new_position} on layer {entity.layer}")
    
    def remove_entity(self, entity_id: int):
        """Remove entity and clean up sprite tracking"""
        if entity_id not in self.entities:
            raise ValueError("Entity not found")
        
        entity = self.entities[entity_id]
        x, y = entity.position
        layer = entity.layer
        
        # Clear from grid
        self.grid[layer][y][x] = None
        
        # Remove from sprite mapping
        if entity.sprite_id in self.sprite_to_entity:
            del self.sprite_to_entity[entity.sprite_id]
        
        # Remove entity
        del self.entities[entity_id]
        logger.info(f"Removed entity {entity_id} (sprite: {entity.sprite_id})")
    
    def is_valid_position(self, position: Tuple[int, int]) -> bool:
        """Check if position is within table bounds"""
        x, y = position
        return 0 <= x < self.width and 0 <= y < self.height
    
    def table_to_layered_dict(self) -> Dict:
        """Convert table to layered dictionary format """
        layers_dict = {}
        
        # Initialize all layers
        for layer in self.layers:
            layers_dict[layer] = {}
        
        # Add entities to their respective layers
        for entity in self.entities.values():
            if entity.layer in layers_dict:
                # Use entity_id consistently
                layers_dict[entity.layer][str(entity.entity_id)] = entity.to_dict()
            else:
                logger.warning(f"Entity {entity.entity_id} has unknown layer: {entity.layer}")
        
        return layers_dict
    
    def to_dict(self) -> Dict:
        """Convert table to dictionary '"""
        return {
            'table_name': self.name,
            'table_id': str(self.table_id),
            'width': self.width,
            'height': self.height,
            'layers': self.table_to_layered_dict(),
            'fog_rectangles': self.fog_rectangles
        }
    
    def to_json(self) -> str:
        """Convert table to JSON """
        data = self.to_dict()               
        return json.dumps(data, indent=2)
    
    def from_dict(self, data: Dict):
        """Load table from dictionary data"""
        self.name = data.get('name', 'Unknown Table')
        self.width = data.get('width', 100)
        self.height = data.get('height', 100)
        
        # Clear existing entities
        self.entities.clear()
        self.sprite_to_entity.clear()
        
        # Reinitialize grid
        self.grid = {}
        for layer in self.layers:
            self.grid[layer] = [[None for _ in range(self.width)] for _ in range(self.height)]
        
        # Load entities from layers
        layers_data = data.get('layers', {})
        max_entity_id = 0
        
        for layer, entities_data in layers_data.items():
            if layer not in self.layers:
                logger.warning(f"Unknown layer in data: {layer}")
                continue
                
            for entity_id_str, entity_data in entities_data.items():
                try:
                    entity_id = int(entity_id_str)
                    max_entity_id = max(max_entity_id, entity_id)
                    
                    # Create entity from data
                    entity = Entity(
                        name=entity_data.get('name', f'Entity {entity_id}'),
                        position=tuple(entity_data.get('position', [0, 0])),
                        layer=layer,
                        path_to_texture=entity_data.get('texture_path'),
                        entity_id=entity_id
                    )
                    
                    # Restore additional properties
                    entity.scale_x = entity_data.get('scale_x', 1.0)
                    entity.scale_y = entity_data.get('scale_y', 1.0)
                    entity.sprite_id = entity_data.get('sprite_id', str(uuid.uuid4()))
                    
                    # Add to collections
                    self.entities[entity_id] = entity
                    self.sprite_to_entity[entity.sprite_id] = entity_id
                    
                    # Place on grid
                    x, y = entity.position
                    if self.is_valid_position((x, y)):
                        self.grid[layer][y][x] = entity_id
                    else:
                        logger.warning(f"Entity {entity_id} has invalid position: {entity.position}")
                        
                except (ValueError, KeyError) as e:
                    logger.error(f"Failed to load entity {entity_id_str}: {e}")
                    continue
        
        # Set next entity ID
        self.next_entity_id = max_entity_id + 1
        
        # Load fog rectangles
        fog_data = data.get('fog_rectangles', {'hide': [], 'reveal': []})
        self.fog_rectangles = {
            'hide': fog_data.get('hide', []),
            'reveal': fog_data.get('reveal', [])
        }
        
        logger.info(f"Loaded table '{self.name}' with {len(self.entities)} entities and {len(self.fog_rectangles['hide'])} fog rectangles")
    
    def save_to_disk(self, file_path: str):
        """Save table to disk with 'layers' format"""
        try:
            # Ensure directory exists
            directory = os.path.dirname(file_path)
            if directory and not os.path.exists(directory):
                os.makedirs(directory)
            
            # Create save data with 'layers' instead of 'entities'
            save_data = {
                'name': self.name,
                'width': self.width,
                'height': self.height,
                'layers': self.table_to_layered_dict(),  # Changed from 'entities' to 'layers'
                'fog_rectangles': self.fog_rectangles,  # Include fog rectangles
                'metadata': {
                    'version': '1.0',
                    'entity_count': len(self.entities),
                    'next_entity_id': self.next_entity_id,
                    'created_timestamp': __import__('time').time()
                }
            }
            
            # Write to file
            with open(file_path, 'w', encoding='utf-8') as f:
                json.dump(save_data, f, indent=2, ensure_ascii=False)
            
            logger.info(f"Saved table '{self.name}' to {file_path} ({len(self.entities)} entities)")
            
        except Exception as e:
            logger.error(f"Failed to save table to {file_path}: {e}")
            raise


def get_entity_at_position(self, position: Tuple[int, int], layer: str = None) -> Optional[Entity]:
    """Get entity at specific position"""
    x, y = position
    if not self.is_valid_position(position):
        return None
    
    if layer:
        entity_id = self.grid[layer][y][x]
        if entity_id:
            return self.entities.get(entity_id)
    else:
        # Check all layers
        for layer_name in self.layers:
            entity_id = self.grid[layer_name][y][x]
            if entity_id:
                return self.entities.get(entity_id)
    
    return None

def get_entities_in_area(self, top_left: Tuple[int, int], bottom_right: Tuple[int, int], 
                        layer: str = None) -> List[Entity]:
    """Get all entities in a rectangular area"""
    entities = []
    x1, y1 = top_left
    x2, y2 = bottom_right
    
    # Ensure bounds are within table
    x1 = max(0, min(x1, self.width - 1))
    y1 = max(0, min(y1, self.height - 1))
    x2 = max(0, min(x2, self.width - 1))
    y2 = max(0, min(y2, self.height - 1))
    
    layers_to_check = [layer] if layer else self.layers
    
    for layer_name in layers_to_check:
        for y in range(y1, y2 + 1):
            for x in range(x1, x2 + 1):
                entity_id = self.grid[layer_name][y][x]
                if entity_id:
                    entity = self.entities.get(entity_id)
                    if entity and entity not in entities:
                        entities.append(entity)
    
    return entities




def create_table_from_json(json_data: str) -> VirtualTable:
    data = json.loads(json_data)
    table = VirtualTable(data['name'], data['width'], data['height'])
    for e_data in data['entities']:
        entity = Entity.from_dict(e_data)
        table.entities[entity.entity_id] = entity
        table.grid[entity.layer][entity.position[1]][entity.position[0]] = entity.entity_id
        table.next_entity_id = max(table.next_entity_id, entity.entity_id + 1)
    logger.info(f"Created table from JSON data")
    return table




if __name__ == "__main__":
    table = VirtualTable('test_table',10, 10)
    table.add_entity("Hero", (2, 3), layer='tokens', path_to_texture='resources/hero.png')
    table.add_entity("Goblin", (5, 6), layer='dungeon_master', path_to_texture='resources/goblin.png')
    table.save_to_disk("table.json")
    


    #logging.info(f"Received table data: {table_data}")