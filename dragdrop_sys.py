"""
Drag and Drop System for TTRPG Application.
- Only handles drag-drop events and validation
- Delegates all file/storage/network operations to Actions
"""

import os
from typing import Optional
import sdl3
import ctypes
from core_table.actions_protocol import Position
from logger import setup_logger

logger = setup_logger(__name__)


def handle_drag_drop_event(context, event) -> bool:
    """
    Handle drag and drop events using new architecture.
    
    Args:
        context: Application context with Actions
        event: SDL drag-drop event
        
    Returns:
        bool: True if event was handled successfully
    """
    if not _validate_context(context):
        return False
        
    try:
        if event.type == sdl3.SDL_EVENT_DROP_FILE:
            file_path = _extract_file_path(event)
            return _handle_file_drop(context, file_path) if file_path else False
                
        elif event.type == sdl3.SDL_EVENT_DROP_TEXT:
            text = _extract_drop_text(event)
            return _handle_text_drop(context, text) if text else False
                
        elif event.type in (sdl3.SDL_EVENT_DROP_BEGIN, sdl3.SDL_EVENT_DROP_COMPLETE):
            logger.debug(f"Drag operation event: {event.type}")
            return True
            
    except Exception as e:
        logger.error(f"Error handling drag-drop event: {e}")
        
    return False


def _validate_context(context) -> bool:
    """Validate that context has required components."""
    if not hasattr(context, 'Actions') or not context.Actions:
        logger.error("Actions not available in context")
        return False
    return True


def _extract_file_path(event) -> Optional[str]:
    """Extract file path from drop event."""
    try:
        if hasattr(event, 'drop') and hasattr(event.drop, 'data') and event.drop.data:
            return event.drop.data.decode('utf-8')
    except Exception as e:
        logger.error(f"Error extracting file path: {e}")
    return None


def _extract_drop_text(event) -> Optional[str]:
    """Extract text from drop event."""
    try:
        if hasattr(event, 'drop') and hasattr(event.drop, 'data') and event.drop.data:
            return event.drop.data.decode('utf-8')
    except Exception as e:
        logger.error(f"Error extracting drop text: {e}")
    return None


def _handle_file_drop(context, file_path: str) -> bool:
    """
    Handle dropped file by delegating to Actions.
    
    Args:
        context: Application context
        file_path: Path to dropped file
        
    Returns:
        bool: True if handled successfully
    """
    try:
        # Validate file exists
        if not os.path.exists(file_path):
            logger.error(f"Dropped file does not exist: {file_path}")
            return False
            
        # Get required parameters
        position = _get_drop_position(context)
        current_table = getattr(context, 'current_table', None)
        logger.info(f'drag drop position: {position.x}, {position.y}')
        if not current_table:
            logger.warning("No current table available for file drop")
            return False
            
        # Delegate to Actions.load_file
        #TODO - select active layer
        result = context.Actions.load_file(
            file_path=file_path,
            position=position,
            table_id=current_table.table_id,
            layer='tokens'
        )
        
        if result.success:
            logger.info(f"Successfully processed dropped file: {os.path.basename(file_path)}")
            return True
        else:
            logger.error(f"Failed to process dropped file: {result.message}")
            return False
            
    except Exception as e:
        logger.error(f"Error handling file drop {file_path}: {e}")
        return False


def _handle_text_drop(context, text: str) -> bool:
    """
    Handle dropped text (URL or file path).
    
    Args:
        context: Application context
        text: Dropped text content
        
    Returns:
        bool: True if handled successfully
    """
    try:
        # Check if text is a local file path
        if os.path.exists(text):
            return _handle_file_drop(context, text)
            
        # Check if text is a URL
        if text.startswith(('http://', 'https://')):
            return _handle_url_drop(context, text)
            
        logger.debug(f"Dropped text not handled: {text[:50]}...")
        return False
        
    except Exception as e:
        logger.error(f"Error handling text drop: {e}")
        return False


