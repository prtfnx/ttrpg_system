use wasm_bindgen::prelude::*;
use crate::types::*;
use crate::math::*;
use crate::input::InputMode;

use super::RenderEngine;

#[wasm_bindgen]
impl RenderEngine {
    // Camera and viewport
    #[wasm_bindgen]
    pub fn resize_canvas(&mut self, width: f32, height: f32) {
        self.canvas_size = Vec2::new(width, height);
        self.update_view_matrix();
    }
    
    #[wasm_bindgen]
    pub fn resize(&mut self, width: f32, height: f32) {
        self.resize_canvas(width, height);
    }
    
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
    pub fn world_to_screen(&self, world_x: f32, world_y: f32) -> Vec<f64> {
        let screen = self.camera.world_to_screen(Vec2::new(world_x, world_y));
        vec![screen.x as f64, screen.y as f64]
    }
    
    #[wasm_bindgen]
    pub fn get_active_table_world_bounds(&self) -> Result<Vec<f64>, JsValue> {
        self.table_manager.get_active_table_world_bounds()
            .map(|(x, y, w, h)| vec![x, y, w, h])
            .ok_or_else(|| {
                web_sys::console::error_1(&"[TABLE-ERROR] [ERR] CRITICAL: No active table found!".into());
                JsValue::from_str("No active table found")
            })
    }
    
    #[wasm_bindgen]
    pub fn get_active_table_id(&self) -> Option<String> {
        self.table_manager.get_active_table_id()
    }

    // Grid settings
    #[wasm_bindgen]
    pub fn set_grid_enabled(&mut self, enabled: bool) {
        self.grid_system.set_enabled(enabled);
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

    // Lighting system methods
    #[wasm_bindgen]
    pub fn set_ambient_light(&mut self, level: f32) {
        self.fog.set_ambient_light(level);
    }

    #[wasm_bindgen]
    pub fn add_light(&mut self, id: &str, x: f32, y: f32) {
        web_sys::console::log_1(&format!("[RUST] add_light called: id={}, x={}, y={}", id, x, y).into());
        
        let active_table_opt = self.table_manager.get_active_table_id();
        web_sys::console::log_1(&format!("[RUST] get_active_table_id returned: {:?}", active_table_opt).into());
        
        let table_id = active_table_opt.unwrap_or("default_table".to_string());
        
        let mut light = crate::lighting::Light::new(id.to_string(), x, y);
        light.table_id = table_id.clone();
        
        self.lighting.add_light(light);
        web_sys::console::log_1(&format!("[RUST] Light added to table '{}'. Total lights: {}", 
            table_id, self.lighting.get_light_count()).into());
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

    pub fn get_light_at_position(&self, x: f32, y: f32) -> Option<String> {
        let world_pos = Vec2::new(x, y);
        self.lighting.get_light_at_position(world_pos, 30.0).cloned()
    }

    // Fog of war methods
    #[wasm_bindgen]
    pub fn set_gm_mode(&mut self, is_gm: bool) {
        self.is_gm = is_gm;
        self.fog.set_gm_mode(is_gm);
    }

    #[wasm_bindgen]
    pub fn set_active_layer(&mut self, layer_name: &str) {
        self.active_layer = layer_name.to_string();
    }

    #[wasm_bindgen]
    pub fn add_fog_rectangle(&mut self, id: &str, start_x: f32, start_y: f32, end_x: f32, end_y: f32, mode: &str) {
        let table_id = self.table_manager.get_active_table_id()
            .unwrap_or("default_table".to_string());
        
        self.fog.add_fog_rectangle(id.to_string(), start_x, start_y, end_x, end_y, mode, table_id.clone());
        #[cfg(debug_assertions)]
        web_sys::console::debug_1(&format!("[RUST-DEBUG] Fog rectangle added to table '{}'", table_id).into());
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
        let table_id = self.table_manager.get_active_table_id()
            .unwrap_or("default_table".to_string());
        
        self.fog.hide_entire_table(table_width, table_height, table_id);
    }

    pub fn is_point_in_fog(&self, x: f32, y: f32) -> bool {
        self.fog.is_point_in_fog(x, y)
    }

    pub fn is_in_fog_draw_mode(&self) -> bool {
        matches!(self.input.input_mode, InputMode::FogDraw | InputMode::FogErase)
    }

    pub fn is_in_light_drag_mode(&self) -> bool {
        self.input.input_mode == InputMode::LightDrag
    }

    // Wall management
    #[wasm_bindgen]
    pub fn add_wall(&mut self, wall_json: &str) -> bool {
        let ok = self.wall_manager.add_wall_from_json(wall_json);
        if ok { self.obstacles_dirty = true; }
        ok
    }

    #[wasm_bindgen]
    pub fn remove_wall(&mut self, wall_id: &str) -> bool {
        let removed = self.wall_manager.remove_wall(wall_id);
        if removed { self.obstacles_dirty = true; }
        removed
    }

    #[wasm_bindgen]
    pub fn update_wall(&mut self, wall_id: &str, updates_json: &str) -> bool {
        let ok = self.wall_manager.update_from_json(wall_id, updates_json);
        if ok { self.obstacles_dirty = true; }
        ok
    }

    #[wasm_bindgen]
    pub fn clear_walls(&mut self) {
        self.wall_manager.clear();
        self.obstacles_dirty = true;
    }

    #[wasm_bindgen]
    pub fn get_wall_render_data(&self) -> js_sys::Float32Array {
        let data = self.wall_manager.get_render_data();
        js_sys::Float32Array::from(data.as_slice())
    }

    #[wasm_bindgen]
    pub fn set_current_user_id(&mut self, user_id: i32) {
        self.current_user_id = Some(user_id);
    }

    // Input mode control
    pub fn set_input_mode_measurement(&mut self) {
        self.input.input_mode = InputMode::Measurement;
        web_sys::console::log_1(&"[RUST] Input mode set to Measurement".into());
    }
    #[wasm_bindgen]
    pub fn set_input_mode_paint(&mut self) {
        self.input.input_mode = InputMode::Paint;
        web_sys::console::log_1(&"[RUST] Input mode set to Paint".into());
    }

    // Actions system
    pub fn batch_actions(&mut self, actions: &JsValue) -> JsValue {
        self.actions.batch_actions(actions)
    }
    pub fn can_undo(&self) -> bool {
        self.actions.can_undo()
    }
    pub fn can_redo(&self) -> bool {
        self.actions.can_redo()
    }

    // Layer management
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

    pub fn clear_layer(&mut self, layer_name: &str) -> bool {
        if let Some(layer) = self.layer_manager.get_layer_mut(layer_name) {
            layer.sprites.clear();
            true
        } else {
            false
        }
    }

    pub fn set_layer_visible(&mut self, layer_name: &str, visible: bool) -> bool {
        self.layer_manager.set_layer_visibility(layer_name, visible)
    }

    // Paint system methods
    pub fn paint_set_current_table(&mut self, table_id: &str) {
        self.paint.set_current_table(table_id);
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
    pub fn paint_clear_all(&mut self) {
        self.paint.clear_all_strokes();
    }
    #[wasm_bindgen]
    pub fn paint_undo_stroke(&mut self) -> bool {
        self.paint.undo_last_stroke()
    }

    // Background color
    pub fn set_background_color(&mut self, hex: &str) {
        if let Some(color) = super::parse_hex_color(hex) {
            self.background_color = [color.r, color.g, color.b, 1.0];
        }
    }
}
