use wasm_bindgen::prelude::*;
use web_sys::{HtmlCanvasElement, WebGl2RenderingContext as WebGlRenderingContext, HtmlImageElement};
use serde_wasm_bindgen;

use crate::types::*;
use crate::math::*;
use crate::camera::Camera;
use crate::input::{InputHandler, InputMode, HandleDetector};
use crate::sprite_manager::SpriteManager;
use crate::sprite_renderer::SpriteRenderer;
use crate::webgl_renderer::WebGLRenderer;
use crate::lighting::LightingSystem;
use crate::fog::FogOfWarSystem;
use crate::geometry;
use crate::event_system::{EventSystem, MouseEventResult};
use crate::layer_manager::LayerManager;
use crate::grid_system::GridSystem;
use crate::texture_manager::TextureManager;
use crate::actions::ActionsClient;
use crate::paint::PaintSystem;
use crate::utils;
use crate::table_sync::TableSync;
use crate::table_manager::TableManager;

#[wasm_bindgen]
pub struct RenderEngine {
    // Systems
    layer_manager: LayerManager,
    grid_system: GridSystem,
    texture_manager: TextureManager,
    
    // Camera and transforms
    camera: Camera,
    view_matrix: Mat3,
    canvas_size: Vec2,
    
    // Input handling
    input: InputHandler,
    event_system: EventSystem,
    
    // Core rendering
    renderer: WebGLRenderer,
    
    // Lighting system
    lighting: LightingSystem,
    
    // Fog of war system
    fog: FogOfWarSystem,
    
    // Actions system
    actions: ActionsClient,
    
    // Paint system
    paint: PaintSystem,
    
    // Table synchronization
    table_sync: TableSync,
    
    // Table management
    table_manager: TableManager,
    
    // Rendering settings
    background_color: [f32; 4], // RGBA background color
}

#[wasm_bindgen]
impl RenderEngine {
    // Helper function to convert hex color to RGBA bytes
    fn hex_to_rgba(hex: &str, alpha: f32) -> [u8; 4] {
        let hex = hex.trim_start_matches('#');
        if hex.len() == 6 {
            let r = u8::from_str_radix(&hex[0..2], 16).unwrap_or(255);
            let g = u8::from_str_radix(&hex[2..4], 16).unwrap_or(255);
            let b = u8::from_str_radix(&hex[4..6], 16).unwrap_or(255);
            let a = (alpha * 255.0) as u8;
            [r, g, b, a]
        } else {
            [255, 255, 255, (alpha * 255.0) as u8] // Default white
        }
    }
    
    // Get shape settings from window.shapeSettings
    fn get_shape_settings(&self) -> (String, f32, bool) {
        if let Some(window) = web_sys::window() {
            if let Ok(shape_settings) = js_sys::Reflect::get(&window, &"shapeSettings".into()) {
                if !shape_settings.is_undefined() {
                    let color = js_sys::Reflect::get(&shape_settings, &"color".into())
                        .ok()
                        .and_then(|v| v.as_string())
                        .unwrap_or_else(|| "#ffffff".to_string());
                    let opacity = js_sys::Reflect::get(&shape_settings, &"opacity".into())
                        .ok()
                        .and_then(|v| v.as_f64())
                        .unwrap_or(1.0) as f32;
                    let filled = js_sys::Reflect::get(&shape_settings, &"filled".into())
                        .ok()
                        .and_then(|v| v.as_bool())
                        .unwrap_or(false);
                    return (color, opacity, filled);
                }
            }
        }
        // Default values
        ("#ffffff".to_string(), 1.0, false)
    }
    
    #[wasm_bindgen(constructor)]
    pub fn new(canvas: HtmlCanvasElement) -> Result<RenderEngine, JsValue> {
        // Create WebGL context with stencil buffer enabled for shadow casting
        let context_options = js_sys::Object::new();
        js_sys::Reflect::set(&context_options, &"stencil".into(), &true.into())?;
        js_sys::Reflect::set(&context_options, &"alpha".into(), &false.into())?;
        js_sys::Reflect::set(&context_options, &"antialias".into(), &true.into())?;
        
        let gl = canvas
            .get_context_with_context_options("webgl2", &context_options)?
            .unwrap()
            .dyn_into::<WebGlRenderingContext>()?;
        
        // Verify stencil buffer bits
        let stencil_bits = gl.get_parameter(WebGlRenderingContext::STENCIL_BITS)?;
        web_sys::console::log_1(&format!("[RUST] WebGL context created with {} stencil buffer bits", 
            stencil_bits.as_f64().unwrap_or(0.0)).into());
        
        let renderer = WebGLRenderer::new(gl.clone())?;
        let lighting = LightingSystem::new(gl.clone())?;
        let fog = FogOfWarSystem::new(gl.clone())?;
        let texture_manager = TextureManager::new(gl);
        
        let layer_manager = LayerManager::new();
        let grid_system = GridSystem::new();
        let actions = ActionsClient::new();
        let paint = PaintSystem::new();
        let table_sync = TableSync::new();
        let table_manager = TableManager::new();        
        let canvas_size = Vec2::new(canvas.width() as f32, canvas.height() as f32);
        let camera = Camera::default();
        let view_matrix = camera.view_matrix(canvas_size);
        
        let mut engine = Self {
            layer_manager,
            grid_system,
            texture_manager,
            camera,
            view_matrix,
            canvas_size,
            input: InputHandler::new(),
            event_system: EventSystem::new(),
            renderer,
            lighting,
            fog,
            actions,
            paint,
            table_sync,
            table_manager,
            background_color: [0.1, 0.1, 0.1, 1.0], // Default dark gray background
        };
        
        engine.update_view_matrix();
        Ok(engine)
    }
    
    #[wasm_bindgen]
    pub fn render(&mut self) -> Result<(), JsValue> {
        // Use stored background color
        self.renderer.clear(
            self.background_color[0], 
            self.background_color[1], 
            self.background_color[2], 
            self.background_color[3]
        );
        
        // Draw grid
        let world_bounds = self.get_world_view_bounds();
        self.grid_system.draw_grid(&self.renderer, world_bounds)?;
        
        // Sort layers by z_order
        let mut sorted_layers: Vec<_> = self.layer_manager.get_layers().iter().collect();
        sorted_layers.sort_by_key(|(_, layer)| layer.settings.z_order);

        // Render all layers except light and fog_of_war layers (they have special handling)
        for (layer_name, layer) in sorted_layers {
            if layer.settings.visible && layer_name != "light" && layer_name != "fog_of_war" {
                self.renderer.set_blend_mode(&layer.settings.blend_mode);
                self.renderer.set_layer_color(&layer.settings.color);
                
                for sprite in &layer.sprites {
                    SpriteRenderer::draw_sprite(sprite, layer.settings.opacity, &self.renderer, &self.texture_manager, &self.input, self.camera.zoom)?;
                }
            }
        }

        // Extract obstacles for lighting shadows
        self.update_lighting_obstacles();
        
        // Render lighting system with shadow casting
        self.lighting.render_lights(&self.view_matrix.to_array(), self.canvas_size.x, self.canvas_size.y)?;
        
        // Render paint strokes (on top of everything except fog)
        self.paint.render_strokes(&self.renderer)?;
        
        // Render fog of war system (should be rendered last, on top of everything)
        self.fog.render_fog(&self.view_matrix.to_array(), self.canvas_size.x, self.canvas_size.y)?;
        
        // Draw area selection rectangle if active
        if let Some((min, max)) = self.input.get_area_selection_rect() {
            SpriteRenderer::draw_area_selection_rect(min, max, &self.renderer)?;
        }
        
        // Draw measurement line if active
        if let Some((start, end)) = self.input.get_measurement_line() {
            SpriteRenderer::draw_measurement_line(start, end, &self.renderer)?;
        }
        
        // Draw shape creation preview if active
        if let Some((start, end)) = self.input.get_shape_creation_rect() {
            match self.input.input_mode {
                InputMode::CreateRectangle => {
                    SpriteRenderer::draw_rectangle_preview(start, end, &self.renderer)?;
                }
                InputMode::CreateCircle => {
                    SpriteRenderer::draw_circle_preview(start, end, &self.renderer)?;
                }
                InputMode::CreateLine => {
                    SpriteRenderer::draw_line_preview(start, end, &self.renderer)?;
                }
                _ => {}
            }
        }
        
        Ok(())
    }
    
    fn update_view_matrix(&mut self) {
        self.view_matrix = self.camera.view_matrix(self.canvas_size);
        let matrix_array = self.view_matrix.to_array();
        self.renderer.set_view_matrix(&matrix_array, self.canvas_size);
    }
    
    fn get_world_view_bounds(&self) -> Rect {
        let min = self.camera.screen_to_world(Vec2::new(0.0, 0.0));
        let max = self.camera.screen_to_world(self.canvas_size);
        Rect::new(min.x, min.y, max.x - min.x, max.y - min.y)
    }
    
