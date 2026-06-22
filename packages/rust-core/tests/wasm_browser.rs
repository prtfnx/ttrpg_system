// Browser-only WASM tests — require real browser APIs (window, WebGL, etc.)
// Run with: wasm-pack test --headless --chrome
//
// Only place tests here when they genuinely need browser-specific APIs that
// are unavailable in Node.js (WebGl2RenderingContext, canvas, DOM events).
#![cfg(target_arch = "wasm32")]

use wasm_bindgen::JsCast;
use wasm_bindgen::prelude::Closure;
use wasm_bindgen_test::*;
use web_sys::HtmlCanvasElement;

wasm_bindgen_test_configure!(run_in_browser);

fn create_test_canvas() -> HtmlCanvasElement {
    let win = web_sys::window().expect("should have window");
    let doc = win.document().expect("should have document");
    let canvas = doc
        .create_element("canvas")
        .unwrap()
        .dyn_into::<HtmlCanvasElement>()
        .unwrap();

    canvas.set_width(640);
    canvas.set_height(480);
    canvas
}

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

// -- Render boundary -------------------------------------------------------

#[wasm_bindgen_test]
fn init_renderer_resize_render_and_drop_do_not_throw() {
    let canvas = create_test_canvas();
    let mut renderer = ttrpg_rust_core::init_game_renderer(canvas)
        .expect("renderer should initialize with a browser canvas");

    renderer.resize_canvas(320.0, 240.0);
    renderer.set_camera(10.0, 20.0, 1.25);
    renderer.set_grid_enabled(true);
    renderer.set_grid_snapping(true);
    renderer.set_grid_size(50.0);
    renderer.set_active_layer("tokens");
    renderer.set_layer_visibility("tokens", true);
    renderer.set_layer_opacity("tokens", 0.8);
    renderer.set_shape_style("#ff00aa", 0.5, true);

    renderer.render().expect("basic render should not throw");
    drop(renderer);
}

#[wasm_bindgen_test]
fn runtime_callback_registration_and_cleanup_do_not_throw() {
    let canvas = create_test_canvas();
    let mut renderer = ttrpg_rust_core::init_game_renderer(canvas)
        .expect("renderer should initialize with a browser canvas");

    let operation_handler = Closure::<dyn FnMut(wasm_bindgen::JsValue)>::new(|_| {});
    let event_handler = Closure::<dyn FnMut(wasm_bindgen::JsValue)>::new(|_| {});

    renderer.set_runtime_operation_handler(
        operation_handler.as_ref().unchecked_ref::<js_sys::Function>(),
    );
    renderer.set_runtime_event_handler(
        event_handler.as_ref().unchecked_ref::<js_sys::Function>(),
    );
    renderer.clear_runtime_operation_handler();
    renderer.clear_runtime_event_handler();

    drop(renderer);
}
