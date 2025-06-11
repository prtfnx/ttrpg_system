"""
Simplified 4-sided GUI system for TTRPG application
Replaces complex docking with fixed positioning and clean patterns
Uses modular panel classes for better organization
Features ImGui native resizing capabilities
"""

from imgui_bundle import imgui
from imgui_bundle.python_backends.sdl3_backend import SDL3Renderer
import OpenGL.GL as gl
import sdl3
import ctypes
import logging
import os
import platform
from typing import Dict, Any, Optional, Tuple, List
from dataclasses import dataclass
from enum import Enum

# Import panel classes
from .panels import (
    ToolsPanel,
    ChatPanel,
    EntitiesPanel,
    TablePanel,
    DebugPanel,
    NetworkPanel,
    CompendiumPanel
)

logger = logging.getLogger(__name__)


class GuiPanel(Enum):
    """Available GUI panels"""
    TOOLS = "tools"
    CHAT = "chat"
    ENTITIES = "entities"
    DEBUG = "debug"
    NETWORK = "network"
    COMPENDIUM = "compendium"
    TABLE = "table"


@dataclass
class PanelState:
    """State for a GUI panel"""
    visible: bool = True
    collapsed: bool = False
    width: float = 200.0
    height: float = 200.0


class SimplifiedGui:
    """Simple 4-sided GUI system with fixed positioning and ImGui native resizing"""
    
    def __init__(self, context):
        self.context = context
        self.window = context.window
        self.window_width = 0
        self.window_height = 0
        self.impl = None
        self.io = None
        
        # Panel states
        self.panels: Dict[GuiPanel, PanelState] = {
            panel: PanelState() for panel in GuiPanel
        }
        
        # Layout constants - using ImGui's native resizing
        self.sidebar_width = 250.0
        self.top_height = 80.0
        self.bottom_height = 200.0
        self.panel_spacing = 5
        self.menu_height = 25
        
        # Active panel tracking
        self.active_left_panel = GuiPanel.TOOLS
        self.active_right_panel = GuiPanel.ENTITIES
        self.active_top_panel = GuiPanel.TABLE
        self.active_bottom_panel = GuiPanel.CHAT
        
        # Initialize panel instances
        self.panel_instances = {
            GuiPanel.TOOLS: ToolsPanel(context),
            GuiPanel.CHAT: ChatPanel(context),
            GuiPanel.ENTITIES: EntitiesPanel(context),
            GuiPanel.TABLE: TablePanel(context),
            GuiPanel.DEBUG: DebugPanel(context),
            GuiPanel.NETWORK: NetworkPanel(context),
            GuiPanel.COMPENDIUM: CompendiumPanel(context),
        }
        
        # Initialize state
        self.fps = 0.0
        
        # Initialize ImGui
        try:
            # Create ImGui context
            imgui.create_context()
            self.io = imgui.get_io()
            
            # Load fonts
            self._load_fonts()
            
            # Create SDL3 renderer backend
            self.impl = SDL3Renderer(self.window)
            
            logger.info("Simplified GUI system initialized successfully")
            
        except Exception as e:
            logger.error(f"Simplified GUI init failed: {e}")
            if self.impl:
                try:
                    self.impl.shutdown()
                except:
                    pass
            self.impl = None
            self.io = None
            raise e
    
    def update_window_size(self, width: int, height: int):
        """Update window dimensions for layout calculations"""
        self.window_width = width
        self.window_height = height
        
        # Update layout manager with current panel sizes
        self._update_layout_manager()
    def _update_layout_manager(self):
        """Update the layout manager with current panel dimensions for dynamic viewport"""
        if hasattr(self.context, 'layout_manager'):
            # Get current panel sizes (only if panels are visible)
            left_width = self.sidebar_width if self.panels[self.active_left_panel].visible else 0
            right_width = self.sidebar_width if self.panels[self.active_right_panel].visible else 0
            top_height = self.top_height if self.panels[self.active_top_panel].visible else 0
            bottom_height = self.bottom_height if self.panels[self.active_bottom_panel].visible else 0
            
            # Let layout manager calculate the table area
            table_area = self.context.layout_manager.calculate_table_area_from_panels(
                self.window_width, self.window_height,
                left_width, right_width, top_height, bottom_height, 
                self.menu_height
            )
            
            logger.debug(f"Layout manager calculated table area: {table_area}")
            logger.debug(f"Panel sizes - Left: {left_width}, Right: {right_width}, Top: {top_height}, Bottom: {bottom_height}")

    def render(self):
        """Main render method - called each frame"""
        try:
            # Update window size
            display_size = imgui.get_io().display_size
            self.window_width, self.window_height = display_size.x, display_size.y
            
            # Render main menu bar
            self._render_menu_bar()
            
            # Render the 4-sided layout
            self._render_layout()
            
            # Update layout manager
            self._update_layout_manager()
            
        except Exception as e:
            logger.error(f"GUI render error: {e}")
    
    def _render_menu_bar(self):
        """Render the top menu bar"""
        if imgui.begin_main_menu_bar():
            # File menu
            if imgui.begin_menu("File"):
                if imgui.menu_item("New Campaign", "", False)[0]:
                    self._handle_new_campaign()
                if imgui.menu_item("Load Campaign", "", False)[0]:
                    self._handle_load_campaign()
                if imgui.menu_item("Save Campaign", "", False)[0]:
                    self._handle_save_campaign()
                imgui.separator()
                if imgui.menu_item("Exit", "", False)[0]:
                    self._handle_exit()
                imgui.end_menu()
            
            # View menu
            if imgui.begin_menu("View"):
                for panel in GuiPanel:
                    clicked, state = imgui.menu_item(
                        panel.value.title(), 
                        "",
                        self.panels[panel].visible
                    )
                    if clicked:
                        self.panels[panel].visible = state
                imgui.end_menu()
            
            # Tools menu
            if imgui.begin_menu("Tools"):
                if imgui.menu_item("Dice Roller", "", False)[0]:
                    self._handle_dice_roller()
                if imgui.menu_item("Initiative Tracker", "", False)[0]:
                    self._handle_initiative_tracker()
                if imgui.menu_item("Combat Manager", "", False)[0]:
                    self._handle_combat_manager()
                imgui.end_menu()
            
            # Help menu
            if imgui.begin_menu("Help"):
                if imgui.menu_item("About", "", False)[0]:
                    self._handle_about()
                imgui.end_menu()
            
            imgui.end_main_menu_bar()
    
    def _render_layout(self):
        """Render the 4-sided fixed layout with resizable panels"""
        # Calculate layout dimensions
        content_y = self.menu_height
        content_height = self.window_height - self.menu_height
        
        # Left sidebar - resizable width
        if self.panels[self.active_left_panel].visible:
            self._render_left_sidebar(content_y, content_height)
        
        # Right sidebar - resizable width
        if self.panels[self.active_right_panel].visible:
            self._render_right_sidebar(content_y, content_height)
        
        # Top panel - resizable height
        if self.panels[self.active_top_panel].visible:
            self._render_top_panel()
        
        # Bottom panel - resizable height
        if self.panels[self.active_bottom_panel].visible:
            self._render_bottom_panel()

        # Main content area is handled by layout_manager
        # This area is left for the game table/content

    def _render_left_sidebar(self, content_y, content_height):
        """Render left sidebar with tools - resizable width"""
        imgui.set_next_window_pos((0, content_y))
        imgui.set_next_window_size((self.sidebar_width, content_height))
        
        # Allow horizontal resizing from the right edge
        window_flags = (
            imgui.WindowFlags_.no_move.value |
            imgui.WindowFlags_.no_collapse.value |
            imgui.WindowFlags_.no_title_bar.value
        )
          # Create resizable window
        if imgui.begin("Left Panel", None, window_flags):
            # Check if window was resized
            current_width = imgui.get_window_width()
            if abs(current_width - self.sidebar_width) > 1.0:
                old_width = self.sidebar_width
                self.sidebar_width = max(150.0, min(400.0, current_width))
                # Update layout manager when sidebar is resized
                if abs(old_width - self.sidebar_width) > 1.0:
                    self._update_layout_manager()
            
            # Render active panel
            if self.active_left_panel in self.panel_instances:
                self.panel_instances[self.active_left_panel].render()
        
        imgui.end()
        
    def _render_right_sidebar(self, content_y, content_height):
        """Render right sidebar with tabs - resizable width"""
        x_pos = self.window_width - self.sidebar_width
        imgui.set_next_window_pos((x_pos, content_y))
        imgui.set_next_window_size((self.sidebar_width, content_height))
        
        # Allow horizontal resizing from the left edge
        window_flags = (
            imgui.WindowFlags_.no_move.value |
            imgui.WindowFlags_.no_collapse.value |
            imgui.WindowFlags_.no_title_bar.value
        )
          # Create resizable window
        if imgui.begin("Right Panel", None, window_flags):
            # Check if window was resized
            current_width = imgui.get_window_width()
            if abs(current_width - self.sidebar_width) > 1.0:
                old_width = self.sidebar_width
                self.sidebar_width = max(150.0, min(400.0, current_width))
                # Update layout manager when sidebar is resized
                if abs(old_width - self.sidebar_width) > 1.0:
                    self._update_layout_manager()
            
            # Panel tabs
            if imgui.begin_tab_bar("RightTabs"):
                for panel_type in [GuiPanel.CHAT, GuiPanel.ENTITIES, GuiPanel.DEBUG, 
                                 GuiPanel.NETWORK, GuiPanel.COMPENDIUM]:
                    panel_name = panel_type.value.title()
                    if imgui.begin_tab_item(panel_name)[0]:
                        if panel_type in self.panel_instances:
                            self.panel_instances[panel_type].render()
                        imgui.end_tab_item()
                
                imgui.end_tab_bar()
        
        imgui.end()

    def _render_top_panel(self):
        """Render top panel - resizable height"""
        # Calculate position and size based on visible sidebars
        left_offset = self.sidebar_width if self.panels[self.active_left_panel].visible else 0
        right_offset = self.sidebar_width if self.panels[self.active_right_panel].visible else 0
        panel_width = self.window_width - left_offset - right_offset
        
        imgui.set_next_window_pos((left_offset, self.menu_height))
        imgui.set_next_window_size((panel_width, self.top_height))
        
        # Allow vertical resizing from the bottom edge
        window_flags = (
            imgui.WindowFlags_.no_move.value |
            imgui.WindowFlags_.no_collapse.value |
            imgui.WindowFlags_.no_title_bar.value
        )
          # Create resizable window
        if imgui.begin("Top Panel", None, window_flags):
            # Check if window was resized
            current_height = imgui.get_window_height()
            if abs(current_height - self.top_height) > 1.0:
                old_height = self.top_height
                self.top_height = max(50.0, min(300.0, current_height))
                # Update layout manager when top panel is resized
                if abs(old_height - self.top_height) > 1.0:
                    self._update_layout_manager()
            
            # Render active panel
            if self.active_top_panel in self.panel_instances:
                self.panel_instances[self.active_top_panel].render()
        
        imgui.end()

    def _render_bottom_panel(self):
        """Render bottom panel - resizable height"""
        # Calculate position and size based on visible sidebars
        left_offset = self.sidebar_width if self.panels[self.active_left_panel].visible else 0
        right_offset = self.sidebar_width if self.panels[self.active_right_panel].visible else 0
        panel_width = self.window_width - left_offset - right_offset
        bottom_y = self.window_height - self.bottom_height
        
        imgui.set_next_window_pos((left_offset, bottom_y))
        imgui.set_next_window_size((panel_width, self.bottom_height))
        
        # Allow vertical resizing from the top edge
        window_flags = (
            imgui.WindowFlags_.no_move.value |
            imgui.WindowFlags_.no_collapse.value |
            imgui.WindowFlags_.no_title_bar.value
        )
          # Create resizable window
        if imgui.begin("Bottom Panel", None, window_flags):
            # Check if window was resized
            current_height = imgui.get_window_height()
            if abs(current_height - self.bottom_height) > 1.0:
                old_height = self.bottom_height
                self.bottom_height = max(50.0, min(400.0, current_height))
                # Update layout manager when bottom panel is resized
                if abs(old_height - self.bottom_height) > 1.0:
                    self._update_layout_manager()
            
            # Render active panel
            if self.active_bottom_panel in self.panel_instances:
                self.panel_instances[self.active_bottom_panel].render()
        
        imgui.end()

    # Event handlers
    def _handle_new_campaign(self):
        """Handle new campaign creation"""
        logger.info("New campaign requested")
    
    def _handle_load_campaign(self):
        """Handle campaign loading"""
        logger.info("Load campaign requested")
    
    def _handle_save_campaign(self):
        """Handle campaign saving"""
        logger.info("Save campaign requested")
    
    def _handle_exit(self):
        """Handle application exit"""
        logger.info("Exit requested")
        if hasattr(self.context, 'quit'):
            self.context.quit()
    
    def _handle_dice_roller(self):
        """Handle dice roller tool"""
        logger.info("Dice roller opened")
    
    def _handle_initiative_tracker(self):
        """Handle initiative tracker tool"""
        logger.info("Initiative tracker opened")
    
    def _handle_combat_manager(self):
        """Handle combat manager tool"""
        logger.info("Combat manager opened")
    
    def _handle_about(self):
        """Handle about dialog"""
        logger.info("About dialog requested")
    
    def _load_fonts(self):
        """Load fonts with Unicode support"""
        try:
            # Get font atlas - only if io is properly initialized
            if not self.io:
                logger.warning("ImGui IO not initialized, skipping font loading")
                return
                
            font_atlas = self.io.fonts
            
            # Try to load a system font with Unicode support
            system = platform.system()
            
            font_paths = []
            if system == "Windows":
                font_paths = [
                    "C:/Windows/Fonts/arial.ttf",
                    "C:/Windows/Fonts/segoeui.ttf",
                    "C:/Windows/Fonts/calibri.ttf"
                ]
            elif system == "Darwin":  # macOS
                font_paths = [
                    "/System/Library/Fonts/Arial.ttf",
                    "/System/Library/Fonts/Helvetica.ttc"
                ]
            else:  # Linux
                font_paths = [
                    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
                    "/usr/share/fonts/TTF/arial.ttf"
                ]
            
            # Try to load a font
            font_loaded = False
            for font_path in font_paths:
                if os.path.exists(font_path):
                    try:
                        font_atlas.add_font_from_file_ttf(font_path, 16.0)
                        font_loaded = True
                        logger.info(f"Loaded font: {font_path}")
                        break
                    except Exception as e:
                        logger.warning(f"Failed to load font {font_path}: {e}")
                        continue
            
            if not font_loaded:
                # Fallback to default font
                font_atlas.add_font_default()
                logger.info("Using default ImGui font")
            
            # Build font atlas
            font_atlas.build()
            
        except Exception as e:
            logger.error(f"Error loading fonts: {e}")
            # Use default font as fallback
            if self.io and hasattr(self.io, 'fonts'):
                self.io.fonts.add_font_default()

    def process_event(self, event):
        """Process SDL events for ImGui and pass through to SDL if needed"""
        if not self.impl:
            return False
        
        try:
            # Let ImGui process the event first
            imgui_wants_event = self.impl.process_event(event)
            
            # Check if ImGui wants to capture the event
            if self.io:
                wants_capture_mouse = self.io.want_capture_mouse
                wants_capture_keyboard = self.io.want_capture_keyboard
                
                # For mouse events, only let ImGui capture if it's over a window
                if event.type in [sdl3.SDL_EVENT_MOUSE_BUTTON_DOWN, sdl3.SDL_EVENT_MOUSE_BUTTON_UP, 
                                sdl3.SDL_EVENT_MOUSE_MOTION, sdl3.SDL_EVENT_MOUSE_WHEEL]:
                    # If ImGui doesn't want the mouse event, let SDL handle it
                    if not wants_capture_mouse:
                        return False  # Let SDL process the event
                        
                # For keyboard events
                elif event.type in [sdl3.SDL_EVENT_KEY_DOWN, sdl3.SDL_EVENT_KEY_UP, sdl3.SDL_EVENT_TEXT_INPUT]:
                    # If ImGui doesn't want the keyboard event, let SDL handle it
                    if not wants_capture_keyboard:
                        return False  # Let SDL process the event
            
            return imgui_wants_event
            
        except Exception as e:
            logger.error(f"ImGui process_event error: {e}")
            return False
    
    def iterate(self):
        """Run the ImGui frame with resizable layout"""
        if not self.impl or not self.io:
            return
            
        try:
            # Process inputs
            self.impl.process_inputs()
            
            # Start new frame
            imgui.new_frame()
            
            # Get window size using ImGui's display size (more reliable)
            display_size = imgui.get_io().display_size
            self.window_width = display_size.x
            self.window_height = display_size.y
            
            # Render the simplified GUI layout
            self._render_layout()
            
            # Update FPS
            self.fps = self.io.framerate
            
            # Render - this must be called before render()
            imgui.render()
            
            # Enable blending
            gl.glEnable(gl.GL_BLEND)
            gl.glBlendFunc(gl.GL_SRC_ALPHA, gl.GL_ONE_MINUS_SRC_ALPHA)
            
            # Render ImGui
            self.impl.render(imgui.get_draw_data())
            
            # End frame - this ensures proper frame lifecycle
            imgui.end_frame()
            
        except Exception as e:
            logger.error(f"ImGui iterate error: {e}")
            # Emergency cleanup - ensure we end the frame even on error
            try:
                imgui.end_frame()
            except:
                pass


# Factory function for backward compatibility
def create_gui(context) -> SimplifiedGui:
    """Create and return a SimplifiedGui instance"""
    return SimplifiedGui(context)


# Legacy compatibility functions
def render_gui(gui: SimplifiedGui):
    """Render the GUI (legacy compatibility)"""
    gui.render()


def handle_gui_event(gui: SimplifiedGui, event):
    """Handle GUI events (legacy compatibility)"""
    # Events are handled internally by imgui
    pass


def cleanup_gui(gui: SimplifiedGui):
    """Clean up GUI resources (legacy compatibility)"""
    logger.info("GUI cleanup requested")