    /// Extract obstacles from sprites for shadow casting
    /// Converts sprite bounds to line segments for visibility calculations
    fn update_lighting_obstacles(&mut self) {
        let mut obstacles = Vec::new();
        
        // Extract obstacles from the "obstacles" layer
        if let Some(obstacles_layer) = self.layer_manager.get_layer("obstacles") {
            web_sys::console::log_1(&format!("[LIGHTING-DEBUG] ✅ Found 'obstacles' layer with {} sprites", 
                obstacles_layer.sprites.len()).into());
            
            for sprite in &obstacles_layer.sprites {
                web_sys::console::log_1(&format!("[LIGHTING-DEBUG]   - Sprite '{}' at ({}, {}) size {}x{}", 
                    sprite.id, sprite.world_x, sprite.world_y, sprite.width, sprite.height).into());
                
                // IMPORTANT: world_x and world_y are TOP-LEFT corner, not center!
                // Convert sprite bounds to 4 line segments (rectangle)
                let x = sprite.world_x as f32;
                let y = sprite.world_y as f32;
                let w = sprite.width as f32;
                let h = sprite.height as f32;
                
                // Four corners of the sprite (top-left origin)
                let corners = [
                    Vec2::new(x, y),         // Top-left
                    Vec2::new(x + w, y),     // Top-right
                    Vec2::new(x + w, y + h), // Bottom-right
                    Vec2::new(x, y + h),     // Bottom-left
                ];
                
                web_sys::console::log_1(&format!("[LIGHTING-DEBUG]     Corners: TL({:.1},{:.1}) TR({:.1},{:.1}) BR({:.1},{:.1}) BL({:.1},{:.1})", 
                    corners[0].x, corners[0].y, corners[1].x, corners[1].y, 
                    corners[2].x, corners[2].y, corners[3].x, corners[3].y).into());
                
                // Add four edges as line segments
                for i in 0..4 {
                    let next = (i + 1) % 4;
                    obstacles.push(corners[i].x);
                    obstacles.push(corners[i].y);
                    obstacles.push(corners[next].x);
                    obstacles.push(corners[next].y);
                }
            }
        } else {
            web_sys::console::error_1(&"[LIGHTING-DEBUG] ❌ ERROR: 'obstacles' layer NOT FOUND!".into());
        }
        
        web_sys::console::log_1(&format!("[LIGHTING-DEBUG] 📊 Sending {} obstacle segments ({} floats) to lighting system", 
            obstacles.len() / 4, obstacles.len()).into());
        
        // Update lighting system with obstacles
        self.lighting.set_obstacles(&obstacles);
    }
    
    // Public API methods
    #[wasm_bindgen]
    pub fn resize_canvas(&mut self, width: f32, height: f32) {
        self.canvas_size = Vec2::new(width, height);
        self.update_view_matrix();
    }

    /// Compute visibility polygon given player position and flat obstacle float32 array
    #[wasm_bindgen]
    pub fn compute_visibility_polygon(&mut self, player_x: f32, player_y: f32, obstacles: js_sys::Float32Array, max_dist: f32) -> JsValue {
        geometry::compute_visibility_polygon(player_x, player_y, &obstacles, max_dist)
    }
    
    #[wasm_bindgen]
    pub fn handle_wheel(&mut self, screen_x: f32, screen_y: f32, delta_y: f32) {
        web_sys::console::log_1(&format!("[RUST] Wheel event at screen: {}, {}, delta: {}", screen_x, screen_y, delta_y).into());
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
            if let Some((sprite, _)) = self.layer_manager.find_sprite(selected_id) {
                // Check rotation handle first (not affected by rotation)
                let rotate_handle_pos = SpriteManager::get_rotation_handle_position(sprite, self.camera.zoom);
                let handle_size = 16.0 / self.camera.zoom as f32; // Match the size used in event_system.rs
                if HandleDetector::point_in_handle(world_pos, rotate_handle_pos.x, rotate_handle_pos.y, handle_size) {
                    return "crosshair".to_string();
                }
                
                // Check for resize handles (only works for non-rotated sprites for now)
                if sprite.rotation == 0.0 {
                    if let Some(handle) = HandleDetector::get_resize_handle_for_cursor_detection(sprite, world_pos, self.camera.zoom) {
                        return HandleDetector::get_cursor_for_handle(handle).to_string();
                    }
                }
                
                // Check if over sprite body
                if sprite.contains_world_point(world_pos) {
                    return "move".to_string();
                }
            }
        }
        
