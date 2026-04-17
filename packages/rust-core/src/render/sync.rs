use wasm_bindgen::prelude::*;
use crate::types::*;
use crate::math::*;

use super::{RenderEngine, parse_hex_color};

#[wasm_bindgen]
impl RenderEngine {
    /// Handle table data received from server
    #[wasm_bindgen]
    pub fn handle_table_data(&mut self, table_data_js: &JsValue) -> Result<(), JsValue> {
        self.table_sync.handle_table_data(table_data_js)?;
        
        let table_data = self.table_sync.get_table_data();
        if table_data.is_null() {
            return Err(JsValue::from_str("Failed to get table data"));
        }

        let table: crate::table_sync::TableData = serde_wasm_bindgen::from_value(table_data)
            .map_err(|e| JsValue::from_str(&format!("Failed to parse table data for rendering: {}", e)))?;

        if let Some(table_id) = self.table_sync.get_table_id() {
            web_sys::console::log_1(&format!("[RUST] handle_table_data: Setting active table to '{}'", table_id).into());
            
            let old_table_id = self.table_manager.get_active_table_id();
            let is_switching_tables = old_table_id.as_ref().map_or(false, |old_id| old_id != &table_id);
            
            if is_switching_tables {
                if let Some(old_id) = old_table_id {
                    web_sys::console::log_1(&format!("[TABLE-SWITCH] 🔄 Switching from table '{}' to '{}'", old_id, table_id).into());
                    
                    let sprites_removed = self.layer_manager.clear_sprites_for_table(&old_id);
                    let lights_removed = self.lighting.clear_lights_for_table(&old_id);
                    let fog_removed = self.fog.clear_fog_for_table(&old_id);
                    
                    web_sys::console::log_1(&format!(
                        "[TABLE-SWITCH] 🗑️ Cleaned up old table '{}': {} sprites, {} lights, {} fog",
                        old_id, sprites_removed, lights_removed, fog_removed
                    ).into());
                }
            }
            
            self.table_manager.create_table(&table_id, &table.table_name, table.width, table.height)?;
            self.table_manager.set_active_table(&table_id);
            self.table_manager.set_table_units(
                &table_id,
                table.grid_cell_px,
                table.cell_distance,
                &table.distance_unit,
            );
            self.grid_system.sync_from_table(table.grid_cell_px as f32);
            
            let active = self.table_manager.get_active_table_id();
            web_sys::console::log_1(&format!("[RUST] handle_table_data: Active table is now: {:?}", active).into());
            
            if let Some((tx, ty, tw, th)) = self.table_manager.get_active_table_world_bounds() {
                self.camera.set_table_bounds(tx, ty, tw, th);
                web_sys::console::log_1(&format!("[TABLE-SWITCH] 🎯 Updated camera bounds: {}x{}", tw, th).into());
                
                self.fog.set_table_bounds(tx as f32, ty as f32, tw as f32, th as f32);
                web_sys::console::log_1(&format!("[TABLE-SWITCH] 🌫️ Updated fog bounds: {}x{}", tw, th).into());
                
                self.camera.center_on(tx, ty);
                web_sys::console::log_1(&format!("[TABLE-SWITCH] 📷 Camera positioned at table origin ({}, {})", tx, ty).into());
                
                self.update_view_matrix();
                web_sys::console::log_1(&"[TABLE-SWITCH] ✅ View matrix updated".into());
            }
        }

        self.layer_manager.clear_all_layers();

        let table_id = table.table_id.clone();
        for (_layer_name, sprites) in &table.layers {
            for sprite_data in sprites {
                self.add_sprite_from_table_data(sprite_data, &table_id)?;
            }
        }

        web_sys::console::log_1(&format!("Successfully synced table '{}' with {} layers", 
            table.table_name, table.layers.len()).into());

        Ok(())
    }

    fn add_sprite_from_table_data(&mut self, sprite_data: &crate::table_sync::SpriteData, table_id: &str) -> Result<(), JsValue> {
        let character_id = sprite_data.character_id.clone();
        let controlled_by = sprite_data.controlled_by.clone().unwrap_or_default();
        let aura_radius = if let Some(units) = sprite_data.aura_radius_units {
            let conv = self.table_manager.get_unit_converter(table_id);
            Some(conv.to_pixels(units as f32) as f64)
        } else {
            sprite_data.aura_radius
        };
        let aura_color = sprite_data.aura_color.clone();

        let sprite = Sprite {
            id: sprite_data.sprite_id.clone(),
            world_x: sprite_data.coord_x,
            world_y: sprite_data.coord_y,
            width: 50.0,
            height: 50.0,
            scale_x: sprite_data.scale_x,
            scale_y: sprite_data.scale_y,
            rotation: sprite_data.rotation.unwrap_or(0.0),
            layer: sprite_data.layer.clone(),
            texture_id: sprite_data.texture_path.clone(),
            tint_color: [1.0, 1.0, 1.0, 1.0],
            table_id: table_id.to_string(),
            character_id,
            controlled_by,
            hp: sprite_data.hp,
            max_hp: sprite_data.max_hp,
            ac: sprite_data.ac,
            aura_radius,
            aura_color: aura_color.clone(),
            is_text_sprite: None,
            text_content: None,
            text_size: None,
            text_color: None,
            obstacle_type: None,
            polygon_vertices: None,
        };

        let sprite_js = serde_wasm_bindgen::to_value(&sprite)?;
        self.layer_manager.add_sprite_to_layer(&sprite_data.layer, &sprite_js)?;

        if let Some(radius) = aura_radius {
            let cx = (sprite_data.coord_x + 25.0) as f32;
            let cy = (sprite_data.coord_y + 25.0) as f32;
            let light_id = format!("token_light_{}", sprite_data.sprite_id);
            let active_table = self.table_manager.get_active_table_id().unwrap_or_else(|| table_id.to_string());
            let mut light = crate::lighting::Light::new(light_id, cx, cy);
            light.table_id = active_table;
            light.set_radius(radius as f32);
            if let Some(hex) = aura_color {
                if let Some(color) = parse_hex_color(&hex) {
                    light.set_color(color);
                }
            }
            self.lighting.add_light(light);
        }

        if !sprite_data.texture_path.is_empty() {
            self.request_asset_if_needed(&sprite_data.texture_path);
        }

        Ok(())
    }

    fn request_asset_if_needed(&self, texture_path: &str) {
        if !self.texture_manager.has_texture(texture_path) {
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

    pub fn send_sprite_move(&mut self, sprite_id: &str, x: f64, y: f64) -> Result<String, JsValue> {
        self.table_sync.send_sprite_move(sprite_id, x, y)
    }

    pub fn send_sprite_create(&self, sprite_data_js: &JsValue) -> Result<(), JsValue> {
        self.table_sync.send_sprite_create(sprite_data_js)
    }

    pub fn request_table(&self, table_name: &str) -> Result<(), JsValue> {
        self.table_sync.request_table(table_name)
    }
}
