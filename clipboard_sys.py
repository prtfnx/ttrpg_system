import sdl3
import ctypes
import logging
import os
import json
import tempfile
import time
import uuid
from core_table.actions_protocol import Position
logger = logging.getLogger(__name__)

# Global variable to store copied sprite data
_copied_sprite_data = None

def init_clipboard_system():
    """Initialize clipboard system."""
    logger.info("Clipboard system initialized")

def handle_clipboard_paste(context):
    """Handle clipboard paste operation."""
    try:
        # First check if we have a copied sprite from within the app
        if _copied_sprite_data:
            logger.info("Pasting copied sprite from app")
            return paste_copied_sprite(context)
        
        # If no internal sprite, try external clipboard
        if not sdl3.SDL_HasClipboardText():
            logger.debug("Clipboard does not contain text")
            return False
            
        clipboard_text_ptr = sdl3.SDL_GetClipboardText()
        if not clipboard_text_ptr:
            logger.warning("Failed to get clipboard text")
            return False
            
        # Extract and clean text
        text = ctypes.string_at(clipboard_text_ptr).decode('utf-8').strip()
        logger.info(f"Clipboard text: '{text}'")
        
        # Check if it's an image file path
        if not _is_image_file(text):
            logger.debug("Clipboard text is not an image file path")
            return False
            
        if not os.path.exists(text):
            logger.warning(f"Image file does not exist: {text}")
            return False
            
        logger.info(f"Creating sprite from: {text}")
        return create_sprite_from_file(context, text)
        
    except Exception as e:
        logger.error(f"Error handling clipboard paste: {e}")
        return False

def handle_clipboard_copy(context):
    """Copy the currently selected sprite."""
    try:
        if not context or not context.current_table:
            logger.warning("No current table")
            return False
            
        selected_sprite = context.current_table.selected_sprite
        if not selected_sprite:
            logger.info("No sprite selected to copy")
            return False
            
        # Store sprite data for internal copying
        global _copied_sprite_data
        _copied_sprite_data = {
            'texture_path': selected_sprite.texture_path.decode() if hasattr(selected_sprite, 'texture_path') and isinstance(selected_sprite.texture_path, bytes) else str(selected_sprite.texture_path) if hasattr(selected_sprite, 'texture_path') else None,
            'scale_x': selected_sprite.scale_x,
            'scale_y': selected_sprite.scale_y,
            'layer': getattr(selected_sprite, 'layer', 'tokens'),  # Ensure layer is preserved
            'character': getattr(selected_sprite, 'character', None),
            'moving': getattr(selected_sprite, 'moving', False),
            'speed': getattr(selected_sprite, 'speed', None),
            'collidable': getattr(selected_sprite, 'collidable', False),
            'coord_x': selected_sprite.coord_x.value if hasattr(selected_sprite, 'coord_x') else 0,
            'coord_y': selected_sprite.coord_y.value if hasattr(selected_sprite, 'coord_y') else 0,
        }
        logger.info(f"Copied sprite: {_copied_sprite_data} from sprite: {selected_sprite} at layer {selected_sprite.layer}")
        logger.info(f"Copied sprite: {_copied_sprite_data['texture_path']} from layer: {_copied_sprite_data['layer']}")
        
        # Also copy to system clipboard as JSON (optional) - but exclude non-serializable objects
        try:
            # Create a JSON-safe copy (exclude character object)
            json_safe_data = {k: v for k, v in _copied_sprite_data.items() if k != 'character'}
            if _copied_sprite_data['character']:
                json_safe_data['has_character'] = True
                json_safe_data['character_name'] = getattr(_copied_sprite_data['character'], 'name', 'Unknown')
            else:
                json_safe_data['has_character'] = False
                
            sprite_json = json.dumps(json_safe_data, indent=2)
            sprite_json_bytes = sprite_json.encode('utf-8')
            
            # Create a C string for SDL
            clipboard_text = ctypes.create_string_buffer(sprite_json_bytes)
            sdl3.SDL_SetClipboardText(clipboard_text)
            logger.debug("Sprite data also copied to system clipboard as JSON")
        except Exception as e:
            logger.debug(f"Failed to copy to system clipboard: {e}")
            
        return True
        
    except Exception as e:
        logger.error(f"Error copying sprite: {e}")
        return False

