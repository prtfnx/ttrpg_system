"""
Context Menu System for TTRPG Application
Provides right-click context menus for sprites using ImGui
"""

from imgui_bundle import imgui
from typing import Optional, Dict, Any, List, Callable
from logger import setup_logger
from core_table.actions_protocol import LAYERS
from event_sys import handle_rotate
import clipboard_sys
logger = setup_logger(__name__)

class ContextMenu:
    """Context menu system for sprite operations"""
    
    def __init__(self, context, actions):
        self.context = context
        self.actions = actions
        self.show_menu = False
        self.menu_pos_x = 0
        self.menu_pos_y = 0
        self.target_sprite = None
        self.target_table = None
        
        # Menu state
        self.show_layer_submenu = False
        self.menu_opened_this_frame = False  # Track if menu was just opened
        
    def open_sprite_menu(self, sprite, table, mouse_x: float, mouse_y: float):
        """Open context menu for a sprite at specified position"""
        self.show_menu = True
        self.menu_pos_x = mouse_x
        self.menu_pos_y = mouse_y
        self.target_sprite = sprite
        self.target_table = table
        self.show_layer_submenu = False
        self.menu_opened_this_frame = True  # Mark as just opened
        logger.debug(f"Opened context menu for sprite {getattr(sprite, 'sprite_id', 'unknown')} at ({mouse_x}, {mouse_y})")
    
    def close_menu(self):
        """Close the context menu"""
        self.show_menu = False
        self.show_layer_submenu = False
        self.target_sprite = None
        self.target_table = None
    
    def render(self):
        """Render the context menu if it should be shown"""
        if not self.show_menu or not self.target_sprite:
            return
            
        # Set next window position to mouse position (only when first appearing)
        imgui.set_next_window_pos((self.menu_pos_x, self.menu_pos_y), imgui.Cond_.appearing.value)
        
        # Create popup window with proper flags for persistence
        imgui.push_style_var(imgui.StyleVar_.window_padding.value, (8, 8))
        imgui.push_style_var(imgui.StyleVar_.item_spacing.value, (8, 4))
        
        window_flags = (
            imgui.WindowFlags_.no_title_bar.value |
            imgui.WindowFlags_.no_resize.value |
            imgui.WindowFlags_.no_move.value |
            imgui.WindowFlags_.no_scrollbar.value |
            imgui.WindowFlags_.no_scroll_with_mouse.value |
            imgui.WindowFlags_.always_auto_resize.value |
            imgui.WindowFlags_.no_focus_on_appearing.value
        )
        
        # Use popup pattern for better control
        if self.menu_opened_this_frame:
            imgui.open_popup("Context Menu##sprite_context")
            self.menu_opened_this_frame = False
        
        # Use popup window instead of regular window
        if imgui.begin_popup("Context Menu##sprite_context"):
            self._render_menu_items()
            imgui.end_popup()
        else:
            # Popup was closed, close our menu
            self.close_menu()
        
        imgui.pop_style_var(2)
    
    def _render_menu_items(self):
        """Render the context menu items"""
        sprite = self.target_sprite
        table = self.target_table
        
        if not sprite or not table:
            return
            
        # Get sprite info
        sprite_name = getattr(sprite, 'name', f'Sprite {getattr(sprite, "sprite_id", "unknown")}')
        current_layer = getattr(sprite, 'layer', 'tokens')
        
        # Menu header
        imgui.text_colored((0.7, 0.7, 0.7, 1.0), f"{sprite_name}")
        imgui.text_colored((0.5, 0.5, 0.5, 1.0), f"Layer: {current_layer}")
        imgui.separator()
        
        # Copy sprite
        if imgui.menu_item("Copy Sprite", "Ctrl+C", False, True)[0]:
            self._copy_sprite()
            self.close_menu()
        
        # Paste sprite (if clipboard has data)
        paste_enabled = self._has_clipboard_data()
        if imgui.menu_item("Paste Sprite", "Ctrl+V", False, paste_enabled)[0]:
            self._paste_sprite()
            self.close_menu()
        
        imgui.separator()
        
        # Move to Layer submenu
        if imgui.begin_menu("Move to Layer"):
            self._render_layer_submenu()
            imgui.end_menu()
        
        # Rotate sprite
        if imgui.menu_item("Rotate Sprite", "R", False, True)[0]:
            self._start_rotation()
            self.close_menu()
        
        imgui.separator()
        
        # Go to Character (if sprite has character)
        character_enabled = hasattr(sprite, 'character') and sprite.character is not None
        if imgui.menu_item("Go to Character", "", False, character_enabled)[0]:
            self._go_to_character()
            self.close_menu()
        
        imgui.separator()
        
        # Delete sprite
        imgui.push_style_color(imgui.Col_.text.value, (0.9, 0.3, 0.3, 1.0))
        if imgui.menu_item("Delete Sprite", "Del", False, True)[0]:
            self._delete_sprite()
            self.close_menu()
        imgui.pop_style_color()
    
    def _render_layer_submenu(self):
        """Render the layer selection submenu"""
        sprite = self.target_sprite
        current_layer = getattr(sprite, 'layer', 'tokens')
        
        # Layer descriptions
        layer_descriptions = {
            'map': 'Map - Background elements',
            'tokens': 'Tokens - Characters and creatures', 
            'dungeon_master': 'DM - DM-only elements',
            'light': 'Light - Lighting effects',
            'height': 'Height - Elevation markers',
            'obstacles': 'Obstacles - Barriers and walls'
        }
        
        for layer_name in LAYERS.keys():
            is_current = layer_name == current_layer
            layer_desc = layer_descriptions.get(layer_name, f'{layer_name.title()} Layer')
            
            # Disable current layer
            if imgui.menu_item(layer_desc, "", is_current, not is_current)[0]:
                self._move_to_layer(layer_name)
                self.close_menu()
    
    def _copy_sprite(self):
        """Copy the sprite using clipboard system"""
        try:
            
            success = clipboard_sys.handle_clipboard_copy(self.context)
            if success:
                logger.info("Sprite copied to clipboard via context menu")
            else:
                logger.warning("Failed to copy sprite via context menu")
        except Exception as e:
            logger.error(f"Error copying sprite via context menu: {e}")
    
    def _paste_sprite(self):
        """Paste sprite using clipboard system"""
        try:
            import clipboard_sys
            success = clipboard_sys.handle_clipboard_paste(self.context)
            if success:
                logger.info("Sprite pasted from clipboard via context menu")
            else:
                logger.warning("Failed to paste sprite via context menu")
        except Exception as e:
            logger.error(f"Error pasting sprite via context menu: {e}")
    
    def _has_clipboard_data(self) -> bool:
        """Check if clipboard has sprite data"""
        try:
            import clipboard_sys
            return clipboard_sys.has_copied_sprite()
        except Exception:
            return False
    
    def _move_to_layer(self, new_layer: str):
        """Move sprite to a new layer"""
        sprite = self.target_sprite
        table = self.target_table
        
        if not sprite or not table:
            return
            
        try:
            sprite_id = getattr(sprite, 'sprite_id', str(id(sprite)))
            
            # Use the correct method signature for GuiActionsBridge
            success = self.actions.move_sprite_to_layer(sprite_id, new_layer)
            
            if success:
                logger.info(f"Moved sprite {sprite_id} to layer {new_layer}")
            else:
                logger.error(f"Failed to move sprite to layer {new_layer}")
                
        except Exception as e:
            logger.error(f"Error moving sprite to layer: {e}")
    
    def _start_rotation(self):
        """Start rotation mode for the sprite"""
        try:
            sprite = self.target_sprite
            table = self.target_table
            
            if not sprite or not table:
                logger.warning("No sprite or table for rotation")
                return
                
            # Select the sprite first (required for handle_rotate)
            table.selected_sprite = sprite
            
            # Start rotation mode
            handle_rotate(self.context)
            logger.info("Started rotation mode for sprite")
        except Exception as e:
            logger.error(f"Error starting rotation: {e}")
    
    def _go_to_character(self):
        """Open character sheet for the sprite's character"""
        sprite = self.target_sprite
        
        if not sprite or not hasattr(sprite, 'character') or not sprite.character:
            logger.warning("Sprite has no associated character")
            return
            
        try:
            # Try to access GUI character sheet panel
            if hasattr(self.context, 'gui') and self.context.gui:
                gui = self.context.gui
                if hasattr(gui, 'panel_instances') and 'CHARACTER_SHEET' in gui.panel_instances:
                    character_panel = gui.panel_instances['CHARACTER_SHEET']
                    if hasattr(character_panel, 'set_character'):
                        character_panel.set_character(sprite.character)
                        # Make character sheet visible
                        if hasattr(gui, 'active_right_panel'):
                            gui.active_right_panel = gui.GuiPanel.CHARACTER_SHEET
                        logger.info(f"Opened character sheet for {sprite.character.name}")
                        return
            
            # Fallback: just log the character info
            logger.info(f"Character: {sprite.character.name} (No GUI character sheet available)")
            
        except Exception as e:
            logger.error(f"Error opening character sheet: {e}")
    
    def _delete_sprite(self):
        """Delete the sprite"""
        sprite = self.target_sprite
        table = self.target_table
        
        if not sprite or not table:
            return
            
        try:
            sprite_id = getattr(sprite, 'sprite_id', str(id(sprite)))
            
            # Use the correct method signature for GuiActionsBridge
            success = self.actions.delete_sprite(sprite_id)
            
            if success:
                logger.info(f"Deleted sprite {sprite_id}")
                # Clear selection if this was the selected sprite
                if table.selected_sprite == sprite:
                    table.selected_sprite = None
            else:
                logger.error(f"Failed to delete sprite {sprite_id}")
                
        except Exception as e:
            logger.error(f"Error deleting sprite: {e}")


# Global context menu instance (initialized by main application)
_context_menu: Optional[ContextMenu] = None

def init_context_menu(context, actions):
    """Initialize the global context menu"""
    global _context_menu
    _context_menu = ContextMenu(context, actions)
    logger.info("Context menu system initialized")

def get_context_menu() -> Optional[ContextMenu]:
    """Get the global context menu instance"""
    return _context_menu

def show_sprite_context_menu(sprite, table, mouse_x: float, mouse_y: float):
    """Show context menu for a sprite (convenience function)"""
    if _context_menu:
        _context_menu.open_sprite_menu(sprite, table, mouse_x, mouse_y)

def render_context_menu():
    """Render the context menu (convenience function)"""
    if _context_menu:
        _context_menu.render()

def close_context_menu():
    """Close the context menu (convenience function)"""
    if _context_menu:
        _context_menu.close_menu()
