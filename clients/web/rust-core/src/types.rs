use serde::{Serialize, Deserialize};
use crate::math::{Vec2, Rect};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Sprite {
    pub id: String,
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
}

impl Sprite {
    pub fn new(id: String, world_x: f64, world_y: f64, width: f64, height: f64, layer: String) -> Self {
        Self {
            id,
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

#[derive(Debug, Clone)]
pub struct Layer {
    pub sprites: Vec<Sprite>,
    pub opacity: f32,
    pub visible: bool,
    pub selectable: bool,
    pub z_order: i32,
}

impl Layer {
    pub fn new(z_order: i32) -> Self {
        Self {
            sprites: Vec::new(),
            opacity: 1.0,
            visible: true,
            selectable: true,
            z_order,
        }
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
