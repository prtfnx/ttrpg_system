use crate::content::GameAction;

#[derive(Debug, Clone)]
pub enum InputEvent {
    MouseClick { x: f32, y: f32 },
    MouseMove { x: f32, y: f32 },
    KeyPress { key: String },
    KeyRelease { key: String },
}

pub struct InteractionSystem {
    mouse_position: (f32, f32),
    pressed_keys: std::collections::HashSet<String>,
}

impl InteractionSystem {
    pub fn new() -> Self {
        Self {
            mouse_position: (0.0, 0.0),
            pressed_keys: std::collections::HashSet::new(),
        }
    }

    pub fn process_input_batch(&mut self, events: Vec<InputEvent>) -> Result<Vec<GameAction>, String> {
        let mut actions = Vec::new();
        
        for event in events {
            if let Some(action) = self.process_input(event)? {
                actions.push(action);
            }
        }
        
        Ok(actions)
    }

    fn process_input(&mut self, event: InputEvent) -> Result<Option<GameAction>, String> {
        match event {
            InputEvent::MouseClick { x, y } => {
                self.mouse_position = (x, y);
                // For testing, clicking creates a sprite at that position
                Ok(Some(GameAction::AddSprite {
                    id: format!("sprite_{}_{}", x as u32, y as u32),
                    x,
                    y,
                    texture_id: "clicked_sprite".to_string(),
                }))
            },
            InputEvent::MouseMove { x, y } => {
                self.mouse_position = (x, y);
                Ok(None)
            },
            InputEvent::KeyPress { key } => {
                self.pressed_keys.insert(key.clone());
                match key.as_str() {
                    "c" | "C" => {
                        // Clear all sprites
                        Ok(None) // For now, we don't have a clear action
                    },
                    _ => Ok(None),
                }
            },
            InputEvent::KeyRelease { key } => {
                self.pressed_keys.remove(&key);
                Ok(None)
            },
        }
    }

    pub fn mouse_position(&self) -> (f32, f32) {
        self.mouse_position
    }

    pub fn is_key_pressed(&self, key: &str) -> bool {
        self.pressed_keys.contains(key)
    }

    pub fn get_pressed_keys(&self) -> Vec<String> {
        self.pressed_keys.iter().cloned().collect()
    }
}