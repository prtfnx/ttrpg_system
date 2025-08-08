use wasm_bindgen::prelude::*;
use crate::math::Vec2;
use crate::types::{Sprite, Layer};
use crate::input::{InputHandler, InputMode, ResizeHandle, HandleDetector, FogDrawMode};
use crate::camera::Camera;
use crate::sprite_manager::SpriteManager;
use crate::lighting::LightingSystem;
use crate::fog::{FogOfWarSystem, FogMode};
use std::collections::HashMap;

#[derive(Debug, Clone)]
pub enum MouseEventResult {
    Handled,
    CameraOperation(String),
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
        ctrl_pressed: bool
    ) -> MouseEventResult {
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
            if let Some(sprite_id) = clicked_sprite {
                if input.is_sprite_selected(&sprite_id) && input.has_multiple_selected() {
                    // Multi-move start
                    input.selected_sprite_id = Some(sprite_id.clone());
                    input.input_mode = InputMode::SpriteMove;
                    if let Some((sprite, _)) = Self::find_sprite(&sprite_id, layers) {
                        let sprite_top_left = Vec2::new(sprite.world_x as f32, sprite.world_y as f32);
                        input.drag_offset = world_pos - sprite_top_left;
                    }
                    return MouseEventResult::Handled;
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
                MouseEventResult::Handled
            }
            InputMode::CameraPan => {
                // Handle camera panning logic here  
                MouseEventResult::CameraOperation("update_view_matrix".to_string())
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
            _ => {
                input.input_mode = InputMode::None;
                MouseEventResult::Handled
            }
        }
    }
    
    // Helper methods
    fn find_sprite_at_position(world_pos: Vec2, layers: &HashMap<String, Layer>) -> Option<String> {
        let mut sorted_layers: Vec<_> = layers.iter().collect();
        sorted_layers.sort_by_key(|(_, layer)| std::cmp::Reverse(layer.z_order));
        
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
