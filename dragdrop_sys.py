import sdl3
import ctypes
import logging
import os
import hashlib
import json
# Import storage system for file handling

logger = logging.getLogger(__name__)

def init_drag_drop_system():
    """Initialize drag and drop system."""
    logger.info("Drag and drop system initialized")

def handle_drag_drop_event(context, event):
    """Handle drag and drop events."""
    try:
        if event.type == sdl3.SDL_EVENT_DROP_BEGIN:
            logger.info("Drag and drop operation started")
            return True
            
        elif event.type == sdl3.SDL_EVENT_DROP_FILE:
            # Get the dropped file path
            file_path = event.drop.data.decode('utf-8') if event.drop.data else None
            
            if file_path:
                logger.info(f"File dropped: {file_path}")
                return handle_dropped_file(context, file_path)
                
        elif event.type == sdl3.SDL_EVENT_DROP_TEXT:
            # Handle dropped text (could be file path or URL)
            text = event.drop.data.decode('utf-8') if event.drop.data else None
            
            if text:
                logger.info(f"Text dropped: {text}")
                return handle_dropped_text(context, text)
                
        elif event.type == sdl3.SDL_EVENT_DROP_COMPLETE:
            logger.info("Drag and drop operation completed")
            return True
            
    except Exception as e:
        logger.error(f"Error handling drag and drop event: {e}")
        
    return False

def handle_dropped_file(context, file_path):
    """Handle a dropped file using new storage system."""
    try:
        # Validate file exists
        if not os.path.exists(file_path):
            logger.error(f"Dropped file does not exist: {file_path}")
            return False
            
        # Check if this asset is already cached
        asset_manager = context.AssetManager
        
        # Generate asset ID from file content
        potential_asset_id = generate_asset_id_from_file(file_path)
        filename = os.path.basename(file_path)
        
        # Check if already cached
        if asset_manager.is_asset_cached(potential_asset_id):
            logger.info(f"Asset {filename} already cached, using cached version")
            cached_path = asset_manager.get_cached_asset_path(potential_asset_id)
            
            # If it's an image, create sprite from cached asset
            if is_image_file(file_path):
                return create_sprite_from_cached_asset(context, potential_asset_id, filename, cached_path)
            elif file_path.lower().endswith('.json'):
                return load_table_from_json_file(context, cached_path or file_path)
        
        # Not cached, use R2 asset upload workflow
        logger.info(f"Asset {filename} not cached, uploading to R2")
        upload_result = upload_file_to_r2(context, file_path)
        
        if upload_result and upload_result.get('success', False):
            # File was successfully uploaded to R2
            asset_id = upload_result.get('asset_id')
            filename = upload_result.get('filename')
              # If it's an image, create a sprite
            if is_image_file(file_path):
                return create_sprite_from_r2_asset(context, asset_id, filename, file_path)
              # If it's a JSON table file, load it  
            elif file_path.lower().endswith('.json'):
                return load_table_from_json_file(context, file_path)
        else:
            logger.error(f"Failed to upload file to R2: {upload_result.get('error', 'Unknown error')}")
            return False
            
    except Exception as e:
        logger.error(f"Error handling dropped file {file_path}: {e}")
        
    return False

def handle_dropped_text(context, text):
    """Handle dropped text (could be URL or file path)."""
    try:
        # Check if text is a file path
        if os.path.exists(text):
            return handle_dropped_file(context, text)
            
        # Check if text is a URL pointing to an image
        if text.startswith(('http://', 'https://')):
            return handle_dropped_url(context, text)
            
        logger.info(f"Dropped text not handled: {text}")
        return False
        
    except Exception as e:
        logger.error(f"Error handling dropped text {text}: {e}")
        
    return False

def handle_dropped_url(context, url):
    """Handle a dropped URL (download and create sprite)."""
    try:
        import urllib.request
        import tempfile
        import time
        
        # Check if URL points to an image
        image_extensions = ('.png', '.jpg', '.jpeg', '.gif', '.bmp', '.tiff', '.webp')
        if not any(url.lower().endswith(ext) for ext in image_extensions):
            logger.warning(f"URL does not point to an image: {url}")
            return False
            
        # Download the image
        temp_dir = tempfile.gettempdir()
        timestamp = int(time.time())
        file_extension = url.split('.')[-1].lower()
        temp_file = os.path.join(temp_dir, f"downloaded_image_{timestamp}.{file_extension}")
        
        logger.info(f"Downloading image from URL: {url}")
        urllib.request.urlretrieve(url, temp_file)
        
        # Create sprite from downloaded file
        result = create_sprite_from_dropped_image(context, temp_file)
        
        # Clean up temp file
        # os.remove(temp_file)  # Uncomment to clean up
        
        return result
        
    except Exception as e:
        logger.error(f"Error handling dropped URL {url}: {e}")
        
    return False

