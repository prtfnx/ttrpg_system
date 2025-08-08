use wasm_bindgen::prelude::*;
use web_sys::{HtmlCanvasElement, WebGl2RenderingContext as WebGlRenderingContext, WebGlTexture, HtmlImageElement};
use std::collections::HashMap;
use gloo_utils::format::JsValueSerdeExt;

use crate::types::*;
use crate::math::*;
use crate::camera::Camera;
use crate::input::{InputHandler, InputMode, HandleDetector};
use crate::sprite_manager::SpriteManager;
use crate::webgl_renderer::WebGLRenderer;
use crate::lighting::LightingSystem;
use crate::fog::FogOfWarSystem;

const LAYER_NAMES: &[&str] = &["map", "tokens", "dungeon_master", "light", "height", "obstacles", "fog_of_war"];

#[wasm_bindgen]
pub struct RenderEngine {
    canvas: HtmlCanvasElement,
    renderer: WebGLRenderer,
    
    // Layer system
    layers: HashMap<String, Layer>,
    
    // Camera and transforms
    camera: Camera,
    view_matrix: Mat3,
    canvas_size: Vec2,
    
    // Input handling
    input: InputHandler,
    
    // Resources
    textures: HashMap<String, WebGlTexture>,
    grid_enabled: bool,
    grid_size: f32,
    grid_snapping: bool,
    
    // Lighting system
    lighting: LightingSystem,
    
    // Fog of war system
    fog: FogOfWarSystem,
}

#[wasm_bindgen]
impl RenderEngine {
    #[wasm_bindgen(constructor)]
    pub fn new(canvas: HtmlCanvasElement) -> Result<RenderEngine, JsValue> {
        let gl = canvas.get_context("webgl2")?.unwrap().dyn_into::<WebGlRenderingContext>()?;
        let renderer = WebGLRenderer::new(gl.clone())?;
        let lighting = LightingSystem::new(gl.clone())?;
        let fog = FogOfWarSystem::new(gl)?;
        
        let mut layers = HashMap::new();
        for (i, &name) in LAYER_NAMES.iter().enumerate() {
            layers.insert(name.to_string(), Layer::new(i as i32));
        }
        
        let canvas_size = Vec2::new(canvas.width() as f32, canvas.height() as f32);
        let camera = Camera::default();
        let view_matrix = camera.view_matrix(canvas_size);
        
        let mut engine = Self {
            canvas,
            renderer,
            layers,
            camera,
            view_matrix,
            canvas_size,
            input: InputHandler::new(),
            textures: HashMap::new(),
            grid_enabled: true,
            grid_size: 50.0,
            grid_snapping: false,
            lighting,
            fog,
        };
        
        engine.update_view_matrix();
        Ok(engine)
    }
    
    #[wasm_bindgen]
    pub fn render(&mut self) -> Result<(), JsValue> {
        self.renderer.clear(0.1, 0.1, 0.1, 1.0);
        
        if self.grid_enabled {
            self.draw_grid()?;
        }
        
        // Sort layers by z_order
        let mut sorted_layers: Vec<_> = self.layers.iter().collect();
        sorted_layers.sort_by_key(|(_, layer)| layer.z_order);

        // Render all layers except light and fog_of_war layers
        for (layer_name, layer) in sorted_layers {
            if layer.visible && layer_name != "light" && layer_name != "fog_of_war" {
                for sprite in &layer.sprites {
                    self.draw_sprite(sprite, layer.opacity)?;
                }
            }
        }

        // Render lighting system
        self.lighting.render_lights(&self.view_matrix.to_array(), self.canvas_size.x, self.canvas_size.y)?;
        
        // Render fog of war system (should be rendered last, on top of everything)
        self.fog.render_fog(&self.view_matrix.to_array(), self.canvas_size.x, self.canvas_size.y)?;
        
        // Draw area selection rectangle if active
        if let Some((min, max)) = self.input.get_area_selection_rect() {
            self.draw_area_selection_rect(min, max)?;
        }
        
        Ok(())
    }
    
    fn update_view_matrix(&mut self) {
        self.view_matrix = self.camera.view_matrix(self.canvas_size);
        let matrix_array = self.view_matrix.to_array();
        self.renderer.set_view_matrix(&matrix_array, self.canvas_size);
    }
    
    fn draw_grid(&self) -> Result<(), JsValue> {
        let world_bounds = self.get_world_view_bounds();
        
        let start_x = (world_bounds.min.x / self.grid_size).floor() * self.grid_size;
        let end_x = (world_bounds.max.x / self.grid_size).ceil() * self.grid_size;
        let start_y = (world_bounds.min.y / self.grid_size).floor() * self.grid_size;
        let end_y = (world_bounds.max.y / self.grid_size).ceil() * self.grid_size;
        
        let mut vertices = Vec::new();
        
        // Vertical lines
        let mut x = start_x;
        while x <= end_x {
            vertices.extend_from_slice(&[x, world_bounds.min.y, x, world_bounds.max.y]);
            x += self.grid_size;
        }
        
        // Horizontal lines
        let mut y = start_y;
        while y <= end_y {
            vertices.extend_from_slice(&[world_bounds.min.x, y, world_bounds.max.x, y]);
            y += self.grid_size;
        }
        
        self.renderer.draw_lines(&vertices, [0.2, 0.2, 0.2, 1.0])?;
        
        // Draw grid center dots if grid snapping is enabled (for visual reference)
        if self.grid_snapping && self.grid_size >= 30.0 {
            let mut center_vertices = Vec::new();
            let mut y = start_y + self.grid_size * 0.5;
            while y <= end_y - self.grid_size * 0.5 {
                let mut x = start_x + self.grid_size * 0.5;
                while x <= end_x - self.grid_size * 0.5 {
                    let dot_size = 2.0;
                    center_vertices.extend_from_slice(&[
                        x - dot_size, y,
                        x + dot_size, y,
                        x, y - dot_size,
                        x, y + dot_size,
                    ]);
                    x += self.grid_size;
                }
                y += self.grid_size;
            }
            if !center_vertices.is_empty() {
                self.renderer.draw_lines(&center_vertices, [0.4, 0.4, 0.4, 0.8])?;
            }
        }
        
        Ok(())
    }
    
