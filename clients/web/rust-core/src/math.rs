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
    
    pub fn length(self) -> f32 {
        (self.x * self.x + self.y * self.y).sqrt()
    }
    
    pub fn length_squared(self) -> f32 {
        self.x * self.x + self.y * self.y
    }
    
    pub fn normalize(self) -> Self {
        let len = self.length();
        if len > 0.0 {
            self * (1.0 / len)
        } else {
            Self::new(0.0, 0.0)
        }
    }

    /// Return the angle of the vector in radians, using atan2(y, x).
    pub fn angle(self) -> f32 {
        self.y.atan2(self.x)
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
    pub fn from_scale_translation(scale: Vec2, translation: Vec2) -> Self {
        Self {
            cols: [
                Vec3::new(scale.x, 0.0, 0.0),
                Vec3::new(0.0, scale.y, 0.0),
                Vec3::new(translation.x, translation.y, 1.0),
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
    pub fn new(x: f32, y: f32, width: f32, height: f32) -> Self {
        Self {
            min: Vec2::new(x, y),
            max: Vec2::new(x + width, y + height),
        }
    }
    
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
