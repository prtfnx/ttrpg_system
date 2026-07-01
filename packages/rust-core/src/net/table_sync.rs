use js_sys::Function;
use serde::{Deserialize, Serialize};
use wasm_bindgen::prelude::*;
use web_sys::console;

/// Table synchronization manager for TTRPG web client
/// Handles table data reception and applies authoritative server sprite updates.
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
    #[serde(default = "default_grid_cell_px")]
    pub grid_cell_px: f64,
    #[serde(default = "default_cell_distance")]
    pub cell_distance: f64,
    #[serde(default = "default_distance_unit")]
    pub distance_unit: String,
    pub layers: std::collections::HashMap<String, Vec<SpriteData>>,
}

fn default_grid_cell_px() -> f64 {
    50.0
}
fn default_cell_distance() -> f64 {
    5.0
}
fn default_distance_unit() -> String {
    "ft".to_string()
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
    pub aura_radius_units: Option<f64>,
    #[serde(default)]
    pub aura_color: Option<String>,

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

    // Sprite dimensions
    #[serde(default)]
    pub width: f64,
    #[serde(default)]
    pub height: f64,

    // Obstacle metadata (restored on reconnect for lighting/collision)
    #[serde(default)]
    pub obstacle_type: Option<String>,
    #[serde(default)]
    pub obstacle_data: Option<serde_json::Value>,

    // Generic metadata (JSON string — lights, text sprites, etc.)
    #[serde(default)]
    pub metadata: Option<String>,
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
                "table_name": table_name
            });

            let js_data = serde_wasm_bindgen::to_value(&request_data)?;

            // Call network client's send_table_request method
            let send_method =
                js_sys::Reflect::get(network_client, &JsValue::from_str("send_table_request"))?;
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

        web_sys::console::log_1(
            &format!(
                "Received table data: {} with {} total sprites across {} layers",
                table_data.table_name,
                table_data
                    .layers
                    .values()
                    .map(|sprites| sprites.len())
                    .sum::<usize>(),
                table_data.layers.len()
            )
            .into(),
        );

        // Store current table
        self.table_id = Some(table_data.table_id.clone());
        self.current_table = Some(table_data.clone());

        // Notify callback
        if let Some(ref callback) = self.on_table_received {
            let _ = callback.call1(&JsValue::NULL, table_data_js);
        }

        Ok(())
    }

    /// Handle sprite update received from server
    #[wasm_bindgen]
    pub fn handle_sprite_update(&mut self, update_data_js: &JsValue) -> Result<(), JsValue> {
        let update_data: SpriteUpdateData = serde_wasm_bindgen::from_value(update_data_js.clone())
            .map_err(|e| JsValue::from_str(&format!("Failed to parse sprite update: {}", e)))?;

        console::log_1(
            &format!(
                "Received sprite update: {} type: {}",
                update_data.sprite_id, update_data.update_type
            )
            .into(),
        );

        // Apply the authoritative update from the server.
        if let Some(ref mut table) = self.current_table {
            // Find sprite across all layers
            let mut sprite_found = false;
            for sprites in table.layers.values_mut() {
                if let Some(sprite) = sprites
                    .iter_mut()
                    .find(|s| s.sprite_id == update_data.sprite_id)
                {
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
                                update_data.data.get("scale_y"),
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
                console::warn_1(
                    &format!(
                        "Sprite {} not found in local table state",
                        update_data.sprite_id
                    )
                    .into(),
                );
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

    /// Handle table update errors
    #[wasm_bindgen]
    pub fn handle_error(&self, error_message: &str) {
        if let Some(ref callback) = self.on_error {
            let _ = callback.call1(&JsValue::NULL, &JsValue::from_str(error_message));
        }
        console::error_1(&JsValue::from_str(error_message));
    }
}
