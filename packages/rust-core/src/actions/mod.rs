mod sprite_ops;
mod table_ops;

use crate::types::{Position, Size};
use js_sys::Function;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use wasm_bindgen::prelude::*;

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

#[derive(Clone, Serialize, Deserialize)]
struct LocalActionState {
    tables: HashMap<String, TableInfo>,
    sprites: HashMap<String, SpriteInfo>,
    layer_visibility: HashMap<String, bool>,
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
    pub(crate) history_suspended: bool,

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
            history_suspended: false,
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

    // Undo/Redo System
    #[wasm_bindgen]
    pub fn undo(&mut self) -> JsValue {
        if let Some(action) = self.undo_stack.last().cloned() {
            let success = self.execute_undo(&action);
            if success {
                self.undo_stack.pop();
                self.redo_stack.push(action.clone());
            }

            let result = ActionResult {
                success,
                message: if success {
                    "Undo successful".to_string()
                } else {
                    "Undo failed".to_string()
                },
                data: None,
            };

            if success {
                self.notify_state_change("action_undone", &action.action_type);
            }
            serialize_for_js(&result).unwrap_or(JsValue::NULL)
        } else {
            let result = ActionResult {
                success: false,
                message: "No actions to undo".to_string(),
                data: None,
            };

            serialize_for_js(&result).unwrap_or(JsValue::NULL)
        }
    }

    #[wasm_bindgen]
    pub fn redo(&mut self) -> JsValue {
        if let Some(action) = self.redo_stack.last().cloned() {
            let success = self.execute_redo(&action);
            if success {
                self.redo_stack.pop();
                self.undo_stack.push(action.clone());
            }

            let result = ActionResult {
                success,
                message: if success {
                    "Redo successful".to_string()
                } else {
                    "Redo failed".to_string()
                },
                data: None,
            };

            if success {
                self.notify_state_change("action_redone", &action.action_type);
            }
            serialize_for_js(&result).unwrap_or(JsValue::NULL)
        } else {
            let result = ActionResult {
                success: false,
                message: "No actions to redo".to_string(),
                data: None,
            };

            serialize_for_js(&result).unwrap_or(JsValue::NULL)
        }
    }

    // Query Methods
    #[wasm_bindgen]
    pub fn get_table_info(&self, table_id: &str) -> JsValue {
        if let Some(table_info) = self.tables.get(table_id) {
            serialize_for_js(table_info).unwrap_or(JsValue::NULL)
        } else {
            JsValue::NULL
        }
    }

    #[wasm_bindgen]
    pub fn get_sprite_info(&self, sprite_id: &str) -> JsValue {
        if let Some(sprite_info) = self.sprites.get(sprite_id) {
            serialize_for_js(sprite_info).unwrap_or(JsValue::NULL)
        } else {
            JsValue::NULL
        }
    }

    #[wasm_bindgen]
    pub fn get_all_tables(&self) -> JsValue {
        let tables: Vec<&TableInfo> = self.tables.values().collect();
        serialize_for_js(&tables).unwrap_or(JsValue::NULL)
    }

    #[wasm_bindgen]
    pub fn get_sprites_by_layer(&self, layer: &str) -> JsValue {
        let sprites: Vec<&SpriteInfo> = self
            .sprites
            .values()
            .filter(|sprite| sprite.layer == layer)
            .collect();
        serialize_for_js(&sprites).unwrap_or(JsValue::NULL)
    }

    #[wasm_bindgen]
    pub fn get_action_history(&self) -> JsValue {
        serialize_for_js(&self.action_history).unwrap_or(JsValue::NULL)
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
        format!(
            "{}{}",
            js_sys::Date::now() as u64,
            (js_sys::Math::random() * 1000.0) as u32
        )
    }

    pub(crate) fn add_to_history(&mut self, action: ActionHistoryEntry) {
        if self.history_suspended {
            return;
        }
        self.action_history.push(action.clone());

        if self.action_history.len() > self.max_history {
            self.action_history.remove(0);
        }

        if action.reversible {
            self.undo_stack.push(action);
            if self.undo_stack.len() > self.max_history {
                self.undo_stack.remove(0);
            }
            self.redo_stack.clear();
        }
    }

    fn execute_undo(&mut self, action: &ActionHistoryEntry) -> bool {
        self.apply_history_action(action, true)
    }

