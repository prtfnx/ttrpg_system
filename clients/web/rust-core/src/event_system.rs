use crate::math::Vec2;
use crate::types::{Sprite, Layer};
use crate::input::{InputHandler, InputMode, HandleDetector, FogDrawMode};
use crate::camera::Camera;
use crate::sprite_manager::SpriteManager;
use crate::lighting::LightingSystem;
use crate::fog::{FogOfWarSystem, FogMode};
use std::collections::HashMap;

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
        fog: &mut FogOfWarSystem,
        camera_zoom: f64,
        ctrl_pressed: bool
    ) -> MouseEventResult {
        web_sys::console::log_1(&format!("[RUST EVENT] Mouse down at world: {}, {}, input_mode: {:?}", world_pos.x, world_pos.y, input.input_mode).into());
        
        // Handle tool-specific input modes first
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
            _ => {
                // Continue with normal handling for other modes
            }
        }
        
        // Check for fog drawing mode first
        if matches!(input.input_mode, InputMode::FogDraw | InputMode::FogErase) {
            let fog_mode = match input.input_mode {
                InputMode::FogErase => FogDrawMode::Reveal,
                _ => FogDrawMode::Hide,
            };
            
            let id = format!("interactive_fog_{}", js_sys::Date::now() as u64);
            input.start_fog_draw(world_pos, fog_mode);
            
            let fog_system_mode = match fog_mode {
                FogDrawMode::Reveal => FogMode::Reveal,
                FogDrawMode::Hide => FogMode::Hide,
            };
            
            fog.start_interactive_rectangle(id, world_pos, fog_system_mode);
            return MouseEventResult::Handled;
        }
        
        // Check for light drag mode
        if input.input_mode == InputMode::LightDrag {
            if let Some(light_id) = lighting.get_light_at_position(world_pos, 30.0) {
                if let Some(light_pos) = lighting.get_light_position(&light_id) {
                    input.start_light_drag(light_id.to_string(), world_pos, light_pos);
                    return MouseEventResult::Handled;
                }
            }
        }
        
        // Handle sprite interactions
        if !ctrl_pressed {
            let clicked_sprite = Self::find_sprite_at_position(world_pos, layers);
            // If no sprite rect was clicked, also check for rotation handles which sit outside the sprite
            if clicked_sprite.is_none() {
                // iterate layers in reverse z-order to find top-most handle hit
                let mut sorted_layers: Vec<_> = layers.iter().collect();
                sorted_layers.sort_by_key(|(_, layer)| std::cmp::Reverse(layer.z_order()));
                for (_ln, layer) in sorted_layers {
                    if !layer.selectable { continue; }
                    for sprite in layer.sprites.iter().rev() {
                        let rot_handle_pos = SpriteManager::get_rotation_handle_position(sprite, camera_zoom);
                        let handle_size = 8.0 / camera_zoom as f32;
                        web_sys::console::log_1(&format!("[RUST DEBUG] Scanning rotation handle - sprite={} handle=({:.2},{:.2}) mouse=({:.2},{:.2}) size={:.2}", sprite.id, rot_handle_pos.x, rot_handle_pos.y, world_pos.x, world_pos.y, handle_size).into());
                        if HandleDetector::point_in_handle(world_pos, rot_handle_pos.x, rot_handle_pos.y, handle_size) {
                            web_sys::console::log_1(&format!("[RUST DEBUG] Scanned rotation handle hit on sprite {}", sprite.id).into());
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
            }
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
                // If sprite was clicked, check for resize/rotate handle hits first
                // Allow handle clicks to select the sprite and begin the operation in one click
                if let Some((sprite, _)) = Self::find_sprite(&sprite_id, layers) {
                    // Rotation handle detection
                    let rot_handle_pos = SpriteManager::get_rotation_handle_position(sprite, camera_zoom);
                    let handle_size = 8.0 / camera_zoom as f32;
                    // Debug logging for handle detection
                    web_sys::console::log_1(&format!("[RUST DEBUG] Rotation detection - world_pos=({:.2},{:.2}) rot_handle=({:.2},{:.2}) handle_size={:.2}", world_pos.x, world_pos.y, rot_handle_pos.x, rot_handle_pos.y, handle_size).into());
                    let rot_dist = ((world_pos.x - rot_handle_pos.x).powi(2) + (world_pos.y - rot_handle_pos.y).powi(2)).sqrt();
                    web_sys::console::log_1(&format!("[RUST DEBUG] Rotation distance = {:.3}", rot_dist).into());
                    if HandleDetector::point_in_handle(world_pos, rot_handle_pos.x, rot_handle_pos.y, handle_size) {
                        // Ensure sprite is selected before rotating
                        if !input.is_sprite_selected(&sprite_id) {
                            input.set_single_selection(sprite_id.clone());
                        }
                        input.input_mode = InputMode::SpriteRotate;
                        // store starting angles for relative rotation
                        let center = Vec2::new(sprite.world_x as f32 + (sprite.width * sprite.scale_x) as f32 / 2.0, sprite.world_y as f32 + (sprite.height * sprite.scale_y) as f32 / 2.0);
                        input.rotation_start_angle = (world_pos - center).angle() as f64;
                        input.sprite_initial_rotation = sprite.rotation;
                        input.selected_sprite_id = Some(sprite_id.clone());
                        return MouseEventResult::Handled;
                    }

                    // Resize handle detection (non-rotated path)
                    web_sys::console::log_1(&format!("[RUST DEBUG] Resize detection - sprite_pos=({:.2},{:.2}) size=({}, {}) world_pos=({:.2},{:.2}) zoom={:.2}", sprite.world_x, sprite.world_y, sprite.width * sprite.scale_x, sprite.height * sprite.scale_y, world_pos.x, world_pos.y, camera_zoom).into());
                    if let Some(handle) = HandleDetector::get_resize_handle_for_non_rotated_sprite(sprite, world_pos, camera_zoom) {
                        web_sys::console::log_1(&format!("[RUST DEBUG] Resize handle detected: {:?}", handle).into());
                        // Ensure sprite is selected before resizing
                        if !input.is_sprite_selected(&sprite_id) {
                            input.set_single_selection(sprite_id.clone());
                        }
                        input.input_mode = InputMode::SpriteResize(handle);
                        input.selected_sprite_id = Some(sprite_id.clone());
                        // store drag offset relative to sprite top-left
                        let sprite_top_left = Vec2::new(sprite.world_x as f32, sprite.world_y as f32);
                        input.drag_offset = world_pos - sprite_top_left;
                        return MouseEventResult::Handled;
                    }
                }
            }
        }
        
        // Handle sprite selection
        if ctrl_pressed {
            let clicked_sprite = Self::find_sprite_at_position(world_pos, layers);
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
            let clicked_sprite = Self::find_sprite_at_position(world_pos, layers);
            if let Some(sprite_id) = clicked_sprite {
                input.set_single_selection(sprite_id.clone());
                input.input_mode = InputMode::SpriteMove;
                if let Some((sprite, _)) = Self::find_sprite(&sprite_id, layers) {
                    let sprite_top_left = Vec2::new(sprite.world_x as f32, sprite.world_y as f32);
                    input.drag_offset = world_pos - sprite_top_left;
                }
                return MouseEventResult::Handled;
            } else {
                input.clear_selection();
                input.input_mode = InputMode::CameraPan;
                return MouseEventResult::Handled;
            }
        }
    }

    pub fn handle_mouse_move(
        &mut self,
        world_pos: Vec2,
        input: &mut InputHandler,
        layers: &mut HashMap<String, Layer>,
        lighting: &mut LightingSystem,
        fog: &mut FogOfWarSystem,
        camera: &Camera
    ) -> MouseEventResult {
        match input.input_mode {
            InputMode::SpriteMove => {
                // Handle sprite movement logic here
                if let Some(sprite_id) = &input.selected_sprite_id {
                    if let Some((sprite, _layer_name)) = Self::find_sprite_mut(sprite_id, layers) {
                        let new_pos = world_pos - input.drag_offset;
                        sprite.world_x = new_pos.x as f64;
                        sprite.world_y = new_pos.y as f64;
                        web_sys::console::log_1(&format!("[RUST] Moving sprite {} to: {}, {}", sprite_id, sprite.world_x, sprite.world_y).into());
                    }
                }
                MouseEventResult::Handled
            }
            InputMode::SpriteResize(handle) => {
                if let Some(sprite_id) = &input.selected_sprite_id {
                    if let Some((sprite, _)) = Self::find_sprite_mut(sprite_id, layers) {
                        // Delegate to SpriteManager which contains robust resize logic
                        SpriteManager::resize_sprite_with_handle(sprite, handle, world_pos);
                    }
                }
                MouseEventResult::Handled
            }
            InputMode::SpriteRotate => {
                if let Some(sprite_id) = &input.selected_sprite_id {
                    if let Some((sprite, _)) = Self::find_sprite_mut(sprite_id, layers) {
                        SpriteManager::update_rotation(sprite, world_pos, input.rotation_start_angle, input.sprite_initial_rotation);
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
            _ => MouseEventResult::None
        }
    }

    pub fn handle_mouse_up(
        &mut self,
        world_pos: Vec2,
        input: &mut InputHandler,
        layers: &mut HashMap<String, Layer>,
        lighting: &mut LightingSystem,
        fog: &mut FogOfWarSystem
    ) -> MouseEventResult {
        match input.input_mode {
            InputMode::AreaSelect => {
                if let Some((min, max)) = input.get_area_selection_rect() {
                    Self::select_sprites_in_area(min, max, input, layers);
                }
                input.finish_area_selection();
                MouseEventResult::Handled
            }
            InputMode::LightDrag => {
                input.end_light_drag();
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
                        fog.add_fog_rectangle(id, start.x, start.y, end.x, end.y, mode_str);
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
                // For sprite operations, reset to None since operation is complete  
                input.input_mode = InputMode::None;
                MouseEventResult::Handled
            }
            InputMode::Measurement => {
                // Complete measurement and log the result
                if let Some((start, end)) = input.end_measurement() {
                    let distance = ((end.x - start.x).powi(2) + (end.y - start.y).powi(2)).sqrt();
                    web_sys::console::log_1(&format!("[RUST EVENT] Measurement complete: {:.2} units from ({:.1}, {:.1}) to ({:.1}, {:.1})", distance, start.x, start.y, end.x, end.y).into());
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
                // Create text sprite
                if let Some((start, _end)) = input.end_shape_creation() {
                    web_sys::console::log_1(&format!("[RUST EVENT] Creating text at ({:.1}, {:.1})", start.x, start.y).into());
                    // TODO: Actually create the text sprite and show text input dialog
                }
                // Keep creation mode active for multiple text objects
                MouseEventResult::Handled
            }
            _ => {
                input.input_mode = InputMode::None;
                MouseEventResult::Handled
            }
        }
    }
    
    // Helper methods
    fn find_sprite_at_position(world_pos: Vec2, layers: &HashMap<String, Layer>) -> Option<String> {
        let mut sorted_layers: Vec<_> = layers.iter().collect();
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
    
    fn select_sprites_in_area(min: Vec2, max: Vec2, input: &mut InputHandler, layers: &HashMap<String, Layer>) {
        let mut selected_sprites = Vec::new();
        
        for (_, layer) in layers {
            if layer.selectable {
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
        }
        
        if !selected_sprites.is_empty() {
            input.clear_selection();
            for sprite_id in selected_sprites {
                input.add_to_selection(sprite_id);
            }
        }
    }
}
