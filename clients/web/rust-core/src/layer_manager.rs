use std::collections::HashMap;
use wasm_bindgen::prelude::*;
use gloo_utils::format::JsValueSerdeExt;
use crate::types::{Sprite, Layer, LayerSettings, BlendMode};
use crate::math::Vec2;

pub const LAYER_NAMES: &[&str] = &["map", "tokens", "dungeon_master", "light", "height", "obstacles", "fog_of_war"];

pub struct LayerManager {
    layers: HashMap<String, Layer>,
}

impl LayerManager {
    pub fn new() -> Self {
        let mut layers = HashMap::new();
        for (i, &name) in LAYER_NAMES.iter().enumerate() {
            let mut settings = LayerSettings::default();
            settings.z_order = i as i32;
            
            // Configure default blend modes for specific layers
            match name {
                "light" => settings.blend_mode = BlendMode::Additive,
                "fog_of_war" => settings.blend_mode = BlendMode::Multiply,
                _ => settings.blend_mode = BlendMode::Alpha,
            }
            
            layers.insert(name.to_string(), Layer::new_with_settings(settings));
        }
        
        Self { layers }
    }
    
    pub fn get_layers(&self) -> &HashMap<String, Layer> {
        &self.layers
    }
    
    pub fn get_layers_mut(&mut self) -> &mut HashMap<String, Layer> {
        &mut self.layers
    }
    
    pub fn get_layer(&self, layer_name: &str) -> Option<&Layer> {
        self.layers.get(layer_name)
    }
    
    pub fn get_layer_mut(&mut self, layer_name: &str) -> Option<&mut Layer> {
        self.layers.get_mut(layer_name)
    }
    
    // Layer settings management methods
    pub fn set_layer_opacity(&mut self, layer_name: &str, opacity: f32) -> bool {
        if let Some(layer) = self.layers.get_mut(layer_name) {
            layer.set_opacity(opacity);
            true
        } else {
            false
        }
    }
    
    pub fn set_layer_visibility(&mut self, layer_name: &str, visible: bool) -> bool {
        if let Some(layer) = self.layers.get_mut(layer_name) {
            layer.set_visibility(visible);
            true
        } else {
            false
        }
    }
    
    pub fn set_layer_blend_mode(&mut self, layer_name: &str, blend_mode: BlendMode) -> bool {
        if let Some(layer) = self.layers.get_mut(layer_name) {
            layer.set_blend_mode(blend_mode);
            true
        } else {
            false
        }
    }
    
    pub fn set_layer_color(&mut self, layer_name: &str, r: f32, g: f32, b: f32) -> bool {
        if let Some(layer) = self.layers.get_mut(layer_name) {
            layer.set_color(r, g, b);
            true
        } else {
            false
        }
    }
    
    pub fn set_layer_z_order(&mut self, layer_name: &str, z_order: i32) -> bool {
        if let Some(layer) = self.layers.get_mut(layer_name) {
            layer.settings.z_order = z_order;
            true
        } else {
            false
        }
    }
    
    pub fn configure_layer(&mut self, layer_name: &str, settings: LayerSettings) -> bool {
        if let Some(layer) = self.layers.get_mut(layer_name) {
            layer.settings = settings;
            true
        } else {
            false
        }
    }
    
    pub fn get_layer_settings(&self, layer_name: &str) -> Option<&LayerSettings> {
        self.layers.get(layer_name).map(|layer| &layer.settings)
    }
    
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
    
    pub fn remove_sprite(&mut self, sprite_id: &str) -> bool {
        for layer in self.layers.values_mut() {
            if let Some(index) = layer.sprites.iter().position(|s| s.id == sprite_id) {
                layer.sprites.remove(index);
                return true;
            }
        }
        false
    }
    
    pub fn find_sprite(&self, sprite_id: &str) -> Option<(&Sprite, &str)> {
        for (layer_name, layer) in &self.layers {
            if let Some(sprite) = layer.sprites.iter().find(|s| s.id == sprite_id) {
                return Some((sprite, layer_name));
            }
        }
        None
    }
    
    pub fn find_sprite_mut(&mut self, sprite_id: &str) -> Option<&mut Sprite> {
        for layer in self.layers.values_mut() {
            if let Some(sprite) = layer.sprites.iter_mut().find(|s| s.id == sprite_id) {
                return Some(sprite);
            }
        }
        None
    }
    
    pub fn rotate_sprite(&mut self, sprite_id: &str, rotation_degrees: f64) -> bool {
        for layer in self.layers.values_mut() {
            if let Some(sprite) = layer.sprites.iter_mut().find(|s| s.id == sprite_id) {
                sprite.rotation = rotation_degrees.to_radians();
                return true;
            }
        }
        false
    }
    
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
    
    pub fn find_sprite_at_position(&self, world_pos: Vec2) -> Option<String> {
        // Search in reverse z-order (top layers first)
        let mut sorted_layers: Vec<_> = self.layers.iter().collect();
        sorted_layers.sort_by_key(|(_, layer)| std::cmp::Reverse(layer.z_order()));
        
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
    
    pub fn select_sprites_in_area(&self, min: Vec2, max: Vec2) -> Vec<String> {
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
        
        selected_sprites
    }
    
    pub fn find_sprite_for_right_click(&self, world_pos: Vec2) -> Option<String> {
        // Search for sprite at position (reverse z-order for top-most)
        let mut sorted_layers: Vec<_> = self.layers.iter().collect();
        sorted_layers.sort_by_key(|(_, layer)| std::cmp::Reverse(layer.z_order()));
        
        for (_, layer) in sorted_layers {
            if layer.visible() {
                for sprite in layer.sprites.iter().rev() {
                    if sprite.contains_world_point(world_pos) {
                        return Some(sprite.id.clone());
                    }
                }
            }
        }
        
        None
    }
    
    pub fn copy_sprite(&self, sprite_id: &str) -> Option<String> {
        if let Some((sprite, _)) = self.find_sprite(sprite_id) {
            // Convert sprite to JSON for copying
            if let Ok(json) = serde_json::to_string(sprite) {
                return Some(json);
            }
        }
        None
    }

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

    /// Clear all sprites from all layers
    pub fn clear_all_layers(&mut self) {
        for layer in self.layers.values_mut() {
            layer.sprites.clear();
        }
    }

    /// Update sprite position by ID across all layers
    pub fn update_sprite_position(&mut self, sprite_id: &str, new_position: Vec2) -> bool {
        for layer in self.layers.values_mut() {
            if let Some(sprite) = layer.sprites.iter_mut().find(|s| s.id == sprite_id) {
                sprite.world_x = new_position.x as f64;
                sprite.world_y = new_position.y as f64;
                return true;
            }
        }
        false
    }

    /// Update sprite scale by ID across all layers
    pub fn update_sprite_scale(&mut self, sprite_id: &str, new_scale: Vec2) -> bool {
        for layer in self.layers.values_mut() {
            if let Some(sprite) = layer.sprites.iter_mut().find(|s| s.id == sprite_id) {
                sprite.scale_x = new_scale.x as f64;
                sprite.scale_y = new_scale.y as f64;
                return true;
            }
        }
        false
    }
}
