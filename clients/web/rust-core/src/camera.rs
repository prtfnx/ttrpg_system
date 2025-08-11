use crate::math::{Vec2, Mat3, Rect};

#[derive(Debug, Clone)]
pub struct Camera {
    pub world_x: f64,
    pub world_y: f64,
    pub zoom: f64,
    pub min_zoom: f64,
    pub max_zoom: f64,
}

impl Default for Camera {
    fn default() -> Self {
        Self {
            world_x: 0.0,
            world_y: 0.0,
            zoom: 1.0,
            min_zoom: 0.1,
            max_zoom: 5.0,
        }
    }
}

impl Camera {
    pub fn new(world_x: f64, world_y: f64, zoom: f64) -> Self {
        Self { 
            world_x, 
            world_y, 
            zoom: zoom.clamp(0.1, 5.0),
            min_zoom: 0.1,
            max_zoom: 5.0,
        }
    }

    pub fn with_zoom_limits(mut self, min_zoom: f64, max_zoom: f64) -> Self {
        self.min_zoom = min_zoom;
        self.max_zoom = max_zoom;
        self.zoom = self.zoom.clamp(min_zoom, max_zoom);
        self
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
        self.zoom = (self.zoom * zoom_factor).clamp(self.min_zoom, self.max_zoom);
        let world_point_after = self.screen_to_world(Vec2::new(screen_x, screen_y));
        let world_delta = world_point_before - world_point_after;
        self.world_x += world_delta.x as f64;
        self.world_y += world_delta.y as f64;
    }
    
    pub fn center_on(&mut self, world_x: f64, world_y: f64) {
        self.world_x = world_x;
        self.world_y = world_y;
    }

    pub fn set_zoom(&mut self, zoom: f64) {
        self.zoom = zoom.clamp(self.min_zoom, self.max_zoom);
    }

    pub fn set_position(&mut self, world_x: f64, world_y: f64) {
        self.world_x = world_x;
        self.world_y = world_y;
    }

    pub fn set_camera(&mut self, world_x: f64, world_y: f64, zoom: f64) {
        self.world_x = world_x;
        self.world_y = world_y;
        self.zoom = zoom.clamp(self.min_zoom, self.max_zoom);
    }

    pub fn pan(&mut self, world_delta_x: f64, world_delta_y: f64) {
        self.world_x += world_delta_x;
        self.world_y += world_delta_y;
    }
    
    pub fn pan_by_screen_delta(&mut self, screen_delta: Vec2) {
        let world_delta_x = screen_delta.x as f64 / self.zoom;
        let world_delta_y = screen_delta.y as f64 / self.zoom;
        self.pan(world_delta_x, world_delta_y);
    }

    pub fn get_world_view_bounds(&self, canvas_size: Vec2) -> Rect {
        let top_left = self.screen_to_world(Vec2::new(0.0, 0.0));
        let bottom_right = self.screen_to_world(canvas_size);
        
        Rect::new(
            top_left.x,
            top_left.y,
            bottom_right.x - top_left.x,
            bottom_right.y - top_left.y
        )
    }

    pub fn focus_on_rect(&mut self, rect: Rect, canvas_size: Vec2, padding: f32) {
        // Calculate the center of the rectangle
        let rect_center = Vec2::new(
            rect.min.x + (rect.max.x - rect.min.x) * 0.5,
            rect.min.y + (rect.max.y - rect.min.y) * 0.5
        );

        // Calculate zoom to fit the rectangle with padding
        let rect_width = rect.max.x - rect.min.x + padding * 2.0;
        let rect_height = rect.max.y - rect.min.y + padding * 2.0;
        
        let zoom_x = canvas_size.x / rect_width;
        let zoom_y = canvas_size.y / rect_height;
        let new_zoom = zoom_x.min(zoom_y).clamp(self.min_zoom as f32, self.max_zoom as f32) as f64;

        self.set_camera(rect_center.x as f64, rect_center.y as f64, new_zoom);
    }

    pub fn smooth_pan_to(&mut self, target_x: f64, target_y: f64, speed: f64) {
        let dx = target_x - self.world_x;
        let dy = target_y - self.world_y;
        
        self.world_x += dx * speed;
        self.world_y += dy * speed;
    }

    pub fn smooth_zoom_to(&mut self, target_zoom: f64, speed: f64) {
        let target_zoom = target_zoom.clamp(self.min_zoom, self.max_zoom);
        let dz = target_zoom - self.zoom;
        self.zoom += dz * speed;
        self.zoom = self.zoom.clamp(self.min_zoom, self.max_zoom);
    }
}
