import sdl3
import ctypes
from logger import setup_logger
import os
import time
from typing import List, Tuple

logger = setup_logger(__name__)

class DrawPoint:
    """Represents a single point in a drawing stroke."""
    def __init__(self, x: float, y: float, pressure: float = 1.0):
        self.x = x
        self.y = y
        self.pressure = pressure

class DrawStroke:
    """Represents a stroke (line) made up of multiple points."""
    def __init__(self, color: Tuple[int, int, int, int] = (255, 255, 255, 255), width: int = 2):
        self.points: List[DrawPoint] = []
        self.color = color  # RGBA
        self.width = width

    def add_point(self, x: float, y: float, pressure: float = 1.0):
        """Add a point to this stroke."""
        self.points.append(DrawPoint(x, y, pressure))

class PaintCanvas:
    """Handles drawing operations and stroke management."""
    def __init__(self, width: int, height: int):
        self.width = width
        self.height = height
        self.strokes: List[DrawStroke] = []
        self.current_stroke: DrawStroke = None
        self.is_drawing = False
        self.current_color = (255, 255, 255, 255)  # White
        self.current_width = 2
        self.canvas_surface = None
        self.canvas_texture = None

    def start_stroke(self, x: float, y: float, color: Tuple[int, int, int, int] = None, width: int = None):
        """Start a new drawing stroke."""
        if color is None:
            color = self.current_color
        if width is None:
            width = self.current_width
        
        self.current_stroke = DrawStroke(color, width)
        self.current_stroke.add_point(x, y)
        self.is_drawing = True
        logger.debug(f"Started stroke at ({x}, {y})")

    def add_point_to_stroke(self, x: float, y: float):
        """Add a point to the current stroke."""
        if self.is_drawing and self.current_stroke:
            self.current_stroke.add_point(x, y)
            logger.debug(f"Added point to stroke: ({x}, {y})")

    def end_stroke(self):
        """End the current stroke and add it to the canvas."""
        if self.is_drawing and self.current_stroke:
            if len(self.current_stroke.points) > 1:  # Only save strokes with multiple points
                self.strokes.append(self.current_stroke)
                logger.info(f"Completed stroke with {len(self.current_stroke.points)} points")
            self.current_stroke = None
            self.is_drawing = False
            
    def clear_canvas(self):
        """Clear all strokes from the canvas."""
        self.strokes.clear()
        logger.info("Canvas cleared")

    def set_drawing_color(self, r: int, g: int, b: int, a: int = 255):
        """Set the current drawing color."""
        self.current_color = (r, g, b, a)

    def set_drawing_width(self, width: int):
        """Set the current drawing width."""
        self.current_width = max(1, width)