    fn draw_sprite(&self, sprite: &Sprite, layer_opacity: f32) -> Result<(), JsValue> {
        let is_selected = self.input.is_sprite_selected(&sprite.id);
        let is_primary_selected = self.input.selected_sprite_id.as_ref() == Some(&sprite.id);
        let world_pos = Vec2::new(sprite.world_x as f32, sprite.world_y as f32);
        let size = Vec2::new(
            (sprite.width * sprite.scale_x) as f32,
            (sprite.height * sprite.scale_y) as f32
        );
        
        // Calculate sprite vertices with rotation
        let vertices = self.calculate_sprite_vertices(sprite, world_pos, size);
        let tex_coords = [0.0, 0.0, 1.0, 0.0, 0.0, 1.0, 1.0, 1.0];
        
        let mut color = sprite.tint_color;
        
        let has_texture = !sprite.texture_id.is_empty() && self.textures.contains_key(&sprite.texture_id);
        if has_texture {
            // Activate texture unit 0 and bind the texture
            self.renderer.gl.active_texture(WebGlRenderingContext::TEXTURE0);
            if let Some(texture) = self.textures.get(&sprite.texture_id) {
                self.renderer.gl.bind_texture(WebGlRenderingContext::TEXTURE_2D, Some(texture));
            }
            // Apply layer opacity to textured sprites
            color[3] = if layer_opacity <= 0.01 { 
                0.0  // Make completely invisible when layer opacity is very low
            } else {
                color[3] * layer_opacity  // For textured sprites, use linear opacity
            };
            // Render textured sprite normally
            self.renderer.draw_quad(&vertices, &tex_coords, color, has_texture)?;
        } else {
            // For sprites without texture, unbind any texture and apply dramatic opacity effect
            self.renderer.gl.bind_texture(WebGlRenderingContext::TEXTURE_2D, None);
            
            let border_opacity = if layer_opacity <= 0.01 { 
                0.0  // Make completely invisible when layer opacity is very low
            } else {
                layer_opacity.powf(0.5)  // Use power curve for more dramatic effect on non-textured sprites
            };
            
            // Create border vertices in proper order for a continuous rectangle
            // vertices = [top-left-x, top-left-y, top-right-x, top-right-y, bottom-left-x, bottom-left-y, bottom-right-x, bottom-right-y]
            let border_vertices = vec![
                vertices[0], vertices[1],   // Top-left to Top-right
                vertices[2], vertices[3],
                vertices[2], vertices[3],   // Top-right to Bottom-right  
                vertices[6], vertices[7],
                vertices[6], vertices[7],   // Bottom-right to Bottom-left
                vertices[4], vertices[5],
                vertices[4], vertices[5],   // Bottom-left to Top-left
                vertices[0], vertices[1],
            ];
            // Use sprite color with dramatic layer opacity effect, but ensure it's visible
            let border_color = [color[0], color[1], color[2], (color[3] * border_opacity).max(0.2)];
            self.renderer.draw_lines(&border_vertices, border_color)?;
        }
        
        if is_selected {
            self.draw_selection_border(sprite, world_pos, size, is_primary_selected)?;
            // Only draw handles for the primary selected sprite
            if is_primary_selected {
                self.draw_handles(sprite, world_pos, size)?;
            }
        }
        
        Ok(())
    }
    
    fn calculate_sprite_vertices(&self, sprite: &Sprite, world_pos: Vec2, size: Vec2) -> Vec<f32> {
        if sprite.rotation != 0.0 {
            // Apply rotation around the sprite center
            let center_x = world_pos.x + size.x * 0.5;
            let center_y = world_pos.y + size.y * 0.5;
            let cos_rot = (sprite.rotation as f32).cos();
            let sin_rot = (sprite.rotation as f32).sin();
            let half_width = size.x * 0.5;
            let half_height = size.y * 0.5;
            
            // Calculate rotated corner positions
            let corners = [
                (-half_width, -half_height), // Top-left
                (half_width, -half_height),  // Top-right
                (-half_width, half_height),  // Bottom-left
                (half_width, half_height),   // Bottom-right
            ];
            
            let mut rotated_vertices = Vec::new();
            for (local_x, local_y) in corners {
                let rotated_x = local_x * cos_rot - local_y * sin_rot;
                let rotated_y = local_x * sin_rot + local_y * cos_rot;
                rotated_vertices.push(center_x + rotated_x);
                rotated_vertices.push(center_y + rotated_y);
            }
            rotated_vertices
        } else {
            // No rotation - use simple rectangle
            vec![
                world_pos.x, world_pos.y,                    // Top-left
                world_pos.x + size.x, world_pos.y,          // Top-right
                world_pos.x, world_pos.y + size.y,          // Bottom-left
                world_pos.x + size.x, world_pos.y + size.y, // Bottom-right
            ]
        }
    }
    
    fn draw_selection_border(&self, sprite: &Sprite, world_pos: Vec2, size: Vec2, is_primary: bool) -> Result<(), JsValue> {
        // Always use the same vertex calculation as the sprite itself for consistency
        let vertices = self.calculate_sprite_vertices(sprite, world_pos, size);
        
        // Create border from the calculated vertices in proper order
        // vertices = [top-left-x, top-left-y, top-right-x, top-right-y, bottom-left-x, bottom-left-y, bottom-right-x, bottom-right-y]
        let border_vertices = vec![
            vertices[0], vertices[1],   // Top-left to Top-right
            vertices[2], vertices[3],
            vertices[2], vertices[3],   // Top-right to Bottom-right  
            vertices[6], vertices[7],
            vertices[6], vertices[7],   // Bottom-right to Bottom-left
            vertices[4], vertices[5],
            vertices[4], vertices[5],   // Bottom-left to Top-left
            vertices[0], vertices[1],
        ];
        
        // Different colors for primary vs secondary selection
        let color = if is_primary {
            [0.2, 0.8, 0.2, 1.0]  // Bright green for primary selection
        } else {
            [0.8, 0.8, 0.2, 1.0]  // Yellow for secondary selections
        };
        
        self.renderer.draw_lines(&border_vertices, color)
    }
    
    fn draw_handles(&self, sprite: &Sprite, world_pos: Vec2, size: Vec2) -> Result<(), JsValue> {
        // Draw rotation handle (circle above sprite)
        let rotate_handle_pos = SpriteManager::get_rotation_handle_position(sprite, self.camera.zoom);
        let handle_size = 8.0 / self.camera.zoom as f32;
        self.draw_rotate_handle(rotate_handle_pos.x, rotate_handle_pos.y, handle_size)?;
        
        // Draw resize handles for non-rotated sprites only
        if sprite.rotation == 0.0 {
            let handle_size = 6.0 / self.camera.zoom as f32;
            
            // Corner handles
            self.draw_resize_handle(world_pos.x, world_pos.y, handle_size)?; // TopLeft
            self.draw_resize_handle(world_pos.x + size.x, world_pos.y, handle_size)?; // TopRight
            self.draw_resize_handle(world_pos.x, world_pos.y + size.y, handle_size)?; // BottomLeft
            self.draw_resize_handle(world_pos.x + size.x, world_pos.y + size.y, handle_size)?; // BottomRight
            
            // Side handles
            self.draw_resize_handle(world_pos.x + size.x * 0.5, world_pos.y, handle_size)?; // TopCenter
            self.draw_resize_handle(world_pos.x + size.x * 0.5, world_pos.y + size.y, handle_size)?; // BottomCenter
            self.draw_resize_handle(world_pos.x, world_pos.y + size.y * 0.5, handle_size)?; // LeftCenter
            self.draw_resize_handle(world_pos.x + size.x, world_pos.y + size.y * 0.5, handle_size)?; // RightCenter
        }
        
        Ok(())
    }
    
