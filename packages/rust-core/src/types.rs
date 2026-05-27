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

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
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
    
    // Character binding (optional)
    pub character_id: Option<String>,
    #[serde(default)]
    pub controlled_by: Vec<i32>,
    
    // Token stats (independent of character)
    pub hp: Option<i32>,
    pub max_hp: Option<i32>,
    pub ac: Option<i32>,
    pub aura_radius: Option<f64>,
    #[serde(default)]
    pub aura_color: Option<String>,
    
    // Text sprite fields
    pub is_text_sprite: Option<bool>,
    pub text_content: Option<String>,
    pub text_size: Option<f64>,
    pub text_color: Option<[f32; 4]>,

    // Obstacle shape metadata
    #[serde(default)]
    pub obstacle_type: Option<String>,  // "rectangle" | "circle" | "line" | "polygon"
    #[serde(default)]
    pub polygon_vertices: Option<Vec<[f32; 2]>>,  // world-space vertices for polygon obstacles
    #[serde(default)]
    pub shape_filled: Option<bool>,  // true = filled shape, false = outline only
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
            character_id: None,
            controlled_by: Vec::new(),
            hp: None,
            max_hp: None,
            ac: None,
            aura_radius: None,
            aura_color: None,
            is_text_sprite: None,
            text_content: None,
            text_size: None,
            text_color: None,
            obstacle_type: None,
            polygon_vertices: None,
            shape_filled: None,
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

#[cfg(test)]
mod shape_tests {
    use super::*;

    fn shape_sprite(obstacle_type: &str, filled: bool) -> Sprite {
        Sprite {
            id: obstacle_type.to_string(),
            world_x: 10.0, world_y: 20.0,
            width: 100.0, height: 50.0,
            scale_x: 1.0, scale_y: 1.0,
            obstacle_type: Some(obstacle_type.to_string()),
            shape_filled: Some(filled),
            tint_color: [1.0, 0.0, 0.0, 1.0],
            ..Default::default()
        }
    }

    #[test]
    fn sprite_default_shape_filled_is_none() {
        let s = Sprite::default();
        assert!(s.shape_filled.is_none());
        assert!(s.obstacle_type.is_none());
    }

    #[test]
    fn rectangle_sprite_stores_obstacle_type_and_fill() {
        let s = shape_sprite("rectangle", true);
        assert_eq!(s.obstacle_type.as_deref(), Some("rectangle"));
        assert_eq!(s.shape_filled, Some(true));
        assert!(s.texture_id.is_empty(), "shape sprites must not have a baked texture");
    }

    #[test]
    fn circle_sprite_outline_stores_filled_false() {
        let s = shape_sprite("circle", false);
        assert_eq!(s.obstacle_type.as_deref(), Some("circle"));
        assert_eq!(s.shape_filled, Some(false));
        assert!(s.texture_id.is_empty());
    }

    #[test]
    fn line_sprite_stores_endpoints_in_polygon_vertices() {
        let s = Sprite {
            id: "line_1".to_string(),
            world_x: 0.0, world_y: 0.0,
            width: 100.0, height: 4.0,
            scale_x: 1.0, scale_y: 1.0,
            obstacle_type: Some("line".to_string()),
            shape_filled: Some(false),
            polygon_vertices: Some(vec![[0.0, 0.0], [100.0, 50.0]]),
            tint_color: [0.0, 1.0, 0.0, 1.0],
            ..Default::default()
        };
        let verts = s.polygon_vertices.as_ref().unwrap();
        assert_eq!(verts.len(), 2);
        assert_eq!(verts[0], [0.0, 0.0]);
        assert_eq!(verts[1], [100.0, 50.0]);
    }

    #[test]
    fn shape_sprite_tint_color_carries_draw_color() {
        let s = shape_sprite("rectangle", true);
        assert_eq!(s.tint_color, [1.0, 0.0, 0.0, 1.0]);
    }

    #[test]
    fn shape_sprite_world_bounds_correct() {
        let s = shape_sprite("circle", true);
        let bounds = s.world_bounds();
        assert!((bounds.min.x - 10.0).abs() < 0.01);
        assert!((bounds.min.y - 20.0).abs() < 0.01);
        assert!((bounds.max.x - 110.0).abs() < 0.01);
        assert!((bounds.max.y - 70.0).abs() < 0.01);
    }

