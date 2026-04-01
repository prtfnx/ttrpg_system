use crate::math::Vec2;
use crate::types::{Sprite, Layer};
use crate::input::{InputHandler, InputMode, HandleDetector, FogDrawMode};
use crate::sprite_manager::SpriteManager;
use crate::lighting::LightingSystem;
use crate::fog::{FogOfWarSystem, FogMode};
use crate::wall_manager::WallManager;
use crate::unit_converter::UnitConverter;
use std::collections::HashMap;
use wasm_bindgen::JsValue;

#[derive(Debug, Clone)]
pub enum MouseEventResult {
    Handled,
    CameraOperation(String),
    CreateSprite(String),
    None,
}

pub struct EventSystem {
    // Empty struct for now - all logic is stateless
}

impl EventSystem {
    pub fn new() -> Self {
        Self {}
    }

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
        
        // Handle fog drawing modes FIRST before other tools
        if matches!(input.input_mode, InputMode::FogDraw | InputMode::FogErase) {
            input.start_fog_draw(world_pos, input.fog_mode);
            web_sys::console::log_1(&format!("[RUST EVENT] Started fog drawing at: {}, {} mode: {:?}", world_pos.x, world_pos.y, input.fog_mode).into());
            return MouseEventResult::Handled;
        }
        
