# Layout Manager for TTRPG System
# Handles the 70%-25%-5% window layout

import ctypes
import sdl3
import logging

logger = logging.getLogger(__name__)

# Layout configuration
TABLE_AREA_PERCENT = 0.70  # 70% for SDL tables
GUI_AREA_PERCENT = 0.25    # 25% for GUI
SPACING_PERCENT = 0.05     # 5% for spacing

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
        table_width = int(self.window_width * TABLE_AREA_PERCENT)
        spacing_width = int(self.window_width * SPACING_PERCENT)
        gui_width = int(self.window_width * GUI_AREA_PERCENT)
        
        # Define areas
        self.table_area = (0, 0, table_width, self.window_height)
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
