use crate::math::Vec2;
use crate::types::Layer;
use crate::input::{InputHandler, InputMode, FogDrawMode};
use crate::lighting::LightingSystem;
use crate::fog::{FogOfWarSystem, FogMode};
use crate::wall_manager::WallManager;
use crate::unit_converter::UnitConverter;
use std::collections::HashMap;
use wasm_bindgen::JsValue;

use super::{EventSystem, MouseEventResult};

impl EventSystem {
    pub fn handle_mouse_up(
        &mut self,
        world_pos: Vec2,
        input: &mut InputHandler,
        layers: &mut HashMap<String, Layer>,
        lighting: &mut LightingSystem,
        wall_manager: &WallManager,
        fog: &mut FogOfWarSystem,
        table_id: String,
        active_layer: &str,
        converter: &UnitConverter,
        grid_cell_px: f32,
    ) -> MouseEventResult {
        match input.input_mode {
            InputMode::AreaSelect => {
                if let Some((min, max)) = input.get_area_selection_rect() {
                    Self::select_sprites_in_area(min, max, input, layers, active_layer);
                }
                input.finish_area_selection();
                MouseEventResult::Handled
            }
            InputMode::LightDrag => {
                let final_pos = Vec2::new(
                    world_pos.x + input.light_drag_offset.x,
                    world_pos.y + input.light_drag_offset.y,
                );
                if let Some(light_id) = &input.selected_light_id {
                    lighting.update_light_position(light_id, final_pos);
                    Self::dispatch_light_moved(light_id, final_pos.x, final_pos.y);
                }
                input.end_light_drag();
                MouseEventResult::Handled
            }
            InputMode::WallDrag => {
                if let Some(wall_id) = input.dragged_wall_id.take() {
                    if let Some((x1, y1, x2, y2)) = wall_manager.get_wall_endpoints(&wall_id) {
                        Self::dispatch_wall_moved(&wall_id, x1, y1, x2, y2);
                    }
                }
                input.input_mode = InputMode::None;
                MouseEventResult::Handled
            }
            InputMode::WallEndpointDrag => {
                if let Some(wall_id) = input.dragged_wall_id.take() {
                    if let Some((x1, y1, x2, y2)) = wall_manager.get_wall_endpoints(&wall_id) {
                        Self::dispatch_wall_moved(&wall_id, x1, y1, x2, y2);
                    }
                }
                input.input_mode = InputMode::None;
                MouseEventResult::Handled
            }
            InputMode::FogDraw | InputMode::FogErase => {
                if let Some((start, end, mode)) = input.end_fog_draw() {
                    let fog_mode = match mode {
                        FogDrawMode::Reveal => FogMode::Reveal,
                        FogDrawMode::Hide => FogMode::Hide,
                    };
                    
                    let id = format!("fog_rect_{}", js_sys::Date::now() as u64);
                    let mode_str = match fog_mode {
                        FogMode::Reveal => "reveal",
                        FogMode::Hide => "hide",
                    };
                    
                    let min_size = 10.0;
                    if (end.x - start.x).abs() > min_size && (end.y - start.y).abs() > min_size {
                        fog.add_fog_rectangle(id, start.x, start.y, end.x, end.y, mode_str, table_id.clone());
                    }
                }
                input.input_mode = InputMode::None;
                MouseEventResult::Handled
            }
            InputMode::CameraPan => {
                input.input_mode = InputMode::None;
                MouseEventResult::Handled
            }
            InputMode::SpriteMove | InputMode::SpriteResize(_) | InputMode::SpriteRotate => {
                let sprite_id_opt = input.selected_sprite_id.clone();
                let current_input_mode = input.input_mode;
                let snap = !input.alt_pressed && grid_cell_px > 0.0;
                // Collect other selected sprites before mutably borrowing layers
                let other_selected: Vec<String> = input.selected_sprite_ids.iter()
                    .filter(|id| Some(*id) != sprite_id_opt.as_ref())
                    .cloned()
                    .collect();
                
                web_sys::console::log_1(&format!("[RUST EVENT] Mouse up in mode: {:?}, sprite: {:?}", current_input_mode, sprite_id_opt).into());
                
                if matches!(current_input_mode, InputMode::SpriteMove) {
                    if let Some(ref sprite_id_str) = sprite_id_opt {
                        let current_time = js_sys::Date::now();
                        if input.check_double_click(sprite_id_str, current_time) {
                            web_sys::console::log_1(&format!("[RUST EVENT] [OK] Double-click detected on sprite: {}", sprite_id_str).into());
                            
                            if let Some(window) = web_sys::window() {
                                let detail = js_sys::Object::new();
                                js_sys::Reflect::set(&detail, &"spriteId".into(), &JsValue::from_str(sprite_id_str)).ok();
                                
                                let event_init = web_sys::CustomEventInit::new();
                                event_init.set_detail(&detail);
                                
                                if let Ok(event) = web_sys::CustomEvent::new_with_event_init_dict("tokenDoubleClick", &event_init) {
                                    window.dispatch_event(&event).ok();
                                }
                            }
                        }
                    }
                }

                // Grid snap on move and resize (skip if alt held)
                if snap {
                    let cell = grid_cell_px as f64;
                    if let Some(ref sprite_id) = sprite_id_opt {
                        if let Some((sprite, _)) = Self::find_sprite_mut(sprite_id, layers) {
                            match current_input_mode {
                                InputMode::SpriteMove => {
                                    sprite.world_x = (sprite.world_x / cell).round() * cell;
                                    sprite.world_y = (sprite.world_y / cell).round() * cell;
                                    Self::dispatch_drag_preview(sprite_id, sprite.world_x, sprite.world_y);
                                }
                                InputMode::SpriteResize(_) => {
                                    let snapped_x = (sprite.world_x / cell).round() * cell;
                                    let snapped_y = (sprite.world_y / cell).round() * cell;
                                    let right = sprite.world_x + sprite.width * sprite.scale_x;
                                    let bottom = sprite.world_y + sprite.height * sprite.scale_y;
                                    let snapped_right = (right / cell).round() * cell;
                                    let snapped_bottom = (bottom / cell).round() * cell;
                                    let new_w = (snapped_right - snapped_x).max(cell);
                                    let new_h = (snapped_bottom - snapped_y).max(cell);
                                    sprite.world_x = snapped_x;
                                    sprite.world_y = snapped_y;
                                    sprite.width = new_w / sprite.scale_x;
                                    sprite.height = new_h / sprite.scale_y;
                                }
                                InputMode::SpriteRotate => {
                                    let quarter_pi = std::f64::consts::FRAC_PI_4; // snap to 45°
                                    sprite.rotation = (sprite.rotation / quarter_pi).round() * quarter_pi;
                                }
                                _ => {}
                            }
                        }
                    }
                }
                
                if let Some(sprite_id) = &sprite_id_opt {
                    self.notify_operation_complete(current_input_mode, sprite_id, layers);
                }

                // Snap and notify all other selected sprites (SpriteMove only)
                if matches!(current_input_mode, InputMode::SpriteMove) {
                    if snap {
                        let cell = grid_cell_px as f64;
                        for other_id in &other_selected {
                            if let Some((sprite, _)) = Self::find_sprite_mut(other_id, layers) {
                                sprite.world_x = (sprite.world_x / cell).round() * cell;
                                sprite.world_y = (sprite.world_y / cell).round() * cell;
                                Self::dispatch_drag_preview(other_id, sprite.world_x, sprite.world_y);
                            }
                        }
                    }
                    for other_id in &other_selected {
                        self.notify_operation_complete(current_input_mode, other_id, layers);
                    }
                }

                input.input_mode = InputMode::None;
                Self::dispatch_cursor_hint("pointer"); // back to hover cursor after drag
                MouseEventResult::Handled
            }
            InputMode::Measurement => {
                if let Some((start, end)) = input.end_measurement() {
                    let dx = end.x - start.x;
                    let dy = end.y - start.y;
                    let distance = (dx * dx + dy * dy).sqrt();
                    let angle = dy.atan2(dx) * 180.0 / std::f32::consts::PI;
                    
                    let game_dist = converter.to_units(distance);
                    let feet = converter.to_feet(game_dist);
                    let meters = converter.to_meters(game_dist);
                    
                    web_sys::console::log_1(&format!("[RUST EVENT] Measurement complete: {:.2} px ({:.1} {}) from ({:.1}, {:.1}) to ({:.1}, {:.1})", distance, game_dist, converter.unit().label(), start.x, start.y, end.x, end.y).into());
                    
                    if let Some(window) = web_sys::window() {
                        let detail = js_sys::Object::new();
                        js_sys::Reflect::set(&detail, &"distance".into(), &JsValue::from_f64(distance as f64)).ok();
                        js_sys::Reflect::set(&detail, &"gameUnits".into(), &JsValue::from_f64(game_dist as f64)).ok();
                        js_sys::Reflect::set(&detail, &"gridUnits".into(), &JsValue::from_f64(game_dist as f64)).ok();
                        js_sys::Reflect::set(&detail, &"feet".into(), &JsValue::from_f64(feet as f64)).ok();
                        js_sys::Reflect::set(&detail, &"meters".into(), &JsValue::from_f64(meters as f64)).ok();
                        js_sys::Reflect::set(&detail, &"angle".into(), &JsValue::from_f64(angle as f64)).ok();
                        js_sys::Reflect::set(&detail, &"startX".into(), &JsValue::from_f64(start.x as f64)).ok();
                        js_sys::Reflect::set(&detail, &"startY".into(), &JsValue::from_f64(start.y as f64)).ok();
                        js_sys::Reflect::set(&detail, &"endX".into(), &JsValue::from_f64(end.x as f64)).ok();
                        js_sys::Reflect::set(&detail, &"endY".into(), &JsValue::from_f64(end.y as f64)).ok();
                        
                        let event_init = web_sys::CustomEventInit::new();
                        event_init.set_detail(&detail);
                        
                        if let Ok(event) = web_sys::CustomEvent::new_with_event_init_dict("measurementComplete", &event_init) {
                            window.dispatch_event(&event).ok();
                        }
                    }
                }
                MouseEventResult::Handled
            }
            InputMode::CreateRectangle => {
                if let Some((start, end)) = input.end_shape_creation() {
                    let min_x = start.x.min(end.x);
                    let min_y = start.y.min(end.y);
                    let width = (end.x - start.x).abs();
                    let height = (end.y - start.y).abs();
                    
                    if width > 10.0 && height > 10.0 {
                        return MouseEventResult::CreateSprite(format!("rectangle:{}:{}:{}:{}", min_x, min_y, width, height));
                    }
                }
                MouseEventResult::Handled
            }
            InputMode::CreateCircle => {
                if let Some((start, end)) = input.end_shape_creation() {
                    let radius = ((end.x - start.x).powi(2) + (end.y - start.y).powi(2)).sqrt();
                    
                    if radius > 5.0 {
                        return MouseEventResult::CreateSprite(format!("circle:{}:{}:{}", start.x, start.y, radius));
                    }
                }
                MouseEventResult::Handled
            }
            InputMode::CreateLine => {
                if let Some((start, end)) = input.end_shape_creation() {
                    let length = ((end.x - start.x).powi(2) + (end.y - start.y).powi(2)).sqrt();
                    
                    if length > 5.0 {
                        return MouseEventResult::CreateSprite(format!("line:{}:{}:{}:{}", start.x, start.y, end.x, end.y));
                    }
                }
                MouseEventResult::Handled
            }
            InputMode::CreateText => {
                if let Some((start, _end)) = input.end_shape_creation() {
                    if let Some(window) = web_sys::window() {
                        let detail = js_sys::Object::new();
                        js_sys::Reflect::set(&detail, &"x".into(), &JsValue::from_f64(start.x as f64)).ok();
                        js_sys::Reflect::set(&detail, &"y".into(), &JsValue::from_f64(start.y as f64)).ok();
                        
                        let event_init = web_sys::CustomEventInit::new();
                        event_init.set_detail(&detail);
                        
                        if let Ok(event) = web_sys::CustomEvent::new_with_event_init_dict("textSpriteClick", &event_init) {
                            window.dispatch_event(&event).ok();
                        }
                    }
                }
                MouseEventResult::Handled
            }
            InputMode::DrawWall | InputMode::CreatePolygon => {
                MouseEventResult::Handled
            }
            _ => {
                input.input_mode = InputMode::None;
                MouseEventResult::Handled
            }
        }
    }

