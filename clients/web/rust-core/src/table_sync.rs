use wasm_bindgen::prelude::*;
use serde::{Deserialize, Serialize};
use js_sys::Function;
use std::collections::HashMap;
use web_sys::console;

/// Pending action waiting for server confirmation
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PendingAction {
    pub action_id: String,
    pub sprite_id: String,
    pub action_type: ActionType,
    pub original_state: SpriteState,
    pub new_state: SpriteState,
    pub timestamp: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum ActionType {
    Move,
    Scale,
    Rotate,
    Create,
    Delete,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SpriteState {
    pub coord_x: f64,
    pub coord_y: f64,
    pub scale_x: f64,
    pub scale_y: f64,
    pub rotation: Option<f64>,
}

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
    on_action_reverted: Option<Function>,
    
    // Action confirmation system
    pending_actions: HashMap<String, PendingAction>,
    grace_period_ms: u32,
    next_action_id: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TableData {
    pub table_id: String,
    pub table_name: String,
    #[serde(default)]
    pub name: String, // Legacy compatibility
    pub width: f64,
    pub height: f64,
    pub scale: f64,
    #[serde(default)]
    pub x_moved: f64,
    #[serde(default)]
    pub y_moved: f64,
    #[serde(default)]
    pub show_grid: bool,
    #[serde(default)]
    pub cell_side: f64,
    pub layers: std::collections::HashMap<String, Vec<SpriteData>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SpriteData {
    pub sprite_id: String,
    pub texture_path: String,
    pub coord_x: f64,
    pub coord_y: f64,
    pub scale_x: f64,
    pub scale_y: f64,
    #[serde(default)]
    pub rotation: Option<f64>,
    
    // Character binding (replaces generic 'character' field)
    #[serde(default)]
    pub character_id: Option<String>,
    #[serde(default)]
    pub controlled_by: Option<Vec<i32>>,
    
    // Token stats
    #[serde(default)]
    pub hp: Option<i32>,
    #[serde(default)]
    pub max_hp: Option<i32>,
    #[serde(default)]
    pub ac: Option<i32>,
    #[serde(default)]
    pub aura_radius: Option<f64>,
    
    #[serde(default)]
    pub moving: bool,
    #[serde(default)]
    pub speed: Option<f64>,
    #[serde(default)]
    pub collidable: bool,
    pub layer: String,
    #[serde(default)]
    pub compendium_entity: Option<serde_json::Value>,
    #[serde(default)]
    pub entity_type: Option<String>,
    #[serde(default)]
    pub asset_id: Option<String>,
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
            on_action_reverted: None,
            pending_actions: HashMap::new(),
            grace_period_ms: 5000, // 5 seconds default
            next_action_id: 1,
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

    /// Set action reverted handler
    #[wasm_bindgen]
    pub fn set_action_reverted_handler(&mut self, callback: &Function) {
        self.on_action_reverted = Some(callback.clone());
    }

    /// Set grace period for server confirmations (milliseconds)
    #[wasm_bindgen]
    pub fn set_grace_period(&mut self, ms: u32) {
        self.grace_period_ms = ms;
    }

    /// Request table data from server
    #[wasm_bindgen]
    pub fn request_table(&self, table_name: &str) -> Result<(), JsValue> {
        if let Some(ref network_client) = self.network_client {
            let request_data = serde_json::json!({
                "table_name": table_name
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

        web_sys::console::log_1(&format!("Received table data: {} with {} total sprites across {} layers", 
            table_data.table_name, 
            table_data.layers.values().map(|sprites| sprites.len()).sum::<usize>(),
            table_data.layers.len()).into());

        // Store current table
        self.table_id = Some(table_data.table_id.clone());
        self.current_table = Some(table_data.clone());

        // Notify callback
        if let Some(ref callback) = self.on_table_received {
            let _ = callback.call1(&JsValue::NULL, table_data_js);
        }

        Ok(())
    }

    /// Send sprite move update to server with confirmation tracking
    #[wasm_bindgen]
    pub fn send_sprite_move(&mut self, sprite_id: &str, x: f64, y: f64) -> Result<String, JsValue> {
        let table_id = self.table_id.as_ref()
            .ok_or_else(|| JsValue::from_str("No active table"))?
            .clone();

        // Get current sprite state for potential rollback
        let original_state = self.get_sprite_state(sprite_id)
            .ok_or_else(|| JsValue::from_str("Sprite not found"))?;

        // Apply optimistic update locally
        self.apply_local_sprite_move(sprite_id, x, y)?;

        // Generate action ID
        let action_id = self.generate_action_id();
        
        // Create pending action
        let pending_action = PendingAction {
            action_id: action_id.clone(),
            sprite_id: sprite_id.to_string(),
            action_type: ActionType::Move,
            original_state: original_state.clone(),
            new_state: SpriteState {
                coord_x: x,
                coord_y: y,
                scale_x: original_state.scale_x, // Preserve current scale
                scale_y: original_state.scale_y,
                rotation: original_state.rotation,
            },
            timestamp: js_sys::Date::now(),
        };

        // Send to server first (before storing action to avoid borrow conflicts)
        let update_data = serde_json::json!({
            "category": "sprite",
            "type": "sprite_move",
            "action_id": action_id,
            "data": {
                "sprite_id": sprite_id,
                "table_id": table_id,
                "from": {
                    "x": original_state.coord_x,
                    "y": original_state.coord_y
                },
                "to": {
                    "x": x,
                    "y": y
                }
            }
        });

        self.send_table_update(&update_data)?;

        // Store pending action after sending
        self.pending_actions.insert(action_id.clone(), pending_action);

        // Schedule reversion timeout
        self.schedule_action_timeout(&action_id)?;
        
        Ok(action_id)
    }

    /// Send sprite scale update to server with confirmation tracking
    #[wasm_bindgen]
    pub fn send_sprite_scale(&mut self, sprite_id: &str, scale_x: f64, scale_y: f64) -> Result<String, JsValue> {
        let table_id = self.table_id.as_ref()
            .ok_or_else(|| JsValue::from_str("No active table"))?
            .clone();

        // Get current sprite state for potential rollback
        let original_state = self.get_sprite_state(sprite_id)
            .ok_or_else(|| JsValue::from_str("Sprite not found"))?;

        // Apply optimistic update locally
        self.apply_local_sprite_scale(sprite_id, scale_x, scale_y)?;

        // Generate action ID
        let action_id = self.generate_action_id();
        
        // Create pending action
        let pending_action = PendingAction {
            action_id: action_id.clone(),
            sprite_id: sprite_id.to_string(),
            action_type: ActionType::Scale,
            original_state: original_state.clone(),
            new_state: SpriteState {
                coord_x: original_state.coord_x, // Preserve current position
                coord_y: original_state.coord_y,
                scale_x,
                scale_y,
                rotation: original_state.rotation,
            },
            timestamp: js_sys::Date::now(),
        };

        // Send to server first
        let update_data = serde_json::json!({
            "category": "sprite",
            "type": "sprite_scale",
            "action_id": action_id,
            "data": {
                "sprite_id": sprite_id,
                "table_id": table_id,
                "scale_x": scale_x,
                "scale_y": scale_y
            }
        });

        self.send_table_update(&update_data)?;

        // Store pending action after sending
        self.pending_actions.insert(action_id.clone(), pending_action);

        // Schedule reversion timeout
        self.schedule_action_timeout(&action_id)?;
        
        Ok(action_id)
    }

    /// Send sprite rotation update to server with confirmation tracking
    #[wasm_bindgen]
    pub fn send_sprite_rotate(&mut self, sprite_id: &str, rotation: f64) -> Result<String, JsValue> {
        let table_id = self.table_id.as_ref()
            .ok_or_else(|| JsValue::from_str("No active table"))?
            .clone();

        // Get current sprite state for potential rollback
        let original_state = self.get_sprite_state(sprite_id)
            .ok_or_else(|| JsValue::from_str("Sprite not found"))?;

        // Apply optimistic update locally
        self.apply_local_sprite_rotate(sprite_id, rotation)?;

        // Generate action ID
        let action_id = self.generate_action_id();
        
        // Create pending action
        let pending_action = PendingAction {
            action_id: action_id.clone(),
            sprite_id: sprite_id.to_string(),
            action_type: ActionType::Rotate,
            original_state: original_state.clone(),
            new_state: SpriteState {
                coord_x: original_state.coord_x, // Preserve current position
                coord_y: original_state.coord_y,
                scale_x: original_state.scale_x, // Preserve current scale
                scale_y: original_state.scale_y,
                rotation: Some(rotation),
            },
            timestamp: js_sys::Date::now(),
        };

        // Send to server first
        let update_data = serde_json::json!({
            "category": "sprite",
            "type": "sprite_rotate",
            "action_id": action_id,
            "data": {
                "sprite_id": sprite_id,
                "table_id": table_id,
                "rotation": rotation
            }
        });

        self.send_table_update(&update_data)?;

        // Store pending action after sending
        self.pending_actions.insert(action_id.clone(), pending_action);

        // Schedule reversion timeout
        self.schedule_action_timeout(&action_id)?;
        
        Ok(action_id)
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

    /// Send sprite deletion to server with confirmation tracking
    #[wasm_bindgen]
    pub fn send_sprite_delete(&mut self, sprite_id: &str) -> Result<String, JsValue> {
        let table_id = self.table_id.as_ref()
            .ok_or_else(|| JsValue::from_str("No active table"))?
            .clone();

        // Get current sprite state for potential rollback
        let original_state = self.get_sprite_state(sprite_id)
            .ok_or_else(|| JsValue::from_str("Sprite not found"))?;

        // Apply optimistic update locally (remove sprite)
        self.apply_local_sprite_delete(sprite_id)?;

        // Generate action ID
        let action_id = self.generate_action_id();
        
        // Create pending action
        let pending_action = PendingAction {
            action_id: action_id.clone(),
            sprite_id: sprite_id.to_string(),
            action_type: ActionType::Delete,
            original_state: original_state.clone(),
            new_state: SpriteState {
                coord_x: 0.0,
                coord_y: 0.0,
                scale_x: 0.0,
                scale_y: 0.0,
                rotation: None,
            },
            timestamp: js_sys::Date::now(),
        };

        // Send to server first
        let update_data = serde_json::json!({
            "category": "sprite",
            "type": "sprite_remove",
            "action_id": action_id,
            "data": {
                "sprite_id": sprite_id,
                "table_id": table_id
            }
        });

        self.send_table_update(&update_data)?;

        // Store pending action after sending
        self.pending_actions.insert(action_id.clone(), pending_action);

        // Schedule reversion timeout
        self.schedule_action_timeout(&action_id)?;
        
        Ok(action_id)
    }

    /// Handle sprite update received from server
    #[wasm_bindgen]
    pub fn handle_sprite_update(&mut self, update_data_js: &JsValue) -> Result<(), JsValue> {
        let update_data: SpriteUpdateData = serde_wasm_bindgen::from_value(update_data_js.clone())
            .map_err(|e| JsValue::from_str(&format!("Failed to parse sprite update: {}", e)))?;

        console::log_1(&format!("Received sprite update: {} type: {}", 
            update_data.sprite_id, update_data.update_type).into());

        // Check if this is a confirmation for a pending action
        if let Some(action_id) = update_data.data.get("action_id") {
            if let Some(action_id_str) = action_id.as_str() {
                if self.confirm_action(action_id_str) {
                    console::log_1(&format!("Confirmed action: {}", action_id_str).into());
                    // Don't update local state again since we already applied optimistically
                    return Ok(());
                }
            }
        }

        // This is an update from another client, apply it
        if let Some(ref mut table) = self.current_table {
            // Find sprite across all layers
            let mut sprite_found = false;
            for sprites in table.layers.values_mut() {
                if let Some(sprite) = sprites.iter_mut().find(|s| s.sprite_id == update_data.sprite_id) {
                    sprite_found = true;
                    match update_data.update_type.as_str() {
                        "sprite_move" => {
                            if let Some(to) = update_data.data.get("to") {
                                if let (Some(x), Some(y)) = (to.get("x"), to.get("y")) {
                                    sprite.coord_x = x.as_f64().unwrap_or(sprite.coord_x);
                                    sprite.coord_y = y.as_f64().unwrap_or(sprite.coord_y);
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
                                sprite.rotation = rotation.as_f64();
                            }
                        }
                        _ => {}
                    }
                    break;
                }
            }
            if !sprite_found {
                console::warn_1(&format!("Sprite {} not found in local table state", update_data.sprite_id).into());
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

    /// Get sprites from current table (flattened from all layers)
    #[wasm_bindgen]
    pub fn get_sprites(&self) -> JsValue {
        if let Some(ref table) = self.current_table {
            let all_sprites: Vec<&SpriteData> = table.layers.values().flatten().collect();
            serde_wasm_bindgen::to_value(&all_sprites).unwrap_or(JsValue::NULL)
        } else {
            serde_wasm_bindgen::to_value(&Vec::<SpriteData>::new()).unwrap_or(JsValue::NULL)
        }
    }

    /// Get sprites by layer
    #[wasm_bindgen]
    pub fn get_sprites_by_layer(&self, layer_name: &str) -> JsValue {
        if let Some(ref table) = self.current_table {
            if let Some(sprites) = table.layers.get(layer_name) {
                serde_wasm_bindgen::to_value(sprites).unwrap_or(JsValue::NULL)
            } else {
                serde_wasm_bindgen::to_value(&Vec::<SpriteData>::new()).unwrap_or(JsValue::NULL)
            }
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
        console::error_1(&JsValue::from_str(error_message));
    }

    /// Confirm action completion from server
    #[wasm_bindgen]
    pub fn confirm_action(&mut self, action_id: &str) -> bool {
        if self.pending_actions.remove(action_id).is_some() {
            console::log_1(&format!("Action confirmed: {}", action_id).into());
            true
        } else {
            console::warn_1(&format!("Attempted to confirm unknown action: {}", action_id).into());
            false
        }
    }

    /// Revert action due to timeout or server rejection
    #[wasm_bindgen]
    pub fn revert_action(&mut self, action_id: &str) -> Result<(), JsValue> {
        if let Some(pending_action) = self.pending_actions.remove(action_id) {
            console::warn_1(&format!("Reverting action: {} for sprite: {}", 
                action_id, pending_action.sprite_id).into());

            // Revert sprite to original state
            match pending_action.action_type {
                ActionType::Move => {
                    self.apply_local_sprite_move(
                        &pending_action.sprite_id,
                        pending_action.original_state.coord_x,
                        pending_action.original_state.coord_y,
                    )?;
                }
                ActionType::Scale => {
                    self.apply_local_sprite_scale(
                        &pending_action.sprite_id,
                        pending_action.original_state.scale_x,
                        pending_action.original_state.scale_y,
                    )?;
                }
                ActionType::Rotate => {
                    if let Some(rotation) = pending_action.original_state.rotation {
                        self.apply_local_sprite_rotate(&pending_action.sprite_id, rotation)?;
                    }
                }
                _ => {
                    console::warn_1(&format!("Cannot revert action type: {:?}", pending_action.action_type).into());
                }
            }

            // Notify callback
            if let Some(ref callback) = self.on_action_reverted {
                let revert_data = serde_json::json!({
                    "action_id": action_id,
                    "sprite_id": pending_action.sprite_id,
                    "action_type": format!("{:?}", pending_action.action_type),
                    "original_state": pending_action.original_state
                });
                let js_data = serde_wasm_bindgen::to_value(&revert_data)?;
                let _ = callback.call1(&JsValue::NULL, &js_data);
            }

            Ok(())
        } else {
            Err(JsValue::from_str(&format!("Action not found: {}", action_id)))
        }
    }

    /// Check for timed out actions and revert them
    #[wasm_bindgen]
    pub fn check_timeouts(&mut self) -> Result<(), JsValue> {
        let current_time = js_sys::Date::now();
        let mut expired_actions = Vec::new();

        for (action_id, pending_action) in &self.pending_actions {
            if current_time - pending_action.timestamp > self.grace_period_ms as f64 {
                expired_actions.push(action_id.clone());
            }
        }

        for action_id in expired_actions {
            self.revert_action(&action_id)?;
        }

        Ok(())
    }

    /// Get current sprite state for rollback purposes
    fn get_sprite_state(&self, sprite_id: &str) -> Option<SpriteState> {
        if let Some(ref table) = self.current_table {
            for sprites in table.layers.values() {
                if let Some(sprite) = sprites.iter().find(|s| s.sprite_id == sprite_id) {
                    return Some(SpriteState {
                        coord_x: sprite.coord_x,
                        coord_y: sprite.coord_y,
                        scale_x: sprite.scale_x,
                        scale_y: sprite.scale_y,
                        rotation: sprite.rotation,
                    });
                }
            }
        }
        None
    }

    /// Apply local sprite movement optimistically
    fn apply_local_sprite_move(&mut self, sprite_id: &str, x: f64, y: f64) -> Result<(), JsValue> {
        if let Some(ref mut table) = self.current_table {
            for sprites in table.layers.values_mut() {
                if let Some(sprite) = sprites.iter_mut().find(|s| s.sprite_id == sprite_id) {
                    sprite.coord_x = x;
                    sprite.coord_y = y;
                    return Ok(());
                }
            }
        }
        Err(JsValue::from_str("Sprite not found for local move"))
    }

    /// Apply local sprite scaling optimistically
    fn apply_local_sprite_scale(&mut self, sprite_id: &str, scale_x: f64, scale_y: f64) -> Result<(), JsValue> {
        if let Some(ref mut table) = self.current_table {
            for sprites in table.layers.values_mut() {
                if let Some(sprite) = sprites.iter_mut().find(|s| s.sprite_id == sprite_id) {
                    sprite.scale_x = scale_x;
                    sprite.scale_y = scale_y;
                    return Ok(());
                }
            }
        }
        Err(JsValue::from_str("Sprite not found for local scale"))
    }

    /// Apply local sprite rotation optimistically
    fn apply_local_sprite_rotate(&mut self, sprite_id: &str, rotation: f64) -> Result<(), JsValue> {
        if let Some(ref mut table) = self.current_table {
            for sprites in table.layers.values_mut() {
                if let Some(sprite) = sprites.iter_mut().find(|s| s.sprite_id == sprite_id) {
                    sprite.rotation = Some(rotation);
                    return Ok(());
                }
            }
        }
        Err(JsValue::from_str("Sprite not found for local rotate"))
    }

    /// Apply local sprite deletion optimistically
    fn apply_local_sprite_delete(&mut self, sprite_id: &str) -> Result<(), JsValue> {
        if let Some(ref mut table) = self.current_table {
            for sprites in table.layers.values_mut() {
                if let Some(index) = sprites.iter().position(|s| s.sprite_id == sprite_id) {
                    sprites.remove(index);
                    return Ok(());
                }
            }
        }
        Err(JsValue::from_str("Sprite not found for local delete"))
    }

    /// Generate unique action ID
    fn generate_action_id(&mut self) -> String {
        let id = format!("action_{}", self.next_action_id);
        self.next_action_id += 1;
        id
    }

    /// Schedule action timeout using JavaScript setTimeout
    fn schedule_action_timeout(&self, action_id: &str) -> Result<(), JsValue> {
        let window = web_sys::window().ok_or_else(|| JsValue::from_str("No window object"))?;
        
        // Create a closure that will revert the action
        let action_id_clone = action_id.to_string();
        let timeout_closure = wasm_bindgen::closure::Closure::wrap(Box::new(move || {
            // Note: In a real implementation, you would need to maintain a reference
            // to the TableSync instance to call revert_action. This is a simplified approach.
            console::warn_1(&format!("Action timeout: {}", action_id_clone).into());
        }) as Box<dyn FnMut()>);

        window.set_timeout_with_callback_and_timeout_and_arguments_0(
            timeout_closure.as_ref().unchecked_ref(),
            self.grace_period_ms as i32,
        )?;

        // Prevent the closure from being dropped
        timeout_closure.forget();

        Ok(())
    }
}
