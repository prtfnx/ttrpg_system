use wasm_bindgen::prelude::*;
use web_sys::{HtmlCanvasElement, WebGl2RenderingContext as WebGlRenderingContext, WebGlTexture, HtmlImageElement};
use std::collections::HashMap;
use gloo_utils::format::JsValueSerdeExt;

use crate::types::*;
use crate::math::*;
use crate::camera::Camera;
use crate::input::{InputHandler, InputMode, ResizeHandle, HandleDetector};
use crate::sprite_manager::SpriteManager;
use crate::webgl_renderer::WebGLRenderer;

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
}

#[wasm_bindgen]
impl RenderEngine {
    #[wasm_bindgen(constructor)]
    pub fn new(canvas: HtmlCanvasElement) -> Result<RenderEngine, JsValue> {
        let gl = canvas.get_context("webgl2")?.unwrap().dyn_into::<WebGlRenderingContext>()?;
        let renderer = WebGLRenderer::new(gl)?;
        
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
        
        for (_, layer) in sorted_layers {
            if layer.visible {
                for sprite in &layer.sprites {
                    self.draw_sprite(sprite, layer.opacity)?;
                }
            }
        }
        
        Ok(())
    }
    
    fn update_view_matrix(&mut self) {
        self.view_matrix = self.camera.view_matrix(self.canvas_size);
        let matrix_array = self.view_matrix.to_array();
        self.renderer.set_view_matrix(&matrix_array, self.canvas_size);
    }
    
    fn draw_grid(&self) -> Result<(), JsValue> {
        let grid_size = 50.0;
        let world_bounds = self.get_world_view_bounds();
        
        let start_x = (world_bounds.min.x / grid_size).floor() * grid_size;
        let end_x = (world_bounds.max.x / grid_size).ceil() * grid_size;
        let start_y = (world_bounds.min.y / grid_size).floor() * grid_size;
        let end_y = (world_bounds.max.y / grid_size).ceil() * grid_size;
        
        let mut vertices = Vec::new();
        
        // Vertical lines
        let mut x = start_x;
        while x <= end_x {
            vertices.extend_from_slice(&[x, world_bounds.min.y, x, world_bounds.max.y]);
            x += grid_size;
        }
        
        // Horizontal lines
        let mut y = start_y;
        while y <= end_y {
            vertices.extend_from_slice(&[world_bounds.min.x, y, world_bounds.max.x, y]);
            y += grid_size;
        }
        
        self.renderer.draw_lines(&vertices, [0.2, 0.2, 0.2, 1.0])
    }
    
