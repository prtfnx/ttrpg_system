import sdl3
import logging
import datetime
from typing import Optional, Dict, Any, List, Tuple, Callable
import json
import math

# Try to import SDL_ttf - handle if not available
try:
    import sdl3.sdl3_ttf as sdl_ttf
    TTF_AVAILABLE = True
except ImportError:
    try:
        # Alternative import method
        from sdl3 import sdl3_ttf as sdl_ttf
        TTF_AVAILABLE = True
    except ImportError:
        TTF_AVAILABLE = False
        logger.warning("SDL_ttf not available, using fallback text rendering")

logger = logging.getLogger(__name__)

class Color:
    """Color constants and utilities."""
    BLACK = (0, 0, 0, 255)
    WHITE = (255, 255, 255, 255)
    GRAY = (128, 128, 128, 255)
    DARK_GRAY = (64, 64, 64, 255)
    LIGHT_GRAY = (192, 192, 192, 255)
    RED = (255, 0, 0, 255)
    GREEN = (0, 255, 0, 255)
    BLUE = (0, 0, 255, 255)
    YELLOW = (255, 255, 0, 255)
    CYAN = (0, 255, 255, 255)
    MAGENTA = (255, 0, 255, 255)
    
    # UI Theme colors
    BG_DARK = (25, 25, 35, 220)
    BG_MEDIUM = (35, 35, 45, 200)
    BG_LIGHT = (45, 45, 55, 180)
    BORDER = (70, 70, 80, 255)
    TEXT = (220, 220, 220, 255)
    TEXT_DIM = (160, 160, 160, 255)
    ACCENT_BLUE = (80, 120, 160, 255)
    ACCENT_GREEN = (80, 160, 120, 255)
    ACCENT_ORANGE = (160, 120, 80, 255)
    BUTTON = (60, 60, 70, 200)
    BUTTON_HOVER = (80, 80, 90, 220)
    BUTTON_ACTIVE = (100, 100, 110, 240)

class FontManager:
    """Manages TTF fonts for the GUI."""
    def __init__(self, renderer):
        self.renderer = renderer
        self.fonts = {}
        self.text_cache = {}  # Cache rendered text textures
        self.ttf_available = TTF_AVAILABLE
        self.init_fonts()
    
    def init_fonts(self):
        """Initialize SDL_ttf and load fonts."""
        if not self.ttf_available:
            logger.info("TTF not available, using bitmap fonts")
            return False
        
        try:
            # Initialize TTF
            if sdl_ttf.TTF_Init() < 0:
                logger.error("Failed to initialize SDL_ttf")
                self.ttf_available = False
                return False
            
            # Try to load different font sizes
            font_paths = [
                "C:/Windows/Fonts/arial.ttf",  # Windows
                "C:/Windows/Fonts/calibri.ttf",  # Windows alternative
                "C:/Windows/Fonts/tahoma.ttf",  # Windows alternative
                "/System/Library/Fonts/Arial.ttf",  # macOS
                "/System/Library/Fonts/Helvetica.ttc",  # macOS alternative
                "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",  # Linux
                "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",  # Linux alternative
                "assets/fonts/default.ttf",  # Custom font
            ]
            
            font_loaded = False
            for font_path in font_paths:
                try:
                    # Test load one font first
                    test_font = sdl_ttf.TTF_OpenFont(font_path.encode('utf-8'), 14)
                    if test_font:
                        sdl_ttf.TTF_CloseFont(test_font)
                        
                        # Load different sizes
                        self.fonts['small'] = sdl_ttf.TTF_OpenFont(font_path.encode('utf-8'), 12)
                        self.fonts['medium'] = sdl_ttf.TTF_OpenFont(font_path.encode('utf-8'), 14)
                        self.fonts['large'] = sdl_ttf.TTF_OpenFont(font_path.encode('utf-8'), 16)
                        
                        if self.fonts['medium']:
                            font_loaded = True
                            logger.info(f"Loaded TTF font: {font_path}")
                            break
                except Exception as e:
                    logger.debug(f"Failed to load font {font_path}: {e}")
                    continue
            
            if not font_loaded:
                logger.warning("No TTF fonts loaded, falling back to bitmap")
                self.ttf_available = False
                self.fonts = {}
            
            return font_loaded
            
        except Exception as e:
            logger.error(f"Font initialization error: {e}")
            self.ttf_available = False
            return False
    
    def render_text(self, text: str, font_size: str = 'medium', color: Tuple[int, int, int, int] = Color.TEXT) -> Optional[int]:
        """Render text and return texture. Returns None if font not available."""
        if not self.ttf_available or not self.fonts or font_size not in self.fonts:
            return None
        
        # Create cache key
        cache_key = f"{text}_{font_size}_{color}"
        if cache_key in self.text_cache:
            return self.text_cache[cache_key]
        
        try:
            font = self.fonts[font_size]
            if not font:
                return None
            
            # Create SDL_Color properly
            sdl_color = sdl3.SDL_Color(
                r=color[0],
                g=color[1], 
                b=color[2],
                a=color[3] if len(color) > 3 else 255
            )
            
            # Render text to surface
            surface = sdl_ttf.TTF_RenderText_Blended(font, text.encode('utf-8'), sdl_color)
            
            if not surface:
                logger.debug(f"Failed to render text surface: {text}")
                return None
            
            # Create texture from surface
            texture = sdl3.SDL_CreateTextureFromSurface(self.renderer, surface)
            sdl3.SDL_DestroySurface(surface)
            
            if texture:
                # Cache the texture (limit cache size)
                if len(self.text_cache) > 50:  # Reduce cache size
                    # Remove oldest entry
                    old_key = next(iter(self.text_cache))
                    old_texture = self.text_cache.pop(old_key)
                    sdl3.SDL_DestroyTexture(old_texture)
                
                self.text_cache[cache_key] = texture
                return texture
            else:
                logger.debug(f"Failed to create texture from surface: {text}")
                return None
            
        except Exception as e:
            logger.debug(f"Text rendering error for '{text}': {e}")
            return None
    
    def get_text_size(self, text: str, font_size: str = 'medium') -> Tuple[int, int]:
        """Get the size of rendered text."""
        if not self.ttf_available or not self.fonts or font_size not in self.fonts:
            return (len(text) * 6, 12)  # Fallback size
        
        try:
            font = self.fonts[font_size]
            if not font:
                return (len(text) * 6, 12)
            
            # Get text size
            w = sdl3.c_int()
            h = sdl3.c_int()
            result = sdl_ttf.TTF_SizeText(font, text.encode('utf-8'), w, h)
            
            if result == 0:  # Success
                return (w.value, h.value)
            else:
                return (len(text) * 6, 12)
            
        except Exception as e:
            logger.debug(f"Error getting text size for '{text}': {e}")
            return (len(text) * 6, 12)
    
    def cleanup(self):
        """Clean up font resources."""
        # Clean up cached textures
        for texture in self.text_cache.values():
            try:
                sdl3.SDL_DestroyTexture(texture)
            except:
                pass
        self.text_cache.clear()
        
        # Clean up fonts
        if self.ttf_available:
            for font in self.fonts.values():
                if font:
                    try:
                        sdl_ttf.TTF_CloseFont(font)
                    except:
                        pass
            self.fonts.clear()
            
            try:
                sdl_ttf.TTF_Quit()
            except:
                pass

