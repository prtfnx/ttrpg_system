use std::collections::HashMap;
use wasm_bindgen::prelude::*;

use super::{ActionHistoryEntry, ActionResult, ActionsClient, SpriteInfo};
use crate::types::{Position, Size};

#[wasm_bindgen]
impl ActionsClient {
    #[wasm_bindgen]
    pub fn create_sprite(
        &mut self,
        table_id: &str,
        layer: &str,
        position: &JsValue,
        texture_name: &str,
    ) -> JsValue {
        let Ok(pos) = serde_wasm_bindgen::from_value::<Position>(position.clone()) else {
            return super::serialize_for_js(&invalid_batch_action()).unwrap_or(JsValue::NULL);
        };
        if !pos.x.is_finite() || !pos.y.is_finite() || !self.layer_visibility.contains_key(layer) {
            return super::serialize_for_js(&invalid_batch_action()).unwrap_or(JsValue::NULL);
        }
        let sprite_id = self.generate_id();

        let sprite_info = SpriteInfo {
            sprite_id: sprite_id.clone(),
            layer: layer.to_string(),
            position: pos,
            size: Size {
                width: 64.0,
                height: 64.0,
            },
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

        let result = ActionResult {
            success: true,
            message: "Sprite created successfully".to_string(),
            data: Some(serde_json::to_value(&sprite_info).unwrap_or(serde_json::Value::Null)),
        };

        super::serialize_for_js(&result).unwrap_or(JsValue::NULL)
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

            let result = ActionResult {
                success: true,
                message: "Sprite deleted successfully".to_string(),
                data: None,
            };

            super::serialize_for_js(&result).unwrap_or(JsValue::NULL)
        } else {
            let result = ActionResult {
                success: false,
                message: format!("Sprite '{}' not found", sprite_id),
                data: None,
            };

            super::serialize_for_js(&result).unwrap_or(JsValue::NULL)
        }
    }

    #[wasm_bindgen]
    pub fn update_sprite(&mut self, sprite_id: &str, updates: &JsValue) -> JsValue {
        let valid =
            serde_wasm_bindgen::from_value::<HashMap<String, serde_json::Value>>(updates.clone())
                .is_ok_and(|values| {
                    !values.is_empty()
                        && values.iter().all(|(key, value)| match key.as_str() {
                            "layer" => value
                                .as_str()
                                .is_some_and(|layer| self.layer_visibility.contains_key(layer)),
                            "position" => serde_json::from_value::<Position>(value.clone())
                                .is_ok_and(|p| p.x.is_finite() && p.y.is_finite()),
                            "size" => {
                                serde_json::from_value::<Size>(value.clone()).is_ok_and(|s| {
                                    s.width.is_finite()
                                        && s.height.is_finite()
                                        && s.width > 0.0
                                        && s.height > 0.0
                                })
                            }
                            "rotation" => value.as_f64().is_some_and(f64::is_finite),
                            "texture_name" => value.is_string(),
                            "visible" => value.is_boolean(),
                            _ => false,
                        })
                });
        if !valid {
            return super::serialize_for_js(&invalid_batch_action()).unwrap_or(JsValue::NULL);
        }
        let old_sprite = if let Some(sprite_info) = self.sprites.get(sprite_id) {
            sprite_info.clone()
        } else {
            let result = ActionResult {
                success: false,
                message: format!("Sprite '{}' not found", sprite_id),
                data: None,
            };
            return super::serialize_for_js(&result).unwrap_or(JsValue::NULL);
        };

        if let Some(sprite_info) = self.sprites.get_mut(sprite_id) {
            if let Ok(update_map) = serde_wasm_bindgen::from_value::<
                HashMap<String, serde_json::Value>,
            >(updates.clone())
            {
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

            let result = ActionResult {
                success: true,
                message: "Sprite updated successfully".to_string(),
                data: Some(
                    serde_json::to_value(&updated_sprite).unwrap_or(serde_json::Value::Null),
                ),
            };

            super::serialize_for_js(&result).unwrap_or(JsValue::NULL)
        } else {
            let result = ActionResult {
                success: false,
                message: format!("Sprite '{}' not found", sprite_id),
                data: None,
            };

            super::serialize_for_js(&result).unwrap_or(JsValue::NULL)
        }
    }

    // Layer Management
    #[wasm_bindgen]
    pub fn set_layer_visibility(&mut self, layer: &str, visible: bool) -> JsValue {
        if !self.layer_visibility.contains_key(layer) {
            return super::serialize_for_js(&invalid_batch_action()).unwrap_or(JsValue::NULL);
        }
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

        super::serialize_for_js(&result).unwrap_or(JsValue::NULL)
    }

    #[wasm_bindgen]
    pub fn get_layer_visibility(&self, layer: &str) -> bool {
        self.layer_visibility.get(layer).copied().unwrap_or(true)
    }

    #[wasm_bindgen]
    pub fn move_sprite_to_layer(&mut self, sprite_id: &str, new_layer: &str) -> JsValue {
        if !self.layer_visibility.contains_key(new_layer) {
            return super::serialize_for_js(&invalid_batch_action()).unwrap_or(JsValue::NULL);
        }
        let old_layer = if let Some(sprite_info) = self.sprites.get(sprite_id) {
            sprite_info.layer.clone()
        } else {
            let result = ActionResult {
                success: false,
                message: format!("Sprite '{}' not found", sprite_id),
                data: None,
            };
            return super::serialize_for_js(&result).unwrap_or(JsValue::NULL);
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

            self.notify_state_change("sprite_layer_changed", sprite_id);

            let result = ActionResult {
                success: true,
                message: format!("Sprite moved from '{}' to '{}' layer", old_layer, new_layer),
                data: Some(
                    serde_json::to_value(&updated_sprite).unwrap_or(serde_json::Value::Null),
                ),
            };

            super::serialize_for_js(&result).unwrap_or(JsValue::NULL)
        } else {
            let result = ActionResult {
                success: false,
                message: format!("Sprite '{}' not found", sprite_id),
                data: None,
            };

            super::serialize_for_js(&result).unwrap_or(JsValue::NULL)
        }
    }

    // Batch Operations
    #[wasm_bindgen]
    pub fn batch_actions(&mut self, actions: &JsValue) -> JsValue {
        let result = self.apply_local_batch(actions);
        super::serialize_for_js(&result).unwrap_or(JsValue::NULL)
    }
}

impl ActionsClient {
    fn apply_local_batch(&mut self, actions: &JsValue) -> ActionResult {
        let Ok(list) = serde_wasm_bindgen::from_value::<Vec<serde_json::Value>>(actions.clone())
        else {
            return ActionResult {
                success: false,
                message: "Batch must be an array".into(),
                data: None,
            };
        };
        if list.is_empty() || list.len() > 100 {
            return ActionResult {
                success: false,
                message: "Batch requires 1–100 actions".into(),
                data: None,
            };
        }
        let before = self.local_state();
        self.history_suspended = true;
        for (index, action) in list.iter().enumerate() {
            let result = self.apply_local_batch_action(action);
            if !result.success {
                self.restore_local_state(before);
                self.history_suspended = false;
                return ActionResult {
                    success: false,
                    message: result.message,
                    data: Some(serde_json::json!({"failed_index": index, "atomic": true})),
                };
            }
        }
        self.history_suspended = false;
        let after = self.local_state();
        self.add_to_history(ActionHistoryEntry {
            action_type: "batch".into(),
            timestamp: js_sys::Date::now(),
            data: serde_json::json!({"old_values": before, "new_values": after}),
            reversible: true,
        });
        self.notify_state_change("batch_applied", "");
        ActionResult {
            success: true,
            message: "Local batch applied".into(),
            data: Some(serde_json::json!({"count": list.len(), "atomic": true})),
        }
    }

