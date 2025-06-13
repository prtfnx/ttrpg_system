import sdl3
import ctypes
import logging
import os

# Import storage system for file handling
from storage.file_upload import handle_dropped_files

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
        
        # Use new storage system to handle the file
        upload_results = handle_dropped_files([file_path])
        
        if upload_results and len(upload_results) > 0:
            result = upload_results[0]
            if result.get('success', False):
                # File was successfully uploaded to storage
                local_path = result.get('local_path')
                file_type = result.get('file_type', 'other')
                
                # If it's an image, create a sprite
                if file_type == 'images' and local_path:
                    return create_sprite_from_stored_image(context, local_path, result['filename'])
                
                # If it's a JSON table file, load it
                elif file_path.lower().endswith('.json'):
                    return load_table_from_json_file(context, local_path or file_path)
                
                logger.info(f"File successfully stored: {result['filename']}")
                return True
            else:
                logger.error(f"Failed to store dropped file: {result.get('error', 'Unknown error')}")
                return False
        else:
            logger.error("No results from file upload")
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
            return False        # Get mouse position to place the sprite where it was dropped
        # Using fallback position due to SDL3 API compatibility issues
        mouse_pos_x = 100.0  # Default position
        mouse_pos_y = 100.0  # Default position
        
        # TODO: Replace with proper SDL3 mouse state API when available
        # The current PySDL3 version has type issues with SDL_GetMouseState
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
        import json
        
        with open(file_path, 'r') as f:
            data = json.load(f)
            
        logger.info(f"Loading table from JSON file: {file_path}")
        table = context.create_table_from_json(data)
        
        if table:
            context.list_of_tables.append(table)
            context.current_table = table
            logger.info("Table loaded from dropped JSON file")
            return True
            
    except Exception as e:
        logger.error(f"Error loading table from JSON file {file_path}: {e}")
        
    return False