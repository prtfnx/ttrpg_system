use wasm_bindgen::prelude::*;
use std::collections::HashMap;

use super::{ActionsClient, ActionResult, TableInfo, ActionHistoryEntry};

#[wasm_bindgen]
impl ActionsClient {
    #[wasm_bindgen]
    pub fn create_table(&mut self, name: &str, width: f64, height: f64) -> JsValue {
        let table_id = self.generate_id();
        
        let table_info = TableInfo {
            table_id: table_id.clone(),
            name: name.to_string(),
            width,
            height,
            scale_x: 1.0,
            scale_y: 1.0,
            offset_x: 0.0,
            offset_y: 0.0,
        };

        self.tables.insert(table_id.clone(), table_info.clone());

        let action = ActionHistoryEntry {
            action_type: "create_table".to_string(),
            timestamp: js_sys::Date::now(),
            data: serde_json::to_value(&table_info).unwrap_or(serde_json::Value::Null),
            reversible: true,
        };

        self.add_to_history(action);
        self.notify_state_change("table_created", &table_id);

        if self.auto_sync {
            self.sync_table_create(&table_info);
        }

        let result = ActionResult {
            success: true,
            message: format!("Table '{}' created successfully", name),
            data: Some(serde_json::to_value(&table_info).unwrap_or(serde_json::Value::Null)),
        };

        serde_wasm_bindgen::to_value(&result).unwrap_or(JsValue::NULL)
    }

    #[wasm_bindgen]
    pub fn delete_table(&mut self, table_id: &str) -> JsValue {
        if let Some(table_info) = self.tables.remove(table_id) {
            self.sprites.retain(|_, _sprite| {
                true
            });

            let action = ActionHistoryEntry {
                action_type: "delete_table".to_string(),
                timestamp: js_sys::Date::now(),
                data: serde_json::to_value(&table_info).unwrap_or(serde_json::Value::Null),
                reversible: true,
            };

            self.add_to_history(action);
            self.notify_state_change("table_deleted", table_id);

            if self.auto_sync {
                self.sync_table_delete(table_id);
            }

            let result = ActionResult {
                success: true,
                message: format!("Table '{}' deleted successfully", table_info.name),
                data: None,
            };

            serde_wasm_bindgen::to_value(&result).unwrap_or(JsValue::NULL)
        } else {
            let result = ActionResult {
                success: false,
                message: format!("Table '{}' not found", table_id),
                data: None,
            };

            serde_wasm_bindgen::to_value(&result).unwrap_or(JsValue::NULL)
        }
    }

    #[wasm_bindgen]
    pub fn update_table(&mut self, table_id: &str, updates: &JsValue) -> JsValue {
        let old_table = if let Some(table_info) = self.tables.get(table_id) {
            table_info.clone()
        } else {
            let result = ActionResult {
                success: false,
                message: format!("Table '{}' not found", table_id),
                data: None,
            };
            return serde_wasm_bindgen::to_value(&result).unwrap_or(JsValue::NULL);
        };

        if let Some(table_info) = self.tables.get_mut(table_id) {
            if let Ok(update_map) = serde_wasm_bindgen::from_value::<HashMap<String, serde_json::Value>>(updates.clone()) {
                for (key, value) in update_map {
                    match key.as_str() {
                        "name" => {
                            if let Some(name) = value.as_str() {
                                table_info.name = name.to_string();
                            }
                        }
                        "width" => {
                            if let Some(width) = value.as_f64() {
                                table_info.width = width;
                            }
                        }
                        "height" => {
                            if let Some(height) = value.as_f64() {
                                table_info.height = height;
                            }
                        }
                        "scale_x" => {
                            if let Some(scale_x) = value.as_f64() {
                                table_info.scale_x = scale_x;
                            }
                        }
                        "scale_y" => {
                            if let Some(scale_y) = value.as_f64() {
                                table_info.scale_y = scale_y;
                            }
                        }
                        "offset_x" => {
                            if let Some(offset_x) = value.as_f64() {
                                table_info.offset_x = offset_x;
                            }
                        }
                        "offset_y" => {
                            if let Some(offset_y) = value.as_f64() {
                                table_info.offset_y = offset_y;
                            }
                        }
                        _ => {}
                    }
                }
            }

            let table_name = table_info.name.clone();
            let updated_table = table_info.clone();

            let action_data = serde_json::json!({
                "table_id": table_id,
                "old_values": old_table,
                "new_values": updated_table
            });

            let action = ActionHistoryEntry {
                action_type: "update_table".to_string(),
                timestamp: js_sys::Date::now(),
                data: action_data,
                reversible: true,
            };

            self.add_to_history(action);
            self.notify_state_change("table_updated", table_id);

            if self.auto_sync {
                self.sync_table_update(table_id, updates);
            }

            let result = ActionResult {
                success: true,
                message: format!("Table '{}' updated successfully", table_name),
                data: Some(serde_json::to_value(&updated_table).unwrap_or(serde_json::Value::Null)),
            };

            serde_wasm_bindgen::to_value(&result).unwrap_or(JsValue::NULL)
        } else {
            let result = ActionResult {
                success: false,
                message: format!("Table '{}' not found", table_id),
                data: None,
            };

            serde_wasm_bindgen::to_value(&result).unwrap_or(JsValue::NULL)
        }
    }
}