    fn draw_resize_handle(&self, x: f32, y: f32, size: f32) -> Result<(), JsValue> {
        let half = size * 0.5;
        let vertices = [
            x - half, y - half,
            x + half, y - half,
            x - half, y + half,
            x + half, y + half,
        ];
        let tex_coords = [0.0, 0.0, 1.0, 0.0, 0.0, 1.0, 1.0, 1.0];
        self.renderer.draw_quad(&vertices, &tex_coords, [1.0, 1.0, 1.0, 1.0], false)?;
        
        // Black border
        let border = [
            x - half, y - half,
            x + half, y - half,
            x + half, y + half,
            x - half, y + half,
            x - half, y - half,
        ];
        self.renderer.draw_lines(&border, [0.0, 0.0, 0.0, 1.0])
    }
    
    fn draw_rotate_handle(&self, x: f32, y: f32, size: f32) -> Result<(), JsValue> {
        // Draw a simple circle approximation using lines
        let radius = size * 0.7;
        let mut vertices = Vec::new();
        let segments = 16;
        for i in 0..segments {
            let angle1 = (i as f32) * 2.0 * std::f32::consts::PI / (segments as f32);
            let angle2 = ((i + 1) as f32) * 2.0 * std::f32::consts::PI / (segments as f32);
            vertices.extend_from_slice(&[
                x + radius * angle1.cos(), y + radius * angle1.sin(),
                x + radius * angle2.cos(), y + radius * angle2.sin(),
            ]);
        }
        self.renderer.draw_lines(&vertices, [0.8, 0.8, 0.8, 1.0])
    }
    
    fn get_world_view_bounds(&self) -> Rect {
        let min = self.camera.screen_to_world(Vec2::new(0.0, 0.0));
        let max = self.camera.screen_to_world(self.canvas_size);
        Rect::new(min.x, min.y, max.x - min.x, max.y - min.y)
    }
    
    fn snap_to_grid(&self, world_pos: Vec2) -> Vec2 {
        if self.grid_snapping {
            // Snap to grid line intersections, then we'll adjust for centering in the sprite positioning
            Vec2::new(
                (world_pos.x / self.grid_size).round() * self.grid_size,
                (world_pos.y / self.grid_size).round() * self.grid_size
            )
        } else {
            world_pos
        }
    }
    
    fn snap_sprite_to_grid_center(&self, sprite_top_left: Vec2) -> Vec2 {
        if self.grid_snapping {
            // Calculate which grid cell the sprite should be in based on its top-left corner
            // Then position it so its center aligns with the grid cell center
            let grid_x = (sprite_top_left.x / self.grid_size).round();
            let grid_y = (sprite_top_left.y / self.grid_size).round();
            
            // Position sprite so its center is at the grid center
            // Grid center is at (grid_x * grid_size + grid_size/2, grid_y * grid_size + grid_size/2)
            // But we need to return the top-left position, so subtract half sprite size... 
            // Actually, let's keep it simple and snap to grid intersections for now
            Vec2::new(
                grid_x * self.grid_size,
                grid_y * self.grid_size
            )
        } else {
            sprite_top_left
        }
    }
    
    fn draw_area_selection_rect(&self, min: Vec2, max: Vec2) -> Result<(), JsValue> {
        // Draw selection rectangle outline
        let border_vertices = vec![
            min.x, min.y,     // Top-left to Top-right
            max.x, min.y,
            max.x, min.y,     // Top-right to Bottom-right
            max.x, max.y,
            max.x, max.y,     // Bottom-right to Bottom-left
            min.x, max.y,
            min.x, max.y,     // Bottom-left to Top-left
            min.x, min.y,
        ];
        self.renderer.draw_lines(&border_vertices, [0.3, 0.7, 1.0, 0.8])?;
        
        // Draw semi-transparent fill
        let fill_vertices = vec![
            min.x, min.y,     // Top-left
            max.x, min.y,     // Top-right
            min.x, max.y,     // Bottom-left
            max.x, max.y,     // Bottom-right
        ];
        let tex_coords = [0.0, 0.0, 1.0, 0.0, 0.0, 1.0, 1.0, 1.0];
        self.renderer.draw_quad(&fill_vertices, &tex_coords, [0.3, 0.7, 1.0, 0.2], false)?;
        
        Ok(())
    }
    
    // Public API methods
    #[wasm_bindgen]
    pub fn resize_canvas(&mut self, width: f32, height: f32) {
        self.canvas_size = Vec2::new(width, height);
        self.update_view_matrix();
    }
    
    #[wasm_bindgen]
    pub fn handle_wheel(&mut self, screen_x: f32, screen_y: f32, delta_y: f32) {
        self.camera.handle_wheel(screen_x, screen_y, delta_y);
        self.update_view_matrix();
    }
    
    #[wasm_bindgen]
    pub fn set_zoom(&mut self, zoom: f64) {
        self.camera.zoom = zoom.clamp(0.1, 5.0);
        self.update_view_matrix();
    }
    
    #[wasm_bindgen]
    pub fn center_camera(&mut self, world_x: f64, world_y: f64) {
        self.camera.center_on(world_x, world_y);
        self.update_view_matrix();
    }
    
    #[wasm_bindgen]
    pub fn set_camera(&mut self, world_x: f64, world_y: f64, zoom: f64) {
        self.camera.world_x = world_x;
        self.camera.world_y = world_y;
        self.camera.zoom = zoom.clamp(0.1, 5.0);
        self.update_view_matrix();
    }
    
    #[wasm_bindgen]
    pub fn screen_to_world(&self, screen_x: f32, screen_y: f32) -> Vec<f64> {
        let world = self.camera.screen_to_world(Vec2::new(screen_x, screen_y));
        vec![world.x as f64, world.y as f64]
    }
    
    #[wasm_bindgen]
    pub fn get_cursor_type(&self, screen_x: f32, screen_y: f32) -> String {
        let world_pos = self.camera.screen_to_world(Vec2::new(screen_x, screen_y));
        
        if let Some(selected_id) = &self.input.selected_sprite_id {
            if let Some((sprite, _)) = self.find_sprite(selected_id) {
                // Check rotation handle first (not affected by rotation)
                let rotate_handle_pos = SpriteManager::get_rotation_handle_position(sprite, self.camera.zoom);
                let handle_size = 8.0 / self.camera.zoom as f32;
                if HandleDetector::point_in_handle(world_pos, rotate_handle_pos.x, rotate_handle_pos.y, handle_size) {
                    return "crosshair".to_string();
                }
                
                if sprite.rotation != 0.0 {
                    // For rotated sprites, only show move cursor (no resize handles)
                    if sprite.contains_world_point(world_pos) {
                        return "move".to_string();
                    }
                } else {
                    // Non-rotated sprite - check for resize handles
                    if let Some(handle) = HandleDetector::get_resize_handle_for_non_rotated_sprite(sprite, world_pos, self.camera.zoom) {
                        return HandleDetector::get_cursor_for_handle(handle).to_string();
                    }
                    
                    // Check if over sprite body
                    if sprite.contains_world_point(world_pos) {
                        return "move".to_string();
                    }
                }
            }
        }
        
        "default".to_string()
    }
    
