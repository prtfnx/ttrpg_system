use wasm_bindgen_test::*;

wasm_bindgen_test_configure!(run_in_browser);

mod fixtures;
use fixtures::{create_test_canvas};

#[wasm_bindgen_test]
async fn wasm_engine_initializes_successfully() {
    let canvas = create_test_canvas();
    let engine = ttrpg_rust_core::WasmEngine::new(&canvas);
    
    assert!(engine.is_ok(), "WasmEngine should initialize without errors");
}

#[wasm_bindgen_test]  
async fn wasm_engine_handles_canvas_resize() {
    let canvas = create_test_canvas();
    let mut engine = ttrpg_rust_core::WasmEngine::new(&canvas)
        .expect("should create engine");
    
    // Engine should handle resize gracefully
    let result = engine.resize(1024.0, 768.0);
    assert!(result.is_ok(), "Should handle resize without errors");
    
    let dimensions = engine.get_dimensions();
    assert_eq!(dimensions.length(), 2);
}

#[wasm_bindgen_test]
async fn wasm_engine_renders_without_panics() {
    let canvas = create_test_canvas();
    let mut engine = ttrpg_rust_core::WasmEngine::new(&canvas)
        .expect("should create engine");
    
    // Add test content
    engine.add_test_content();
    
    // Should render without panicking
    let result = engine.render();
    assert!(result.is_ok(), "Rendering should not fail");
    
    // Multiple renders should work
    assert!(engine.render().is_ok());
    assert!(engine.render().is_ok());
}

#[wasm_bindgen_test]
async fn wasm_engine_processes_input_events() {
    let canvas = create_test_canvas();
    let mut engine = ttrpg_rust_core::WasmEngine::new(&canvas)
        .expect("should create engine");
    
    // Should handle mouse events
    let result = engine.handle_mouse_click(200.0, 300.0);
    assert!(result.is_ok(), "Should handle mouse click");
    
    let result = engine.handle_mouse_move(250.0, 350.0);
    assert!(result.is_ok(), "Should handle mouse move");
    
    // Should handle keyboard events
    let result = engine.handle_key_press("w");
    assert!(result.is_ok(), "Should handle key press");
    
    let result = engine.handle_key_release("w");
    assert!(result.is_ok(), "Should handle key release");
}