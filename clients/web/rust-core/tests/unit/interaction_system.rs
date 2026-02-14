use ttrpg_rust_core::interaction::{InteractionSystem, InputEvent};
use ttrpg_rust_core::content::GameAction;

#[test]
fn interaction_system_processes_mouse_clicks() {
    let mut interaction = InteractionSystem::new();
    
    let events = vec![
        InputEvent::MouseClick { x: 50.0, y: 100.0 }
    ];
    
    let actions = interaction.process_input_batch(events)
        .expect("should process input");
    
    assert_eq!(actions.len(), 1);
    
    match &actions[0] {
        GameAction::AddSprite { id, x, y, .. } => {
            assert_eq!(*x, 50.0);
            assert_eq!(*y, 100.0);
            assert!(id.contains("sprite_50_100"));
        }
        _ => panic!("Should create add sprite action"),
    }
}

#[test]
fn interaction_system_tracks_mouse_position() {
    let mut interaction = InteractionSystem::new();
    
    let events = vec![
        InputEvent::MouseMove { x: 25.0, y: 75.0 }
    ];
    
    interaction.process_input_batch(events).expect("should process input");
    
    let (x, y) = interaction.mouse_position();
    assert_eq!(x, 25.0);
    assert_eq!(y, 75.0);
}

#[test]
fn interaction_system_tracks_key_presses() {
    let mut interaction = InteractionSystem::new();
    
    let events = vec![
        InputEvent::KeyPress { key: "a".to_string() },
        InputEvent::KeyPress { key: "b".to_string() },
    ];
    
    interaction.process_input_batch(events).expect("should process input");
    
    assert!(interaction.is_key_pressed("a"));
    assert!(interaction.is_key_pressed("b"));
    assert!(!interaction.is_key_pressed("c"));
    
    let pressed_keys = interaction.get_pressed_keys();
    assert_eq!(pressed_keys.len(), 2);
    assert!(pressed_keys.contains(&"a".to_string()));
    assert!(pressed_keys.contains(&"b".to_string()));
}

#[test]
fn interaction_system_handles_key_release() {
    let mut interaction = InteractionSystem::new();
    
    // Press and release key
    let events = vec![
        InputEvent::KeyPress { key: "space".to_string() },
        InputEvent::KeyRelease { key: "space".to_string() },
    ];
    
    interaction.process_input_batch(events).expect("should process input");
    
    assert!(!interaction.is_key_pressed("space"));
    assert_eq!(interaction.get_pressed_keys().len(), 0);
}