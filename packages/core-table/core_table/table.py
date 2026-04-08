import json
import os
import logging
from typing import Dict, Tuple, List, Optional, Any
import uuid

logger = logging.getLogger(__name__)

# logging.basicConfig removed - using central logger setup

LAYER_NAMES = ['map', 'tokens', 'dungeon_master', 'light', 'height', 'obstacles', 'fog_of_war']

class Entity:
    def __init__(self, name: str, position: Tuple[int, int], layer: str, 
                 path_to_texture: Optional[str] = None, entity_id: Optional[int] = None, 
                 coord_x: float = 0.0, coord_y: float = 0.0,
                 obstacle_type: Optional[str] = None, obstacle_data: Optional[dict] = None,
                 character_id: Optional[str] = None, controlled_by: Optional[List[int]] = None,
                 hp: Optional[int] = None, max_hp: Optional[int] = None,
                 ac: Optional[int] = None, aura_radius: Optional[float] = None,
                 aura_color: Optional[str] = None,
                 metadata: Optional[str] = None,
                 asset_id: Optional[str] = None,
                 width: float = 0.0, height: float = 0.0,
                 vision_radius: Optional[float] = None,
                 has_darkvision: bool = False,
                 darkvision_radius: Optional[float] = None,
                 aura_radius_units: Optional[float] = None,
                 vision_radius_units: Optional[float] = None,
                 darkvision_radius_units: Optional[float] = None):
        # Use entity_id consistently
        self.entity_id = entity_id
        self.id = entity_id  # Keep both for backward compatibility
        self.name = name
        self.position = position
        self.layer = layer
        self.texture_path = path_to_texture
        self.asset_id = asset_id  # R2/CDN asset hash (used as texture identifier)
        self.scale_x = 1.0
        self.scale_y = 1.0
        self.rotation = 0.0
        self.width = width
        self.height = height
        
        # Obstacle metadata (for client-side lighting/collision)
        self.obstacle_type = obstacle_type  # "rectangle", "circle", "polygon", "line", None
        self.obstacle_data = obstacle_data  # Shape-specific data dict
        
        # Character binding
        self.character_id = character_id
        # Normalize controlled_by: may arrive as a JSON string (encoded by server_protocol before
        # passing to add_entity). Always store as a Python list.
        if isinstance(controlled_by, str):
            try:
                controlled_by = json.loads(controlled_by)
            except Exception:
                controlled_by = []
        self.controlled_by = controlled_by if controlled_by is not None else []
        
        # Token stats
        self.hp = hp
        self.max_hp = max_hp
        self.ac = ac
        self.aura_radius = aura_radius
        self.aura_color = aura_color  # hex string e.g. '#ffaa00' (JSON string, opaque to server — used by lights etc.)
        self.metadata = metadata
        # Vision fields (for dynamic lighting)
        self.vision_radius = vision_radius
        self.has_darkvision = has_darkvision
        self.darkvision_radius = darkvision_radius
        self.aura_radius_units = aura_radius_units  # game units (ft/m)
        self.vision_radius_units = vision_radius_units  # game units (ft/m)
        self.darkvision_radius_units = darkvision_radius_units  # game units (ft/m)

        self.sprite_id = str(uuid.uuid4())
        
    def to_dict(self):
        return {
            'entity_id': self.entity_id,
            'sprite_id': self.sprite_id,
            'name': self.name,
            'position': list(self.position),
            'layer': self.layer,
            'texture_path': self.texture_path,
            'asset_id': self.asset_id,  # R2/CDN asset hash - used by client as texture_id
            'scale_x': self.scale_x,
            'scale_y': self.scale_y,
            'rotation': self.rotation,
            'width': self.width,
            'height': self.height,
            'obstacle_type': self.obstacle_type,
            'obstacle_data': self.obstacle_data,
            # Character binding
            'character_id': self.character_id,
            'controlled_by': self.controlled_by,
            # Token stats
            'hp': self.hp,
            'max_hp': self.max_hp,
            'ac': self.ac,
            'aura_radius': self.aura_radius,
            'aura_color': self.aura_color,
            'metadata': self.metadata,
            # Vision fields
            'vision_radius': self.vision_radius,
            'has_darkvision': self.has_darkvision,
            'darkvision_radius': self.darkvision_radius,
            'aura_radius_units': self.aura_radius_units,
            'vision_radius_units': self.vision_radius_units,
            'darkvision_radius_units': self.darkvision_radius_units,
            # Legacy fields
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
            entity_id=data['entity_id'],
            character_id=data.get('character_id'),
            controlled_by=data.get('controlled_by', []),
            hp=data.get('hp'),
            max_hp=data.get('max_hp'),
            ac=data.get('ac'),
            aura_radius=data.get('aura_radius'),
            aura_color=data.get('aura_color'),
            asset_id=data.get('asset_id'),
            width=float(data.get('width') or 0.0),
            height=float(data.get('height') or 0.0),
        )
        entity.sprite_id = data.get('sprite_id', str(uuid.uuid4()))
        entity.scale_x = data.get('scale_x', 1.0)
        entity.scale_y = data.get('scale_y', 1.0)
        entity.rotation = data.get('rotation', 0.0)
        entity.width = data.get('width', 0.0)
        entity.height = data.get('height', 0.0)
        entity.metadata = data.get('metadata')
        entity.vision_radius = data.get('vision_radius')
        entity.has_darkvision = bool(data.get('has_darkvision', False))
        entity.darkvision_radius = data.get('darkvision_radius')
        entity.aura_radius_units = data.get('aura_radius_units')
        entity.vision_radius_units = data.get('vision_radius_units')
        entity.darkvision_radius_units = data.get('darkvision_radius_units')
        return entity

    def serialize(self) -> dict:
        """Serialize entity for database storage"""
        return self.to_dict()

