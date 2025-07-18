use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub fn set_panic_hook() {
    // When the `console_error_panic_hook` feature is enabled, we can call the
    // `set_panic_hook` function at least once during initialization, and then
    // we will get better error messages if our code ever panics.
    //
    // For more details see
    // https://github.com/rustwasm/console_error_panic_hook#readme
    #[cfg(feature = "console_error_panic_hook")]
    console_error_panic_hook::set_once();
}

#[wasm_bindgen]
pub fn now() -> f64 {
    js_sys::Date::now()
}

#[wasm_bindgen]
pub fn request_animation_frame(callback: &js_sys::Function) -> i32 {
    web_sys::window()
        .unwrap()
        .request_animation_frame(callback)
        .unwrap()
}

pub fn window() -> web_sys::Window {
    web_sys::window().expect("no global `window` exists")
}

pub fn document() -> web_sys::Document {
    window()
        .document()
        .expect("should have a document on window")
}

pub fn body() -> web_sys::HtmlElement {
    document()
        .body()
        .expect("document should have a body")
}

#[wasm_bindgen]
pub fn log(s: &str) {
    web_sys::console::log_1(&s.into());
}

#[wasm_bindgen]
pub fn error(s: &str) {
    web_sys::console::error_1(&s.into());
}

#[wasm_bindgen]
pub fn warn(s: &str) {
    web_sys::console::warn_1(&s.into());
}
