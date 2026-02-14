use wasm_bindgen_test::*;

wasm_bindgen_test_configure!(run_in_browser);

mod fixtures;
use fixtures::TestEngine;

#[wasm_bindgen_test]
async fn complete_user_workflow() {
    let mut engine = TestEngine::new();
    
    // User starts with empty scene
    assert_eq!(engine.scene().items.len(), 0);
    
    // User clicks to create first sprite
    engine.click(100.0, 100.0).await;
    assert_eq!(engine.scene().items.len(), 1);
    
    // User creates another sprite via API
    engine.create_sprite("character", 200.0, 200.0).await;
    assert_eq!(engine.scene().items.len(), 2);
    
    // User can render the scene successfully
    engine.render(); // Should not panic
    
    // User interacts with keyboard
    // (This could trigger game actions in a full implementation)
    // For now just verify it doesn't crash the system
}

#[wasm_bindgen_test] 
async fn stress_test_many_sprites() {
    let mut engine = TestEngine::new();
    
    // Create many sprites
    for i in 0..50 {
        let x = (i % 10) as f32 * 50.0;
        let y = (i / 10) as f32 * 50.0;
        engine.create_sprite(&format!("sprite_{}", i), x, y).await;
    }
    
    // Should have all sprites
    assert_eq!(engine.scene().items.len(), 50);
    
    // Should render without issues
    engine.render();
    
    // Should handle interactions with many sprites
    engine.click(125.0, 125.0).await; // Click in middle of sprites
}