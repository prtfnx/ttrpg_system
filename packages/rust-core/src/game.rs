use wasm_bindgen::prelude::*;
use crate::types::*;

#[wasm_bindgen]
pub struct GameEngine {
    sprites: Vec<Sprite>,
    current_table: Option<String>,
    selected_sprite: Option<String>,
}

#[wasm_bindgen]
impl GameEngine {
    #[wasm_bindgen(constructor)]
    pub fn new() -> GameEngine {
        GameEngine {
            sprites: Vec::new(),
            current_table: None,
            selected_sprite: None,
        }
    }

    #[wasm_bindgen]
    pub fn add_sprite_from_data(&mut self, id: &str, x: f64, y: f64, width: f64, height: f64, layer: &str) {
        let sprite = Sprite::new(id.to_string(), x, y, width, height, layer.to_string());
        self.sprites.push(sprite);
    }

    #[wasm_bindgen]
    pub fn remove_sprite(&mut self, sprite_id: &str) {
        self.sprites.retain(|s| s.id != sprite_id);
    }

    #[wasm_bindgen]
    pub fn get_sprite_data(&self, sprite_id: &str) -> Option<String> {
        self.sprites.iter().find(|s| s.id == sprite_id)
            .and_then(|sprite| serde_json::to_string(sprite).ok())
    }

    #[wasm_bindgen]
    pub fn move_sprite(&mut self, sprite_id: &str, x: f64, y: f64) -> bool {
        if let Some(sprite) = self.sprites.iter_mut().find(|s| s.id == sprite_id) {
            sprite.x = x;
            sprite.y = y;
            true
        } else {
            false
        }
    }

    #[wasm_bindgen]
    pub fn get_sprites_json(&self) -> String {
        serde_json::to_string(&self.sprites).unwrap_or_else(|_| "[]".to_string())
    }

    #[wasm_bindgen]
    pub fn update_sprites_from_json(&mut self, json: &str) -> Result<(), JsValue> {
        let sprites: Vec<Sprite> = serde_json::from_str(json)
            .map_err(|e| JsValue::from_str(&format!("Failed to parse sprites: {}", e)))?;
        
        self.sprites = sprites;
        Ok(())
    }

    #[wasm_bindgen]
    pub fn select_sprite(&mut self, sprite_id: &str) {
        self.selected_sprite = Some(sprite_id.to_string());
    }

    #[wasm_bindgen]
    pub fn get_selected_sprite(&self) -> Option<String> {
        self.selected_sprite.clone()
    }

    #[wasm_bindgen]
    pub fn clear_selection(&mut self) {
        self.selected_sprite = None;
    }

    #[wasm_bindgen]
    pub fn get_sprites_on_layer(&self, layer: &str) -> String {
        let layer_sprites: Vec<&Sprite> = self.sprites.iter()
            .filter(|s| s.layer == layer)
            .collect();
        
        serde_json::to_string(&layer_sprites).unwrap_or_else(|_| "[]".to_string())
    }

    #[wasm_bindgen]
    pub fn set_current_table(&mut self, table_id: &str) {
        self.current_table = Some(table_id.to_string());
    }

    #[wasm_bindgen]
    pub fn get_current_table(&self) -> Option<String> {
        self.current_table.clone()
    }
}
