import sdl3
import ctypes
import logging
import json
import os
from storage import get_storage_manager
import settings

logger = logging.getLogger(__name__)

def load_texture(sprite, context=None):
    """Load a texture for the given sprite, supporting R2 asset caching"""
    if not sprite or not sprite.texture_path:
        logger.error("Invalid sprite or texture path")
        return None

    surface = None
    texture = None

    # Try to use asset_id if present (for R2 integration)
    asset_id = getattr(sprite, 'asset_id', None)
    asset_manager = sprite.context.AssetManager
    texture_path = sprite.texture_path
    
    if asset_id:
        cached_path = asset_manager.get_asset_for_sprite(asset_id)
        if cached_path:
            texture_path = cached_path
            logger.debug(f"Using cached R2 asset for sprite {sprite.sprite_id}: {cached_path}")
        else:
            # Asset not cached - trigger download request and use original path as placeholder
            logger.info(f"Asset {asset_id} not cached for sprite {sprite.sprite_id}, requesting download")
            _trigger_r2_asset_request(sprite, asset_id, context)
            # Continue with original path as placeholder while download happens
    
    # Check if the file exists locally
    if not os.path.exists(texture_path):
        # File doesn't exist - try to request R2 asset by filename
        logger.warning(f"Texture file not found: {texture_path}")
        if context:
            # Extract filename from path for R2 request
            filename = os.path.basename(texture_path)
            success = _trigger_r2_asset_request_for_missing_file(sprite, filename, context)
            if success:
                logger.info(f"Requested R2 download for missing texture: {filename}")
            else:
                logger.warning(f"Could not request R2 asset for missing texture: {filename}")
          # Return None - sprite will render without texture (or with placeholder)
        return None

    try:        # Load surface
        # Encode texture_path if it's a string
        if isinstance(texture_path, str):
            texture_path_encoded = texture_path.encode('utf-8')
        else:
            texture_path_encoded = texture_path
            
        surface = sdl3.IMG_Load(texture_path_encoded)
        if not surface:
            error_msg = sdl3.SDL_GetError()
            # Convert error message to string if needed           
            logger.error("Couldn't load bitmap: %s", error_msg)
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
            return None        # Create texture from surface
        if not sprite.renderer:
            logger.error("Sprite renderer is None - cannot create texture")
            return None
            
        logger.debug(f"Creating texture with renderer type: {type(sprite.renderer)}")
        
        try:            
            texture = sdl3.SDL_CreateTextureFromSurface(sprite.renderer, surface)
            if not texture:
                error_msg = sdl3.SDL_GetError()
                if hasattr(error_msg, 'decode'):
                    error_msg = error_msg.decode('utf-8')
                elif hasattr(error_msg, 'value'):
                    error_msg = str(error_msg.value)
                else:
                    error_msg = str(error_msg)
                logger.error("Failed to create texture: %s", error_msg)
                return None
        except Exception as e:
            logger.error(f"Exception during texture creation: {e}")
            logger.error(f"Renderer: {sprite.renderer}, Surface: {surface}")
            return None

        # Set original size after successful texture creation
        sprite.set_original_size()

        logger.info(f"Successfully loaded texture: {texture_path}")
        return texture

    except Exception as e:
        logger.error(f"Exception loading texture {texture_path}: {e}")
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
        
        # Use settings-defined storage path instead of storage manager
        folder_path = settings.get_storage_path(settings.OTHER_FOLDER)
        
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
        images_path = settings.get_storage_path(settings.IMAGES_FOLDER)
        if not os.path.exists(images_path):
            return []
        
        images = []
        for filename in os.listdir(images_path):
            file_ext = os.path.splitext(filename)[1].lower()
            if file_ext in settings.SUPPORTED_IMAGE_FORMATS:
                images.append((filename, images_path))
        
        return images
    except Exception as e:
        logger.error(f"Failed to get available images: {e}")
        return []

def get_file_from_storage(filename, file_type='images'):
    """Get full path to file in storage"""
    try:
        # Map file_type to appropriate folder
        folder_map = {
            'images': settings.IMAGES_FOLDER,
            'music': settings.MUSIC_FOLDER,
            'video': settings.VIDEO_FOLDER,
            'other': settings.OTHER_FOLDER,
            'saves': settings.SAVES_FOLDER
        }
        
        folder_name = folder_map.get(file_type, settings.OTHER_FOLDER)
        folder_path = settings.get_storage_path(folder_name)
        file_path = os.path.join(folder_path, filename)
        
        if os.path.exists(file_path):
            return file_path
        else:
            logger.warning(f"File not found: {file_path}")
            return None
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

def _trigger_r2_asset_request(sprite, asset_id, context):
    """Trigger R2 asset download request for a sprite"""
    try:
        if context and hasattr(context, 'request_asset_download'):
            success = context.request_asset_download(asset_id)
            if success:
                logger.info(f"R2 asset download requested for asset {asset_id}")
            else:
                logger.warning(f"Failed to request R2 asset download for {asset_id}")
            return success
        else:
            logger.warning(f"No context available to request R2 asset {asset_id}")
            return False
    except Exception as e:
        logger.error(f"Error triggering R2 asset request for {asset_id}: {e}")
        return False

def _trigger_r2_asset_request_for_missing_file(sprite, file_path, context):
    """Trigger R2 asset request when a file is missing (try to infer asset_id from filename)"""
    try:
        # Extract potential asset_id from filename
        # This is heuristic - in practice, you'd want a better mapping
        filename = os.path.basename(file_path)
        name_without_ext = os.path.splitext(filename)[0]        
       
        logger.info(f"Missing file {file_path} might be R2 asset {potential_asset_id}, requesting download")
        return _trigger_r2_asset_request(sprite, name_without_ext, context)

        
    except Exception as e:
        logger.error(f"Error checking missing file for R2 asset: {e}")
        return False


