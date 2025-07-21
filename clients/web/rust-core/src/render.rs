use wasm_bindgen::prelude::*;
use web_sys::{HtmlCanvasElement, CanvasRenderingContext2d, HtmlImageElement};
use std::collections::HashMap;
use crate::types::*;
use gloo_utils::format::JsValueSerdeExt;

#[wasm_bindgen]
pub struct RenderManager {
    canvas: HtmlCanvasElement,
    context: CanvasRenderingContext2d,
    sprites: Vec<Sprite>,
    layers: Vec<String>,
    camera: Camera,
    textures: HashMap<String, HtmlImageElement>,
    selected_sprite: Option<String>,
}

#[wasm_bindgen]
impl RenderManager {
    #[wasm_bindgen(constructor)]
    pub fn new(canvas: HtmlCanvasElement) -> Result<RenderManager, JsValue> {
        let context = canvas
            .get_context("2d")?
            .unwrap()
            .dyn_into::<CanvasRenderingContext2d>()?;

        let layers = vec![
            "background".to_string(),
            "map".to_string(),
            "obstacles".to_string(),
            "tokens".to_string(),
            "effects".to_string(),
            "ui".to_string(),
        ];

        Ok(RenderManager {
            canvas,
            context,
            sprites: Vec::new(),
            layers,
            camera: Camera::default(),
            textures: HashMap::new(),
            selected_sprite: None,
        })
    }

    #[wasm_bindgen]
    pub fn add_sprite(&mut self, sprite_data: &JsValue) -> Result<(), JsValue> {
        let sprite: Sprite = sprite_data.into_serde()
            .map_err(|e| JsValue::from_str(&format!("Failed to parse sprite: {}", e)))?;
        
        self.sprites.push(sprite);
        Ok(())
    }

    #[wasm_bindgen]
    pub fn remove_sprite(&mut self, sprite_id: &str) {
        self.sprites.retain(|s| s.id != sprite_id);
    }

    #[wasm_bindgen]
    pub fn update_sprites(&mut self, sprites_json: &str) -> Result<(), JsValue> {
        let sprites: Vec<Sprite> = serde_json::from_str(sprites_json)
            .map_err(|e| JsValue::from_str(&format!("Failed to parse sprites: {}", e)))?;
        
        self.sprites = sprites;
        Ok(())
    }

    #[wasm_bindgen]
    pub fn render_frame(&self) -> Result<(), JsValue> {
        // Clear canvas
        self.context.clear_rect(0.0, 0.0, 
            self.canvas.width() as f64, 
            self.canvas.height() as f64);

        // Set background
        self.context.set_fill_style(&"#1a1a1a".into());
        self.context.fill_rect(0.0, 0.0, 
            self.canvas.width() as f64, 
            self.canvas.height() as f64);

        // Render each layer
        for layer in &self.layers {
            self.render_layer(layer)?;
        }

        // Render selection highlight
        if let Some(selected_id) = &self.selected_sprite {
            self.render_selection_highlight(selected_id)?;
        }

        Ok(())
    }

    fn render_layer(&self, layer: &str) -> Result<(), JsValue> {
        for sprite in &self.sprites {
            if sprite.layer == layer {
                self.render_sprite(sprite)?;
            }
        }
        Ok(())
    }

    fn render_sprite(&self, sprite: &Sprite) -> Result<(), JsValue> {
        self.context.save();
        
        // Apply camera transform
        let screen_x = (sprite.x - self.camera.x) * self.camera.zoom;
        let screen_y = (sprite.y - self.camera.y) * self.camera.zoom;
        
        // Apply transformations
        self.context.translate(screen_x, screen_y)?;
        self.context.rotate(sprite.rotation);
        self.context.scale(sprite.scale_x * self.camera.zoom, sprite.scale_y * self.camera.zoom)?;
        
        // Draw sprite - check if texture exists
        if let Some(texture) = self.textures.get(&sprite.texture_path) {
            // Draw texture
            self.context.draw_image_with_html_image_element_and_dw_and_dh(
                texture,
                -sprite.width / 2.0, 
                -sprite.height / 2.0, 
                sprite.width, 
                sprite.height
            )?;
        } else {
            // Draw placeholder colored rectangle
            self.context.set_fill_style(&sprite.color.as_str().into());
            self.context.fill_rect(
                -sprite.width / 2.0, 
                -sprite.height / 2.0, 
                sprite.width, 
                sprite.height
            );
        }
        
        // Draw border
        self.context.set_stroke_style(&"#ffffff".into());
        self.context.set_line_width(1.0 / self.camera.zoom);
        self.context.stroke_rect(
            -sprite.width / 2.0, 
            -sprite.height / 2.0, 
            sprite.width, 
            sprite.height
        );
        
        self.context.restore();
        Ok(())
    }