    fn execute_redo(&mut self, action: &ActionHistoryEntry) -> bool {
        self.apply_history_action(action, false)
    }

    fn apply_history_action(&mut self, action: &ActionHistoryEntry, undo: bool) -> bool {
        let from = if undo { "new_values" } else { "old_values" };
        let to = if undo { "old_values" } else { "new_values" };
        match action.action_type.as_str() {
            "batch" => {
                let (Ok(old), Ok(new)) = (
                    serde_json::from_value::<LocalActionState>(action.data[from].clone()),
                    serde_json::from_value::<LocalActionState>(action.data[to].clone()),
                ) else {
                    return false;
                };
                if serde_json::to_value(self.local_state()).ok() != serde_json::to_value(old).ok() {
                    return false;
                }
                self.restore_local_state(new);
                true
            }
            "create_table" | "delete_table" => {
                let Ok(value) = serde_json::from_value::<TableInfo>(action.data.clone()) else {
                    return false;
                };
                let remove = (action.action_type == "create_table") == undo;
                change_record(
                    &mut self.tables,
                    &value.table_id,
                    remove.then_some(&value),
                    (!remove).then_some(&value),
                )
            }
            "update_table" => {
                change_serialized_record(&mut self.tables, &action.data, "table_id", from, to)
            }
            "create_sprite" | "delete_sprite" => {
                let data = if action.action_type == "create_sprite" {
                    &action.data["sprite_info"]
                } else {
                    &action.data
                };
                let Ok(value) = serde_json::from_value::<SpriteInfo>(data.clone()) else {
                    return false;
                };
                let remove = (action.action_type == "create_sprite") == undo;
                change_record(
                    &mut self.sprites,
                    &value.sprite_id,
                    remove.then_some(&value),
                    (!remove).then_some(&value),
                )
            }
            "update_sprite" => {
                change_serialized_record(&mut self.sprites, &action.data, "sprite_id", from, to)
            }
            "move_sprite_to_layer" => {
                let (Some(id), Some(old), Some(new)) = (
                    action.data["sprite_id"].as_str(),
                    action.data[if undo { "new_layer" } else { "old_layer" }].as_str(),
                    action.data[if undo { "old_layer" } else { "new_layer" }].as_str(),
                ) else {
                    return false;
                };
                let Some(sprite) = self.sprites.get_mut(id) else {
                    return false;
                };
                if sprite.layer != old {
                    return false;
                }
                sprite.layer = new.to_owned();
                true
            }
            "set_layer_visibility" => {
                let (Some(layer), Some(old), Some(new)) = (
                    action.data["layer"].as_str(),
                    action.data[if undo {
                        "new_visibility"
                    } else {
                        "old_visibility"
                    }]
                    .as_bool(),
                    action.data[if undo {
                        "old_visibility"
                    } else {
                        "new_visibility"
                    }]
                    .as_bool(),
                ) else {
                    return false;
                };
                if self.layer_visibility.get(layer).copied().unwrap_or(true) != old {
                    return false;
                }
                self.layer_visibility.insert(layer.to_owned(), new);
                true
            }
            _ => false,
        }
    }

    pub(crate) fn notify_state_change(&self, event_type: &str, target_id: &str) {
        if self.history_suspended {
            return;
        }
        if let Some(ref callback) = self.on_state_change_callback {
            let _ = callback.call2(
                &JsValue::NULL,
                &JsValue::from_str(event_type),
                &JsValue::from_str(target_id),
            );
        }
    }

    fn local_state(&self) -> LocalActionState {
        LocalActionState {
            tables: self.tables.clone(),
            sprites: self.sprites.clone(),
            layer_visibility: self.layer_visibility.clone(),
        }
    }

    fn restore_local_state(&mut self, state: LocalActionState) {
        self.tables = state.tables;
        self.sprites = state.sprites;
        self.layer_visibility = state.layer_visibility;
    }
}

fn change_record<T: Serialize + Clone>(
    map: &mut HashMap<String, T>,
    id: &str,
    expected: Option<&T>,
    replacement: Option<&T>,
) -> bool {
    // Compare the precondition before mutation. Failed history must not overwrite
    // subsequent state or advance the undo/redo stacks.
    if map.get(id).map(|value| serde_json::to_value(value).ok())
        != expected.map(|value| serde_json::to_value(value).ok())
    {
        return false;
    }
    match replacement {
        Some(value) => {
            map.insert(id.to_owned(), value.clone());
        }
        None => {
            map.remove(id);
        }
    }
    true
}

