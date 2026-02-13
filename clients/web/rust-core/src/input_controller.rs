use wasm_bindgen::prelude::*;
use crate::input::{InputHandler, InputResult};
use crate::math::Vec2;
use crate::types::Sprite;

/// Input Controller - Handles all input-related operations separate from rendering
pub struct InputController {
    pub input: InputHandler,
}

impl InputController {
    pub fn new() -> Self {
        Self {
            input: InputHandler::new(),
        }
    }

    /// Get list of currently selected sprite IDs - WASM export
    #[wasm_bindgen]
    pub fn get_selected_sprites(&self) -> Vec<JsValue> {
        self.input.selected_sprite_ids
            .iter()
            .map(|id| JsValue::from_str(id))
            .collect()
    }

    /// Clear current selection - WASM export
    #[wasm_bindgen]
    pub fn clear_selection(&mut self) {
        self.input.clear_selection();
    }

    /// Handle mouse down with modifier keys - WASM export
    #[wasm_bindgen]
    pub fn handle_mouse_down_with_modifiers(&mut self, world_x: f32, world_y: f32, ctrl_key: bool, shift_key: bool) -> String {
        let world_pos = Vec2::new(world_x, world_y);
        let result = self.input.handle_mouse_down_with_modifiers(world_pos, ctrl_key);
        
        match result {
            InputResult::SingleSelect => "single_select".to_string(),
            InputResult::MultiSelectToggle => "multi_select_toggle".to_string(),
            InputResult::StartAreaSelect => "area_select".to_string(),
            InputResult::None => "none".to_string(),
        }
    }

    /// Select all sprites in layer - internal method
    pub fn select_all_sprites(&mut self, sprite_ids: Vec<String>) {
        self.input.selected_sprite_ids = sprite_ids;
        self.input.selected_sprite_id = self.input.selected_sprite_ids.first().cloned();
    }

    /// Select sprites within rectangular area - internal method
    pub fn select_sprites_in_rect(&mut self, x1: f32, y1: f32, x2: f32, y2: f32, add_to_selection: bool, sprites: &[(&str, &Sprite)]) {
        let min_x = x1.min(x2);
        let min_y = y1.min(y2);
        let max_x = x1.max(x2);
        let max_y = y1.max(y2);

        if !add_to_selection {
            self.input.clear_selection();
        }

        for (sprite_id, sprite) in sprites {
            let half_width = sprite.size.x * sprite.scale.x / 2.0;
            let half_height = sprite.size.y * sprite.scale.y / 2.0;
            
            let sprite_min_x = sprite.position.x - half_width;
            let sprite_min_y = sprite.position.y - half_height;
            let sprite_max_x = sprite.position.x + half_width;
            let sprite_max_y = sprite.position.y + half_height;

            if sprite_min_x <= max_x && sprite_max_x >= min_x &&
               sprite_min_y <= max_y && sprite_max_y >= min_y {
                self.input.add_to_selection(sprite_id.to_string());
            }
        }
    }

    /// Find sprite at position - internal method
    pub fn find_sprite_at_position(&self, world_pos: Vec2, sprites: &[(&str, &Sprite)]) -> Option<String> {
        let mut found_sprites: Vec<(String, i32)> = Vec::new();
        
        for (sprite_id, sprite) in sprites {
            let half_width = sprite.size.x * sprite.scale.x / 2.0;
            let half_height = sprite.size.y * sprite.scale.y / 2.0;
            
            if world_pos.x >= sprite.position.x - half_width && 
               world_pos.x <= sprite.position.x + half_width &&
               world_pos.y >= sprite.position.y - half_height && 
               world_pos.y <= sprite.position.y + half_height {
                found_sprites.push((sprite_id.to_string(), sprite.z_order.unwrap_or(0)));
            }
        }

        // Return highest z-order sprite
        found_sprites.sort_by(|a, b| b.1.cmp(&a.1));
        found_sprites.first().map(|(id, _)| id.clone())
    }

    /// Handle sprite selection logic
    pub fn handle_sprite_selection(&mut self, sprite_id: Option<String>, ctrl_key: bool) -> Option<String> {
        match sprite_id {
            Some(id) if ctrl_key => {
                if self.input.is_sprite_selected(&id) {
                    self.input.remove_from_selection(&id);
                } else {
                    self.input.add_to_selection(id.clone());
                }
                Some(id)
            }
            Some(id) => {
                self.input.set_single_selection(id.clone());
                Some(id)
            }
            None if !ctrl_key => {
                // Start area selection
                None
            }
            _ => None
        }
    }
}