    fn render_selection_highlight(&self, selected_id: &str) -> Result<(), JsValue> {
        if let Some(sprite) = self.sprites.iter().find(|s| s.id == selected_id) {
            self.context.save();
            
            let screen_x = sprite.x - self.camera.x;
            let screen_y = sprite.y - self.camera.y;
            
            self.context.translate(screen_x, screen_y)?;
            self.context.rotate(sprite.rotation);
            self.context.scale(sprite.scale_x, sprite.scale_y)?;
            
            // Draw selection highlight
            self.context.set_stroke_style(&"#00ff00".into());
            self.context.set_line_width(3.0);
            self.context.stroke_rect(
                -sprite.width / 2.0 - 5.0, 
                -sprite.height / 2.0 - 5.0, 
                sprite.width + 10.0, 
                sprite.height + 10.0
            );
            
            self.context.restore();
        }
        Ok(())
    }

    #[wasm_bindgen]
    pub fn handle_click(&mut self, x: f64, y: f64) -> Option<String> {
        let world_x = x + self.camera.x;
        let world_y = y + self.camera.y;
        
        // Check sprites in reverse order (top to bottom)
        for sprite in self.sprites.iter().rev() {
            if self.point_in_sprite(world_x, world_y, sprite) {
                self.selected_sprite = Some(sprite.id.clone());
                return Some(sprite.id.clone());
            }
        }
        
        self.selected_sprite = None;
        None
    }

    fn point_in_sprite(&self, x: f64, y: f64, sprite: &Sprite) -> bool {
        let dx = x - sprite.x;
        let dy = y - sprite.y;
        
        // Simple bounding box check (could be improved with rotation)
        dx.abs() <= sprite.width * sprite.scale_x / 2.0 && 
        dy.abs() <= sprite.height * sprite.scale_y / 2.0
    }

    #[wasm_bindgen]
    pub fn move_camera(&mut self, dx: f64, dy: f64) {
        self.camera.x += dx;
        self.camera.y += dy;
    }

    #[wasm_bindgen]
    pub fn set_camera(&mut self, x: f64, y: f64) {
        self.camera.x = x;
        self.camera.y = y;
    }

    #[wasm_bindgen]
    pub fn select_sprite(&mut self, sprite_id: &str) {
        self.selected_sprite = Some(sprite_id.to_string());
    }

    #[wasm_bindgen]
    pub fn get_selected_sprite(&self) -> Option<String> {
        self.selected_sprite.clone()
    }

    #[wasm_bindgen]
    pub fn load_texture(&mut self, texture_path: &str, image: HtmlImageElement) {
        self.textures.insert(texture_path.to_string(), image);
    }

    #[wasm_bindgen]
    pub fn zoom_camera(&mut self, zoom_delta: f64) {
        self.camera.zoom = (self.camera.zoom + zoom_delta).max(0.1).min(5.0);
    }

    #[wasm_bindgen]
    pub fn get_camera_position(&self) -> Vec<f64> {
        vec![self.camera.x, self.camera.y, self.camera.zoom]
    }

    #[wasm_bindgen]
    pub fn world_to_screen(&self, world_x: f64, world_y: f64) -> Vec<f64> {
        vec![
            (world_x - self.camera.x) * self.camera.zoom,
            (world_y - self.camera.y) * self.camera.zoom
        ]
    }

    #[wasm_bindgen]
    pub fn screen_to_world(&self, screen_x: f64, screen_y: f64) -> Vec<f64> {
        vec![
            screen_x / self.camera.zoom + self.camera.x,
            screen_y / self.camera.zoom + self.camera.y
        ]
    }
}