    #[test]
    fn sprite_serde_roundtrip_with_shape_fields() {
        let s = Sprite {
            id: "rect_test".to_string(),
            world_x: 5.0, world_y: 10.0,
            width: 80.0, height: 40.0,
            scale_x: 1.0, scale_y: 1.0,
            obstacle_type: Some("rectangle".to_string()),
            shape_filled: Some(false),
            tint_color: [0.2, 0.4, 0.8, 0.9],
            ..Default::default()
        };
        let json = serde_json::to_string(&s).unwrap();
        let back: Sprite = serde_json::from_str(&json).unwrap();
        assert_eq!(back.obstacle_type.as_deref(), Some("rectangle"));
        assert_eq!(back.shape_filled, Some(false));
        assert_eq!(back.tint_color, [0.2, 0.4, 0.8, 0.9]);
    }
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub enum BlendMode {
    #[default]
    Alpha,
    Additive,
    Modulate,
    Multiply,
}

impl BlendMode {
    #[cfg(target_arch = "wasm32")]
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
    /// RGBA tint applied to sprites on this layer when it is NOT the active layer
    pub tint_color: [f32; 4],
    /// Opacity multiplier when this layer is not active (0.0–1.0)
    pub inactive_opacity: f32,
}

impl Default for LayerSettings {
    fn default() -> Self {
        Self {
            color: [1.0, 1.0, 1.0], // White
            opacity: 1.0,
            blend_mode: BlendMode::Alpha,
            visible: true,
            z_order: 0,
            tint_color: [1.0, 1.0, 1.0, 1.0],
            inactive_opacity: 0.4,
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

// =============================================================================
// Wall segment types
// =============================================================================

#[derive(Debug, Clone, Default, PartialEq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum WallType {
    #[default]
    Normal,
    Terrain,
    Invisible,
    Ethereal,
    Window,
}

#[derive(Debug, Clone, Default, PartialEq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum DoorState {
    #[default]
    Closed,
    Open,
    Locked,
}

#[derive(Debug, Clone, Default, PartialEq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum WallDirection {
    #[default]
    Both,
    Left,
    Right,
}

/// A wall segment in world-space coordinates.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct Wall {
    pub wall_id: String,
    pub table_id: String,
    pub x1: f32,
    pub y1: f32,
    pub x2: f32,
    pub y2: f32,
    #[serde(default)] pub wall_type:       WallType,
    #[serde(default = "default_true")] pub blocks_movement: bool,
    #[serde(default = "default_true")] pub blocks_light:    bool,
    #[serde(default = "default_true")] pub blocks_sight:    bool,
    #[serde(default = "default_true")] pub blocks_sound:    bool,
    #[serde(default)] pub is_door:    bool,
    #[serde(default)] pub door_state: DoorState,
    #[serde(default)] pub is_secret:  bool,
    #[serde(default)] pub direction:  WallDirection,
}

fn default_true() -> bool { true }

#[cfg(test)]
mod tests {
    use super::*;
    use crate::math::Vec2;

    #[test]
    fn sprite_new_defaults() {
        let s = Sprite::new("s1".into(), 10.0, 20.0, 50.0, 50.0, "tokens".into());
        assert_eq!(s.id, "s1");
        assert_eq!(s.scale_x, 1.0);
        assert_eq!(s.scale_y, 1.0);
        assert_eq!(s.rotation, 0.0);
        assert_eq!(s.tint_color, [1.0, 1.0, 1.0, 1.0]);
        assert!(s.controlled_by.is_empty());
    }

    #[test]
    fn sprite_world_bounds_no_scale() {
        let s = Sprite::new("b".into(), 0.0, 0.0, 100.0, 100.0, "tokens".into());
        let bounds = s.world_bounds();
        // center = (50, 50), half = (50, 50)
        assert!((bounds.min.x - 0.0).abs() < 0.01);
        assert!((bounds.min.y - 0.0).abs() < 0.01);
        assert!((bounds.max.x - 100.0).abs() < 0.01);
        assert!((bounds.max.y - 100.0).abs() < 0.01);
    }

    #[test]
    fn sprite_contains_center_point() {
        let s = Sprite::new("c".into(), 0.0, 0.0, 100.0, 100.0, "tokens".into());
        assert!(s.contains_world_point(Vec2::new(50.0, 50.0)));
    }

    #[test]
    fn sprite_does_not_contain_outside_point() {
        let s = Sprite::new("d".into(), 0.0, 0.0, 100.0, 100.0, "tokens".into());
        assert!(!s.contains_world_point(Vec2::new(150.0, 50.0)));
    }

    #[test]
    fn sprite_serde_roundtrip() {
        let s = Sprite::new("rt".into(), 5.0, 10.0, 30.0, 40.0, "maps".into());
        let json = serde_json::to_string(&s).unwrap();
        let s2: Sprite = serde_json::from_str(&json).unwrap();
        assert_eq!(s.id, s2.id);
        assert_eq!(s.world_x, s2.world_x);
        assert_eq!(s.width, s2.width);
        assert_eq!(s.layer, s2.layer);
    }

    #[test]
    fn layer_settings_defaults() {
        let ls = LayerSettings::default();
        assert_eq!(ls.opacity, 1.0);
        assert!(ls.visible);
        assert_eq!(ls.color, [1.0, 1.0, 1.0]);
    }

    #[test]
    fn layer_set_opacity_clamps() {
        let mut l = Layer::new(0);
        l.set_opacity(2.5);
        assert_eq!(l.opacity(), 1.0);
        l.set_opacity(-1.0);
        assert_eq!(l.opacity(), 0.0);
    }

    #[test]
    fn color_white_black() {
        let w = Color::white();
        assert_eq!([w.r, w.g, w.b, w.a], [1.0, 1.0, 1.0, 1.0]);
        let b = Color::black();
        assert_eq!([b.r, b.g, b.b, b.a], [0.0, 0.0, 0.0, 1.0]);
    }
}

