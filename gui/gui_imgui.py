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

import os
import platform
import time
from typing import Dict, Any, Optional, Tuple, List
from dataclasses import dataclass
from enum import Enum
import context_menu
# Import panel classes
from .panels import (
    ToolsPanel,
    ChatPanel,
    EntitiesPanel,
    TablePanel,
    DebugPanel,
    NetworkPanel,
    CompendiumPanel,
    LayerPanel,
    StoragePanel,
    CharacterSheetPanel,
    JournalPanel,
)    

# Import external windows
from .windows.settings_window import SettingsWindow
from .windows.character_creator import CharacterCreator

# Import GUI actions bridge
from .gui_actions_bridge import GuiActionsBridge

from logger import setup_logger
logger = setup_logger(__name__)


class GuiPanel(Enum):
    """Available GUI panels"""
    TOOLS = "tools"
    CHAT = "chat"
    ENTITIES = "entities"
    DEBUG = "debug"
    NETWORK = "network"
    COMPENDIUM = "compendium"
    TABLE = "table"
    LAYERS = "layers"
    STORAGE = "storage"
    CHARACTER_SHEET = "character_sheet"
    JOURNAL = "journal"
    


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
        
        # Initialize GUI actions bridge
        self.actions_bridge = GuiActionsBridge(context)
        
        # Initialize user mode based on context settings
        self.actions_bridge.initialize_user_mode()
        
        # Panel states
        self.panels: Dict[GuiPanel, PanelState] = {
            panel: PanelState() for panel in GuiPanel
        }        # Layout constants - using ImGui's native resizing
        self.left_sidebar_width = 200.0   # Smaller for tools
        self.right_sidebar_width = 350.0  # Larger for character sheet
        self.top_height = 140.0  # Increased for TablePanel content
        self.bottom_height = 200.0
        self.panel_spacing = 5
        self.menu_height = 0  # No menu bar anymore# Active panel tracking
        self.active_left_panel = GuiPanel.TOOLS
        self.active_right_panel = GuiPanel.CHARACTER_SHEET
        self.active_top_panel = GuiPanel.TABLE
        self.active_bottom_panel = GuiPanel.CHAT        # Initialize panel instances with actions bridge
        self.panel_instances = {
            GuiPanel.TOOLS: ToolsPanel(context, self.actions_bridge),
            GuiPanel.CHAT: ChatPanel(context, self.actions_bridge),
            GuiPanel.ENTITIES: EntitiesPanel(context, self.actions_bridge),
            GuiPanel.TABLE: TablePanel(context, self.actions_bridge),
            GuiPanel.DEBUG: DebugPanel(context, self.actions_bridge),
            GuiPanel.NETWORK: NetworkPanel(context, self.actions_bridge),
            GuiPanel.COMPENDIUM: CompendiumPanel(context, self.actions_bridge),
            GuiPanel.LAYERS: LayerPanel(context, self.actions_bridge),
            GuiPanel.STORAGE: StoragePanel(context, self.actions_bridge),
            GuiPanel.CHARACTER_SHEET: CharacterSheetPanel(context, self.actions_bridge),
            GuiPanel.JOURNAL: JournalPanel(context, self.actions_bridge),
        }
        
        # Expose character sheet panel for cross-panel communication
        self.context.character_sheet_panel = self.panel_instances[GuiPanel.CHARACTER_SHEET]
        
        # Expose journal panel for cross-panel communication
        self.context.journal_panel = self.panel_instances[GuiPanel.JOURNAL]
        
        # Initialize external windows
        self.external_windows = []
        self.settings_window = SettingsWindow(context)
        logger.info(f"Settings window initialized {self.settings_window}")
        self.external_windows.append(self.settings_window)
        
        # Initialize character creator window        
        self.character_creator = CharacterCreator(context, self.actions_bridge)
        self.external_windows.append(self.character_creator)
        
        # Expose character creator to context for cross-panel access
        self.context.character_creator = self.character_creator        

        
        # Initialize state
        self.fps = 0.0          # Initialize ImGui
        try:
            # Create ImGui context
            imgui.create_context()
            self.io = imgui.get_io()
              # Enable only docking (viewports disabled for stability)
            self.io.config_flags |= imgui.ConfigFlags_.docking_enable.value
            
            # Log configuration status
            logger.info(f"ImGui docking enabled: {bool(self.io.config_flags & imgui.ConfigFlags_.docking_enable.value)}")
            logger.info("ImGui viewports disabled for improved stability")
            
            # Load fonts
            self._load_fonts()
            
            # Create SDL3 renderer backend
            self.impl = SDL3Renderer(self.window)
            
            # Initialize context menu system
            try:
                
                context_menu.init_context_menu(context, self.actions_bridge)
                logger.info("Context menu system initialized")
            except Exception as e:
                logger.warning(f"Failed to initialize context menu: {e}")
            
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
        """Update the layout manager with current panel dimensions"""
        if hasattr(self.context, 'layout_manager'):
            # Get current panel sizes (only if panels are visible)
            left_width = self.left_sidebar_width if self.panels[self.active_left_panel].visible else 0
            right_width = self.right_sidebar_width if self.panels[self.active_right_panel].visible else 0
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
            
            # No menu bar - just render the layout directly
            # Render the 4-sided layout
            self._render_layout()
            
            # Update layout manager
            self._update_layout_manager()
            
            # Render context menu
            try:
                
                context_menu.render_context_menu()
            except Exception as e:
                logger.error(f"Context menu render error: {e}")
            
            # Render external windows AFTER all panels (so they appear on top)
            self._render_external_windows()
            
        except Exception as e:
            logger.error(f"GUI render error: {e}")  

    def _render_external_windows(self):
        """Render external windows (e.g. dialogs, popups)"""
        windows_to_remove = []
        for window in self.external_windows:
            if hasattr(window, 'render') and callable(window.render):
                # Check if window should be closed (for character sheet windows)
                if hasattr(window, 'show_full_window') and not window.show_full_window:
                    windows_to_remove.append(window)
                else:
                    window.render()
        
        # Remove closed windows from the external_windows list
        for window in windows_to_remove:
            self.external_windows.remove(window)
            logger.debug(f"Removed closed window from external_windows: {type(window).__name__}")
   

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
        imgui.set_next_window_size((self.left_sidebar_width, content_height))
        
        window_flags = (
            imgui.WindowFlags_.no_move.value |
            imgui.WindowFlags_.no_collapse.value |
            imgui.WindowFlags_.no_title_bar.value
        )
        
        if imgui.begin("Left Panel", None, window_flags):
            # Check if window was resized
            current_width = imgui.get_window_width()
            if abs(current_width - self.left_sidebar_width) > 1.0:
                old_width = self.left_sidebar_width
                self.left_sidebar_width = max(150.0, min(300.0, current_width))  # Smaller max for tools
                if abs(old_width - self.left_sidebar_width) > 1.0:
                    self._update_layout_manager()
            
            # Split left panel: Tools on top, Layers on bottom
            available_height = imgui.get_content_region_avail()[1]
            
            # Tools section (top 70%)
            imgui.begin_child("ToolsSection", (0, available_height * 0.7))
            if GuiPanel.TOOLS in self.panel_instances:
                self.panel_instances[GuiPanel.TOOLS].render()
            imgui.end_child()
            
            imgui.separator()
            
            # Layers section (bottom 30%)
            if self.actions_bridge.can_access_panel(GuiPanel.LAYERS.value):
                imgui.begin_child("LayersSection", (0, available_height * 0.3))
                if GuiPanel.LAYERS in self.panel_instances:
                    self.panel_instances[GuiPanel.LAYERS].render()
                imgui.end_child()
        
        imgui.end()
    
    def _render_right_sidebar(self, content_y, content_height):
        """Render right sidebar with tabs - resizable width"""
        x_pos = self.window_width - self.right_sidebar_width
        imgui.set_next_window_pos((x_pos, content_y))
        imgui.set_next_window_size((self.right_sidebar_width, content_height))
        
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
            if abs(current_width - self.right_sidebar_width) > 1.0:
                old_width = self.right_sidebar_width
                self.right_sidebar_width = max(250.0, min(600.0, current_width))  # Larger for character sheet
                # Update layout manager when sidebar is resized
                if abs(old_width - self.right_sidebar_width) > 1.0:
                    self._update_layout_manager()
            
            # Panel tabs - filter based on user mode
            #TODO make proper logic for role, for now mockup
            available_panels = []
            for panel_type in [GuiPanel.CHAT, GuiPanel.ENTITIES, GuiPanel.DEBUG, 
                             GuiPanel.NETWORK, GuiPanel.COMPENDIUM, GuiPanel.STORAGE,
                             GuiPanel.CHARACTER_SHEET, GuiPanel.JOURNAL]:
                panel_name = panel_type.value
                if self.actions_bridge.can_access_panel(panel_name):
                    available_panels.append(panel_type)
            
            if imgui.begin_tab_bar("RightTabs"):                
                for panel_type in available_panels:                    
                    panel_name = panel_type.value.replace('_', ' ').title()
                    # begin_tab_item returns a tuple (visible, open) - we need the first value
                    tab_result = imgui.begin_tab_item(panel_name)
                    tab_visible = tab_result[0] 
                    
                    if tab_visible:
                        if panel_type in self.panel_instances:
                            self.panel_instances[panel_type].render()
                        imgui.end_tab_item()
                
                imgui.end_tab_bar()
        
        imgui.end()
    
    def _render_top_panel(self):
        """Render top panel - resizable height"""
        # Calculate position and size based on visible sidebars
        left_offset = self.left_sidebar_width if self.panels[self.active_left_panel].visible else 0
        right_offset = self.right_sidebar_width if self.panels[self.active_right_panel].visible else 0
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
        """Render bottom panel - resizable height"""        # Calculate position and size based on visible sidebars
        left_offset = self.left_sidebar_width if self.panels[self.active_left_panel].visible else 0
        right_offset = self.right_sidebar_width if self.panels[self.active_right_panel].visible else 0
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
            
            # Render the complete GUI (including menu bar)
            self.render()
            
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
            # Rate limit error messages to prevent flooding
            current_time = time.time()
            if not hasattr(self, '_last_error_time'):
                self._last_error_time = 0
                self._error_count = 0
                
            time_since_last_error = current_time - self._last_error_time
            
            # Only log every 5 seconds when flooding occurs
            if time_since_last_error > 5.0 or self._error_count < 3:
                logger.error(f"ImGui iterate error: {e}")
                if self._error_count >= 3:
                    logger.error("ImGui error rate limited - suppressing further messages for 5 seconds")
                self._last_error_time = current_time
                self._error_count += 1
            
            # Emergency cleanup - ensure we end the frame even on error
            try:
                imgui.end_frame()
            except:
                pass
            
            # If we're getting too many errors, try emergency recovery
            if self._error_count > 10:
                logger.error("Too many ImGui errors - attempting emergency recovery")
                self._emergency_recovery()


    def _emergency_recovery(self):
        """Emergency recovery when ImGui gets into a bad state"""
        try:
            logger.error("Performing emergency ImGui recovery...")
            
            # Force close any open windows that might be causing issues
            if hasattr(self, 'panel_instances'):
                for panel_type, panel in self.panel_instances.items():
                    if hasattr(panel, 'show_full_window'):
                        panel.show_full_window = False
                    if hasattr(panel, '_window_error_occurred'):
                        panel._window_error_occurred = True
                        
            # Reset error count after recovery attempt
            self._error_count = 0
            self._last_error_time = time.time()
            
            logger.error("Emergency recovery completed - closed all secondary windows")
            
        except Exception as recovery_error:
            logger.error(f"Emergency recovery failed: {recovery_error}")


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
