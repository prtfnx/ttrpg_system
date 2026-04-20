use crate::math::{Vec2, Mat3, Rect};

#[derive(Debug, Clone)]
#[cfg_attr(not(target_arch = "wasm32"), allow(dead_code))]
pub struct Camera {
    pub world_x: f64,
    pub world_y: f64,
    pub zoom: f64,
    pub min_zoom: f64,
    pub max_zoom: f64,
    pub table_bounds: Option<(f64, f64, f64, f64)>, // (x, y, width, height)
    pub allow_outside_table: bool,
}

impl Default for Camera {
    fn default() -> Self {
        Self {
            world_x: 0.0,
            world_y: 0.0,
            zoom: 1.0,
            min_zoom: 0.1,
            max_zoom: 5.0,
            table_bounds: None,
            allow_outside_table: true, // Allow some panning outside table by default
        }
    }
}

#[cfg_attr(not(target_arch = "wasm32"), allow(dead_code))]
impl Camera {
    pub fn set_table_bounds(&mut self, x: f64, y: f64, width: f64, height: f64) {
        self.table_bounds = Some((x, y, width, height));
        #[cfg(target_arch = "wasm32")]
        web_sys::console::log_1(&format!(
            "[CAMERA] Table bounds set: origin=({}, {}), size={}x{}", 
            x, y, width, height
        ).into());
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
        #[cfg(all(debug_assertions, target_arch = "wasm32"))]
        let old_zoom = self.zoom;
        self.zoom = (self.zoom * zoom_factor).clamp(self.min_zoom, self.max_zoom);
        let world_point_after = self.screen_to_world(Vec2::new(screen_x, screen_y));
        let world_delta = world_point_before - world_point_after;
        self.world_x += world_delta.x as f64;
        self.world_y += world_delta.y as f64;
        
        // Use debug log to avoid spamming console during frequent wheel events
        #[cfg(all(debug_assertions, target_arch = "wasm32"))]
        web_sys::console::debug_1(&format!(
            "[CAMERA-DEBUG] Zoom: {} → {} | Camera moved: ({}, {}) → ({}, {})",
            old_zoom, self.zoom, 
            self.world_x - world_delta.x as f64, self.world_y - world_delta.y as f64,
            self.world_x, self.world_y
        ).into());
        
        // Clamp to table bounds after zoom to prevent jump on first drag
        if let Some((tx, ty, tw, th)) = self.table_bounds {
            if self.allow_outside_table {
                let padding = 500.0;
                self.world_x = self.world_x.clamp(tx - padding, tx + tw + padding);
                self.world_y = self.world_y.clamp(ty - padding, ty + th + padding);
            } else {
                self.world_x = self.world_x.clamp(tx, tx + tw);
                self.world_y = self.world_y.clamp(ty, ty + th);
            }
        }
    }
    
    pub fn center_on(&mut self, world_x: f64, world_y: f64) {
        self.world_x = world_x;
        self.world_y = world_y;
    }

    #[allow(dead_code)] // Tested API; render/state.rs currently sets fields directly
    pub fn set_camera(&mut self, world_x: f64, world_y: f64, zoom: f64) {
        self.world_x = world_x;
        self.world_y = world_y;
        self.zoom = zoom.clamp(self.min_zoom, self.max_zoom);
    }

    pub fn pan(&mut self, world_delta_x: f64, world_delta_y: f64) {
        self.world_x += world_delta_x;
        self.world_y += world_delta_y;
        
        // Clamp to table bounds if set
        if let Some((tx, ty, tw, th)) = self.table_bounds {
            if self.allow_outside_table {
                // Allow panning somewhat outside table (for better UX)
                let padding = 500.0; // Can see 500px beyond table edges
                self.world_x = self.world_x.clamp(tx - padding, tx + tw + padding);
                self.world_y = self.world_y.clamp(ty - padding, ty + th + padding);
            } else {
                // Strict clamping to table bounds
                self.world_x = self.world_x.clamp(tx, tx + tw);
                self.world_y = self.world_y.clamp(ty, ty + th);
            }
        }
    }
    
    pub fn pan_by_screen_delta(&mut self, screen_delta: Vec2) {
        let world_delta_x = screen_delta.x as f64 / self.zoom;
        let world_delta_y = screen_delta.y as f64 / self.zoom;
        self.pan(world_delta_x, world_delta_y);
    }

    #[allow(dead_code)] // Tested API; not yet wired into new render/ module
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
}
#[cfg(test)]
mod tests {
    use super::*;
    use crate::math::Vec2;

    fn cam_at(wx: f64, wy: f64, zoom: f64) -> Camera {
        Camera { world_x: wx, world_y: wy, zoom, ..Default::default() }
    }

    #[test]
    fn screen_to_world_no_zoom() {
        let c = cam_at(0.0, 0.0, 1.0);
        let w = c.screen_to_world(Vec2::new(100.0, 200.0));
        assert_eq!((w.x, w.y), (100.0, 200.0));
    }

    #[test]
    fn world_to_screen_no_zoom() {
        let c = cam_at(0.0, 0.0, 1.0);
        let s = c.world_to_screen(Vec2::new(100.0, 200.0));
        assert_eq!((s.x, s.y), (100.0, 200.0));
    }