        // Handle tool-specific input modes
        match input.input_mode {
            InputMode::Measurement => {
                // Start measurement from this point
                input.start_measurement(world_pos);
                web_sys::console::log_1(&format!("[RUST EVENT] Started measurement at: {}, {}", world_pos.x, world_pos.y).into());
                return MouseEventResult::Handled;
            }
            InputMode::CreateRectangle => {
                // Start rectangle creation
                input.start_shape_creation(world_pos);
                web_sys::console::log_1(&format!("[RUST EVENT] Started rectangle creation at: {}, {}", world_pos.x, world_pos.y).into());
                return MouseEventResult::Handled;
            }
            InputMode::CreateCircle => {
                // Start circle creation
                input.start_shape_creation(world_pos);
                web_sys::console::log_1(&format!("[RUST EVENT] Started circle creation at: {}, {}", world_pos.x, world_pos.y).into());
                return MouseEventResult::Handled;
            }
            InputMode::CreateLine => {
                // Start line creation
                input.start_shape_creation(world_pos);
                web_sys::console::log_1(&format!("[RUST EVENT] Started line creation at: {}, {}", world_pos.x, world_pos.y).into());
                return MouseEventResult::Handled;
            }
            InputMode::CreateText => {
                // Start text creation
                input.start_shape_creation(world_pos);
                web_sys::console::log_1(&format!("[RUST EVENT] Started text creation at: {}, {}", world_pos.x, world_pos.y).into());
                return MouseEventResult::Handled;
            }
            InputMode::Paint => {
                // Paint mode is handled directly in render.rs, not here
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
            _ => {
                // Continue with normal handling for other modes
            }
        }
        
        // Note: Fog drawing is now handled in TypeScript UI (Design A - manual DM fog only)
        // All fog interaction removed from Rust event system
        
        // Check for light drag mode (explicit or auto when active layer is "light")
        if input.input_mode == InputMode::LightDrag || active_layer == "light" {
            // Scale tolerance by zoom so the click target stays ~30 screen pixels regardless of zoom level
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

        // Auto wall-drag when active layer is "obstacles": try to grab a wall before sprites
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
            // FIRST: Check for resize handles across all sprites (these extend outside sprite bounds)
            // iterate layers in reverse z-order to find top-most handle hit
            let mut sorted_layers: Vec<_> = layers.iter().collect();
            sorted_layers.sort_by_key(|(_, layer)| std::cmp::Reverse(layer.z_order()));
            for (layer_name, layer) in sorted_layers.iter() {
                if !layer.selectable { continue; }
                if layer_name.as_str() != active_layer { continue; }
                for sprite in layer.sprites.iter().rev() {
                    // Check for resize handles first (they extend outside sprite bounds)
                    if let Some(handle) = HandleDetector::get_resize_handle_for_non_rotated_sprite(sprite, world_pos, camera_zoom) {
                        // Ensure sprite is selected before resizing
                        if !input.is_sprite_selected(&sprite.id) {
                            input.set_single_selection(sprite.id.clone());
                        }
                        input.input_mode = InputMode::SpriteResize(handle);
                        input.selected_sprite_id = Some(sprite.id.clone());
                        // store drag offset relative to sprite top-left
                        let sprite_top_left = Vec2::new(sprite.world_x as f32, sprite.world_y as f32);
                        input.drag_offset = world_pos - sprite_top_left;
                        return MouseEventResult::Handled;
                    }
                    
                    // Check for rotation handles (they also sit outside the sprite)
                    let rot_handle_pos = SpriteManager::get_rotation_handle_position(sprite, camera_zoom);
                    // Use a larger, zoom-independent handle size for better usability
                    let handle_size = 16.0 / camera_zoom as f32; // Increased from 8.0 to 16.0
                    if HandleDetector::point_in_handle(world_pos, rot_handle_pos.x, rot_handle_pos.y, handle_size) {
                        // select sprite and start rotate
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
            
            // SECOND: Check for regular sprite selection (inside sprite bounds only)
            let clicked_sprite = Self::find_sprite_at_position(world_pos, layers, active_layer);
            if let Some(sprite_id) = clicked_sprite {
                // If clicking an already selected sprite and multiple selected, start multi-move
                if input.is_sprite_selected(&sprite_id) && input.has_multiple_selected() {
                    input.selected_sprite_id = Some(sprite_id.clone());
                    input.input_mode = InputMode::SpriteMove;
                    if let Some((sprite, _)) = Self::find_sprite(&sprite_id, layers) {
                        let sprite_top_left = Vec2::new(sprite.world_x as f32, sprite.world_y as f32);
                        input.drag_offset = world_pos - sprite_top_left;
                    }
                    return MouseEventResult::Handled;
                }
                
                // Regular single sprite selection and move
                input.set_single_selection(sprite_id.clone());
                input.input_mode = InputMode::SpriteMove;
                if let Some((sprite, _)) = Self::find_sprite(&sprite_id, layers) {
                    let sprite_top_left = Vec2::new(sprite.world_x as f32, sprite.world_y as f32);
                    input.drag_offset = world_pos - sprite_top_left;
                }
                return MouseEventResult::Handled;
            }
        }
        
        // Handle sprite selection with Ctrl key
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
            // No sprite clicked and no special handles - start camera panning
            input.clear_selection();
            input.input_mode = InputMode::CameraPan;
            return MouseEventResult::Handled;
        }
    }

    pub fn handle_mouse_move(
        &mut self,
        world_pos: Vec2,
        input: &mut InputHandler,
        layers: &mut HashMap<String, Layer>,
        lighting: &mut LightingSystem,
        wall_manager: &mut WallManager,
    ) -> MouseEventResult {
        // Update fog drawing preview
        if matches!(input.input_mode, InputMode::FogDraw | InputMode::FogErase) {
            input.update_fog_draw(world_pos);
            return MouseEventResult::Handled;
        }
        
        match input.input_mode {
            InputMode::SpriteMove => {
                if let Some(sprite_id) = &input.selected_sprite_id {
                    if let Some((sprite, _layer_name)) = Self::find_sprite_mut(sprite_id, layers) {
                        let old_pos = Vec2::new(sprite.world_x as f32, sprite.world_y as f32);
                        let new_pos = world_pos - input.drag_offset;
                        let delta = new_pos - old_pos;
                        // Translate polygon vertices so obstacle geometry follows the sprite
                        if sprite.obstacle_type.as_deref() == Some("polygon") {
                            if let Some(verts) = &mut sprite.polygon_vertices {
                                for v in verts.iter_mut() {
                                    v[0] += delta.x;
                                    v[1] += delta.y;
                                }
                            }
                        }
                        sprite.world_x = new_pos.x as f64;
                        sprite.world_y = new_pos.y as f64;
                        Self::dispatch_drag_preview(sprite_id, sprite.world_x, sprite.world_y);
                    }
                }
                MouseEventResult::Handled
            }
            InputMode::SpriteResize(handle) => {
                if let Some(sprite_id) = &input.selected_sprite_id {
                    if let Some((sprite, _)) = Self::find_sprite_mut(sprite_id, layers) {
                        SpriteManager::resize_sprite_with_handle(sprite, handle, world_pos);
                        Self::dispatch_resize_preview(sprite_id, sprite.width as f64 * sprite.scale_x as f64, sprite.height as f64 * sprite.scale_y as f64);
                    }
                }
                MouseEventResult::Handled
            }
            InputMode::SpriteRotate => {
                if let Some(sprite_id) = &input.selected_sprite_id {
                    if let Some((sprite, _)) = Self::find_sprite_mut(sprite_id, layers) {
                        SpriteManager::update_rotation(sprite, world_pos, input.rotation_start_angle, input.sprite_initial_rotation);
                        Self::dispatch_rotate_preview(sprite_id, sprite.rotation.to_degrees() as f64);
                    }
                }
                MouseEventResult::Handled
            }
            InputMode::CameraPan => {
                // Handle camera panning by calculating screen delta and applying it
                let current_screen = Vec2::new(0.0, 0.0); // We need screen coordinates from input
                let last_screen = input.last_mouse_screen;
                let screen_delta = current_screen - last_screen;
                
                // Return camera operation with screen delta
                MouseEventResult::CameraOperation(format!("pan:{},{}", -screen_delta.x, -screen_delta.y))
            }
            InputMode::LightDrag => {
                if let Some(new_pos) = input.update_light_drag(world_pos) {
                    if let Some(ref light_id) = input.selected_light_id {
                        lighting.update_light_position(light_id, new_pos);
                    }
                }
                MouseEventResult::Handled
            }
            InputMode::WallDrag => {
                if let Some(ref wall_id) = input.dragged_wall_id {
                    let delta = world_pos - input.wall_drag_last;
                    wall_manager.translate_wall(wall_id, delta.x, delta.y);
                }
                input.wall_drag_last = world_pos;
                MouseEventResult::Handled
            }
            InputMode::FogDraw | InputMode::FogErase => {
                input.update_fog_draw(world_pos);
                MouseEventResult::Handled
            }
            InputMode::Measurement => {
                // Update measurement line endpoint
                input.update_measurement(world_pos);
                MouseEventResult::Handled
            }
            InputMode::CreateRectangle | InputMode::CreateCircle | 
            InputMode::CreateLine | InputMode::CreateText => {
                // Update shape creation preview
                input.update_shape_creation(world_pos);
                MouseEventResult::Handled
            }
            InputMode::DrawWall => {
                input.update_wall_draw(world_pos);
                MouseEventResult::Handled
            }
            InputMode::CreatePolygon => {
                input.update_polygon_cursor(world_pos);
                MouseEventResult::Handled
            }
            _ => MouseEventResult::None
        }
    }

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
                // Finalize light position based on world_pos
                let final_pos = Vec2::new(
                    world_pos.x + input.light_drag_offset.x,
                    world_pos.y + input.light_drag_offset.y,
                );
                if let Some(light_id) = &input.selected_light_id {
                    lighting.update_light_position(light_id, final_pos);
                    // Dispatch event to TS so the server is notified of the new position
                    Self::dispatch_light_moved(light_id, final_pos.x, final_pos.y);
                }
                input.end_light_drag();
                MouseEventResult::Handled
            }
            InputMode::WallDrag => {
                // Finalize wall position and notify TS for server sync
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
                // For camera pan, reset to None since panning is complete
                input.input_mode = InputMode::None;
                MouseEventResult::Handled
            }
            InputMode::SpriteMove | InputMode::SpriteResize(_) | InputMode::SpriteRotate => {
                // Extract sprite_id and input_mode for later use
                let sprite_id_opt = input.selected_sprite_id.clone();
                let current_input_mode = input.input_mode;
                
                web_sys::console::log_1(&format!("[RUST EVENT] Mouse up in mode: {:?}, sprite: {:?}", current_input_mode, sprite_id_opt).into());
                
                // Check for double-click ONLY on SpriteMove (not resize/rotate)
                if matches!(current_input_mode, InputMode::SpriteMove) {
                    if let Some(ref sprite_id_str) = sprite_id_opt {
                        let current_time = js_sys::Date::now();
                        web_sys::console::log_1(&format!("[RUST EVENT] Checking double-click for sprite {} at time {}", sprite_id_str, current_time).into());
                        
                        if input.check_double_click(sprite_id_str, current_time) {
                            // Double-click detected! Emit event to React for token configuration
                            web_sys::console::log_1(&format!("[RUST EVENT] ✅ Double-click detected on sprite: {}", sprite_id_str).into());
                            
                            if let Some(window) = web_sys::window() {
                                let detail = js_sys::Object::new();
                                js_sys::Reflect::set(&detail, &"spriteId".into(), &JsValue::from_str(sprite_id_str)).ok();
                                
                                let event_init = web_sys::CustomEventInit::new();
                                event_init.set_detail(&detail);
                                
                                if let Ok(event) = web_sys::CustomEvent::new_with_event_init_dict("tokenDoubleClick", &event_init) {
                                    window.dispatch_event(&event).ok();
                                    web_sys::console::log_1(&"[RUST EVENT] Dispatched tokenDoubleClick event to React".into());
                                }
                            }
                        } else {
                            web_sys::console::log_1(&format!("[RUST EVENT] ❌ Not a double-click for sprite: {}", sprite_id_str).into());
                        }
                    }
                }
                
                // Handle sprite operation completion - send network sync
                if let Some(sprite_id) = &sprite_id_opt {
                    // Call the bridge to notify operation completion
                    self.notify_operation_complete(current_input_mode, sprite_id, layers);
                }
                
                // Reset input mode since operation is complete  
                input.input_mode = InputMode::None;
                MouseEventResult::Handled
            }
            InputMode::Measurement => {
                // Complete measurement and send event to React
                if let Some((start, end)) = input.end_measurement() {
                    let dx = end.x - start.x;
                    let dy = end.y - start.y;
                    let distance = (dx * dx + dy * dy).sqrt();
                    let angle = dy.atan2(dx) * 180.0 / std::f32::consts::PI;
                    
                    let game_dist = converter.to_units(distance);
                    let feet = converter.to_feet(game_dist);
                    let meters = converter.to_meters(game_dist);
                    
                    web_sys::console::log_1(&format!("[RUST EVENT] Measurement complete: {:.2} px ({:.1} {}) from ({:.1}, {:.1}) to ({:.1}, {:.1})", distance, game_dist, converter.unit().label(), start.x, start.y, end.x, end.y).into());
                    
                    // Dispatch custom event to React with measurement data
                    if let Some(window) = web_sys::window() {
                        use wasm_bindgen::JsValue;
                        use js_sys::Object;
                        
                        let detail = Object::new();
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
                            web_sys::console::log_1(&"[RUST EVENT] Dispatched measurementComplete event to React".into());
                        }
                    }
                }
                // Keep measurement mode active for multiple measurements
                MouseEventResult::Handled
            }
            InputMode::CreateRectangle => {
                // Create rectangle sprite
                if let Some((start, end)) = input.end_shape_creation() {
                    let min_x = start.x.min(end.x);
                    let min_y = start.y.min(end.y);
                    let width = (end.x - start.x).abs();
                    let height = (end.y - start.y).abs();
                    
                    if width > 10.0 && height > 10.0 {  // Minimum size check
                        web_sys::console::log_1(&format!("[RUST EVENT] Creating rectangle at ({:.1}, {:.1}) size {:.1}x{:.1}", min_x, min_y, width, height).into());
                        // Return a special result to create the sprite
                        return MouseEventResult::CreateSprite(format!("rectangle:{}:{}:{}:{}", min_x, min_y, width, height));
                    }
                }
                // Keep creation mode active for multiple shapes
                MouseEventResult::Handled
            }
            InputMode::CreateCircle => {
                // Create circle sprite
                if let Some((start, end)) = input.end_shape_creation() {
                    let radius = ((end.x - start.x).powi(2) + (end.y - start.y).powi(2)).sqrt();
                    
                    if radius > 5.0 {  // Minimum radius check
                        web_sys::console::log_1(&format!("[RUST EVENT] Creating circle at ({:.1}, {:.1}) radius {:.1}", start.x, start.y, radius).into());
                        // Return a special result to create the sprite
                        return MouseEventResult::CreateSprite(format!("circle:{}:{}:{}", start.x, start.y, radius));
                    }
                }
                // Keep creation mode active for multiple shapes
                MouseEventResult::Handled
            }
            InputMode::CreateLine => {
                // Create line sprite
                if let Some((start, end)) = input.end_shape_creation() {
                    let length = ((end.x - start.x).powi(2) + (end.y - start.y).powi(2)).sqrt();
                    
                    if length > 5.0 {  // Minimum length check
                        web_sys::console::log_1(&format!("[RUST EVENT] Creating line from ({:.1}, {:.1}) to ({:.1}, {:.1})", start.x, start.y, end.x, end.y).into());
                        // Return a special result to create the sprite
                        return MouseEventResult::CreateSprite(format!("line:{}:{}:{}:{}", start.x, start.y, end.x, end.y));
                    }
                }
                // Keep creation mode active for multiple shapes
                MouseEventResult::Handled
            }
            InputMode::CreateText => {
                // Create text sprite - emit event for React to show modal
                if let Some((start, _end)) = input.end_shape_creation() {
                    web_sys::console::log_1(&format!("[RUST EVENT] Creating text at ({:.1}, {:.1})", start.x, start.y).into());
                    
                    // Emit custom event to React to open text input modal
                    if let Some(window) = web_sys::window() {
                        let detail = js_sys::Object::new();
                        js_sys::Reflect::set(&detail, &"x".into(), &JsValue::from_f64(start.x as f64)).ok();
                        js_sys::Reflect::set(&detail, &"y".into(), &JsValue::from_f64(start.y as f64)).ok();
                        
                        let event_init = web_sys::CustomEventInit::new();
                        event_init.set_detail(&detail);
                        
                        if let Ok(event) = web_sys::CustomEvent::new_with_event_init_dict("textSpriteClick", &event_init) {
                            window.dispatch_event(&event).ok();
                            web_sys::console::log_1(&"[RUST EVENT] Dispatched textSpriteClick event to React".into());
                        }
                    }
                }
                // Keep creation mode active for multiple text objects
                MouseEventResult::Handled
            }
            InputMode::DrawWall => {
                // Wall placement is click-based (handled in mouse_down), ignore mouse_up
                MouseEventResult::Handled
            }
            InputMode::CreatePolygon => {
                // Polygon placement is click-based (handled in mouse_down), ignore mouse_up
                MouseEventResult::Handled
            }
            _ => {
                input.input_mode = InputMode::None;
                MouseEventResult::Handled
            }
        }
    }
    
    // Helper methods
    fn find_sprite_at_position(world_pos: Vec2, layers: &HashMap<String, Layer>, active_layer: &str) -> Option<String> {
        let mut sorted_layers: Vec<_> = layers.iter().collect();
        sorted_layers.sort_by_key(|(_, layer)| std::cmp::Reverse(layer.z_order()));
        
        for (layer_name, layer) in sorted_layers {
            if !layer.selectable { continue; }
            if layer_name != active_layer { continue; }
            for sprite in layer.sprites.iter().rev() {
                if sprite.contains_world_point(world_pos) {
                    return Some(sprite.id.clone());
                }
            }
        }
        None
    }
    
    fn find_sprite<'a>(sprite_id: &str, layers: &'a HashMap<String, Layer>) -> Option<(&'a Sprite, &'a str)> {
        for (layer_name, layer) in layers {
            if let Some(sprite) = layer.sprites.iter().find(|s| s.id == sprite_id) {
                return Some((sprite, layer_name));
            }
        }
        None
    }
    
    fn find_sprite_mut<'a>(sprite_id: &str, layers: &'a mut HashMap<String, Layer>) -> Option<(&'a mut Sprite, &'a str)> {
        for (layer_name, layer) in layers {
            if let Some(sprite) = layer.sprites.iter_mut().find(|s| s.id == sprite_id) {
                return Some((sprite, layer_name));
            }
        }
        None
    }
    
    fn select_sprites_in_area(min: Vec2, max: Vec2, input: &mut InputHandler, layers: &HashMap<String, Layer>, active_layer: &str) {
        let mut selected_sprites = Vec::new();
        
        for (layer_name, layer) in layers {
            if !layer.selectable { continue; }
            if layer_name != active_layer { continue; }
            for sprite in &layer.sprites {
                let sprite_pos = Vec2::new(sprite.world_x as f32, sprite.world_y as f32);
                let sprite_size = Vec2::new(
                    (sprite.width * sprite.scale_x) as f32,
                    (sprite.height * sprite.scale_y) as f32
                );
                
                let sprite_min = sprite_pos;
                let sprite_max = sprite_pos + sprite_size;
                
                let intersects = sprite_max.x >= min.x && sprite_min.x <= max.x &&
                               sprite_max.y >= min.y && sprite_min.y <= max.y;
                
                if intersects {
                    selected_sprites.push(sprite.id.clone());
                }
            }
        }
        
        if !selected_sprites.is_empty() {
            input.clear_selection();
            for sprite_id in selected_sprites {
                input.add_to_selection(sprite_id);
            }
        }
    }
    
    // Helper method to notify operation completion for network sync
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
                js_sys::Reflect::set(&data, &"width".into(), &JsValue::from_f64(sprite.width as f64 * sprite.scale_x as f64)).ok();
                js_sys::Reflect::set(&data, &"height".into(), &JsValue::from_f64(sprite.height as f64 * sprite.scale_y as f64)).ok();
                "resize"
            }
            InputMode::SpriteRotate => {
                js_sys::Reflect::set(&data, &"rotation".into(), &JsValue::from_f64(sprite.rotation.to_degrees() as f64)).ok();
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

    fn dispatch_drag_preview(sprite_id: &str, x: f64, y: f64) {
        let Some(window) = web_sys::window() else { return };
        let detail = js_sys::Object::new();
        js_sys::Reflect::set(&detail, &"spriteId".into(), &JsValue::from_str(sprite_id)).ok();
        js_sys::Reflect::set(&detail, &"x".into(), &JsValue::from_f64(x)).ok();
        js_sys::Reflect::set(&detail, &"y".into(), &JsValue::from_f64(y)).ok();
        let event_init = web_sys::CustomEventInit::new();
        event_init.set_detail(&detail);
        if let Ok(event) = web_sys::CustomEvent::new_with_event_init_dict("sprite-drag-preview", &event_init) {
            window.dispatch_event(&event).ok();
        }
    }

    fn dispatch_resize_preview(sprite_id: &str, width: f64, height: f64) {
        let Some(window) = web_sys::window() else { return };
        let detail = js_sys::Object::new();
        js_sys::Reflect::set(&detail, &"spriteId".into(), &JsValue::from_str(sprite_id)).ok();
        js_sys::Reflect::set(&detail, &"width".into(), &JsValue::from_f64(width)).ok();
        js_sys::Reflect::set(&detail, &"height".into(), &JsValue::from_f64(height)).ok();
        let event_init = web_sys::CustomEventInit::new();
        event_init.set_detail(&detail);
        if let Ok(event) = web_sys::CustomEvent::new_with_event_init_dict("sprite-resize-preview", &event_init) {
            window.dispatch_event(&event).ok();
        }
    }

    fn dispatch_rotate_preview(sprite_id: &str, rotation: f64) {
        let Some(window) = web_sys::window() else { return };
        let detail = js_sys::Object::new();
        js_sys::Reflect::set(&detail, &"spriteId".into(), &JsValue::from_str(sprite_id)).ok();
        js_sys::Reflect::set(&detail, &"rotation".into(), &JsValue::from_f64(rotation)).ok();
        let event_init = web_sys::CustomEventInit::new();
        event_init.set_detail(&detail);
        if let Ok(event) = web_sys::CustomEvent::new_with_event_init_dict("sprite-rotate-preview", &event_init) {
            window.dispatch_event(&event).ok();
        }
    }

    /// Dispatch a custom event when a light finishes being dragged so TS can sync to server.
    fn dispatch_light_moved(light_id: &str, x: f32, y: f32) {
        let Some(window) = web_sys::window() else { return };
        let detail = js_sys::Object::new();
        js_sys::Reflect::set(&detail, &"lightId".into(), &JsValue::from_str(light_id)).ok();
        js_sys::Reflect::set(&detail, &"x".into(), &JsValue::from_f64(x as f64)).ok();
        js_sys::Reflect::set(&detail, &"y".into(), &JsValue::from_f64(y as f64)).ok();
        let event_init = web_sys::CustomEventInit::new();
        event_init.set_detail(&detail);
        if let Ok(event) = web_sys::CustomEvent::new_with_event_init_dict("wasm-light-moved", &event_init) {
            window.dispatch_event(&event).ok();
        }
    }

    /// Dispatch a custom event when a wall finishes being dragged so TS can sync to server.
    fn dispatch_wall_moved(wall_id: &str, x1: f32, y1: f32, x2: f32, y2: f32) {
        let Some(window) = web_sys::window() else { return };
        let detail = js_sys::Object::new();
        js_sys::Reflect::set(&detail, &"wallId".into(), &JsValue::from_str(wall_id)).ok();
        js_sys::Reflect::set(&detail, &"x1".into(), &JsValue::from_f64(x1 as f64)).ok();
        js_sys::Reflect::set(&detail, &"y1".into(), &JsValue::from_f64(y1 as f64)).ok();
        js_sys::Reflect::set(&detail, &"x2".into(), &JsValue::from_f64(x2 as f64)).ok();
        js_sys::Reflect::set(&detail, &"y2".into(), &JsValue::from_f64(y2 as f64)).ok();
        let event_init = web_sys::CustomEventInit::new();
        event_init.set_detail(&detail);
        if let Ok(event) = web_sys::CustomEvent::new_with_event_init_dict("wasm-wall-moved", &event_init) {
            window.dispatch_event(&event).ok();
        }
    }
}
