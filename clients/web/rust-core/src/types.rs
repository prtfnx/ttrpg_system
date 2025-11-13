use serde::{Serialize, Deserialize};
use crate::math::{Vec2, Rect};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Position {
    pub x: f64,
    pub y: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Size {
    pub width: f64,
    pub height: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Sprite {
    pub id: String,
    pub table_id: String, // NEW: Associates sprite with specific table
    pub world_x: f64,
    pub world_y: f64,
    pub width: f64,
    pub height: f64,
    pub scale_x: f64,
    pub scale_y: f64,
    pub rotation: f64,
    pub layer: String,
    pub texture_id: String,
    pub tint_color: [f32; 4],
    
    // Text sprite fields
    pub is_text_sprite: Option<bool>,
    pub text_content: Option<String>,
    pub text_size: Option<f64>,
    pub text_color: Option<[f32; 4]>,
}

impl Sprite {
    pub fn new(id: String, world_x: f64, world_y: f64, width: f64, height: f64, layer: String) -> Self {
        Self {
            id,
            table_id: "default_table".to_string(), // Default to default_table
            world_x,
            world_y,
            width,
            height,
            scale_x: 1.0,
            scale_y: 1.0,
            rotation: 0.0,
            layer,
            texture_id: String::new(),
            tint_color: [1.0, 1.0, 1.0, 1.0],
            is_text_sprite: None,
            text_content: None,
            text_size: None,
            text_color: None,
        }
    }
    
    pub fn world_bounds(&self) -> Rect {
        let scaled_width = (self.width * self.scale_x) as f32;
        let scaled_height = (self.height * self.scale_y) as f32;
        let center = Vec2::new(
            (self.world_x + scaled_width as f64 * 0.5) as f32,
            (self.world_y + scaled_height as f64 * 0.5) as f32
        );
        Rect::from_center_size(center, Vec2::new(scaled_width, scaled_height))
    }
    
    pub fn contains_world_point(&self, world_point: Vec2) -> bool {
        if self.rotation == 0.0 {
            // Simple bounding box check for non-rotated sprites
            self.world_bounds().contains(world_point)
        } else {
            // For rotated sprites, transform the world point to local sprite space
            let scaled_width = (self.width * self.scale_x) as f32;
            let scaled_height = (self.height * self.scale_y) as f32;
            let center = Vec2::new(
                (self.world_x + scaled_width as f64 * 0.5) as f32,
                (self.world_y + scaled_height as f64 * 0.5) as f32
            );
            
            // Translate to sprite center
            let relative_point = world_point - center;
            
            // Rotate the point by negative rotation to undo sprite rotation
            let cos_rot = (-self.rotation as f32).cos();
            let sin_rot = (-self.rotation as f32).sin();
            let local_x = relative_point.x * cos_rot - relative_point.y * sin_rot;
            let local_y = relative_point.x * sin_rot + relative_point.y * cos_rot;
            
            // Check if the rotated point is within the sprite bounds
            let half_width = scaled_width * 0.5;
            let half_height = scaled_height * 0.5;
            local_x >= -half_width && local_x <= half_width &&
            local_y >= -half_height && local_y <= half_height
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum BlendMode {
    Alpha,
    Additive,
    Modulate,
    Multiply,
}

impl Default for BlendMode {
    fn default() -> Self {
        BlendMode::Alpha
    }
}

impl BlendMode {
    pub fn to_webgl_equation(&self) -> (u32, u32) {
        use web_sys::WebGl2RenderingContext as GL;
        match self {
            BlendMode::Alpha => (GL::SRC_ALPHA, GL::ONE_MINUS_SRC_ALPHA),
            BlendMode::Additive => (GL::SRC_ALPHA, GL::ONE),
            BlendMode::Modulate => (GL::DST_COLOR, GL::ZERO),
            BlendMode::Multiply => (GL::DST_COLOR, GL::ZERO),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LayerSettings {
    pub color: [f32; 3], // RGB color as 0.0-1.0 values
    pub opacity: f32,
    pub blend_mode: BlendMode,
    pub visible: bool,
    pub z_order: i32,
}

impl Default for LayerSettings {
    fn default() -> Self {
        Self {
            color: [1.0, 1.0, 1.0], // White
            opacity: 1.0,
            blend_mode: BlendMode::Alpha,
            visible: true,
            z_order: 0,
        }
    }
}

#[derive(Debug, Clone)]
pub struct Layer {
    pub sprites: Vec<Sprite>,
    pub settings: LayerSettings,
    pub selectable: bool,
}

impl Layer {
    pub fn new(z_order: i32) -> Self {
        Self {
            sprites: Vec::new(),
            settings: LayerSettings {
                z_order,
                ..Default::default()
            },
            selectable: true,
        }
    }
    
    pub fn new_with_settings(settings: LayerSettings) -> Self {
        Self {
            sprites: Vec::new(),
            settings,
            selectable: true,
        }
    }
    
    // Convenience methods for backward compatibility
    pub fn opacity(&self) -> f32 {
        self.settings.opacity
    }
    
    pub fn visible(&self) -> bool {
        self.settings.visible
    }
    
    pub fn z_order(&self) -> i32 {
        self.settings.z_order
    }
    
    pub fn set_opacity(&mut self, opacity: f32) {
        self.settings.opacity = opacity.clamp(0.0, 1.0);
    }
    
    pub fn set_visibility(&mut self, visible: bool) {
        self.settings.visible = visible;
    }
    
    pub fn set_blend_mode(&mut self, blend_mode: BlendMode) {
        self.settings.blend_mode = blend_mode;
    }
    
    pub fn set_color(&mut self, r: f32, g: f32, b: f32) {
        self.settings.color = [r.clamp(0.0, 1.0), g.clamp(0.0, 1.0), b.clamp(0.0, 1.0)];
    }
}

#[derive(Debug, Clone)]
pub enum ConnectionState {
    Disconnected,
    Connecting,
    Connected,
    Error,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SpriteMove {
    pub sprite_id: String,
    pub x: f64,
    pub y: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SpriteCreate {
    pub sprite: Sprite,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SpriteDelete {
    pub sprite_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TableUpdate {
    pub table_id: String,
    pub sprites: Vec<Sprite>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GameMessage {
    pub message_type: String,
    pub data: String,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub struct Color {
    pub r: f32,
    pub g: f32,
    pub b: f32,
    pub a: f32,
}

impl Color {
    pub fn new(r: f32, g: f32, b: f32, a: f32) -> Self {
        Self { r, g, b, a }
    }
    
    pub fn white() -> Self {
        Self::new(1.0, 1.0, 1.0, 1.0)
    }
    
    pub fn black() -> Self {
        Self::new(0.0, 0.0, 0.0, 1.0)
    }
    
    pub fn red() -> Self {
        Self::new(1.0, 0.0, 0.0, 1.0)
    }
    
    pub fn green() -> Self {
        Self::new(0.0, 1.0, 0.0, 1.0)
    }
    
    pub fn blue() -> Self {
        Self::new(0.0, 0.0, 1.0, 1.0)
    }
    
    pub fn yellow() -> Self {
        Self::new(1.0, 1.0, 0.0, 1.0)
    }
    
    pub fn to_array(&self) -> [f32; 4] {
        [self.r, self.g, self.b, self.a]
    }
}
