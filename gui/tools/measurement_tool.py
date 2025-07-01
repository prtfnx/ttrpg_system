"""
Measurement Tool for TTRPG System
Allows users to measure distances on the table using a liner tool
"""

import math
import sdl3
import ctypes
from typing import Optional, Tuple
from logger import setup_logger

logger = setup_logger(__name__)

class MeasurementTool:
    """Tool for measuring distances on the table"""
    
    def __init__(self, context):
        self.context = context
        self.active = False
        self.start_point: Optional[Tuple[float, float]] = None
        self.end_point: Optional[Tuple[float, float]] = None
        self.measuring = False
        self.saved_measurements = []  # Store saved measurement arrows
        
    def start(self):
        """Start the measurement tool"""
        self.active = True
        self.clear()
        logger.debug("Measurement tool started")
    
    def stop(self):
        """Stop the measurement tool"""
        self.active = False
        self.clear()
        logger.debug("Measurement tool stopped")
    
    def clear(self):
        """Clear current measurement"""
        self.start_point = None
        self.end_point = None
        self.measuring = False
        
    def save_current_measurement(self):
        """Save the current measurement as a permanent arrow"""
        if self.start_point and self.end_point:
            distance = self.get_distance()
            measurement_data = {
                'start': self.start_point,
                'end': self.end_point,
                'distance': distance,
                'text': self.get_measurement_text()
            }
            self.saved_measurements.append(measurement_data)
            logger.info(f"Saved measurement: {measurement_data['text']}")
            
    def clear_saved_measurements(self):
        """Clear all saved measurements"""
        self.saved_measurements.clear()
        logger.info("Cleared all saved measurements")
    
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
        self.measuring = True
        
        logger.debug(f"Measurement started at table coordinates ({table_x:.1f}, {table_y:.1f})")
        return True  # Consume the event
    
    def handle_mouse_motion(self, x: float, y: float) -> bool:
        """Handle mouse motion event"""
        if not self.active or not self.measuring:
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
        if not self.active or not self.measuring:
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
        self.measuring = False
        
        distance = self.get_distance()
        logger.info(f"Measurement completed: {distance:.1f} units")
        return True  # Consume the event
    
    def handle_key_down(self, key) -> bool:
        """Handle key press events"""
        if not self.active:
            return False
            
        # Save measurement with Enter or S key
        if key in [13, 115] and self.start_point and self.end_point:  # 13=Enter, 115=s
            self.save_current_measurement()
            return True
            
        # Clear saved measurements with C key
        if key == 99:  # 99=c
            self.clear_saved_measurements()
            return True
            
        return False
    
    def get_distance(self) -> Optional[float]:
        """Get the current measurement distance"""
        if not self.start_point or not self.end_point:
            return None
            
        dx = self.end_point[0] - self.start_point[0]
        dy = self.end_point[1] - self.start_point[1]
        return math.sqrt(dx * dx + dy * dy)
    
    def get_distance_in_feet(self, pixels_per_foot: float = 50.0) -> Optional[float]:
        """Get the distance converted to feet (assuming grid scale)"""
        distance = self.get_distance()
        if distance is None:
            return None
        return distance / pixels_per_foot
    
    def render(self, renderer):
        """Render measurement arrows and text on the table"""
        if not self.active:
            return
            
        try:
            # Render saved measurements first
            for measurement in self.saved_measurements:
                self._render_measurement_arrow(renderer, measurement['start'], measurement['end'], 
                                             measurement['text'], (100, 255, 100, 255))  # Green for saved
            
            # Render current measurement being made
            if self.start_point and self.end_point:
                text = self.get_measurement_text()
                self._render_measurement_arrow(renderer, self.start_point, self.end_point, 
                                             text, (255, 255, 0, 255))  # Yellow for current
                
        except Exception as e:
            logger.error(f"Error rendering measurement tool: {e}")
    
    def _render_measurement_arrow(self, renderer, start_point, end_point, text, color):
        """Render a single measurement arrow with text"""
        try:
            # Convert table coordinates back to screen coordinates
            if hasattr(self.context.current_table, 'table_to_screen'):
                start_screen_x, start_screen_y = self.context.current_table.table_to_screen(
                    start_point[0], start_point[1]
                )
                end_screen_x, end_screen_y = self.context.current_table.table_to_screen(
                    end_point[0], end_point[1]
                )
            else:
                # Fallback for older coordinate system
                table_scale = getattr(self.context.current_table, 'scale', 1.0)
                table_x_offset = getattr(self.context.current_table, 'x_moved', 0)
                table_y_offset = getattr(self.context.current_table, 'y_moved', 0)
                start_screen_x = start_point[0] * table_scale + table_x_offset
                start_screen_y = start_point[1] * table_scale + table_y_offset
                end_screen_x = end_point[0] * table_scale + table_x_offset
                end_screen_y = end_point[1] * table_scale + table_y_offset
            
            # Set arrow color
            sdl3.SDL_SetRenderDrawColor(renderer, 
                                       ctypes.c_ubyte(color[0]), ctypes.c_ubyte(color[1]), 
                                       ctypes.c_ubyte(color[2]), ctypes.c_ubyte(color[3]))
            
            # Draw the main arrow line
            sdl3.SDL_RenderLine(renderer,
                               ctypes.c_float(start_screen_x), ctypes.c_float(start_screen_y),
                               ctypes.c_float(end_screen_x), ctypes.c_float(end_screen_y))
            
            # Draw arrowhead
            self._draw_arrowhead(renderer, start_screen_x, start_screen_y, end_screen_x, end_screen_y)
            
            # Draw start and end point circles
            self._draw_circle(renderer, start_screen_x, start_screen_y, 3)
            self._draw_circle(renderer, end_screen_x, end_screen_y, 3)

            # Draw text above the arrow using SDL3 text rendering
            self._draw_text_above_arrow(renderer, start_screen_x, start_screen_y, end_screen_x, end_screen_y, text)
            
        except Exception as e:
            logger.error(f"Error rendering measurement arrow: {e}")
    
    def _draw_arrowhead(self, renderer, start_x, start_y, end_x, end_y):
        """Draw an arrowhead at the end of the line"""
        try:
            # Calculate arrow direction
            dx = end_x - start_x
            dy = end_y - start_y
            length = math.sqrt(dx * dx + dy * dy)
            
            if length < 1:  # Avoid division by zero
                return
                
            # Normalize direction
            dx /= length
            dy /= length
            
            # Arrow head size
            head_length = 15
            head_width = 8
            
            # Calculate arrowhead points
            # Back point along the line
            back_x = end_x - dx * head_length
            back_y = end_y - dy * head_length
            
            # Side points perpendicular to the line
            perp_x = -dy * head_width
            perp_y = dx * head_width
            
            left_x = back_x + perp_x
            left_y = back_y + perp_y
            right_x = back_x - perp_x
            right_y = back_y - perp_y
            
            # Draw arrowhead lines
            sdl3.SDL_RenderLine(renderer,
                               ctypes.c_float(end_x), ctypes.c_float(end_y),
                               ctypes.c_float(left_x), ctypes.c_float(left_y))
            sdl3.SDL_RenderLine(renderer,
                               ctypes.c_float(end_x), ctypes.c_float(end_y),
                               ctypes.c_float(right_x), ctypes.c_float(right_y))
            sdl3.SDL_RenderLine(renderer,
                               ctypes.c_float(left_x), ctypes.c_float(left_y),
                               ctypes.c_float(right_x), ctypes.c_float(right_y))
                               
        except Exception as e:
            logger.error(f"Error drawing arrowhead: {e}")
    
    def _draw_circle(self, renderer, x: float, y: float, radius: float):
        """Draw a small circle at the given position"""
        try:
            # Simple circle approximation using lines
            segments = 8
            angle_step = 2 * math.pi / segments
            
            for i in range(segments):
                angle1 = i * angle_step
                angle2 = (i + 1) * angle_step
                
                x1 = x + radius * math.cos(angle1)
                y1 = y + radius * math.sin(angle1)
                x2 = x + radius * math.cos(angle2)
                y2 = y + radius * math.sin(angle2)
                
                sdl3.SDL_RenderLine(renderer,
                                   ctypes.c_float(x1), ctypes.c_float(y1),
                                   ctypes.c_float(x2), ctypes.c_float(y2))
        except Exception as e:
            logger.error(f"Error drawing circle: {e}")
    
    def get_measurement_text(self) -> str:
        """Get formatted measurement text for display"""
        distance = self.get_distance()
        if distance is None:
            return "No measurement"
        
        distance_feet = self.get_distance_in_feet()
        return f"Distance: {distance:.1f} units ({distance_feet:.1f} ft)"
    
    def _draw_text_above_arrow(self, renderer, start_x, start_y, end_x, end_y, text):
        """Draw text above the arrow using SDL3 text rendering"""
        try:
            # Calculate text position above the midpoint of the arrow
            mid_x = (start_x + end_x) / 2
            mid_y = (start_y + end_y) / 2
            
            # Offset above the line
            offset = -30  # pixels above, increased for better visibility
            
            # Calculate perpendicular direction for text positioning
            dx = end_x - start_x
            dy = end_y - start_y
            length = math.sqrt(dx * dx + dy * dy)
            
            if length > 0:
                perp_x = -dy / length
                perp_y = dx / length
                text_x = mid_x + perp_x * offset
                text_y = mid_y + perp_y * offset
            else:
                text_x = mid_x
                text_y = mid_y + offset
            
            # Use SDL3's built-in debug text rendering function
            # SDL_RenderDebugText provides crisp, readable text perfect for measurement display
            
            # Set text color to bright white for high contrast
            sdl3.SDL_SetRenderDrawColor(renderer, 
                                       ctypes.c_ubyte(255), ctypes.c_ubyte(255), 
                                       ctypes.c_ubyte(255), ctypes.c_ubyte(255))
            
            # Render the actual text using SDL3's debug text function
            # This provides proper, crisp text rendering with built-in 8x8 pixel font
            text_bytes = text.encode('utf-8')
            sdl3.SDL_RenderDebugText(renderer, 
                                    ctypes.c_float(text_x), 
                                    ctypes.c_float(text_y), 
                                    ctypes.c_char_p(text_bytes))
            
        except Exception as e:
            logger.error(f"Error drawing text above arrow: {e}")