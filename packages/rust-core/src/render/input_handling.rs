use wasm_bindgen::prelude::*;
use crate::math::*;
use crate::input::{InputMode, HandleDetector};
use crate::sprite_manager::SpriteManager;
use crate::event_system::MouseEventResult;

use super::RenderEngine;

#[wasm_bindgen]
impl RenderEngine {
    #[wasm_bindgen]
    pub fn get_cursor_type(&self, screen_x: f32, screen_y: f32) -> String {
        let world_pos = self.camera.screen_to_world(Vec2::new(screen_x, screen_y));
        let uid_opt = self.current_user_id;

        let user_can_control = |s: &crate::types::Sprite| -> bool {
            if self.is_gm { return true; }
            let Some(uid) = uid_opt else { return false; };
            !s.controlled_by.is_empty() && s.controlled_by.contains(&uid)
        };

        if let Some(selected_id) = &self.input.selected_sprite_id {
            if let Some((sprite, _)) = self.layer_manager.find_sprite(selected_id) {
                if user_can_control(sprite) {
                    let rotate_handle_pos = SpriteManager::get_rotation_handle_position(sprite, self.camera.zoom);
                    let handle_size = 16.0 / self.camera.zoom as f32;
                    if HandleDetector::point_in_handle(world_pos, rotate_handle_pos.x, rotate_handle_pos.y, handle_size) {
                        return "crosshair".to_string();
                    }
                    if sprite.rotation == 0.0 {
                        if let Some(handle) = HandleDetector::get_resize_handle_for_cursor_detection(sprite, world_pos, self.camera.zoom) {
                            return HandleDetector::get_cursor_for_handle(handle).to_string();
                        }
                    }
                    if sprite.contains_world_point(world_pos) {
                        return "move".to_string();
                    }
                }
            }
        }

        if let Some(hovered_id) = self.layer_manager.find_sprite_for_right_click(world_pos) {
            if let Some((sprite, _)) = self.layer_manager.find_sprite(&hovered_id) {
                if user_can_control(sprite) {
                    return "grab".to_string();
                }
            }
        }

        "default".to_string()
    }
    
    #[wasm_bindgen]
    pub fn handle_mouse_down(&mut self, screen_x: f32, screen_y: f32) {
        self.handle_mouse_down_internal(screen_x, screen_y, false);
    }
    
    #[wasm_bindgen]
    pub fn handle_mouse_down_with_ctrl(&mut self, screen_x: f32, screen_y: f32, ctrl_pressed: bool) {
        self.handle_mouse_down_internal(screen_x, screen_y, ctrl_pressed);
    }
    
    fn handle_mouse_down_internal(&mut self, screen_x: f32, screen_y: f32, ctrl_pressed: bool) {
        let world_pos = self.camera.screen_to_world(Vec2::new(screen_x, screen_y));
        self.input.last_mouse_screen = Vec2::new(screen_x, screen_y);
        
        if self.input.input_mode == InputMode::Paint {
            self.paint.start_stroke(world_pos.x, world_pos.y, 1.0);
            return;
        }
        
        let result = self.event_system.handle_mouse_down(
            world_pos,
            &mut self.input,
            self.layer_manager.get_layers_mut(),
            &mut self.lighting,
            &self.wall_manager,
            self.camera.zoom,
            ctrl_pressed,
            self.active_layer.as_str()
        );
        
        let uid_opt = self.current_user_id;
        let dragging = matches!(self.input.input_mode, InputMode::SpriteMove | InputMode::SpriteResize(_) | InputMode::SpriteRotate);
        let selected_id = self.input.selected_sprite_id.clone();
        let block_drag = !self.is_gm
            && dragging
            && (uid_opt.is_none()
                || selected_id.as_deref()
                    .and_then(|id| self.layer_manager.find_sprite(id))
                    .map(|(s, _)| s.controlled_by.is_empty() || !s.controlled_by.contains(&uid_opt.unwrap()))
                    .unwrap_or(true));
        if block_drag {
            self.input.input_mode = InputMode::None;
            self.input.selected_sprite_id = None;
            self.input.selected_sprite_ids.clear();
        }

        // Result from handle_mouse_down is currently unused after
        // CameraOperation variant removal.
        let _ = result;
    }
    
