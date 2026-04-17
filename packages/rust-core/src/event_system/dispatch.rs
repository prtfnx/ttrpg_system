use wasm_bindgen::JsValue;

use super::EventSystem;

impl EventSystem {
    pub(crate) fn dispatch_drag_preview(sprite_id: &str, x: f64, y: f64) {
        let Some(window) = web_sys::window() else { return };
        let detail = js_sys::Object::new();
        js_sys::Reflect::set(&detail, &"spriteId".into(), &JsValue::from_str(sprite_id)).ok();
        js_sys::Reflect::set(&detail, &"x".into(), &JsValue::from_f64(x)).ok();
        js_sys::Reflect::set(&detail, &"y".into(), &JsValue::from_f64(y)).ok();
        let event_init = web_sys::CustomEventInit::new();
        event_init.set_detail(&detail);
        if let Ok(event) = web_sys::CustomEvent::new_with_event_init_dict("sprite-drag-preview", &event_init) {
            window.dispatch_event(&event).ok();
        }
    }

    pub(crate) fn dispatch_resize_preview(sprite_id: &str, width: f64, height: f64) {
        let Some(window) = web_sys::window() else { return };
        let detail = js_sys::Object::new();
        js_sys::Reflect::set(&detail, &"spriteId".into(), &JsValue::from_str(sprite_id)).ok();
        js_sys::Reflect::set(&detail, &"width".into(), &JsValue::from_f64(width)).ok();
        js_sys::Reflect::set(&detail, &"height".into(), &JsValue::from_f64(height)).ok();
        let event_init = web_sys::CustomEventInit::new();
        event_init.set_detail(&detail);
        if let Ok(event) = web_sys::CustomEvent::new_with_event_init_dict("sprite-resize-preview", &event_init) {
            window.dispatch_event(&event).ok();
        }
    }

    pub(crate) fn dispatch_rotate_preview(sprite_id: &str, rotation: f64) {
        let Some(window) = web_sys::window() else { return };
        let detail = js_sys::Object::new();
        js_sys::Reflect::set(&detail, &"spriteId".into(), &JsValue::from_str(sprite_id)).ok();
        js_sys::Reflect::set(&detail, &"rotation".into(), &JsValue::from_f64(rotation)).ok();
        let event_init = web_sys::CustomEventInit::new();
        event_init.set_detail(&detail);
        if let Ok(event) = web_sys::CustomEvent::new_with_event_init_dict("sprite-rotate-preview", &event_init) {
            window.dispatch_event(&event).ok();
        }
    }

    pub(crate) fn dispatch_light_moved(light_id: &str, x: f32, y: f32) {
        let Some(window) = web_sys::window() else { return };
        let detail = js_sys::Object::new();
        js_sys::Reflect::set(&detail, &"lightId".into(), &JsValue::from_str(light_id)).ok();
        js_sys::Reflect::set(&detail, &"x".into(), &JsValue::from_f64(x as f64)).ok();
        js_sys::Reflect::set(&detail, &"y".into(), &JsValue::from_f64(y as f64)).ok();
        let event_init = web_sys::CustomEventInit::new();
        event_init.set_detail(&detail);
        if let Ok(event) = web_sys::CustomEvent::new_with_event_init_dict("wasm-light-moved", &event_init) {
            window.dispatch_event(&event).ok();
        }
    }

    pub(crate) fn dispatch_wall_moved(wall_id: &str, x1: f32, y1: f32, x2: f32, y2: f32) {
        let Some(window) = web_sys::window() else { return };
        let detail = js_sys::Object::new();
        js_sys::Reflect::set(&detail, &"wallId".into(), &JsValue::from_str(wall_id)).ok();
        js_sys::Reflect::set(&detail, &"x1".into(), &JsValue::from_f64(x1 as f64)).ok();
        js_sys::Reflect::set(&detail, &"y1".into(), &JsValue::from_f64(y1 as f64)).ok();
        js_sys::Reflect::set(&detail, &"x2".into(), &JsValue::from_f64(x2 as f64)).ok();
        js_sys::Reflect::set(&detail, &"y2".into(), &JsValue::from_f64(y2 as f64)).ok();
        let event_init = web_sys::CustomEventInit::new();
        event_init.set_detail(&detail);
        if let Ok(event) = web_sys::CustomEvent::new_with_event_init_dict("wasm-wall-moved", &event_init) {
            window.dispatch_event(&event).ok();
        }
    }
}