def create_sprite_from_dropped_image(context, file_path):
    """Create a sprite from a dropped image file."""
    try:
        if not context.current_table:
            logger.warning("No current table to add sprite to")
            return False        
        # Get mouse position to place the sprite where it was dropped        
        mouse_pos_x = ctypes.c_float(0.0)
        mouse_pos_y = ctypes.c_float(0.0)
        sdl3.SDL_GetMouseState(ctypes.byref(mouse_pos_x), ctypes.byref(mouse_pos_y))
        
        # TODO: Replace with proper SDL3 mouse state API when available
        
        logger.debug("Using default mouse position for sprite placement")
        
        # Create sprite
        new_sprite = context.add_sprite(
            texture_path=file_path.encode(),
            scale_x=1.0,
            scale_y=1.0,
            layer='tokens'
        )
        
        if new_sprite:            # Position sprite at mouse location (where it was dropped)
            table = context.current_table
            table_x = (mouse_pos_x - table.x_moved) / table.scale
            table_y = (mouse_pos_y - table.y_moved) / table.scale
            
            new_sprite.set_position(
                table_x - new_sprite.frect.w // 2,
                table_y - new_sprite.frect.h // 2
            )
            
            context.current_table.selected_sprite = new_sprite
            logger.info(f"Created sprite from dropped image: {file_path}")
            return True
            
    except Exception as e:
        logger.error(f"Error creating sprite from dropped image {file_path}: {e}")
        
    return False

def create_sprite_from_stored_image(context, image_path, filename):
    """Create a sprite from an image that's been stored in the storage system."""
    try:
        if not context.current_table:
            logger.warning("No current table to add sprite to")
            return False        # Get mouse position for sprite placement
        # Using fallback position due to SDL3 API compatibility issues
        sdl3.SDL_GetMouseState
        mouse_pos_x = 100.0  # Default position
        mouse_pos_y = 100.0  # Default position
        
        # TODO: Replace with proper SDL3 mouse state API when available
        # The current PySDL3 version has type issues with SDL_GetMouseState
        logger.debug("Using default mouse position for sprite placement")
        
        # Create sprite
        new_sprite = context.add_sprite(
            texture_path=image_path.encode(),
            scale_x=1.0,
            scale_y=1.0,
            layer='tokens'
        )
        
        if new_sprite:            # Position sprite at mouse location (where it was dropped)
            table = context.current_table
            # Fix the SDL mouse state issue by converting properly
            table_x = (mouse_pos_x - table.x_moved) / table.scale
            table_y = (mouse_pos_y - table.y_moved) / table.scale
            
            new_sprite.set_position(
                table_x - new_sprite.frect.w // 2,
                table_y - new_sprite.frect.h // 2
            )
            
            # Set as selected sprite
            context.current_table.selected_sprite = new_sprite
            
            logger.info(f"Created sprite from stored image: {filename}")
            return True
        else:
            logger.error(f"Failed to create sprite from stored image: {filename}")
            return False
            
    except Exception as e:
        logger.error(f"Error creating sprite from stored image {filename}: {e}")
        return False

def load_table_from_json_file(context, file_path):
    """Load a table from a dropped JSON file."""
    try:
        
        
        with open(file_path, 'r') as f:
            data = json.load(f)
            
        logger.info(f"Loading table from JSON file: {file_path}")
        table = context.create_table_from_dict(data)
        
        if table:
            context.list_of_tables.append(table)
            context.current_table = table
            logger.info("Table loaded from dropped JSON file")
            return True
            
    except Exception as e:
        logger.error(f"Error loading table from JSON file {file_path}: {e}")
        
    return False

def is_image_file(file_path):
    """Check if a file is an image based on its extension"""
    image_extensions = {'.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp', '.svg'}
    _, ext = os.path.splitext(file_path.lower())
    return ext in image_extensions