    fn draw_sprite(&self, sprite: &Sprite, layer_opacity: f32) -> Result<(), JsValue> {
        let is_selected = self.input.selected_sprite_id.as_ref() == Some(&sprite.id);
        let world_pos = Vec2::new(sprite.world_x as f32, sprite.world_y as f32);
        let size = Vec2::new(
            (sprite.width * sprite.scale_x) as f32,
            (sprite.height * sprite.scale_y) as f32
        );
        
        // Calculate sprite vertices with rotation
        let vertices = self.calculate_sprite_vertices(sprite, world_pos, size);
        let tex_coords = [0.0, 0.0, 1.0, 0.0, 0.0, 1.0, 1.0, 1.0];
        
        let mut color = sprite.tint_color;
        color[3] *= layer_opacity;
        
        let has_texture = !sprite.texture_id.is_empty() && self.textures.contains_key(&sprite.texture_id);
        if has_texture {
            if let Some(texture) = self.textures.get(&sprite.texture_id) {
                self.renderer.gl.bind_texture(WebGlRenderingContext::TEXTURE_2D, Some(texture));
            }
        }
        
        self.renderer.draw_quad(&vertices, &tex_coords, color, has_texture)?;
        
        if is_selected {
            self.draw_selection_border(sprite, world_pos, size)?;
            self.draw_handles(sprite, world_pos, size)?;
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
    
    fn draw_selection_border(&self, sprite: &Sprite, world_pos: Vec2, size: Vec2) -> Result<(), JsValue> {
        if sprite.rotation != 0.0 {
            // For rotated sprites, draw border using the same rotation calculation
            let vertices = self.calculate_sprite_vertices(sprite, world_pos, size);
            let mut border_vertices = Vec::new();
            for i in 0..4 {
                let next_i = (i + 1) % 4;
                border_vertices.extend_from_slice(&[
                    vertices[i * 2], vertices[i * 2 + 1],
                    vertices[next_i * 2], vertices[next_i * 2 + 1],
                ]);
            }
            self.renderer.draw_lines(&border_vertices, [0.2, 0.8, 0.2, 1.0])
        } else {
            // Non-rotated sprites use simple rectangle border
            let border_vertices = [
                world_pos.x, world_pos.y,                    // Top
                world_pos.x + size.x, world_pos.y,
                world_pos.x + size.x, world_pos.y,          // Right
                world_pos.x + size.x, world_pos.y + size.y,
                world_pos.x + size.x, world_pos.y + size.y, // Bottom
                world_pos.x, world_pos.y + size.y,
                world_pos.x, world_pos.y + size.y,          // Left
                world_pos.x, world_pos.y,
            ];
            self.renderer.draw_lines(&border_vertices, [0.2, 0.8, 0.2, 1.0])
        }
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
        let world_pos = self.camera.screen_to_world(Vec2::new(screen_x, screen_y));
        self.input.last_mouse_screen = Vec2::new(screen_x, screen_y);
        
        // Check if we have a selected sprite to interact with
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
            
            // Check rotation handle first
            let rotate_handle_x = sprite_pos.x + sprite_size.x * 0.5;
            let rotate_handle_y = sprite_pos.y - 20.0 / self.camera.zoom as f32;
            let handle_size = 8.0 / self.camera.zoom as f32;
            if HandleDetector::point_in_handle(world_pos, rotate_handle_x, rotate_handle_y, handle_size) {
                self.input.input_mode = InputMode::SpriteRotate;
                return;
            }
            
            // Handle rotated vs non-rotated sprites differently  
            if rotation != 0.0 {
                // For rotated sprites, only allow rotation and movement (not resizing)
                // Check if point is in sprite (we'll need to create a temporary sprite for this check)
                let temp_sprite = Sprite {
                    id: sprite_id,
                    world_x, world_y, width, height, scale_x, scale_y, rotation,
                    layer: String::new(), texture_id: String::new(), tint_color: [1.0, 1.0, 1.0, 1.0]
                };
                if temp_sprite.contains_world_point(world_pos) {
                    self.input.input_mode = InputMode::SpriteMove;
                    let sprite_center = Vec2::new(
                        world_x as f32 + (width * scale_x) as f32 * 0.5,
                        world_y as f32 + (height * scale_y) as f32 * 0.5
                    );
                    self.input.drag_offset = world_pos - sprite_center;
                    return;
                }
            } else {
                // Non-rotated sprite - check for resize handles
                let temp_sprite = Sprite {
                    id: sprite_id,
                    world_x, world_y, width, height, scale_x, scale_y, rotation,
                    layer: String::new(), texture_id: String::new(), tint_color: [1.0, 1.0, 1.0, 1.0]
                };
                if let Some(handle) = HandleDetector::get_resize_handle_for_non_rotated_sprite(&temp_sprite, world_pos, self.camera.zoom) {
                    self.input.input_mode = InputMode::SpriteResize(handle);
                    return;
                }
            }
        }
        
        // Check for sprite selection
        self.select_sprite_at_position(world_pos);
    }
    
    #[wasm_bindgen]
    pub fn handle_mouse_move(&mut self, screen_x: f32, screen_y: f32) {
        let current_screen = Vec2::new(screen_x, screen_y);
        let world_pos = self.camera.screen_to_world(current_screen);
        
        match self.input.input_mode {
            InputMode::SpriteMove => {
                if let Some(sprite_id) = &self.input.selected_sprite_id {
                    for layer in self.layers.values_mut() {
                        if let Some(sprite) = layer.sprites.iter_mut().find(|s| &s.id == sprite_id) {
                            SpriteManager::move_sprite_to_position(sprite, world_pos, self.input.drag_offset);
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
                            SpriteManager::rotate_sprite_to_mouse(sprite, world_pos);
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
            _ => {}
        }
        
        self.input.last_mouse_screen = current_screen;
    }
    
    #[wasm_bindgen]
    pub fn handle_mouse_up(&mut self, _screen_x: f32, _screen_y: f32) {
        self.input.input_mode = InputMode::None;
    }
    
    fn select_sprite_at_position(&mut self, world_pos: Vec2) {
        let mut selected_sprite = None;
        
        // Search in reverse z-order (top layers first)
        let mut sorted_layers: Vec<_> = self.layers.iter().collect();
        sorted_layers.sort_by_key(|(_, layer)| std::cmp::Reverse(layer.z_order));
        
        for (_, layer) in sorted_layers {
            if layer.selectable {
                for sprite in layer.sprites.iter().rev() {
                    if sprite.contains_world_point(world_pos) {
                        selected_sprite = Some(sprite.id.clone());
                        self.input.drag_offset = world_pos - SpriteManager::get_sprite_center(sprite);
                        break;
                    }
                }
            }
            if selected_sprite.is_some() { break; }
        }
        
        if let Some(sprite_id) = selected_sprite {
            self.input.selected_sprite_id = Some(sprite_id);
            self.input.input_mode = InputMode::SpriteMove;
        } else {
            self.input.selected_sprite_id = None;
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
}
