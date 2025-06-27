# Layout Manager for TTRPG System
# Handles the 70%-25%-5% window layout

import ctypes
import sdl3
from logger import setup_logger

logger = setup_logger(__name__)

# Layout configuration
TABLE_AREA_PERCENT = 0.70  # 70% for SDL tables
GUI_AREA_PERCENT = 0.25    # 25% for GUI
SPACING_PERCENT = 0.05     # 5% for spacing
MARGIN_SIZE: int = 20
spacing_width: int = 20
gui_width: int = 200

class LayoutManager:
    """Manages window layout with fixed areas for table, GUI, and spacing"""
    
    def __init__(self):
        self.table_area = (0, 0, 0, 0)  # x, y, width, height
        self.gui_area = (0, 0, 0, 0)
        self.spacing_area = (0, 0, 0, 0)
        self.window_width = 0
        self.window_height = 0
    
    def update_layout(self, window):
        """Update layout calculations based on current window size"""
        window_width = ctypes.c_int()
        window_height = ctypes.c_int()
        sdl3.SDL_GetWindowSize(window, ctypes.byref(window_width), ctypes.byref(window_height))
        
        self.window_width = window_width.value
        self.window_height = window_height.value
        
        # Calculate areas
    # Calculate centered table layout
        table_width = int(self.window_width* TABLE_AREA_PERCENT)
        table_height = int(self.window_height * TABLE_AREA_PERCENT)

        # Center the table
        table_x = (self.window_width - table_width) // 2
        table_y = (self.window_height - table_height) // 2

        # Calculate GUI panel areas
        left_panel_width = table_x - MARGIN_SIZE
        right_panel_width = self.window_width - (table_x + table_width + MARGIN_SIZE)
        top_panel_height = table_y - MARGIN_SIZE
        bottom_panel_height = self.window_height - (table_y + table_height + MARGIN_SIZE)

        # Define areas
        self.table_area = (table_x, table_y, table_width, table_height)
        self.spacing_area = (table_width, 0, spacing_width, self.window_height)
        self.gui_area = (table_width + spacing_width, 0, gui_width, self.window_height)
        
        logger.debug(f"Layout updated - Table: {self.table_area}, GUI: {self.gui_area}, Spacing: {self.spacing_area}")
    
    def render_background_areas(self, renderer):
        """Render background colors for different areas"""
        try:
            # Table area background (dark gray)
            table_rect = self._create_rect(*self.table_area)
            sdl3.SDL_SetRenderDrawColor(renderer, 32, 32, 32, 255)  # Dark gray
            sdl3.SDL_RenderFillRect(renderer, ctypes.byref(table_rect))
            
            # Spacing area background (darker gray)
            spacing_rect = self._create_rect(*self.spacing_area)
            sdl3.SDL_SetRenderDrawColor(renderer, 16, 16, 16, 255)  # Darker gray
            sdl3.SDL_RenderFillRect(renderer, ctypes.byref(spacing_rect))
            
        except Exception as e:
            logger.error(f"Error rendering background areas: {e}")
    
    def set_table_clipping(self, renderer):
        """Set clipping rectangle to table area"""
        try:
            table_rect = self._create_rect(*self.table_area)
            sdl3.SDL_SetRenderClipRect(renderer, ctypes.byref(table_rect))
        except Exception as e:
            logger.error(f"Error setting table clipping: {e}")
    
    def clear_clipping(self, renderer):
        """Clear clipping rectangle"""
        try:
            sdl3.SDL_SetRenderClipRect(renderer, None)
        except Exception as e:
            logger.error(f"Error clearing clipping: {e}")
    
    def _create_rect(self, x, y, width, height):
        """Create SDL_Rect with proper type conversion"""
        return sdl3.SDL_Rect(
            ctypes.c_int(x),
            ctypes.c_int(y), 
            ctypes.c_int(width),
            ctypes.c_int(height)
        )
    
    def is_point_in_table_area(self, x, y):
        """Check if a point is within the table area"""
        tx, ty, tw, th = self.table_area
        return tx <= x < tx + tw and ty <= y < ty + th
    
    def is_point_in_gui_area(self, x, y):
        """Check if a point is within the GUI area"""
        gx, gy, gw, gh = self.gui_area
        return gx <= x < gx + gw and gy <= y < gy + gh
    
    def update_viewport(self, x: int, y: int, width: int, height: int):
        """Update the viewport area for SDL content (called by GUI system)"""
        self.table_area = (x, y, width, height)
        logger.debug(f"Viewport updated by GUI: x={x}, y={y}, width={width}, height={height}")
      
    def update_dynamic_layout(self, content_x: int, content_y: int, content_width: int, content_height: int, window_width: int, window_height: int):
        """Update layout with dynamic content area based on GUI panel sizes"""
        self.window_width = window_width
        self.window_height = window_height
        
        # Update the table area to match the content area calculated by GUI
        self.table_area = (content_x, content_y, content_width, content_height)
        
        # GUI and spacing areas are managed by ImGui, so we don't need to track them here
        # But we keep the old areas for backward compatibility
        self.gui_area = (0, 0, 0, 0)  # ImGui manages this
        self.spacing_area = (0, 0, 0, 0)  # Not used in dynamic mode
        
        logger.debug(f"Dynamic layout updated - Content viewport: ({content_x}, {content_y}, {content_width}, {content_height})")
    
    def calculate_table_area_from_panels(self, window_width: int, window_height: int, 
                                       left_width: float = 0, right_width: float = 0, 
                                       top_height: float = 0, bottom_height: float = 0, 
                                       menu_height: float = 25):
        """Calculate table area based on current panel sizes"""
        self.window_width = window_width
        self.window_height = window_height
        
        # Calculate content area (table area) by subtracting panel sizes
        content_x = int(left_width)
        content_y = int(menu_height + top_height)
        content_width = int(window_width - left_width - right_width)
        content_height = int(window_height - menu_height - top_height - bottom_height)
        
        # Ensure minimum sizes
        content_width = max(100, content_width)
        content_height = max(100, content_height)
        
        # Update the table area
        self.table_area = (content_x, content_y, content_width, content_height)
        
        logger.debug(f"Table area calculated from panels: ({content_x}, {content_y}, {content_width}, {content_height})")
        logger.debug(f"Panel sizes - Left: {left_width}, Right: {right_width}, Top: {top_height}, Bottom: {bottom_height}")
        
        return self.table_area
