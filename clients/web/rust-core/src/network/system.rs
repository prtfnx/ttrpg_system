use wasm_bindgen::prelude::*;
use wasm_bindgen_futures::*;
use web_sys::*;

pub struct NetworkSystem {
    is_connected: bool,
    websocket: Option<WebSocket>,
    message_handlers: Vec<Box<dyn FnMut(&str)>>,
}

impl NetworkSystem {
    pub fn new() -> Self {
        Self {
            is_connected: false,
            websocket: None,
            message_handlers: Vec::new(),
        }
    }

    pub async fn connect(&mut self, url: &str) -> Result<(), JsValue> {
        let ws = WebSocket::new(url)?;
        
        // Set up event handlers
        let onmessage_callback = Closure::wrap(Box::new(move |e: MessageEvent| {
            if let Ok(txt) = e.data().dyn_into::<js_sys::JsString>() {
                let message = txt.as_string().unwrap_or_default();
                web_sys::console::log_1(&format!("Received: {}", message).into());
            }
        }) as Box<dyn FnMut(MessageEvent)>);

        let onopen_callback = Closure::wrap(Box::new(move |_| {
            web_sys::console::log_1(&"WebSocket connected".into());
        }) as Box<dyn FnMut(JsValue)>);

        let onerror_callback = Closure::wrap(Box::new(move |e| {
            web_sys::console::error_1(&"WebSocket error:".into());
            web_sys::console::error_1(&e);
        }) as Box<dyn FnMut(JsValue)>);

        let onclose_callback = Closure::wrap(Box::new(move |_| {
            web_sys::console::log_1(&"WebSocket disconnected".into());
        }) as Box<dyn FnMut(JsValue)>);

        ws.set_onmessage(Some(onmessage_callback.as_ref().unchecked_ref()));
        ws.set_onopen(Some(onopen_callback.as_ref().unchecked_ref()));
        ws.set_onerror(Some(onerror_callback.as_ref().unchecked_ref()));
        ws.set_onclose(Some(onclose_callback.as_ref().unchecked_ref()));

        // Forget the closures to prevent them from being dropped
        onmessage_callback.forget();
        onopen_callback.forget();
        onerror_callback.forget();
        onclose_callback.forget();

        self.websocket = Some(ws);
        self.is_connected = true;
        
        Ok(())
    }

    pub fn send_message(&self, message: &str) -> Result<(), JsValue> {
        if let Some(ref ws) = self.websocket {
            ws.send_with_str(message)?;
        }
        Ok(())
    }

    pub fn disconnect(&mut self) -> Result<(), JsValue> {
        if let Some(ref ws) = self.websocket {
            ws.close()?;
        }
        self.is_connected = false;
        self.websocket = None;
        Ok(())
    }

    pub fn is_connected(&self) -> bool {
        self.is_connected
    }

    pub fn send_game_action(&self, action: &crate::content::GameAction) -> Result<(), JsValue> {
        let message = format!("action:{:?}", action);
        self.send_message(&message)
    }

    pub fn request_sync(&self) -> Result<(), JsValue> {
        self.send_message("sync_request")
    }
}