    #[wasm_bindgen]
    pub fn handle_mouse_down(&mut self, screen_x: f32, screen_y: f32) {
        self.handle_mouse_down_with_modifiers(screen_x, screen_y, false)
    }
    
    #[wasm_bindgen]
    pub fn handle_mouse_down_with_ctrl(&mut self, screen_x: f32, screen_y: f32, ctrl_pressed: bool) {
        self.handle_mouse_down_with_modifiers(screen_x, screen_y, ctrl_pressed)
    }
    
    fn handle_mouse_down_with_modifiers(&mut self, screen_x: f32, screen_y: f32, ctrl_pressed: bool) {
        let world_pos = self.camera.screen_to_world(Vec2::new(screen_x, screen_y));
        self.input.last_mouse_screen = Vec2::new(screen_x, screen_y);
        
        // Check if we're in fog drawing mode first
        if matches!(self.input.input_mode, InputMode::FogDraw | InputMode::FogErase) {
            // Start drawing a new fog rectangle
            use crate::input::FogDrawMode;
            let fog_mode = match self.input.input_mode {
                InputMode::FogErase => FogDrawMode::Reveal,
                _ => FogDrawMode::Hide,
            };
            
            let id = format!("interactive_fog_{}", js_sys::Date::now() as u64);
            self.input.start_fog_draw(world_pos, fog_mode);
            
            use crate::fog::FogMode;
            let fog_system_mode = match fog_mode {
                FogDrawMode::Reveal => FogMode::Reveal,
                FogDrawMode::Hide => FogMode::Hide,
            };
            
            self.fog.start_interactive_rectangle(id, world_pos, fog_system_mode);
            return;
        }
        
        // Check if we're in light drag mode
        if self.input.input_mode == InputMode::LightDrag {
            // Check if clicking on a light source to start dragging
            if let Some(light_id) = self.lighting.get_light_at_position(world_pos, 30.0) {
                if let Some(light_pos) = self.lighting.get_light_position(&light_id) {
                    self.input.start_light_drag(light_id, world_pos, light_pos);
                    return;
                }
            }
        }
        
        // First check for multi-select operations if Ctrl is not pressed
        if !ctrl_pressed {
            let clicked_sprite = self.find_sprite_at_position(world_pos);
            if let Some(sprite_id) = clicked_sprite {
                if self.input.is_sprite_selected(&sprite_id) && self.input.has_multiple_selected() {
                    // Clicking on an already selected sprite with multiple selections - start multi-move
                    let sprite_id_clone = sprite_id.clone();
                    self.input.selected_sprite_id = Some(sprite_id_clone); // Set as primary for reference
                    self.input.input_mode = InputMode::SpriteMove;
                    // Calculate offset from click position to primary sprite's top-left corner
                    if let Some((sprite, _)) = self.find_sprite(&sprite_id) {
                        let sprite_top_left = Vec2::new(sprite.world_x as f32, sprite.world_y as f32);
                        self.input.drag_offset = world_pos - sprite_top_left;
                    }
                    return; // Early return to skip handle detection
                }
            }
        }
        
        // Check if we have a selected sprite to interact with for handles/single operations
        let selected_sprite_info = if let Some(selected_id) = &self.input.selected_sprite_id {
            self.find_sprite(selected_id).map(|(sprite, _)| {
                (sprite.id.clone(), sprite.rotation, sprite.world_x, sprite.world_y, 
                 sprite.width, sprite.scale_x, sprite.height, sprite.scale_y)
            })
        } else {
            None
        };
        
        if let Some((sprite_id, rotation, world_x, world_y, width, scale_x, height, scale_y)) = selected_sprite_info {
            // Reconstruct sprite info for calculations
            let sprite_pos = Vec2::new(world_x as f32, world_y as f32);
            let sprite_size = Vec2::new((width * scale_x) as f32, (height * scale_y) as f32);
            
            // Create temporary sprite for calculations
            let temp_sprite = Sprite {
                id: sprite_id.clone(),
                world_x, world_y, width, height, scale_x, scale_y, rotation,
                layer: String::new(), texture_id: String::new(), tint_color: [1.0, 1.0, 1.0, 1.0]
            };
            
            // Check rotation handle first (only for single selection or primary selection)
            if !self.input.has_multiple_selected() || self.input.selected_sprite_id.as_ref() == Some(&sprite_id) {
                let rotate_handle_x = sprite_pos.x + sprite_size.x * 0.5;
                let rotate_handle_y = sprite_pos.y - 20.0 / self.camera.zoom as f32;
                let handle_size = 8.0 / self.camera.zoom as f32;
                if HandleDetector::point_in_handle(world_pos, rotate_handle_x, rotate_handle_y, handle_size) {
                    self.input.input_mode = InputMode::SpriteRotate;
                    // Store initial rotation state to prevent jumping
                    let (start_angle, initial_rotation) = SpriteManager::start_rotation(&temp_sprite, world_pos);
                    self.input.rotation_start_angle = start_angle;
                    self.input.sprite_initial_rotation = initial_rotation;
                    return;
                }
                
                // Handle rotated vs non-rotated sprites differently  
                if rotation != 0.0 {
                    // For rotated sprites, only allow rotation and movement (not resizing)
                    if temp_sprite.contains_world_point(world_pos) {
                        self.input.input_mode = InputMode::SpriteMove;
                        // Calculate offset from click position to sprite's top-left corner
                        let sprite_top_left = Vec2::new(world_x as f32, world_y as f32);
                        self.input.drag_offset = world_pos - sprite_top_left;
                        return;
                    }
                } else {
                    // Non-rotated sprite - check for resize handles (only for single selection)
                    if !self.input.has_multiple_selected() {
                        if let Some(handle) = HandleDetector::get_resize_handle_for_non_rotated_sprite(&temp_sprite, world_pos, self.camera.zoom) {
                            self.input.input_mode = InputMode::SpriteResize(handle);
                            return;
                        }
                    }
                }
            }
        }
        
        // Check for sprite selection or start area selection
        if ctrl_pressed {
            // If Ctrl is pressed, either add to selection or start area selection
            let clicked_sprite = self.find_sprite_at_position(world_pos);
            if let Some(sprite_id) = clicked_sprite {
                // Ctrl+click on sprite: toggle selection
                if self.input.is_sprite_selected(&sprite_id) {
                    self.input.remove_from_selection(&sprite_id);
                } else {
                    self.input.add_to_selection(sprite_id);
                }
            } else {
                // Ctrl+click on empty space: start area selection
                self.input.start_area_selection(world_pos);
            }
        } else {
            // Normal click: check if clicking on already selected sprite for multi-move
            let clicked_sprite = self.find_sprite_at_position(world_pos);
            if let Some(sprite_id) = clicked_sprite {
                if self.input.is_sprite_selected(&sprite_id) && self.input.has_multiple_selected() {
                    // Clicking on an already selected sprite with multiple selections - start multi-move
                    let sprite_id_clone = sprite_id.clone();
                    self.input.selected_sprite_id = Some(sprite_id_clone); // Set as primary for reference
                    self.input.input_mode = InputMode::SpriteMove;
                    // Calculate offset from click position to primary sprite's top-left corner
                    if let Some((sprite, _)) = self.find_sprite(&sprite_id) {
                        let sprite_top_left = Vec2::new(sprite.world_x as f32, sprite.world_y as f32);
                        self.input.drag_offset = world_pos - sprite_top_left;
                    }
                } else {
                    // Normal single selection
                    self.select_sprite_at_position(world_pos);
                }
            } else {
                // Clicked on empty space - clear selection and start camera pan
                self.input.clear_selection();
                self.input.input_mode = InputMode::CameraPan;
            }
        }
    }
    
