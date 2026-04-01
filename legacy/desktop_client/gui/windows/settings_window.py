"""
Settings Panel for TTRPG System
Provides a GUI interface to edit settings.py configurations
"""

import os
import json
import importlib
from typing import Dict, Any, List
from logger import setup_logger
from imgui_bundle import imgui
import settings
logger = setup_logger(__name__)

class SettingsWindow:
    """Window for editing application settings"""
    
    def __init__(self, context):
        self.context = context
        self.show = False
        self.settings_data = {}
        self.original_values = {}
        self.dirty = False
        self.error_message = ""
        self.success_message = ""
        
        # Dialog states
        self.show_cancel_confirmation = False
        
        # Categories for organization
        self.categories = {
            "Application": ["APP_NAME", "APP_VERSION", "DEBUG_MODE"],
            "Storage": ["DEFAULT_STORAGE_PATH", "MAX_CACHE_SIZE_MB", "AUTO_CLEANUP_CACHE"],
            "Network": ["DEFAULT_SERVER_PORT", "WEBSOCKET_PORT"],
            "GUI": ["WINDOW_WIDTH", "WINDOW_HEIGHT", "FPS_TARGET", "VSYNC_ENABLED"],
            "Rendering": ["MAX_SPRITES", "TILE_SIZE", "MAP_WIDTH", "MAP_HEIGHT"],
            "Performance": ["ASYNC_POOL_SIZE", "MAX_CONCURRENT_UPLOADS", "MAX_CONCURRENT_DOWNLOADS"],
            "Cache": ["MAX_ASSET_CACHE_SIZE_MB", "MAX_TEXTURE_CACHE_SIZE_MB", "CACHE_CLEANUP_AGE_DAYS"],
            "Files": ["MAX_FILE_SIZE_MB"],
            "Logging": ["LOG_LEVEL", "LOG_FORMAT"]
        }
        
        self.selected_category = "Application"
        self.load_settings()
        
    def load_settings(self):
        """Load current settings from settings.py"""
        try:
            
            importlib.reload(settings)  # Reload to get fresh values
            
            self.settings_data = {}
            self.original_values = {}
            
            # Load all settings from all categories
            for category, setting_names in self.categories.items():
                for setting_name in setting_names:
                    if hasattr(settings, setting_name):
                        value = getattr(settings, setting_name)
                        self.settings_data[setting_name] = value
                        self.original_values[setting_name] = value
                        
            self.dirty = False
            self.error_message = ""
            logger.info("Settings loaded successfully")
            
        except Exception as e:
            self.error_message = f"Error loading settings: {str(e)}"
            logger.error(f"Error loading settings: {e}")
    
    def save_settings(self):
        """Save modified settings back to settings.py"""
        try:
            settings_file_path = os.path.join(os.path.dirname(__file__), '..', '..', 'settings.py')
            settings_file_path = os.path.abspath(settings_file_path)
            
            # Read the current file
            with open(settings_file_path, 'r', encoding='utf-8') as f:
                lines = f.readlines()
            
            # Update the lines with new values
            for i, line in enumerate(lines):
                line_stripped = line.strip()
                if '=' in line_stripped and not line_stripped.startswith('#'):
                    # Extract variable name
                    var_name = line_stripped.split('=')[0].strip()
                    
                    if var_name in self.settings_data:
                        new_value = self.settings_data[var_name]
                        
                        # Format the new value properly
                        if isinstance(new_value, str):
                            if not new_value.startswith('"') and not new_value.startswith("'"):
                                formatted_value = f'"{new_value}"'
                            else:
                                formatted_value = new_value
                        elif isinstance(new_value, bool):
                            formatted_value = str(new_value)
                        else:
                            formatted_value = str(new_value)
                        
                        # Reconstruct the line
                        lines[i] = f"{var_name} = {formatted_value}\n"
            
            # Write back to file
            with open(settings_file_path, 'w', encoding='utf-8') as f:
                f.writelines(lines)
            
            # Update original values
            self.original_values = self.settings_data.copy()
            self.dirty = False
            self.success_message = "Settings saved successfully!"
            self.error_message = ""
            
            logger.info("Settings saved successfully")
            
        except Exception as e:
            self.error_message = f"Error saving settings: {str(e)}"
            logger.error(f"Error saving settings: {e}")
    
    def reset_settings(self):
        """Reset settings to original values"""
        self.settings_data = self.original_values.copy()
        self.dirty = False
        self.success_message = "Settings reset to original values"
        self.error_message = ""
    
    def open(self):
        """Open the settings window"""
        self.show = True
        self.show_cancel_confirmation = False  # Reset dialog state
        self.load_settings()  # Refresh settings when opening
        
    def close(self):
        """Close the settings window"""
        self.show = False
        self.show_cancel_confirmation = False  # Reset dialog state
        self.success_message = ""
        self.error_message = ""
    
    def render(self):
        """Render the settings window"""
        
        if not self.show:
            return         
        imgui.set_next_window_size((800, 600), imgui.Cond_.first_use_ever.value)
        
        opened = imgui.begin("Settings", True)
        if not opened[1]:  # Window was closed
            self.close()
            imgui.end()
            return
            
        try:
            # Left panel - Categories (also needs to reserve space for buttons)
            imgui.begin_child("Categories", (200, -100), True)
            for category in self.categories.keys():
                clicked, selected = imgui.selectable(category, self.selected_category == category)
                if clicked:
                    self.selected_category = category
            imgui.end_child()
            
            imgui.same_line()
            
            # Right panel - Settings for selected category  
            # Use fixed height for settings area to ensure buttons are always visible
            # This leaves exactly 100px at the bottom for buttons
            imgui.begin_child("Settings", (0, -100), True)
            imgui.text(f"Settings - {self.selected_category}")
            imgui.separator()
            
            if self.selected_category in self.categories:
                for setting_name in self.categories[self.selected_category]:
                    if setting_name in self.settings_data:
                        self._render_setting_control(setting_name)
                        
            imgui.end_child()
            
            # Bottom panel - Buttons and messages
            imgui.separator()
            
            # Add some spacing
            imgui.spacing()
            
            # Messages (full width)
            if self.error_message:
                imgui.text_colored((1.0, 0.2, 0.2, 1.0), self.error_message)
                imgui.spacing()
            elif self.success_message:
                imgui.text_colored((0.2, 1.0, 0.2, 1.0), self.success_message)
                imgui.spacing()
            
            # Show dirty indicator
            if self.dirty:
                imgui.text_colored((1.0, 1.0, 0.2, 1.0), "* Unsaved changes")
                imgui.spacing()
            
            # Button area - right-aligned with Save first, then Cancel
            available_width = imgui.get_content_region_avail()[0]
            button_width = 100  # Bigger buttons
            button_spacing = 8  # imgui default spacing
            button_gap = 16  # Extra space between Save and Cancel
            
            # Additional utility buttons (Reset + Reload) on the left
            if imgui.button("Reset", (button_width, 0)):
                self.reset_settings()
            
            imgui.same_line()
            if imgui.button("Reload", (button_width, 0)):
                self.load_settings()
            
            # Push primary buttons to the right
            imgui.same_line()
            # Calculate space needed: 2 utility buttons + 2 primary buttons + spacing + gap
            total_buttons_width = (button_width * 4) + (button_spacing * 3) + button_gap
            remaining_width = available_width - total_buttons_width
            if remaining_width > 0:
                imgui.dummy((remaining_width, 0))
                imgui.same_line()
            
            # Primary buttons - Save first, then Cancel with extra spacing
            # Make Save button highlighted (primary button style)
            imgui.push_style_color(imgui.Col_.button.value, imgui.ImVec4(0.2, 0.6, 0.2, 1.0))  # Green tint
            if imgui.button("Save", (button_width, 0)):
                self.save_settings()
            imgui.pop_style_color()
            
            imgui.same_line()
            imgui.dummy((button_gap, 0))  # Extra space between Save and Cancel
            imgui.same_line()
            
            if imgui.button("Cancel", (button_width, 0)):
                if self.dirty:
                    self.show_cancel_confirmation = True
                else:
                    self.close()
                
        except Exception as e:
            logger.error(f"Error rendering settings panel: {e}")
            
        imgui.end()
        
        # Render cancel confirmation dialog
        self._render_cancel_confirmation()
    
    def _render_setting_control(self, setting_name: str):
        """Render a control for a specific setting"""
        try:
            current_value = self.settings_data[setting_name]
            original_value = current_value
            
            # Calculate proper spacing based on longest setting name
            label_width = 250  # Fixed width for labels to prevent overlap
            
            imgui.text(setting_name)
            imgui.same_line(label_width)  # Use fixed width instead of 200
            
            # Set a consistent width for input controls
            imgui.set_next_item_width(200)
            
            # Determine control type based on value type
            if isinstance(current_value, bool):
                changed, new_value = imgui.checkbox(f"##{setting_name}", current_value)
                if changed:
                    self.settings_data[setting_name] = new_value
                    self.dirty = True
                    
            elif isinstance(current_value, int):
                changed, new_value = imgui.input_int(f"##{setting_name}", current_value)
                if changed:
                    self.settings_data[setting_name] = new_value
                    self.dirty = True
                    
            elif isinstance(current_value, float):
                changed, new_value = imgui.input_float(f"##{setting_name}", current_value)
                if changed:
                    self.settings_data[setting_name] = new_value
                    self.dirty = True
                    
            elif isinstance(current_value, str):
                # Special handling for certain string settings
                if setting_name == "LOG_LEVEL":
                    # Dropdown for log level
                    log_levels = ["DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"]
                    current_index = log_levels.index(current_value) if current_value in log_levels else 1
                    changed, new_index = imgui.combo(f"##{setting_name}", current_index, log_levels)
                    if changed:
                        self.settings_data[setting_name] = log_levels[new_index]
                        self.dirty = True
                else:
                    # Regular text input
                    changed, new_value = imgui.input_text(f"##{setting_name}", current_value, 256)
                    if changed:
                        self.settings_data[setting_name] = new_value
                        self.dirty = True
            
            # Show help text for certain settings
            if setting_name in ["DEFAULT_STORAGE_PATH", "MAX_CACHE_SIZE_MB", "FPS_TARGET"]:
                imgui.same_line()
                imgui.text_disabled("(?)")
                if imgui.is_item_hovered():
                    imgui.set_tooltip(self._get_setting_help(setting_name))
            
            # Add spacing between settings
            imgui.spacing()
                    
        except Exception as e:
            logger.error(f"Error rendering control for {setting_name}: {e}")
    
    def _get_setting_help(self, setting_name: str) -> str:
        """Get help text for a setting"""
        help_texts = {
            "DEFAULT_STORAGE_PATH": "Path where game assets and saves are stored",
            "MAX_CACHE_SIZE_MB": "Maximum cache size in megabytes",
            "FPS_TARGET": "Target frames per second for rendering",
            "WINDOW_WIDTH": "Default window width in pixels",
            "WINDOW_HEIGHT": "Default window height in pixels",
            "MAX_SPRITES": "Maximum number of sprites that can be rendered",
            "TILE_SIZE": "Size of map tiles in pixels",
            "ASYNC_POOL_SIZE": "Number of async worker threads",
            "LOG_LEVEL": "Logging verbosity level"
        }
        return help_texts.get(setting_name, "No help available")
    
    def _render_cancel_confirmation(self):
        """Render confirmation dialog for cancel with unsaved changes"""
        if self.show_cancel_confirmation:
            imgui.open_popup("Unsaved Changes")
            
        # Center the popup
        viewport = imgui.get_main_viewport()
        center_x = viewport.work_pos.x + viewport.work_size.x * 0.5
        center_y = viewport.work_pos.y + viewport.work_size.y * 0.5
        imgui.set_next_window_pos((center_x, center_y), imgui.Cond_.appearing.value, (0.5, 0.5))
        
        # Check if popup modal is open
        popup_opened, popup_should_close = imgui.begin_popup_modal("Unsaved Changes", True, imgui.WindowFlags_.always_auto_resize.value)
        if popup_opened:
            imgui.text("You have unsaved changes.")
            imgui.text("What would you like to do?")
            imgui.separator()
            
            if imgui.button("Save and Close"):
                self.save_settings()
                if not self.error_message:  # Only close if save was successful
                    self.show_cancel_confirmation = False
                    self.close()
                imgui.close_current_popup()
            
            imgui.same_line()
            if imgui.button("Discard Changes"):
                self.reset_settings()
                self.show_cancel_confirmation = False
                self.close()
                imgui.close_current_popup()
            
            imgui.same_line()
            if imgui.button("Continue Editing"):
                self.show_cancel_confirmation = False
                imgui.close_current_popup()
            
            # Handle X button or ESC key
            if not popup_should_close:
                self.show_cancel_confirmation = False
            
            imgui.end_popup()
