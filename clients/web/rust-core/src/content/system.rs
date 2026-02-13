use std::collections::HashMap;

#[derive(Debug, Clone)]
pub struct Scene {
    pub items: Vec<SceneItem>,
}

impl Default for Scene {
    fn default() -> Self {
        Self {
            items: Vec::new(),
        }
    }
}

#[derive(Debug, Clone)]
pub enum SceneItem {
    Sprite { x: f32, y: f32, texture_id: String, scale: f32 },
    Text { x: f32, y: f32, content: String, color: String },
}

#[derive(Debug)]
pub enum GameAction {
    MoveSprite { id: String, x: f32, y: f32 },
    AddSprite { id: String, x: f32, y: f32, texture_id: String },
    RemoveSprite { id: String },
    UpdateText { id: String, content: String },
}

pub struct ContentSystem {
    current_scene: Scene,
    sprite_positions: HashMap<String, (f32, f32)>,
    next_id: u32,
}

impl ContentSystem {
    pub fn new() -> Self {
        Self {
            current_scene: Scene::default(),
            sprite_positions: HashMap::new(),
            next_id: 0,
        }
    }

    pub fn current_scene(&self) -> &Scene {
        &self.current_scene
    }

    pub fn apply_action(&mut self, action: GameAction) -> Result<(), String> {
        match action {
            GameAction::MoveSprite { id, x, y } => {
                self.sprite_positions.insert(id.clone(), (x, y));
                self.rebuild_scene();
                Ok(())
            },
            GameAction::AddSprite { id, x, y, texture_id } => {
                self.sprite_positions.insert(id.clone(), (x, y));
                self.current_scene.items.push(SceneItem::Sprite {
                    x, y, texture_id, scale: 1.0
                });
                Ok(())
            },
            GameAction::RemoveSprite { id } => {
                self.sprite_positions.remove(&id);
                self.rebuild_scene();
                Ok(())
            },
            GameAction::UpdateText { id: _, content: _ } => {
                // For now, just accept the action
                Ok(())
            },
        }
    }

    fn rebuild_scene(&mut self) {
        self.current_scene.items.clear();
        
        for (id, (x, y)) in &self.sprite_positions {
            self.current_scene.items.push(SceneItem::Sprite {
                x: *x,
                y: *y,
                texture_id: id.clone(),
                scale: 1.0,
            });
        }
    }

    pub fn add_test_content(&mut self) {
        self.current_scene.items.push(SceneItem::Sprite {
            x: 100.0,
            y: 100.0,
            texture_id: "test_sprite".to_string(),
            scale: 1.0,
        });

        self.current_scene.items.push(SceneItem::Text {
            x: 50.0,
            y: 50.0,
            content: "TTRPG System".to_string(),
            color: "white".to_string(),
        });
    }

    pub fn generate_id(&mut self) -> String {
        let id = format!("item_{}", self.next_id);
        self.next_id += 1;
        id
    }
}