// Browser-only WASM tests — require real browser APIs (window, WebGL, etc.)
// Run with: wasm-pack test --headless --chrome
//
// Only place tests here when they genuinely need browser-specific APIs that
// are unavailable in Node.js (WebGl2RenderingContext, canvas, DOM events).
#![cfg(target_arch = "wasm32")]

use wasm_bindgen::JsCast;
use wasm_bindgen_test::*;

wasm_bindgen_test_configure!(run_in_browser);

// ── WebGL availability ────────────────────────────────────────────────────

#[wasm_bindgen_test]
fn webgl2_context_is_available() {
    use web_sys::{window, HtmlCanvasElement};

    let win = window().expect("should have window");
    let doc = win.document().expect("should have document");
    let canvas = doc
        .create_element("canvas")
        .unwrap()
        .dyn_into::<HtmlCanvasElement>()
        .unwrap();

    let ctx = canvas.get_context("webgl2").unwrap();
    assert!(ctx.is_some(), "WebGL2 should be available in the browser");
}

// ── DOM events ────────────────────────────────────────────────────────────

#[wasm_bindgen_test]
fn window_object_exists() {
    use web_sys::window;
    assert!(window().is_some(), "window should exist in browser context");
}
