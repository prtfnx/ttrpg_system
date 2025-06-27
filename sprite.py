import ctypes
from logger import setup_logger
import os
import io_sys
import sdl3
import uuid
import os

logger = setup_logger(__name__)

class Sprite:
    def __init__(self, renderer, texture_path, scale_x=1, scale_y=1,
                 character=None, moving=False, speed=None, collidable=False,
                 texture=None, layer='tokens', coord_x=0.0, coord_y=0.0,
                 compendium_entity=None, entity_type=None, sprite_id=None, die_timer=None,
                 asset_id=None, context=None):
        # Initialize all ctypes structures properly
        self.coord_x = ctypes.c_float(coord_x)
        self.coord_y = ctypes.c_float(coord_y)
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
        self.die_timer = die_timer
        self.collidable = collidable
        self.layer = layer
        self.texture = None
          # Compendium entity support
        self.compendium_entity = compendium_entity
        self.entity_type = entity_type
        self.sprite_id = sprite_id if sprite_id is not None else str(uuid.uuid4())
          # R2 Asset support
        self.asset_id = asset_id
        self.context = context  # Store context reference for R2 requests
        
        # Add name attribute for identification
        if compendium_entity and hasattr(compendium_entity, 'name'):
            self.name = compendium_entity.name
        else:
            self.name = None
        
        # Initialize movement properties
        self.dx = 0.0
        self.dy = 0.0
        
        # Store previous position for network sync
        self._last_network_x = coord_x
        self._last_network_y = coord_y
        
        # Load texture last, after everything is initialized
        logger.info(f"created sprite {self.sprite_id} at ({coord_x}, {coord_y}) with texture path {texture_path}")
        try:
            io_sys.load_texture(self, context)
            #self.set_texture(texture_path)
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
    
    def set_texture(self, texture_path, context=None):
        """Set texture with proper error handling"""
        self.texture_path = texture_path
        logger.info("Setting texture path: %s", texture_path)
        
        # Use provided context or fall back to instance context
        ctx = context or self.context
        
        try:
            self.texture = io_sys.load_texture(self, ctx)
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

    def reload_texture(self, texture: sdl3.SDL_Texture,w: int ,h: int) -> bool:
        """Reload texture"""     
        old_texture = self.texture        
        self.texture = texture
        if old_texture and self.texture:
            try:
                sdl3.SDL_DestroyTexture(old_texture)
            except Exception as e:
                logger.error(f"Error destroying old texture: {e}")
            
        if self.texture:            
            self.rect.w = w
            self.rect.h = h           
            self.frect.w = ctypes.c_float(w)
            self.frect.h = ctypes.c_float(h)
            self.original_w = float(w)
            self.original_h = float(h)
        return True
       

    def has_r2_asset(self) -> bool:
        """Check if this sprite has an associated R2 asset"""
        return self.asset_id is not None
