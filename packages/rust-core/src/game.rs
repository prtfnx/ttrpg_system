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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn new_engine_is_empty() {
        let engine = GameEngine::new();
        assert_eq!(engine.get_sprites_json(), "[]");
        assert!(engine.get_current_table().is_none());
        assert!(engine.get_selected_sprite().is_none());
    }

    #[test]
    fn add_and_retrieve_sprite() {
        let mut engine = GameEngine::new();
        engine.add_sprite_from_data("s1", 10.0, 20.0, 64.0, 64.0, "tokens");
        let json = engine.get_sprite_data("s1");
        assert!(json.is_some());
        let data = json.unwrap();
        assert!(data.contains("\"id\":\"s1\""));
    }

    #[test]
    fn get_nonexistent_sprite_returns_none() {
        let engine = GameEngine::new();
        assert!(engine.get_sprite_data("nope").is_none());
    }

    #[test]
    fn remove_sprite() {
        let mut engine = GameEngine::new();
        engine.add_sprite_from_data("s1", 0.0, 0.0, 10.0, 10.0, "tokens");
        engine.remove_sprite("s1");
        assert!(engine.get_sprite_data("s1").is_none());
    }

    #[test]
    fn remove_nonexistent_sprite_is_noop() {
        let mut engine = GameEngine::new();
        engine.add_sprite_from_data("s1", 0.0, 0.0, 10.0, 10.0, "tokens");
        engine.remove_sprite("nope");
        assert!(engine.get_sprite_data("s1").is_some());
    }

    #[test]
    fn move_sprite_updates_position() {
        let mut engine = GameEngine::new();
        engine.add_sprite_from_data("s1", 0.0, 0.0, 64.0, 64.0, "tokens");
        assert!(engine.move_sprite("s1", 100.0, 200.0));
        let json = engine.get_sprite_data("s1").unwrap();
        assert!(json.contains("100"));
        assert!(json.contains("200"));
    }

    #[test]
    fn move_nonexistent_sprite_returns_false() {
        let mut engine = GameEngine::new();
        assert!(!engine.move_sprite("nope", 10.0, 10.0));
    }

    #[test]
    fn select_and_clear() {
        let mut engine = GameEngine::new();
        engine.select_sprite("s1");
        assert_eq!(engine.get_selected_sprite(), Some("s1".to_string()));
        engine.clear_selection();
        assert!(engine.get_selected_sprite().is_none());
    }

    #[test]
    fn get_sprites_on_layer_filters() {
        let mut engine = GameEngine::new();
        engine.add_sprite_from_data("a", 0.0, 0.0, 10.0, 10.0, "tokens");
        engine.add_sprite_from_data("b", 0.0, 0.0, 10.0, 10.0, "map");
        engine.add_sprite_from_data("c", 0.0, 0.0, 10.0, 10.0, "tokens");
        let tokens = engine.get_sprites_on_layer("tokens");
        assert!(tokens.contains("\"a\""));
        assert!(tokens.contains("\"c\""));
        assert!(!tokens.contains("\"b\""));
    }

    #[test]
    fn set_and_get_current_table() {
        let mut engine = GameEngine::new();
        engine.set_current_table("table-123");
        assert_eq!(engine.get_current_table(), Some("table-123".to_string()));
    }

    #[test]
    fn update_sprites_from_json_roundtrip() {
        let mut engine = GameEngine::new();
        engine.add_sprite_from_data("s1", 5.0, 10.0, 32.0, 32.0, "tokens");
        let json = engine.get_sprites_json();
        let mut engine2 = GameEngine::new();
        engine2.update_sprites_from_json(&json).unwrap();
        assert!(engine2.get_sprite_data("s1").is_some());
    }

    #[test]
    fn update_sprites_from_invalid_json_errors() {
        let mut engine = GameEngine::new();
        assert!(engine.update_sprites_from_json("not json").is_err());
    }
}
