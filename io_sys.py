import sdl3
import ctypes
import logging
import json
import os
from storage import get_storage_manager

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
    """Save dictionary data to disk using new storage system"""
    try:
        # Use new storage manager for better organization
        storage_manager = get_storage_manager()
        
        # Save to SDL storage for persistence
        filename = dict_data.get("name", "unnamed_table")
        success = storage_manager.save_data_sdl(f"table_{filename}", dict_data)
        
        if success:
            logger.info(f"Saved table '{filename}' to SDL storage")
        else:
            # Fallback to old method
            filename_json = f'{filename}.json'
            with open(filename_json, 'w') as f:
                json.dump(dict_data, f, indent=2)
            logger.info(f"Saved table as {filename_json} (fallback)")
    
    except Exception as e:
        error_msg = f"Error saving data: {e}"
        logger.error(error_msg)

def load_json_from_disk(filename):
    """Load table data using new storage system"""
    try:
        storage_manager = get_storage_manager()
        
        # Try to load from SDL storage first
        if filename:
            # If filename provided, try to load specific table
            table_key = f"table_{filename.replace('.json', '')}"
            data = storage_manager.load_data_sdl(table_key)
            if data:
                logger.info(f"Loaded table '{filename}' from SDL storage")
                return data
        
        # Fallback: try to find any table files
        # First try SDL storage manifest
        storage_files = storage_manager.list_storage_files()
        table_files = [f for f in storage_files if f.startswith('table_')]
        
        if table_files:
            # Load the first table found
            data = storage_manager.load_data_sdl(table_files[0])
            if data:
                logger.info(f"Loaded table '{table_files[0]}' from SDL storage")
                return data
        
        # Fallback to old method - look for JSON files
        json_files = [f for f in os.listdir('.') if f.endswith('.json') and os.path.isfile(f)]
        
        if not json_files:
            logger.warning("No table files found")
            return None
        
        # Load the first JSON file found
        with open(json_files[0], 'r') as f:
            data = json.load(f)
            logger.info(f"Loaded table from file: {json_files[0]} (fallback)")
            return data
            
    except Exception as e:
        error_msg = f"Error loading table data: {e}"
        logger.error(error_msg)
        return None

# New file upload and management functions

def open_file_browser(file_types=None):
    """Open storage folder in system file manager"""
    try:
        import subprocess
        import sys
        
        storage_manager = get_storage_manager()
        folder_path = storage_manager.config.get_folder_path('other')
        
        # Ensure folder exists
        os.makedirs(folder_path, exist_ok=True)
        
        # Open folder in system file manager
        if sys.platform == "win32":
            subprocess.run(['explorer', folder_path], shell=True)
        elif sys.platform == "darwin":  # macOS
            subprocess.run(['open', folder_path])
        else:  # Linux
            subprocess.run(['xdg-open', folder_path])
        
        logger.info(f"Opened storage folder: {folder_path}")
        return [folder_path]  # Return folder path for compatibility
    except Exception as e:
        logger.error(f"Failed to open storage folder: {e}")
        return []

def upload_files_to_storage(file_paths):
    """Upload multiple files to storage system"""
    try:
        storage_manager = get_storage_manager()
        uploaded_files = []
        
        for file_path in file_paths:
            filename = os.path.basename(file_path)
            file_type = storage_manager.detect_file_type(file_path)
            
            saved_path = storage_manager.save_file(file_path, filename, file_type)
            if saved_path:
                uploaded_files.append(saved_path)
                logger.info(f"Uploaded: {filename} to {file_type}")
            else:
                logger.error(f"Failed to upload: {filename}")
        
        return uploaded_files
        
    except Exception as e:
        logger.error(f"Failed to upload files: {e}")
        return []

def get_available_images():
    """Get list of available image files from storage"""
    try:
        storage_manager = get_storage_manager()
        images = storage_manager.list_files('images')
        return [(img, storage_manager.config.get_folder_path('images')) for img in images]
    except Exception as e:
        logger.error(f"Failed to get available images: {e}")
        return []

def get_file_from_storage(filename, file_type='images'):
    """Get full path to file in storage"""
    try:
        storage_manager = get_storage_manager()
        return storage_manager.load_file(filename, file_type)
    except Exception as e:
        logger.error(f"Failed to get file from storage: {e}")
        return None

def save_game_state(state_data, save_name):
    """Save complete game state using SDL storage"""
    try:
        storage_manager = get_storage_manager()
        success = storage_manager.save_data_sdl(f"save_{save_name}", state_data)
        if success:
            logger.info(f"Saved game state: {save_name}")
        return success
    except Exception as e:
        logger.error(f"Failed to save game state: {e}")
        return False

def load_game_state(save_name):
    """Load complete game state from SDL storage"""
    try:
        storage_manager = get_storage_manager()
        state_data = storage_manager.load_data_sdl(f"save_{save_name}")
        if state_data:
            logger.info(f"Loaded game state: {save_name}")
        return state_data
    except Exception as e:
        logger.error(f"Failed to load game state: {e}")
        return None

def get_storage_stats():
    """Get storage system statistics"""
    try:
        storage_manager = get_storage_manager()
        return storage_manager.get_storage_stats()
    except Exception as e:
        logger.error(f"Failed to get storage stats: {e}")
        return {}

def cleanup_storage():
    """Cleanup old cache files and optimize storage"""
    try:
        storage_manager = get_storage_manager()
        success = storage_manager.cleanup_cache()
        if success:
            logger.info("Storage cleanup completed")
        return success
    except Exception as e:
        logger.error(f"Failed to cleanup storage: {e}")
        return False
