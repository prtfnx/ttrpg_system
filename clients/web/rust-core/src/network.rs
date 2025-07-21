use wasm_bindgen::prelude::*;
use web_sys::{WebSocket, MessageEvent, CloseEvent, ErrorEvent};
use crate::types::*;
use gloo_utils::format::JsValueSerdeExt;

#[wasm_bindgen]
pub struct NetworkClient {
    websocket: Option<WebSocket>,
    connection_state: ConnectionState,
    message_queue: Vec<String>,
    session_code: Option<String>,
    user_id: Option<u32>,
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
        }
    }

    #[wasm_bindgen]
    pub fn connect(&mut self, url: &str, session_code: &str, jwt_token: &str) -> Result<(), JsValue> {
        let ws_url = format!("{}?session_code={}&token={}", url, session_code, jwt_token);
        let ws = WebSocket::new(&ws_url)?;
        
        self.session_code = Some(session_code.to_string());
        self.connection_state = ConnectionState::Connecting;
        
        // Set up event handlers
        
        // onopen handler
        let onopen_callback = Closure::wrap(Box::new(move |_| {
            web_sys::console::log_1(&"WebSocket connection opened".into());
        }) as Box<dyn FnMut(JsValue)>);
        ws.set_onopen(Some(onopen_callback.as_ref().unchecked_ref()));
        onopen_callback.forget();
        
        // onmessage handler
        let onmessage_callback = Closure::wrap(Box::new(move |e: MessageEvent| {
            if let Ok(msg) = e.data().dyn_into::<js_sys::JsString>() {
                let message: String = msg.into();
                web_sys::console::log_1(&format!("Received message: {}", message).into());
                // TODO: Handle message parsing and dispatch
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
