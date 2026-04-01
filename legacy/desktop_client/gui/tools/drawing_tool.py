"""
Drawing Tool for TTRPG System
Allows users to draw shapes on the table for annotation and communication
"""

import math
import sdl3
import ctypes
from typing import Optional, Tuple, List, Dict, Any
from logger import setup_logger

logger = setup_logger(__name__)

class DrawingTool:
    """Tool for drawing shapes on the table"""
    
    def __init__(self, context):
        self.context = context
        self.active = False
        self.drawing = False
        self.start_point: Optional[Tuple[float, float]] = None
        self.end_point: Optional[Tuple[float, float]] = None
        self.current_shape = "line"  # line, rectangle, circle
        self.current_color = [1.0, 0.0, 0.0]  # RGB as floats (red default)
        self.current_thickness = 2
        self.saved_drawings = []  # Store saved drawings
        
        # Available shapes and colors
        self.available_shapes = ["line", "rectangle", "circle"]
        self.available_colors = {
            "Red": [1.0, 0.0, 0.0],
            "Green": [0.0, 1.0, 0.0],
            "Blue": [0.0, 0.0, 1.0],
            "Yellow": [1.0, 1.0, 0.0],
            "Purple": [1.0, 0.0, 1.0],
            "Cyan": [0.0, 1.0, 1.0],
            "White": [1.0, 1.0, 1.0],
            "Black": [0.0, 0.0, 0.0]
        }
        
    def start(self):
        """Start the drawing tool"""
        self.active = True
        self.clear_current()
        logger.debug("Drawing tool started")
    
    def stop(self):
        """Stop the drawing tool"""
        self.active = False
        self.clear_current()
        logger.debug("Drawing tool stopped")
    
    def clear_current(self):
        """Clear current drawing in progress"""
        self.start_point = None
        self.end_point = None
        self.drawing = False
        
    def set_shape(self, shape: str):
        """Set the current drawing shape"""
        if shape in self.available_shapes:
            self.current_shape = shape
            logger.debug(f"Drawing shape set to: {shape}")
        
    def set_color(self, color: List[float]):
        """Set the current drawing color"""
        if len(color) >= 3:
            self.current_color = color[:3]  # Take first 3 components (RGB)
            logger.debug(f"Drawing color set to: {self.current_color}")
            
    def set_color_by_name(self, color_name: str):
        """Set color by name"""
        if color_name in self.available_colors:
            self.current_color = self.available_colors[color_name]
            logger.debug(f"Drawing color set to: {color_name}")
        
    def set_thickness(self, thickness: int):
        """Set the current drawing thickness"""
        self.current_thickness = max(1, min(thickness, 20))  # Clamp between 1-20
        logger.debug(f"Drawing thickness set to: {self.current_thickness}")
        
    def save_current_drawing(self):
        """Save the current drawing as permanent"""
        if self.start_point and self.end_point:
            drawing_data = {
                'shape': self.current_shape,
                'start': self.start_point,
                'end': self.end_point,
                'color': self.current_color.copy(),
                'thickness': self.current_thickness
            }
            self.saved_drawings.append(drawing_data)
            logger.info(f"Saved drawing: {self.current_shape} in {self._get_color_name()}")
            
    def clear_saved_drawings(self):
        """Clear all saved drawings"""
        self.saved_drawings.clear()
        logger.info("Cleared all saved drawings")
    
    def _get_color_name(self) -> str:
        """Get color name for current color"""
        for name, color in self.available_colors.items():
            if color == self.current_color:
                return name
        return f"RGB({self.current_color[0]:.1f}, {self.current_color[1]:.1f}, {self.current_color[2]:.1f})"
    
    def handle_mouse_down(self, x: float, y: float) -> bool:
        """Handle mouse button down event"""
        if not self.active:
            return False
            
        # Convert screen coordinates to table coordinates
        if hasattr(self.context.current_table, 'screen_to_table'):
            table_x, table_y = self.context.current_table.screen_to_table(x, y)
        else:
            # Fallback for older coordinate system
            table_scale = getattr(self.context.current_table, 'scale', 1.0)
            table_x_offset = getattr(self.context.current_table, 'x_moved', 0)
            table_y_offset = getattr(self.context.current_table, 'y_moved', 0)
            table_x = (x - table_x_offset) / table_scale
            table_y = (y - table_y_offset) / table_scale
        
        self.start_point = (table_x, table_y)
        self.end_point = (table_x, table_y)  # Start with same point
        self.drawing = True
        
        logger.debug(f"Drawing started at table coordinates ({table_x:.1f}, {table_y:.1f})")
        return True  # Consume the event
    
    def handle_mouse_motion(self, x: float, y: float) -> bool:
        """Handle mouse motion event"""
        if not self.active or not self.drawing:
            return False
            
        # Convert screen coordinates to table coordinates
        if hasattr(self.context.current_table, 'screen_to_table'):
            table_x, table_y = self.context.current_table.screen_to_table(x, y)
        else:
            # Fallback for older coordinate system
            table_scale = getattr(self.context.current_table, 'scale', 1.0)
            table_x_offset = getattr(self.context.current_table, 'x_moved', 0)
            table_y_offset = getattr(self.context.current_table, 'y_moved', 0)
            table_x = (x - table_x_offset) / table_scale
            table_y = (y - table_y_offset) / table_scale
        
        self.end_point = (table_x, table_y)
        return True  # Consume the event
    
    def handle_mouse_up(self, x: float, y: float) -> bool:
        """Handle mouse button up event"""
        if not self.active or not self.drawing:
            return False
            
        # Convert screen coordinates to table coordinates
        if hasattr(self.context.current_table, 'screen_to_table'):
            table_x, table_y = self.context.current_table.screen_to_table(x, y)
        else:
            # Fallback for older coordinate system
            table_scale = getattr(self.context.current_table, 'scale', 1.0)
            table_x_offset = getattr(self.context.current_table, 'x_moved', 0)
            table_y_offset = getattr(self.context.current_table, 'y_moved', 0)
            table_x = (x - table_x_offset) / table_scale
            table_y = (y - table_y_offset) / table_scale
        
        self.end_point = (table_x, table_y)
        self.drawing = False
        
        logger.info(f"Drawing completed: {self.current_shape} in {self._get_color_name()}")
        return True  # Consume the event
    
    def handle_key_down(self, key) -> bool:
        """Handle key press events"""
        if not self.active:
            return False
            
        # Save drawing with Enter or S key
        if key in [13, 115] and self.start_point and self.end_point:  # 13=Enter, 115=s
            self.save_current_drawing()
            return True
            
        # Clear saved drawings with C key
        if key == 99:  # 99=c
            self.clear_saved_drawings()
            return True
            
        return False
    
    def render(self, renderer):
        """Render drawing overlays on the table"""
        if not self.active:
            return
            
        try:
            # Render saved drawings first
            for drawing in self.saved_drawings:
                self._render_drawing(renderer, drawing, (128, 255, 128, 255))  # Semi-transparent green for saved
            
            # Render current drawing being made
            if self.start_point and self.end_point:
                current_drawing = {
                    'shape': self.current_shape,
                    'start': self.start_point,
                    'end': self.end_point,
                    'color': self.current_color,
                    'thickness': self.current_thickness
                }
                self._render_drawing(renderer, current_drawing, (255, 255, 255, 255))  # White for current
                
        except Exception as e:
            logger.error(f"Error rendering drawing tool: {e}")
    
    def _render_drawing(self, renderer, drawing: Dict[str, Any], override_color: Optional[Tuple[int, int, int, int]] = None):
        """Render a single drawing"""
        try:
            # Convert table coordinates back to screen coordinates
            if hasattr(self.context.current_table, 'table_to_screen'):
                start_screen_x, start_screen_y = self.context.current_table.table_to_screen(
                    drawing['start'][0], drawing['start'][1]
                )
                end_screen_x, end_screen_y = self.context.current_table.table_to_screen(
                    drawing['end'][0], drawing['end'][1]
                )
            else:
                # Fallback for older coordinate system
                table_scale = getattr(self.context.current_table, 'scale', 1.0)
                table_x_offset = getattr(self.context.current_table, 'x_moved', 0)
                table_y_offset = getattr(self.context.current_table, 'y_moved', 0)
                start_screen_x = drawing['start'][0] * table_scale + table_x_offset
                start_screen_y = drawing['start'][1] * table_scale + table_y_offset
                end_screen_x = drawing['end'][0] * table_scale + table_x_offset
                end_screen_y = drawing['end'][1] * table_scale + table_y_offset
            
            # Use override color if provided, otherwise use drawing color
            if override_color:
                color = override_color
            else:
                color = tuple(int(c * 255) for c in drawing['color']) + (255,)  # Convert float to int and add alpha
            
            # Set drawing color
            sdl3.SDL_SetRenderDrawColor(renderer, 
                                       ctypes.c_ubyte(color[0]), ctypes.c_ubyte(color[1]), 
                                       ctypes.c_ubyte(color[2]), ctypes.c_ubyte(color[3]))
            
            # Render based on shape
            if drawing['shape'] == 'line':
                self._render_line(renderer, start_screen_x, start_screen_y, end_screen_x, end_screen_y, drawing['thickness'])
            elif drawing['shape'] == 'rectangle':
                self._render_rectangle(renderer, start_screen_x, start_screen_y, end_screen_x, end_screen_y, drawing['thickness'])
            elif drawing['shape'] == 'circle':
                self._render_circle(renderer, start_screen_x, start_screen_y, end_screen_x, end_screen_y, drawing['thickness'])
            
        except Exception as e:
            logger.error(f"Error rendering drawing: {e}")
    
    def _render_line(self, renderer, start_x: float, start_y: float, end_x: float, end_y: float, thickness: int):
        """Render a line with thickness"""
        try:
            if thickness == 1:
                # Simple line for thickness 1
                sdl3.SDL_RenderLine(renderer,
                                   ctypes.c_float(start_x), ctypes.c_float(start_y),
                                   ctypes.c_float(end_x), ctypes.c_float(end_y))
            else:
                # Thick line by drawing multiple parallel lines
                for i in range(thickness):
                    offset = i - thickness // 2
                    # Calculate perpendicular offset
                    dx = end_x - start_x
                    dy = end_y - start_y
                    length = math.sqrt(dx * dx + dy * dy)
                    
                    if length > 0:
                        perp_x = -dy / length * offset
                        perp_y = dx / length * offset
                        
                        sdl3.SDL_RenderLine(renderer,
                                           ctypes.c_float(start_x + perp_x), ctypes.c_float(start_y + perp_y),
                                           ctypes.c_float(end_x + perp_x), ctypes.c_float(end_y + perp_y))
                    else:
                        # Zero-length line, just draw a point
                        sdl3.SDL_RenderPoint(renderer, ctypes.c_float(start_x), ctypes.c_float(start_y))
                        break
                        
        except Exception as e:
            logger.error(f"Error rendering line: {e}")
    
    def _render_rectangle(self, renderer, start_x: float, start_y: float, end_x: float, end_y: float, thickness: int):
        """Render a rectangle outline"""
        try:
            # Calculate rectangle bounds
            left = min(start_x, end_x)
            right = max(start_x, end_x)
            top = min(start_y, end_y)
            bottom = max(start_y, end_y)
            
            # Draw rectangle outline with thickness
            for i in range(thickness):
                # Expand rectangle for thickness
                offset = i
                rect_left = left - offset
                rect_right = right + offset
                rect_top = top - offset
                rect_bottom = bottom + offset
                
                # Draw four sides
                # Top
                sdl3.SDL_RenderLine(renderer,
                                   ctypes.c_float(rect_left), ctypes.c_float(rect_top),
                                   ctypes.c_float(rect_right), ctypes.c_float(rect_top))
                # Bottom
                sdl3.SDL_RenderLine(renderer,
                                   ctypes.c_float(rect_left), ctypes.c_float(rect_bottom),
                                   ctypes.c_float(rect_right), ctypes.c_float(rect_bottom))
                # Left
                sdl3.SDL_RenderLine(renderer,
                                   ctypes.c_float(rect_left), ctypes.c_float(rect_top),
                                   ctypes.c_float(rect_left), ctypes.c_float(rect_bottom))
                # Right
                sdl3.SDL_RenderLine(renderer,
                                   ctypes.c_float(rect_right), ctypes.c_float(rect_top),
                                   ctypes.c_float(rect_right), ctypes.c_float(rect_bottom))
                
        except Exception as e:
            logger.error(f"Error rendering rectangle: {e}")
    
    def _render_circle(self, renderer, start_x: float, start_y: float, end_x: float, end_y: float, thickness: int):
        """Render a circle outline"""
        try:
            # Calculate center and radius
            center_x = start_x
            center_y = start_y
            radius = math.sqrt((end_x - start_x) ** 2 + (end_y - start_y) ** 2)
            
            if radius < 1:
                # Too small, just draw a point
                sdl3.SDL_RenderPoint(renderer, ctypes.c_float(center_x), ctypes.c_float(center_y))
                return
            
            # Draw circle with thickness
            for t in range(thickness):
                current_radius = radius + t - thickness // 2
                if current_radius <= 0:
                    continue
                    
                # Draw circle using line segments
                segments = max(8, int(current_radius * 2))  # More segments for larger circles
                angle_step = 2 * math.pi / segments
                
                for i in range(segments):
                    angle1 = i * angle_step
                    angle2 = (i + 1) * angle_step
                    
                    x1 = center_x + current_radius * math.cos(angle1)
                    y1 = center_y + current_radius * math.sin(angle1)
                    x2 = center_x + current_radius * math.cos(angle2)
                    y2 = center_y + current_radius * math.sin(angle2)
                    
                    sdl3.SDL_RenderLine(renderer,
                                       ctypes.c_float(x1), ctypes.c_float(y1),
                                       ctypes.c_float(x2), ctypes.c_float(y2))
                        
        except Exception as e:
            logger.error(f"Error rendering circle: {e}")