    #[wasm_bindgen]
    pub fn handle_mouse_move(&mut self, screen_x: f32, screen_y: f32) {
        let current_screen = Vec2::new(screen_x, screen_y);
        let world_pos = self.camera.screen_to_world(current_screen);
        
        match self.input.input_mode {
            InputMode::SpriteMove => {
                // Move all selected sprites together
                if self.input.has_multiple_selected() {
                    // Multi-sprite movement - move all selected sprites by the same world delta
                    let last_world_pos = self.camera.screen_to_world(self.input.last_mouse_screen);
                    
                    if self.grid_snapping {
                        // For grid snapping with multi-select, we need to maintain relative positions
                        // but snap the group as a whole to the grid
                        let current_snapped = self.snap_to_grid(world_pos);
                        let last_snapped = self.snap_to_grid(last_world_pos);
                        let delta = current_snapped - last_snapped;
                        
                        // Only move if there's actually a change in snapped position
                        if delta.x.abs() > 0.001 || delta.y.abs() > 0.001 {
                            for sprite_id in &self.input.selected_sprite_ids.clone() {
                                for layer in self.layers.values_mut() {
                                    if let Some(sprite) = layer.sprites.iter_mut().find(|s| &s.id == sprite_id) {
                                        sprite.world_x += delta.x as f64;
                                        sprite.world_y += delta.y as f64;
                                        break;
                                    }
                                }
                            }
                        }
                    } else {
                        // Normal movement without snapping
                        let delta = world_pos - last_world_pos;
                        for sprite_id in &self.input.selected_sprite_ids.clone() {
                            for layer in self.layers.values_mut() {
                                if let Some(sprite) = layer.sprites.iter_mut().find(|s| &s.id == sprite_id) {
                                    sprite.world_x += delta.x as f64;
                                    sprite.world_y += delta.y as f64;
                                    break;
                                }
                            }
                        }
                    }
                } else if let Some(sprite_id) = &self.input.selected_sprite_id {
                    // Single sprite movement with grid snapping
                    let target_pos = world_pos;
                    let drag_offset = self.input.drag_offset;
                    let grid_snapping = self.grid_snapping;
                    let grid_size = self.grid_size;
                    
                    for layer in self.layers.values_mut() {
                        if let Some(sprite) = layer.sprites.iter_mut().find(|s| &s.id == sprite_id) {
                            if grid_snapping {
                                // Calculate the intended sprite center position
                                let intended_center_x = (target_pos.x - drag_offset.x) as f32;
                                let intended_center_y = (target_pos.y - drag_offset.y) as f32;
                                
                                // Find the nearest grid cell center
                                let grid_cell_center_x = (intended_center_x / grid_size).floor() * grid_size + grid_size * 0.5;
                                let grid_cell_center_y = (intended_center_y / grid_size).floor() * grid_size + grid_size * 0.5;
                                
                                // Calculate sprite's actual size
                                let sprite_width = (sprite.width * sprite.scale_x) as f32;
                                let sprite_height = (sprite.height * sprite.scale_y) as f32;
                                
                                // Position sprite so its center aligns with grid cell center
                                // sprite.world_x/y represents the top-left corner, so we need to offset by half the sprite size
                                sprite.world_x = (grid_cell_center_x - sprite_width * 0.5) as f64;
                                sprite.world_y = (grid_cell_center_y - sprite_height * 0.5) as f64;
                            } else {
                                SpriteManager::move_sprite_to_position(sprite, target_pos, drag_offset);
                            }
                            break;
                        }
                    }
                }
            }
            InputMode::SpriteResize(handle) => {
                if let Some(sprite_id) = &self.input.selected_sprite_id {
                    let sprite_id = sprite_id.clone(); // Clone to avoid borrow issues
                    for layer in self.layers.values_mut() {
                        if let Some(sprite) = layer.sprites.iter_mut().find(|s| s.id == sprite_id) {
                            SpriteManager::resize_sprite_with_handle(sprite, handle, world_pos);
                            break;
                        }
                    }
                }
            }
            InputMode::SpriteRotate => {
                if let Some(sprite_id) = &self.input.selected_sprite_id {
                    for layer in self.layers.values_mut() {
                        if let Some(sprite) = layer.sprites.iter_mut().find(|s| &s.id == sprite_id) {
                            SpriteManager::update_rotation(sprite, world_pos, self.input.rotation_start_angle, self.input.sprite_initial_rotation);
                            break;
                        }
                    }
                }
            }
            InputMode::CameraPan => {
                let screen_delta = current_screen - self.input.last_mouse_screen;
                let world_delta = screen_delta * (1.0 / self.camera.zoom as f32);
                self.camera.world_x -= world_delta.x as f64;
                self.camera.world_y -= world_delta.y as f64;
                self.update_view_matrix();
            }
            InputMode::AreaSelect => {
                // Update area selection rectangle
                self.input.update_area_selection(world_pos);
            }
            InputMode::LightDrag => {
                // Update light drag position
                if let Some(new_pos) = self.input.update_light_drag(world_pos) {
                    if let Some(ref light_id) = self.input.selected_light_id {
                        self.lighting.update_light_position(light_id, new_pos);
                    }
                }
            }
            InputMode::FogDraw | InputMode::FogErase => {
                // Update fog rectangle drawing
                self.input.update_fog_draw(world_pos);
            }
            _ => {}
        }
        
        self.input.last_mouse_screen = current_screen;
    }
    