    #[wasm_bindgen]
    pub fn handle_mouse_move(&mut self, screen_x: f32, screen_y: f32) {
        let current_screen = Vec2::new(screen_x, screen_y);
        let world_pos = self.camera.screen_to_world(current_screen);
        
        if self.input.input_mode == InputMode::Paint {
            self.paint.add_stroke_point(world_pos.x, world_pos.y, 1.0);
            self.input.last_mouse_screen = current_screen;
            return;
        }
        
        if self.input.input_mode == InputMode::CameraPan {
            let last_screen = self.input.last_mouse_screen;
            let screen_delta = current_screen - last_screen;
            #[cfg(debug_assertions)]
            web_sys::console::debug_1(&format!("[RUST-DEBUG] Camera panning by screen delta: {}, {}", -screen_delta.x, -screen_delta.y).into());
            self.camera.pan_by_screen_delta(Vec2::new(-screen_delta.x, -screen_delta.y));
            self.input.last_mouse_screen = current_screen;
            self.update_view_matrix();
            #[cfg(debug_assertions)]
            web_sys::console::debug_1(&format!("[RUST-DEBUG] Camera position now: {}, {}", self.camera.world_x, self.camera.world_y).into());
            return;
        }
        
        let result = self.event_system.handle_mouse_move(
            world_pos,
            &mut self.input,
            self.layer_manager.get_layers_mut(),
            &mut self.lighting,
            &mut self.wall_manager,
        );

        if self.input.input_mode == InputMode::WallDrag {
            self.obstacles_dirty = true;
        } else if matches!(self.input.input_mode, InputMode::SpriteMove | InputMode::SpriteResize(_)) {
            if let Some(ref sprite_id) = self.input.selected_sprite_id.clone() {
                let on_obstacles = self.layer_manager.find_sprite(sprite_id).map(|(_, l)| l == "obstacles").unwrap_or(false);
                if on_obstacles { self.obstacles_dirty = true; }
            }
        }
        
        self.input.last_mouse_screen = current_screen;
        
        match result {
            MouseEventResult::Handled => {
                self.view_matrix = self.camera.view_matrix(self.canvas_size);
            }
            MouseEventResult::CreateSprite(_) => {}
            MouseEventResult::None => {}
        }
        
        self.input.last_mouse_screen = current_screen;
    }
    
    #[wasm_bindgen]
    pub fn handle_mouse_up(&mut self, screen_x: f32, screen_y: f32) {
        let world_pos = self.camera.screen_to_world(Vec2::new(screen_x, screen_y));
        
        if self.input.input_mode == InputMode::Paint {
            web_sys::console::log_1(&"[RUST] Paint mode active, ending paint stroke".into());
            self.paint.end_stroke();
            return;
        }
        
        let table_id = self.table_manager.get_active_table_id()
            .unwrap_or("default_table".to_string());
        let converter = self.table_manager.get_unit_converter(&table_id);
        
        let result = self.event_system.handle_mouse_up(
            world_pos,
            &mut self.input,
            self.layer_manager.get_layers_mut(),
            &mut self.lighting,
            &self.wall_manager,
            &mut self.fog,
            table_id,
            self.active_layer.as_str(),
            &converter,
        );
        
        match result {
            MouseEventResult::Handled => {}
            MouseEventResult::CreateSprite(sprite_data) => {
                self.handle_create_sprite_result(&sprite_data);
            }
            MouseEventResult::None => {}
        }
    }

