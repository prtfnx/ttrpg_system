use wasm_bindgen::prelude::*;
use crate::core::Engine;
use crate::interaction::InputEvent;

#[wasm_bindgen]
pub struct WasmEngine {
    engine: Engine,
}

#[wasm_bindgen]
impl WasmEngine {
    #[wasm_bindgen(constructor)]
    pub fn new(canvas: &web_sys::HtmlCanvasElement) -> Result<WasmEngine, JsValue> {
        console_error_panic_hook::set_once();
        
        let engine = Engine::new(canvas)?;
        Ok(WasmEngine { engine })
    }

    #[wasm_bindgen]
    pub fn render(&mut self) -> Result<(), JsValue> {
        self.engine.render()?;
        Ok(())
    }

    #[wasm_bindgen]
    pub fn handle_mouse_click(&mut self, x: f32, y: f32) -> Result<(), JsValue> {
        let events = vec![InputEvent::MouseClick { x, y }];
        self.engine.handle_input(events)?;
        Ok(())
    }

    #[wasm_bindgen]
    pub fn handle_mouse_move(&mut self, x: f32, y: f32) -> Result<(), JsValue> {
        let events = vec![InputEvent::MouseMove { x, y }];
        self.engine.handle_input(events)?;
        Ok(())
    }

    #[wasm_bindgen]
    pub fn handle_key_press(&mut self, key: &str) -> Result<(), JsValue> {
        let events = vec![InputEvent::KeyPress { key: key.to_string() }];
        self.engine.handle_input(events)?;
        Ok(())
    }

    #[wasm_bindgen]
    pub fn handle_key_release(&mut self, key: &str) -> Result<(), JsValue> {
        let events = vec![InputEvent::KeyRelease { key: key.to_string() }];
        self.engine.handle_input(events)?;
        Ok(())
    }

    #[wasm_bindgen]
    pub fn resize(&mut self, width: f32, height: f32) -> Result<(), JsValue> {
        self.engine.resize(width, height)?;
        Ok(())
    }

    #[wasm_bindgen]
    pub fn add_test_content(&mut self) {
        self.engine.content().add_test_content();
    }

    #[wasm_bindgen]
    pub fn add_test_lighting(&mut self) {
        self.engine.effects().add_test_lighting();
    }

    #[wasm_bindgen]
    pub fn get_dimensions(&self) -> js_sys::Array {
        let (width, height) = self.engine.graphics().get_dimensions();
        let result = js_sys::Array::new();
        result.push(&JsValue::from_f64(width as f64));
        result.push(&JsValue::from_f64(height as f64));
        result
    }
}