        "default".to_string()
    }
    
    #[wasm_bindgen]
    pub fn handle_mouse_down(&mut self, screen_x: f32, screen_y: f32) {
        web_sys::console::log_1(&format!("[RUST] Mouse down at screen: {}, {}", screen_x, screen_y).into());
        self.handle_mouse_down_with_modifiers(screen_x, screen_y, false)
    }
    
    #[wasm_bindgen]
    pub fn handle_mouse_down_with_ctrl(&mut self, screen_x: f32, screen_y: f32, ctrl_pressed: bool) {
        self.handle_mouse_down_with_modifiers(screen_x, screen_y, ctrl_pressed)
    }
    
    fn handle_mouse_down_with_modifiers(&mut self, screen_x: f32, screen_y: f32, ctrl_pressed: bool) {
        let world_pos = self.camera.screen_to_world(Vec2::new(screen_x, screen_y));
        web_sys::console::log_1(&format!("[RUST] World pos: {}, {}", world_pos.x, world_pos.y).into());
        self.input.last_mouse_screen = Vec2::new(screen_x, screen_y);
        
        // Check if paint mode is active first
        if self.input.input_mode == InputMode::Paint {
            web_sys::console::log_1(&"[RUST] Paint mode active, starting paint stroke".into());
            if self.paint.start_stroke(world_pos.x, world_pos.y, 1.0) {
                web_sys::console::log_1(&"[RUST] Paint stroke started successfully".into());
            } else {
                web_sys::console::log_1(&"[RUST] Failed to start paint stroke".into());
            }
            return;
        }
        
        // Use the event system to handle mouse down events
        let result = self.event_system.handle_mouse_down(
            world_pos,
            &mut self.input,
            self.layer_manager.get_layers_mut(),
            &mut self.lighting,
            &mut self.fog,
            self.camera.zoom,
            ctrl_pressed
        );
        
        // Handle event system results that need render engine specific operations
        match result {
            MouseEventResult::Handled => {
                // Event was handled by event system
            }
            MouseEventResult::CameraOperation(cam_op) => {
                // Handle camera operations if needed
                match cam_op.as_str() {
                    "focus_selection" => {
                        // Focus on the primary selected sprite if available
                        if let Some(sprite_id) = &self.input.selected_sprite_id {
                            if let Some((sprite, _)) = self.layer_manager.find_sprite(sprite_id) {
                                let (pos, size) = SpriteManager::get_sprite_bounds(sprite);
                                let rect = crate::math::Rect::new(pos.x, pos.y, size.x, size.y);
                                self.camera.focus_on_rect(rect, self.canvas_size, 50.0);
                                self.view_matrix = self.camera.view_matrix(self.canvas_size);
                            }
                        }
                    }
                    _ => {}
                }
            }
            MouseEventResult::CreateSprite(_) => {
                // Shape creation is handled in mouse up, not mouse down
            }
            MouseEventResult::None => {
                // Handle legacy fallback if needed
            }
        }
    }
    
    #[wasm_bindgen]
    pub fn handle_mouse_move(&mut self, screen_x: f32, screen_y: f32) {
        let current_screen = Vec2::new(screen_x, screen_y);
        let world_pos = self.camera.screen_to_world(current_screen);
        
        // Check if paint mode is active first
        if self.input.input_mode == InputMode::Paint {
            // Continue paint stroke if we're currently drawing
            if self.paint.add_stroke_point(world_pos.x, world_pos.y, 1.0) {
                // Successfully added point
            }
            self.input.last_mouse_screen = current_screen;
            return;
        }
        
        // Handle camera panning directly here since we have screen coordinates
        if self.input.input_mode == InputMode::CameraPan {
            let last_screen = self.input.last_mouse_screen;
            let screen_delta = current_screen - last_screen;
            web_sys::console::log_1(&format!("[RUST] Camera panning by screen delta: {}, {}", -screen_delta.x, -screen_delta.y).into());
            self.camera.pan_by_screen_delta(Vec2::new(-screen_delta.x, -screen_delta.y));
            self.input.last_mouse_screen = current_screen;
            self.update_view_matrix(); // This calls renderer.set_view_matrix()
            web_sys::console::log_1(&format!("[RUST] Camera position now: {}, {}", self.camera.world_x, self.camera.world_y).into());
            return;
        }
        
        // Use the event system to handle other mouse move events
        let result = self.event_system.handle_mouse_move(
            world_pos,
            &mut self.input,
            self.layer_manager.get_layers_mut(),
            &mut self.lighting,
            &mut self.fog,
            &self.camera
        );
        
        // Update last mouse position
        self.input.last_mouse_screen = current_screen;
        
        // Handle event system results that need render engine specific operations
        match result {
            MouseEventResult::Handled => {
                // Event was handled by event system, update matrices if needed
                self.view_matrix = self.camera.view_matrix(self.canvas_size);
            }
            MouseEventResult::CameraOperation(cam_op) => {
                // Handle camera operations
                match cam_op.as_str() {
                    "update_view_matrix" => {
                        self.view_matrix = self.camera.view_matrix(self.canvas_size);
                    }
                    _ => {}
                }
            }
            MouseEventResult::CreateSprite(_) => {
                // Shape creation is handled in mouse up, not mouse move
            }
            MouseEventResult::None => {
                // Fallback to legacy handling if needed
            }
        }
        
        // Update last mouse position for next frame
        self.input.last_mouse_screen = current_screen;
    }
    
    #[wasm_bindgen]
    pub fn handle_mouse_up(&mut self, screen_x: f32, screen_y: f32) {
        let world_pos = self.camera.screen_to_world(Vec2::new(screen_x, screen_y));
        
        // Check if paint mode is active first
        if self.input.input_mode == InputMode::Paint {
            web_sys::console::log_1(&"[RUST] Paint mode active, ending paint stroke".into());
            self.paint.end_stroke();
            return;
        }
        
        // Use the event system to handle mouse up events
        let result = self.event_system.handle_mouse_up(
            world_pos,
            &mut self.input,
            self.layer_manager.get_layers_mut(),
            &mut self.lighting,
            &mut self.fog
        );
        
        // Handle event system results that need render engine specific operations
        match result {
            MouseEventResult::Handled => {
                // Event was handled by event system
            }
            MouseEventResult::CameraOperation(cam_op) => {
                // Handle camera operations if needed
                match cam_op.as_str() {
                    "update_view_matrix" => {
                        self.view_matrix = self.camera.view_matrix(self.canvas_size);
                    }
                    _ => {}
                }
            }
            MouseEventResult::CreateSprite(sprite_data) => {
                // Handle sprite creation
                let parts: Vec<&str> = sprite_data.split(':').collect();
                match parts[0] {
                    "rectangle" => {
                        if parts.len() >= 5 {
                            if let (Ok(x), Ok(y), Ok(width), Ok(height)) = (
                                parts[1].parse::<f32>(),
                                parts[2].parse::<f32>(),
                                parts[3].parse::<f32>(),
                                parts[4].parse::<f32>()
                            ) {
                                web_sys::console::log_1(&format!("[RUST] Creating rectangle sprite at {},{} size {}x{}", x, y, width, height).into());
                                
                                // Get shape settings from window
                                let (color, opacity, filled) = self.get_shape_settings();
                                
                                // Create sprite locally in Rust for immediate visibility
                                let sprite_id = self.create_rectangle_sprite_with_options(x, y, width, height, "tokens", &color, opacity, filled);
                                web_sys::console::log_1(&format!("[RUST] Created rectangle sprite with ID: {}", sprite_id).into());
                                
                                // Send to server via gameAPI for synchronization
                                if let Some(window) = web_sys::window() {
                                    if let Ok(game_api) = js_sys::Reflect::get(&window, &"gameAPI".into()) {
                                        if let Ok(send_message) = js_sys::Reflect::get(&game_api, &"sendMessage".into()) {
                                            if let Ok(send_fn) = send_message.dyn_into::<js_sys::Function>() {
                                                let sprite_data = js_sys::Object::new();
                                                js_sys::Reflect::set(&sprite_data, &"id".into(), &sprite_id.into()).unwrap();
                                                js_sys::Reflect::set(&sprite_data, &"x".into(), &x.into()).unwrap();
                                                js_sys::Reflect::set(&sprite_data, &"y".into(), &y.into()).unwrap();
                                                js_sys::Reflect::set(&sprite_data, &"width".into(), &width.into()).unwrap();
                                                js_sys::Reflect::set(&sprite_data, &"height".into(), &height.into()).unwrap();
                                                js_sys::Reflect::set(&sprite_data, &"layer".into(), &"tokens".into()).unwrap();
                                                js_sys::Reflect::set(&sprite_data, &"texture_path".into(), &"".into()).unwrap();
                                                js_sys::Reflect::set(&sprite_data, &"color".into(), &"#50C878".into()).unwrap(); // Light green
                                                
                                                let _ = send_fn.call2(&game_api, &"sprite_create".into(), &sprite_data);
                                            }
                                        }
                                    }
                                }
                                
                                // Dispatch event to notify UI
                                if let Some(window) = web_sys::window() {
                                    let event = web_sys::Event::new("spriteAdded").unwrap();
                                    let _ = window.dispatch_event(&event);
                                }
                            }
                        }
                    }
                    "circle" => {
                        if parts.len() >= 4 {
                            if let (Ok(x), Ok(y), Ok(radius)) = (
                                parts[1].parse::<f32>(),
                                parts[2].parse::<f32>(),
                                parts[3].parse::<f32>()
                            ) {
                                web_sys::console::log_1(&format!("[RUST] Creating circle sprite at {},{} radius {}", x, y, radius).into());
                                
                                // Get shape settings from window
                                let (color, opacity, filled) = self.get_shape_settings();
                                
                                // Create sprite locally in Rust for immediate visibility
                                let sprite_id = self.create_circle_sprite_with_options(x, y, radius, "tokens", &color, opacity, filled);
                                web_sys::console::log_1(&format!("[RUST] Created circle sprite with ID: {}", sprite_id).into());
                                
                                // Send to server via gameAPI for synchronization
                                let diameter = radius * 2.0;
                                if let Some(window) = web_sys::window() {
                                    if let Ok(game_api) = js_sys::Reflect::get(&window, &"gameAPI".into()) {
                                        if let Ok(send_message) = js_sys::Reflect::get(&game_api, &"sendMessage".into()) {
                                            if let Ok(send_fn) = send_message.dyn_into::<js_sys::Function>() {
                                                let sprite_data = js_sys::Object::new();
                                                js_sys::Reflect::set(&sprite_data, &"id".into(), &sprite_id.into()).unwrap();
                                                js_sys::Reflect::set(&sprite_data, &"x".into(), &(x - radius).into()).unwrap(); // Center to top-left
                                                js_sys::Reflect::set(&sprite_data, &"y".into(), &(y - radius).into()).unwrap(); // Center to top-left
                                                js_sys::Reflect::set(&sprite_data, &"width".into(), &diameter.into()).unwrap();
                                                js_sys::Reflect::set(&sprite_data, &"height".into(), &diameter.into()).unwrap();
                                                js_sys::Reflect::set(&sprite_data, &"layer".into(), &"tokens".into()).unwrap();
                                                js_sys::Reflect::set(&sprite_data, &"texture_path".into(), &"".into()).unwrap();
                                                js_sys::Reflect::set(&sprite_data, &"color".into(), &"#4A90E2".into()).unwrap(); // Blue
                                                js_sys::Reflect::set(&sprite_data, &"shape".into(), &"circle".into()).unwrap(); // Mark as circle
                                                
                                                let _ = send_fn.call2(&game_api, &"sprite_create".into(), &sprite_data);
                                            }
                                        }
                                    }
                                }
                                
                                // Dispatch event to notify UI
                                if let Some(window) = web_sys::window() {
                                    let event = web_sys::Event::new("spriteAdded").unwrap();
                                    let _ = window.dispatch_event(&event);
                                }
                            }
                        }
                    }
                    "line" => {
                        if parts.len() >= 5 {
                            if let (Ok(x1), Ok(y1), Ok(x2), Ok(y2)) = (
                                parts[1].parse::<f32>(),
                                parts[2].parse::<f32>(),
                                parts[3].parse::<f32>(),
                                parts[4].parse::<f32>()
                            ) {
                                web_sys::console::log_1(&format!("[RUST] Creating line sprite from {},{} to {},{}", x1, y1, x2, y2).into());
                                
                                // Get shape settings from window
                                let (color, opacity, _) = self.get_shape_settings(); // Lines don't use filled
                                
                                // Create sprite locally in Rust for immediate visibility
                                let sprite_id = self.create_line_sprite_with_options(x1, y1, x2, y2, "tokens", &color, opacity);
                                web_sys::console::log_1(&format!("[RUST] Created line sprite with ID: {}", sprite_id).into());
                                
                                // Send to server via gameAPI for synchronization
                                let min_x = x1.min(x2);
                                let min_y = y1.min(y2);
                                let width = (x2 - x1).abs().max(2.0); // Minimum width for visibility
                                let height = (y2 - y1).abs().max(2.0); // Minimum height for visibility
                                
                                if let Some(window) = web_sys::window() {
                                    if let Ok(game_api) = js_sys::Reflect::get(&window, &"gameAPI".into()) {
                                        if let Ok(send_message) = js_sys::Reflect::get(&game_api, &"sendMessage".into()) {
                                            if let Ok(send_fn) = send_message.dyn_into::<js_sys::Function>() {
                                                let sprite_data = js_sys::Object::new();
                                                js_sys::Reflect::set(&sprite_data, &"id".into(), &sprite_id.into()).unwrap();
                                                js_sys::Reflect::set(&sprite_data, &"x".into(), &min_x.into()).unwrap();
                                                js_sys::Reflect::set(&sprite_data, &"y".into(), &min_y.into()).unwrap();
                                                js_sys::Reflect::set(&sprite_data, &"width".into(), &width.into()).unwrap();
                                                js_sys::Reflect::set(&sprite_data, &"height".into(), &height.into()).unwrap();
                                                js_sys::Reflect::set(&sprite_data, &"layer".into(), &"tokens".into()).unwrap();
                                                js_sys::Reflect::set(&sprite_data, &"texture_path".into(), &"".into()).unwrap();
                                                js_sys::Reflect::set(&sprite_data, &"color".into(), &"#E74C3C".into()).unwrap(); // Red
                                                js_sys::Reflect::set(&sprite_data, &"shape".into(), &"line".into()).unwrap(); // Mark as line
                                                js_sys::Reflect::set(&sprite_data, &"line_start_x".into(), &x1.into()).unwrap(); // Store original line coordinates
                                                js_sys::Reflect::set(&sprite_data, &"line_start_y".into(), &y1.into()).unwrap();
                                                js_sys::Reflect::set(&sprite_data, &"line_end_x".into(), &x2.into()).unwrap();
                                                js_sys::Reflect::set(&sprite_data, &"line_end_y".into(), &y2.into()).unwrap();
                                                
                                                let _ = send_fn.call2(&game_api, &"sprite_create".into(), &sprite_data);
                                            }
                                        }
                                    }
                                }
                                
                                // Dispatch event to notify UI
                                if let Some(window) = web_sys::window() {
                                    let event = web_sys::Event::new("spriteAdded").unwrap();
                                    let _ = window.dispatch_event(&event);
                                }
                            }
                        }
                    }
                    _ => {}
                }
            }
            MouseEventResult::None => {
                // Fallback to legacy handling if needed
            }
        }
    }
    
    // Sprite management methods
    #[wasm_bindgen]
    pub fn add_sprite_to_layer(&mut self, layer_name: &str, sprite_data: &JsValue) -> Result<String, JsValue> {
        self.layer_manager.add_sprite_to_layer(layer_name, sprite_data)
    }
    
    #[wasm_bindgen]
    pub fn remove_sprite(&mut self, sprite_id: &str) -> bool {
        let result = self.layer_manager.remove_sprite(sprite_id);
        if result && self.input.selected_sprite_id.as_ref() == Some(&sprite_id.to_string()) {
            self.input.selected_sprite_id = None;
        }
        result
    }
    
    #[wasm_bindgen]
    pub fn rotate_sprite(&mut self, sprite_id: &str, rotation_degrees: f64) -> bool {
        self.layer_manager.rotate_sprite(sprite_id, rotation_degrees)
    }
    
    #[wasm_bindgen]
    pub fn update_sprite_position(&mut self, sprite_id: &str, x: f64, y: f64) -> bool {
        let new_position = crate::math::Vec2::new(x as f32, y as f32);
        self.layer_manager.update_sprite_position(sprite_id, new_position)
    }
    
    #[wasm_bindgen]
    pub fn update_sprite_scale(&mut self, sprite_id: &str, scale_x: f64, scale_y: f64) -> bool {
        let new_scale = crate::math::Vec2::new(scale_x as f32, scale_y as f32);
        self.layer_manager.update_sprite_scale(sprite_id, new_scale)
    }
    
    // Grid management methods
    #[wasm_bindgen]
    pub fn toggle_grid(&mut self) {
        self.grid_system.toggle();
    }
    
    #[wasm_bindgen]
    pub fn set_grid_enabled(&mut self, enabled: bool) {
        self.grid_system.set_enabled(enabled);
    }
    
    #[wasm_bindgen]
    pub fn toggle_grid_snapping(&mut self) {
        self.grid_system.toggle_snapping();
    }
    
    #[wasm_bindgen]
    pub fn set_grid_snapping(&mut self, enabled: bool) {
        self.grid_system.set_snapping(enabled);
    }
    
    #[wasm_bindgen]
    pub fn set_grid_size(&mut self, size: f32) {
        self.grid_system.set_size(size);
    }
    
    #[wasm_bindgen]
    pub fn get_grid_size(&self) -> f32 {
        self.grid_system.get_size()
    }
    
    #[wasm_bindgen]
    pub fn is_grid_snapping_enabled(&self) -> bool {
        self.grid_system.is_snapping_enabled()
    }

    // Additional grid methods for MapPanel compatibility
    #[wasm_bindgen]
    pub fn set_snap_to_grid(&mut self, enabled: bool) {
        self.set_grid_snapping(enabled);
    }

    #[wasm_bindgen] 
    pub fn set_grid_color(&mut self, r: f32, g: f32, b: f32, a: f32) {
        // Store grid color in the renderer for future use
        // For now, we'll just log it since grid rendering uses fixed colors
        utils::log(&format!("Setting grid color to rgba({}, {}, {}, {})", r, g, b, a));
    }

    #[wasm_bindgen]
    pub fn set_background_color(&mut self, r: f32, g: f32, b: f32, a: f32) {
        // Store background color and apply it in the next render
        self.background_color = [r, g, b, a];
        utils::log(&format!("Setting background color to rgba({}, {}, {}, {})", r, g, b, a));
    }

    #[wasm_bindgen]
    pub fn get_background_color(&self) -> Vec<f32> {
        self.background_color.to_vec()
    }

    // Additional camera methods for MapPanel compatibility
    #[wasm_bindgen]
    pub fn reset_camera(&mut self) {
        self.set_camera(0.0, 0.0, 1.0);
    }

    #[wasm_bindgen]
    pub fn set_camera_position(&mut self, world_x: f64, world_y: f64) {
        self.center_camera(world_x, world_y);
    }

    #[wasm_bindgen]
    pub fn set_camera_scale(&mut self, scale: f64) {
        self.set_zoom(scale);
    }
    
    // Texture management
    #[wasm_bindgen]
    pub fn load_texture(&mut self, name: &str, image: &HtmlImageElement) -> Result<(), JsValue> {
        self.texture_manager.load_texture(name, image)
    }

    // Right-click handling for context menu
    #[wasm_bindgen]
    pub fn handle_right_click(&self, screen_x: f32, screen_y: f32) -> Option<String> {
        let world_pos = self.camera.screen_to_world(Vec2::new(screen_x, screen_y));
        self.layer_manager.find_sprite_for_right_click(world_pos)
    }

    // Additional sprite management methods for frontend compatibility
    #[wasm_bindgen]
    pub fn delete_sprite(&mut self, sprite_id: &str) -> bool {
        self.remove_sprite(sprite_id)
    }

    #[wasm_bindgen]
    pub fn copy_sprite(&self, sprite_id: &str) -> Option<String> {
        self.layer_manager.copy_sprite(sprite_id)
    }

    #[wasm_bindgen]
    pub fn paste_sprite(&mut self, layer_name: &str, sprite_json: &str, offset_x: f64, offset_y: f64) -> Result<String, JsValue> {
        self.layer_manager.paste_sprite(layer_name, sprite_json, offset_x, offset_y)
    }

    #[wasm_bindgen]
    pub fn resize_sprite(&mut self, sprite_id: &str, new_width: f64, new_height: f64) -> bool {
        self.layer_manager.resize_sprite(sprite_id, new_width, new_height)
    }

    // Alias for resize_canvas to match frontend expectations
    #[wasm_bindgen]
    pub fn resize(&mut self, width: f32, height: f32) {
        self.resize_canvas(width, height);
    }

    // Lighting system methods
    #[wasm_bindgen]
    pub fn add_light(&mut self, id: &str, x: f32, y: f32) {
        web_sys::console::log_1(&format!("[RUST] add_light called: id={}, x={}, y={}", id, x, y).into());
        let light = crate::lighting::Light::new(id.to_string(), x, y);
        self.lighting.add_light(light);
        web_sys::console::log_1(&format!("[RUST] Light added successfully. Total lights: {}", self.lighting.get_light_count()).into());
    }

    #[wasm_bindgen]
    pub fn remove_light(&mut self, id: &str) {
        self.lighting.remove_light(id);
    }

    #[wasm_bindgen]
    pub fn set_light_color(&mut self, id: &str, r: f32, g: f32, b: f32, a: f32) {
        if let Some(light) = self.lighting.get_light_mut(id) {
            light.set_color(Color::new(r, g, b, a));
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
            InputMode::Measurement => "measurement".to_string(),
            InputMode::CreateRectangle => "create_rectangle".to_string(),
            InputMode::CreateCircle => "create_circle".to_string(),
            InputMode::CreateLine => "create_line".to_string(),
            InputMode::CreateText => "create_text".to_string(),
            InputMode::Paint => "paint".to_string(),
        }
    }

    // ============================================================================
    // INPUT MODE CONTROL - Methods to set specific input modes
    // ============================================================================
    
    #[wasm_bindgen]
    pub fn set_input_mode_measurement(&mut self) {
        self.input.input_mode = InputMode::Measurement;
        web_sys::console::log_1(&"[RUST] Input mode set to Measurement".into());
    }

    #[wasm_bindgen]
    pub fn set_input_mode_create_rectangle(&mut self) {
        self.input.input_mode = InputMode::CreateRectangle;
        web_sys::console::log_1(&"[RUST] Input mode set to CreateRectangle".into());
    }

    #[wasm_bindgen]
    pub fn set_input_mode_create_circle(&mut self) {
        self.input.input_mode = InputMode::CreateCircle;
        web_sys::console::log_1(&"[RUST] Input mode set to CreateCircle".into());
    }

    #[wasm_bindgen]
    pub fn set_input_mode_create_line(&mut self) {
        self.input.input_mode = InputMode::CreateLine;
        web_sys::console::log_1(&"[RUST] Input mode set to CreateLine".into());
    }

    #[wasm_bindgen]
    pub fn set_input_mode_create_text(&mut self) {
        self.input.input_mode = InputMode::CreateText;
        web_sys::console::log_1(&"[RUST] Input mode set to CreateText".into());
    }

    #[wasm_bindgen]
    pub fn set_input_mode_select(&mut self) {
        self.input.input_mode = InputMode::None;
        web_sys::console::log_1(&"[RUST] Input mode set to Select (None)".into());
    }

    #[wasm_bindgen]
    pub fn set_input_mode_paint(&mut self) {
        self.input.input_mode = InputMode::Paint;
        web_sys::console::log_1(&"[RUST] Input mode set to Paint".into());
    }

    // ============================================================================
    // SPRITE CREATION METHODS - Create sprites from tools
    // ============================================================================
    
    #[wasm_bindgen]
    pub fn create_rectangle_sprite(&mut self, x: f32, y: f32, width: f32, height: f32, layer_name: &str) -> String {
        self.create_rectangle_sprite_with_options(x, y, width, height, layer_name, "#50c850", 1.0, false)
    }
    
    #[wasm_bindgen]
    pub fn create_rectangle_sprite_with_options(&mut self, x: f32, y: f32, width: f32, height: f32, layer_name: &str, color: &str, opacity: f32, filled: bool) -> String {
        web_sys::console::log_1(&format!("[RUST] create_rectangle_sprite called: {},{} {}x{} on layer '{}' color: {} opacity: {} filled: {}", x, y, width, height, layer_name, color, opacity, filled).into());
        let sprite_id = format!("rect_{}", js_sys::Date::now() as u64);
        
        // Convert color and opacity to RGBA bytes
        let rgba_color = Self::hex_to_rgba(color, opacity);
        
        // Create procedural rectangle texture with color and fill
        let texture_name = format!("rect_texture_{}", sprite_id);
        let texture_width = width.max(16.0) as u32;
        let texture_height = height.max(16.0) as u32;
        let border_width = 2u32; // Border thickness in pixels
        if let Err(e) = self.texture_manager.create_rectangle_texture_with_color(&texture_name, texture_width, texture_height, border_width, rgba_color, filled) {
            web_sys::console::log_1(&format!("[RUST] Failed to create rectangle texture: {:?}", e).into());
        }
        
        let sprite = Sprite {
            id: sprite_id.clone(),
            world_x: x as f64,
            world_y: y as f64,
            width: width as f64,
            height: height as f64,
            rotation: 0.0,
            scale_x: 1.0,
            scale_y: 1.0,
            layer: layer_name.to_string(),
            texture_id: texture_name, // Use procedural rectangle texture
            tint_color: [1.0, 1.0, 1.0, 1.0], // White tint (no color change)
        };
        
        web_sys::console::log_1(&format!("[RUST] Created sprite {}, adding to layer '{}'", sprite_id, layer_name).into());
        // Convert to JsValue for layer manager
        let sprite_data = serde_wasm_bindgen::to_value(&sprite).unwrap();
        let result = self.layer_manager.add_sprite_to_layer(layer_name, &sprite_data);
        web_sys::console::log_1(&format!("[RUST] add_sprite_to_layer result: {:?}", result).into());
        web_sys::console::log_1(&format!("[RUST] Created rectangle sprite: {}", sprite_id).into());
        sprite_id
    }
    
    #[wasm_bindgen]
    pub fn create_circle_sprite(&mut self, x: f32, y: f32, radius: f32, layer_name: &str) -> String {
        self.create_circle_sprite_with_options(x, y, radius, layer_name, "#5080c8", 1.0, false)
    }
    
    #[wasm_bindgen]
    pub fn create_circle_sprite_with_options(&mut self, x: f32, y: f32, radius: f32, layer_name: &str, color: &str, opacity: f32, filled: bool) -> String {
        let sprite_id = format!("circle_{}", js_sys::Date::now() as u64);
        let diameter = radius * 2.0;
        
        // Convert color and opacity to RGBA bytes
        let rgba_color = Self::hex_to_rgba(color, opacity);
        
        // Create procedural circle texture with color and fill
        let texture_name = format!("circle_texture_{}", sprite_id);
        let texture_size = (diameter.max(32.0) as u32).min(256); // Reasonable size limits
        if let Err(e) = self.texture_manager.create_circle_texture_with_color(&texture_name, texture_size, rgba_color, filled) {
            web_sys::console::log_1(&format!("[RUST] Failed to create circle texture: {:?}", e).into());
        }
        
        let sprite = Sprite {
            id: sprite_id.clone(),
            world_x: (x - radius) as f64,
            world_y: (y - radius) as f64,
            width: diameter as f64,
            height: diameter as f64,
            rotation: 0.0,
            scale_x: 1.0,
            scale_y: 1.0,
            layer: layer_name.to_string(),
            texture_id: texture_name, // Use procedural circle texture
            tint_color: [1.0, 1.0, 1.0, 1.0], // White tint (no color change)
        };
        
        // Convert to JsValue for layer manager
        let sprite_data = serde_wasm_bindgen::to_value(&sprite).unwrap();
        let _ = self.layer_manager.add_sprite_to_layer(layer_name, &sprite_data);
        web_sys::console::log_1(&format!("[RUST] Created circle sprite: {}", sprite_id).into());
        sprite_id
    }
    
    #[wasm_bindgen]
    pub fn create_line_sprite(&mut self, start_x: f32, start_y: f32, end_x: f32, end_y: f32, layer_name: &str) -> String {
        self.create_line_sprite_with_options(start_x, start_y, end_x, end_y, layer_name, "#c85050", 1.0)
    }
    
    pub fn create_line_sprite_with_options(&mut self, start_x: f32, start_y: f32, end_x: f32, end_y: f32, layer_name: &str, color: &str, opacity: f32) -> String {
        let sprite_id = format!("line_{}", js_sys::Date::now() as u64);
        
        // Calculate line dimensions
        let dx = end_x - start_x;
        let dy = end_y - start_y;
        let length = (dx * dx + dy * dy).sqrt();
        let width: f32 = 4.0; // Line thickness
        
        // Calculate position and rotation
        let center_x = (start_x + end_x) / 2.0;
        let center_y = (start_y + end_y) / 2.0;
        let angle = dy.atan2(dx);
        
        // Convert color and opacity to RGBA bytes
        let rgba_color = Self::hex_to_rgba(color, opacity);
        
        // Create procedural line texture with color
        let texture_name = format!("line_texture_{}", sprite_id);
        let texture_width = length.max(8.0) as u32;
        let texture_height = width.max(4.0) as u32;
        let line_width = 2u32; // Line width in pixels
        if let Err(e) = self.texture_manager.create_line_texture_with_color(&texture_name, texture_width, texture_height, line_width, rgba_color) {
            web_sys::console::log_1(&format!("[RUST] Failed to create line texture: {:?}", e).into());
        }
        
        let sprite = Sprite {
            id: sprite_id.clone(),
            world_x: (center_x - length / 2.0) as f64,
            world_y: (center_y - width / 2.0) as f64,
            width: length as f64,
            height: width as f64,
            rotation: angle as f64,
            scale_x: 1.0,
            scale_y: 1.0,
            layer: layer_name.to_string(),
            texture_id: texture_name, // Use procedural line texture
            tint_color: [1.0, 1.0, 1.0, 1.0], // White tint (no color change)
        };
        
        // Convert to JsValue for layer manager
        let sprite_data = serde_wasm_bindgen::to_value(&sprite).unwrap();
        let _ = self.layer_manager.add_sprite_to_layer(layer_name, &sprite_data);
        web_sys::console::log_1(&format!("[RUST] Created line sprite: {} at ({:.1}, {:.1})", sprite_id, center_x, center_y).into());
        sprite_id
    }

    // ============================================================================
    // NETWORK INTEGRATION - Direct integration with NetworkClient
    // ============================================================================
    
    #[wasm_bindgen]
    pub fn get_sprite_network_data(&self, sprite_id: &str) -> Result<JsValue, JsValue> {
        if let Some((sprite, layer_name)) = self.layer_manager.find_sprite(sprite_id) {
            let network_data = crate::network::SpriteNetworkData {
                sprite_id: sprite_id.to_string(),
                layer_name: layer_name.to_string(),
                world_x: sprite.world_x,
                world_y: sprite.world_y,
                width: sprite.width,
                height: sprite.height,
                rotation: sprite.rotation,
                texture_name: sprite.texture_id.clone(),
            };
            serde_wasm_bindgen::to_value(&network_data).map_err(|e| JsValue::from_str(&e.to_string()))
        } else {
            Err(JsValue::from_str("Sprite not found"))
        }
    }

    #[wasm_bindgen]
    pub fn apply_network_sprite_update(&mut self, sprite_data: &JsValue) -> Result<(), JsValue> {
        let network_data: crate::network::SpriteNetworkData = 
            serde_wasm_bindgen::from_value(sprite_data.clone())?;
        
        // Find the sprite and update it
        if let Some(sprite) = self.layer_manager.find_sprite_mut(&network_data.sprite_id) {
            sprite.world_x = network_data.world_x;
            sprite.world_y = network_data.world_y;
            sprite.width = network_data.width;
            sprite.height = network_data.height;
            sprite.rotation = network_data.rotation;
            sprite.texture_id = network_data.texture_name;
            Ok(())
        } else {
            Err(JsValue::from_str("Sprite not found for network update"))
        }
    }

    #[wasm_bindgen]
    pub fn apply_network_sprite_create(&mut self, sprite_data: &JsValue) -> Result<String, JsValue> {
        let network_data: crate::network::SpriteNetworkData = 
            serde_wasm_bindgen::from_value(sprite_data.clone())?;
        
        // Create a new sprite from network data
        let sprite = Sprite {
            id: network_data.sprite_id.clone(),
            world_x: network_data.world_x,
            world_y: network_data.world_y,
            width: network_data.width,
            height: network_data.height,
            scale_x: 1.0,
            scale_y: 1.0,
            rotation: network_data.rotation,
            layer: network_data.layer_name.clone(),
            texture_id: network_data.texture_name,
            tint_color: [1.0, 1.0, 1.0, 1.0],
        };
        
        let sprite_js = serde_wasm_bindgen::to_value(&sprite)?;
        self.layer_manager.add_sprite_to_layer(&network_data.layer_name, &sprite_js)
    }

    #[wasm_bindgen]
    pub fn apply_network_sprite_remove(&mut self, sprite_id: &str) -> bool {
        self.remove_sprite(sprite_id)
    }

    #[wasm_bindgen]
    pub fn get_all_sprites_network_data(&self) -> Result<JsValue, JsValue> {
        let mut all_sprites = Vec::new();
        
        for (layer_name, layer) in self.layer_manager.get_layers() {
            for sprite in &layer.sprites {
                let network_data = crate::network::SpriteNetworkData {
                    sprite_id: sprite.id.clone(),
                    layer_name: layer_name.clone(),
                    world_x: sprite.world_x,
                    world_y: sprite.world_y,
                    width: sprite.width,
                    height: sprite.height,
                    rotation: sprite.rotation,
                    texture_name: sprite.texture_id.clone(),
                };
                all_sprites.push(network_data);
            }
        }
        
        serde_wasm_bindgen::to_value(&all_sprites).map_err(|e| JsValue::from_str(&e.to_string()))
    }

    // Actions System Integration

    #[wasm_bindgen]
    pub fn create_table_action(&mut self, name: &str, width: f64, height: f64) -> JsValue {
        self.actions.create_table(name, width, height)
    }

    #[wasm_bindgen]
    pub fn delete_table_action(&mut self, table_id: &str) -> JsValue {
        self.actions.delete_table(table_id)
    }

    #[wasm_bindgen]
    pub fn update_table_action(&mut self, table_id: &str, updates: &JsValue) -> JsValue {
        self.actions.update_table(table_id, updates)
    }

    #[wasm_bindgen]
    pub fn create_sprite_action(&mut self, table_id: &str, layer: &str, position: &JsValue, texture_name: &str) -> JsValue {
        let result = self.actions.create_sprite(table_id, layer, position, texture_name);
        
        // If successful, also add the sprite to the layer manager
        if let Ok(action_result) = serde_wasm_bindgen::from_value::<crate::actions::ActionResult>(result.clone()) {
            if action_result.success {
                if let Some(sprite_data) = action_result.data {
                    if let Ok(sprite_info) = serde_json::from_value::<crate::actions::SpriteInfo>(sprite_data) {
                        let sprite = Sprite::new(
                            sprite_info.sprite_id.clone(),
                            sprite_info.position.x,
                            sprite_info.position.y,
                            sprite_info.size.width,
                            sprite_info.size.height,
                            sprite_info.texture_name.clone(),
                        );
                        let sprite_js = serde_wasm_bindgen::to_value(&sprite).unwrap_or(JsValue::NULL);
                        let _ = self.layer_manager.add_sprite_to_layer(&sprite_info.layer, &sprite_js);
                    }
                }
            }
        }
        
        result
    }

    #[wasm_bindgen]
    pub fn delete_sprite_action(&mut self, sprite_id: &str) -> JsValue {
        let result = self.actions.delete_sprite(sprite_id);
        
        // If successful, also remove from layer manager
        if let Ok(action_result) = serde_wasm_bindgen::from_value::<crate::actions::ActionResult>(result.clone()) {
            if action_result.success {
                // Note: LayerManager doesn't have remove_sprite_from_all_layers, so we'll skip this for now
                web_sys::console::log_1(&format!("Sprite {} deleted from actions", sprite_id).into());
            }
        }
        
        result
    }

    #[wasm_bindgen]
    pub fn update_sprite_action(&mut self, sprite_id: &str, updates: &JsValue) -> JsValue {
        let result = self.actions.update_sprite(sprite_id, updates);
        
        // If successful, also update in layer manager
        if let Ok(action_result) = serde_wasm_bindgen::from_value::<crate::actions::ActionResult>(result.clone()) {
            if action_result.success {
                // Note: LayerManager doesn't have update_sprite_in_layers, so we'll skip this for now
                web_sys::console::log_1(&format!("Sprite {} updated in actions", sprite_id).into());
            }
        }
        
        result
    }

    #[wasm_bindgen]
    pub fn set_layer_visibility_action(&mut self, layer: &str, visible: bool) -> JsValue {
        let result = self.actions.set_layer_visibility(layer, visible);
        
        // Also update the layer manager
        self.layer_manager.set_layer_visibility(layer, visible);
        
        result
    }

    #[wasm_bindgen]
    pub fn move_sprite_to_layer_action(&mut self, sprite_id: &str, new_layer: &str) -> JsValue {
        let result = self.actions.move_sprite_to_layer(sprite_id, new_layer);
        
        // If successful, also move in layer manager
        if let Ok(action_result) = serde_wasm_bindgen::from_value::<crate::actions::ActionResult>(result.clone()) {
            if action_result.success {
                // Move sprite in layer manager for rendering
                let moved = self.layer_manager.move_sprite_to_layer(sprite_id, new_layer);
                if moved {
                    web_sys::console::log_1(&format!("✅ Sprite {} successfully moved to layer {} in both actions and layer manager", sprite_id, new_layer).into());
                } else {
                    web_sys::console::warn_1(&format!("⚠️ Sprite {} moved in actions but not found in layer manager", sprite_id).into());
                }
            }
        }
        
        result
    }

    #[wasm_bindgen]
    pub fn batch_actions(&mut self, actions: &JsValue) -> JsValue {
        self.actions.batch_actions(actions)
    }

    #[wasm_bindgen]
    pub fn undo_action(&mut self) -> JsValue {
        self.actions.undo()
    }

    #[wasm_bindgen]
    pub fn redo_action(&mut self) -> JsValue {
        self.actions.redo()
    }

    #[wasm_bindgen]
    pub fn can_undo(&self) -> bool {
        self.actions.can_undo()
    }

    #[wasm_bindgen]
    pub fn can_redo(&self) -> bool {
        self.actions.can_redo()
    }

    #[wasm_bindgen]
    pub fn get_action_history(&self) -> JsValue {
        self.actions.get_action_history()
    }

    #[wasm_bindgen]
    pub fn get_table_info(&self, table_id: &str) -> JsValue {
        self.actions.get_table_info(table_id)
    }

    #[wasm_bindgen]
    pub fn get_sprite_info(&self, sprite_id: &str) -> JsValue {
        self.actions.get_sprite_info(sprite_id)
    }

    #[wasm_bindgen]
    pub fn get_all_tables(&self) -> JsValue {
        self.actions.get_all_tables()
    }

    #[wasm_bindgen]
    pub fn get_sprites_by_layer(&self, layer: &str) -> JsValue {
        self.actions.get_sprites_by_layer(layer)
    }

    // Actions event handlers setup
    #[wasm_bindgen]
    pub fn set_action_handler(&mut self, callback: &js_sys::Function) {
        self.actions.set_action_handler(callback);
    }

    #[wasm_bindgen]
    pub fn set_state_change_handler(&mut self, callback: &js_sys::Function) {
        self.actions.set_state_change_handler(callback);
    }

    #[wasm_bindgen]
    pub fn set_actions_error_handler(&mut self, callback: &js_sys::Function) {
        self.actions.set_error_handler(callback);
    }

    #[wasm_bindgen]
    pub fn set_actions_auto_sync(&mut self, enabled: bool) {
        self.actions.set_auto_sync(enabled);
    }
    
    // Advanced Layer Management for Rendering Pipeline
    #[wasm_bindgen]
    pub fn set_layer_opacity(&mut self, layer_name: &str, opacity: f32) -> bool {
        self.layer_manager.set_layer_opacity(layer_name, opacity)
    }
    
    #[wasm_bindgen]
    pub fn set_layer_visibility(&mut self, layer_name: &str, visible: bool) -> bool {
        self.layer_manager.set_layer_visibility(layer_name, visible)
    }
    
    #[wasm_bindgen]
    pub fn set_layer_blend_mode(&mut self, layer_name: &str, blend_mode: &str) -> bool {
        use crate::types::BlendMode;
        let blend_mode = match blend_mode {
            "alpha" => BlendMode::Alpha,
            "additive" => BlendMode::Additive,
            "modulate" => BlendMode::Modulate,
            "multiply" => BlendMode::Multiply,
            _ => return false,
        };
        self.layer_manager.set_layer_blend_mode(layer_name, blend_mode)
    }
    
    #[wasm_bindgen]
    pub fn set_layer_color(&mut self, layer_name: &str, r: f32, g: f32, b: f32) -> bool {
        self.layer_manager.set_layer_color(layer_name, r, g, b)
    }
    
    #[wasm_bindgen]
    pub fn get_layer_settings(&self, layer_name: &str) -> JsValue {
        if let Some(settings) = self.layer_manager.get_layer_settings(layer_name) {
            serde_wasm_bindgen::to_value(settings).unwrap_or(JsValue::NULL)
        } else {
            JsValue::NULL
        }
    }
    
    #[wasm_bindgen]
    pub fn get_layer_names(&self) -> Vec<String> {
        self.layer_manager.get_layers().keys().cloned().collect()
    }
    
    #[wasm_bindgen]
    pub fn get_layer_sprite_count(&self, layer_name: &str) -> usize {
        if let Some(layer) = self.layer_manager.get_layer(layer_name) {
            layer.sprites.len()
        } else {
            0
        }
    }
    
    #[wasm_bindgen]
    pub fn set_layer_z_order(&mut self, layer_name: &str, z_order: i32) -> bool {
        self.layer_manager.set_layer_z_order(layer_name, z_order)
    }
    
    #[wasm_bindgen]
    pub fn clear_layer(&mut self, layer_name: &str) -> bool {
        if let Some(layer) = self.layer_manager.get_layer_mut(layer_name) {
            layer.sprites.clear();
            true
        } else {
            false
        }
    }
    
    #[wasm_bindgen]
    pub fn clear_all_sprites(&mut self) {
        self.layer_manager.clear_all_layers();
    }
    
    #[wasm_bindgen]
    pub fn set_layer_visible(&mut self, layer_name: &str, visible: bool) -> bool {
        self.layer_manager.set_layer_visibility(layer_name, visible)
    }

    // Paint System Methods
    
    // Table management for paint
    #[wasm_bindgen]
    pub fn paint_set_current_table(&mut self, table_id: &str) {
        self.paint.set_current_table(table_id);
    }
    
    #[wasm_bindgen]
    pub fn paint_get_current_table(&self) -> Option<String> {
        self.paint.get_current_table()
    }
    
    #[wasm_bindgen]
    pub fn paint_clear_table(&mut self, table_id: &str) {
        self.paint.clear_table_paint(table_id);
    }
    
    #[wasm_bindgen]
    pub fn paint_enter_mode(&mut self, width: f32, height: f32) {
        self.paint.enter_paint_mode(width, height);
    }
    
    #[wasm_bindgen]
    pub fn paint_exit_mode(&mut self) {
        self.paint.exit_paint_mode();
    }
    
    #[wasm_bindgen]
    pub fn paint_is_mode(&self) -> bool {
        self.paint.is_paint_mode()
    }
    
    #[wasm_bindgen]
    pub fn paint_set_brush_color(&mut self, r: f32, g: f32, b: f32, a: f32) {
        self.paint.set_brush_color(r, g, b, a);
    }
    
    #[wasm_bindgen]
    pub fn paint_set_brush_width(&mut self, width: f32) {
        self.paint.set_brush_width(width);
    }
    
    #[wasm_bindgen]
    pub fn paint_set_blend_mode(&mut self, blend_mode: &str) {
        self.paint.set_blend_mode(blend_mode);
    }
    
    #[wasm_bindgen]
    pub fn paint_get_brush_color(&self) -> Vec<f32> {
        self.paint.get_brush_color()
    }
    
    #[wasm_bindgen]
    pub fn paint_get_brush_width(&self) -> f32 {
        self.paint.get_brush_width()
    }
    
    #[wasm_bindgen]
    pub fn paint_start_stroke(&mut self, world_x: f32, world_y: f32, pressure: f32) -> bool {
        self.paint.start_stroke(world_x, world_y, pressure)
    }
    
    #[wasm_bindgen]
    pub fn paint_add_point(&mut self, world_x: f32, world_y: f32, pressure: f32) -> bool {
        self.paint.add_stroke_point(world_x, world_y, pressure)
    }
    
    #[wasm_bindgen]
    pub fn paint_end_stroke(&mut self) -> bool {
        self.paint.end_stroke()
    }
    
    #[wasm_bindgen]
    pub fn paint_cancel_stroke(&mut self) {
        self.paint.cancel_stroke();
    }
    
    #[wasm_bindgen]
    pub fn paint_clear_all(&mut self) {
        self.paint.clear_all_strokes();
    }
    
    #[wasm_bindgen]
    pub fn paint_save_strokes_as_sprites(&mut self, layer_name: &str) -> Vec<String> {
        let strokes_json = self.paint.get_strokes_data_json();
        let mut sprite_ids = Vec::new();
        
        if let Ok(strokes_data) = serde_wasm_bindgen::from_value::<Vec<serde_json::Value>>(strokes_json) {
            for stroke_data in strokes_data {
                if let (Some(id), Some(min_x), Some(min_y), Some(max_x), Some(max_y), Some(color), Some(_width)) = (
                    stroke_data["id"].as_str(),
                    stroke_data["min_x"].as_f64(),
                    stroke_data["min_y"].as_f64(),
                    stroke_data["max_x"].as_f64(),
                    stroke_data["max_y"].as_f64(),
                    stroke_data["color"].as_array(),
                    stroke_data["width"].as_f64()
                ) {
                    let sprite_id = format!("paint_stroke_{}", js_sys::Date::now() as u64);
                    
                    // Calculate sprite bounds
                    let sprite_width = (max_x - min_x).max(10.0);
                    let sprite_height = (max_y - min_y).max(10.0);
                    
                    // Extract color array
                    let tint_color = if color.len() >= 4 {
                        [
                            color[0].as_f64().unwrap_or(1.0) as f32,
                            color[1].as_f64().unwrap_or(1.0) as f32,
                            color[2].as_f64().unwrap_or(1.0) as f32,
                            color[3].as_f64().unwrap_or(1.0) as f32,
                        ]
                    } else {
                        [1.0, 1.0, 1.0, 1.0]
                    };
                    
                    // Create a sprite representing the paint stroke
                    let sprite = Sprite {
                        id: sprite_id.clone(),
                        world_x: min_x,
                        world_y: min_y,
                        width: sprite_width,
                        height: sprite_height,
                        rotation: 0.0,
                        scale_x: 1.0,
                        scale_y: 1.0,
                        texture_id: format!("paint_stroke_{}", id), // Custom texture ID for paint stroke
                        tint_color,
                        layer: layer_name.to_string(),
                    };
                    
                    // Convert sprite to JsValue and add to layer manager
                    if let Ok(sprite_js) = serde_wasm_bindgen::to_value(&sprite) {
                        match self.layer_manager.add_sprite_to_layer(layer_name, &sprite_js) {
                            Ok(sprite_id) => {
                                sprite_ids.push(sprite_id);
                            }
                            Err(e) => {
                                web_sys::console::log_1(&format!("[RUST] Failed to create sprite from paint stroke: {:?}", e).into());
                            }
                        }
                    }
                }
            }
        }
        
        // Clear paint strokes after converting to sprites
        if !sprite_ids.is_empty() {
            self.paint.clear_all_strokes();
            web_sys::console::log_1(&format!("[RUST] Saved {} paint strokes as sprites and cleared canvas", sprite_ids.len()).into());
        }
        
        sprite_ids
    }

    #[wasm_bindgen]
    pub fn paint_undo_stroke(&mut self) -> bool {
        self.paint.undo_last_stroke()
    }
    
    #[wasm_bindgen]
    pub fn paint_get_stroke_count(&self) -> usize {
        self.paint.get_stroke_count()
    }
    
    #[wasm_bindgen]
    pub fn paint_is_drawing(&self) -> bool {
        self.paint.is_drawing()
    }
    
    #[wasm_bindgen]
    pub fn paint_get_strokes(&self) -> JsValue {
        self.paint.get_all_strokes_json()
    }
    
    #[wasm_bindgen]
    pub fn paint_get_current_stroke(&self) -> JsValue {
        self.paint.get_current_stroke_json()
    }
    
    #[wasm_bindgen]
    pub fn paint_on_event(&mut self, event_type: &str, callback: js_sys::Function) {
        self.paint.on_stroke_event(event_type, callback);
    }

    // ========== TABLE SYNC INTEGRATION ==========

    /// Set network client for table synchronization
    #[wasm_bindgen]
    pub fn set_network_client(&mut self, network_client: &js_sys::Object) {
        self.table_sync.set_network_client(network_client);
    }

    /// Handle table data received from server
    #[wasm_bindgen]
    pub fn handle_table_data(&mut self, table_data_js: &JsValue) -> Result<(), JsValue> {
        // First, parse and store the table data
        self.table_sync.handle_table_data(table_data_js)?;
        
        // Get the parsed table data
        let table_data = self.table_sync.get_table_data();
        if table_data.is_null() {
            return Err(JsValue::from_str("Failed to get table data"));
        }

        // Parse the table data to sync with render engine
        let table: crate::table_sync::TableData = serde_wasm_bindgen::from_value(table_data)
            .map_err(|e| JsValue::from_str(&format!("Failed to parse table data for rendering: {}", e)))?;

        // Update table manager
        if let Some(table_id) = self.table_sync.get_table_id() {
            self.table_manager.create_table(&table_id, &table.table_name, table.width, table.height)?;
            self.table_manager.set_active_table(&table_id);
        }

        // Clear existing sprites from all layers
        self.layer_manager.clear_all_layers();

        // Add sprites to appropriate layers
        for (_layer_name, sprites) in &table.layers {
            // Note: layer_name is available if needed for layer-specific logic
            for sprite_data in sprites {
                // The sprite data already contains layer information
                self.add_sprite_from_table_data(sprite_data)?;
            }
        }

        web_sys::console::log_1(&format!("Successfully synced table '{}' with {} layers", 
            table.table_name, table.layers.len()).into());

        Ok(())
    }

    /// Add a sprite from table sync data to the render engine
    fn add_sprite_from_table_data(&mut self, sprite_data: &crate::table_sync::SpriteData) -> Result<(), JsValue> {
        // Convert table sync sprite data to render engine sprite
        let sprite = Sprite {
            id: sprite_data.sprite_id.clone(),
            world_x: sprite_data.coord_x,
            world_y: sprite_data.coord_y,
            width: 50.0, // Default width, will be updated when texture loads
            height: 50.0, // Default height, will be updated when texture loads
            scale_x: sprite_data.scale_x,
            scale_y: sprite_data.scale_y,
            rotation: 0.0, // Default rotation
            layer: sprite_data.layer.clone(),
            texture_id: sprite_data.texture_path.clone(),
            tint_color: [1.0, 1.0, 1.0, 1.0], // Default white tint
        };

        // Add sprite to the appropriate layer
        let sprite_js = serde_wasm_bindgen::to_value(&sprite)?;
        self.layer_manager.add_sprite_to_layer(&sprite_data.layer, &sprite_js)?;

        // Request asset if texture path is provided and not already cached
        if !sprite_data.texture_path.is_empty() {
            self.request_asset_if_needed(&sprite_data.texture_path);
        }

        Ok(())
    }

    /// Request asset download if not already available
    fn request_asset_if_needed(&self, texture_path: &str) {
        // Check if we already have this asset
        if !self.texture_manager.has_texture(texture_path) {
            // Dispatch event to request asset download
            let detail = js_sys::Object::new();
            js_sys::Reflect::set(&detail, &"asset_path".into(), &texture_path.into()).unwrap();
            
            let event_init = web_sys::CustomEventInit::new();
            event_init.set_detail(&detail);
            let event = web_sys::CustomEvent::new_with_event_init_dict(
                "asset-download-request",
                &event_init
            ).unwrap();
            
            if let Some(window) = web_sys::window() {
                let _ = window.dispatch_event(&event);
            }
        }
    }

    /// Handle sprite update from server
    #[wasm_bindgen]
    pub fn handle_sprite_update(&mut self, update_data_js: &JsValue) -> Result<(), JsValue> {
        // First update the table sync state
        self.table_sync.handle_sprite_update(update_data_js)?;

        // Parse the update data
        let update_data: crate::table_sync::SpriteUpdateData = serde_wasm_bindgen::from_value(update_data_js.clone())
            .map_err(|e| JsValue::from_str(&format!("Failed to parse sprite update: {}", e)))?;

        // Apply the update to the render engine
        match update_data.update_type.as_str() {
            "sprite_move" => {
                if let Some(to) = update_data.data.get("to") {
                    if let (Some(x), Some(y)) = (to.get("x"), to.get("y")) {
                        let new_pos = Vec2::new(x.as_f64().unwrap_or(0.0) as f32, y.as_f64().unwrap_or(0.0) as f32);
                        self.layer_manager.update_sprite_position(&update_data.sprite_id, new_pos);
                    }
                }
            }
            "sprite_scale" => {
                if let (Some(scale_x), Some(scale_y)) = (
                    update_data.data.get("scale_x"), 
                    update_data.data.get("scale_y")
                ) {
                    let new_scale = Vec2::new(
                        scale_x.as_f64().unwrap_or(1.0) as f32, 
                        scale_y.as_f64().unwrap_or(1.0) as f32
                    );
                    self.layer_manager.update_sprite_scale(&update_data.sprite_id, new_scale);
                }
            }
            "sprite_create" => {
                // Handle new sprite creation
                if let Some(sprite_data) = update_data.data.get("sprite_data") {
                    // Convert serde_json::Value to JsValue first
                    let sprite_js = serde_wasm_bindgen::to_value(sprite_data)
                        .map_err(|e| JsValue::from_str(&format!("Failed to convert sprite data: {}", e)))?;
                    let sprite: crate::table_sync::SpriteData = serde_wasm_bindgen::from_value(sprite_js)
                        .map_err(|e| JsValue::from_str(&format!("Failed to parse new sprite data: {}", e)))?;
                    self.add_sprite_from_table_data(&sprite)?;
                }
            }
            "sprite_remove" => {
                // Handle sprite deletion
                self.layer_manager.remove_sprite(&update_data.sprite_id);
            }
            _ => {
                web_sys::console::warn_1(&format!("Unknown sprite update type: {}", update_data.update_type).into());
            }
        }

        Ok(())
    }

    /// Send sprite move update to server
    #[wasm_bindgen]
    pub fn send_sprite_move(&mut self, sprite_id: &str, x: f64, y: f64) -> Result<String, JsValue> {
        self.table_sync.send_sprite_move(sprite_id, x, y)
    }

    /// Send sprite scale update to server
    #[wasm_bindgen]
    pub fn send_sprite_scale(&mut self, sprite_id: &str, scale_x: f64, scale_y: f64) -> Result<String, JsValue> {
        self.table_sync.send_sprite_scale(sprite_id, scale_x, scale_y)
    }

    /// Send sprite creation to server
    #[wasm_bindgen]
    pub fn send_sprite_create(&self, sprite_data_js: &JsValue) -> Result<(), JsValue> {
        self.table_sync.send_sprite_create(sprite_data_js)
    }

    /// Send sprite deletion to server
    #[wasm_bindgen]
    pub fn send_sprite_delete(&mut self, sprite_id: &str) -> Result<String, JsValue> {
        self.table_sync.send_sprite_delete(sprite_id)
    }

    /// Request table data from server
    #[wasm_bindgen]
    pub fn request_table(&self, table_name: &str) -> Result<(), JsValue> {
        self.table_sync.request_table(table_name)
    }

    /// Get current table data
    #[wasm_bindgen]
    pub fn get_table_data(&self) -> JsValue {
        self.table_sync.get_table_data()
    }

    /// Get current table ID
    #[wasm_bindgen]
    pub fn get_table_id(&self) -> Option<String> {
        self.table_sync.get_table_id()
    }

    /// Set table sync callbacks
    #[wasm_bindgen]
    pub fn set_table_received_handler(&mut self, callback: &js_sys::Function) {
        self.table_sync.set_table_received_handler(callback);
    }

    #[wasm_bindgen]
    pub fn set_sprite_update_handler(&mut self, callback: &js_sys::Function) {
        self.table_sync.set_sprite_update_handler(callback);
    }

    #[wasm_bindgen]
    pub fn set_table_error_handler(&mut self, callback: &js_sys::Function) {
        self.table_sync.set_error_handler(callback);
    }
}
