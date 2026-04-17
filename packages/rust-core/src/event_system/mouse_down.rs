use crate::math::Vec2;
use crate::types::Layer;
use crate::input::{InputHandler, InputMode, HandleDetector};
use crate::sprite_manager::SpriteManager;
use crate::lighting::LightingSystem;
use crate::wall_manager::WallManager;
use std::collections::HashMap;
use wasm_bindgen::JsValue;

use super::{EventSystem, MouseEventResult};

impl EventSystem {
    pub fn handle_mouse_down(
        &mut self,
        world_pos: Vec2,
        input: &mut InputHandler,
        layers: &mut HashMap<String, Layer>,
        lighting: &mut LightingSystem,
        wall_manager: &WallManager,
        camera_zoom: f64,
        ctrl_pressed: bool,
        active_layer: &str
    ) -> MouseEventResult {
        web_sys::console::log_1(&format!("[RUST EVENT] Mouse down at world: {}, {}, input_mode: {:?}", world_pos.x, world_pos.y, input.input_mode).into());
        
        // Handle fog drawing modes FIRST
        if matches!(input.input_mode, InputMode::FogDraw | InputMode::FogErase) {
            input.start_fog_draw(world_pos, input.fog_mode);
            web_sys::console::log_1(&format!("[RUST EVENT] Started fog drawing at: {}, {} mode: {:?}", world_pos.x, world_pos.y, input.fog_mode).into());
            return MouseEventResult::Handled;
        }
        
        // Handle tool-specific input modes
        match input.input_mode {
            InputMode::Measurement => {
                input.start_measurement(world_pos);
                web_sys::console::log_1(&format!("[RUST EVENT] Started measurement at: {}, {}", world_pos.x, world_pos.y).into());
                return MouseEventResult::Handled;
            }
            InputMode::CreateRectangle => {
                input.start_shape_creation(world_pos);
                web_sys::console::log_1(&format!("[RUST EVENT] Started rectangle creation at: {}, {}", world_pos.x, world_pos.y).into());
                return MouseEventResult::Handled;
            }
            InputMode::CreateCircle => {
                input.start_shape_creation(world_pos);
                web_sys::console::log_1(&format!("[RUST EVENT] Started circle creation at: {}, {}", world_pos.x, world_pos.y).into());
                return MouseEventResult::Handled;
            }
            InputMode::CreateLine => {
                input.start_shape_creation(world_pos);
                web_sys::console::log_1(&format!("[RUST EVENT] Started line creation at: {}, {}", world_pos.x, world_pos.y).into());
                return MouseEventResult::Handled;
            }
            InputMode::CreateText => {
                input.start_shape_creation(world_pos);
                web_sys::console::log_1(&format!("[RUST EVENT] Started text creation at: {}, {}", world_pos.x, world_pos.y).into());
                return MouseEventResult::Handled;
            }
            InputMode::Paint => {
                web_sys::console::log_1(&"[RUST EVENT] Paint mode handled in render.rs".into());
                return MouseEventResult::Handled;
            }
            InputMode::DrawWall => {
                if let Some((start, end)) = input.register_wall_click(world_pos) {
                    let min_len = 5.0_f32;
                    let len = ((end.x - start.x).powi(2) + (end.y - start.y).powi(2)).sqrt();
                    if len >= min_len {
                        if let Some(window) = web_sys::window() {
                            let detail = js_sys::Object::new();
                            js_sys::Reflect::set(&detail, &"x1".into(), &JsValue::from_f64(start.x as f64)).ok();
                            js_sys::Reflect::set(&detail, &"y1".into(), &JsValue::from_f64(start.y as f64)).ok();
                            js_sys::Reflect::set(&detail, &"x2".into(), &JsValue::from_f64(end.x as f64)).ok();
                            js_sys::Reflect::set(&detail, &"y2".into(), &JsValue::from_f64(end.y as f64)).ok();
                            let init = web_sys::CustomEventInit::new();
                            init.set_detail(&detail);
                            if let Ok(evt) = web_sys::CustomEvent::new_with_event_init_dict("wallDrawn", &init) {
                                window.dispatch_event(&evt).ok();
                            }
                        }
                    }
                }
                return MouseEventResult::Handled;
            }
            InputMode::CreatePolygon => {
                let should_close = input.add_polygon_vertex(world_pos);
                if should_close {
                    if let Some(verts) = input.close_polygon() {
                        if let Some(window) = web_sys::window() {
                            let arr = js_sys::Array::new();
                            for v in &verts {
                                let pt = js_sys::Object::new();
                                js_sys::Reflect::set(&pt, &"x".into(), &JsValue::from_f64(v.x as f64)).ok();
                                js_sys::Reflect::set(&pt, &"y".into(), &JsValue::from_f64(v.y as f64)).ok();
                                arr.push(&pt);
                            }
                            let detail = js_sys::Object::new();
                            js_sys::Reflect::set(&detail, &"vertices".into(), &arr).ok();
                            let init = web_sys::CustomEventInit::new();
                            init.set_detail(&detail);
                            if let Ok(evt) = web_sys::CustomEvent::new_with_event_init_dict("polygonCreated", &init) {
                                window.dispatch_event(&evt).ok();
                            }
                        }
                    }
                }
                return MouseEventResult::Handled;
            }
            _ => {}
        }
        
        // Check for light drag mode
        if input.input_mode == InputMode::LightDrag || active_layer == "light" {
            let tolerance = (30.0_f32 / camera_zoom as f32).max(15.0);
            web_sys::console::log_1(&format!(
                "[RUST LIGHT] active_layer='{}', light_count={}, pos=({:.1},{:.1}), tol={:.1}",
                active_layer, lighting.get_light_count(), world_pos.x, world_pos.y, tolerance
            ).into());
            if let Some(light_id) = lighting.get_light_at_position(world_pos, tolerance) {
                if let Some(light_pos) = lighting.get_light_position(&light_id) {
                    web_sys::console::log_1(&format!("[RUST LIGHT] Found light '{}' at ({:.1},{:.1})", light_id, light_pos.x, light_pos.y).into());
                    input.start_light_drag(light_id.to_string(), world_pos, light_pos);
                    return MouseEventResult::Handled;
                }
            } else {
                web_sys::console::log_1(&"[RUST LIGHT] No light found at click position".into());
            }
        }

        // Auto wall-drag when active layer is "obstacles"
        if active_layer == "obstacles" && !ctrl_pressed {
            if let Some(wall_id) = wall_manager.find_wall_at(world_pos.x, world_pos.y, 15.0) {
                input.input_mode = InputMode::WallDrag;
                input.dragged_wall_id = Some(wall_id);
                input.wall_drag_last = world_pos;
                return MouseEventResult::Handled;
            }
        }
        
        // Handle sprite interactions
        if !ctrl_pressed {
            // Check resize handles across all sprites
            let mut sorted_layers: Vec<_> = layers.iter().collect();
            sorted_layers.sort_by_key(|(_, layer)| std::cmp::Reverse(layer.z_order()));
            for (layer_name, layer) in sorted_layers.iter() {
                if !layer.selectable { continue; }
                if layer_name.as_str() != active_layer { continue; }
                for sprite in layer.sprites.iter().rev() {
                    if let Some(handle) = HandleDetector::get_resize_handle_for_non_rotated_sprite(sprite, world_pos, camera_zoom) {
                        if !input.is_sprite_selected(&sprite.id) {
                            input.set_single_selection(sprite.id.clone());
                        }
                        input.input_mode = InputMode::SpriteResize(handle);
                        input.selected_sprite_id = Some(sprite.id.clone());
                        let sprite_top_left = Vec2::new(sprite.world_x as f32, sprite.world_y as f32);
                        input.drag_offset = world_pos - sprite_top_left;
                        return MouseEventResult::Handled;
                    }
                    
                    let rot_handle_pos = SpriteManager::get_rotation_handle_position(sprite, camera_zoom);
                    let handle_size = 16.0 / camera_zoom as f32;
                    if HandleDetector::point_in_handle(world_pos, rot_handle_pos.x, rot_handle_pos.y, handle_size) {
                        if !input.is_sprite_selected(&sprite.id) {
                            input.set_single_selection(sprite.id.clone());
                        }
                        input.input_mode = InputMode::SpriteRotate;
                        let center = Vec2::new(sprite.world_x as f32 + (sprite.width * sprite.scale_x) as f32 / 2.0, sprite.world_y as f32 + (sprite.height * sprite.scale_y) as f32 / 2.0);
                        input.rotation_start_angle = (world_pos - center).angle() as f64;
                        input.sprite_initial_rotation = sprite.rotation;
                        input.selected_sprite_id = Some(sprite.id.clone());
                        return MouseEventResult::Handled;
                    }
                }
            }
            
            // Check for regular sprite selection
            let clicked_sprite = Self::find_sprite_at_position(world_pos, layers, active_layer);
            if let Some(sprite_id) = clicked_sprite {
                if input.is_sprite_selected(&sprite_id) && input.has_multiple_selected() {
                    input.selected_sprite_id = Some(sprite_id.clone());
                    input.input_mode = InputMode::SpriteMove;
                    if let Some((sprite, _)) = Self::find_sprite(&sprite_id, layers) {
                        let sprite_top_left = Vec2::new(sprite.world_x as f32, sprite.world_y as f32);
                        input.drag_offset = world_pos - sprite_top_left;
                    }
                    return MouseEventResult::Handled;
                }
                
                input.set_single_selection(sprite_id.clone());
                input.input_mode = InputMode::SpriteMove;
                if let Some((sprite, _)) = Self::find_sprite(&sprite_id, layers) {
                    let sprite_top_left = Vec2::new(sprite.world_x as f32, sprite.world_y as f32);
                    input.drag_offset = world_pos - sprite_top_left;
                }
                return MouseEventResult::Handled;
            }
        }
        
        // Handle Ctrl+click sprite selection
        if ctrl_pressed {
            let clicked_sprite = Self::find_sprite_at_position(world_pos, layers, active_layer);
            if let Some(sprite_id) = clicked_sprite {
                if input.is_sprite_selected(&sprite_id) {
                    input.remove_from_selection(&sprite_id);
                } else {
                    input.add_to_selection(sprite_id);
                }
                return MouseEventResult::Handled;
            } else {
                input.start_area_selection(world_pos);
                return MouseEventResult::Handled;
            }
        } else {
            input.clear_selection();
            input.input_mode = InputMode::CameraPan;
            return MouseEventResult::Handled;
        }
    }
}