def paste_copied_sprite(context):
    """Paste a previously copied sprite."""
    try:
        global _copied_sprite_data
        if not _copied_sprite_data:
            logger.warning("No sprite data to paste")
            return False
            
        if not context or not context.current_table:
            logger.warning("No current table to paste sprite to")
            return False
        
        # Generate a unique sprite ID for the pasted sprite
        
        new_sprite_id = str(uuid.uuid4())
        
        # Calculate offset position
        offset_x = 50  # Offset so it doesn't overlap exactly
        offset_y = 50
        new_x = _copied_sprite_data['coord_x'] + offset_x
        new_y = _copied_sprite_data['coord_y'] + offset_y
          # Use Actions protocol for consistency with the rest of the system
        if hasattr(context, 'actions') and context.actions:
            
            table_id = context.current_table.table_id if hasattr(context.current_table, 'table_id') else context.current_table.name
            position = Position(new_x, new_y)
            
            logger.info(f"Attempting to paste sprite to layer: {_copied_sprite_data['layer']}")
            
            result = context.actions.create_sprite(
                table_id=table_id,
                sprite_id=new_sprite_id,
                position=position,
                image_path=_copied_sprite_data['texture_path'],
                layer=_copied_sprite_data['layer']  
            )
            
            if result.success:
                logger.info(f"Sprite created successfully via Actions on layer: {_copied_sprite_data['layer']}")
                
                # Scale the sprite to match the original
                context.actions.scale_sprite(
                    table_id=table_id,
                    sprite_id=new_sprite_id,
                    scale_x=_copied_sprite_data['scale_x'],
                    scale_y=_copied_sprite_data['scale_y']
                )
                
                # Find and select the new sprite
                new_sprite = context.find_sprite_by_id(new_sprite_id)
                if new_sprite:
                    context.current_table.selected_sprite = new_sprite
                    logger.info(f"New sprite layer confirmed: {getattr(new_sprite, 'layer', 'UNKNOWN')}")
                
                logger.info(f"Successfully pasted sprite at ({new_x}, {new_y}) on layer {_copied_sprite_data['layer']}")
                return True
            else:
                logger.error(f"Failed to paste sprite using Actions: {result.message}")
                # Fall back to old method
          # Fallback to old context.add_sprite method    
        

        
        # Verify the layer was set correctly
        actual_layer = getattr(new_sprite, 'layer', 'UNKNOWN')
        logger.info(f"Sprite created with layer: {actual_layer} (expected: {_copied_sprite_data['layer']})")
        
        # Select the new sprite
        context.current_table.selected_sprite = new_sprite
        logger.info(f"Successfully pasted sprite at ({new_x}, {new_y}) on layer {_copied_sprite_data['layer']}")
        return True
        
    except Exception as e:
        logger.error(f"Error pasting sprite: {e}")
        return False

def create_sprite_from_file(context, file_path):
    """Create a sprite from a file path and position it at screen center."""
    try:
        if not context or not context.current_table:
            logger.warning("No current table to add sprite to")
            return False
            
        # Create sprite
        new_sprite = context.add_sprite(
            texture_path=file_path.encode(),
            scale_x=1.0,
            scale_y=1.0,
            layer='tokens'
        )
        
        if not new_sprite:
            logger.error("Failed to create sprite")
            return False
            
        # Position sprite at center of screen
        _center_sprite_on_screen(context, new_sprite)
        
        # Select the new sprite
        context.current_table.selected_sprite = new_sprite
        logger.info(f"Successfully created sprite from: {file_path}")
        return True
        
    except Exception as e:
        logger.error(f"Error creating sprite from file {file_path}: {e}")
        return False

def clear_copied_sprite():
    """Clear the copied sprite data."""
    global _copied_sprite_data
    _copied_sprite_data = None
    logger.debug("Cleared copied sprite data")

def has_copied_sprite():
    """Check if there's a sprite copied and ready to paste."""
    return _copied_sprite_data is not None

def _is_image_file(filename):
    """Check if filename has a supported image extension."""
    if not filename:
        return False
    return filename.lower().endswith(('.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp'))

def _center_sprite_on_screen(context, sprite):
    """Position sprite at the center of the screen."""
    if not context.window:
        return
        
    window_width = ctypes.c_int()
    window_height = ctypes.c_int()
    sdl3.SDL_GetWindowSize(context.window, ctypes.byref(window_width), ctypes.byref(window_height))
    
    center_x = window_width.value // 2
    center_y = window_height.value // 2
    sprite.set_position(center_x, center_y)