    fn notify_operation_complete(
        &self,
        operation_mode: InputMode,
        sprite_id: &str,
        layers: &HashMap<String, Layer>
    ) {
        let Some((sprite, _)) = Self::find_sprite(sprite_id, layers) else { return };
        let Some(window) = web_sys::window() else { return };

        let data = js_sys::Object::new();
        let operation = match operation_mode {
            InputMode::SpriteMove => {
                js_sys::Reflect::set(&data, &"x".into(), &JsValue::from_f64(sprite.world_x)).ok();
                js_sys::Reflect::set(&data, &"y".into(), &JsValue::from_f64(sprite.world_y)).ok();
                "move"
            }
            InputMode::SpriteResize(_) => {
                js_sys::Reflect::set(&data, &"width".into(), &JsValue::from_f64(sprite.width * sprite.scale_x)).ok();
                js_sys::Reflect::set(&data, &"height".into(), &JsValue::from_f64(sprite.height * sprite.scale_y)).ok();
                "resize"
            }
            InputMode::SpriteRotate => {
                js_sys::Reflect::set(&data, &"rotation".into(), &JsValue::from_f64(sprite.rotation.to_degrees())).ok();
                "rotate"
            }
            _ => return,
        };

        let detail = js_sys::Object::new();
        js_sys::Reflect::set(&detail, &"spriteId".into(), &JsValue::from_str(sprite_id)).ok();
        js_sys::Reflect::set(&detail, &"operation".into(), &JsValue::from_str(operation)).ok();
        js_sys::Reflect::set(&detail, &"data".into(), &data).ok();

        let event_init = web_sys::CustomEventInit::new();
        event_init.set_detail(&detail);
        if let Ok(event) = web_sys::CustomEvent::new_with_event_init_dict("wasm-sprite-operation", &event_init) {
            window.dispatch_event(&event).ok();
        }
    }
}