class PaintSystem:
    """Main paint system that integrates with the SDL context."""
    def __init__(self, context):
        self.context = context
        self.canvas = None
        self.paint_mode = False
        self.paint_surface = None
        self.paint_texture = None
        self.temp_canvas_surface = None
        self.temp_canvas_texture = None

    def enter_paint_mode(self, width: int = None, height: int = None):
        """Enter paint mode and create a new canvas."""
        window_width = ctypes.c_int()
        window_height = ctypes.c_int()
        sdl3.SDL_GetWindowSize(self.context.window, ctypes.byref(window_width), ctypes.byref(window_height))
        if width is None:
            width = window_width.value
        if height is None:
            height = window_height.value

        self.canvas = PaintCanvas(width, height)
        self.paint_mode = True
        
        # Create a surface for drawing
        self.paint_surface = sdl3.SDL_CreateSurface(width, height, sdl3.SDL_PIXELFORMAT_RGBA8888)
        if not self.paint_surface:
            logger.error(f"Failed to create paint surface: {sdl3.SDL_GetError().decode()}")
            return False
        
        # Fill with transparent background
        sdl3.SDL_FillSurfaceRect(self.paint_surface, None, sdl3.SDL_MapSurfaceRGBA(self.paint_surface, 0, 0, 0, 0))
        
        self.paint_texture = sdl3.SDL_CreateTextureFromSurface(self.context.renderer, self.paint_surface)
        if not self.paint_texture:
            logger.error(f"Failed to create paint texture: {sdl3.SDL_GetError().decode()}")
            return False
        
        logger.info(f"Entered paint mode with canvas size {width}x{height}")
        return True

    def exit_paint_mode(self):
        """Exit paint mode and clean up resources."""
        if self.paint_surface:
            sdl3.SDL_DestroySurface(self.paint_surface)
            self.paint_surface = None
        if self.paint_texture:
            sdl3.SDL_DestroyTexture(self.paint_texture)
            self.paint_texture = None
        if self.temp_canvas_surface:
            sdl3.SDL_DestroySurface(self.temp_canvas_surface)
            self.temp_canvas_surface = None
        if self.temp_canvas_texture:
            sdl3.SDL_DestroyTexture(self.temp_canvas_texture)
            self.temp_canvas_texture = None
        
        self.paint_mode = False
        self.canvas = None
        logger.info("Exited paint mode")

    def handle_paint_event(self, event) -> bool:
        """Handle painting events. Returns True if event was handled."""
        if not self.paint_mode or not self.canvas:
            return False

        if event.type == sdl3.SDL_EVENT_MOUSE_BUTTON_DOWN:
            if event.button.button == 1:  # Left mouse button
                self.canvas.start_stroke(event.button.x, event.button.y)
                return True
        elif event.type == sdl3.SDL_EVENT_MOUSE_MOTION:
            if self.canvas.is_drawing:
                self.canvas.add_point_to_stroke(event.motion.x, event.motion.y)
                return True
        elif event.type == sdl3.SDL_EVENT_MOUSE_BUTTON_UP:
            if event.button.button == 1:  # Left mouse button
                self.canvas.end_stroke()
                self.update_paint_texture()
                return True
        elif event.type == sdl3.SDL_EVENT_KEY_DOWN:
            if event.key.scancode == sdl3.SDL_SCANCODE_ESCAPE:
                self.exit_paint_mode()
                return True
            elif event.key.scancode == sdl3.SDL_SCANCODE_RETURN:
                self.complete_drawing()
                return True
            elif event.key.scancode == sdl3.SDL_SCANCODE_C:
                self.canvas.clear_canvas()
                self.clear_paint_surface()
                return True
            elif event.key.scancode == sdl3.SDL_SCANCODE_TAB:  # Cycle paint colors when in paint mode
                self.cycle_paint_colors()
            elif sdl3.SDL_SCANCODE_EQUALS:  # Increase brush width
                self.adjust_paint_width(1)
            elif event.key.scancode == sdl3.SDL_SCANCODE_MINUS:  # Decrease brush width
                self.adjust_paint_width(-1)
        
        return False

    def update_paint_texture(self):
        """Update the paint texture with current strokes."""
        if not self.paint_surface:
            return

        # Clear the surface
        sdl3.SDL_FillSurfaceRect(self.paint_surface, None, sdl3.SDL_MapSurfaceRGBA(self.paint_surface, 0, 0, 0, 0))

        # Draw all strokes to the surface
        for stroke in self.canvas.strokes:
            self.draw_stroke_to_surface(stroke)
        
        # Draw current stroke if drawing
        if self.canvas.current_stroke and len(self.canvas.current_stroke.points) > 1:
            self.draw_stroke_to_surface(self.canvas.current_stroke)

        # Update texture
        if self.paint_texture:
            sdl3.SDL_DestroyTexture(self.paint_texture)
        self.paint_texture = sdl3.SDL_CreateTextureFromSurface(self.context.renderer, self.paint_surface)

    def draw_stroke_to_surface(self, stroke: DrawStroke):
        """Draw a stroke to the paint surface."""
        if len(stroke.points) < 2:
            return

        # For now, we'll draw lines between consecutive points
        # In a more advanced implementation, you could use Bezier curves or other smoothing
        for i in range(len(stroke.points) - 1):
            p1 = stroke.points[i]
            p2 = stroke.points[i + 1]
            
            # Draw a thick line by drawing multiple parallel lines
            for thickness_offset in range(-stroke.width // 2, stroke.width // 2 + 1):
                self.draw_line_on_surface(
                    int(p1.x), int(p1.y + thickness_offset),
                    int(p2.x), int(p2.y + thickness_offset),
                    stroke.color
                )

    def draw_line_on_surface(self, x1: int, y1: int, x2: int, y2: int, color: Tuple[int, int, int, int]):
        """Draw a line on the paint surface using Bresenham's algorithm."""
        if not self.paint_surface:
            return

        # Simple line drawing  
        
        dx = abs(x2 - x1)
        dy = abs(y2 - y1)
        sx = 1 if x1 < x2 else -1
        sy = 1 if y1 < y2 else -1
        err = dx - dy

        x, y = x1, y1
        pixel_color = sdl3.SDL_MapSurfaceRGBA(self.paint_surface, *color)

        while True:
            # Set pixel at (x, y)
            if 0 <= x < self.canvas.width and 0 <= y < self.canvas.height:
                # This is a simplified pixel setting - you'd need proper surface manipulation
                rect = sdl3.SDL_Rect(x, y, 1, 1)
                sdl3.SDL_FillSurfaceRect(self.paint_surface, rect, pixel_color)

            if x == x2 and y == y2:
                break

            e2 = 2 * err
            if e2 > -dy:
                err -= dy
                x += sx
            if e2 < dx:
                err += dx
                y += sy

    def clear_paint_surface(self):
        """Clear the paint surface."""
        if self.paint_surface:
            sdl3.SDL_FillSurfaceRect(self.paint_surface, None, sdl3.SDL_MapSurfaceRGBA(self.paint_surface, 0, 0, 0, 0))
            if self.paint_texture:
                sdl3.SDL_DestroyTexture(self.paint_texture)
            self.paint_texture = sdl3.SDL_CreateTextureFromSurface(self.context.renderer, self.paint_surface)

    def render_paint_canvas(self):
        """Render the paint canvas to the screen as an overlay."""
        if not self.paint_mode or not self.paint_texture:
            return

        # Set blend mode for transparency
        sdl3.SDL_SetTextureBlendMode(self.paint_texture, sdl3.SDL_BLENDMODE_BLEND)
        
        # Render the paint texture as overlay
        window_width = ctypes.c_int()
        window_height = ctypes.c_int()
        sdl3.SDL_GetWindowSize(self.context.window, ctypes.byref(window_width), ctypes.byref(window_height))
        
        dest_rect = sdl3.SDL_FRect()
        dest_rect.x = 0
        dest_rect.y = 0
        dest_rect.w = window_width.value
        dest_rect.h = window_height.value

        # Render paint canvas with transparency
        sdl3.SDL_SetTextureAlphaMod(self.paint_texture, 200)  # Semi-transparent
        sdl3.SDL_RenderTexture(self.context.renderer, self.paint_texture, None, ctypes.byref(dest_rect))

        # Draw current stroke being drawn
        if self.canvas.is_drawing and self.canvas.current_stroke and len(self.canvas.current_stroke.points) > 1:
            self.draw_current_stroke_direct()

        # Draw UI overlay
        self.draw_paint_ui()

    def draw_current_stroke_direct(self):
        """Draw the current stroke directly to the renderer for immediate feedback."""
        if not self.canvas.current_stroke or len(self.canvas.current_stroke.points) < 2:
            return
        
        stroke = self.canvas.current_stroke
        sdl3.SDL_SetRenderDrawColor(self.context.renderer, *stroke.color)
        
        # Draw lines between consecutive points
        for i in range(len(stroke.points) - 1):
            p1 = stroke.points[i]
            p2 = stroke.points[i + 1]
            
            # Draw thick line by drawing multiple parallel lines
            for thickness_offset in range(-stroke.width // 2, stroke.width // 2 + 1):
                sdl3.SDL_RenderLine(
                    self.context.renderer,
                    int(p1.x), int(p1.y + thickness_offset),
                    int(p2.x), int(p2.y + thickness_offset)
                )
            
    def create_sprite_from_drawing(self, filename: str,start_point: sdl3.SDL_Point):
        """Create a sprite from the saved drawing and add it to the current table."""
        if not self.context.current_table:
            logger.warning("No current table to add sprite to")
            return

        try:
            # Create sprite using the context's add_sprite method
            new_sprite = self.context.add_sprite(
                texture_path=filename.encode(),
                scale_x=1.0,
                scale_y=1.0,
                layer='tokens'
            )
            
            if new_sprite:
                # # Set the sprite's position to the center of the window
                # window_width = ctypes.c_int()
                # window_height = ctypes.c_int()
                # sdl3.SDL_GetWindowSize(self.context.window, ctypes.byref(window_width), ctypes.byref(window_height))

                # new_sprite.set_position(
                #     window_width.value // 2 - new_sprite.frect.w // 2,
                #     window_height.value // 2 - new_sprite.frect.h // 2
                # )
                
                # Set the sprite's position to the start point
                new_sprite.set_position(start_point.x, start_point.y)
                # Set as selected sprite
                self.context.current_table.selected_sprite = new_sprite
                
                logger.info(f"Created and added sprite from drawing: {filename}")
                return new_sprite
            else:
                logger.error("Failed to create sprite from drawing")
                
        except Exception as e:
            logger.error(f"Error creating sprite from drawing: {e}")
            
        return None

    def complete_drawing(self):
        """Complete the drawing and convert it to a sprite."""
        if not self.canvas or len(self.canvas.strokes) == 0:
            logger.warning("No drawing to complete")
            return

        logger.info("Completing drawing with %d strokes", len(self.canvas.strokes))

        # Calculate bounding box of all strokes
        min_x = min_y = float('inf')
        max_x = max_y = float('-inf')

        for stroke in self.canvas.strokes:
            for point in stroke.points:
                min_x = min(min_x, point.x)
                max_x = max(max_x, point.x)
                min_y = min(min_y, point.y)
                max_y = max(max_y, point.y)

        if min_x == float('inf'):
            logger.warning("No valid drawing bounds found")
            return

        # Add some padding
        padding = 10
        min_x = max(0, min_x - padding)
        min_y = max(0, min_y - padding)
        max_x = min(self.canvas.width, max_x + padding)
        max_y = min(self.canvas.height, max_y + padding)

        width = int(max_x - min_x)
        height = int(max_y - min_y)

        if width <= 0 or height <= 0:
            logger.warning("Invalid drawing dimensions: %dx%d", width, height)
            return

        logger.info("Drawing bounds: (%d, %d) to (%d, %d), size: %dx%d", 
                    int(min_x), int(min_y), int(max_x), int(max_y), width, height)

        # Create a new surface for the cropped drawing
        drawing_surface = sdl3.SDL_CreateSurface(width, height, sdl3.SDL_PIXELFORMAT_RGBA8888)
        if not drawing_surface:
            logger.error(f"Failed to create drawing surface: {sdl3.SDL_GetError().decode()}")
            return

        # Fill with transparent background
        sdl3.SDL_FillSurfaceRect(drawing_surface, None, sdl3.SDL_MapSurfaceRGBA(drawing_surface, 0, 0, 0, 0))

        # Draw strokes to the new surface (offset by min_x, min_y)
        for stroke in self.canvas.strokes:
            self.draw_stroke_to_cropped_surface(stroke, drawing_surface, min_x, min_y)

        # Save to disk
        filename = self.save_drawing_to_disk(drawing_surface)
        
        if filename:
            # Create sprite and add to table
            sprite = self.create_sprite_from_drawing(filename, sdl3.SDL_Point(int(min_x), int(min_y)))
            if sprite:
                logger.info("Successfully created sprite from drawing")
                self.context.current_table.dict_of_sprites_list[sprite.layer].append(sprite)
            else:
                logger.error("Failed to create sprite from drawing")

        # Clean up
        
        sdl3.SDL_DestroySurface(drawing_surface)
        self.exit_paint_mode()

    def draw_stroke_to_cropped_surface(self, stroke: DrawStroke, surface, offset_x: float, offset_y: float):
        """Draw a stroke to a cropped surface with offset."""
        if len(stroke.points) < 2:
            return
        
        for i in range(len(stroke.points) - 1):
            p1 = stroke.points[i]
            p2 = stroke.points[i + 1]
            
            # Offset coordinates
            x1 = int(p1.x - offset_x)
            y1 = int(p1.y - offset_y)
            x2 = int(p2.x - offset_x)
            y2 = int(p2.y - offset_y)
            
            # Draw thick line
            for thickness_offset in range(-stroke.width // 2, stroke.width // 2 + 1):
                self.draw_line_on_cropped_surface(surface, x1, y1 + thickness_offset, x2, y2 + thickness_offset, stroke.color)

    def draw_line_on_cropped_surface(self, surface, x1: int, y1: int, x2: int, y2: int, color: Tuple[int, int, int, int]):
        """Draw a line on a surface using Bresenham's algorithm."""
        surface_width = surface.contents.w
        surface_height = surface.contents.h
        
        dx = abs(x2 - x1)
        dy = abs(y2 - y1)
        sx = 1 if x1 < x2 else -1
        sy = 1 if y1 < y2 else -1
        err = dx - dy

        x, y = x1, y1
        pixel_color = sdl3.SDL_MapSurfaceRGBA(surface, *color)

        while True:
            if 0 <= x < surface_width and 0 <= y < surface_height:
                rect = sdl3.SDL_Rect(x, y, 1, 1)
                sdl3.SDL_FillSurfaceRect(surface, rect, pixel_color)

            if x == x2 and y == y2:
                break

            e2 = 2 * err
            if e2 > -dy:
                err -= dy
                x += sx
            if e2 < dx:
                err += dx
                y += sy

    def save_drawing_to_disk(self, surface) -> str:
        """Save a surface to disk as a PNG file."""
        if not os.path.exists("resources/drawings"):
            os.makedirs("resources/drawings")

        timestamp = int(time.time())
        filename = f"resources/drawings/drawing_{timestamp}.png"
        #print(f"Saving drawing to: {filename.encode()}")
        # Save surface as PNG
        result = sdl3.IMG_SavePNG(surface, filename.encode())
        #print(f"Result: {result}")
        if result != True:
            logger.error(f"Failed to save drawing: {sdl3.SDL_GetError().decode()}")
            return None

        logger.info(f"Drawing saved to: {filename}")
        return filename

    def draw_paint_ui(self):
        """Draw paint mode UI elements. TODO: Replace with a proper UI library."""
        if not self.canvas:
            return
            
        # Draw instructions text background
        ui_bg_rect = sdl3.SDL_FRect(10, 10, 300, 80)
        sdl3.SDL_SetRenderDrawColor(self.context.renderer, 0, 0, 0, 180)  # Semi-transparent black
        sdl3.SDL_RenderFillRect(self.context.renderer, ctypes.byref(ui_bg_rect))
        
        # Draw border
        sdl3.SDL_SetRenderDrawColor(self.context.renderer, 255, 255, 255, 255)  # White border
        sdl3.SDL_RenderRect(self.context.renderer, ctypes.byref(ui_bg_rect))
        
        # Color indicator (current brush color)
        color_rect = sdl3.SDL_FRect(20, 20, 20, 20)
        sdl3.SDL_SetRenderDrawColor(self.context.renderer, *self.canvas.current_color)
        sdl3.SDL_RenderFillRect(self.context.renderer, ctypes.byref(color_rect))
        
        # Color indicator border
        sdl3.SDL_SetRenderDrawColor(self.context.renderer, 255, 255, 255, 255)
        sdl3.SDL_RenderRect(self.context.renderer, ctypes.byref(color_rect))
        
        # Width indicator (brush width as line thickness)
        width_start_x = 50
        width_y = 30
        width_end_x = 50 + (self.canvas.current_width * 5)  # Scale width for visibility
        
        # Draw thick line to show brush width
        for i in range(self.canvas.current_width):
            sdl3.SDL_RenderLine(
                self.context.renderer,
                width_start_x, width_y + i - self.canvas.current_width // 2,
                width_end_x, width_y + i - self.canvas.current_width // 2
            )
        
        # Draw mode indicators
        mode_y = 50
        
        # Paint mode indicator
        mode_rect = sdl3.SDL_FRect(20, mode_y, 10, 10)
        sdl3.SDL_SetRenderDrawColor(self.context.renderer, 0, 255, 0, 255)  # Green
        sdl3.SDL_RenderFillRect(self.context.renderer, ctypes.byref(mode_rect))
        
        # Change for graphic ui
        # For now, just draw simple shapes to indicate controls
        
        # ESC indicator (red square)
        esc_rect = sdl3.SDL_FRect(20, 70, 15, 10)
        sdl3.SDL_SetRenderDrawColor(self.context.renderer, 255, 0, 0, 255)  # Red
        sdl3.SDL_RenderFillRect(self.context.renderer, ctypes.byref(esc_rect))
        
        # ENTER indicator (green square)
        enter_rect = sdl3.SDL_FRect(40, 70, 15, 10)
        sdl3.SDL_SetRenderDrawColor(self.context.renderer, 0, 255, 0, 255)  # Green
        sdl3.SDL_RenderFillRect(self.context.renderer, ctypes.byref(enter_rect))
        
        # C key indicator (blue square)
        clear_rect = sdl3.SDL_FRect(60, 70, 15, 10)
        sdl3.SDL_SetRenderDrawColor(self.context.renderer, 0, 0, 255, 255)  # Blue
        sdl3.SDL_RenderFillRect(self.context.renderer, ctypes.byref(clear_rect))

    def set_paint_color(self, r: int, g: int, b: int, a: int = 255):
        """Set the paint color."""
        if self.canvas:
            self.canvas.set_drawing_color(r, g, b, a)
            logger.info(f"Paint color set to: ({r}, {g}, {b}, {a})")

    def set_paint_width(self, width: int):
        """Set the paint brush width."""
        if self.canvas:
            self.canvas.set_drawing_width(width)
            logger.info(f"Paint width set to: {width}")

    def cycle_paint_colors(self):
        """Cycle through predefined paint colors."""
        if not self.canvas:
            return
            
        colors = [
            (255, 255, 255, 255),  # White
            (255, 0, 0, 255),      # Red
            (0, 255, 0, 255),      # Green
            (0, 0, 255, 255),      # Blue
            (255, 255, 0, 255),    # Yellow
            (255, 0, 255, 255),    # Magenta
            (0, 255, 255, 255),    # Cyan
            (0, 0, 0, 255),        # Black
        ]
        
        # Find current color index
        current_index = 0
        for i, color in enumerate(colors):
            if color == self.canvas.current_color:
                current_index = i
                break
        
        # Move to next color
        next_index = (current_index + 1) % len(colors)
        self.canvas.set_drawing_color(*colors[next_index])
        logger.info(f"Cycled to color: {colors[next_index]}")

    def adjust_paint_width(self, delta: int):
        """Adjust paint width by delta amount."""
        if not self.canvas:
            return
            
        new_width = max(1, min(20, self.canvas.current_width + delta))
        self.canvas.set_drawing_width(new_width)
        logger.info(f"Paint width adjusted to: {new_width}")

# Global paint system instance
paint_system = None

def init_paint_system(context):
    """Initialize the global paint system."""
    global paint_system
    paint_system = PaintSystem(context)
    logger.info("Paint system initialized")

def handle_paint_events(event) -> bool:
    """Handle paint events. Returns True if event was handled."""
    global paint_system
    if paint_system:
        return paint_system.handle_paint_event(event)
    return False

def render_paint_system():
    """Render the paint system if active."""
    global paint_system
    if paint_system and paint_system.paint_mode:
        paint_system.render_paint_canvas()

def toggle_paint_mode():
    """Toggle paint mode on/off."""
    global paint_system
    if paint_system:
        if paint_system.paint_mode:
            paint_system.exit_paint_mode()
        else:
            paint_system.enter_paint_mode()

def is_paint_mode_active() -> bool:
    """Check if paint mode is currently active."""
    global paint_system
    return paint_system and paint_system.paint_mode
def cycle_paint_colors():
    """Cycle through paint colors if paint mode is active."""
    global paint_system
    if paint_system and paint_system.paint_mode:
        paint_system.cycle_paint_colors()

def adjust_paint_width(delta: int):
    """Adjust paint width if paint mode is active."""
    global paint_system
    if paint_system and paint_system.paint_mode:
        paint_system.adjust_paint_width(delta)

def set_paint_color(r: int, g: int, b: int, a: int = 255):
    """Set paint color if paint mode is active."""
    global paint_system
    if paint_system and paint_system.paint_mode:
        paint_system.set_paint_color(r, g, b, a)