class VirtualTable:
    def __init__(self, name: str, width: int, height: int, table_id: Optional[str] = None,
                 grid_cell_px: float = 50.0, cell_distance: float = 5.0, distance_unit: str = 'ft'):
        if not name or not name.strip():
            raise ValueError("Table name cannot be empty")
        if width <= 0:
            raise ValueError("Table width must be greater than 0")
        if height <= 0:
            raise ValueError("Table height must be greater than 0")
            
        if table_id:
            if isinstance(table_id, uuid.UUID):
                self.table_id = table_id
            elif isinstance(table_id, str):
                try:
                    self.table_id = uuid.UUID(table_id)
                except ValueError:
                    raise ValueError(f"Invalid UUID format: {table_id}")
            else:
                raise ValueError(f"table_id must be UUID or string, got {type(table_id)}")
        else:
            self.table_id = uuid.uuid4()
            
        self.display_name = name
        self.width = width
        self.height = height
        self.layers = ['map', 'tokens', 'dungeon_master', 'light', 'height', 'obstacles', 'fog_of_war']
        self.entities: Dict[int, Entity] = {}
        self.next_entity_id = 1
        self.sprite_to_entity: Dict[str, int] = {}
        self.fog_rectangles: Dict[str, List[Tuple[Tuple[float, float], Tuple[float, float]]]] = {
            'hide': [],
            'reveal': []
        }
        self.position = (0.0, 0.0)
        self.scale = (1.0, 1.0)
        self.layer_visibility = {layer: True for layer in self.layers}
        # Dynamic lighting settings (per-table, DM-controlled)
        self.dynamic_lighting_enabled: bool = False
        self.fog_exploration_mode: str = 'current_only'  # 'current_only' | 'persist_dimmed'
        self.ambient_light_level: float = 1.0            # 0.0 = pitch black, 1.0 = daylight

        # Coordinate system
        self.grid_cell_px: float = grid_cell_px
        self.cell_distance: float = cell_distance
        self.distance_unit: str = distance_unit
        self.grid_enabled: bool = True
        self.snap_to_grid: bool = True
        self.grid_color_hex: str = '#ffffff'
        self.background_color_hex: str = '#2a3441'

        # Wall segments (keyed by wall_id UUID string)
        self.walls: Dict[str, Any] = {}

        # Initialize grid
        self.grid = {}
        for layer in self.layers:
            self.grid[layer] = [[None for _ in range(width)] for _ in range(height)]

    @property
    def pixels_per_unit(self) -> float:
        """Pixels per game unit (ft or m). Default: 10.0 (50px / 5ft)"""
        if self.cell_distance <= 0:
            return 10.0
        return self.grid_cell_px / self.cell_distance

    def add_entity(self, entity_data: Dict[str, Any]) -> Optional['Entity']:
        """Add entity and return it"""
        position = entity_data.get('position')
        if position:
            position = (int(position[0]), int(position[1])) 
        else:
            # Support both coord_x/coord_y (legacy) and x/y (current) formats
            x = entity_data.get('x', entity_data.get('coord_x', 0))
            y = entity_data.get('y', entity_data.get('coord_y', 0))
            position = (int(x), int(y))
        layer = entity_data.get('layer', 'tokens')
        name = entity_data.get('name', 'Unnamed Entity')
        path_to_texture = entity_data.get('texture_path', None)
        asset_id = entity_data.get('asset_id', None) or entity_data.get('asset_xxhash', None)
        
        # Obstacle metadata
        obstacle_type = entity_data.get('obstacle_type', None)
        obstacle_data = entity_data.get('obstacle_data', None)
        # Polygon vertices may be sent as top-level polygon_vertices instead of obstacle_data
        if obstacle_type == 'polygon' and obstacle_data is None:
            poly_verts = entity_data.get('polygon_vertices', None)
            if poly_verts:
                obstacle_data = {'vertices': poly_verts}

        #TODO validate position 
        #if not self.is_valid_position(position):
        #    raise ValueError("Invalid position")
        original_position = position
        position = self._clamp_position(position)
        if position != original_position:
            logger.warning(f"Entity position clamped from {original_position} to {position}")
        if layer not in self.layers:
            raise ValueError("Invalid layer")
        #if self.grid[layer][position[1]][position[0]] is not None:
        #    raise ValueError("Position already occupied")
        logger.debug(f"Adding entity {name} at {position} on layer {layer} with texture {path_to_texture}")
        
        # Extract character binding and token stats
        character_id = entity_data.get('character_id')
        controlled_by = entity_data.get('controlled_by', [])
        hp = entity_data.get('hp')
        max_hp = entity_data.get('max_hp')
        ac = entity_data.get('ac')
        aura_radius = entity_data.get('aura_radius')
        aura_color = entity_data.get('aura_color')
        metadata = entity_data.get('metadata')
        # Vision fields
        vision_radius = entity_data.get('vision_radius')
        has_darkvision = bool(entity_data.get('has_darkvision', False))
        darkvision_radius = entity_data.get('darkvision_radius')
        
        entity = Entity(name, position, layer, path_to_texture, self.next_entity_id,
                       obstacle_type=obstacle_type, obstacle_data=obstacle_data,
                       character_id=character_id, controlled_by=controlled_by,
                       hp=hp, max_hp=max_hp, ac=ac, aura_radius=aura_radius,
                       aura_color=aura_color,
                       metadata=metadata,
                       asset_id=asset_id,
                       width=float(entity_data.get('width') or 0.0),
                       height=float(entity_data.get('height') or 0.0),
                       vision_radius=vision_radius,
                       has_darkvision=has_darkvision,
                       darkvision_radius=darkvision_radius)

        # Honor the sprite_id supplied by the client so the WASM id and server id stay in sync.
        # Entity.__init__ always generates a fresh UUID; we overwrite it here when the caller
        # already chose an id (e.g. optimistic create from the drag-drop flow).
        provided_sprite_id = entity_data.get('sprite_id')
        if provided_sprite_id:
            entity.sprite_id = str(provided_sprite_id)

        # Apply transform properties if provided
        if 'scale_x' in entity_data:
            entity.scale_x = entity_data['scale_x']
        if 'scale_y' in entity_data:
            entity.scale_y = entity_data['scale_y']
        if 'rotation' in entity_data:
            entity.rotation = entity_data['rotation']
        
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
        new_position = self._clamp_position(new_position)
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

    def _clamp_position(self, position: Tuple[int, int]) -> Tuple[int, int]:
        """Clamp position to valid table bounds"""
        x = max(0, min(int(position[0]), self.width - 1))
        y = max(0, min(int(position[1]), self.height - 1))
        return (x, y)
    
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
        """Convert table to dictionary"""
        return {
            'table_id': str(self.table_id),
            'table_name': self.display_name,
            'width': self.width,
            'height': self.height,
            'layers': self.table_to_layered_dict(),
            'fog_rectangles': self.fog_rectangles,
            'dynamic_lighting_enabled': self.dynamic_lighting_enabled,
            'fog_exploration_mode': self.fog_exploration_mode,
            'ambient_light_level': self.ambient_light_level,
            'grid_cell_px': self.grid_cell_px,
            'cell_distance': self.cell_distance,
            'distance_unit': self.distance_unit,
        }
    
    def to_json(self) -> str:
        """Convert table to JSON """
        data = self.to_dict()               
        return json.dumps(data, indent=2)
    
    def from_dict(self, data: Dict):
        """Load table from dictionary data"""
        self.display_name = data.get('table_name', data.get('name', 'Unknown Table'))
        self.width = data.get('width', 100)
        self.height = data.get('height', 100)
        self.dynamic_lighting_enabled = bool(data.get('dynamic_lighting_enabled', False))
        self.fog_exploration_mode = data.get('fog_exploration_mode', 'current_only')
        self.ambient_light_level = float(data.get('ambient_light_level', 1.0))
        self.grid_cell_px = float(data.get('grid_cell_px') or 50.0)
        self.cell_distance = float(data.get('cell_distance') or 5.0)
        self.distance_unit = data.get('distance_unit') or 'ft'

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
        
        logger.info(f"Loaded table '{self.display_name}' with {len(self.entities)} entities and {len(self.fog_rectangles['hide'])} fog rectangles")
    
    def save_to_disk(self, file_path: str):
        """Save table to disk with 'layers' format"""
        try:
            # Ensure directory exists
            directory = os.path.dirname(file_path)
            if directory and not os.path.exists(directory):
                os.makedirs(directory)
            
            # Create save data with 'layers' instead of 'entities'
            save_data = {
                'name': self.display_name,
                'width': self.width,
                'height': self.height,
                'layers': self.table_to_layered_dict(),
                'fog_rectangles': self.fog_rectangles,
                'metadata': {
                    'version': '1.0',
                    'entity_count': len(self.entities),
                    'next_entity_id': self.next_entity_id,
                    'created_timestamp': __import__('time').time()
                }
            }
            
            with open(file_path, 'w', encoding='utf-8') as f:
                json.dump(save_data, f, indent=2, ensure_ascii=False)
            
            logger.info(f"Saved table '{self.display_name}' to {file_path} ({len(self.entities)} entities)")
            
        except Exception as e:
            logger.error(f"Failed to save table to {file_path}: {e}")
            raise

    # ------------------------------------------------------------------
    # Wall segment CRUD
    # ------------------------------------------------------------------

    def add_wall(self, wall) -> None:
        """Add a Wall entity to this table's in-memory wall registry."""
        self.walls[wall.wall_id] = wall

    def get_wall(self, wall_id: str):
        """Return the Wall with the given id, or None."""
        return self.walls.get(wall_id)

    def update_wall(self, wall_id: str, updates: dict):
        """Apply a dict of field updates to a wall and return it."""
        wall = self.walls.get(wall_id)
        if wall is None:
            raise KeyError(f"Wall {wall_id!r} not found")
        _allowed = {
            'x1', 'y1', 'x2', 'y2', 'wall_type',
            'blocks_movement', 'blocks_light', 'blocks_sight', 'blocks_sound',
            'is_door', 'door_state', 'is_secret', 'direction',
        }
        for key, value in updates.items():
            if key in _allowed:
                setattr(wall, key, value)
        return wall

    def remove_wall(self, wall_id: str) -> None:
        """Remove a wall from the in-memory registry."""
        self.walls.pop(wall_id, None)

    def get_all_walls(self) -> list:
        """Return all walls as a list of dicts (for serialisation)."""
        return [w.to_dict() for w in self.walls.values()]


def get_entity_at_position(self, position: Tuple[int, int], layer: Optional[str] = None) -> Optional[Entity]:
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
                        layer: Optional[str] = None) -> List[Entity]:
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
        if entity.entity_id is not None:
            table.entities[entity.entity_id] = entity
            table.grid[entity.layer][entity.position[1]][entity.position[0]] = entity.entity_id
            table.next_entity_id = max(table.next_entity_id, entity.entity_id + 1)
    logger.info(f"Created table from JSON data")
    return table




if __name__ == "__main__":
    table = VirtualTable('test_table',10, 10)
    table.add_entity({
        'name': 'Hero',
        'position': (2, 3),
        'layer': 'tokens',
        'texture_path': 'resources/hero.png'
    })
    table.add_entity({
        'name': 'Goblin',
        'position': (5, 6),
        'layer': 'dungeon_master',
        'texture_path': 'resources/goblin.png'
    })
    table.save_to_disk("table.json")
    


    #logging.info(f"Received table data: {table_data}")