    #[wasm_bindgen]
    pub fn handle_mouse_up(&mut self, screen_x: f32, screen_y: f32) {
        let world_pos = self.camera.screen_to_world(Vec2::new(screen_x, screen_y));
        
        match self.input.input_mode {
            InputMode::AreaSelect => {
                // Complete area selection
                if let Some((min, max)) = self.input.get_area_selection_rect() {
                    self.select_sprites_in_area(min, max);
                }
                self.input.finish_area_selection();
            }
            InputMode::LightDrag => {
                // End light dragging
                self.input.end_light_drag();
            }
            InputMode::FogDraw | InputMode::FogErase => {
                // Complete fog rectangle drawing
                if let Some((start, end, mode)) = self.input.end_fog_draw() {
                    use crate::fog::FogMode;
                    let fog_mode = match mode {
                        crate::input::FogDrawMode::Reveal => FogMode::Reveal,
                        crate::input::FogDrawMode::Hide => FogMode::Hide,
                    };
                    
                    // Create a permanent fog rectangle
                    let id = format!("fog_rect_{}", js_sys::Date::now() as u64);
                    let mode_str = match fog_mode {
                        FogMode::Reveal => "reveal",
                        FogMode::Hide => "hide",
                    };
                    
                    // Only create if rectangle has minimum size
                    let min_size = 10.0;
                    if (end.x - start.x).abs() > min_size && (end.y - start.y).abs() > min_size {
                        self.fog.add_fog_rectangle(id, start.x, start.y, end.x, end.y, mode_str);
                    }
                }
                // Return to None mode after fog drawing
                self.input.input_mode = InputMode::None;
            }
            _ => {
                self.input.input_mode = InputMode::None;
            }
        }
    }
    
    fn select_sprites_in_area(&mut self, min: Vec2, max: Vec2) {
        let mut selected_sprites = Vec::new();
        
        // Find all sprites that intersect with the selection rectangle
        for (_, layer) in &self.layers {
            if layer.selectable {
                for sprite in &layer.sprites {
                    let sprite_pos = Vec2::new(sprite.world_x as f32, sprite.world_y as f32);
                    let sprite_size = Vec2::new(
                        (sprite.width * sprite.scale_x) as f32,
                        (sprite.height * sprite.scale_y) as f32
                    );
                    
                    // Check if sprite rectangle intersects with selection rectangle
                    let sprite_min = sprite_pos;
                    let sprite_max = sprite_pos + sprite_size;
                    
                    let intersects = sprite_max.x >= min.x && sprite_min.x <= max.x &&
                                   sprite_max.y >= min.y && sprite_min.y <= max.y;
                    
                    if intersects {
                        selected_sprites.push(sprite.id.clone());
                    }
                }
            }
        }
        
        // Update selection
        if !selected_sprites.is_empty() {
            self.input.clear_selection();
            for sprite_id in selected_sprites {
                self.input.add_to_selection(sprite_id);
            }
        }
    }

    fn find_sprite_at_position(&self, world_pos: Vec2) -> Option<String> {
        // Search in reverse z-order (top layers first)
        let mut sorted_layers: Vec<_> = self.layers.iter().collect();
        sorted_layers.sort_by_key(|(_, layer)| std::cmp::Reverse(layer.z_order));
        
        for (_, layer) in sorted_layers {
            if layer.selectable {
                for sprite in layer.sprites.iter().rev() {
                    if sprite.contains_world_point(world_pos) {
                        return Some(sprite.id.clone());
                    }
                }
            }
        }
        None
    }

    fn select_sprite_at_position(&mut self, world_pos: Vec2) {
        if let Some(sprite_id) = self.find_sprite_at_position(world_pos) {
            // Single selection - clear others and select this one
            self.input.set_single_selection(sprite_id);
            self.input.input_mode = InputMode::SpriteMove;
            // Calculate offset from click position to sprite's top-left corner
            if let Some((sprite, _)) = self.find_sprite(&self.input.selected_sprite_id.as_ref().unwrap()) {
                let sprite_top_left = Vec2::new(sprite.world_x as f32, sprite.world_y as f32);
                self.input.drag_offset = world_pos - sprite_top_left;
            }
        } else {
            // Clicked on empty space - clear selection and start camera pan
            self.input.clear_selection();
            self.input.input_mode = InputMode::CameraPan;
        }
    }
    
    fn find_sprite(&self, sprite_id: &str) -> Option<(&Sprite, &str)> {
        for (layer_name, layer) in &self.layers {
            if let Some(sprite) = layer.sprites.iter().find(|s| s.id == sprite_id) {
                return Some((sprite, layer_name));
            }
        }
        None
    }
    
    // Sprite management methods
    #[wasm_bindgen]
    pub fn add_sprite_to_layer(&mut self, layer_name: &str, sprite_data: &JsValue) -> Result<String, JsValue> {
        let mut sprite: Sprite = sprite_data.into_serde()
            .map_err(|e| JsValue::from_str(&format!("Failed to parse sprite: {}", e)))?;
        
        if sprite.id.is_empty() {
            sprite.id = format!("sprite_{}", js_sys::Math::random());
        }
        
        let sprite_id = sprite.id.clone();
        
        if let Some(layer) = self.layers.get_mut(layer_name) {
            layer.sprites.push(sprite);
        } else {
            return Err(JsValue::from_str("Layer not found"));
        }
        
        Ok(sprite_id)
    }
    
    #[wasm_bindgen]
    pub fn remove_sprite(&mut self, sprite_id: &str) -> bool {
        for layer in self.layers.values_mut() {
            if let Some(index) = layer.sprites.iter().position(|s| s.id == sprite_id) {
                layer.sprites.remove(index);
                if self.input.selected_sprite_id.as_ref() == Some(&sprite_id.to_string()) {
                    self.input.selected_sprite_id = None;
                }
                return true;
            }
        }
        false
    }
    
    #[wasm_bindgen]
    pub fn rotate_sprite(&mut self, sprite_id: &str, rotation_degrees: f64) -> bool {
        for layer in self.layers.values_mut() {
            if let Some(sprite) = layer.sprites.iter_mut().find(|s| s.id == sprite_id) {
                sprite.rotation = rotation_degrees.to_radians();
                return true;
            }
        }
        false
    }
    
    #[wasm_bindgen]
    pub fn toggle_grid(&mut self) {
        self.grid_enabled = !self.grid_enabled;
    }
    
    #[wasm_bindgen]
    pub fn set_grid_enabled(&mut self, enabled: bool) {
        self.grid_enabled = enabled;
    }
    
    #[wasm_bindgen]
    pub fn toggle_grid_snapping(&mut self) {
        self.grid_snapping = !self.grid_snapping;
    }
    
    #[wasm_bindgen]
    pub fn set_grid_snapping(&mut self, enabled: bool) {
        self.grid_snapping = enabled;
    }
    
    #[wasm_bindgen]
    pub fn set_grid_size(&mut self, size: f32) {
        self.grid_size = size.max(10.0).min(200.0); // Reasonable bounds
    }
    
    #[wasm_bindgen]
    pub fn get_grid_size(&self) -> f32 {
        self.grid_size
    }
    
    #[wasm_bindgen]
    pub fn is_grid_snapping_enabled(&self) -> bool {
        self.grid_snapping
    }
    
