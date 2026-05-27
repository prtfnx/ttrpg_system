use wasm_bindgen::prelude::*;
use web_sys::HtmlImageElement;
use crate::types::*;

use super::RenderEngine;

#[wasm_bindgen]
impl RenderEngine {
    // Sprite management methods
    #[wasm_bindgen]
    pub fn add_sprite_to_layer(&mut self, layer_name: &str, sprite_data: &JsValue) -> Result<String, JsValue> {
        let result = self.layer_manager.add_sprite_to_layer(layer_name, sprite_data);
        if result.is_ok() && layer_name == "obstacles" { self.obstacles_dirty = true; }
        result
    }
    
    #[wasm_bindgen]
    pub fn remove_sprite(&mut self, sprite_id: &str) -> bool {
        let on_obstacles = self.layer_manager.find_sprite(sprite_id).map(|(_, l)| l == "obstacles").unwrap_or(false);
        let result = self.layer_manager.remove_sprite(sprite_id);
        if result {
            if self.input.selected_sprite_id.as_ref() == Some(&sprite_id.to_string()) {
                self.input.selected_sprite_id = None;
            }
            if on_obstacles { self.obstacles_dirty = true; }
        }
        result
    }

    #[wasm_bindgen]
    pub fn move_sprite_to_layer(&mut self, sprite_id: &str, new_layer: &str) -> bool {
        let result = self.layer_manager.move_sprite_to_layer(sprite_id, new_layer);
        if result && new_layer == "obstacles" { self.obstacles_dirty = true; }
        result
    }

    
    #[wasm_bindgen]
    pub fn rotate_sprite(&mut self, sprite_id: &str, rotation_degrees: f64) -> bool {
        self.layer_manager.rotate_sprite(sprite_id, rotation_degrees)
    }
    
    #[wasm_bindgen]
    pub fn update_sprite_position(&mut self, sprite_id: &str, x: f64, y: f64) -> bool {
        let new_position = crate::math::Vec2::new(x as f32, y as f32);
        let ok = self.layer_manager.update_sprite_position(sprite_id, new_position);
        if ok {
            let on_obstacles = self.layer_manager.find_sprite(sprite_id).map(|(_, l)| l == "obstacles").unwrap_or(false);
            if on_obstacles { self.obstacles_dirty = true; }
        }
        ok
    }
    
    #[wasm_bindgen]
    pub fn update_sprite_scale(&mut self, sprite_id: &str, scale_x: f64, scale_y: f64) -> bool {
        let new_scale = crate::math::Vec2::new(scale_x as f32, scale_y as f32);
        self.layer_manager.update_sprite_scale(sprite_id, new_scale)
    }

    /// Set sprite position (alias for update_sprite_position)
    #[wasm_bindgen]
    pub fn set_sprite_position(&mut self, sprite_id: &str, x: f64, y: f64) -> bool {
        self.update_sprite_position(sprite_id, x, y)
    }

    /// Set sprite scale (alias for update_sprite_scale)
    #[wasm_bindgen]
    pub fn set_sprite_scale(&mut self, sprite_id: &str, scale_x: f64, scale_y: f64) -> bool {
        self.update_sprite_scale(sprite_id, scale_x, scale_y)
    }

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

    /// Get sprite position for movement operations
    #[wasm_bindgen]
    pub fn get_sprite_position(&self, sprite_id: &str) -> Option<Vec<f32>> {
        self.find_sprite(sprite_id).map(|sprite| vec![sprite.world_x as f32, sprite.world_y as f32])
    }

    /// Get sprite scale for scaling operations  
    #[wasm_bindgen]
    pub fn get_sprite_scale(&self, sprite_id: &str) -> Option<Vec<f32>> {
        self.find_sprite(sprite_id).map(|sprite| vec![sprite.scale_x as f32, sprite.scale_y as f32])
    }

    /// Get sprite data for network synchronization
    pub fn get_sprite_data(&self, sprite_id: &str) -> JsValue {
        if let Some(sprite) = self.find_sprite(sprite_id) {
            serde_wasm_bindgen::to_value(sprite).unwrap_or(JsValue::NULL)
        } else {
            JsValue::NULL
        }
    }

    // Texture management
    #[wasm_bindgen]
    pub fn load_texture(&mut self, name: &str, image: &HtmlImageElement) -> Result<(), JsValue> {
        self.texture_manager.load_texture(name, image)
    }

