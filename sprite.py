import ctypes
import logging
import io_sys
import sdl3

logger = logging.getLogger(__name__)

class Sprite:
    def __init__(self, renderer, texture_path, scale_x=1, scale_y=1,
                 character=None, moving=False, speed=None, collidable=False,
                 texture=None, layer='tokens'):
        # Initialize all ctypes structures properly
        self.coord_x = ctypes.c_float(0.0)
        self.coord_y = ctypes.c_float(0.0)
        self.rect = sdl3.SDL_Rect()
        self.frect = sdl3.SDL_FRect()
        
        # Initialize dimensions to prevent access violations
        self.original_w = 0.0
        self.original_h = 0.0
        
        # Store basic properties
        self.texture_path = texture_path
        self.renderer = renderer
        self.scale_x = scale_x
        self.scale_y = scale_y
        self.character = character
        self.moving = moving
        self.speed = speed
        self.die_timer = None
        self.collidable = collidable
        self.layer = layer
        self.texture = None
        
        # Initialize movement properties
        self.dx = 0.0
        self.dy = 0.0
        
        # Load texture last, after everything is initialized
        try:
            self.set_texture(texture_path)
        except Exception as e:
            logger.error(f"Failed to load texture {texture_path}: {e}")
            self.texture = None

    def __repr__(self):
        return (f"Sprite(coord_x={self.coord_x}, coord_y={self.coord_y}, rect={self.rect}, "
                f"frect={self.frect}, texture_path={self.texture_path}, scale_x={self.scale_x}, scale_y={self.scale_y})")

    def __str__(self):
        return (f"Sprite at ({self.coord_x.value}, {self.coord_y.value}) "
                f"with texture {self.texture_path} and scale {self.scale_x} {self.scale_y}")

    def set_speed(self, dx, dy):
        self.dx = dx
        self.dy = dy

    def move(self, delta_time):
        if self.moving:
            self.coord_x.value += self.dx * delta_time
            self.coord_y.value += self.dy * delta_time

    def set_die_timer(self, time):
        self.die_timer = time

    def set_texture(self, texture_path):
        """Set texture with proper error handling"""
        self.texture_path = texture_path
        logger.info("Setting texture path: %s", texture_path)
        
        try:
            self.texture = io_sys.load_texture(self)
            if not self.texture:
                logger.error(f"Failed to load texture: {texture_path}")
                return False
            return True
        except Exception as e:
            logger.error(f"Exception loading texture {texture_path}: {e}")
            self.texture = None
            return False

    def set_position(self, x, y):
        #TODO: fix logic for setting frect
        self.coord_x.value = x
        self.coord_y.value = y
        self.set_frect()

    def set_frect(self):
        """Fix logic for setting frect - avoid memory corruption"""
        # Don't reassign the same values repeatedly - this causes memory issues
        self.frect.x = ctypes.c_float(self.coord_x.value)
        self.frect.y = ctypes.c_float(self.coord_y.value)
        
        # Only scale if we have original dimensions
        if hasattr(self, 'original_w') and hasattr(self, 'original_h'):
            self.frect.w = ctypes.c_float(self.original_w * self.scale_x)
            self.frect.h = ctypes.c_float(self.original_h * self.scale_y)

    def set_rect(self):
        self.rect.x = int(self.coord_x)
        self.rect.y = int(self.coord_y)
        self.rect.w = int(self.frect.w * self.scale_x)
        self.rect.h = int(self.frect.h * self.scale_y)
    def set_original_size(self):
        """Set original size with validation"""
        if self.frect.w > 0 and self.frect.h > 0:
            self.original_w = float(self.frect.w)
            self.original_h = float(self.frect.h)
        else:
            logger.warning(f"Invalid frect dimensions: {self.frect.w}x{self.frect.h}")
            self.original_w = 32.0  # Default fallback
            self.original_h = 32.0
    def die(self):
        #TODO: remove
        self.cleanup()

    def cleanup(self):
        """Clean up sprite resources"""
        try:
            if hasattr(self, 'texture') and self.texture:
                sdl3.SDL_DestroyTexture(self.texture)
                self.texture = None
                logger.debug(f"Cleaned up texture for sprite: {self.texture_path}")
        except Exception as e:
            logger.error(f"Error cleaning up sprite texture: {e}")