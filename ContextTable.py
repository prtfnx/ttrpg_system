import ctypes
from Sprite import Sprite
import uuid
import sdl3
from logger import setup_logger

logger = setup_logger(__name__)

CELL_SIDE: int = 20

class ContextTable:
    def __init__(self, table_name: str, width: int, height: int, scale: float = 1.0, table_id: str | None = None):
        # Use provided table_id or generate a new UUID
        self.table_id = table_id or str(uuid.uuid4())
        self.table_name = table_name  # Display name
        self.name = table_name  # Legacy compatibility
        self.width = width
        self.height = height
        self.layers = ['map','tokens', 'dungeon_master', 'light', 'height', 'obstacles', 'fog_of_war']
        self.dict_of_sprites_list = {layer: [] for layer in self.layers}
        
        # Fog of war rectangles storage
        self.fog_rectangles = {'hide': [], 'reveal': []}
        self.selected_sprite: Sprite | None = None
        self.selected_layer: str = 'tokens'  # Default layer for new sprites
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

   

    def toggle_grid(self):
        """Toggle grid visibility."""
        self.show_grid = not self.show_grid
        logger.info(f"Grid visibility: {self.show_grid}")
    
    def change_scale(self, increment):
        """Change the scale of the table"""
        from Context import MIN_SCALE, MAX_SCALE
        self.scale += increment
        self.scale = max(MIN_SCALE, min(MAX_SCALE, self.scale))
        logger.info(f"Grid scale: {self.scale}")
        
    def move_table(self, x, y):
        """Move the table by a certain amount"""
        from Context import MIN_TABLE_X, MAX_TABLE_X, MIN_TABLE_Y, MAX_TABLE_Y
        self.x_moved += x
        self.y_moved += y
        self.x_moved = max(MIN_TABLE_X, min(MAX_TABLE_X, self.x_moved))
        self.y_moved = max(MIN_TABLE_Y, min(MAX_TABLE_Y, self.y_moved))
        logger.info(f"Table moved to: ({self.x_moved}, {self.y_moved})")

    def update_position(self, dx: float, dy: float):
        """Update position and notify server"""
        self.x_moved = max(-1000, min(0, self.x_moved + dx))
        self.y_moved = max(-1000, min(0, self.y_moved + dy))
        # Note: removed _context reference for now    
        
    def save_to_dict(self):
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
                       for layer, sprites in self.dict_of_sprites_list.items()}        
        }
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
