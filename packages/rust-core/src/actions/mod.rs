mod table_ops;
mod sprite_ops;

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
    pub(crate) tables: HashMap<String, TableInfo>,
    pub(crate) sprites: HashMap<String, SpriteInfo>,
    pub(crate) layer_visibility: HashMap<String, bool>,
    
    // History management
    pub(crate) action_history: Vec<ActionHistoryEntry>,
    pub(crate) undo_stack: Vec<ActionHistoryEntry>,
    pub(crate) redo_stack: Vec<ActionHistoryEntry>,
    pub(crate) max_history: usize,
    
    // Network integration
    pub(crate) network_client: Option<NetworkClient>,
    pub(crate) auto_sync: bool,
    
    // Event handlers
    pub(crate) on_action_callback: Option<Function>,
    pub(crate) on_state_change_callback: Option<Function>,
    pub(crate) on_error_callback: Option<Function>,
}

#[wasm_bindgen]
impl ActionsClient {
    #[wasm_bindgen(constructor)]
    pub fn new() -> ActionsClient {
        let mut layer_visibility = HashMap::new();
        
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

    #[wasm_bindgen]
    pub fn set_error_handler(&mut self, callback: &Function) {
        self.on_error_callback = Some(callback.clone());
    }

    #[wasm_bindgen]
    pub fn set_network_client(&mut self, network_client: &NetworkClient) {
        self.network_client = Some(network_client.clone());
        self.auto_sync = true;
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

    // Undo/Redo System
    #[wasm_bindgen]
    pub fn undo(&mut self) -> JsValue {
        if let Some(action) = self.undo_stack.pop() {
            self.redo_stack.push(action.clone());
            
            let success = self.execute_undo(&action);
            
            let result = ActionResult {
                success,
                message: if success { "Undo successful".to_string() } else { "Undo failed".to_string() },
                data: None,
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
            
            let success = self.execute_redo(&action);
            
            let result = ActionResult {
                success,
                message: if success { "Redo successful".to_string() } else { "Redo failed".to_string() },
                data: None,
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
}

// Private helper methods
impl ActionsClient {
    pub(crate) fn generate_id(&self) -> String {
        format!("{}{}", js_sys::Date::now() as u64, (js_sys::Math::random() * 1000.0) as u32)
    }

    pub(crate) fn add_to_history(&mut self, action: ActionHistoryEntry) {
        self.action_history.push(action.clone());
        
        if self.action_history.len() > self.max_history {
            self.action_history.remove(0);
        }
        
        if action.reversible {
            self.undo_stack.push(action);
            self.redo_stack.clear();
        }
    }

    fn execute_undo(&mut self, action: &ActionHistoryEntry) -> bool {
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

    pub(crate) fn notify_state_change(&self, event_type: &str, target_id: &str) {
        if let Some(ref callback) = self.on_state_change_callback {
            let _ = callback.call2(
                &JsValue::NULL,
                &JsValue::from_str(event_type),
                &JsValue::from_str(target_id),
            );
        }
    }

    pub(crate) fn sync_table_create(&self, table_info: &TableInfo) {
        web_sys::console::log_1(&format!("Syncing table create: {}", table_info.table_id).into());
    }

    pub(crate) fn sync_table_delete(&self, table_id: &str) {
        web_sys::console::log_1(&format!("Syncing table delete: {}", table_id).into());
    }

    pub(crate) fn sync_table_update(&self, table_id: &str, _updates: &JsValue) {
        web_sys::console::log_1(&format!("Syncing table update: {}", table_id).into());
    }

    pub(crate) fn sync_sprite_create(&self, table_id: &str, sprite_info: &SpriteInfo) {
        web_sys::console::log_1(&format!("Syncing sprite create: {} in table {}", sprite_info.sprite_id, table_id).into());
    }

    pub(crate) fn sync_sprite_delete(&self, sprite_id: &str) {
        web_sys::console::log_1(&format!("Syncing sprite delete: {}", sprite_id).into());
    }

    pub(crate) fn sync_sprite_update(&self, sprite_id: &str, _updates: &JsValue) {
        web_sys::console::log_1(&format!("Syncing sprite update: {}", sprite_id).into());
    }
}

#[cfg(test)]
mod tests {
    use super::{ActionResult, TableInfo, SpriteInfo};
    use crate::types::{Position, Size};

    #[test]
    fn action_result_success() {
        let r = ActionResult { success: true, message: "ok".into(), data: None };
        assert!(r.success);
        assert_eq!(r.message, "ok");
    }

    #[test]
    fn action_result_failure() {
        let r = ActionResult { success: false, message: "err".into(), data: None };
        assert!(!r.success);
    }

    #[test]
    fn table_info_serde_roundtrip() {
        let t = TableInfo {
            table_id: "t1".into(), name: "Dungeon".into(),
            width: 100.0, height: 200.0,
            scale_x: 1.0, scale_y: 1.0,
            offset_x: 0.0, offset_y: 0.0,
        };
        let json = serde_json::to_string(&t).unwrap();
        let t2: TableInfo = serde_json::from_str(&json).unwrap();
        assert_eq!(t.table_id, t2.table_id);
        assert_eq!(t.width, t2.width);
    }

    #[test]
    fn sprite_info_serde_roundtrip() {
        let s = SpriteInfo {
            sprite_id: "s1".into(), layer: "tokens".into(),
            position: Position { x: 10.0, y: 20.0 },
            size: Size { width: 50.0, height: 50.0 },
            rotation: 0.0, texture_name: "goblin.png".into(), visible: true,
        };
        let json = serde_json::to_string(&s).unwrap();
        let s2: SpriteInfo = serde_json::from_str(&json).unwrap();
        assert_eq!(s.sprite_id, s2.sprite_id);
        assert!(s2.visible);
    }
}
