mod mouse_down;
mod mouse_move;
mod mouse_up;
mod dispatch;

use crate::math::Vec2;
use crate::types::{Sprite, Layer};
use crate::input::InputHandler;
use std::collections::HashMap;

#[derive(Debug, Clone)]
pub enum MouseEventResult {
    Handled,
    CameraOperation(String),
    CreateSprite(String),
    None,
}

pub struct EventSystem;

impl EventSystem {
    pub fn new() -> Self {
        Self
    }

    // Helper methods used across submodules
    pub(crate) fn find_sprite_at_position(world_pos: Vec2, layers: &HashMap<String, Layer>, active_layer: &str) -> Option<String> {
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
    
    pub(crate) fn find_sprite<'a>(sprite_id: &str, layers: &'a HashMap<String, Layer>) -> Option<(&'a Sprite, &'a str)> {
        for (layer_name, layer) in layers {
            if let Some(sprite) = layer.sprites.iter().find(|s| s.id == sprite_id) {
                return Some((sprite, layer_name));
            }
        }
        None
    }
    
    pub(crate) fn find_sprite_mut<'a>(sprite_id: &str, layers: &'a mut HashMap<String, Layer>) -> Option<(&'a mut Sprite, &'a str)> {
        for (layer_name, layer) in layers {
            if let Some(sprite) = layer.sprites.iter_mut().find(|s| s.id == sprite_id) {
                return Some((sprite, layer_name));
            }
        }
        None
    }
    
    pub(crate) fn select_sprites_in_area(min: Vec2, max: Vec2, input: &mut InputHandler, layers: &HashMap<String, Layer>, active_layer: &str) {
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
}
