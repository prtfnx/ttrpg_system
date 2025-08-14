use wasm_bindgen::prelude::*;
use wasm_bindgen::JsCast;
use web_sys::{WebSocket, MessageEvent, CloseEvent, ErrorEvent};
use serde::{Deserialize, Serialize};
use js_sys::Function;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum MessageType {
    // Core messages
    Ping,
    Pong,
    Error,
    Success,
    Welcome,

    // Authentication messages
    AuthRegister,
    AuthLogin,
    AuthLogout,
    AuthToken,
    AuthStatus,
    
    // Table sync
    NewTableRequest,
    NewTableResponse,
    TableRequest,
    TableResponse,
    TableData,
    TableUpdate,
    TableScale,
    TableMove,
    TableListRequest,
    TableListResponse,
    TableDelete,
    
    // Player actions
    PlayerAction,
    PlayerActionResponse,
    PlayerActionUpdate,
    PlayerActionRemove,
    PlayerLeft,
    PlayerJoined,
    PlayerReady,
    PlayerUnready,
    PlayerStatus,
    PlayerListRequest,
    PlayerListResponse,
    PlayerKickRequest,
    PlayerBanRequest,
    PlayerKickResponse,
    PlayerBanResponse,
    ConnectionStatusRequest,
    ConnectionStatusResponse,

    // Sprite sync
    SpriteRequest,
    SpriteResponse,
    SpriteData,
    SpriteUpdate,
    SpriteRemove,
    SpriteCreate,
    SpriteMove,
    SpriteScale,
    SpriteRotate,
    
    // File transfer
    FileRequest,
    FileData,
    
    // Asset Management
    AssetUploadRequest,
    AssetUploadResponse,
    AssetDownloadRequest,
    AssetDownloadResponse,
    AssetListRequest,
    AssetListResponse,
    AssetUploadConfirm,
    AssetDeleteRequest,
    AssetDeleteResponse,
    AssetHashCheck,

    // Compendium operations
    CompendiumSpriteAdd,
    CompendiumSpriteUpdate,
    CompendiumSpriteRemove,
    
    // Character management
    CharacterSaveRequest,
    CharacterSaveResponse,
    CharacterLoadRequest,
    CharacterLoadResponse,
    CharacterListRequest,
    CharacterListResponse,
    CharacterDeleteRequest,
    CharacterDeleteResponse,
    
    // Extension point
    Custom,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NetworkMessage {
    pub message_type: MessageType,
    pub data: serde_json::Value,
    pub timestamp: f64,
    pub client_id: Option<String>,
    pub user_id: Option<u32>,
    pub session_code: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SpriteNetworkData {
    pub sprite_id: String,
    pub layer_name: String,
    pub world_x: f64,
    pub world_y: f64,
    pub width: f64,
    pub height: f64,
    pub rotation: f64,
    pub texture_name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TableNetworkData {
    pub table_id: String,
    pub changes: serde_json::Value,
}

#[derive(Debug, Clone)]
pub enum ConnectionState {
    Disconnected,
    Connecting,
}

#[wasm_bindgen]
pub struct NetworkClient {
    websocket: Option<WebSocket>,
    connection_state: ConnectionState,
    client_id: String,
    user_id: Option<u32>,
    username: Option<String>,
    session_code: Option<String>,
    jwt_token: Option<String>,
    
    // Event handlers
    on_message_callback: Option<Function>,
    on_connection_change_callback: Option<Function>,
    on_error_callback: Option<Function>,
}

#[wasm_bindgen]
impl NetworkClient {
    #[wasm_bindgen(constructor)]
    pub fn new() -> NetworkClient {
        let client_id = format!("{}{}", js_sys::Date::now() as u64, (js_sys::Math::random() * 1000.0) as u32);
        
        NetworkClient {
            websocket: None,
            connection_state: ConnectionState::Disconnected,
            client_id,
            user_id: None,
            username: None,
            session_code: None,
            jwt_token: None,
            on_message_callback: None,
            on_connection_change_callback: None,
            on_error_callback: None,
        }
    }

    #[wasm_bindgen]
    pub fn set_message_handler(&mut self, callback: &Function) {
        self.on_message_callback = Some(callback.clone());
    }

    #[wasm_bindgen]
    pub fn set_connection_handler(&mut self, callback: &Function) {
        self.on_connection_change_callback = Some(callback.clone());
    }

    #[wasm_bindgen]
    pub fn set_error_handler(&mut self, callback: &Function) {
        self.on_error_callback = Some(callback.clone());
    }

    #[wasm_bindgen]
    pub fn connect(&mut self, url: &str) -> Result<(), JsValue> {
        self.connection_state = ConnectionState::Connecting;
        self.notify_connection_change();

        let websocket = WebSocket::new(url)?;
        
        // Store client_id for use in closures
        let client_id = self.client_id.clone();
        
        // Set up onopen handler
        let on_open_client_id = client_id.clone();
        let on_connection_change = self.on_connection_change_callback.clone();
        let onopen = Closure::wrap(Box::new(move |_event: web_sys::Event| {
            web_sys::console::log_1(&format!("WebSocket connected - Client ID: {}", on_open_client_id).into());
            if let Some(ref callback) = on_connection_change {
                let _ = callback.call2(&JsValue::NULL, &JsValue::from_str("connected"), &JsValue::NULL);
            }
        }) as Box<dyn FnMut(_)>);
        websocket.set_onopen(Some(onopen.as_ref().unchecked_ref()));
        onopen.forget();

        // Set up onmessage handler
        let on_message_callback = self.on_message_callback.clone();
        let onmessage = Closure::wrap(Box::new(move |event: MessageEvent| {
            if let Ok(text) = event.data().dyn_into::<js_sys::JsString>() {
                let message_str = text.as_string().unwrap_or_default();
                
                // Parse the message
                match serde_json::from_str::<NetworkMessage>(&message_str) {
                    Ok(network_message) => {
                        if let Some(ref callback) = on_message_callback {
                            let message_type = format!("{:?}", network_message.message_type).to_lowercase();
                            let data = serde_wasm_bindgen::to_value(&network_message.data).unwrap_or(JsValue::NULL);
                            let _ = callback.call2(&JsValue::NULL, &JsValue::from_str(&message_type), &data);
                        }
                    }
                    Err(e) => {
                        web_sys::console::error_1(&format!("Failed to parse message: {}", e).into());
                    }
                }
            }
        }) as Box<dyn FnMut(_)>);
        websocket.set_onmessage(Some(onmessage.as_ref().unchecked_ref()));
        onmessage.forget();

        // Set up onerror handler
        let on_error_callback = self.on_error_callback.clone();
        let onerror = Closure::wrap(Box::new(move |event: ErrorEvent| {
            let error_msg = format!("WebSocket error: {:?}", event);
            web_sys::console::error_1(&error_msg.clone().into());
            if let Some(ref callback) = on_error_callback {
                let _ = callback.call1(&JsValue::NULL, &JsValue::from_str(&error_msg));
            }
        }) as Box<dyn FnMut(_)>);
        websocket.set_onerror(Some(onerror.as_ref().unchecked_ref()));
        onerror.forget();

        // Set up onclose handler
        let on_close_connection_change = self.on_connection_change_callback.clone();
        let onclose = Closure::wrap(Box::new(move |event: CloseEvent| {
            let close_msg = format!("WebSocket closed: code={}, reason={}", event.code(), event.reason());
            web_sys::console::log_1(&close_msg.clone().into());
            if let Some(ref callback) = on_close_connection_change {
                let _ = callback.call2(&JsValue::NULL, &JsValue::from_str("disconnected"), &JsValue::from_str(&close_msg));
            }
        }) as Box<dyn FnMut(_)>);
        websocket.set_onclose(Some(onclose.as_ref().unchecked_ref()));
        onclose.forget();

        self.websocket = Some(websocket);
        Ok(())
    }

    #[wasm_bindgen]
    pub fn disconnect(&mut self) {
        if let Some(ref websocket) = self.websocket {
            let _ = websocket.close();
        }
        self.websocket = None;
        self.connection_state = ConnectionState::Disconnected;
        self.notify_connection_change();
    }

    #[wasm_bindgen]
    pub fn send_message(&self, message_type: &str, data: &JsValue) -> Result<(), JsValue> {
        let websocket = self.websocket.as_ref()
            .ok_or_else(|| JsValue::from_str("Not connected"))?;

        let msg_type = self.parse_message_type(message_type)?;
        let message_data = serde_wasm_bindgen::from_value(data.clone())
            .map_err(|e| JsValue::from_str(&format!("Invalid data format: {}", e)))?;

        let message = NetworkMessage {
            message_type: msg_type,
            data: message_data,
            timestamp: js_sys::Date::now(),
            client_id: Some(self.client_id.clone()),
            user_id: self.user_id,
            session_code: self.session_code.clone(),
        };

        let message_json = serde_json::to_string(&message)
            .map_err(|e| JsValue::from_str(&format!("Serialization error: {}", e)))?;
        
        websocket.send_with_str(&message_json)?;
        Ok(())
    }

    #[wasm_bindgen]
    pub fn send_sprite_update(&self, sprite_data: &JsValue) -> Result<(), JsValue> {
        self.send_message("sprite_update", sprite_data)
    }

    #[wasm_bindgen]
    pub fn send_sprite_create(&self, sprite_data: &JsValue) -> Result<(), JsValue> {
        self.send_message("sprite_create", sprite_data)
    }

    #[wasm_bindgen]
    pub fn send_sprite_remove(&self, sprite_id: &str) -> Result<(), JsValue> {
        let data = serde_json::json!({ "sprite_id": sprite_id });
        let js_data = serde_wasm_bindgen::to_value(&data)?;
        self.send_message("sprite_remove", &js_data)
    }

    #[wasm_bindgen]
    pub fn send_table_update(&self, table_data: &JsValue) -> Result<(), JsValue> {
        self.send_message("table_update", table_data)
    }

    #[wasm_bindgen]
    pub fn send_table_request(&self, request_data: &JsValue) -> Result<(), JsValue> {
        self.send_message("table_request", request_data)
    }

    #[wasm_bindgen]
    pub fn send_new_table_request(&self, table_name: &str) -> Result<(), JsValue> {
        let data = serde_json::json!({ "table_name": table_name });
        let js_data = serde_wasm_bindgen::to_value(&data)?;
        self.send_message("new_table_request", &js_data)
    }

    #[wasm_bindgen]
    pub fn send_ping(&self) -> Result<(), JsValue> {
        let data = serde_json::json!({ "timestamp": js_sys::Date::now() });
        let js_data = serde_wasm_bindgen::to_value(&data)?;
        self.send_message("ping", &js_data)
    }

    #[wasm_bindgen]
    pub fn authenticate(&self, username: &str, password: &str) -> Result<(), JsValue> {
        let data = serde_json::json!({
            "username": username,
            "password": password
        });
        let js_data = serde_wasm_bindgen::to_value(&data)?;
        self.send_message("auth_login", &js_data)
    }

    #[wasm_bindgen]
    pub fn join_session(&self, session_code: &str) -> Result<(), JsValue> {
        let data = serde_json::json!({ "session_code": session_code });
        let js_data = serde_wasm_bindgen::to_value(&data)?;
        self.send_message("table_request", &js_data)
    }

    #[wasm_bindgen]
    pub fn request_table_list(&self) -> Result<(), JsValue> {
        let data = serde_json::json!({});
        let js_data = serde_wasm_bindgen::to_value(&data)?;
        self.send_message("table_list_request", &js_data)
    }

    #[wasm_bindgen]
    pub fn request_player_list(&self) -> Result<(), JsValue> {
        let data = serde_json::json!({});
        let js_data = serde_wasm_bindgen::to_value(&data)?;
        self.send_message("player_list_request", &js_data)
    }

    // Asset management methods
    #[wasm_bindgen]
    pub fn request_asset_upload(&self, filename: &str, file_hash: &str, file_size: u64) -> Result<(), JsValue> {
        let data = serde_json::json!({
            "filename": filename,
            "file_hash": file_hash,
            "file_size": file_size
        });
        let js_data = serde_wasm_bindgen::to_value(&data)?;
        self.send_message("asset_upload_request", &js_data)
    }

    #[wasm_bindgen]
    pub fn request_asset_download(&self, asset_id: &str) -> Result<(), JsValue> {
        let data = serde_json::json!({ "asset_id": asset_id });
        let js_data = serde_wasm_bindgen::to_value(&data)?;
        self.send_message("asset_download_request", &js_data)
    }

    #[wasm_bindgen]
    pub fn confirm_asset_upload(&self, asset_id: &str, upload_success: bool) -> Result<(), JsValue> {
        let data = serde_json::json!({
            "asset_id": asset_id,
            "upload_success": upload_success
        });
        let js_data = serde_wasm_bindgen::to_value(&data)?;
        self.send_message("asset_upload_confirm", &js_data)
    }

    // Connection state getters
    #[wasm_bindgen]
    pub fn is_connected(&self) -> bool {
        matches!(self.connection_state, ConnectionState::Connecting)
    }

    #[wasm_bindgen]
    pub fn get_connection_state(&self) -> String {
        match &self.connection_state {
            ConnectionState::Disconnected => "disconnected".to_string(),
            ConnectionState::Connecting => "connecting".to_string(),
        }
    }

    #[wasm_bindgen]
    pub fn get_client_id(&self) -> String {
        self.client_id.clone()
    }

    #[wasm_bindgen]
    pub fn get_username(&self) -> Option<String> {
        self.username.clone()
    }

    #[wasm_bindgen]
    pub fn get_session_code(&self) -> Option<String> {
        self.session_code.clone()
    }

    #[wasm_bindgen]
    pub fn set_user_info(&mut self, user_id: u32, username: &str, session_code: Option<String>, jwt_token: Option<String>) {
        self.user_id = Some(user_id);
        self.username = Some(username.to_string());
        self.session_code = session_code;
        self.jwt_token = jwt_token;
    }

    // Private helper methods
    fn notify_connection_change(&self) {
        if let Some(ref callback) = self.on_connection_change_callback {
            let state = self.get_connection_state();
            let _ = callback.call2(&JsValue::NULL, &JsValue::from_str(&state), &JsValue::NULL);
        }
    }

    fn parse_message_type(&self, type_str: &str) -> Result<MessageType, JsValue> {
        match type_str {
            "ping" => Ok(MessageType::Ping),
            "pong" => Ok(MessageType::Pong),
            "error" => Ok(MessageType::Error),
            "success" => Ok(MessageType::Success),
            "welcome" => Ok(MessageType::Welcome),
            "auth_register" => Ok(MessageType::AuthRegister),
            "auth_login" => Ok(MessageType::AuthLogin),
            "auth_logout" => Ok(MessageType::AuthLogout),
            "auth_token" => Ok(MessageType::AuthToken),
            "auth_status" => Ok(MessageType::AuthStatus),
            "new_table_request" => Ok(MessageType::NewTableRequest),
            "new_table_response" => Ok(MessageType::NewTableResponse),
            "table_request" => Ok(MessageType::TableRequest),
            "table_response" => Ok(MessageType::TableResponse),
            "table_data" => Ok(MessageType::TableData),
            "table_update" => Ok(MessageType::TableUpdate),
            "table_scale" => Ok(MessageType::TableScale),
            "table_move" => Ok(MessageType::TableMove),
            "table_list_request" => Ok(MessageType::TableListRequest),
            "table_list_response" => Ok(MessageType::TableListResponse),
            "table_delete" => Ok(MessageType::TableDelete),
            "player_action" => Ok(MessageType::PlayerAction),
            "player_action_response" => Ok(MessageType::PlayerActionResponse),
            "player_action_update" => Ok(MessageType::PlayerActionUpdate),
            "player_action_remove" => Ok(MessageType::PlayerActionRemove),
            "player_left" => Ok(MessageType::PlayerLeft),
            "player_joined" => Ok(MessageType::PlayerJoined),
            "player_ready" => Ok(MessageType::PlayerReady),
            "player_unready" => Ok(MessageType::PlayerUnready),
            "player_status" => Ok(MessageType::PlayerStatus),
            "player_list_request" => Ok(MessageType::PlayerListRequest),
            "player_list_response" => Ok(MessageType::PlayerListResponse),
            "player_kick_request" => Ok(MessageType::PlayerKickRequest),
            "player_ban_request" => Ok(MessageType::PlayerBanRequest),
            "player_kick_response" => Ok(MessageType::PlayerKickResponse),
            "player_ban_response" => Ok(MessageType::PlayerBanResponse),
            "connection_status_request" => Ok(MessageType::ConnectionStatusRequest),
            "connection_status_response" => Ok(MessageType::ConnectionStatusResponse),
            "sprite_request" => Ok(MessageType::SpriteRequest),
            "sprite_response" => Ok(MessageType::SpriteResponse),
            "sprite_data" => Ok(MessageType::SpriteData),
            "sprite_update" => Ok(MessageType::SpriteUpdate),
            "sprite_remove" => Ok(MessageType::SpriteRemove),
            "sprite_create" => Ok(MessageType::SpriteCreate),
            "sprite_move" => Ok(MessageType::SpriteMove),
            "sprite_scale" => Ok(MessageType::SpriteScale),
            "sprite_rotate" => Ok(MessageType::SpriteRotate),
            "file_request" => Ok(MessageType::FileRequest),
            "file_data" => Ok(MessageType::FileData),
            "asset_upload_request" => Ok(MessageType::AssetUploadRequest),
            "asset_upload_response" => Ok(MessageType::AssetUploadResponse),
            "asset_download_request" => Ok(MessageType::AssetDownloadRequest),
            "asset_download_response" => Ok(MessageType::AssetDownloadResponse),
            "asset_list_request" => Ok(MessageType::AssetListRequest),
            "asset_list_response" => Ok(MessageType::AssetListResponse),
            "asset_upload_confirm" => Ok(MessageType::AssetUploadConfirm),
            "asset_delete_request" => Ok(MessageType::AssetDeleteRequest),
            "asset_delete_response" => Ok(MessageType::AssetDeleteResponse),
            "asset_hash_check" => Ok(MessageType::AssetHashCheck),
            "compendium_sprite_add" => Ok(MessageType::CompendiumSpriteAdd),
            "compendium_sprite_update" => Ok(MessageType::CompendiumSpriteUpdate),
            "compendium_sprite_remove" => Ok(MessageType::CompendiumSpriteRemove),
            "character_save_request" => Ok(MessageType::CharacterSaveRequest),
            "character_save_response" => Ok(MessageType::CharacterSaveResponse),
            "character_load_request" => Ok(MessageType::CharacterLoadRequest),
            "character_load_response" => Ok(MessageType::CharacterLoadResponse),
            "character_list_request" => Ok(MessageType::CharacterListRequest),
            "character_list_response" => Ok(MessageType::CharacterListResponse),
            "character_delete_request" => Ok(MessageType::CharacterDeleteRequest),
            "character_delete_response" => Ok(MessageType::CharacterDeleteResponse),
            _ => Ok(MessageType::Custom),
        }
    }
}
