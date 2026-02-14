use ttrpg_rust_core::content::{ContentSystem, GameAction, SceneItem};

#[test]
fn content_system_adds_sprites() {
    let mut content = ContentSystem::new();
    
    // Add sprite action
    let action = GameAction::AddSprite {
        id: "test_sprite".to_string(),
        x: 50.0,
        y: 75.0,
        texture_id: "test_texture".to_string(),
    };
    
    content.apply_action(action).expect("should add sprite");
    
    let scene = content.current_scene();
    assert_eq!(scene.items.len(), 1);
    
    match &scene.items[0] {
        SceneItem::Sprite { x, y, texture_id, scale } => {
            assert_eq!(*x, 50.0);
            assert_eq!(*y, 75.0);
            assert_eq!(texture_id, "test_texture");
            assert_eq!(*scale, 1.0);
        }
        _ => panic!("Should be sprite item"),
    }
}

#[test]
fn content_system_removes_sprites() {
    let mut content = ContentSystem::new();
    
    // Add a sprite first
    let add_action = GameAction::AddSprite {
        id: "removable".to_string(),
        x: 0.0,
        y: 0.0,
        texture_id: "test".to_string(),
    };
    content.apply_action(add_action).expect("should add sprite");
    assert_eq!(content.current_scene().items.len(), 1);
    
    // Remove the sprite
    let remove_action = GameAction::RemoveSprite {
        id: "removable".to_string(),
    };
    content.apply_action(remove_action).expect("should remove sprite");
    
    // Scene should be empty
    assert_eq!(content.current_scene().items.len(), 0);
}

#[test]
fn content_system_moves_sprites() {
    let mut content = ContentSystem::new();
    
    // Add a sprite
    let add_action = GameAction::AddSprite {
        id: "movable".to_string(),
        x: 10.0,
        y: 20.0,
        texture_id: "test".to_string(),
    };
    content.apply_action(add_action).expect("should add sprite");
    
    // Move the sprite
    let move_action = GameAction::MoveSprite {
        id: "movable".to_string(),
        x: 100.0,
        y: 200.0,
    };
    content.apply_action(move_action).expect("should move sprite");
    
    // Check sprite is at new position
    let scene = content.current_scene();
    assert_eq!(scene.items.len(), 1);
    
    match &scene.items[0] {
        SceneItem::Sprite { x, y, .. } => {
            assert_eq!(*x, 100.0);
            assert_eq!(*y, 200.0);
        }
        _ => panic!("Should be sprite"),
    }
}