    fn handle_create_sprite_result(&mut self, sprite_data: &str) {
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
                        let (color, opacity, filled) = self.get_shape_settings();
                        let active_layer = self.active_layer.clone();
                        let sprite_id = self.create_rectangle_sprite_with_options(x, y, width, height, &active_layer, &color, opacity, filled);
                        Self::send_shape_to_server("rectangle", &sprite_id, x, y, width, height, &active_layer, &color);
                        Self::dispatch_sprite_added_event();
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
                        let (color, opacity, filled) = self.get_shape_settings();
                        let active_layer = self.active_layer.clone();
                        let sprite_id = self.create_circle_sprite_with_options(x, y, radius, &active_layer, &color, opacity, filled);
                        let diameter = radius * 2.0;
                        Self::send_circle_to_server(&sprite_id, x, y, radius, diameter, &active_layer, &color);
                        Self::dispatch_sprite_added_event();
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
                        let (color, opacity, _) = self.get_shape_settings();
                        let active_layer = self.active_layer.clone();
                        let sprite_id = self.create_line_sprite_with_options(x1, y1, x2, y2, &active_layer, &color, opacity);
                        Self::send_line_to_server(&sprite_id, x1, y1, x2, y2, &active_layer, &color);
                        Self::dispatch_sprite_added_event();
                    }
                }
            }
            _ => {}
        }
    }

    fn send_shape_to_server(shape_type: &str, sprite_id: &str, x: f32, y: f32, width: f32, height: f32, layer: &str, color: &str) {
        if let Some(window) = web_sys::window() {
            if let Ok(game_api) = js_sys::Reflect::get(&window, &"gameAPI".into()) {
                if let Ok(send_message) = js_sys::Reflect::get(&game_api, &"sendMessage".into()) {
                    if let Ok(send_fn) = send_message.dyn_into::<js_sys::Function>() {
                        let data = js_sys::Object::new();
                        js_sys::Reflect::set(&data, &"id".into(), &sprite_id.into()).unwrap();
                        js_sys::Reflect::set(&data, &"x".into(), &x.into()).unwrap();
                        js_sys::Reflect::set(&data, &"y".into(), &y.into()).unwrap();
                        js_sys::Reflect::set(&data, &"width".into(), &width.into()).unwrap();
                        js_sys::Reflect::set(&data, &"height".into(), &height.into()).unwrap();
                        js_sys::Reflect::set(&data, &"layer".into(), &layer.into()).unwrap();
                        js_sys::Reflect::set(&data, &"texture_path".into(), &"".into()).unwrap();
                        js_sys::Reflect::set(&data, &"color".into(), &color.into()).unwrap();
                        js_sys::Reflect::set(&data, &"obstacle_type".into(), &shape_type.into()).unwrap();
                        let obs = js_sys::Object::new();
                        js_sys::Reflect::set(&obs, &"x".into(), &x.into()).unwrap();
                        js_sys::Reflect::set(&obs, &"y".into(), &y.into()).unwrap();
                        js_sys::Reflect::set(&obs, &"width".into(), &width.into()).unwrap();
                        js_sys::Reflect::set(&obs, &"height".into(), &height.into()).unwrap();
                        js_sys::Reflect::set(&data, &"obstacle_data".into(), &obs).unwrap();
                        let _ = send_fn.call2(&game_api, &"sprite_create".into(), &data);
                    }
                }
            }
        }
    }

    fn send_circle_to_server(sprite_id: &str, x: f32, y: f32, radius: f32, diameter: f32, layer: &str, color: &str) {
        if let Some(window) = web_sys::window() {
            if let Ok(game_api) = js_sys::Reflect::get(&window, &"gameAPI".into()) {
                if let Ok(send_message) = js_sys::Reflect::get(&game_api, &"sendMessage".into()) {
                    if let Ok(send_fn) = send_message.dyn_into::<js_sys::Function>() {
                        let data = js_sys::Object::new();
                        js_sys::Reflect::set(&data, &"id".into(), &sprite_id.into()).unwrap();
                        js_sys::Reflect::set(&data, &"x".into(), &(x - radius).into()).unwrap();
                        js_sys::Reflect::set(&data, &"y".into(), &(y - radius).into()).unwrap();
                        js_sys::Reflect::set(&data, &"width".into(), &diameter.into()).unwrap();
                        js_sys::Reflect::set(&data, &"height".into(), &diameter.into()).unwrap();
                        js_sys::Reflect::set(&data, &"layer".into(), &layer.into()).unwrap();
                        js_sys::Reflect::set(&data, &"texture_path".into(), &"".into()).unwrap();
                        js_sys::Reflect::set(&data, &"color".into(), &color.into()).unwrap();
                        js_sys::Reflect::set(&data, &"obstacle_type".into(), &"circle".into()).unwrap();
                        let obs = js_sys::Object::new();
                        js_sys::Reflect::set(&obs, &"cx".into(), &x.into()).unwrap();
                        js_sys::Reflect::set(&obs, &"cy".into(), &y.into()).unwrap();
                        js_sys::Reflect::set(&obs, &"radius".into(), &radius.into()).unwrap();
                        js_sys::Reflect::set(&data, &"obstacle_data".into(), &obs).unwrap();
                        let _ = send_fn.call2(&game_api, &"sprite_create".into(), &data);
                    }
                }
            }
        }
    }

    fn send_line_to_server(sprite_id: &str, x1: f32, y1: f32, x2: f32, y2: f32, layer: &str, color: &str) {
        let min_x = x1.min(x2);
        let min_y = y1.min(y2);
        let width = (x2 - x1).abs().max(2.0);
        let height = (y2 - y1).abs().max(2.0);

        if let Some(window) = web_sys::window() {
            if let Ok(game_api) = js_sys::Reflect::get(&window, &"gameAPI".into()) {
                if let Ok(send_message) = js_sys::Reflect::get(&game_api, &"sendMessage".into()) {
                    if let Ok(send_fn) = send_message.dyn_into::<js_sys::Function>() {
                        let data = js_sys::Object::new();
                        js_sys::Reflect::set(&data, &"id".into(), &sprite_id.into()).unwrap();
                        js_sys::Reflect::set(&data, &"x".into(), &min_x.into()).unwrap();
                        js_sys::Reflect::set(&data, &"y".into(), &min_y.into()).unwrap();
                        js_sys::Reflect::set(&data, &"width".into(), &width.into()).unwrap();
                        js_sys::Reflect::set(&data, &"height".into(), &height.into()).unwrap();
                        js_sys::Reflect::set(&data, &"layer".into(), &layer.into()).unwrap();
                        js_sys::Reflect::set(&data, &"texture_path".into(), &"".into()).unwrap();
                        js_sys::Reflect::set(&data, &"color".into(), &color.into()).unwrap();
                        js_sys::Reflect::set(&data, &"obstacle_type".into(), &"line".into()).unwrap();
                        let obs = js_sys::Object::new();
                        js_sys::Reflect::set(&obs, &"x1".into(), &x1.into()).unwrap();
                        js_sys::Reflect::set(&obs, &"y1".into(), &y1.into()).unwrap();
                        js_sys::Reflect::set(&obs, &"x2".into(), &x2.into()).unwrap();
                        js_sys::Reflect::set(&obs, &"y2".into(), &y2.into()).unwrap();
                        js_sys::Reflect::set(&data, &"obstacle_data".into(), &obs).unwrap();
                        let _ = send_fn.call2(&game_api, &"sprite_create".into(), &data);
                    }
                }
            }
        }
    }

    fn dispatch_sprite_added_event() {
        if let Some(window) = web_sys::window() {
            let event = web_sys::Event::new("spriteAdded").unwrap();
            let _ = window.dispatch_event(&event);
        }
    }

    #[wasm_bindgen]
    pub fn handle_right_click(&self, screen_x: f32, screen_y: f32) -> Option<String> {
        let world_pos = self.camera.screen_to_world(Vec2::new(screen_x, screen_y));
        self.layer_manager.find_sprite_for_right_click(world_pos)
    }

    #[wasm_bindgen]
    pub fn handle_wheel(&mut self, screen_x: f32, screen_y: f32, delta_y: f32) {
        #[cfg(debug_assertions)]
        web_sys::console::debug_1(&format!("[RUST-DEBUG] Wheel event at screen: {}, {}, delta: {}", screen_x, screen_y, delta_y).into());
        self.camera.handle_wheel(screen_x, screen_y, delta_y);
        self.update_view_matrix();
    }

    /// Get list of currently selected sprite IDs
    #[wasm_bindgen]
    pub fn get_selected_sprite_ids(&self) -> Vec<String> {
        self.input.selected_sprite_ids.clone()
    }

    /// Select all sprites in all layers
    #[wasm_bindgen]
    pub fn select_all_sprites(&mut self) {
        self.input.selected_sprite_ids.clear();
        for layer in self.layer_manager.get_layers().values() {
            for sprite in &layer.sprites {
                self.input.selected_sprite_ids.push(sprite.id.clone());
            }
        }
        self.input.selected_sprite_id = self.input.selected_sprite_ids.first().cloned();
    }

    /// Clear current selection
    #[wasm_bindgen]
    pub fn clear_selection(&mut self) {
        self.input.clear_selection();
    }

    /// Enhanced mouse down handler with modifier key support
    pub fn handle_mouse_down_with_modifiers(&mut self, screen_x: f64, screen_y: f64, ctrl_key: bool, shift_key: bool) -> Option<String> {
        let world_coords = self.screen_to_world(screen_x as f32, screen_y as f32);
        let world_pos = Vec2::new(world_coords[0] as f32, world_coords[1] as f32);
        
        if ctrl_key {
            if let Some(sprite_id) = self.find_sprite_at_position(world_pos) {
                if self.input.is_sprite_selected(&sprite_id) {
                    self.input.remove_from_selection(&sprite_id);
                } else {
                    self.input.add_to_selection(sprite_id.clone());
                }
                return Some(sprite_id);
            }
        } else if let Some(sprite_id) = self.find_sprite_at_position(world_pos) {
            self.input.set_single_selection(sprite_id.clone());
            return Some(sprite_id);
        } else if !shift_key {
            self.input.start_area_selection(world_pos);
        }
        None
    }
}
