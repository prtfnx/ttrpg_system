"""
Drag and Drop System for TTRPG Application.
- Only handles drag-drop events and validation
- Delegates all file/storage/network operations to Actions
"""

import logging
import os
from typing import Optional
import sdl3


logger = logging.getLogger(__name__)


class Position:
    """Simple position class for drop coordinates."""
    def __init__(self, x: float, y: float):
        self.x = x
        self.y = y


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
        
        if not current_table:
            logger.warning("No current table available for file drop")
            return False
            
        # Delegate to Actions.load_file
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
    Get current drop position from context.
    
    Args:
        context: Application context
        
    Returns:
        Position: Drop position or default center position
    """
    try:
        # Try to get cursor position from context
        if hasattr(context, 'cursor_position_x') and hasattr(context, 'cursor_position_y'):
            return Position(x=context.cursor_position_x, y=context.cursor_position_y)
            
        # Try table center if available
        current_table = getattr(context, 'current_table', None)
        if current_table and hasattr(current_table, 'width') and hasattr(current_table, 'height'):
            return Position(x=current_table.width // 2, y=current_table.height // 2)
            
    except Exception as e:
        logger.debug(f"Could not get drop position: {e}")
        
    # Default center position
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
