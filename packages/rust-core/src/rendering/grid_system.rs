#[cfg(target_arch = "wasm32")]
use crate::math::Rect;
#[cfg(target_arch = "wasm32")]
use crate::webgl_renderer::WebGLRenderer;
#[cfg(target_arch = "wasm32")]
use wasm_bindgen::prelude::*;

#[cfg_attr(not(target_arch = "wasm32"), allow(dead_code))]
pub struct GridSystem {
    pub enabled: bool,
    pub size: f32,
    pub snapping: bool,
    /// Reusable vertex buffer to avoid per-frame allocation (WASM rendering only)
    #[cfg(target_arch = "wasm32")]
    line_buf: Vec<f32>,
    /// Reusable vertex buffer for snapping dots (WASM rendering only)
    #[cfg(target_arch = "wasm32")]
    dot_buf: Vec<f32>,
}

#[cfg_attr(not(target_arch = "wasm32"), allow(dead_code))]
impl GridSystem {
    pub fn new() -> Self {
        Self {
            enabled: true,
            size: 50.0,
            snapping: false,
            #[cfg(target_arch = "wasm32")]
            line_buf: Vec::with_capacity(1024),
            #[cfg(target_arch = "wasm32")]
            dot_buf: Vec::with_capacity(512),
        }
    }
    
    pub fn set_enabled(&mut self, enabled: bool) {
        self.enabled = enabled;
    }
    
    pub fn set_snapping(&mut self, enabled: bool) {
        self.snapping = enabled;
    }
    
    pub fn set_size(&mut self, size: f32) {
        self.size = size.max(10.0).min(200.0); // Reasonable bounds
    }

    /// Sync grid cell size from table's grid_cell_px. Use this instead of set_size().
    pub fn sync_from_table(&mut self, grid_cell_px: f32) {
        self.size = grid_cell_px.max(10.0).min(500.0);
    }
    
    pub fn get_size(&self) -> f32 {
        self.size
    }
}

#[cfg(target_arch = "wasm32")]
impl GridSystem {
    pub fn draw_grid(&mut self, renderer: &WebGLRenderer, world_bounds: Rect) -> Result<(), JsValue> {
        if !self.enabled {
            return Ok(());
        }
        
        let start_x = (world_bounds.min.x / self.size).floor() * self.size;
        let end_x = (world_bounds.max.x / self.size).ceil() * self.size;
        let start_y = (world_bounds.min.y / self.size).floor() * self.size;
        let end_y = (world_bounds.max.y / self.size).ceil() * self.size;
        
        self.line_buf.clear();
        
        // Vertical lines
        let mut x = start_x;
        while x <= end_x {
            self.line_buf.extend_from_slice(&[x, world_bounds.min.y, x, world_bounds.max.y]);
            x += self.size;
        }
        
        // Horizontal lines
        let mut y = start_y;
        while y <= end_y {
            self.line_buf.extend_from_slice(&[world_bounds.min.x, y, world_bounds.max.x, y]);
            y += self.size;
        }
        
        renderer.draw_lines(&self.line_buf, [0.2, 0.2, 0.2, 1.0])?;
        
        // Draw grid center dots if grid snapping is enabled (for visual reference)
        if self.snapping && self.size >= 30.0 {
            self.dot_buf.clear();
            let mut y = start_y + self.size * 0.5;
            while y <= end_y - self.size * 0.5 {
                let mut x = start_x + self.size * 0.5;
                while x <= end_x - self.size * 0.5 {
                    let dot_size = 2.0;
                    self.dot_buf.extend_from_slice(&[
                        x - dot_size, y,
                        x + dot_size, y,
                        x, y - dot_size,
                        x, y + dot_size,
                    ]);
                    x += self.size;
                }
                y += self.size;
            }
            if !self.dot_buf.is_empty() {
                renderer.draw_lines(&self.dot_buf, [0.4, 0.4, 0.4, 0.8])?;
            }
        }
        
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn new_grid_defaults() {
        let grid = GridSystem::new();
        assert!(grid.enabled);
        assert_eq!(grid.size, 50.0);
        assert!(!grid.snapping);
    }

    #[test]
    fn toggle_enabled() {
        let mut grid = GridSystem::new();
        grid.set_enabled(false);
        assert!(!grid.enabled);
        grid.set_enabled(true);
        assert!(grid.enabled);
    }

    #[test]
    fn toggle_snapping() {
        let mut grid = GridSystem::new();
        grid.set_snapping(true);
        assert!(grid.snapping);
        grid.set_snapping(false);
        assert!(!grid.snapping);
    }

    #[test]
    fn set_size_clamps_min() {
        let mut grid = GridSystem::new();
        grid.set_size(1.0);
        assert_eq!(grid.get_size(), 10.0);
    }

    #[test]
    fn set_size_clamps_max() {
        let mut grid = GridSystem::new();
        grid.set_size(999.0);
        assert_eq!(grid.get_size(), 200.0);
    }

    #[test]
    fn set_size_normal() {
        let mut grid = GridSystem::new();
        grid.set_size(75.0);
        assert_eq!(grid.get_size(), 75.0);
    }

    #[test]
    fn sync_from_table_clamps_range() {
        let mut grid = GridSystem::new();
        grid.sync_from_table(5.0);
        assert_eq!(grid.get_size(), 10.0);
        grid.sync_from_table(600.0);
        assert_eq!(grid.get_size(), 500.0);
        grid.sync_from_table(64.0);
        assert_eq!(grid.get_size(), 64.0);
    }

    #[test]
    fn set_enabled_explicit() {
        let mut grid = GridSystem::new();
        grid.set_enabled(false);
        assert!(!grid.enabled);
        grid.set_enabled(true);
        assert!(grid.enabled);
    }

    #[test]
    fn set_snapping_explicit() {
        let mut grid = GridSystem::new();
        grid.set_snapping(true);
        assert!(grid.snapping);
        grid.set_snapping(false);
        assert!(!grid.snapping);
    }
}
