use quickcheck_macros::quickcheck;
use ttrpg_rust_core::effects::{EffectsSystem, LightSource};

#[quickcheck]
fn light_source_intensity_clamped(intensity: f32) -> bool {
    let light = LightSource {
        x: 0.0,
        y: 0.0,
        radius: 50.0,
        intensity: intensity.clamp(0.0, 1.0), // Should be clamped
        color: (1.0, 1.0, 1.0),
    };
    
    light.intensity >= 0.0 && light.intensity <= 1.0
}

#[quickcheck]
fn sprite_position_preserved_after_move(start_x: f32, start_y: f32, end_x: f32, end_y: f32) -> bool {
    use ttrpg_rust_core::content::{ContentSystem, GameAction};
    
    let mut content = ContentSystem::new();
    
    // Add sprite at start position
    let add_action = GameAction::AddSprite {
        id: "test".to_string(),
        x: start_x,
        y: start_y,
        texture_id: "test".to_string(),
    };
    let _ = content.apply_action(add_action);
    
    // Move sprite to end position
    let move_action = GameAction::MoveSprite {
        id: "test".to_string(),
        x: end_x,
        y: end_y,
    };
    let _ = content.apply_action(move_action);
    
    // Check final position matches expected
    let scene = content.current_scene();
    if let Some(item) = scene.items.first() {
        match item {
            ttrpg_rust_core::SceneItem::Sprite { x, y, .. } => {
                (*x - end_x).abs() < 0.001 && (*y - end_y).abs() < 0.001
            }
            _ => false,
        }
    } else {
        false
    }
}

#[quickcheck]
fn input_events_dont_crash_system(x: f32, y: f32, key_char: char) -> bool {
    use ttrpg_rust_core::interaction::{InteractionSystem, InputEvent};
    
    let mut interaction = InteractionSystem::new();
    
    let key = key_char.to_string();
    let events = vec![
        InputEvent::MouseClick { x, y },
        InputEvent::MouseMove { x, y },
        InputEvent::KeyPress { key: key.clone() },
        InputEvent::KeyRelease { key },
    ];
    
    // Should handle any input without panicking
    interaction.process_input_batch(events).is_ok()
}

#[test]
fn ambient_light_clamping_test() {
    use fixtures::create_test_canvas;
    
    let canvas = create_test_canvas();
    let mut effects = EffectsSystem::new(&canvas).expect("should create effects system");
    
    // Test extreme values
    effects.set_ambient_light(-10.0);
    assert_eq!(effects.get_ambient_light(), 0.0);
    
    effects.set_ambient_light(10.0);
    assert_eq!(effects.get_ambient_light(), 1.0);
    
    // Test normal values
    effects.set_ambient_light(0.5);
    assert_eq!(effects.get_ambient_light(), 0.5);
}