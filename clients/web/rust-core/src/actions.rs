use wasm_bindgen::prelude::*;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use js_sys::Function;
use crate::types::{Position, Size};
use crate::network::NetworkClient;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ActionResult {
    pub success: bool,
    pub message: String,
    pub data: Option<serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TableInfo {
    pub table_id: String,
    pub name: String,
    pub width: f64,
    pub height: f64,
    pub scale_x: f64,
    pub scale_y: f64,
    pub offset_x: f64,
    pub offset_y: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SpriteInfo {
    pub sprite_id: String,
    pub layer: String,
    pub position: Position,
    pub size: Size,
    pub rotation: f64,
    pub texture_name: String,
    pub visible: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ActionHistoryEntry {
    pub action_type: String,
    pub timestamp: f64,
    pub data: serde_json::Value,
    pub reversible: bool,
}

#[wasm_bindgen]
pub struct ActionsClient {
    // Core state
    tables: HashMap<String, TableInfo>,
    sprites: HashMap<String, SpriteInfo>,
    layer_visibility: HashMap<String, bool>,
    
    // History management
    action_history: Vec<ActionHistoryEntry>,
    undo_stack: Vec<ActionHistoryEntry>,
    redo_stack: Vec<ActionHistoryEntry>,
    max_history: usize,
    
    // Network integration
    network_client: Option<NetworkClient>,
    auto_sync: bool,
    
    // Event handlers
    on_action_callback: Option<Function>,
    on_state_change_callback: Option<Function>,
    on_error_callback: Option<Function>,
}

#[wasm_bindgen]
impl ActionsClient {
    #[wasm_bindgen(constructor)]
    pub fn new() -> ActionsClient {
        let mut layer_visibility = HashMap::new();
        
        // Initialize default layer visibility (matching desktop LAYERS)
        layer_visibility.insert("map".to_string(), true);
        layer_visibility.insert("tokens".to_string(), true);
        layer_visibility.insert("dungeon_master".to_string(), true);
        layer_visibility.insert("light".to_string(), true);
        layer_visibility.insert("height".to_string(), true);
        layer_visibility.insert("obstacles".to_string(), true);
        layer_visibility.insert("fog_of_war".to_string(), true);
        
        ActionsClient {
            tables: HashMap::new(),
            sprites: HashMap::new(),
            layer_visibility,
            action_history: Vec::new(),
            undo_stack: Vec::new(),
            redo_stack: Vec::new(),
            max_history: 100,
            network_client: None,
            auto_sync: true,
            on_action_callback: None,
            on_state_change_callback: None,
            on_error_callback: None,
        }
    }

    // Event handler setters
    #[wasm_bindgen]
    pub fn set_action_handler(&mut self, callback: &Function) {
        self.on_action_callback = Some(callback.clone());
    }

    #[wasm_bindgen]
    pub fn set_state_change_handler(&mut self, callback: &Function) {
        self.on_state_change_callback = Some(callback.clone());
    }

    // Internal getter for state change callback
    pub(crate) fn get_state_change_callback(&self) -> &Option<Function> {
        &self.on_state_change_callback
    }

    #[wasm_bindgen]
    pub fn set_error_handler(&mut self, callback: &Function) {
        self.on_error_callback = Some(callback.clone());
    }

    #[wasm_bindgen]
    pub fn set_network_client(&mut self, network_client: &NetworkClient) {
        // Store a clone of the network client for action synchronization
        self.network_client = Some(network_client.clone());
        self.auto_sync = true;
        
        // Log network client connection
        web_sys::console::log_1(&"ActionsClient: Network client connected for action sync".into());
    }

    #[wasm_bindgen] 
    pub fn disconnect_network_client(&mut self) {
        self.network_client = None;
        self.auto_sync = false;
        web_sys::console::log_1(&"ActionsClient: Network client disconnected".into());
    }

    #[wasm_bindgen]
    pub fn is_network_connected(&self) -> bool {
        self.network_client.is_some()
    }

    #[wasm_bindgen]
    pub fn set_auto_sync(&mut self, enabled: bool) {
        self.auto_sync = enabled;
    }

    // Table Management
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
            // Remove all sprites from this table
            self.sprites.retain(|_, _sprite| {
                // In a full implementation, we'd have table_id in sprite info
                true // For now, keep all sprites
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
            // Apply updates from JavaScript object
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

    // Sprite Management
    #[wasm_bindgen]
    pub fn create_sprite(&mut self, table_id: &str, layer: &str, position: &JsValue, texture_name: &str) -> JsValue {
        let sprite_id = self.generate_id();
        
        let pos = serde_wasm_bindgen::from_value::<Position>(position.clone())
            .unwrap_or(Position { x: 0.0, y: 0.0 });

        let sprite_info = SpriteInfo {
            sprite_id: sprite_id.clone(),
            layer: layer.to_string(),
            position: pos,
            size: Size { width: 64.0, height: 64.0 }, // Default size
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
            // Apply updates from JavaScript object
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
            
            // Sync with network if auto_sync is enabled and network client is available
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

    // Undo/Redo System
    #[wasm_bindgen]
    pub fn undo(&mut self) -> JsValue {
        if let Some(action) = self.undo_stack.pop() {
            self.redo_stack.push(action.clone());
            
            // Implement undo logic based on action type
            let success = self.execute_undo(&action);
            
            let result = ActionResult {
                success,
                message: if success {
                    format!("Undid action: {}", action.action_type)
                } else {
                    "Failed to undo action".to_string()
                },
                data: Some(serde_json::to_value(&action).unwrap_or(serde_json::Value::Null)),
            };

            self.notify_state_change("action_undone", &action.action_type);
            serde_wasm_bindgen::to_value(&result).unwrap_or(JsValue::NULL)
        } else {
            let result = ActionResult {
                success: false,
                message: "No actions to undo".to_string(),
                data: None,
            };

            serde_wasm_bindgen::to_value(&result).unwrap_or(JsValue::NULL)
        }
    }

    #[wasm_bindgen]
    pub fn redo(&mut self) -> JsValue {
        if let Some(action) = self.redo_stack.pop() {
            self.undo_stack.push(action.clone());
            
            // Implement redo logic based on action type
            let success = self.execute_redo(&action);
            
            let result = ActionResult {
                success,
                message: if success {
                    format!("Redid action: {}", action.action_type)
                } else {
                    "Failed to redo action".to_string()
                },
                data: Some(serde_json::to_value(&action).unwrap_or(serde_json::Value::Null)),
            };

            self.notify_state_change("action_redone", &action.action_type);
            serde_wasm_bindgen::to_value(&result).unwrap_or(JsValue::NULL)
        } else {
            let result = ActionResult {
                success: false,
                message: "No actions to redo".to_string(),
                data: None,
            };

            serde_wasm_bindgen::to_value(&result).unwrap_or(JsValue::NULL)
        }
    }

    // Query Methods
    #[wasm_bindgen]
    pub fn get_table_info(&self, table_id: &str) -> JsValue {
        if let Some(table_info) = self.tables.get(table_id) {
            serde_wasm_bindgen::to_value(table_info).unwrap_or(JsValue::NULL)
        } else {
            JsValue::NULL
        }
    }

    #[wasm_bindgen]
    pub fn get_sprite_info(&self, sprite_id: &str) -> JsValue {
        if let Some(sprite_info) = self.sprites.get(sprite_id) {
            serde_wasm_bindgen::to_value(sprite_info).unwrap_or(JsValue::NULL)
        } else {
            JsValue::NULL
        }
    }

    #[wasm_bindgen]
    pub fn get_all_tables(&self) -> JsValue {
        let tables: Vec<&TableInfo> = self.tables.values().collect();
        serde_wasm_bindgen::to_value(&tables).unwrap_or(JsValue::NULL)
    }

    #[wasm_bindgen]
    pub fn get_sprites_by_layer(&self, layer: &str) -> JsValue {
        let sprites: Vec<&SpriteInfo> = self.sprites.values()
            .filter(|sprite| sprite.layer == layer)
            .collect();
        serde_wasm_bindgen::to_value(&sprites).unwrap_or(JsValue::NULL)
    }

    #[wasm_bindgen]
    pub fn get_action_history(&self) -> JsValue {
        serde_wasm_bindgen::to_value(&self.action_history).unwrap_or(JsValue::NULL)
    }

    #[wasm_bindgen]
    pub fn can_undo(&self) -> bool {
        !self.undo_stack.is_empty()
    }

    #[wasm_bindgen]
    pub fn can_redo(&self) -> bool {
        !self.redo_stack.is_empty()
    }

    // Private helper methods
    fn generate_id(&self) -> String {
        format!("{}{}", js_sys::Date::now() as u64, (js_sys::Math::random() * 1000.0) as u32)
    }

    fn add_to_history(&mut self, action: ActionHistoryEntry) {
        self.action_history.push(action.clone());
        
        if self.action_history.len() > self.max_history {
            self.action_history.remove(0);
        }
        
        if action.reversible {
            self.undo_stack.push(action);
            self.redo_stack.clear(); // Clear redo stack when new action is performed
        }
    }

    fn execute_undo(&mut self, action: &ActionHistoryEntry) -> bool {
        // Simplified undo implementation
        // In a full implementation, this would reverse the specific action
        match action.action_type.as_str() {
            "create_table" => {
                if let Some(table_info) = action.data.as_object() {
                    if let Some(table_id) = table_info.get("table_id").and_then(|v| v.as_str()) {
                        return self.tables.remove(table_id).is_some();
                    }
                }
            }
            "delete_table" => {
                if let Ok(table_info) = serde_json::from_value::<TableInfo>(action.data.clone()) {
                    self.tables.insert(table_info.table_id.clone(), table_info);
                    return true;
                }
            }
            _ => {}
        }
        false
    }

    fn execute_redo(&mut self, action: &ActionHistoryEntry) -> bool {
        // Simplified redo implementation
        // In a full implementation, this would re-execute the specific action
        match action.action_type.as_str() {
            "create_table" => {
                if let Ok(table_info) = serde_json::from_value::<TableInfo>(action.data.clone()) {
                    self.tables.insert(table_info.table_id.clone(), table_info);
                    return true;
                }
            }
            "delete_table" => {
                if let Some(table_info) = action.data.as_object() {
                    if let Some(table_id) = table_info.get("table_id").and_then(|v| v.as_str()) {
                        return self.tables.remove(table_id).is_some();
                    }
                }
            }
            _ => {}
        }
        false
    }

    fn notify_state_change(&self, event_type: &str, target_id: &str) {
        if let Some(ref callback) = self.on_state_change_callback {
            let _ = callback.call2(
                &JsValue::NULL,
                &JsValue::from_str(event_type),
                &JsValue::from_str(target_id),
            );
        }
    }

    // Network sync methods (placeholder implementations)
    fn sync_table_create(&self, table_info: &TableInfo) {
        // In a full implementation, this would use the NetworkClient
        web_sys::console::log_1(&format!("Syncing table create: {}", table_info.table_id).into());
    }

    fn sync_table_delete(&self, table_id: &str) {
        web_sys::console::log_1(&format!("Syncing table delete: {}", table_id).into());
    }

    fn sync_table_update(&self, table_id: &str, _updates: &JsValue) {
        web_sys::console::log_1(&format!("Syncing table update: {}", table_id).into());
    }

    fn sync_sprite_create(&self, table_id: &str, sprite_info: &SpriteInfo) {
        web_sys::console::log_1(&format!("Syncing sprite create: {} in table {}", sprite_info.sprite_id, table_id).into());
    }

    fn sync_sprite_delete(&self, sprite_id: &str) {
        web_sys::console::log_1(&format!("Syncing sprite delete: {}", sprite_id).into());
    }

    fn sync_sprite_update(&self, sprite_id: &str, _updates: &JsValue) {
        web_sys::console::log_1(&format!("Syncing sprite update: {}", sprite_id).into());
    }
}
