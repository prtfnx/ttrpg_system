use wasm_bindgen_test::*;

wasm_bindgen_test_configure!(run_in_browser);

mod fixtures;
use fixtures::{TestEngine, assert_sprite_at_position};

#[wasm_bindgen_test]
async fn user_can_click_to_create_sprite() {
    let mut engine = TestEngine::new();
    
    // User clicks on canvas to create sprite
    engine.click(100.0, 150.0).await;
    
    // Sprite should be created at click position
    let scene = engine.scene();
    assert_eq!(scene.items.len(), 1, "Should create one sprite on click");
    
    if let Some(item) = scene.items.first() {
        match item {
            ttrpg_rust_core::SceneItem::Sprite { x, y, .. } => {
                assert_eq!(*x, 100.0, "Sprite should be at clicked x position");
                assert_eq!(*y, 150.0, "Sprite should be at clicked y position");
            }
            _ => panic!("Should create a sprite, not other item type"),
        }
    }
}

#[wasm_bindgen_test]
async fn user_can_add_multiple_sprites() {
    let mut engine = TestEngine::new();
    
    // User creates first sprite
    engine.create_sprite("player", 0.0, 0.0).await;
    
    // User creates second sprite  
    engine.create_sprite("enemy", 100.0, 50.0).await;
    
    // Both sprites should exist in scene
    let scene = engine.scene();
    assert_eq!(scene.items.len(), 2, "Should have two sprites");
    
    assert_sprite_at_position(&engine, "player", 0.0, 0.0);
    assert_sprite_at_position(&engine, "enemy", 100.0, 50.0);
}

#[wasm_bindgen_test]
async fn engine_renders_without_errors() {
    let mut engine = TestEngine::new();
    
    // Add some content to render
    engine.create_sprite("test_sprite", 200.0, 200.0).await;
    
    // Engine should render successfully
    engine.render(); // Should not panic
    
    // Multiple render calls should work
    engine.render();
    engine.render();
}