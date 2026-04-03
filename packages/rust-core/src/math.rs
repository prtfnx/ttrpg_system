#[derive(Debug, Clone, Copy, PartialEq, serde::Serialize, serde::Deserialize)]
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

#[cfg(test)]
mod tests {
    use super::*;

    const EPSILON: f32 = 1e-5;

    fn approx(a: f32, b: f32) -> bool {
        (a - b).abs() < EPSILON
    }

    fn vec2_approx(a: Vec2, b: Vec2) -> bool {
        approx(a.x, b.x) && approx(a.y, b.y)
    }

    // ── Vec2 arithmetic ──────────────────────────────────────────────────────

    #[test]
    fn vec2_add() {
        let r = Vec2::new(1.0, 2.0) + Vec2::new(3.0, 4.0);
        assert!(vec2_approx(r, Vec2::new(4.0, 6.0)));
    }

    #[test]
    fn vec2_sub() {
        let r = Vec2::new(5.0, 5.0) - Vec2::new(2.0, 3.0);
        assert!(vec2_approx(r, Vec2::new(3.0, 2.0)));
    }

    #[test]
    fn vec2_mul_scalar() {
        let r = Vec2::new(2.0, 3.0) * 4.0;
        assert!(vec2_approx(r, Vec2::new(8.0, 12.0)));
    }

    // ── Vec2 geometry ────────────────────────────────────────────────────────

    #[test]
    fn vec2_length_345() {
        // Classic 3-4-5 right triangle → hypotenuse = 5
        let len = Vec2::new(3.0, 4.0).length();
        assert!(approx(len, 5.0), "expected 5.0, got {}", len);
    }

    #[test]
    fn vec2_normalize_unit_result() {
        let n = Vec2::new(3.0, 4.0).normalize();
        assert!(approx(n.length(), 1.0), "normalized length must be 1.0");
        assert!(approx(n.x, 0.6));
        assert!(approx(n.y, 0.8));
    }

    #[test]
    fn vec2_normalize_zero_vector_returns_zero() {
        // Must not panic or produce NaN
        let n = Vec2::new(0.0, 0.0).normalize();
        assert!(!n.x.is_nan() && !n.y.is_nan());
        assert!(vec2_approx(n, Vec2::new(0.0, 0.0)));
    }

    #[test]
    fn vec2_angle_right() {
        // Vector pointing right → angle = 0
        let a = Vec2::new(1.0, 0.0).angle();
        assert!(approx(a, 0.0), "expected 0, got {}", a);
    }

    #[test]
    fn vec2_angle_up() {
        // Vector pointing up → angle = π/2
        let a = Vec2::new(0.0, 1.0).angle();
        assert!(approx(a, std::f32::consts::FRAC_PI_2));
    }

    // ── Mat3 transform ───────────────────────────────────────────────────────

    #[test]
    fn mat3_scale_translation_transforms_point() {
        // scale=(2,3), translation=(10,20): maps (1,1) → (10+2, 20+3) = (12, 23)
        let m = Mat3::from_scale_translation(Vec2::new(2.0, 3.0), Vec2::new(10.0, 20.0));
        let p = m * Vec2::new(1.0, 1.0);
        assert!(vec2_approx(p, Vec2::new(12.0, 23.0)), "got {:?}", p);
    }

    #[test]
    fn mat3_identity_preserves_point() {
        let m = Mat3::from_scale_translation(Vec2::new(1.0, 1.0), Vec2::new(0.0, 0.0));
        let p = m * Vec2::new(7.0, -3.0);
        assert!(vec2_approx(p, Vec2::new(7.0, -3.0)));
    }

    #[test]
    fn mat3_to_array_column_major() {
        let m = Mat3::from_scale_translation(Vec2::new(2.0, 3.0), Vec2::new(10.0, 20.0));
        let arr = m.to_array();
        // Column 0: scale.x, 0, 0
        assert!(approx(arr[0], 2.0));
        assert!(approx(arr[1], 0.0));
        assert!(approx(arr[2], 0.0));
        // Column 1: 0, scale.y, 0
        assert!(approx(arr[3], 0.0));
        assert!(approx(arr[4], 3.0));
        assert!(approx(arr[5], 0.0));
        // Column 2: tx, ty, 1
        assert!(approx(arr[6], 10.0));
        assert!(approx(arr[7], 20.0));
        assert!(approx(arr[8], 1.0));
    }

    // ── Rect ─────────────────────────────────────────────────────────────────

    #[test]
    fn rect_contains_interior() {
        let r = Rect::new(0.0, 0.0, 100.0, 100.0);
        assert!(r.contains(Vec2::new(50.0, 50.0)));
    }

    #[test]
    fn rect_contains_corner_inclusive() {
        let r = Rect::new(0.0, 0.0, 100.0, 100.0);
        assert!(r.contains(Vec2::new(0.0, 0.0)));
        assert!(r.contains(Vec2::new(100.0, 100.0)));
    }

    #[test]
    fn rect_does_not_contain_outside() {
        let r = Rect::new(0.0, 0.0, 100.0, 100.0);
        assert!(!r.contains(Vec2::new(100.01, 50.0)));
        assert!(!r.contains(Vec2::new(50.0, -0.01)));
    }

    #[test]
    fn rect_from_center_size_symmetric() {
        let r = Rect::from_center_size(Vec2::new(50.0, 50.0), Vec2::new(20.0, 10.0));
        assert!(vec2_approx(r.min, Vec2::new(40.0, 45.0)));
        assert!(vec2_approx(r.max, Vec2::new(60.0, 55.0)));
    }
}
