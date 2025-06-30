import sdl3
import ctypes
import logging
import math
from logger import setup_logger
from typing import Optional, Dict, List, Any, Union, TYPE_CHECKING
from Sprite import Sprite
from dataclasses import dataclass
from ContextTable import ContextTable

if TYPE_CHECKING:
    from LightManager import LightManager
    from GeometricManager import GeometricManager
    from ContextTable import ContextTable
logger = setup_logger(__name__, level=logging.INFO)


@dataclass
class LayerSettings:
    color: tuple[int, int, int] = (255, 255, 255)
    opacity: float = 1.0
    blend_mode: str = "alpha"
    is_visible: bool = True
    z_order: int = 0

class RenderManager():
    def __init__(self, renderer, window):
        self.renderer: sdl3.SDL_Renderer = renderer
        self.window: sdl3.SDL_Window   = window
        self.LightManager: Optional[LightManager] = None
        self.GeometricManager: Optional[GeometricManager] = None
        # Layers of sprites to render:
        self.dict_of_sprites_list: Dict[str, List[Sprite]] = {}
        # Layer settings for each layer
        self.layer_settings: Dict[str, LayerSettings] = {}
        self.configure_layers()  # Initialize with default settings
        self._current_layer_settings: LayerSettings = LayerSettings()
        # For visibility polygon 
        self.point_of_view_changed: bool = True
        self.obstacles_changed: bool = True
        self.view_distance: int = 500  # TODO: take from player
        self.visibility_polygon_vertices: Optional[ctypes.Array] = None

    def _apply_layer_settings(self):
        sdl3.SDL_SetRenderDrawColor(self.renderer, 
                                   ctypes.c_ubyte(self._current_layer_settings.color[0]),
                                   ctypes.c_ubyte(self._current_layer_settings.color[1]),
                                   ctypes.c_ubyte(self._current_layer_settings.color[2]),
                                   ctypes.c_ubyte(int(self._current_layer_settings.opacity * 255))) 
        # Set blend mode based on string value
        if self._current_layer_settings.blend_mode == "alpha":
            blend_mode = sdl3.SDL_BLENDMODE_BLEND
        elif self._current_layer_settings.blend_mode == "additive":
            blend_mode = sdl3.SDL_BLENDMODE_ADD
        elif self._current_layer_settings.blend_mode == "modulate":
            blend_mode = sdl3.SDL_BLENDMODE_MOD
        elif self._current_layer_settings.blend_mode == "multiply":
            blend_mode = sdl3.SDL_BLENDMODE_MUL
        else:
            blend_mode = sdl3.SDL_BLENDMODE_BLEND  # Default to alpha blending            
        sdl3.SDL_SetRenderDrawBlendMode(self.renderer, blend_mode)        

    def configure_layers(self, basic_settings: LayerSettings = LayerSettings(), order: Optional[List[str]] = None):
        """Configure default settings for all layers with proper z_order"""
        # Default layer order: ['map','tokens', 'dungeon_master', 'light', 'height', 'obstacles']
        default_layer_order = ['map', 'tokens', 'dungeon_master', 'light', 'height', 'obstacles']
        layer_order = order if order else default_layer_order
        for layer_name in self.dict_of_sprites_list.keys():
            # Create a copy of basic_settings for each layer
            layer_settings = LayerSettings(
                color=basic_settings.color,
                opacity=basic_settings.opacity,
                blend_mode=basic_settings.blend_mode,
                is_visible=basic_settings.is_visible,
                z_order=basic_settings.z_order
            )
            
            # Set z_order based on default layer order, or use a high value for unknown layers
            if layer_name in layer_order:
                layer_settings.z_order = layer_order.index(layer_name)
            else:
                # Unknown layers get high z_order values to render on top
                layer_settings.z_order = len(layer_order) + 10                
            self.layer_settings[layer_name] = layer_settings
    
    def configure_one_layer(self, layer_name: str, layer_settings: LayerSettings):
        """Configure a layer with settings"""
        if layer_name not in self.dict_of_sprites_list:
            raise ValueError(f"Layer '{layer_name}' does not exist")
        
        self.layer_settings[layer_name] = layer_settings

    def get_layer_settings(self, layer_name: str) -> LayerSettings:
        """Get settings for a specific layer"""
        if layer_name not in self.layer_settings:
            # Return default settings if none exist
            return LayerSettings()
        return self.layer_settings[layer_name]

    def set_layer_opacity(self, layer_name: str, opacity: float):
        """Set opacity for a specific layer"""
        if layer_name in self.layer_settings:
            self.layer_settings[layer_name].opacity = max(0.0, min(1.0, opacity))

    def set_layer_visibility(self, layer_name: str, visible: bool):
        """Set visibility for a specific layer"""
        if layer_name in self.layer_settings:
            self.layer_settings[layer_name].is_visible = visible

    def render_all_layers(self):
        """Render all layers in z_order"""
        #TODO: may use batch rendering for performance if neeeded
       
        
        sorted_layers = sorted(self.layer_settings.items(), key=lambda x: x[1].z_order)

        logger.debug(f"Rendering layers in order: {[layer[0] for layer in sorted_layers]}")
        for layer_name, settings in sorted_layers:
            if not settings.is_visible:
                logger.debug(f"Skipping invisible layer: {layer_name}")
                continue  # Skip invisible layers
            if self._current_layer_settings != settings:
                self._apply_layer_settings()
                logger.debug(f"Applying settings for layer: {layer_name} - {settings}")
            if layer_name in self.dict_of_sprites_list:  
                logger.debug(f"Rendering layer: {layer_name} with {len(self.dict_of_sprites_list[layer_name])} sprites")              
                self.render_layer(self.dict_of_sprites_list[layer_name])

    def render_layer(self, layer: List[Sprite]):
        """Render a single layer of sprites"""
        # Render sprites in the layer
        for sprite in layer:
            if sprite.texture and hasattr(sprite, 'frect'):
                # Check if sprite has rotation
                rotation = getattr(sprite, 'rotation', 0.0)
                if rotation != 0.0:
                    # Render with rotation - center point should be relative to dstrect
                    # According to SDL3 docs: center is relative to dstrect, not absolute
                    center_point = sdl3.SDL_FPoint()
                    center_point.x = ctypes.c_float(sprite.frect.w / 2)  # Relative to sprite rect
                    center_point.y = ctypes.c_float(sprite.frect.h / 2)  # Relative to sprite rect
                    
                    sdl3.SDL_RenderTextureRotated(self.renderer, sprite.texture, None, 
                                                ctypes.byref(sprite.frect),
                                                ctypes.c_double(rotation),
                                                ctypes.byref(center_point),
                                                sdl3.SDL_FLIP_NONE)
                else:
                    # Render without rotation
                    sdl3.SDL_RenderTexture(self.renderer, sprite.texture, None, 
                                           ctypes.byref(sprite.frect))   

    def render_texture(self, texture: sdl3.SDL_Texture, 
                       sfrect: Optional[sdl3.SDL_FRect] = None,
                       dfrect: Optional[sdl3.SDL_FRect] = None):
        
        """Render a texture to the current renderer TODO: not used now"""
        if not texture:
            raise ValueError("Texture cannot be None")
        sdl3.SDL_RenderTexture(self.renderer, texture, sfrect, dfrect)

    def render_textures(self, textures: list[sdl3.SDL_Texture], 
                       sfrects: Optional[list[Optional[sdl3.SDL_FRect]]] = None,
                       dfrects: Optional[list[Optional[sdl3.SDL_FRect]]] = None):
        
        """Render group of textures to the current renderer TODO: not used now"""
        if not textures:
            raise ValueError("Textures cannot be None")
        [sdl3.SDL_RenderTexture(self.renderer, texture, sfrect, dfrect)
         for texture, sfrect, dfrect
         in zip(textures, sfrects or [], dfrects or [])]

    def prepare_lighting(self, player: Sprite):
        """Prepare lighting effects for rendering"""
        #TODO make player not a Sprite but a Player object
        if not self.LightManager:
            raise ValueError("LightManager is not initialized")
        if not self.GeometricManager:
            raise ValueError("GeometricManager is not initialized")
        
        render_texture_light = self.LightManager.render_texture_light
        render_texture = self.LightManager.render_texture
        texture_light = self.LightManager.texture_light
        frect_light = sdl3.SDL_FRect()
        light_width = player.frect.w
        light_height = player.frect.h
        frect_light.x = (player.frect.x - light_width / 2) - 500
        frect_light.y = (player.frect.y) - 500
        frect_light.w = light_width*2 + 1000
        frect_light.h = light_height + 1000
        sdl3.SDL_SetRenderDrawColor(self.renderer, 0, 0, 0, sdl3.SDL_ALPHA_OPAQUE)
        # Render light on the texture
        sdl3.SDL_SetRenderTarget(self.renderer, render_texture_light)
        sdl3.SDL_RenderClear(self.renderer)
        sdl3.SDL_RenderTexture(self.renderer, texture_light,  None, ctypes.byref(frect_light))
        # Render visibility polygon on the texture
        sdl3.SDL_SetRenderTarget(self.renderer, render_texture)
        sdl3.SDL_RenderClear(self.renderer)
        # Form visibility polygon if the point of view has changed
        if self.point_of_view_changed or self.obstacles_changed:
            player_pos = self.GeometricManager.center_position_from_frect(player.frect)
            obstacles = self.GeometricManager.sprites_to_obstacles_numpy(self.dict_of_sprites_list.get("obstacles"))
            # TODO step_to_gap get from settings 
            visibility_polygon = self.GeometricManager.generate_visibility_polygon(
                player_pos, obstacles, max_view_distance=self.view_distance, step_to_gap=5
            )
            self.visibility_polygon_vertices = self.GeometricManager.polygon_to_sdl_triangles(visibility_polygon, 
                                                                                              player_pos, color=(1.0, 1.0, 1.0, 1.0))
            # For testing purposes dont use point_of_view_changed
            #self.point_of_view_changed = False
        # Draw polygon of visibility
        sdl3.SDL_SetRenderDrawColor(self.renderer, 255, 255, 255, 255)
        sdl3.SDL_RenderGeometry(self.renderer, None, self.visibility_polygon_vertices, len(self.visibility_polygon_vertices), None, 0)
        sdl3.SDL_SetRenderTarget(self.renderer, None)
        sdl3.SDL_RenderClear(self.renderer)
    
    def finish_lighting(self):
        """Finish lighting effects rendering"""
        if not self.LightManager:
            raise ValueError("LightManager is not initialized")
        
        render_texture_light = self.LightManager.render_texture_light
        render_texture = self.LightManager.render_texture
        
        # On top render black and light texture
        sdl3.SDL_RenderTexture(self.renderer, render_texture, None, None)        
        sdl3.SDL_RenderTexture(self.renderer, render_texture_light, None, None)
        sdl3.SDL_RenderTexture(self.renderer, render_texture_light, None, None)

    def draw_grid(self, table: ContextTable, 
                  color: tuple[int, int, int, int] = (100, 100, 100, 255)):
        """Draw a grid on table"""
        if not table:
            raise ValueError("Table and grid cannot be None")

        if not table.show_grid or not table.screen_area:
            return
        area_x, area_y, area_width, area_height = table.screen_area

        # Grid configuration TODO: make it configurable
        grid_size = 50.0  # Grid cell size in table coordinates
        cells_per_row = int(area_width / (grid_size * table.table_scale)) + 2
        cells_per_col = int(area_height / (grid_size * table.table_scale)) + 2
        # Set color for grid lines
        try:
            sdl3.SDL_SetRenderDrawColor(self.renderer, ctypes.c_ubyte(color[0]), ctypes.c_ubyte(color[1]), 
                                       ctypes.c_ubyte(color[2]), ctypes.c_ubyte(color[3]))
        except Exception as e:
            logger.error(f"Failed to set render draw color: {e}")
        
        # Calculate starting grid position in table coordinates
        start_x = int(table.viewport_x / grid_size) * grid_size
        start_y = int(table.viewport_y / grid_size) * grid_size
        # Draw vertical grid lines
        for i in range(cells_per_row + 1):
            table_x = start_x + i * grid_size            
            # Only draw if line is within table bounds
            if 0 <= table_x <= table.width:
                screen_x, screen_y1 = table.table_to_screen(table_x, max(0, table.viewport_y))
                screen_x, screen_y2 = table.table_to_screen(table_x, min(table.height, table.viewport_y + area_height / table.table_scale))
                # Only draw if line is within screen area
                if area_x <= screen_x <= area_x + area_width:
                    try:
                        sdl3.SDL_RenderLine(self.renderer,
                                           ctypes.c_float(screen_x), ctypes.c_float(max(area_y, screen_y1)),
                                           ctypes.c_float(screen_x), ctypes.c_float(min(area_y + area_height, screen_y2)))
                    except Exception as e:
                        logger.error(f"Failed to draw vertical grid line: {e}")
        # Draw horizontal grid lines
        for i in range(cells_per_col + 1):
            table_y = start_y + i * grid_size
            
            # Only draw if line is within table bounds
            if 0 <= table_y <= table.height:
                screen_x1, screen_y = table.table_to_screen(max(0, table.viewport_x), table_y)
                screen_x2, screen_y = table.table_to_screen(min(table.width, table.viewport_x + area_width / table.table_scale), table_y)

                # Only draw if line is within screen area
                if area_y <= screen_y <= area_y + area_height:
                    try:
                        sdl3.SDL_RenderLine(self.renderer, 
                                           ctypes.c_float(max(area_x, screen_x1)), ctypes.c_float(screen_y),
                                           ctypes.c_float(min(area_x + area_width, screen_x2)), ctypes.c_float(screen_y))
                    except Exception as e:
                        logger.error(f"Failed to draw horizontal grid line: {e}")

    def draw_margin(self, sprite: Sprite):
        """Draw margin rectangles around the selected sprite for resizing and rotation handle."""
        if not sprite:
            return  
        frect = sprite.frect
        renderer = self.renderer
        # Make 4 rectangles for 4 sides (resize handles)
        rec1, rec2, rec3, rec4 = sdl3.SDL_FRect(), sdl3.SDL_FRect(), sdl3.SDL_FRect(), sdl3.SDL_FRect()

        # rec1: left edge
        margin_w = frect.w / 40
        margin_h = frect.h / 40
        rec1.x = ctypes.c_float(sprite.frect.x - margin_w)
        rec1.y = ctypes.c_float(sprite.frect.y - margin_h)
        rec1.w = ctypes.c_float(margin_w * 2)
        rec1.h = ctypes.c_float(sprite.frect.h + 2 * margin_h)
        # rec2: bottom edge
        rec2.x = ctypes.c_float(sprite.frect.x - margin_w)
        rec2.y = ctypes.c_float(sprite.frect.y + sprite.frect.h - margin_h)
        rec2.w = ctypes.c_float(sprite.frect.w + 2 * margin_w)
        rec2.h = ctypes.c_float(margin_h * 2)
        # rec3: top edge
        rec3.x = ctypes.c_float(sprite.frect.x - margin_w)
        rec3.y = ctypes.c_float(sprite.frect.y - margin_h)
        rec3.w = ctypes.c_float(sprite.frect.w + margin_w * 2)
        rec3.h = ctypes.c_float(margin_h * 2)
        # rec4: right edge
        rec4.x = ctypes.c_float(sprite.frect.x + sprite.frect.w - margin_w)
        rec4.y = ctypes.c_float(sprite.frect.y - margin_h)
        rec4.w = ctypes.c_float(margin_w * 2)
        rec4.h = ctypes.c_float(sprite.frect.h + margin_h * 2)

        # Draw resize handles in green
        sdl3.SDL_SetRenderDrawColor(renderer, 0, 255, 0, sdl3.SDL_ALPHA_OPAQUE)
        sdl3.SDL_RenderRect(renderer, ctypes.byref(rec1))
        sdl3.SDL_RenderRect(renderer, ctypes.byref(rec2))
        sdl3.SDL_RenderRect(renderer, ctypes.byref(rec3))
        sdl3.SDL_RenderRect(renderer, ctypes.byref(rec4))
        sdl3.SDL_RenderRect(renderer, ctypes.byref(sprite.frect))
        
        # Draw rotation handle as a circle above the sprite
        self._draw_rotation_handle(sprite)
    
    def _draw_rotation_handle(self, sprite: Sprite):
        """Draw a circular rotation handle at the margin of the selected rectangle"""
        if not sprite:
            return
            
        # Calculate circle position (at the top margin of the selection rectangle)
        circle_radius = max(4, min(sprite.frect.w / 20, sprite.frect.h / 20))  # Smaller handle
        margin_h = sprite.frect.h / 40  # Same margin as selection handles
        
        # Position at top center of the selection rectangle margin
        center_x = sprite.frect.x + sprite.frect.w / 2
        center_y = sprite.frect.y - margin_h - circle_radius
        
        # Draw circle using SDL line drawing (approximating a circle)
        self._draw_circle(center_x, center_y, circle_radius, (0, 255, 0, 255))  # Green color
        
        # Draw a line connecting the circle to the top edge of the sprite rectangle
        sprite_top_x = sprite.frect.x + sprite.frect.w / 2
        sprite_top_y = sprite.frect.y
        
        # Set line color to green
        sdl3.SDL_SetRenderDrawColor(self.renderer, 
                                   ctypes.c_ubyte(0), ctypes.c_ubyte(255), 
                                   ctypes.c_ubyte(0), ctypes.c_ubyte(255))
        
        # Draw connection line from circle to sprite top edge
        sdl3.SDL_RenderLine(self.renderer,
                           ctypes.c_float(center_x), ctypes.c_float(center_y + circle_radius),
                           ctypes.c_float(sprite_top_x), ctypes.c_float(sprite_top_y))
    
    def _draw_circle(self, x: float, y: float, radius: float, color: tuple[int, int, int, int]):
        """Draw a circle using line segments (SDL3 doesn't have native circle drawing)"""
        
        
        # Set circle color
        sdl3.SDL_SetRenderDrawColor(self.renderer, 
                                   ctypes.c_ubyte(color[0]), ctypes.c_ubyte(color[1]), 
                                   ctypes.c_ubyte(color[2]), ctypes.c_ubyte(color[3]))
        
        # Draw circle using line segments
        segments = max(16, int(radius))  # More segments for larger circles
        angle_step = 2 * math.pi / segments
        
        for i in range(segments):
            angle1 = i * angle_step
            angle2 = (i + 1) * angle_step
            
            x1 = x + radius * math.cos(angle1)
            y1 = y + radius * math.sin(angle1)
            x2 = x + radius * math.cos(angle2)
            y2 = y + radius * math.sin(angle2)
            
            sdl3.SDL_RenderLine(self.renderer,
                               ctypes.c_float(x1), ctypes.c_float(y1),
                               ctypes.c_float(x2), ctypes.c_float(y2))
        
        # Fill the circle with a cross pattern for better visibility
        sdl3.SDL_RenderLine(self.renderer,
                           ctypes.c_float(x - radius), ctypes.c_float(y),
                           ctypes.c_float(x + radius), ctypes.c_float(y))
        sdl3.SDL_RenderLine(self.renderer,
                           ctypes.c_float(x), ctypes.c_float(y - radius),
                           ctypes.c_float(x), ctypes.c_float(y + radius))

    def iterate_draw(self, table, light_on: bool = True):
        """Manage all rendering operations for a table for the current frame"""
        
        renderer = self.renderer               
        if not table or not table.screen_area:
            raise ValueError("Table and its screen area cannot be None")       
        self.dict_of_sprites_list = table.dict_of_sprites_list
     
        # Update current viewport 
        table_x, table_y, table_width, table_height = table.screen_area
        #sdl3.SDL_RenderSetViewport(renderer, ctypes.byref(sdl3.SDL_Rect(table_x, table_y, table_width, table_height)))
        # Clear screen
        sdl3.SDL_SetRenderDrawColorFloat(renderer, ctypes.c_float(0.1), ctypes.c_float(0.1), 
                                         ctypes.c_float(0.1), ctypes.c_float(1.0))
        sdl3.SDL_RenderClear(renderer)
        
        # Draw table area with different background color (SDL content viewport)
        sdl3.SDL_SetRenderDrawColorFloat(renderer, ctypes.c_float(0.25), ctypes.c_float(0.25), ctypes.c_float(0.25), ctypes.c_float(1.0))
        table_rect = sdl3.SDL_FRect(float(table_x), float(table_y), float(table_width), float(table_height))
        sdl3.SDL_RenderFillRect(renderer, ctypes.byref(table_rect))
        #logger.info("iterating")
        # Draw grid if enabled
        if table.show_grid:            
            self.draw_grid(table)
        
        if light_on and self.LightManager:
            # Prepare lighting effects
            # TODO - make table.player a Player object
            #logger.info("Preparing lighting effects")
            table.player =  table.selected_sprite
            self.prepare_lighting(table.player)
            # Render all layers with lighting
            self.render_all_layers()
            # Finish lighting effects rendering
            self.finish_lighting()
        else:
            #logger.info("no light")
            self.render_all_layers()
        self.draw_margin(table.selected_sprite)  # Draw margin around selected sprite if any
