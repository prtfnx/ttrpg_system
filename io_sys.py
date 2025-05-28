import sdl3
import ctypes
import logging
import json
import os

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

def save_dict_to_disk(dict_data):
    try:

        filename = f'{dict_data.get("name")}.json'

        with open(filename, 'w') as f:
            json.dump(dict_data, f, indent=2)

        logger.info(f"Saved table as {filename}")
    
    except Exception as e:
        error_msg = f"Error saving json: {e}"
        
        logger.error(error_msg)

def load_json_from_disk(filename):
    try:
        #TODO implement
        # Simple implementation - look for JSON files in current directory
        json_files = [f for f in os.listdir('.') if f.endswith('.json') and os.path.isfile(f)]
        
        if not json_files:
            logger.warning("No JSON table files found")
            return
        
        # Load the first JSON file found (in production, use file dialog)
        filename = json_files[0]
        with open(filename, 'r') as f:
            data = json.load(f)
        return data
    except Exception as e:
        error_msg = f"Error loading json file: {e}"
        logger.error(error_msg)
    
        # Create table from JSON data