fn serialize_for_js<T: Serialize>(value: &T) -> Result<JsValue, serde_wasm_bindgen::Error> {
    value.serialize(&serde_wasm_bindgen::Serializer::json_compatible())
}

fn change_serialized_record<T: Serialize + Clone + serde::de::DeserializeOwned>(
    map: &mut HashMap<String, T>,
    data: &serde_json::Value,
    id_key: &str,
    from: &str,
    to: &str,
) -> bool {
    let (Some(id), Ok(old), Ok(new)) = (
        data[id_key].as_str(),
        serde_json::from_value::<T>(data[from].clone()),
        serde_json::from_value::<T>(data[to].clone()),
    ) else {
        return false;
    };
    change_record(map, id, Some(&old), Some(&new))
}

#[cfg(test)]
mod tests {
    use super::{ActionHistoryEntry, ActionResult, ActionsClient, SpriteInfo, TableInfo};
    use crate::types::{Position, Size};

    #[test]
    fn action_result_success() {
        let r = ActionResult {
            success: true,
            message: "ok".into(),
            data: None,
        };
        assert!(r.success);
        assert_eq!(r.message, "ok");
    }

    #[test]
    fn action_result_failure() {
        let r = ActionResult {
            success: false,
            message: "err".into(),
            data: None,
        };
        assert!(!r.success);
    }

    #[test]
    fn table_info_serde_roundtrip() {
        let t = TableInfo {
            table_id: "t1".into(),
            name: "Dungeon".into(),
            width: 100.0,
            height: 200.0,
            scale_x: 1.0,
            scale_y: 1.0,
            offset_x: 0.0,
            offset_y: 0.0,
        };
        let json = serde_json::to_string(&t).unwrap();
        let t2: TableInfo = serde_json::from_str(&json).unwrap();
        assert_eq!(t.table_id, t2.table_id);
        assert_eq!(t.width, t2.width);
    }

    #[test]
    fn sprite_info_serde_roundtrip() {
        let s = SpriteInfo {
            sprite_id: "s1".into(),
            layer: "tokens".into(),
            position: Position { x: 10.0, y: 20.0 },
            size: Size {
                width: 50.0,
                height: 50.0,
            },
            rotation: 0.0,
            texture_name: "goblin.png".into(),
            visible: true,
        };
        let json = serde_json::to_string(&s).unwrap();
        let s2: SpriteInfo = serde_json::from_str(&json).unwrap();
        assert_eq!(s.sprite_id, s2.sprite_id);
        assert!(s2.visible);
    }

    #[wasm_bindgen_test::wasm_bindgen_test]
    fn history_rejects_conflicts_and_unknown_actions_without_mutation() {
        let mut client = ActionsClient::new();
        let table = TableInfo {
            table_id: "t".into(),
            name: "original".into(),
            width: 100.0,
            height: 100.0,
            scale_x: 1.0,
            scale_y: 1.0,
            offset_x: 0.0,
            offset_y: 0.0,
        };
        let action = ActionHistoryEntry {
            action_type: "create_table".into(),
            timestamp: 0.0,
            data: serde_json::to_value(&table).unwrap(),
            reversible: true,
        };
        client.tables.insert(
            "t".into(),
            TableInfo {
                name: "changed".into(),
                ..table
            },
        );
        assert!(!client.execute_undo(&action));
        assert_eq!(client.tables["t"].name, "changed");
        assert!(!client.execute_redo(&action));
        assert!(!client.execute_undo(&ActionHistoryEntry {
            action_type: "unknown".into(),
            ..action
        }));
    }

    #[wasm_bindgen_test::wasm_bindgen_test]
    fn history_stacks_are_bounded_and_entries_are_independent() {
        let mut client = ActionsClient::new();
        for index in 0..150 {
            client.add_to_history(ActionHistoryEntry {
                action_type: "test".into(),
                timestamp: 0.0,
                data: serde_json::json!({"index": index}),
                reversible: true,
            });
        }
        assert_eq!(client.action_history.len(), 100);
        assert_eq!(client.undo_stack.len(), 100);
        assert_eq!(client.undo_stack[0].data["index"], 50);
    }
}