    // Texture management
    #[wasm_bindgen]
    pub fn load_texture(&mut self, name: &str, image: &HtmlImageElement) -> Result<(), JsValue> {
        let texture = self.renderer.gl.create_texture().ok_or("Failed to create texture")?;
        self.renderer.gl.bind_texture(WebGlRenderingContext::TEXTURE_2D, Some(&texture));
        self.renderer.gl.tex_image_2d_with_u32_and_u32_and_html_image_element(
            WebGlRenderingContext::TEXTURE_2D, 0, WebGlRenderingContext::RGBA as i32,
            WebGlRenderingContext::RGBA, WebGlRenderingContext::UNSIGNED_BYTE, image
        )?;
        self.renderer.gl.tex_parameteri(WebGlRenderingContext::TEXTURE_2D, WebGlRenderingContext::TEXTURE_MIN_FILTER, WebGlRenderingContext::NEAREST as i32);
        self.renderer.gl.tex_parameteri(WebGlRenderingContext::TEXTURE_2D, WebGlRenderingContext::TEXTURE_MAG_FILTER, WebGlRenderingContext::NEAREST as i32);
        self.renderer.gl.tex_parameteri(WebGlRenderingContext::TEXTURE_2D, WebGlRenderingContext::TEXTURE_WRAP_S, WebGlRenderingContext::CLAMP_TO_EDGE as i32);
        self.renderer.gl.tex_parameteri(WebGlRenderingContext::TEXTURE_2D, WebGlRenderingContext::TEXTURE_WRAP_T, WebGlRenderingContext::CLAMP_TO_EDGE as i32);
        self.textures.insert(name.to_string(), texture);
        Ok(())
    }

    // Layer management methods
    #[wasm_bindgen]
    pub fn set_layer_opacity(&mut self, layer_name: &str, opacity: f32) {
        if let Some(layer) = self.layers.get_mut(layer_name) {
            layer.opacity = opacity.clamp(0.0, 1.0);
        }
    }

    #[wasm_bindgen]
    pub fn set_layer_visible(&mut self, layer_name: &str, visible: bool) {
        if let Some(layer) = self.layers.get_mut(layer_name) {
            layer.visible = visible;
        }
    }

    // Right-click handling for context menu
    #[wasm_bindgen]
    pub fn handle_right_click(&self, screen_x: f32, screen_y: f32) -> Option<String> {
        let world_pos = self.camera.screen_to_world(Vec2::new(screen_x, screen_y));
        
        // Search for sprite at position (reverse z-order for top-most)
        let mut sorted_layers: Vec<_> = self.layers.iter().collect();
        sorted_layers.sort_by_key(|(_, layer)| std::cmp::Reverse(layer.z_order));
        
        for (_, layer) in sorted_layers {
            if layer.visible {
                for sprite in layer.sprites.iter().rev() {
                    if sprite.contains_world_point(world_pos) {
                        return Some(sprite.id.clone());
                    }
                }
            }
        }
        
        None
    }

    // Additional sprite management methods for frontend compatibility
    #[wasm_bindgen]
    pub fn delete_sprite(&mut self, sprite_id: &str) -> bool {
        self.remove_sprite(sprite_id)
    }

    #[wasm_bindgen]
    pub fn copy_sprite(&self, sprite_id: &str) -> Option<String> {
        if let Some((sprite, _)) = self.find_sprite(sprite_id) {
            // Convert sprite to JSON for copying
            if let Ok(json) = serde_json::to_string(sprite) {
                return Some(json);
            }
        }
        None
    }

    #[wasm_bindgen]
    pub fn paste_sprite(&mut self, layer_name: &str, sprite_json: &str, offset_x: f64, offset_y: f64) -> Result<String, JsValue> {
        let mut sprite: Sprite = serde_json::from_str(sprite_json)
            .map_err(|e| JsValue::from_str(&format!("Failed to parse sprite JSON: {}", e)))?;
        
        // Generate new ID and apply offset
        sprite.id = format!("sprite_{}", js_sys::Math::random());
        sprite.world_x += offset_x;
        sprite.world_y += offset_y;
        
        let sprite_id = sprite.id.clone();
        
        if let Some(layer) = self.layers.get_mut(layer_name) {
            layer.sprites.push(sprite);
        } else {
            return Err(JsValue::from_str("Layer not found"));
        }
        
        Ok(sprite_id)
    }

    #[wasm_bindgen]
    pub fn resize_sprite(&mut self, sprite_id: &str, new_width: f64, new_height: f64) -> bool {
        for layer in self.layers.values_mut() {
            if let Some(sprite) = layer.sprites.iter_mut().find(|s| s.id == sprite_id) {
                sprite.width = new_width;
                sprite.height = new_height;
                return true;
            }
        }
        false
    }

    // Alias for resize_canvas to match frontend expectations
    #[wasm_bindgen]
    pub fn resize(&mut self, width: f32, height: f32) {
        self.resize_canvas(width, height);
    }

    // Lighting system methods
    #[wasm_bindgen]
    pub fn add_light(&mut self, id: &str, x: f32, y: f32) {
        let light = crate::lighting::Light::new(id.to_string(), x, y);
        self.lighting.add_light(light);
    }

    #[wasm_bindgen]
    pub fn remove_light(&mut self, id: &str) {
        self.lighting.remove_light(id);
    }

    #[wasm_bindgen]
    pub fn set_light_color(&mut self, id: &str, r: f32, g: f32, b: f32, a: f32) {
        if let Some(light) = self.lighting.get_light_mut(id) {
            light.set_color_struct(Color::new(r, g, b, a));
        }
    }

    #[wasm_bindgen]
    pub fn set_light_intensity(&mut self, id: &str, intensity: f32) {
        if let Some(light) = self.lighting.get_light_mut(id) {
            light.set_intensity(intensity);
        }
    }

    #[wasm_bindgen]
    pub fn set_light_radius(&mut self, id: &str, radius: f32) {
        if let Some(light) = self.lighting.get_light_mut(id) {
            light.set_radius(radius);
        }
    }

    #[wasm_bindgen]
    pub fn toggle_light(&mut self, id: &str) {
        if let Some(light) = self.lighting.get_light_mut(id) {
            light.toggle();
        }
    }

    #[wasm_bindgen]
    pub fn update_light_position(&mut self, id: &str, x: f32, y: f32) {
        self.lighting.update_light_position(id, Vec2::new(x, y));
    }

    #[wasm_bindgen]
    pub fn turn_on_all_lights(&mut self) {
        self.lighting.turn_on_all();
    }

    #[wasm_bindgen]
    pub fn turn_off_all_lights(&mut self) {
        self.lighting.turn_off_all();
    }

    #[wasm_bindgen]
    pub fn get_light_count(&self) -> usize {
        self.lighting.get_light_count()
    }

    #[wasm_bindgen]
    pub fn clear_lights(&mut self) {
        self.lighting.clear_lights();
    }

