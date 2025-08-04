use serde::{Serialize, Deserialize};

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Vec2 {
    pub x: f32,
    pub y: f32,
}

impl Vec2 {
    pub const fn new(x: f32, y: f32) -> Self {
        Self { x, y }
    }
    
    pub const fn splat(v: f32) -> Self {
        Self { x: v, y: v }
    }
    
    pub fn extend(self, z: f32) -> Vec3 {
        Vec3::new(self.x, self.y, z)
    }
}

impl std::ops::Add for Vec2 {
    type Output = Self;
    fn add(self, other: Self) -> Self {
        Self { x: self.x + other.x, y: self.y + other.y }
    }
}

impl std::ops::Sub for Vec2 {
    type Output = Self;
    fn sub(self, other: Self) -> Self {
        Self { x: self.x - other.x, y: self.y - other.y }
    }
}

impl std::ops::Mul<f32> for Vec2 {
    type Output = Self;
    fn mul(self, scalar: f32) -> Self {
        Self { x: self.x * scalar, y: self.y * scalar }
    }
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Vec3 {
    pub x: f32,
    pub y: f32,
    pub z: f32,
}

impl Vec3 {
    pub const fn new(x: f32, y: f32, z: f32) -> Self {
        Self { x, y, z }
    }
    
    pub fn truncate(self) -> Vec2 {
        Vec2::new(self.x, self.y)
    }
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Mat3 {
    pub cols: [Vec3; 3],
}

impl Mat3 {
    pub fn identity() -> Self {
        Self {
            cols: [
                Vec3::new(1.0, 0.0, 0.0),
                Vec3::new(0.0, 1.0, 0.0),
                Vec3::new(0.0, 0.0, 1.0),
            ]
        }
    }
    
    pub fn from_scale_translation(scale: Vec2, translation: Vec2) -> Self {
        Self {
            cols: [
                Vec3::new(scale.x, 0.0, 0.0),
                Vec3::new(0.0, scale.y, 0.0),
                Vec3::new(translation.x, translation.y, 1.0),
            ]
        }
    }
    
    pub fn inverse(self) -> Self {
        // For 2D scale+translation matrix, inverse is straightforward
        let sx = self.cols[0].x;
        let sy = self.cols[1].y;
        let tx = self.cols[2].x;
        let ty = self.cols[2].y;
        
        Self {
            cols: [
                Vec3::new(1.0 / sx, 0.0, 0.0),
                Vec3::new(0.0, 1.0 / sy, 0.0),
                Vec3::new(-tx / sx, -ty / sy, 1.0),
            ]
        }
    }
    
    pub fn to_array(self) -> [f32; 9] {
        [
            self.cols[0].x, self.cols[0].y, self.cols[0].z,
            self.cols[1].x, self.cols[1].y, self.cols[1].z,
            self.cols[2].x, self.cols[2].y, self.cols[2].z,
        ]
    }
}

impl std::ops::Mul<Vec2> for Mat3 {
    type Output = Vec2;
    fn mul(self, point: Vec2) -> Vec2 {
        let p = point.extend(1.0);
        let result = self * p;
        result.truncate()
    }
}

impl std::ops::Mul<Vec3> for Mat3 {
    type Output = Vec3;
    fn mul(self, vec: Vec3) -> Vec3 {
        Vec3::new(
            self.cols[0].x * vec.x + self.cols[1].x * vec.y + self.cols[2].x * vec.z,
            self.cols[0].y * vec.x + self.cols[1].y * vec.y + self.cols[2].y * vec.z,
            self.cols[0].z * vec.x + self.cols[1].z * vec.y + self.cols[2].z * vec.z,
        )
    }
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Rect {
    pub min: Vec2,
    pub max: Vec2,
}

impl Rect {
    pub fn from_center_size(center: Vec2, size: Vec2) -> Self {
        let half_size = size * 0.5;
        Self {
            min: center - half_size,
            max: center + half_size,
        }
    }
    
    pub fn contains(&self, point: Vec2) -> bool {
        point.x >= self.min.x && point.x <= self.max.x &&
        point.y >= self.min.y && point.y <= self.max.y
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Camera {
    pub world_x: f64,
    pub world_y: f64,
    pub zoom: f64,
}

impl Default for Camera {
    fn default() -> Self {
        Self {
            world_x: 0.0,
            world_y: 0.0,
            zoom: 1.0,
        }
    }
}

impl Camera {
    pub fn view_matrix(&self, canvas_size: Vec2) -> Mat3 {
        Mat3::from_scale_translation(
            Vec2::splat(self.zoom as f32),
            Vec2::new(-self.world_x as f32 * self.zoom as f32, -self.world_y as f32 * self.zoom as f32)
        )
    }
    
    pub fn world_to_screen(&self, world_pos: Vec2) -> Vec2 {
        Vec2::new(
            (world_pos.x as f64 - self.world_x) * self.zoom,
            (world_pos.y as f64 - self.world_y) * self.zoom,
        ) as Vec2
    }
    
    pub fn screen_to_world(&self, screen_pos: Vec2) -> Vec2 {
        Vec2::new(
            screen_pos.x as f64 / self.zoom + self.world_x,
            screen_pos.y as f64 / self.zoom + self.world_y,
        ) as Vec2
    }
}

impl From<Vec2> for Vec2 {
    fn from(v: Vec2) -> Self {
        v
    }
}

// Helper trait for f64 Vec2 conversion
impl From<Vec2> for (f64, f64) {
    fn from(v: Vec2) -> (f64, f64) {
        (v.x as f64, v.y as f64)
    }
}

impl From<(f64, f64)> for Vec2 {
    fn from((x, y): (f64, f64)) -> Self {
        Vec2::new(x as f32, y as f32)
    }
}
