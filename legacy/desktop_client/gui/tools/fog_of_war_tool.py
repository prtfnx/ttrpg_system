"""
Fog of War Tool for TTRPG System
Allows GM to manually control fog of war by drawing rectangular areas to hide/reveal
"""

import math
import sdl3
import ctypes
from typing import Optional, Tuple, List, Dict, Any
from logger import setup_logger

logger = setup_logger(__name__)

class FogOfWarTool:
    """Tool for manual fog of war control"""
    
    def __init__(self, context):
        self.context = context
        self.active = False
        self.drawing = False
        self.start_point: Optional[Tuple[float, float]] = None
        self.end_point: Optional[Tuple[float, float]] = None
        self.current_mode = "hide"  # hide or reveal
        self.fog_rectangles = []  # List of fog rectangles with their hide/reveal state
        
        # Separate lists for efficient polygon computation
        self.hide_rectangles = []  # List of hide rectangle tuples
        self.reveal_rectangles = []  # List of reveal rectangle tuples
        
    def start(self):
        """Start the fog of war tool"""
        self.active = True
        self.clear_current()
        # Initialize fog layer if needed
        self._initialize_fog_layer()
        # Load existing fog rectangles from table
        self._load_fog_from_table()
        logger.debug("Fog of war tool started")
    
    def _load_fog_from_table(self):
        """Load existing fog rectangles from the current table"""
        if not self.context.current_table:
            return
        
        try:
            # Load from table's fog_rectangles if available
            if hasattr(self.context.current_table, 'fog_rectangles'):
                fog_data = self.context.current_table.fog_rectangles
                self.hide_rectangles = fog_data.get('hide', [])
                self.reveal_rectangles = fog_data.get('reveal', [])
                
                # Rebuild fog_rectangles list from the separate lists
                self.fog_rectangles.clear()
                
                for i, rect in enumerate(self.hide_rectangles):
                    if len(rect) >= 2:
                        fog_rect = {
                            'start': rect[0],
                            'end': rect[1], 
                            'mode': 'hide',
                            'id': f"fog_hide_{i}"
                        }
                        self.fog_rectangles.append(fog_rect)
                
                for i, rect in enumerate(self.reveal_rectangles):
                    if len(rect) >= 2:
                        fog_rect = {
                            'start': rect[0],
                            'end': rect[1],
                            'mode': 'reveal', 
                            'id': f"fog_reveal_{i}"
                        }
                        self.fog_rectangles.append(fog_rect)
                
                logger.debug(f"Loaded {len(self.hide_rectangles)} hide and {len(self.reveal_rectangles)} reveal rectangles from table")
                
                # Update fog layer and texture
                self._update_fog_layer()
                self._reset_fog_texture()
            
        except Exception as e:
            logger.error(f"Error loading fog from table: {e}")
    
    def stop(self):
        """Stop the fog of war tool"""
        self.active = False
        self.clear_current()
        logger.debug("Fog of war tool stopped")
    
    def clear_current(self):
        """Clear current rectangle being drawn"""
        self.start_point = None
        self.end_point = None
        self.drawing = False
        
    def set_mode(self, mode: str):
        """Set the current fog mode (hide or reveal)"""
        if mode in ["hide", "reveal"]:
            self.current_mode = mode
            logger.debug(f"Fog of war mode set to: {mode}")
    
    def hide_all_table(self):
        """Hide the entire table with fog of war"""
        if not self.context.current_table:
            logger.error("No current table to hide")
            return
        
        # Get table dimensions
        table_width = getattr(self.context.current_table, 'width', 1000)
        table_height = getattr(self.context.current_table, 'height', 1000)
        
        # Create full-table rectangle tuple
        full_table_rect = ((0, 0), (table_width, table_height))
        
        # Clear previous rectangles and add full fog
        self.fog_rectangles.clear()
        self.hide_rectangles.clear()
        self.reveal_rectangles.clear()
        
        # Add full table as hide rectangle
        self.hide_rectangles.append(full_table_rect)
        
        # Add to fog_rectangles for compatibility
        fog_rect = {
            'start': (0, 0),
            'end': (table_width, table_height),
            'mode': 'hide',
            'id': f"fog_full_{len(self.fog_rectangles)}"
        }
        self.fog_rectangles.append(fog_rect)
        
        # Send to server if Actions available
        if hasattr(self.context, 'Actions') and self.context.current_table:
            table_id = str(self.context.current_table.table_id)
            self.context.Actions.update_fog_rectangles(table_id, self.hide_rectangles, self.reveal_rectangles)
        
        # Update fog layer
        self._update_fog_layer()
        self._reset_fog_texture()
        
        logger.info("Hidden entire table with fog of war")
        if hasattr(self.context, 'add_chat_message'):
            self.context.add_chat_message("Hidden entire table with fog of war")
    
    def reveal_all_table(self):
        """Reveal the entire table (clear all fog)"""
        self.fog_rectangles.clear()
        self.hide_rectangles.clear()
        self.reveal_rectangles.clear()
        
        # Send clear to server if Actions available
        if hasattr(self.context, 'Actions') and self.context.current_table:
            table_id = str(self.context.current_table.table_id)
            self.context.Actions.update_fog_rectangles(table_id, [], [])
        
        self._update_fog_layer()
        self._reset_fog_texture()
        
        logger.info("Revealed entire table (cleared fog of war)")
        if hasattr(self.context, 'add_chat_message'):
            self.context.add_chat_message("Revealed entire table (cleared fog of war)")
    
    def save_current_rectangle(self):
        """Save the current rectangle as a fog area"""
        if self.start_point and self.end_point:
            # Normalize rectangle coordinates
            min_x = min(self.start_point[0], self.end_point[0])
            min_y = min(self.start_point[1], self.end_point[1])
            max_x = max(self.start_point[0], self.end_point[0])
            max_y = max(self.start_point[1], self.end_point[1])
            
            # Create rectangle tuple for efficient polygon computation
            rect_tuple = ((min_x, min_y), (max_x, max_y))
            
            # Add to appropriate list for efficient polygon computation
            if self.current_mode == "hide":
                self.hide_rectangles.append(rect_tuple)
            else:  # reveal
                self.reveal_rectangles.append(rect_tuple)
            
            fog_rect = {
                'start': (min_x, min_y),
                'end': (max_x, max_y),
                'mode': self.current_mode,
                'id': f"fog_{self.current_mode}_{len(self.fog_rectangles)}"
            }
            
            self.fog_rectangles.append(fog_rect)
            
            # Update table's fog_rectangles for persistence
            if hasattr(self.context.current_table, 'fog_rectangles'):
                self.context.current_table.fog_rectangles = {
                    'hide': self.hide_rectangles,
                    'reveal': self.reveal_rectangles
                }
            
            self._update_fog_layer()
            
            # Send to server if Actions available
            if hasattr(self.context, 'Actions') and self.context.current_table:
                table_id = str(self.context.current_table.table_id)
                self.context.Actions.update_fog_rectangles(table_id, self.hide_rectangles, self.reveal_rectangles)
            
            # Invalidate fog texture for rebuild
            self._reset_fog_texture()
            
            logger.info(f"Saved fog rectangle: {self.current_mode} from {fog_rect['start']} to {fog_rect['end']}")
            if hasattr(self.context, 'add_chat_message'):
                self.context.add_chat_message(f"Fog of war: {self.current_mode} area applied")
    
    def clear_fog_rectangles(self):
        """Clear all fog rectangles"""
        self.fog_rectangles.clear()
        self.hide_rectangles.clear()
        self.reveal_rectangles.clear()
        
        # Update table's fog_rectangles for persistence
        if hasattr(self.context.current_table, 'fog_rectangles'):
            self.context.current_table.fog_rectangles = {'hide': [], 'reveal': []}
        
        # Send clear to server if Actions available
        if hasattr(self.context, 'Actions') and self.context.current_table:
            table_id = str(self.context.current_table.table_id)
            self.context.Actions.update_fog_rectangles(table_id, [], [])
        
        self._update_fog_layer()
        self._reset_fog_texture()
        logger.info("Cleared all fog of war rectangles")
    
    def _initialize_fog_layer(self):
        """Initialize the fog of war layer"""
        if not self.context.current_table:
            return
        
        # Ensure fog_of_war layer exists in table
        if hasattr(self.context.current_table, 'dict_of_sprites_list'):
            if 'fog_of_war' not in self.context.current_table.dict_of_sprites_list:
                self.context.current_table.dict_of_sprites_list['fog_of_war'] = []
            
            # Ensure fog_rectangles exists 
            if not hasattr(self.context.current_table, 'fog_rectangles'):
                self.context.current_table.fog_rectangles = {'hide': [], 'reveal': []}
        
        # Configure fog layer in RenderManager
        if hasattr(self.context, 'RenderManager'):
            render_manager = self.context.RenderManager
            
            # Ensure fog layer exists in RenderManager
            if 'fog_of_war' not in render_manager.dict_of_sprites_list:
                render_manager.dict_of_sprites_list['fog_of_war'] = []
            
            # Configure fog layer settings
            from RenderManager import LayerSettings
            fog_settings = LayerSettings(
                color=(0, 0, 0),  # Black color
                opacity=1.0,      # Full opacity for players
                blend_mode="alpha",
                is_visible=True,
                z_order=6         # Render on top
            )
            render_manager.configure_one_layer('fog_of_war', fog_settings)
    
    def _update_fog_layer(self):
        """Update the fog layer with current rectangles"""
        if not self.context.current_table or not hasattr(self.context, 'RenderManager'):
            return
        
        # Clear existing fog sprites
        if 'fog_of_war' in self.context.current_table.dict_of_sprites_list:
            self.context.current_table.dict_of_sprites_list['fog_of_war'].clear()
        
        if 'fog_of_war' in self.context.RenderManager.dict_of_sprites_list:
            self.context.RenderManager.dict_of_sprites_list['fog_of_war'].clear()
        
        # TODO: Here we would create actual fog sprites based on rectangles
        # For now, we'll store the rectangles and handle rendering in the tool itself
        logger.debug(f"Updated fog layer with {len(self.fog_rectangles)} rectangles")
    
    def handle_mouse_down(self, x: float, y: float, button: int) -> bool:
        """Handle mouse down event"""
        if not self.active or button != 1:  # Only left mouse button
            return False
        
        # Convert screen coordinates to table coordinates
        table_x, table_y = self._screen_to_table_coords(x, y)
        
        self.start_point = (table_x, table_y)
        self.drawing = True
        
        logger.debug(f"Started drawing fog rectangle at ({table_x:.1f}, {table_y:.1f})")
        return True
    
    def handle_mouse_up(self, x: float, y: float, button: int) -> bool:
        """Handle mouse up event"""
        if not self.active or not self.drawing or button != 1:
            return False
        
        # Convert screen coordinates to table coordinates
        table_x, table_y = self._screen_to_table_coords(x, y)
        
        self.end_point = (table_x, table_y)
        
        # Save the rectangle
        self.save_current_rectangle()
        
        # Clear current drawing
        self.clear_current()
        
        logger.debug(f"Finished drawing fog rectangle at ({table_x:.1f}, {table_y:.1f})")
        return True
    
    def handle_mouse_motion(self, x: float, y: float) -> bool:
        """Handle mouse motion event"""
        if not self.active or not self.drawing:
            return False
        
        # Convert screen coordinates to table coordinates
        table_x, table_y = self._screen_to_table_coords(x, y)
        
        self.end_point = (table_x, table_y)
        return True
    
    def _screen_to_table_coords(self, screen_x: float, screen_y: float) -> Tuple[float, float]:
        """Convert screen coordinates to table coordinates"""
        if hasattr(self.context.current_table, 'screen_to_table'):
            return self.context.current_table.screen_to_table(screen_x, screen_y)
        else:
            logger.error("Table does not have screen_to_table method")
            return (screen_x, screen_y)
    
    def render(self, renderer):
        """Render fog of war preview for GM"""
        if not self.active:
            return
        
        # Render current rectangle being drawn (GM preview only)
        is_gm = hasattr(self.context, 'is_gm') and self.context.is_gm
        if is_gm and self.drawing and self.start_point and self.end_point:
            if self.current_mode == "hide":
                color = (0.5, 0.5, 0.5, 0.5)  # Gray preview
            else:
                color = (0.0, 1.0, 0.0, 0.3)  # Green preview for reveal
            
            self._render_rectangle(renderer, self.start_point, self.end_point, color)
    
    def _render_rectangle(self, renderer, start: Tuple[float, float], end: Tuple[float, float], 
                         color: Tuple[float, float, float, float]):
        """Render a rectangle with the specified color"""
        try:
            # Convert table coordinates to screen coordinates
            if hasattr(self.context.current_table, 'table_to_screen'):
                start_screen_x, start_screen_y = self.context.current_table.table_to_screen(start[0], start[1])
                end_screen_x, end_screen_y = self.context.current_table.table_to_screen(end[0], end[1])
            else:
                logger.error("Table does not have table_to_screen method")
                return
            
            # Set render color
            sdl3.SDL_SetRenderDrawColorFloat(renderer, 
                                           ctypes.c_float(color[0]), 
                                           ctypes.c_float(color[1]), 
                                           ctypes.c_float(color[2]), 
                                           ctypes.c_float(color[3]))
            
            # Calculate rectangle bounds
            min_x = min(start_screen_x, end_screen_x)
            min_y = min(start_screen_y, end_screen_y)
            max_x = max(start_screen_x, end_screen_x)
            max_y = max(start_screen_y, end_screen_y)
            
            # For filled rectangles, we'll draw many horizontal lines
            # This is a workaround for SDL3 type issues
            for y in range(int(min_y), int(max_y) + 1):
                sdl3.SDL_RenderLine(renderer,
                                   ctypes.c_float(min_x), ctypes.c_float(y),
                                   ctypes.c_float(max_x), ctypes.c_float(y))
            
        except Exception as e:
            logger.error(f"Error rendering fog rectangle: {e}")
    
    def get_fog_rectangles(self) -> List[Dict[str, Any]]:
        """Get current fog rectangles (for debugging/inspection)"""
        return self.fog_rectangles.copy()
    
    def is_point_in_fog(self, x: float, y: float) -> bool:
        """Check if a point is covered by fog (for game logic)"""
        for fog_rect in self.fog_rectangles:
            if fog_rect['mode'] == 'hide':
                start = fog_rect['start']
                end = fog_rect['end']
                if (min(start[0], end[0]) <= x <= max(start[0], end[0]) and
                    min(start[1], end[1]) <= y <= max(start[1], end[1])):
                    return True
        return False
    
    def _reset_fog_texture(self):
        """Reset the fog texture to force rebuild"""
        if hasattr(self.context, 'RenderManager') and self.context.RenderManager:
            self.context.RenderManager.reset_fog_texture()