    pub fn create_rectangle_sprite_with_options(&mut self, x: f32, y: f32, width: f32, height: f32, layer_name: &str, color: &str, opacity: f32, filled: bool) -> String {
        let sprite_id = format!("rect_{}", js_sys::Date::now() as u64);
        let active_table_id = self.table_manager.get_active_table_id()
            .unwrap_or("default_table".to_string());
        let sprite = Sprite {
            id: sprite_id.clone(),
            world_x: x as f64,
            world_y: y as f64,
            width: width as f64,
            height: height as f64,
            scale_x: 1.0,
            scale_y: 1.0,
            layer: layer_name.to_string(),
            texture_id: String::new(),
            tint_color: {
                let c = Self::hex_to_rgba(color, opacity);
                [c[0] as f32 / 255.0, c[1] as f32 / 255.0, c[2] as f32 / 255.0, c[3] as f32 / 255.0]
            },
            table_id: active_table_id,
            obstacle_type: Some("rectangle".to_string()),
            shape_filled: Some(filled),
            ..Default::default()
        };
        let sprite_data = serde_wasm_bindgen::to_value(&sprite).unwrap();
        let _ = self.layer_manager.add_sprite_to_layer(layer_name, &sprite_data);
        if layer_name == "obstacles" { self.obstacles_dirty = true; }
        sprite_id
    }

    pub fn create_circle_sprite_with_options(&mut self, x: f32, y: f32, radius: f32, layer_name: &str, color: &str, opacity: f32, filled: bool) -> String {
        let sprite_id = format!("circle_{}", js_sys::Date::now() as u64);
        let diameter = radius * 2.0;
        let active_table_id = self.table_manager.get_active_table_id()
            .unwrap_or("default_table".to_string());
        let sprite = Sprite {
            id: sprite_id.clone(),
            world_x: (x - radius) as f64,
            world_y: (y - radius) as f64,
            width: diameter as f64,
            height: diameter as f64,
            scale_x: 1.0,
            scale_y: 1.0,
            layer: layer_name.to_string(),
            texture_id: String::new(),
            tint_color: {
                let c = Self::hex_to_rgba(color, opacity);
                [c[0] as f32 / 255.0, c[1] as f32 / 255.0, c[2] as f32 / 255.0, c[3] as f32 / 255.0]
            },
            table_id: active_table_id,
            obstacle_type: Some("circle".to_string()),
            shape_filled: Some(filled),
            ..Default::default()
        };
        let sprite_data = serde_wasm_bindgen::to_value(&sprite).unwrap();
        let _ = self.layer_manager.add_sprite_to_layer(layer_name, &sprite_data);
        if layer_name == "obstacles" { self.obstacles_dirty = true; }
        sprite_id
    }

    pub fn create_line_sprite_with_options(&mut self, start_x: f32, start_y: f32, end_x: f32, end_y: f32, layer_name: &str, color: &str, opacity: f32) -> String {
        let sprite_id = format!("line_{}", js_sys::Date::now() as u64);
        let dx = end_x - start_x;
        let dy = end_y - start_y;
        let length = (dx * dx + dy * dy).sqrt();
        let center_x = (start_x + end_x) / 2.0;
        let center_y = (start_y + end_y) / 2.0;
        let active_table_id = self.table_manager.get_active_table_id()
            .unwrap_or("default_table".to_string());
        // Store actual endpoints in polygon_vertices for precise rendering
        let sprite = Sprite {
            id: sprite_id.clone(),
            world_x: (center_x - length / 2.0) as f64,
            world_y: center_y as f64,
            width: length as f64,
            height: 4.0,
            rotation: dy.atan2(dx) as f64,
            scale_x: 1.0,
            scale_y: 1.0,
            layer: layer_name.to_string(),
            texture_id: String::new(),
            tint_color: {
                let c = Self::hex_to_rgba(color, opacity);
                [c[0] as f32 / 255.0, c[1] as f32 / 255.0, c[2] as f32 / 255.0, c[3] as f32 / 255.0]
            },
            table_id: active_table_id,
            obstacle_type: Some("line".to_string()),
            polygon_vertices: Some(vec![[start_x, start_y], [end_x, end_y]]),
            shape_filled: Some(false),
            ..Default::default()
        };
        let sprite_data = serde_wasm_bindgen::to_value(&sprite).unwrap();
        let _ = self.layer_manager.add_sprite_to_layer(layer_name, &sprite_data);
        if layer_name == "obstacles" { self.obstacles_dirty = true; }
        sprite_id
    }
}