def upload_file_to_r2(context, file_path):
    """Upload a file to R2 storage via the server (async workflow)"""
    try:
        if not context or not hasattr(context, 'request_asset_upload'):
            logger.error("Context missing or doesn't support asset upload")
            return {'success': False, 'error': 'No context or upload support'}
        
        filename = os.path.basename(file_path)
        logger.info(f"Requesting upload URL for {filename}")
        
        # Use the existing async upload request
        success = context.request_asset_upload(file_path, filename)
        
        if success:
            logger.info(f"Upload request sent for {filename}. Upload URL will be provided asynchronously.")
            # For now, return success - the actual upload will happen when the server responds
            return {
                'success': True,
                'asset_id': 'pending',  # Will be updated when response arrives
                'filename': filename,
                'status': 'upload_requested'
            }
        else:
            logger.error(f"Failed to request upload URL for {filename}")
            return {'success': False, 'error': 'Failed to request upload URL'}
        
    except Exception as e:
        logger.error(f"Error requesting upload for file: {e}")
        return {'success': False, 'error': str(e)}

def create_sprite_from_r2_asset(context, asset_id, filename, file_path=None):
    """Create a sprite from an R2 asset (or pending asset)"""
    try:
        if not context:
            logger.error("No context available to create sprite")
            return False
        
        # Get current mouse position or center of screen
        # For now, place it at a default position
        x, y = 400, 300
        if asset_id == 'pending':
            logger.info(f"Creating sprite with pending upload for {filename} at position ({x}, {y})")
            # Create sprite using the original file path so it can load the texture immediately
            texture_path = file_path if file_path and os.path.exists(file_path) else filename
            sprite = context.add_sprite(
                coord_x=x, 
                coord_y=y,
                texture_path=texture_path,  # Use original file path if available
                scale_x=1.0,
                scale_y=1.0,
                layer='tokens'
            )
              # Mark this sprite as having a pending upload
            if sprite and hasattr(context, 'pending_upload_files'):
                # Find the pending upload for this filename
                for pending_asset_id, file_path in context.pending_upload_files.items():
                    if os.path.basename(file_path) == filename:
                        sprite.pending_asset_id = pending_asset_id
                        logger.info(f"Sprite marked with pending asset ID: {pending_asset_id}")
                        break
        else:
            logger.info(f"Creating sprite from R2 asset {asset_id} ({filename}) at position ({x}, {y})")
            # Create sprite with confirmed R2 asset reference
            sprite = context.add_sprite(
                coord_x=x, 
                coord_y=y,
                texture_path=filename,  # Use filename as texture path
                scale_x=1.0,
                scale_y=1.0,
                layer='tokens'
            )
            # Store the R2 asset ID for future reference
            if sprite:
                sprite.asset_id = asset_id
        
        if sprite:
            logger.info(f"Successfully created sprite from asset: {filename}")
            return True
        else:
            logger.error(f"Failed to create sprite from asset: {filename}")
            return False
        
    except Exception as e:
        logger.error(f"Error creating sprite from asset: {e}")
        return False

def create_sprite_from_cached_asset(context, asset_id, filename, cached_path):
    """Create a sprite from a cached asset"""
    try:
        if not context:
            logger.error("No context available to create sprite")
            return False
            
        if not cached_path or not os.path.exists(cached_path):
            logger.error(f"Cached asset path doesn't exist: {cached_path}")
            return False
        
        # Get current mouse position or use default
        x, y = 400, 300
        
        logger.info(f"Creating sprite from cached asset {filename} at position ({x}, {y})")
        sprite = context.add_sprite(
            coord_x=x, 
            coord_y=y,
            texture_path=cached_path,
            scale_x=1.0,
            scale_y=1.0,
            layer='tokens'
        )
        
        if sprite:
            # Mark sprite with asset ID for future reference
            sprite.asset_id = asset_id
            logger.info(f"Successfully created sprite from cached asset: {filename}")
            return True
        else:
            logger.error(f"Failed to create sprite from cached asset: {filename}")
            return False
            
    except Exception as e:
        logger.error(f"Error creating sprite from cached asset {filename}: {e}")
        return False

def generate_asset_id_from_file(file_path: str) -> str:
    """Generate a consistent asset ID from file content"""
    try:
        with open(file_path, 'rb') as f:
            file_content = f.read()
        return hashlib.md5(file_content).hexdigest()[:16]
    except Exception as e:
        logger.error(f"Error generating asset ID for {file_path}: {e}")
        # Fallback to filename + size if can't read content
        try:
            filename = os.path.basename(file_path)
            file_size = os.path.getsize(file_path)
            return hashlib.md5(f"{filename}_{file_size}".encode()).hexdigest()[:16]
        except:
            return hashlib.md5(file_path.encode()).hexdigest()[:16]