// Browser-only WASM tests — require real browser APIs (window, WebGL, etc.)
// Run with: wasm-pack test --headless --chrome
//
// Only place tests here when they genuinely need browser-specific APIs that
// are unavailable in Node.js (WebGl2RenderingContext, canvas, DOM events).
#![cfg(target_arch = "wasm32")]

use wasm_bindgen::prelude::Closure;
use wasm_bindgen::JsCast;
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

    assert_eq!(renderer.get_active_table_id(), None);

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
        operation_handler
            .as_ref()
            .unchecked_ref::<js_sys::Function>(),
    );
    renderer.set_runtime_event_handler(event_handler.as_ref().unchecked_ref::<js_sys::Function>());
    renderer.clear_runtime_operation_handler();
    renderer.clear_runtime_event_handler();

    drop(renderer);
}

#[wasm_bindgen_test]
fn resident_visibility_without_obstacles_reaches_radius() {
    let mut renderer = ttrpg_rust_core::init_game_renderer(create_test_canvas()).unwrap();
    let sources = js_sys::Float32Array::from([0.0_f32, 0.0, 100.0].as_slice());
    let polygons = js_sys::Array::from(&renderer.compute_sight_visibility_polygons(&sources));
    assert_eq!(polygons.length(), 1);
    let points = js_sys::Array::from(&polygons.get(0));
    assert!(points.length() >= 32);
    for point in points.iter() {
        let x = js_sys::Reflect::get(&point, &"x".into())
            .unwrap()
            .as_f64()
            .unwrap();
        let y = js_sys::Reflect::get(&point, &"y".into())
            .unwrap()
            .as_f64()
            .unwrap();
        assert!((x.hypot(y) - 100.0).abs() < 0.5);
    }
}

#[wasm_bindgen_test]
fn resident_visibility_wall_blocks_forward_ray() {
    let mut renderer = ttrpg_rust_core::init_game_renderer(create_test_canvas()).unwrap();
    assert!(renderer.add_wall(
        r#"{"wall_id":"wall-1","table_id":"visibility-table","x1":10,"y1":-50,"x2":10,"y2":50}"#
    ));
    let sources = js_sys::Float32Array::from([0.0_f32, 0.0, 200.0].as_slice());
    let polygons = js_sys::Array::from(&renderer.compute_sight_visibility_polygons(&sources));
    assert_eq!(polygons.length(), 1);
    let points = js_sys::Array::from(&polygons.get(0));
    assert!(
        points.iter().any(|point| {
            let x = js_sys::Reflect::get(&point, &"x".into())
                .unwrap()
                .as_f64()
                .unwrap();
            let y = js_sys::Reflect::get(&point, &"y".into())
                .unwrap()
                .as_f64()
                .unwrap();
            (x - 10.0).abs() < 0.1 && y.abs() < 0.1
        }),
        "Forward ray must stop at the resident wall, not the 200-unit radius"
    );
}
