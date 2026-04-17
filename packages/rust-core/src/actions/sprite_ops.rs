use wasm_bindgen::prelude::*;
use std::collections::HashMap;

use super::{ActionsClient, ActionResult, SpriteInfo, ActionHistoryEntry};
use crate::types::{Position, Size};

#[wasm_bindgen]
impl ActionsClient {
    #[wasm_bindgen]
    pub fn create_sprite(&mut self, table_id: &str, layer: &str, position: &JsValue, texture_name: &str) -> JsValue {
        let sprite_id = self.generate_id();
        
        let pos = serde_wasm_bindgen::from_value::<Position>(position.clone())
            .unwrap_or(Position { x: 0.0, y: 0.0 });

        let sprite_info = SpriteInfo {
            sprite_id: sprite_id.clone(),
            layer: layer.to_string(),
            position: pos,
            size: Size { width: 64.0, height: 64.0 },
            rotation: 0.0,
            texture_name: texture_name.to_string(),
            visible: true,
        };

        self.sprites.insert(sprite_id.clone(), sprite_info.clone());

        let action_data = serde_json::json!({
            "table_id": table_id,
            "sprite_info": sprite_info
        });

        let action = ActionHistoryEntry {
            action_type: "create_sprite".to_string(),
            timestamp: js_sys::Date::now(),
            data: action_data,
            reversible: true,
        };

        self.add_to_history(action);
        self.notify_state_change("sprite_created", &sprite_id);

        if self.auto_sync {
            self.sync_sprite_create(table_id, &sprite_info);
        }

        let result = ActionResult {
            success: true,
            message: format!("Sprite created successfully"),
            data: Some(serde_json::to_value(&sprite_info).unwrap_or(serde_json::Value::Null)),
        };

        serde_wasm_bindgen::to_value(&result).unwrap_or(JsValue::NULL)
    }

    #[wasm_bindgen]
    pub fn delete_sprite(&mut self, sprite_id: &str) -> JsValue {
        if let Some(sprite_info) = self.sprites.remove(sprite_id) {
            let action = ActionHistoryEntry {
                action_type: "delete_sprite".to_string(),
                timestamp: js_sys::Date::now(),
                data: serde_json::to_value(&sprite_info).unwrap_or(serde_json::Value::Null),
                reversible: true,
            };

            self.add_to_history(action);
            self.notify_state_change("sprite_deleted", sprite_id);

            if self.auto_sync {
                self.sync_sprite_delete(sprite_id);
            }

            let result = ActionResult {
                success: true,
                message: "Sprite deleted successfully".to_string(),
                data: None,
            };

            serde_wasm_bindgen::to_value(&result).unwrap_or(JsValue::NULL)
        } else {
            let result = ActionResult {
                success: false,
                message: format!("Sprite '{}' not found", sprite_id),
                data: None,
            };

            serde_wasm_bindgen::to_value(&result).unwrap_or(JsValue::NULL)
        }
    }

    #[wasm_bindgen]
    pub fn update_sprite(&mut self, sprite_id: &str, updates: &JsValue) -> JsValue {
        let old_sprite = if let Some(sprite_info) = self.sprites.get(sprite_id) {
            sprite_info.clone()
        } else {
            let result = ActionResult {
                success: false,
                message: format!("Sprite '{}' not found", sprite_id),
                data: None,
            };
            return serde_wasm_bindgen::to_value(&result).unwrap_or(JsValue::NULL);
        };

        if let Some(sprite_info) = self.sprites.get_mut(sprite_id) {
            if let Ok(update_map) = serde_wasm_bindgen::from_value::<HashMap<String, serde_json::Value>>(updates.clone()) {
                for (key, value) in update_map {
                    match key.as_str() {
                        "layer" => {
                            if let Some(layer) = value.as_str() {
                                sprite_info.layer = layer.to_string();
                            }
                        }
                        "position" => {
                            if let Ok(pos) = serde_json::from_value::<Position>(value) {
                                sprite_info.position = pos;
                            }
                        }
                        "size" => {
                            if let Ok(size) = serde_json::from_value::<Size>(value) {
                                sprite_info.size = size;
                            }
                        }
                        "rotation" => {
                            if let Some(rotation) = value.as_f64() {
                                sprite_info.rotation = rotation;
                            }
                        }
                        "texture_name" => {
                            if let Some(texture_name) = value.as_str() {
                                sprite_info.texture_name = texture_name.to_string();
                            }
                        }
                        "visible" => {
                            if let Some(visible) = value.as_bool() {
                                sprite_info.visible = visible;
                            }
                        }
                        _ => {}
                    }
                }
            }

            let updated_sprite = sprite_info.clone();

            let action_data = serde_json::json!({
                "sprite_id": sprite_id,
                "old_values": old_sprite,
                "new_values": updated_sprite
            });

            let action = ActionHistoryEntry {
                action_type: "update_sprite".to_string(),
                timestamp: js_sys::Date::now(),
                data: action_data,
                reversible: true,
            };

            self.add_to_history(action);
            self.notify_state_change("sprite_updated", sprite_id);

            if self.auto_sync {
                self.sync_sprite_update(sprite_id, updates);
            }

            let result = ActionResult {
                success: true,
                message: "Sprite updated successfully".to_string(),
                data: Some(serde_json::to_value(&updated_sprite).unwrap_or(serde_json::Value::Null)),
            };

            serde_wasm_bindgen::to_value(&result).unwrap_or(JsValue::NULL)
        } else {
            let result = ActionResult {
                success: false,
                message: format!("Sprite '{}' not found", sprite_id),
                data: None,
            };

            serde_wasm_bindgen::to_value(&result).unwrap_or(JsValue::NULL)
        }
    }

