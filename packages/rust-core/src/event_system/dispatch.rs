use wasm_bindgen::JsValue;

use super::EventSystem;

impl EventSystem {
    fn emit_runtime_event(handler: Option<&js_sys::Function>, event_type: &str, data: js_sys::Object) {
        let Some(handler) = handler else { return };

        let event = js_sys::Object::new();
        js_sys::Reflect::set(&event, &"type".into(), &JsValue::from_str(event_type)).ok();
        js_sys::Reflect::set(&event, &"data".into(), &data).ok();
        let _ = handler.call1(&JsValue::NULL, &event.into());
    }

    pub(crate) fn dispatch_drag_preview(handler: Option<&js_sys::Function>, sprite_id: &str, x: f64, y: f64) {
        let detail = js_sys::Object::new();
        js_sys::Reflect::set(&detail, &"spriteId".into(), &JsValue::from_str(sprite_id)).ok();
        js_sys::Reflect::set(&detail, &"x".into(), &JsValue::from_f64(x)).ok();
        js_sys::Reflect::set(&detail, &"y".into(), &JsValue::from_f64(y)).ok();
        Self::emit_runtime_event(handler, "spriteDragPreview", detail);
    }

    pub(crate) fn dispatch_resize_preview(handler: Option<&js_sys::Function>, sprite_id: &str, width: f64, height: f64) {
        let detail = js_sys::Object::new();
        js_sys::Reflect::set(&detail, &"spriteId".into(), &JsValue::from_str(sprite_id)).ok();
        js_sys::Reflect::set(&detail, &"width".into(), &JsValue::from_f64(width)).ok();
        js_sys::Reflect::set(&detail, &"height".into(), &JsValue::from_f64(height)).ok();
        Self::emit_runtime_event(handler, "spriteResizePreview", detail);
    }

    pub(crate) fn dispatch_rotate_preview(handler: Option<&js_sys::Function>, sprite_id: &str, rotation: f64) {
        let detail = js_sys::Object::new();
        js_sys::Reflect::set(&detail, &"spriteId".into(), &JsValue::from_str(sprite_id)).ok();
        js_sys::Reflect::set(&detail, &"rotation".into(), &JsValue::from_f64(rotation)).ok();
        Self::emit_runtime_event(handler, "spriteRotatePreview", detail);
    }

    pub(crate) fn dispatch_light_moved(handler: Option<&js_sys::Function>, light_id: &str, x: f32, y: f32) {
        let detail = js_sys::Object::new();
        js_sys::Reflect::set(&detail, &"lightId".into(), &JsValue::from_str(light_id)).ok();
        js_sys::Reflect::set(&detail, &"x".into(), &JsValue::from_f64(x as f64)).ok();
        js_sys::Reflect::set(&detail, &"y".into(), &JsValue::from_f64(y as f64)).ok();
        Self::emit_runtime_event(handler, "lightMoved", detail);
    }

    pub(crate) fn dispatch_wall_moved(handler: Option<&js_sys::Function>, wall_id: &str, x1: f32, y1: f32, x2: f32, y2: f32) {
        let detail = js_sys::Object::new();
        js_sys::Reflect::set(&detail, &"wallId".into(), &JsValue::from_str(wall_id)).ok();
        js_sys::Reflect::set(&detail, &"x1".into(), &JsValue::from_f64(x1 as f64)).ok();
        js_sys::Reflect::set(&detail, &"y1".into(), &JsValue::from_f64(y1 as f64)).ok();
        js_sys::Reflect::set(&detail, &"x2".into(), &JsValue::from_f64(x2 as f64)).ok();
        js_sys::Reflect::set(&detail, &"y2".into(), &JsValue::from_f64(y2 as f64)).ok();
        Self::emit_runtime_event(handler, "wallMoved", detail);
    }

    /// Tell React to switch to a specific tool mode after an automatic transition.
    #[allow(dead_code)]
    pub(crate) fn dispatch_tool_mode_changed(handler: Option<&js_sys::Function>, mode: &str) {
        let detail = js_sys::Object::new();
        js_sys::Reflect::set(&detail, &"mode".into(), &JsValue::from_str(mode)).ok();
        Self::emit_runtime_event(handler, "toolModeChanged", detail);
    }

    /// Tell React to change the canvas cursor.
    pub(crate) fn dispatch_cursor_hint(handler: Option<&js_sys::Function>, cursor: &str) {
        let detail = js_sys::Object::new();
        js_sys::Reflect::set(&detail, &"cursor".into(), &JsValue::from_str(cursor)).ok();
        Self::emit_runtime_event(handler, "cursorHint", detail);
    }
}