    fn apply_local_batch_action(&mut self, action: &serde_json::Value) -> ActionResult {
        let params = &action["params"];
        let result = match action["type"].as_str() {
            Some("create_table") => match (
                params["name"].as_str(),
                params["width"].as_f64(),
                params["height"].as_f64(),
            ) {
                (Some(name), Some(width), Some(height)) if width > 0.0 && height > 0.0 => {
                    self.create_table(name, width, height)
                }
                _ => return invalid_batch_action(),
            },
            Some("delete_table") => match params["table_id"].as_str() {
                Some(id) => self.delete_table(id),
                _ => return invalid_batch_action(),
            },
            Some("delete_sprite") => match params["sprite_id"].as_str() {
                Some(id) => self.delete_sprite(id),
                _ => return invalid_batch_action(),
            },
            Some("update_table") | Some("update_sprite") => {
                let is_table = action["type"] == "update_table";
                let (Some(id), true, Ok(updates)) = (
                    params[if is_table { "table_id" } else { "sprite_id" }].as_str(),
                    params["updates"].is_object(),
                    super::serialize_for_js(&params["updates"]),
                ) else {
                    return invalid_batch_action();
                };
                if is_table {
                    self.update_table(id, &updates)
                } else {
                    self.update_sprite(id, &updates)
                }
            }
            Some("create_sprite") => {
                let (Some(table), Some(layer), Some(texture), Ok(position)) = (
                    params["table_id"].as_str(),
                    params["layer"].as_str(),
                    params["texture_name"].as_str(),
                    serde_json::from_value::<Position>(params["position"].clone()),
                ) else {
                    return invalid_batch_action();
                };
                let Ok(position) = super::serialize_for_js(&position) else {
                    return invalid_batch_action();
                };
                self.create_sprite(table, layer, &position, texture)
            }
            Some("set_layer_visibility") => {
                match (params["layer"].as_str(), params["visible"].as_bool()) {
                    (Some(layer), Some(visible)) => self.set_layer_visibility(layer, visible),
                    _ => return invalid_batch_action(),
                }
            }
            Some("move_sprite_to_layer") => {
                match (params["sprite_id"].as_str(), params["new_layer"].as_str()) {
                    (Some(id), Some(layer)) => self.move_sprite_to_layer(id, layer),
                    _ => return invalid_batch_action(),
                }
            }
            _ => return invalid_batch_action(),
        };
        serde_wasm_bindgen::from_value(result).unwrap_or_else(|_| invalid_batch_action())
    }
}

fn invalid_batch_action() -> ActionResult {
    ActionResult {
        success: false,
        message: "Unsupported or malformed local batch action".into(),
        data: None,
    }
}
