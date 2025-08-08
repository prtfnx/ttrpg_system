use wasm_bindgen::prelude::*;
use web_sys::{WebSocket, MessageEvent, CloseEvent, ErrorEvent};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use crate::types::*;

// Message types matching the desktop client protocol
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum MessageType {
    // Core messages
    Ping,
    Pong,
    Error,
    Success,
    Welcome,
    
    // Authentication
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
    
    // Asset management
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
    
    // Custom
    Custom,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NetworkMessage {
    pub message_type: MessageType,
    pub data: serde_json::Value,
    pub timestamp: Option<u64>,
    pub user_id: Option<u32>,
    pub session_code: Option<String>,
}

pub type MessageHandler = Box<dyn FnMut(&NetworkMessage)>;

#[wasm_bindgen]
pub struct NetworkClient {
    websocket: Option<WebSocket>,
    connection_state: ConnectionState,
    message_queue: Vec<NetworkMessage>,
    session_code: Option<String>,
    user_id: Option<u32>,
    jwt_token: Option<String>,
    handlers: HashMap<String, Box<dyn FnMut(&NetworkMessage)>>,
}

#[wasm_bindgen]
impl NetworkClient {
    #[wasm_bindgen(constructor)]
    pub fn new() -> NetworkClient {
        NetworkClient {
            websocket: None,
            connection_state: ConnectionState::Disconnected,
            message_queue: Vec::new(),
            session_code: None,
            user_id: None,
            jwt_token: None,
            handlers: HashMap::new(),
        }
    }

    #[wasm_bindgen]
    pub fn connect(&mut self, url: &str, session_code: &str, jwt_token: &str) -> Result<(), JsValue> {
        let ws_url = format!("{}?session_code={}&token={}", url, session_code, jwt_token);
        let ws = WebSocket::new(&ws_url)?;
        
        self.session_code = Some(session_code.to_string());
        self.jwt_token = Some(jwt_token.to_string());
        self.connection_state = ConnectionState::Connecting;
        
        // Set up event handlers using Rc/RefCell for shared ownership
        let self_ptr = std::ptr::addr_of_mut!(*self) as usize;
        
        // onopen handler
        let onopen_callback = Closure::wrap(Box::new(move |_| {
            web_sys::console::log_1(&"WebSocket connection opened".into());
            // TODO: Update connection state to Connected
        }) as Box<dyn FnMut(JsValue)>);
        ws.set_onopen(Some(onopen_callback.as_ref().unchecked_ref()));
        onopen_callback.forget();
        
        // onmessage handler
        let onmessage_callback = Closure::wrap(Box::new(move |e: MessageEvent| {
            if let Ok(msg) = e.data().dyn_into::<js_sys::JsString>() {
                let message_str: String = msg.into();
                web_sys::console::log_1(&format!("Received message: {}", message_str).into());
                
                // Parse the message
                if let Ok(message) = serde_json::from_str::<NetworkMessage>(&message_str) {
                    // For now, just log the parsed message
                    web_sys::console::log_1(&format!("Parsed message type: {:?}", message.message_type).into());
                    // TODO: Dispatch to handlers
                } else {
                    web_sys::console::log_1(&"Failed to parse message".into());
                }
            }
        }) as Box<dyn FnMut(MessageEvent)>);
        ws.set_onmessage(Some(onmessage_callback.as_ref().unchecked_ref()));
        onmessage_callback.forget();
        
        // onerror handler
        let onerror_callback = Closure::wrap(Box::new(move |e: ErrorEvent| {
            web_sys::console::log_1(&format!("WebSocket error: {:?}", e).into());
        }) as Box<dyn FnMut(ErrorEvent)>);
        ws.set_onerror(Some(onerror_callback.as_ref().unchecked_ref()));
        onerror_callback.forget();
        
        // onclose handler
        let onclose_callback = Closure::wrap(Box::new(move |e: CloseEvent| {
            web_sys::console::log_1(&format!("WebSocket closed: code={}, reason={}", e.code(), e.reason()).into());
        }) as Box<dyn FnMut(CloseEvent)>);
        ws.set_onclose(Some(onclose_callback.as_ref().unchecked_ref()));
        onclose_callback.forget();
        
        self.websocket = Some(ws);
        Ok(())
    }

    #[wasm_bindgen]
    pub fn disconnect(&mut self) {
        if let Some(ws) = &self.websocket {
            let _ = ws.close();
        }
        self.websocket = None;
        self.connection_state = ConnectionState::Disconnected;
    }

    #[wasm_bindgen]
    pub fn send_message(&self, message_type: &str, data: &JsValue) -> Result<(), JsValue> {
        if let Some(ws) = &self.websocket {
            // Parse message type
            let msg_type: MessageType = serde_json::from_str(&format!("\"{}\"", message_type))
                .map_err(|e| JsValue::from_str(&format!("Invalid message type: {}", e)))?;
            
            // Convert JsValue to serde_json::Value
            let data_value: serde_json::Value = data.into_serde()
                .map_err(|e| JsValue::from_str(&format!("Failed to serialize data: {}", e)))?;
            
            let message = NetworkMessage {
                message_type: msg_type,
                data: data_value,
                timestamp: Some(js_sys::Date::now() as u64),
                user_id: self.user_id,
                session_code: self.session_code.clone(),
            };
            
            let message_str = serde_json::to_string(&message)
                .map_err(|e| JsValue::from_str(&format!("Failed to serialize message: {}", e)))?;
            
            ws.send_with_str(&message_str)?;
        } else {
            return Err(JsValue::from_str("WebSocket not connected"));
        }
        Ok(())
    }

    #[wasm_bindgen]
    pub fn get_connection_state(&self) -> String {
        match self.connection_state {
            ConnectionState::Disconnected => "disconnected".to_string(),
            ConnectionState::Connecting => "connecting".to_string(),
            ConnectionState::Connected => "connected".to_string(),
            ConnectionState::Error => "error".to_string(),
        }
    }

    #[wasm_bindgen]
    pub fn is_connected(&self) -> bool {
        matches!(self.connection_state, ConnectionState::Connected)
    }

    // Send common message types
    #[wasm_bindgen]
    pub fn send_ping(&self) -> Result<(), JsValue> {
        self.send_message("ping", &JsValue::from_serde(&serde_json::json!({})).unwrap())
    }

    #[wasm_bindgen]
    pub fn send_table_request(&self, table_id: &str) -> Result<(), JsValue> {
        let data = serde_json::json!({
            "table_id": table_id
        });
        self.send_message("table_request", &JsValue::from_serde(&data).unwrap())
    }

    #[wasm_bindgen]
    pub fn send_sprite_update(&self, sprite_id: &str, x: f64, y: f64, width: f64, height: f64) -> Result<(), JsValue> {
        let data = serde_json::json!({
            "sprite_id": sprite_id,
            "x": x,
            "y": y,
            "width": width,
            "height": height
        });
        self.send_message("sprite_update", &JsValue::from_serde(&data).unwrap())
    }
}
            }
        }) as Box<dyn FnMut(MessageEvent)>);
        ws.set_onmessage(Some(onmessage_callback.as_ref().unchecked_ref()));
        onmessage_callback.forget();
        
        // onerror handler
        let onerror_callback = Closure::wrap(Box::new(move |e: ErrorEvent| {
            web_sys::console::log_1(&format!("WebSocket error: {:?}", e).into());
        }) as Box<dyn FnMut(ErrorEvent)>);
        ws.set_onerror(Some(onerror_callback.as_ref().unchecked_ref()));
        onerror_callback.forget();
        
        // onclose handler
        let onclose_callback = Closure::wrap(Box::new(move |e: CloseEvent| {
            web_sys::console::log_1(&format!("WebSocket closed: {}", e.code()).into());
        }) as Box<dyn FnMut(CloseEvent)>);
        ws.set_onclose(Some(onclose_callback.as_ref().unchecked_ref()));
        onclose_callback.forget();
        
        self.websocket = Some(ws);
        Ok(())
    }

    #[wasm_bindgen]
    pub fn send_message(&self, message: &str) -> Result<(), JsValue> {
        if let Some(ws) = &self.websocket {
            ws.send_with_str(message)?;
        }
        Ok(())
    }

    #[wasm_bindgen]
    pub fn send_sprite_move(&self, sprite_id: &str, x: f64, y: f64) -> Result<(), JsValue> {
        let message = SpriteMove {
            sprite_id: sprite_id.to_string(),
            x,
            y,
        };
        
        let json = serde_json::to_string(&message)
            .map_err(|e| JsValue::from_str(&format!("Failed to serialize message: {}", e)))?;
        
        self.send_message(&json)
    }

    #[wasm_bindgen]
    pub fn send_sprite_create(&self, sprite_data: &JsValue) -> Result<(), JsValue> {
        let sprite: Sprite = sprite_data.into_serde()
            .map_err(|e| JsValue::from_str(&format!("Failed to parse sprite: {}", e)))?;
        
        let message = SpriteCreate { sprite };
        let json = serde_json::to_string(&message)
            .map_err(|e| JsValue::from_str(&format!("Failed to serialize message: {}", e)))?;
        
        self.send_message(&json)
    }

    #[wasm_bindgen]
    pub fn disconnect(&mut self) {
        if let Some(ws) = &self.websocket {
            let _ = ws.close();
        }
        self.websocket = None;
        self.connection_state = ConnectionState::Disconnected;
    }

    #[wasm_bindgen]
    pub fn get_connection_state(&self) -> String {
        match self.connection_state {
            ConnectionState::Disconnected => "disconnected".to_string(),
            ConnectionState::Connecting => "connecting".to_string(),
            ConnectionState::Connected => "connected".to_string(),
            ConnectionState::Error => "error".to_string(),
        }
    }

    #[wasm_bindgen]
    pub fn is_connected(&self) -> bool {
        matches!(self.connection_state, ConnectionState::Connected)
    }
}
