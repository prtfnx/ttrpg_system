use crate::math::{Vec2, Rect};
use crate::webgl_renderer::WebGLRenderer;
use wasm_bindgen::prelude::*;

pub struct GridSystem {
    pub enabled: bool,
    pub size: f32,
    pub snapping: bool,
}

impl GridSystem {
    pub fn new() -> Self {
        Self {
            enabled: true,
            size: 50.0,
            snapping: false,
        }
    }
    
    pub fn toggle(&mut self) {
        self.enabled = !self.enabled;
    }
    
    pub fn set_enabled(&mut self, enabled: bool) {
        self.enabled = enabled;
    }
    
    pub fn toggle_snapping(&mut self) {
        self.snapping = !self.snapping;
    }
    
    pub fn set_snapping(&mut self, enabled: bool) {
        self.snapping = enabled;
    }
    
    pub fn set_size(&mut self, size: f32) {
        self.size = size.max(10.0).min(200.0); // Reasonable bounds
    }
    
    pub fn get_size(&self) -> f32 {
        self.size
    }
    
    pub fn is_snapping_enabled(&self) -> bool {
        self.snapping
    }
    
    pub fn snap_to_grid(&self, world_pos: Vec2) -> Vec2 {
        if self.snapping {
            // Snap to grid line intersections, then we'll adjust for centering in the sprite positioning
            Vec2::new(
                (world_pos.x / self.size).round() * self.size,
                (world_pos.y / self.size).round() * self.size
            )
        } else {
            world_pos
        }
    }
    

    
    pub fn draw_grid(&self, renderer: &WebGLRenderer, world_bounds: Rect) -> Result<(), JsValue> {
        if !self.enabled {
            return Ok(());
        }
        
        let start_x = (world_bounds.min.x / self.size).floor() * self.size;
        let end_x = (world_bounds.max.x / self.size).ceil() * self.size;
        let start_y = (world_bounds.min.y / self.size).floor() * self.size;
        let end_y = (world_bounds.max.y / self.size).ceil() * self.size;
        
        let mut vertices = Vec::new();
        
        // Vertical lines
        let mut x = start_x;
        while x <= end_x {
            vertices.extend_from_slice(&[x, world_bounds.min.y, x, world_bounds.max.y]);
            x += self.size;
        }
        
        // Horizontal lines
        let mut y = start_y;
        while y <= end_y {
            vertices.extend_from_slice(&[world_bounds.min.x, y, world_bounds.max.x, y]);
            y += self.size;
        }
        
        renderer.draw_lines(&vertices, [0.2, 0.2, 0.2, 1.0])?;
        
        // Draw grid center dots if grid snapping is enabled (for visual reference)
        if self.snapping && self.size >= 30.0 {
            let mut center_vertices = Vec::new();
            let mut y = start_y + self.size * 0.5;
            while y <= end_y - self.size * 0.5 {
                let mut x = start_x + self.size * 0.5;
                while x <= end_x - self.size * 0.5 {
                    let dot_size = 2.0;
                    center_vertices.extend_from_slice(&[
                        x - dot_size, y,
                        x + dot_size, y,
                        x, y - dot_size,
                        x, y + dot_size,
                    ]);
                    x += self.size;
                }
                y += self.size;
            }
            if !center_vertices.is_empty() {
                renderer.draw_lines(&center_vertices, [0.4, 0.4, 0.4, 0.8])?;
            }
        }
        
        Ok(())
    }
}
