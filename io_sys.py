import sdl3
import ctypes
import logging

logger = logging.getLogger(__name__)

def load_texture(sprite):
    """Load a texture for the given sprite with proper error handling"""
    if not sprite or not sprite.texture_path:
        logger.error("Invalid sprite or texture path")
        return None
    
    surface = None
    texture = None
    
    try:
        # Check if file exists
        try:
            with open(sprite.texture_path, 'rb'):
                pass
        except (OSError, IOError) as e:
            logger.error(f"Cannot access texture file {sprite.texture_path}: {e}")
            return None
        
        # Load surface
        surface = sdl3.IMG_Load(sprite.texture_path)
        if not surface:
            logger.error("Couldn't load bitmap: %s", sdl3.SDL_GetError().decode())
            return None
        
        # Validate surface pointer
        try:
            surface_contents = surface.contents
            if not surface_contents:
                logger.error("Surface contents are null")
                return None
        except (ValueError, AttributeError) as e:
            logger.error("Error accessing surface: %s", e)
            return None
        
        # Get surface properties safely
        try:
            # Initialize rect properly
            sprite.rect.x = 0
            sprite.rect.y = 0
            sprite.rect.w = surface_contents.w
            sprite.rect.h = surface_contents.h
            
            # Convert to frect
            sprite.frect.x = ctypes.c_float(0.0)
            sprite.frect.y = ctypes.c_float(0.0)
            sprite.frect.w = ctypes.c_float(float(surface_contents.w))
            sprite.frect.h = ctypes.c_float(float(surface_contents.h))
            
            logger.debug(f"Surface size: {surface_contents.w}x{surface_contents.h}")
            
        except Exception as e:
            logger.error(f"Error setting sprite dimensions: {e}")
            return None
        
        # Create texture from surface
        texture = sdl3.SDL_CreateTextureFromSurface(sprite.renderer, surface)
        if not texture:
            logger.error("Failed to create texture: %s", sdl3.SDL_GetError().decode())
            return None
        
        # Set original size after successful texture creation
        sprite.set_original_size()
        
        logger.info(f"Successfully loaded texture: {sprite.texture_path}")
        return texture
        
    except Exception as e:
        logger.error(f"Exception loading texture {sprite.texture_path}: {e}")
        return None
        
    finally:
        # Always clean up surface
        if surface:
            try:
                sdl3.SDL_DestroySurface(surface)
            except Exception as e:
                logger.error(f"Error destroying surface: {e}")
