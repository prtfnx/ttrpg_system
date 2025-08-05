use crate::math::{Vec2, Mat3};

#[derive(Debug, Clone)]
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
    pub fn new(world_x: f64, world_y: f64, zoom: f64) -> Self {
        Self { world_x, world_y, zoom }
    }
    
    pub fn view_matrix(&self, _canvas_size: Vec2) -> Mat3 {
        Mat3::from_scale_translation(
            Vec2::splat(self.zoom as f32),
            Vec2::new(-self.world_x as f32 * self.zoom as f32, -self.world_y as f32 * self.zoom as f32)
        )
    }
    
    pub fn screen_to_world(&self, screen_pos: Vec2) -> Vec2 {
        Vec2::new(
            (screen_pos.x / self.zoom as f32) + self.world_x as f32,
            (screen_pos.y / self.zoom as f32) + self.world_y as f32
        )
    }
    
    pub fn world_to_screen(&self, world_pos: Vec2) -> Vec2 {
        Vec2::new(
            (world_pos.x - self.world_x as f32) * self.zoom as f32,
            (world_pos.y - self.world_y as f32) * self.zoom as f32
        )
    }
    
    pub fn handle_wheel(&mut self, screen_x: f32, screen_y: f32, delta_y: f32) {
        let zoom_factor = if delta_y > 0.0 { 0.9 } else { 1.1 };
        let world_point_before = self.screen_to_world(Vec2::new(screen_x, screen_y));
        self.zoom = (self.zoom * zoom_factor).clamp(0.1, 5.0);
        let world_point_after = self.screen_to_world(Vec2::new(screen_x, screen_y));
        let world_delta = world_point_before - world_point_after;
        self.world_x += world_delta.x as f64;
        self.world_y += world_delta.y as f64;
    }
    
    pub fn center_on(&mut self, world_x: f64, world_y: f64) {
        self.world_x = world_x;
        self.world_y = world_y;
    }
}
