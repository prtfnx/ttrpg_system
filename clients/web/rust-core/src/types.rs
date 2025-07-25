use serde::{Serialize, Deserialize};
// use wasm_bindgen::prelude::*;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Sprite {
    pub id: String,
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
    pub scale_x: f64,
    pub scale_y: f64,
    pub rotation: f64,
    pub layer: String,
    pub texture_path: String,
    pub color: String,
}

impl Sprite {
    pub fn new(
        id: String,
        x: f64,
        y: f64,
        width: f64,
        height: f64,
        layer: String,
    ) -> Sprite {
        Sprite {
            id,
            x,
            y,
            width,
            height,
            scale_x: 1.0,
            scale_y: 1.0,
            rotation: 0.0,
            layer,
            texture_path: String::new(),
            color: "#ffffff".to_string(),
        }
    }
}

#[derive(Debug, Clone)]
pub struct Camera {
    pub x: f64,
    pub y: f64,
    pub zoom: f64,
}

impl Default for Camera {
    fn default() -> Self {
        Self {
            x: 0.0,
            y: 0.0,
            zoom: 1.0,
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
