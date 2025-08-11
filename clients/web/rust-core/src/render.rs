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
use crate::event_system::{EventSystem, MouseEventResult};
use crate::layer_manager::LayerManager;
use crate::grid_system::GridSystem;
use crate::texture_manager::TextureManager;
use crate::actions::ActionsClient;
use crate::paint::PaintSystem;

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
}

#[wasm_bindgen]
impl RenderEngine {
    #[wasm_bindgen(constructor)]
    pub fn new(canvas: HtmlCanvasElement) -> Result<RenderEngine, JsValue> {
        let gl = canvas.get_context("webgl2")?.unwrap().dyn_into::<WebGlRenderingContext>()?;
        let renderer = WebGLRenderer::new(gl.clone())?;
        let lighting = LightingSystem::new(gl.clone())?;
        let fog = FogOfWarSystem::new(gl.clone())?;
        let texture_manager = TextureManager::new(gl);
        
        let layer_manager = LayerManager::new();
        let grid_system = GridSystem::new();
        let actions = ActionsClient::new();
        let paint = PaintSystem::new();
        
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
        };
        
        engine.update_view_matrix();
        Ok(engine)
    }
    
    #[wasm_bindgen]
    pub fn render(&mut self) -> Result<(), JsValue> {
        self.renderer.clear(0.1, 0.1, 0.1, 1.0);
        
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
                    SpriteRenderer::draw_sprite(sprite, layer.settings.opacity, &self.renderer, &self.texture_manager, &self.input)?;
                }
            }
        }

        // Render lighting system
        self.lighting.render_lights(&self.view_matrix.to_array(), self.canvas_size.x, self.canvas_size.y)?;
        
        // Render paint strokes (on top of everything except fog)
        if self.paint.is_paint_mode() {
            self.paint.render_strokes(&self.renderer)?;
        }
        
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
    
    // Public API methods
    #[wasm_bindgen]
    pub fn resize_canvas(&mut self, width: f32, height: f32) {
        self.canvas_size = Vec2::new(width, height);
        self.update_view_matrix();
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
        if self.paint.is_paint_mode() {
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
        web_sys::console::log_1(&format!("[RUST] Mouse move at world: {}, {}, mode: {:?}", world_pos.x, world_pos.y, self.input.input_mode).into());
        
        // Check if paint mode is active first
        if self.paint.is_paint_mode() {
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
        if self.paint.is_paint_mode() {
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
                if parts.len() >= 4 {
                    match parts[0] {
                        "rectangle" => {
                            if let (Ok(x), Ok(y), Ok(width), Ok(height)) = (
                                parts[1].parse::<f32>(),
                                parts[2].parse::<f32>(),
                                parts[3].parse::<f32>(),
                                parts[4].parse::<f32>()
                            ) {
                                web_sys::console::log_1(&format!("[RUST] Creating rectangle sprite at {},{} size {}x{}", x, y, width, height).into());
                                let sprite_id = self.create_rectangle_sprite(x, y, width, height, "background");
                                web_sys::console::log_1(&format!("[RUST] Created rectangle sprite with ID: {}", sprite_id).into());
                            }
                        }
                        "circle" => {
                            if let (Ok(x), Ok(y), Ok(radius)) = (
                                parts[1].parse::<f32>(),
                                parts[2].parse::<f32>(),
                                parts[3].parse::<f32>()
                            ) {
                                web_sys::console::log_1(&format!("[RUST] Creating circle sprite at {},{} radius {}", x, y, radius).into());
                                let sprite_id = self.create_circle_sprite(x, y, radius, "background");
                                web_sys::console::log_1(&format!("[RUST] Created circle sprite with ID: {}", sprite_id).into());
                            }
                        }
                        "line" => {
                            if let (Ok(x1), Ok(y1), Ok(x2), Ok(y2)) = (
                                parts[1].parse::<f32>(),
                                parts[2].parse::<f32>(),
                                parts[3].parse::<f32>(),
                                parts[4].parse::<f32>()
                            ) {
                                web_sys::console::log_1(&format!("[RUST] Creating line sprite from {},{} to {},{}", x1, y1, x2, y2).into());
                                let sprite_id = self.create_line_sprite(x1, y1, x2, y2, "background");
                                web_sys::console::log_1(&format!("[RUST] Created line sprite with ID: {}", sprite_id).into());
                            }
                        }
                        _ => {}
                    }
                }
            }
            MouseEventResult::None => {
                // Fallback to legacy handling if needed
            }
        }
    }
    
    fn select_sprites_in_area(&mut self, min: Vec2, max: Vec2) {
        let selected_sprites = self.layer_manager.select_sprites_in_area(min, max);
        
        // Update selection
        if !selected_sprites.is_empty() {
            self.input.clear_selection();
            for sprite_id in selected_sprites {
                self.input.add_to_selection(sprite_id);
            }
        }
    }

    fn find_sprite_at_position(&self, world_pos: Vec2) -> Option<String> {
        self.layer_manager.find_sprite_at_position(world_pos)
    }

    fn select_sprite_at_position(&mut self, world_pos: Vec2) {
        if let Some(sprite_id) = self.find_sprite_at_position(world_pos) {
            // Single selection - clear others and select this one
            self.input.set_single_selection(sprite_id);
            self.input.input_mode = InputMode::SpriteMove;
            // Calculate offset from click position to sprite's top-left corner
            if let Some((sprite, _)) = self.layer_manager.find_sprite(&self.input.selected_sprite_id.as_ref().unwrap()) {
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
        self.layer_manager.find_sprite(sprite_id)
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
            InputMode::Measurement => "measurement".to_string(),
            InputMode::CreateRectangle => "create_rectangle".to_string(),
            InputMode::CreateCircle => "create_circle".to_string(),
            InputMode::CreateLine => "create_line".to_string(),
            InputMode::CreateText => "create_text".to_string(),
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

    // ============================================================================
    // SPRITE CREATION METHODS - Create sprites from tools
    // ============================================================================
    
    #[wasm_bindgen]
    pub fn create_rectangle_sprite(&mut self, x: f32, y: f32, width: f32, height: f32, layer_name: &str) -> String {
        web_sys::console::log_1(&format!("[RUST] create_rectangle_sprite called: {},{} {}x{} on layer '{}'", x, y, width, height, layer_name).into());
        let sprite_id = format!("rect_{}", js_sys::Date::now() as u64);
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
            texture_id: String::new(), // No texture for colored rectangle
            tint_color: [0.5, 0.8, 0.5, 1.0], // Light green
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
        let sprite_id = format!("circle_{}", js_sys::Date::now() as u64);
        let diameter = radius * 2.0;
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
            texture_id: String::new(), // No texture for colored circle
            tint_color: [0.5, 0.5, 0.8, 1.0], // Light blue
        };
        
        // Convert to JsValue for layer manager
        let sprite_data = serde_wasm_bindgen::to_value(&sprite).unwrap();
        let _ = self.layer_manager.add_sprite_to_layer(layer_name, &sprite_data);
        web_sys::console::log_1(&format!("[RUST] Created circle sprite: {}", sprite_id).into());
        sprite_id
    }
    
    #[wasm_bindgen]
    pub fn create_line_sprite(&mut self, start_x: f32, start_y: f32, end_x: f32, end_y: f32, layer_name: &str) -> String {
        let sprite_id = format!("line_{}", js_sys::Date::now() as u64);
        let length = ((end_x - start_x).powi(2) + (end_y - start_y).powi(2)).sqrt();
        let width = 2.0; // Line width
        
        let sprite = Sprite {
            id: sprite_id.clone(),
            world_x: start_x.min(end_x) as f64,
            world_y: start_y.min(end_y) as f64,
            width: length as f64,
            height: width as f64,
            rotation: (end_y - start_y).atan2(end_x - start_x) as f64,
            scale_x: 1.0,
            scale_y: 1.0,
            layer: layer_name.to_string(),
            texture_id: String::new(), // No texture for colored line
            tint_color: [0.8, 0.5, 0.5, 1.0], // Light red
        };
        
        // Convert to JsValue for layer manager
        let sprite_data = serde_wasm_bindgen::to_value(&sprite).unwrap();
        let _ = self.layer_manager.add_sprite_to_layer(layer_name, &sprite_data);
        web_sys::console::log_1(&format!("[RUST] Created line sprite: {}", sprite_id).into());
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
                // Note: LayerManager doesn't have move_sprite_to_layer, so we'll skip this for now
                web_sys::console::log_1(&format!("Sprite {} moved to layer {} in actions", sprite_id, new_layer).into());
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
    
    // Paint System Methods
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
        let strokes_data = self.paint.get_all_strokes_data();
        let mut sprite_ids = Vec::new();
        
        for stroke_data in strokes_data {
            if let Ok(sprite_id) = self.create_paint_stroke_sprite(&stroke_data, layer_name) {
                sprite_ids.push(sprite_id);
            }
        }
        
        web_sys::console::log_1(&format!("[RUST] Saved {} paint strokes as sprites", sprite_ids.len()).into());
        sprite_ids
    }
    
    fn create_paint_stroke_sprite(&mut self, stroke_data: &str, layer_name: &str) -> Result<String, String> {
        // Parse stroke data (simplified for now - could be JSON in future)
        let sprite_id = format!("paint_stroke_{}", js_sys::Date::now() as u64);
        
        // For now, create a simple colored sprite to represent the stroke
        // In a more advanced implementation, this could be a texture or vector path
        let sprite = Sprite {
            id: sprite_id.clone(),
            world_x: 0.0, // These would be calculated from stroke bounds
            world_y: 0.0,
            width: 10.0,  // Placeholder dimensions
            height: 10.0,
            rotation: 0.0,
            scale_x: 1.0,
            scale_y: 1.0,
            texture_id: String::new(),
            tint_color: [1.0, 0.5, 0.5, 1.0], // Paint stroke color
            layer: layer_name.to_string(),
        };
        
        // Convert sprite to JsValue
        let sprite_js = serde_wasm_bindgen::to_value(&sprite)
            .map_err(|e| format!("Failed to serialize sprite: {}", e))?;
        
        match self.layer_manager.add_sprite_to_layer(layer_name, &sprite_js) {
            Ok(id) => Ok(id),
            Err(e) => Err(format!("Failed to add sprite to layer: {:?}", e))
        }
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
}