    // Layer Management
    #[wasm_bindgen]
    pub fn set_layer_visibility(&mut self, layer: &str, visible: bool) -> JsValue {
        let old_visibility = self.layer_visibility.get(layer).copied().unwrap_or(true);
        self.layer_visibility.insert(layer.to_string(), visible);

        let action_data = serde_json::json!({
            "layer": layer,
            "old_visibility": old_visibility,
            "new_visibility": visible
        });

        let action = ActionHistoryEntry {
            action_type: "set_layer_visibility".to_string(),
            timestamp: js_sys::Date::now(),
            data: action_data,
            reversible: true,
        };

        self.add_to_history(action);
        self.notify_state_change("layer_visibility_changed", layer);

        let result = ActionResult {
            success: true,
            message: format!("Layer '{}' visibility set to {}", layer, visible),
            data: Some(serde_json::json!({ "layer": layer, "visible": visible })),
        };

        serde_wasm_bindgen::to_value(&result).unwrap_or(JsValue::NULL)
    }

    #[wasm_bindgen]
    pub fn get_layer_visibility(&self, layer: &str) -> bool {
        self.layer_visibility.get(layer).copied().unwrap_or(true)
    }

    #[wasm_bindgen]
    pub fn move_sprite_to_layer(&mut self, sprite_id: &str, new_layer: &str) -> JsValue {
        let old_layer = if let Some(sprite_info) = self.sprites.get(sprite_id) {
            sprite_info.layer.clone()
        } else {
            let result = ActionResult {
                success: false,
                message: format!("Sprite '{}' not found", sprite_id),
                data: None,
            };
            return serde_wasm_bindgen::to_value(&result).unwrap_or(JsValue::NULL);
        };

        if let Some(sprite_info) = self.sprites.get_mut(sprite_id) {
            sprite_info.layer = new_layer.to_string();

            let updated_sprite = sprite_info.clone();

            let action_data = serde_json::json!({
                "sprite_id": sprite_id,
                "old_layer": old_layer,
                "new_layer": new_layer
            });

            let action = ActionHistoryEntry {
                action_type: "move_sprite_to_layer".to_string(),
                timestamp: js_sys::Date::now(),
                data: action_data,
                reversible: true,
            };

            self.add_to_history(action.clone());
            
            if self.auto_sync {
                if let Some(ref network_client) = self.network_client {
                    if let Ok(action_json) = serde_json::to_string(&action) {
                        let sync_result = network_client.sync_action(&action_json);
                        if sync_result.is_err() {
                            web_sys::console::warn_1(&format!("Failed to sync sprite layer change to network: {:?}", sync_result.err()).into());
                        }
                    }
                }
            }
            
            self.notify_state_change("sprite_layer_changed", sprite_id);

            let result = ActionResult {
                success: true,
                message: format!("Sprite moved from '{}' to '{}' layer", old_layer, new_layer),
                data: Some(serde_json::to_value(&updated_sprite).unwrap_or(serde_json::Value::Null)),
            };

            serde_wasm_bindgen::to_value(&result).unwrap_or(JsValue::NULL)
        } else {
            let result = ActionResult {
                success: false,
                message: format!("Sprite '{}' not found", sprite_id),
                data: None,
            };

            serde_wasm_bindgen::to_value(&result).unwrap_or(JsValue::NULL)
        }
    }

    // Batch Operations
    #[wasm_bindgen]
    pub fn batch_actions(&mut self, actions: &JsValue) -> JsValue {
        let mut results = Vec::new();
        
        if let Ok(action_list) = serde_wasm_bindgen::from_value::<Vec<serde_json::Value>>(actions.clone()) {
            for action_data in action_list {
                if let Some(action_type) = action_data.get("type").and_then(|v| v.as_str()) {
                    let params = action_data.get("params").unwrap_or(&serde_json::Value::Null);
                    
                    let result = match action_type {
                        "create_table" => {
                            if let (Some(name), Some(width), Some(height)) = (
                                params.get("name").and_then(|v| v.as_str()),
                                params.get("width").and_then(|v| v.as_f64()),
                                params.get("height").and_then(|v| v.as_f64()),
                            ) {
                                self.create_table(name, width, height)
                            } else {
                                serde_wasm_bindgen::to_value(&ActionResult {
                                    success: false,
                                    message: "Invalid parameters for create_table".to_string(),
                                    data: None,
                                }).unwrap_or(JsValue::NULL)
                            }
                        }
                        _ => {
                            serde_wasm_bindgen::to_value(&ActionResult {
                                success: false,
                                message: format!("Unknown action type: {}", action_type),
                                data: None,
                            }).unwrap_or(JsValue::NULL)
                        }
                    };
                    
                    results.push(result);
                }
            }
        }

        let batch_result = ActionResult {
            success: true,
            message: format!("Batch operation completed with {} actions", results.len()),
            data: Some(serde_json::json!({ "results": results.len() })),
        };

        serde_wasm_bindgen::to_value(&batch_result).unwrap_or(JsValue::NULL)
    }
}