    // ===== FOG OF WAR METHODS =====

    #[wasm_bindgen]
    pub fn set_gm_mode(&mut self, is_gm: bool) {
        self.fog.set_gm_mode(is_gm);
    }

    #[wasm_bindgen]
    pub fn add_fog_rectangle(&mut self, id: &str, start_x: f32, start_y: f32, end_x: f32, end_y: f32, mode: &str) {
        self.fog.add_fog_rectangle(id.to_string(), start_x, start_y, end_x, end_y, mode);
    }

    #[wasm_bindgen]
    pub fn remove_fog_rectangle(&mut self, id: &str) {
        self.fog.remove_fog_rectangle(id);
    }

    #[wasm_bindgen]
    pub fn clear_fog(&mut self) {
        self.fog.clear_fog();
    }

    #[wasm_bindgen]
    pub fn hide_entire_table(&mut self, table_width: f32, table_height: f32) {
        self.fog.hide_entire_table(table_width, table_height);
    }

    #[wasm_bindgen]
    pub fn is_point_in_fog(&self, x: f32, y: f32) -> bool {
        self.fog.is_point_in_fog(x, y)
    }

    #[wasm_bindgen]
    pub fn get_fog_count(&self) -> usize {
        self.fog.get_fog_count()
    }

    // ============================================================================
    // INTERACTIVE CONTROLS - Mouse-based light positioning and fog drawing
    // ============================================================================
    
    // Light interaction methods
    #[wasm_bindgen]
    pub fn get_light_at_position(&self, x: f32, y: f32) -> Option<String> {
        let world_pos = Vec2::new(x, y);
        self.lighting.get_light_at_position(world_pos, 30.0).map(|s| s.clone())
    }

    #[wasm_bindgen]
    pub fn start_light_drag(&mut self, light_id: &str, world_x: f32, world_y: f32) -> bool {
        if let Some(light_pos) = self.lighting.get_light_position(light_id) {
            self.input.start_light_drag(light_id.to_string(), Vec2::new(world_x, world_y), light_pos);
            true
        } else {
            false
        }
    }

    #[wasm_bindgen]
    pub fn update_light_drag(&mut self, world_x: f32, world_y: f32) -> bool {
        if let Some(new_pos) = self.input.update_light_drag(Vec2::new(world_x, world_y)) {
            if let Some(ref light_id) = self.input.selected_light_id {
                self.lighting.update_light_position(light_id, new_pos);
                true
            } else {
                false
            }
        } else {
            false
        }
    }

    #[wasm_bindgen]
    pub fn end_light_drag(&mut self) -> Option<String> {
        self.input.end_light_drag()
    }

    #[wasm_bindgen]
    pub fn get_light_radius(&self, light_id: &str) -> f32 {
        self.lighting.get_light_radius(light_id).unwrap_or(0.0)
    }

    // Fog interaction methods
    #[wasm_bindgen]
    pub fn start_fog_draw(&mut self, world_x: f32, world_y: f32, mode: &str) -> String {
        use crate::input::FogDrawMode;
        let fog_mode = match mode {
            "reveal" => FogDrawMode::Reveal,
            _ => FogDrawMode::Hide,
        };
        
        let id = format!("interactive_fog_{}", js_sys::Date::now() as u64);
        let world_pos = Vec2::new(world_x, world_y);
        
        self.input.start_fog_draw(world_pos, fog_mode);
        
        use crate::fog::FogMode;
        let fog_system_mode = match fog_mode {
            FogDrawMode::Reveal => FogMode::Reveal,
            FogDrawMode::Hide => FogMode::Hide,
        };
        
        self.fog.start_interactive_rectangle(id.clone(), world_pos, fog_system_mode);
        id
    }

    #[wasm_bindgen]
    pub fn update_fog_draw(&mut self, rect_id: &str, world_x: f32, world_y: f32) -> bool {
        let world_pos = Vec2::new(world_x, world_y);
        
        if self.input.update_fog_draw(world_pos).is_some() {
            self.fog.update_interactive_rectangle(rect_id, world_pos)
        } else {
            false
        }
    }

    #[wasm_bindgen]
    pub fn finish_fog_draw(&mut self, rect_id: &str) -> bool {
        if let Some((_, _, _)) = self.input.end_fog_draw() {
            self.fog.finish_interactive_rectangle(rect_id)
        } else {
            false
        }
    }

    #[wasm_bindgen]
    pub fn cancel_fog_draw(&mut self, rect_id: &str) {
        self.input.end_fog_draw();
        self.fog.cancel_interactive_rectangle(rect_id);
    }

    #[wasm_bindgen]
    pub fn get_fog_at_position(&self, x: f32, y: f32) -> Option<String> {
        let world_pos = Vec2::new(x, y);
        self.fog.get_fog_rectangle_at_position(world_pos).map(|s| s.clone())
    }

    // Tool mode management for fog drawing
    #[wasm_bindgen]
    pub fn set_fog_draw_mode(&mut self, enabled: bool) {
        if enabled {
            self.input.input_mode = InputMode::FogDraw;
        } else if matches!(self.input.input_mode, InputMode::FogDraw | InputMode::FogErase) {
            self.input.input_mode = InputMode::None;
        }
    }

    #[wasm_bindgen]
    pub fn set_fog_erase_mode(&mut self, enabled: bool) {
        if enabled {
            self.input.input_mode = InputMode::FogErase;
        } else if matches!(self.input.input_mode, InputMode::FogDraw | InputMode::FogErase) {
            self.input.input_mode = InputMode::None;
        }
    }

    #[wasm_bindgen]
    pub fn set_light_drag_mode(&mut self, enabled: bool) {
        if enabled {
            self.input.input_mode = InputMode::LightDrag;
        } else if self.input.input_mode == InputMode::LightDrag {
            self.input.input_mode = InputMode::None;
        }
    }

    #[wasm_bindgen]
    pub fn is_in_fog_draw_mode(&self) -> bool {
        matches!(self.input.input_mode, InputMode::FogDraw | InputMode::FogErase)
    }

    #[wasm_bindgen]
    pub fn is_in_light_drag_mode(&self) -> bool {
        self.input.input_mode == InputMode::LightDrag
    }

    #[wasm_bindgen]
    pub fn get_current_input_mode(&self) -> String {
        match self.input.input_mode {
            InputMode::None => "none".to_string(),
            InputMode::CameraPan => "camera_pan".to_string(),
            InputMode::SpriteMove => "sprite_move".to_string(),
            InputMode::SpriteResize(_) => "sprite_resize".to_string(),
            InputMode::SpriteRotate => "sprite_rotate".to_string(),
            InputMode::AreaSelect => "area_select".to_string(),
            InputMode::LightDrag => "light_drag".to_string(),
            InputMode::FogDraw => "fog_draw".to_string(),
            InputMode::FogErase => "fog_erase".to_string(),
        }
    }
}