    #[test]
    fn screen_world_roundtrip() {
        let c = cam_at(150.0, 75.0, 2.5);
        let original = Vec2::new(300.0, 400.0);
        let screen = c.world_to_screen(original);
        let back = c.screen_to_world(screen);
        assert!((back.x - original.x).abs() < 1e-4);
        assert!((back.y - original.y).abs() < 1e-4);
    }

    #[test]
    fn world_to_screen_with_offset_and_zoom() {
        // world_x=100, zoom=2: screen_x = (world.x - 100) * 2
        let c = cam_at(100.0, 0.0, 2.0);
        let s = c.world_to_screen(Vec2::new(150.0, 0.0));
        assert_eq!(s.x, 100.0); // (150-100)*2 = 100
    }

    #[test]
    fn handle_wheel_zoom_in_clamped() {
        let mut c = Camera { min_zoom: 0.1, max_zoom: 5.0, zoom: 0.15, ..Default::default() };
        // delta_y < 0 zooms in (×1.1) → from 0.15 to 0.165, well within bounds
        c.handle_wheel(0.0, 0.0, -1.0);
        assert!(c.zoom > 0.15 && c.zoom <= 5.0);
    }

    #[test]
    fn handle_wheel_zoom_out_clamped_at_min() {
        let mut c = Camera { min_zoom: 0.1, max_zoom: 5.0, zoom: 0.1, ..Default::default() };
        // delta_y > 0 zooms out (×0.9) — already at min, should stay at min_zoom
        c.handle_wheel(0.0, 0.0, 1.0);
        assert!((c.zoom - 0.1).abs() < 1e-6);
    }

    #[test]
    fn handle_wheel_anchors_world_point() {
        // The world point under the cursor must remain at same screen position after zoom
        let mut c = cam_at(0.0, 0.0, 1.0);
        let sx = 200.0_f32;
        let sy = 150.0_f32;
        let world_before = c.screen_to_world(Vec2::new(sx, sy));
        c.handle_wheel(sx, sy, -1.0); // zoom in
        let world_after = c.screen_to_world(Vec2::new(sx, sy));
        assert!((world_before.x - world_after.x).abs() < 0.01);
        assert!((world_before.y - world_after.y).abs() < 0.01);
    }

    #[test]
    fn set_camera_clamps_zoom_to_max() {
        let mut c = Camera::default(); // max_zoom=5.0
        c.set_camera(0.0, 0.0, 99.0);
        assert_eq!(c.zoom, 5.0);
    }

    #[test]
    fn set_camera_clamps_zoom_to_min() {
        let mut c = Camera::default(); // min_zoom=0.1
        c.set_camera(0.0, 0.0, 0.0);
        assert_eq!(c.zoom, 0.1);
    }

    #[test]
    fn pan_moves_world_origin() {
        let mut c = cam_at(0.0, 0.0, 1.0);
        c.pan(50.0, -25.0);
        assert_eq!((c.world_x, c.world_y), (50.0, -25.0));
    }

    #[test]
    fn pan_by_screen_delta_accounts_for_zoom() {
        let mut c = cam_at(0.0, 0.0, 2.0);
        c.pan_by_screen_delta(Vec2::new(100.0, 50.0));
        // 100 screen pixels / zoom=2 = 50 world units
        assert!((c.world_x - 50.0).abs() < 1e-6);
        assert!((c.world_y - 25.0).abs() < 1e-6);
    }

    #[test]
    fn center_on_sets_world_position() {
        let mut c = Camera::default();
        c.center_on(500.0, 300.0);
        assert_eq!(c.world_x, 500.0);
        assert_eq!(c.world_y, 300.0);
    }

    #[test]
    fn view_matrix_identity_at_default() {
        let c = Camera::default(); // zoom=1, pos=0,0
        let m = c.view_matrix(Vec2::new(800.0, 600.0));
        // Scale should be 1,1 and translation 0,0
        assert_eq!(m.cols[0].x, 1.0); // scale_x
        assert_eq!(m.cols[1].y, 1.0); // scale_y
        assert_eq!(m.cols[2].x, 0.0); // translate_x
        assert_eq!(m.cols[2].y, 0.0); // translate_y
    }

    #[test]
    fn pan_clamped_by_table_bounds_strict() {
        let mut c = Camera::default();
        c.set_table_bounds(0.0, 0.0, 1000.0, 800.0);
        c.allow_outside_table = false;
        c.pan(-500.0, -500.0);
        assert_eq!(c.world_x, 0.0); // clamped at table min_x
        assert_eq!(c.world_y, 0.0);
    }

    #[test]
    fn pan_allowed_with_padding() {
        let mut c = Camera::default();
        c.set_table_bounds(0.0, 0.0, 1000.0, 800.0);
        c.allow_outside_table = true;
        c.pan(-200.0, 0.0);
        assert_eq!(c.world_x, -200.0); // within 500px padding
    }

    #[test]
    fn focus_on_rect_centers_and_zooms() {
        let mut c = Camera::default();
        let rect = Rect::new(100.0, 100.0, 200.0, 200.0);
        c.focus_on_rect(rect, Vec2::new(800.0, 600.0), 0.0);
        // Center should be at (200, 200)
        assert!((c.world_x - 200.0).abs() < 0.01);
        assert!((c.world_y - 200.0).abs() < 0.01);
    }
}
