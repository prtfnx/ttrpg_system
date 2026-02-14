use wasm_bindgen::prelude::*;
use wasm_bindgen_test::*;
use crate::core::Engine;
use crate::interaction::InputEvent;
use crate::content::{Scene, SceneItem, GameAction};
use web_sys::HtmlCanvasElement;

pub struct TestEngine {
    engine: Engine,
    canvas: HtmlCanvasElement,
}

impl TestEngine {
    pub fn new() -> Self {
        let window = web_sys::window().expect("should have window");
        let document = window.document().expect("should have document");
        let canvas = document
            .create_element("canvas")
            .expect("should create canvas")
            .dyn_into::<HtmlCanvasElement>()
            .expect("should cast to canvas");
        
        canvas.set_width(800);
        canvas.set_height(600);
        
        let engine = Engine::new(&canvas).expect("should create engine");
        
        Self { engine, canvas }
    }
    
    pub async fn create_sprite(&mut self, id: &str, x: f32, y: f32) {
        let action = GameAction::AddSprite {
            id: id.to_string(),
            x,
            y,
            texture_id: "test_texture".to_string(),
        };
        self.engine.content().apply_action(action).expect("should add sprite");
    }
    
    pub async fn click(&mut self, x: f32, y: f32) {
        let events = vec![InputEvent::MouseClick { x, y }];
        self.engine.handle_input(events).expect("should handle click");
    }
    
    pub async fn drag(&mut self, from_x: f32, from_y: f32, to_x: f32, to_y: f32) {
        let events = vec![
            InputEvent::MouseMove { x: from_x, y: from_y },
            InputEvent::MouseClick { x: from_x, y: from_y },
            InputEvent::MouseMove { x: to_x, y: to_y },
        ];
        self.engine.handle_input(events).expect("should handle drag");
    }
    
    pub fn selected_count(&self) -> usize {
        // For now, return 0 since selection system isn't fully implemented
        0
    }
    
    pub fn render(&mut self) {
        self.engine.render().expect("should render");
    }
    
    pub fn scene(&self) -> &Scene {
        self.engine.content().current_scene()
    }
}

pub fn assert_sprite_at_position(engine: &TestEngine, sprite_id: &str, expected_x: f32, expected_y: f32) {
    let scene = engine.scene();
    let sprite = scene.items.iter().find(|item| {
        if let SceneItem::Sprite { texture_id, .. } = item {
            texture_id == sprite_id
        } else {
            false
        }
    });
    
    if let Some(SceneItem::Sprite { x, y, .. }) = sprite {
        assert!((x - expected_x).abs() < 0.1, 
                "Sprite {} x-position: expected {}, got {}", sprite_id, expected_x, x);
        assert!((y - expected_y).abs() < 0.1,
                "Sprite {} y-position: expected {}, got {}", sprite_id, expected_y, y);
    } else {
        panic!("Sprite {} not found", sprite_id);
    }
}

pub fn create_test_canvas() -> HtmlCanvasElement {
    let window = web_sys::window().expect("should have window");
    let document = window.document().expect("should have document");
    let canvas = document
        .create_element("canvas")
        .expect("should create canvas")
        .dyn_into::<HtmlCanvasElement>()
        .expect("should cast to canvas");
    
    canvas.set_width(800);
    canvas.set_height(600);
    canvas
}