class Rect:
    """Rectangle utility class."""
    def __init__(self, x: int, y: int, w: int, h: int):
        self.x = x
        self.y = y
        self.w = w
        self.h = h
    
    def contains(self, px: int, py: int) -> bool:
        return self.x <= px <= self.x + self.w and self.y <= py <= self.y + self.h
    
    def center(self) -> Tuple[int, int]:
        return (self.x + self.w // 2, self.y + self.h // 2)

class Widget:
    """Base widget class."""
    def __init__(self, x: int, y: int, w: int, h: int, tag: str = ""):
        # Store relative position within parent panel
        self.rel_x = x
        self.rel_y = y
        self.rect = Rect(x, y, w, h)
        self.tag = tag
        self.visible = True
        self.enabled = True
        self.hover = False
        self.clicked = False
        self.callback: Optional[Callable] = None
        self.dirty = True  # Needs redraw
    
    def update_position(self, panel_x: int, panel_y: int):
        """Update absolute position based on panel position."""
        old_x, old_y = self.rect.x, self.rect.y
        self.rect.x = panel_x + self.rel_x
        self.rect.y = panel_y + self.rel_y
        if old_x != self.rect.x or old_y != self.rect.y:
            self.dirty = True
    
    def handle_event(self, event, mouse_x: int, mouse_y: int) -> bool:
        """Handle input event. Returns True if consumed."""
        if not self.visible or not self.enabled:
            return False
        
        old_hover = self.hover
        self.hover = self.rect.contains(mouse_x, mouse_y)
        if old_hover != self.hover:
            self.dirty = True
        
        if event.type == sdl3.SDL_EVENT_MOUSE_BUTTON_DOWN:
            if self.hover and event.button.button == sdl3.SDL_BUTTON_LEFT:
                self.clicked = True
                self.dirty = True
                return True
        elif event.type == sdl3.SDL_EVENT_MOUSE_BUTTON_UP:
            if self.clicked and event.button.button == sdl3.SDL_BUTTON_LEFT:
                self.clicked = False
                self.dirty = True
                if self.hover and self.callback:
                    self.callback()
                return True
        
        return False
    
    def render(self, renderer, font_manager: FontManager):
        """Render the widget."""
        if self.dirty:
            self.dirty = False

class Button(Widget):
    """Button widget."""
    def __init__(self, x: int, y: int, w: int, h: int, text: str, callback: Callable = None, tag: str = ""):
        super().__init__(x, y, w, h, tag)
        self.text = text
        self.callback = callback
    
    def render(self, renderer, font_manager: FontManager):
        if not self.visible:
            return
        
        # Only redraw if dirty (optimization)
        if not self.dirty:
            return
        self.dirty = False
        
        # Determine button color
        if self.clicked:
            color = Color.BUTTON_ACTIVE
        elif self.hover:
            color = Color.BUTTON_HOVER
        else:
            color = Color.BUTTON
        
        # Draw button background
        sdl3.SDL_SetRenderDrawColor(renderer, *color)
        sdl_rect = sdl3.SDL_FRect(self.rect.x, self.rect.y, self.rect.w, self.rect.h)
        sdl3.SDL_RenderFillRect(renderer, sdl_rect)
        
        # Draw border
        sdl3.SDL_SetRenderDrawColor(renderer, *Color.BORDER)
        sdl3.SDL_RenderRect(renderer, sdl_rect)
        
        # Draw text using TTF if available
        self._draw_text_centered(renderer, font_manager, self.text, self.rect, Color.TEXT)
    
    def _draw_text_centered(self, renderer, font_manager: FontManager, text: str, rect: Rect, color: Tuple[int, int, int, int]):
        """Draw text centered in rect using TTF fonts."""
        texture = font_manager.render_text(text, 'small', color)
        
        if texture:
            # Get texture size
            tex_w, tex_h = font_manager.get_text_size(text, 'small')
            
            # Center the text
            center_x, center_y = rect.center()
            text_x = center_x - tex_w // 2
            text_y = center_y - tex_h // 2
            
            # Render texture
            dst_rect = sdl3.SDL_FRect(text_x, text_y, tex_w, tex_h)
            sdl3.SDL_RenderTexture(renderer, texture, None, dst_rect)
        else:
            # Fallback to bitmap text
            self._draw_bitmap_text_centered(renderer, text, rect, color)
    
    def _draw_bitmap_text_centered(self, renderer, text: str, rect: Rect, color: Tuple[int, int, int, int]):
        """Fallback bitmap text rendering."""
        sdl3.SDL_SetRenderDrawColor(renderer, *color)
        center_x, center_y = rect.center()
        
        # Simple bitmap font rendering
        char_width = 6
        text_width = len(text) * char_width
        start_x = center_x - text_width // 2
        
        for i, char in enumerate(text[:12]):  # Limit length to fit
            char_x = start_x + i * char_width
            if char_x < rect.x or char_x > rect.x + rect.w - char_width:
                continue
                
            # Draw simple character patterns
            if char.isalpha():
                # Letters - simple block pattern
                for dy in range(3):
                    for dx in range(3):
                        sdl3.SDL_RenderPoint(renderer, char_x + dx + 1, center_y - 1 + dy)
            elif char.isdigit():
                # Numbers - vertical line pattern
                for dy in range(5):
                    sdl3.SDL_RenderPoint(renderer, char_x + 2, center_y - 2 + dy)
            elif char == ' ':
                continue  # Space
            else:
                # Other characters - single dot
                sdl3.SDL_RenderPoint(renderer, char_x + 2, center_y)

class Panel(Widget):
    """Panel widget container."""
    def __init__(self, x: int, y: int, w: int, h: int, title: str = "", tag: str = ""):
        super().__init__(x, y, w, h, tag)
        self.title = title
        self.widgets: List[Widget] = []
        self.bg_color = Color.BG_DARK
        self.border_color = Color.BORDER
        self.title_color = Color.TEXT
        self.dragging = False
        self.drag_offset_x = 0
        self.drag_offset_y = 0
    
    def add_widget(self, widget: Widget):
        """Add widget to panel with relative positioning."""
        # Convert absolute widget position to relative position within panel
        widget.rel_x = widget.rect.x - self.rect.x
        widget.rel_y = widget.rect.y - self.rect.y
        widget.update_position(self.rect.x, self.rect.y)
        self.widgets.append(widget)
    
    def update_widget_positions(self):
        """Update all widget positions when panel moves."""
        for widget in self.widgets:
            widget.update_position(self.rect.x, self.rect.y)
    
    def handle_event(self, event, mouse_x: int, mouse_y: int) -> bool:
        """Handle events for panel and its widgets."""
        if not self.visible:
            return False
        
        # Handle dragging
        if event.type == sdl3.SDL_EVENT_MOUSE_BUTTON_DOWN:
            if event.button.button == sdl3.SDL_BUTTON_LEFT:
                # Check if clicking on title bar
                title_rect = Rect(self.rect.x, self.rect.y, self.rect.w, 25)
                if title_rect.contains(mouse_x, mouse_y):
                    self.dragging = True
                    self.drag_offset_x = mouse_x - self.rect.x
                    self.drag_offset_y = mouse_y - self.rect.y
                    return True
        
        elif event.type == sdl3.SDL_EVENT_MOUSE_BUTTON_UP:
            if event.button.button == sdl3.SDL_BUTTON_LEFT:
                self.dragging = False
        
        elif event.type == sdl3.SDL_EVENT_MOUSE_MOTION:
            if self.dragging:
                # Update panel position
                old_x, old_y = self.rect.x, self.rect.y
                self.rect.x = mouse_x - self.drag_offset_x
                self.rect.y = mouse_y - self.drag_offset_y
                
                # Keep panel on screen
                self.rect.x = max(0, min(self.rect.x, 1920 - self.rect.w))
                self.rect.y = max(0, min(self.rect.y, 1080 - self.rect.h))
                
                # Update widget positions if panel actually moved
                if old_x != self.rect.x or old_y != self.rect.y:
                    self.dirty = True
                    self.update_widget_positions()
                
                return True
        
        # Handle widget events
        for widget in reversed(self.widgets):  # Reverse for top-to-bottom
            if widget.handle_event(event, mouse_x, mouse_y):
                return True
        
        # Check if mouse is over panel
        return self.rect.contains(mouse_x, mouse_y)
    
    def render(self, renderer, font_manager: FontManager):
        """Render panel and its widgets."""
        if not self.visible:
            return
        
        # Always render panels (remove dirty optimization for now)
        # Draw panel background
        sdl3.SDL_SetRenderDrawColor(renderer, *self.bg_color)
        panel_rect = sdl3.SDL_FRect(self.rect.x, self.rect.y, self.rect.w, self.rect.h)
        sdl3.SDL_RenderFillRect(renderer, panel_rect)
        
        # Draw border
        sdl3.SDL_SetRenderDrawColor(renderer, *self.border_color)
        sdl3.SDL_RenderRect(renderer, panel_rect)
        
        # Draw title bar
        if self.title:
            title_rect = sdl3.SDL_FRect(self.rect.x, self.rect.y, self.rect.w, 25)
            sdl3.SDL_SetRenderDrawColor(renderer, *Color.BG_MEDIUM)
            sdl3.SDL_RenderFillRect(renderer, title_rect)
            
            # Title border
            sdl3.SDL_SetRenderDrawColor(renderer, *self.border_color)
            sdl3.SDL_RenderRect(renderer, title_rect)
            
            # Title text using TTF
            self._draw_title_text(renderer, font_manager, self.title, self.rect.x + 5, self.rect.y + 5, self.title_color)
        
        # Render widgets
        for widget in self.widgets:
            widget.render(renderer, font_manager)
    
    def _draw_title_text(self, renderer, font_manager: FontManager, text: str, x: int, y: int, color: Tuple[int, int, int, int]):
        """Draw title text using TTF fonts."""
        texture = font_manager.render_text(text, 'medium', color)
        
        if texture:
            tex_w, tex_h = font_manager.get_text_size(text, 'medium')
            dst_rect = sdl3.SDL_FRect(x, y, tex_w, tex_h)
            sdl3.SDL_RenderTexture(renderer, texture, None, dst_rect)
        else:
            # Fallback bitmap text for titles
            sdl3.SDL_SetRenderDrawColor(renderer, *color)
            char_width = 7
            for i, char in enumerate(text[:15]):
                char_x = x + i * char_width
                if char_x > self.rect.x + self.rect.w - char_width:
                    break
                # Simple title character rendering
                if char.isalpha() or char.isdigit():
                    for dy in range(3):
                        for dx in range(4):
                            sdl3.SDL_RenderPoint(renderer, char_x + dx, y + 2 + dy)
                elif char == ' ':
                    continue

class TextDisplay(Widget):
    """Text display widget."""
    def __init__(self, x: int, y: int, w: int, h: int, text: str = "", tag: str = ""):
        super().__init__(x, y, w, h, tag)
        self.text = text
        self.color = Color.TEXT
        self.lines: List[str] = []
        self.wrap_text()
    
    def set_text(self, text: str):
        """Set text content."""
        if self.text != text:
            self.text = text
            self.wrap_text()
            self.dirty = True
    
    def wrap_text(self):
        """Wrap text to fit widget width."""
        # Simplified text wrapping
        chars_per_line = max(1, self.rect.w // 6)  # Rough estimate
        words = self.text.split()
        lines = []
        current_line = ""
        
        for word in words:
            if len(current_line + " " + word) <= chars_per_line:
                current_line = (current_line + " " + word).strip()
            else:
                if current_line:
                    lines.append(current_line)
                current_line = word
        
        if current_line:
            lines.append(current_line)
        
        self.lines = lines[:10]  # Limit lines
    
    def render(self, renderer, font_manager: FontManager):
        if not self.visible:
            return
        
        # Always render text displays (remove dirty optimization)
        # Draw background
        sdl3.SDL_SetRenderDrawColor(renderer, *Color.BG_LIGHT)
        bg_rect = sdl3.SDL_FRect(self.rect.x, self.rect.y, self.rect.w, self.rect.h)
        sdl3.SDL_RenderFillRect(renderer, bg_rect)
        
        # Draw border
        sdl3.SDL_SetRenderDrawColor(renderer, *Color.BORDER)
        sdl3.SDL_RenderRect(renderer, bg_rect)
        
        # Draw text lines using TTF
        line_height = 14
        y_offset = 5
        for i, line in enumerate(self.lines):
            if y_offset + line_height > self.rect.h:
                break
            self._draw_text_line(renderer, font_manager, line, self.rect.x + 5, self.rect.y + y_offset, self.color)
            y_offset += line_height
    
    def _draw_text_line(self, renderer, font_manager: FontManager, text: str, x: int, y: int, color: Tuple[int, int, int, int]):
        """Draw a line of text using TTF fonts."""
        if not text.strip():
            return
            
        texture = font_manager.render_text(text, 'small', color)
        
        if texture:
            tex_w, tex_h = font_manager.get_text_size(text, 'small')
            # Clip text to widget bounds
            max_width = self.rect.x + self.rect.w - x - 5
            if tex_w > max_width:
                tex_w = max_width
            
            dst_rect = sdl3.SDL_FRect(x, y, tex_w, tex_h)
            sdl3.SDL_RenderTexture(renderer, texture, None, dst_rect)
        else:
            # Fallback bitmap rendering
            sdl3.SDL_SetRenderDrawColor(renderer, *color)
            char_width = 5
            for i, char in enumerate(text):
                char_x = x + i * char_width
                if char_x > self.rect.x + self.rect.w - 5:
                    break
                
                # Simple character patterns
                if char.isalpha():
                    sdl3.SDL_RenderPoint(renderer, char_x, y)
                    sdl3.SDL_RenderPoint(renderer, char_x + 1, y)
                    sdl3.SDL_RenderPoint(renderer, char_x, y + 1)
                elif char.isdigit():
                    sdl3.SDL_RenderPoint(renderer, char_x, y)
                    sdl3.SDL_RenderPoint(renderer, char_x, y + 1)
                elif char in ':-/':
                    sdl3.SDL_RenderPoint(renderer, char_x, y + 1)
                elif char == ' ':
                    continue

class ProgressBar(Widget):
    """Progress bar widget."""
    def __init__(self, x: int, y: int, w: int, h: int, value: float = 1.0, tag: str = ""):
        super().__init__(x, y, w, h, tag)
        self.value = max(0.0, min(1.0, value))  # Clamp between 0 and 1
        self.bg_color = Color.BG_LIGHT
        self.fill_color = Color.ACCENT_GREEN
        self.border_color = Color.BORDER
        self.text = ""
    
    def set_value(self, value: float, text: str = ""):
        """Set progress value and optional text."""
        new_value = max(0.0, min(1.0, value))
        if self.value != new_value or self.text != text:
            self.value = new_value
            self.text = text
            self.dirty = True
    
    def render(self, renderer, font_manager: FontManager):
        if not self.visible:
            return
        
        # Always render progress bars
        # Draw background
        sdl3.SDL_SetRenderDrawColor(renderer, *self.bg_color)
        bg_rect = sdl3.SDL_FRect(self.rect.x, self.rect.y, self.rect.w, self.rect.h)
        sdl3.SDL_RenderFillRect(renderer, bg_rect)
        
        # Draw fill
        fill_width = int(self.rect.w * self.value)
        if fill_width > 0:
            sdl3.SDL_SetRenderDrawColor(renderer, *self.fill_color)
            fill_rect = sdl3.SDL_FRect(self.rect.x, self.rect.y, fill_width, self.rect.h)
            sdl3.SDL_RenderFillRect(renderer, fill_rect)
        
        # Draw border
        sdl3.SDL_SetRenderDrawColor(renderer, *self.border_color)
        sdl3.SDL_RenderRect(renderer, bg_rect)
        
        # Draw text overlay using TTF
        if self.text:
            texture = font_manager.render_text(self.text, 'small', Color.TEXT)
            if texture:
                tex_w, tex_h = font_manager.get_text_size(self.text, 'small')
                center_x = self.rect.x + self.rect.w // 2 - tex_w // 2
                center_y = self.rect.y + self.rect.h // 2 - tex_h // 2
                dst_rect = sdl3.SDL_FRect(center_x, center_y, tex_w, tex_h)
                sdl3.SDL_RenderTexture(renderer, texture, None, dst_rect)

class TTRPGGuiSDL:
    """Custom SDL3 GUI for TTRPG system."""
    
    def __init__(self, context, renderer, window_width: int = 1920, window_height: int = 1080):
        self.context = context
        self.renderer = renderer
        self.window_width = window_width
        self.window_height = window_height
        self.gui_active = True
        
        # Initialize font manager
        self.font_manager = FontManager(renderer)
        
        # State
        self.chat_messages: List[str] = []
        self.current_character = None
        self.paint_mode_active = False
        self.measure_mode_active = False
        self.brush_size = 3
        self.brush_color = Color.BLACK
        self.last_mouse_x = 0
        self.last_mouse_y = 0
        
        # Panels
        self.panels: List[Panel] = []
        
        # Create GUI layout
        self.create_gui_layout()
        
        logger.info("Custom SDL3 GUI initialized")
    
    def create_gui_layout(self):
        """Create all GUI panels and widgets."""
        
        # Top menu panel
        menu_panel = Panel(10, 10, 400, 120, "Table Controls", "menu_panel")
        menu_panel.add_widget(Button(15, 40, 80, 25, "New", self.new_table, "new_btn"))
        menu_panel.add_widget(Button(105, 40, 80, 25, "Load", self.load_table, "load_btn"))
        menu_panel.add_widget(Button(195, 40, 80, 25, "Save", self.save_table, "save_btn"))
        menu_panel.add_widget(Button(285, 40, 80, 25, "Export", self.export_table, "export_btn"))
        
        menu_panel.add_widget(Button(15, 75, 60, 25, "Zoom+", self.zoom_in, "zoom_in_btn"))
        menu_panel.add_widget(Button(85, 75, 60, 25, "Zoom-", self.zoom_out, "zoom_out_btn"))
        menu_panel.add_widget(Button(155, 75, 60, 25, "Reset", self.reset_view, "reset_btn"))
        menu_panel.add_widget(Button(225, 75, 100, 25, "F1: Hide", self.toggle_gui, "toggle_btn"))
        
        self.panels.append(menu_panel)
        
        # Character panel (right side)
        char_x = self.window_width - 320
        char_panel = Panel(char_x, 10, 300, 480, "Character", "char_panel")
        char_panel.bg_color = Color.BG_DARK
        char_panel.border_color = Color.ACCENT_BLUE
        
        # Character info
        char_panel.add_widget(TextDisplay(char_x + 10, 40, 280, 60, "No Character Selected", "char_info"))
        
        # Health bars
        char_panel.add_widget(ProgressBar(char_x + 10, 110, 280, 20, 1.0, "hp_bar"))
        char_panel.add_widget(ProgressBar(char_x + 10, 140, 280, 20, 1.0, "mp_bar"))
        
        # Stats display
        char_panel.add_widget(TextDisplay(char_x + 10, 170, 280, 120, "No stats available", "stats_display"))
        
        # Spells display
        char_panel.add_widget(TextDisplay(char_x + 10, 300, 280, 100, "No spells", "spells_display"))
        
        # Character actions
        char_panel.add_widget(Button(char_x + 10, 410, 85, 25, "Initiative", self.roll_initiative, "init_btn"))
        char_panel.add_widget(Button(char_x + 105, 410, 85, 25, "Long Rest", self.long_rest, "long_rest_btn"))
        char_panel.add_widget(Button(char_x + 200, 410, 85, 25, "Short Rest", self.short_rest, "short_rest_btn"))
        
        self.panels.append(char_panel)
        
        # Chat panel (bottom right)
        chat_x = self.window_width - 320
        chat_y = self.window_height - 250
        chat_panel = Panel(chat_x, chat_y, 300, 240, "Chat", "chat_panel")
        chat_panel.bg_color = Color.BG_DARK
        chat_panel.border_color = Color.ACCENT_GREEN
        
        # Chat log
        chat_panel.add_widget(TextDisplay(chat_x + 10, chat_y + 30, 280, 160, "Chat ready...", "chat_log"))
        
        # Chat controls
        chat_panel.add_widget(Button(chat_x + 10, chat_y + 200, 60, 25, "Send", self.send_chat, "send_btn"))
        chat_panel.add_widget(Button(chat_x + 80, chat_y + 200, 60, 25, "Clear", self.clear_chat, "clear_btn"))
        chat_panel.add_widget(Button(chat_x + 150, chat_y + 200, 60, 25, "Save", self.save_chat, "save_chat_btn"))
        
        self.panels.append(chat_panel)
        
        # Tools panel (left side)
        tools_panel = Panel(10, 140, 250, 350, "Tools", "tools_panel")
        tools_panel.bg_color = Color.BG_DARK
        tools_panel.border_color = Color.ACCENT_ORANGE
        
        # Tool buttons
        tools_panel.add_widget(Button(20, 170, 100, 25, "Paint Mode", self.toggle_paint_mode, "paint_btn"))
        tools_panel.add_widget(Button(130, 170, 100, 25, "Measure", self.toggle_measure_mode, "measure_btn"))
        tools_panel.add_widget(Button(20, 205, 100, 25, "Grid Snap", self.toggle_grid_snap, "grid_btn"))
        
        # Brush size (simplified as buttons)
        tools_panel.add_widget(Button(20, 240, 40, 25, "B-", self.brush_smaller, "brush_down"))
        tools_panel.add_widget(Button(70, 240, 40, 25, "B+", self.brush_bigger, "brush_up"))
        tools_panel.add_widget(TextDisplay(120, 240, 100, 25, f"Size: {self.brush_size}", "brush_size_display"))
        
        # Color buttons
        tools_panel.add_widget(Button(20, 275, 25, 25, "●", lambda: self.set_brush_color(Color.BLACK), "color_black"))
        tools_panel.add_widget(Button(55, 275, 25, 25, "●", lambda: self.set_brush_color(Color.RED), "color_red"))
        tools_panel.add_widget(Button(90, 275, 25, 25, "●", lambda: self.set_brush_color(Color.GREEN), "color_green"))
        tools_panel.add_widget(Button(125, 275, 25, 25, "●", lambda: self.set_brush_color(Color.BLUE), "color_blue"))
        tools_panel.add_widget(Button(160, 275, 25, 25, "●", lambda: self.set_brush_color(Color.WHITE), "color_white"))
        
        # Clear drawings
        tools_panel.add_widget(Button(20, 310, 200, 25, "Clear Drawings", self.clear_drawings, "clear_draw_btn"))
        
        # Measurement display
        tools_panel.add_widget(TextDisplay(20, 345, 200, 25, "Measure: --", "measure_display"))
        
        self.panels.append(tools_panel)
        
        # Dice panel
        dice_panel = Panel(270, 140, 280, 200, "Dice Roller", "dice_panel")
        
        # Quick dice
        dice_panel.add_widget(Button(280, 170, 35, 25, "d4", lambda: self.roll_dice("1d4"), "d4_btn"))
        dice_panel.add_widget(Button(325, 170, 35, 25, "d6", lambda: self.roll_dice("1d6"), "d6_btn"))
        dice_panel.add_widget(Button(370, 170, 35, 25, "d8", lambda: self.roll_dice("1d8"), "d8_btn"))
        dice_panel.add_widget(Button(415, 170, 35, 25, "d10", lambda: self.roll_dice("1d10"), "d10_btn"))
        dice_panel.add_widget(Button(460, 170, 35, 25, "d12", lambda: self.roll_dice("1d12"), "d12_btn"))
        dice_panel.add_widget(Button(505, 170, 35, 25, "d20", lambda: self.roll_dice("1d20"), "d20_btn"))
        
        dice_panel.add_widget(Button(280, 205, 50, 25, "d100", lambda: self.roll_dice("1d100"), "d100_btn"))
        dice_panel.add_widget(Button(340, 205, 50, 25, "2d6", lambda: self.roll_dice("2d6"), "2d6_btn"))
        dice_panel.add_widget(Button(400, 205, 50, 25, "3d6", lambda: self.roll_dice("3d6"), "3d6_btn"))
        dice_panel.add_widget(Button(460, 205, 50, 25, "4d6", lambda: self.roll_dice("4d6"), "4d6_btn"))
        
        # Dice result
        dice_panel.add_widget(TextDisplay(280, 240, 260, 80, "No rolls yet", "dice_result"))
        
        self.panels.append(dice_panel)
        
        # Initiative panel
        init_panel = Panel(270, 350, 280, 180, "Initiative", "init_panel")
        
        # Combat controls
        init_panel.add_widget(Button(280, 380, 60, 25, "Start", self.start_combat, "start_combat_btn"))
        init_panel.add_widget(Button(350, 380, 60, 25, "Next", self.next_turn, "next_turn_btn"))
        init_panel.add_widget(Button(420, 380, 60, 25, "End", self.end_combat, "end_combat_btn"))
        
        # Initiative display
        init_panel.add_widget(TextDisplay(280, 415, 260, 80, "No combat active", "init_display"))
        
        # Initiative controls
        init_panel.add_widget(Button(280, 505, 60, 20, "Add", self.add_combatant, "add_comb_btn"))
        init_panel.add_widget(Button(350, 505, 60, 20, "Remove", self.remove_combatant, "rem_comb_btn"))
        init_panel.add_widget(Button(420, 505, 60, 20, "Clear", self.clear_initiative, "clear_init_btn"))
        
        self.panels.append(init_panel)
    
    def handle_event(self, event) -> bool:
        """Handle SDL events for GUI."""
        # Update mouse position from events
        if event.type == sdl3.SDL_EVENT_MOUSE_MOTION:
            self.last_mouse_x = int(event.motion.x)
            self.last_mouse_y = int(event.motion.y)
        elif event.type in (sdl3.SDL_EVENT_MOUSE_BUTTON_DOWN, sdl3.SDL_EVENT_MOUSE_BUTTON_UP):
            self.last_mouse_x = int(event.button.x)
            self.last_mouse_y = int(event.button.y)
        
        # Handle F1 toggle - FIXED: Check for key release instead of press
        if event.type == sdl3.SDL_EVENT_KEY_UP:  # Changed from KEY_DOWN to KEY_UP
            if event.key.scancode == sdl3.SDL_SCANCODE_F1:
                self.toggle_gui()
                return True
        
        # Only handle other events if GUI is active
        if not self.gui_active:
            return False
        
        # Handle panel events (reverse order for proper Z-order)
        for panel in reversed(self.panels):
            if panel.handle_event(event, self.last_mouse_x, self.last_mouse_y):
                return True
        
        return False
    
    def update(self, delta_time: float):
        """Update GUI state."""
        if not self.gui_active:
            return
        
        # Update character display
        self._update_character_display()
        
        # Update brush size display
        brush_widget = self._find_widget("brush_size_display")
        if brush_widget:
            brush_widget.set_text(f"Size: {self.brush_size}")
    
    def render(self):
        """Render all GUI panels."""
        if not self.gui_active:
            return
        
        # Only render panels that are dirty or have dirty widgets (optimization)
        for panel in self.panels:
            panel.render(self.renderer, self.font_manager)
    
    def toggle_gui(self):
        """Toggle GUI visibility."""
        self.gui_active = not self.gui_active
        
        # Mark all panels as dirty when toggling visibility
        if self.gui_active:
            for panel in self.panels:
                panel.dirty = True
                for widget in panel.widgets:
                    widget.dirty = True
        
        logger.info(f"GUI {'enabled' if self.gui_active else 'disabled'}")
    
    def add_chat_message(self, message: str, sender: str = "System"):
        """Add message to chat."""
        timestamp = datetime.datetime.now().strftime("%H:%M:%S")
        formatted_message = f"[{timestamp}] {sender}: {message}"
        
        self.chat_messages.append(formatted_message)
        
        # Keep last 20 messages
        if len(self.chat_messages) > 20:
            self.chat_messages = self.chat_messages[-20:]
        
        # Update chat display
        chat_text = "\n".join(self.chat_messages[-10:])  # Show last 10
        chat_widget = self._find_widget("chat_log")
        if chat_widget:
            chat_widget.set_text(chat_text)
    
    def set_current_character(self, character):
        """Set current character."""
        self.current_character = character
        self._update_character_display()
    
    def _update_character_display(self):
        """Update character panel."""
        if not self.current_character:
            char_widget = self._find_widget("char_info")
            if char_widget:
                char_widget.set_text("No Character Selected")
            
            stats_widget = self._find_widget("stats_display")
            if stats_widget:
                stats_widget.set_text("No stats available")
            
            spells_widget = self._find_widget("spells_display")
            if spells_widget:
                spells_widget.set_text("No spells")
            return
        
        try:
            # Update character info
            char_name = getattr(self.current_character, 'name', 'Unknown')
            char_level = getattr(self.current_character, 'level', 1)
            char_class = getattr(self.current_character, 'character_class', 'Unknown')
            
            char_info = f"{char_name}\nLevel: {char_level}\nClass: {char_class}"
            char_widget = self._find_widget("char_info")
            if char_widget:
                char_widget.set_text(char_info)
            
            # Update health bars
            max_hp = getattr(self.current_character, 'max_hp', 100)
            current_hp = getattr(self.current_character, 'current_hp', max_hp)
            hp_percent = current_hp / max_hp if max_hp > 0 else 0
            
            hp_bar = self._find_widget("hp_bar")
            if hp_bar:
                hp_bar.set_value(hp_percent, f"HP: {current_hp}/{max_hp}")
            
            # Update stats
            stats = getattr(self.current_character, 'stats', {})
            if stats:
                stats_text = ""
                for stat_name, stat_value in list(stats.items())[:6]:
                    modifier = (stat_value - 10) // 2
                    sign = "+" if modifier >= 0 else ""
                    stats_text += f"{stat_name[:3].upper()}: {stat_value} ({sign}{modifier})\n"
                
                stats_widget = self._find_widget("stats_display")
                if stats_widget:
                    stats_widget.set_text(stats_text.strip())
            
            # Update spells
            spells = getattr(self.current_character, 'spells', [])
            if spells:
                spells_text = ""
                for spell in spells[:5]:  # Show first 5 spells
                    spell_name = getattr(spell, 'name', 'Unknown')
                    spells_text += f"• {spell_name}\n"
                
                spells_widget = self._find_widget("spells_display")
                if spells_widget:
                    spells_widget.set_text(spells_text.strip())
        
        except Exception as e:
            logger.error(f"Error updating character display: {e}")
    
    def _find_widget(self, tag: str) -> Optional[Widget]:
        """Find widget by tag."""
        for panel in self.panels:
            for widget in panel.widgets:
                if widget.tag == tag:
                    return widget
        return None
    
    # Button callback methods
    def new_table(self):
        self.add_chat_message("New table created", "System")
    
    def load_table(self):
        self.add_chat_message("Load table dialog", "System")
    
    def save_table(self):
        self.add_chat_message("Table saved", "System")
    
    def export_table(self):
        self.add_chat_message("Table exported", "System")
    
    def zoom_in(self):
        if hasattr(self.context, 'current_table') and self.context.current_table:
            self.context.current_table.change_scale(0.1)
        self.add_chat_message("Zoomed in", "System")
    
    def zoom_out(self):
        if hasattr(self.context, 'current_table') and self.context.current_table:
            self.context.current_table.change_scale(-0.1)
        self.add_chat_message("Zoomed out", "System")
    
    def reset_view(self):
        self.add_chat_message("View reset", "System")
    
    def send_chat(self):
        # In a real implementation, this would open a text input dialog
        self.add_chat_message("Hello from GUI!", "Player")
    
    def clear_chat(self):
        self.chat_messages.clear()
        chat_widget = self._find_widget("chat_log")
        if chat_widget:
            chat_widget.set_text("Chat cleared...")
    
    def save_chat(self):
        try:
            timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
            filename = f"chat_log_{timestamp}.txt"
            with open(filename, 'w', encoding='utf-8') as f:
                f.write("\n".join(self.chat_messages))
            self.add_chat_message(f"Chat saved to {filename}", "System")
        except Exception as e:
            self.add_chat_message(f"Save failed: {e}", "System")
    
    def toggle_paint_mode(self):
        self.paint_mode_active = not self.paint_mode_active
        try:
            import paint
            if self.paint_mode_active:
                paint.enable_paint_mode()
                paint.set_brush_size(self.brush_size)
                paint.set_brush_color(self.brush_color)
            else:
                paint.disable_paint_mode()
        except:
            pass
        self.add_chat_message(f"Paint mode {'enabled' if self.paint_mode_active else 'disabled'}", "System")
    
    def toggle_measure_mode(self):
        self.measure_mode_active = not self.measure_mode_active
        self.add_chat_message(f"Measure mode {'enabled' if self.measure_mode_active else 'disabled'}", "System")
    
    def toggle_grid_snap(self):
        self.add_chat_message("Grid snap toggled", "System")
    
    def brush_smaller(self):
        self.brush_size = max(1, self.brush_size - 1)
        try:
            import paint
            paint.set_brush_size(self.brush_size)
        except:
            pass
    
    def brush_bigger(self):
        self.brush_size = min(50, self.brush_size + 1)
        try:
            import paint
            paint.set_brush_size(self.brush_size)
        except:
            pass
    
    def set_brush_color(self, color):
        self.brush_color = color
        try:
            import paint
            paint.set_brush_color(self.brush_color)
        except:
            pass
    
    def clear_drawings(self):
        try:
            import paint
            paint.clear_paint_strokes()
        except:
            pass
        self.add_chat_message("Drawings cleared", "System")
    
    def roll_dice(self, dice_expression: str):
        import random
        try:
            result = self._parse_and_roll_dice(dice_expression)
            dice_widget = self._find_widget("dice_result")
            if dice_widget:
                dice_widget.set_text(f"{dice_expression}: {result}")
            self.add_chat_message(f"Rolled {dice_expression}: {result}", "Player")
        except:
            self.add_chat_message(f"Invalid dice: {dice_expression}", "System")
    
    def _parse_and_roll_dice(self, expression: str) -> str:
        import random
        import re
        
        match = re.match(r'(\d+)d(\d+)([+-]\d+)?', expression.lower())
        if not match:
            if expression.lower().startswith('d'):
                sides = int(expression[1:])
                return str(random.randint(1, sides))
            raise ValueError("Invalid")
        
        num_dice = int(match.group(1))
        sides = int(match.group(2))
        modifier = int(match.group(3)) if match.group(3) else 0
        
        rolls = [random.randint(1, sides) for _ in range(num_dice)]
        total = sum(rolls) + modifier
        
        if num_dice == 1:
            return f"{total}" + (f" ({rolls[0]}{modifier:+d})" if modifier != 0 else "")
        else:
            rolls_str = "+".join(map(str, rolls))
            return f"{total} ({rolls_str}{modifier:+d})" if modifier != 0 else f"{total} ({rolls_str})"
    
    def roll_initiative(self):
        if self.current_character:
            roll = self._parse_and_roll_dice("1d20")
            self.add_chat_message(f"{self.current_character.name} initiative: {roll}", "System")
        else:
            self.add_chat_message("No character selected", "System")
    
    def long_rest(self):
        if self.current_character:
            self.add_chat_message(f"{self.current_character.name} takes a long rest", "System")
        else:
            self.add_chat_message("No character selected", "System")
    
    def short_rest(self):
        if self.current_character:
            self.add_chat_message(f"{self.current_character.name} takes a short rest", "System")
        else:
            self.add_chat_message("No character selected", "System")
    
    def start_combat(self):
        self.add_chat_message("Combat started!", "System")
    
    def next_turn(self):
        self.add_chat_message("Next turn", "System")
    
    def end_combat(self):
        self.add_chat_message("Combat ended", "System")
    
    def add_combatant(self):
        self.add_chat_message("Add combatant", "System")
    
    def remove_combatant(self):
        self.add_chat_message("Remove combatant", "System")
    
    def clear_initiative(self):
        self.add_chat_message("Initiative cleared", "System")
    
    def cleanup(self):
        """Cleanup resources."""
        if self.font_manager:
            self.font_manager.cleanup()
        logger.info("Custom SDL GUI cleaned up")

# Global GUI instance
gui_system: Optional[TTRPGGuiSDL] = None

def init_gui_system(context, renderer, width: int = 1920, height: int = 1080):
    """Initialize the custom SDL3 GUI system."""
    global gui_system
    try:
        gui_system = TTRPGGuiSDL(context, renderer, width, height)
        logger.info("Custom SDL3 GUI system initialized")
        return True
    except Exception as e:
        logger.error(f"Failed to initialize GUI system: {e}")
        return False

def handle_gui_events(event) -> bool:
    """Handle GUI events."""
    global gui_system
    if gui_system:
        return gui_system.handle_event(event)
    return False

def update_gui(delta_time: float):
    """Update the GUI."""
    global gui_system
    if gui_system:
        gui_system.update(delta_time)

def render_gui():
    """Render the GUI."""
    global gui_system
    if gui_system:
        gui_system.render()

def add_chat_message(message: str, sender: str = "System"):
    """Add a message to the chat."""
    global gui_system
    if gui_system:
        gui_system.add_chat_message(message, sender)

def set_current_character(character):
    """Set the current character."""
    global gui_system
    if gui_system:
        gui_system.set_current_character(character)

def toggle_gui():
    """Toggle GUI visibility."""
    global gui_system
    if gui_system:
        gui_system.toggle_gui()

def cleanup_gui():
    """Cleanup GUI resources."""
    global gui_system
    if gui_system:
        gui_system.cleanup()
        gui_system = None