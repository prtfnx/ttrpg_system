use wasm_bindgen::prelude::*;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use js_sys::Function;
use crate::types::{Position, Size};

/// Table synchronization manager for TTRPG web client
/// Handles table data reception from server and bidirectional sprite updates
#[wasm_bindgen]
pub struct TableSync {
    // Table state
    current_table: Option<TableData>,
    table_id: Option<String>,
    
    // Network integration
    network_client: Option<js_sys::Object>,
    
    // Event callbacks
    on_table_received: Option<Function>,
    on_sprite_update: Option<Function>,
    on_error: Option<Function>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TableData {
    pub table_id: String,
    pub table_name: String,
    pub width: f64,
    pub height: f64,
    pub scale_x: f64,
    pub scale_y: f64,
    pub offset_x: f64,
    pub offset_y: f64,
    pub sprites: Vec<SpriteData>,
    pub fog_rectangles: Vec<FogRectangle>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SpriteData {
    pub sprite_id: String,
    pub name: String,
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
    pub scale_x: f64,
    pub scale_y: f64,
    pub rotation: f64,
    pub layer: String,
    pub texture_path: String,
    pub color: String,
    pub visible: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FogRectangle {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
    pub hidden: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SpriteUpdateData {
    pub sprite_id: String,
    pub table_id: String,
    pub update_type: String,
    pub data: serde_json::Value,
}

#[wasm_bindgen]
impl TableSync {
    #[wasm_bindgen(constructor)]
    pub fn new() -> Self {
        Self {
            current_table: None,
            table_id: None,
            network_client: None,
            on_table_received: None,
            on_sprite_update: None,
            on_error: None,
        }
    }

    /// Set the network client for sending messages
    #[wasm_bindgen]
    pub fn set_network_client(&mut self, network_client: &js_sys::Object) {
        self.network_client = Some(network_client.clone());
    }

    /// Set callback for when table data is received
    #[wasm_bindgen]
    pub fn set_table_received_handler(&mut self, callback: &Function) {
        self.on_table_received = Some(callback.clone());
    }

    /// Set callback for sprite updates
    #[wasm_bindgen]
    pub fn set_sprite_update_handler(&mut self, callback: &Function) {
        self.on_sprite_update = Some(callback.clone());
    }

    /// Set error handler
    #[wasm_bindgen]
    pub fn set_error_handler(&mut self, callback: &Function) {
        self.on_error = Some(callback.clone());
    }

    /// Request table data from server
    #[wasm_bindgen]
    pub fn request_table(&self, table_name: &str) -> Result<(), JsValue> {
        if let Some(ref network_client) = self.network_client {
            let request_data = serde_json::json!({
                "name": table_name,
                "session_code": null,
                "user_id": null,
                "username": null
            });

            let js_data = serde_wasm_bindgen::to_value(&request_data)?;
            
            // Call network client's send_table_request method
            let send_method = js_sys::Reflect::get(network_client, &JsValue::from_str("send_table_request"))?;
            if let Ok(send_fn) = send_method.dyn_into::<Function>() {
                send_fn.call1(network_client, &js_data)?;
            } else {
                return Err(JsValue::from_str("send_table_request method not found"));
            }
        } else {
            return Err(JsValue::from_str("Network client not set"));
        }

        Ok(())
    }

    /// Handle table data received from server
    #[wasm_bindgen]
    pub fn handle_table_data(&mut self, table_data_js: &JsValue) -> Result<(), JsValue> {
        // Parse table data from server
        let table_data: TableData = serde_wasm_bindgen::from_value(table_data_js.clone())
            .map_err(|e| JsValue::from_str(&format!("Failed to parse table data: {}", e)))?;

        web_sys::console::log_1(&format!("Received table data: {} with {} sprites", 
            table_data.table_name, table_data.sprites.len()).into());

        // Store current table
        self.table_id = Some(table_data.table_id.clone());
        self.current_table = Some(table_data.clone());

        // Notify callback
        if let Some(ref callback) = self.on_table_received {
            let _ = callback.call1(&JsValue::NULL, table_data_js);
        }

        Ok(())
    }

    /// Send sprite move update to server
    #[wasm_bindgen]
    pub fn send_sprite_move(&self, sprite_id: &str, x: f64, y: f64) -> Result<(), JsValue> {
        let table_id = self.table_id.as_ref()
            .ok_or_else(|| JsValue::from_str("No active table"))?;

        let update_data = serde_json::json!({
            "category": "sprite",
            "type": "sprite_move",
            "data": {
                "sprite_id": sprite_id,
                "table_id": table_id,
                "to": {
                    "x": x,
                    "y": y
                }
            }
        });

        self.send_table_update(&update_data)
    }

    /// Send sprite scale update to server
    #[wasm_bindgen]
    pub fn send_sprite_scale(&self, sprite_id: &str, scale_x: f64, scale_y: f64) -> Result<(), JsValue> {
        let table_id = self.table_id.as_ref()
            .ok_or_else(|| JsValue::from_str("No active table"))?;

        let update_data = serde_json::json!({
            "category": "sprite",
            "type": "sprite_scale",
            "data": {
                "sprite_id": sprite_id,
                "table_id": table_id,
                "scale_x": scale_x,
                "scale_y": scale_y
            }
        });

        self.send_table_update(&update_data)
    }

    /// Send sprite rotation update to server
    #[wasm_bindgen]
    pub fn send_sprite_rotate(&self, sprite_id: &str, rotation: f64) -> Result<(), JsValue> {
        let table_id = self.table_id.as_ref()
            .ok_or_else(|| JsValue::from_str("No active table"))?;

        let update_data = serde_json::json!({
            "category": "sprite",
            "type": "sprite_rotate",
            "data": {
                "sprite_id": sprite_id,
                "table_id": table_id,
                "rotation": rotation
            }
        });

        self.send_table_update(&update_data)
    }

    /// Send sprite creation to server
    #[wasm_bindgen]
    pub fn send_sprite_create(&self, sprite_data_js: &JsValue) -> Result<(), JsValue> {
        let table_id = self.table_id.as_ref()
            .ok_or_else(|| JsValue::from_str("No active table"))?;

        let sprite_data: SpriteData = serde_wasm_bindgen::from_value(sprite_data_js.clone())
            .map_err(|e| JsValue::from_str(&format!("Invalid sprite data: {}", e)))?;

        let update_data = serde_json::json!({
            "category": "sprite",
            "type": "sprite_create",
            "data": {
                "table_id": table_id,
                "sprite_data": sprite_data
            }
        });

        self.send_table_update(&update_data)
    }

    /// Send sprite deletion to server
    #[wasm_bindgen]
    pub fn send_sprite_delete(&self, sprite_id: &str) -> Result<(), JsValue> {
        let table_id = self.table_id.as_ref()
            .ok_or_else(|| JsValue::from_str("No active table"))?;

        let update_data = serde_json::json!({
            "category": "sprite",
            "type": "sprite_remove",
            "data": {
                "sprite_id": sprite_id,
                "table_id": table_id
            }
        });

        self.send_table_update(&update_data)
    }

    /// Handle sprite update received from server
    #[wasm_bindgen]
    pub fn handle_sprite_update(&mut self, update_data_js: &JsValue) -> Result<(), JsValue> {
        let update_data: SpriteUpdateData = serde_wasm_bindgen::from_value(update_data_js.clone())
            .map_err(|e| JsValue::from_str(&format!("Failed to parse sprite update: {}", e)))?;

        web_sys::console::log_1(&format!("Received sprite update: {} type: {}", 
            update_data.sprite_id, update_data.update_type).into());

        // Update local table state if we have it
        if let Some(ref mut table) = self.current_table {
            if let Some(sprite) = table.sprites.iter_mut().find(|s| s.sprite_id == update_data.sprite_id) {
                match update_data.update_type.as_str() {
                    "sprite_move" => {
                        if let Some(to) = update_data.data.get("to") {
                            if let (Some(x), Some(y)) = (to.get("x"), to.get("y")) {
                                sprite.x = x.as_f64().unwrap_or(sprite.x);
                                sprite.y = y.as_f64().unwrap_or(sprite.y);
                            }
                        }
                    }
                    "sprite_scale" => {
                        if let (Some(scale_x), Some(scale_y)) = (
                            update_data.data.get("scale_x"), 
                            update_data.data.get("scale_y")
                        ) {
                            sprite.scale_x = scale_x.as_f64().unwrap_or(sprite.scale_x);
                            sprite.scale_y = scale_y.as_f64().unwrap_or(sprite.scale_y);
                        }
                    }
                    "sprite_rotate" => {
                        if let Some(rotation) = update_data.data.get("rotation") {
                            sprite.rotation = rotation.as_f64().unwrap_or(sprite.rotation);
                        }
                    }
                    _ => {}
                }
            }
        }

        // Notify callback
        if let Some(ref callback) = self.on_sprite_update {
            let _ = callback.call1(&JsValue::NULL, update_data_js);
        }

        Ok(())
    }

    /// Get current table data
    #[wasm_bindgen]
    pub fn get_table_data(&self) -> JsValue {
        if let Some(ref table) = self.current_table {
            serde_wasm_bindgen::to_value(table).unwrap_or(JsValue::NULL)
        } else {
            JsValue::NULL
        }
    }

    /// Get current table ID
    #[wasm_bindgen]
    pub fn get_table_id(&self) -> Option<String> {
        self.table_id.clone()
    }

    /// Get sprites from current table
    #[wasm_bindgen]
    pub fn get_sprites(&self) -> JsValue {
        if let Some(ref table) = self.current_table {
            serde_wasm_bindgen::to_value(&table.sprites).unwrap_or(JsValue::NULL)
        } else {
            serde_wasm_bindgen::to_value(&Vec::<SpriteData>::new()).unwrap_or(JsValue::NULL)
        }
    }

    /// Helper method to send table update via network client
    fn send_table_update(&self, update_data: &serde_json::Value) -> Result<(), JsValue> {
        if let Some(ref network_client) = self.network_client {
            let js_data = serde_wasm_bindgen::to_value(update_data)?;
            
            // Call network client's send_table_update method
            let send_method = js_sys::Reflect::get(network_client, &JsValue::from_str("send_table_update"))?;
            if let Ok(send_fn) = send_method.dyn_into::<Function>() {
                send_fn.call1(network_client, &js_data)?;
            } else {
                return Err(JsValue::from_str("send_table_update method not found"));
            }
        } else {
            return Err(JsValue::from_str("Network client not set"));
        }

        Ok(())
    }

    /// Handle table update errors
    #[wasm_bindgen]
    pub fn handle_error(&self, error_message: &str) {
        if let Some(ref callback) = self.on_error {
            let _ = callback.call1(&JsValue::NULL, &JsValue::from_str(error_message));
        }
        web_sys::console::error_1(&JsValue::from_str(error_message));
    }
}
