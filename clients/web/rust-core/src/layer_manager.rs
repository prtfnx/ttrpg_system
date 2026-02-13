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

    /// Move sprite from one layer to another
    pub fn move_sprite_to_layer(&mut self, sprite_id: &str, target_layer: &str) -> bool {
        // Find and remove sprite from current layer
        let mut sprite_to_move: Option<Sprite> = None;
        
        for layer in self.layers.values_mut() {
            if let Some(index) = layer.sprites.iter().position(|s| s.id == sprite_id) {
                sprite_to_move = Some(layer.sprites.remove(index));
                break;
            }
        }
        
        // Add sprite to target layer
        if let Some(sprite) = sprite_to_move {
            if let Some(target) = self.layers.get_mut(target_layer) {
                target.sprites.push(sprite);
                return true;
            }
        }
        
        false
    }
    
    // ===== TABLE-BASED OPTIMIZATION METHODS =====
    
    /// Count sprites per table across all layers
    pub fn count_sprites_by_table(&self) -> HashMap<String, usize> {
        let mut counts = HashMap::new();
        for layer in self.layers.values() {
            for sprite in &layer.sprites {
                *counts.entry(sprite.table_id.clone()).or_insert(0) += 1;
            }
        }
        counts
    }
    
    /// Get total sprite count for active table only
    pub fn count_sprites_for_table(&self, table_id: &str) -> usize {
        let mut count = 0;
        for layer in self.layers.values() {
            count += layer.sprites.iter().filter(|s| s.table_id == table_id).count();
        }
        count
    }
    
    /// Remove all sprites not belonging to the specified table (optimization)
    /// This is useful when switching tables to free memory
    pub fn remove_sprites_not_in_table(&mut self, table_id: &str) -> usize {
        let mut removed_count = 0;
        for layer in self.layers.values_mut() {
            let before_count = layer.sprites.len();
            layer.sprites.retain(|sprite| sprite.table_id == table_id);
            removed_count += before_count - layer.sprites.len();
        }
        removed_count
    }
    
    /// Clear all sprites from a specific table
    pub fn clear_sprites_for_table(&mut self, table_id: &str) -> usize {
        let mut removed_count = 0;
        for layer in self.layers.values_mut() {
            let before_count = layer.sprites.len();
            layer.sprites.retain(|sprite| sprite.table_id != table_id);
            removed_count += before_count - layer.sprites.len();
        }
        removed_count
    }
    
    // ===== ENHANCED INPUT SUPPORT METHODS =====
    
    /// Get all sprites from all layers (for select all functionality)
    pub fn get_all_sprites(&self) -> Vec<&Sprite> {
        let mut all_sprites = Vec::new();
        for layer in self.layers.values() {
            for sprite in &layer.sprites {
                all_sprites.push(sprite);
            }
        }
        all_sprites
    }
    
    /// Get sprites within a rectangular area (for drag rectangle selection)
    pub fn get_sprites_in_rect(&self, x1: f32, y1: f32, x2: f32, y2: f32) -> Vec<&Sprite> {
        let min_x = x1.min(x2);
        let min_y = y1.min(y2);
        let max_x = x1.max(x2);
        let max_y = y1.max(y2);
        
        let mut sprites_in_rect = Vec::new();
        for layer in self.layers.values() {
            for sprite in &layer.sprites {
                // Check if sprite's bounding box intersects with selection rectangle
                let half_width = sprite.width * sprite.scale_x / 2.0;
                let half_height = sprite.height * sprite.scale_y / 2.0;
                
                let sprite_min_x = sprite.world_x - half_width;
                let sprite_min_y = sprite.world_y - half_height;
                let sprite_max_x = sprite.world_x + half_width;
                let sprite_max_y = sprite.world_y + half_height;
                
                if sprite_min_x <= max_x as f64 && sprite_max_x >= min_x as f64 &&
                   sprite_min_y <= max_y as f64 && sprite_max_y >= min_y as f64 {
                    sprites_in_rect.push(sprite);
                }
            }
        }
        sprites_in_rect
    }
}