def _handle_url_drop(context, url: str) -> bool:
    """
    Handle dropped URL by delegating to Actions.
    
    Args:
        context: Application context  
        url: Dropped URL
        
    Returns:
        bool: True if handled successfully
    """
    try:
        # Validate URL is an image
        if not _is_image_url(url):
            logger.warning(f"URL does not point to an image: {url}")
            return False
            
        # Get current table for context
        current_table = getattr(context, 'current_table', None)
        if not current_table:
            logger.warning("No current table available for URL drop")
            return False
            
        # Get drop position
        position = _get_drop_position(context)
        
        # Delegate URL download to Actions
        # This assumes Actions will have a download_from_url method
        if hasattr(context.Actions, 'download_from_url'):
            result = context.Actions.download_from_url(
                url=url,
                position=position,
                table_id=current_table.table_id,
                layer='tokens'
            )
            
            if result.success:
                logger.info(f"Successfully initiated download from URL: {url}")
                return True
            else:
                logger.error(f"Failed to download from URL: {result.message}")
                return False
        else:
            # Fallback: log that URL download would be handled
            logger.info(f"URL download would be delegated to Actions: {url}")
            return True
        
    except Exception as e:
        logger.error(f"Error handling URL drop {url}: {e}")
        return False


def _get_drop_position(context) -> Position:
    """
    Get current drop position from context, converted to table coordinates.
    
    This function:
    1. Gets screen coordinates from cursor position or SDL mouse state
    2. Converts screen coordinates to table coordinates using the table's coordinate system
    3. Falls back to table center or default position if needed
    
    Args:
        context: Application context
        
    Returns:
        Position: Drop position in table coordinates (ready for sprite placement)
    """
    try:    
        try:
            mouse_x = ctypes.c_float()
            mouse_y = ctypes.c_float()
            sdl3.SDL_GetMouseState(ctypes.byref(mouse_x), ctypes.byref(mouse_y))  # type: ignore
            screen_x = float(mouse_x.value)
            screen_y = float(mouse_y.value)
            logger.debug(f"Got cursor position from SDL: ({screen_x}, {screen_y})")
            
            # If SDL returns (0, 0), treat it as no valid position
            if screen_x == 0.0 and screen_y == 0.0:
                screen_x = None
                screen_y = None
                logger.debug("SDL returned (0, 0), treating as no position available")
        except Exception as e:
            logger.debug(f"Could not get mouse position from SDL: {e}")
            screen_x = None
            screen_y = None
        
        if screen_x is None or screen_y is None:    
            # Try to get cursor position from context if failed to get from SDL
            if hasattr(context, 'cursor_position_x') and hasattr(context, 'cursor_position_y'):
                screen_x = context.cursor_position_x
                screen_y = context.cursor_position_y
                logger.debug(f"Got cursor position from context: ({screen_x}, {screen_y})")     
                
        # Convert screen coordinates to table coordinates if we have both position and table
        current_table = getattr(context, 'current_table', None)
        if screen_x is not None and screen_y is not None and current_table:
            # Use the proper screen_to_table conversion method if available
            if hasattr(current_table, 'screen_to_table'):
                table_x, table_y = current_table.screen_to_table(screen_x, screen_y)
                logger.debug(f"Converted screen position ({screen_x}, {screen_y}) to table position ({table_x}, {table_y}) using screen_to_table")
                       
            return Position(x=table_x, y=table_y)
        elif screen_x is not None and screen_y is not None:
            # No table available, use screen coordinates as-is
            logger.debug(f"No table available, using screen coordinates ({screen_x}, {screen_y})")
            return Position(x=screen_x, y=screen_y)
            
        # Try table center if available and no cursor position
        if current_table and hasattr(current_table, 'width') and hasattr(current_table, 'height'):
            center_x = current_table.width // 2
            center_y = current_table.height // 2
            logger.debug(f"Using table center position ({center_x}, {center_y})")
            return Position(x=center_x, y=center_y)
            
    except Exception as e:
        logger.debug(f"Could not get drop position: {e}")
        
    # Default center position
    logger.debug("Using default center position (400, 300)")
    return Position(x=400, y=300)


def _is_image_url(url: str) -> bool:
    """
    Check if URL points to an image file.
    
    Args:
        url: URL to check
        
    Returns:
        bool: True if URL appears to be an image
    """
    image_extensions = {'.png', '.jpg', '.jpeg', '.gif', '.bmp', '.tiff', '.webp', '.svg'}
    return any(url.lower().endswith(ext) for ext in image_extensions)


def init_drag_drop_system() -> None:
    """Initialize drag and drop system."""
    logger.info("Drag and drop system initialized")
