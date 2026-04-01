use std::collections::HashMap;
use serde_json;
use crate::types::{Wall, WallType, WallDirection, DoorState};

/// Manages wall segments for a single virtual table.
///
/// Walls are first-class geometric entities separate from sprites.  They feed
/// directly into the lighting/vision pipeline as line segments and are rendered
/// as colour-coded overlays in the DM view.
pub struct WallManager {
    walls: HashMap<String, Wall>,
}

impl WallManager {
    pub fn new() -> Self {
        Self { walls: HashMap::new() }
    }

    // ------------------------------------------------------------------
    // CRUD
    // ------------------------------------------------------------------

    pub fn add_wall(&mut self, wall: Wall) {
        self.walls.insert(wall.wall_id.clone(), wall);
    }

    pub fn remove_wall(&mut self, wall_id: &str) -> bool {
        self.walls.remove(wall_id).is_some()
    }

    pub fn update_from_json(&mut self, wall_id: &str, json: &str) -> bool {
        if let Some(wall) = self.walls.get_mut(wall_id) {
            if let Ok(updates) = serde_json::from_str::<serde_json::Value>(json) {
                if let Some(v) = updates.get("x1").and_then(|v| v.as_f64()) { wall.x1 = v as f32; }
                if let Some(v) = updates.get("y1").and_then(|v| v.as_f64()) { wall.y1 = v as f32; }
                if let Some(v) = updates.get("x2").and_then(|v| v.as_f64()) { wall.x2 = v as f32; }
                if let Some(v) = updates.get("y2").and_then(|v| v.as_f64()) { wall.y2 = v as f32; }
                if let Some(v) = updates.get("blocks_movement").and_then(|v| v.as_bool()) { wall.blocks_movement = v; }
                if let Some(v) = updates.get("blocks_light").and_then(|v| v.as_bool())    { wall.blocks_light    = v; }
                if let Some(v) = updates.get("blocks_sight").and_then(|v| v.as_bool())    { wall.blocks_sight    = v; }
                if let Some(v) = updates.get("blocks_sound").and_then(|v| v.as_bool())    { wall.blocks_sound    = v; }
                if let Some(v) = updates.get("is_door").and_then(|v| v.as_bool())         { wall.is_door    = v; }
                if let Some(v) = updates.get("is_secret").and_then(|v| v.as_bool())       { wall.is_secret  = v; }
                if let Some(s) = updates.get("door_state").and_then(|v| v.as_str()) {
                    wall.door_state = match s {
                        "open"   => DoorState::Open,
                        "locked" => DoorState::Locked,
                        _        => DoorState::Closed,
                    };
                }
                if let Some(s) = updates.get("wall_type").and_then(|v| v.as_str()) {
                    wall.wall_type = match s {
                        "terrain"   => WallType::Terrain,
                        "invisible" => WallType::Invisible,
                        "ethereal"  => WallType::Ethereal,
                        "window"    => WallType::Window,
                        _           => WallType::Normal,
                    };
                }
                if let Some(s) = updates.get("direction").and_then(|v| v.as_str()) {
                    wall.direction = match s {
                        "left"  => WallDirection::Left,
                        "right" => WallDirection::Right,
                        _       => WallDirection::Both,
                    };
                }
                return true;
            }
        }
        false
    }

    pub fn clear(&mut self) {
        self.walls.clear();
    }

    pub fn count(&self) -> usize {
        self.walls.len()
    }

    // ------------------------------------------------------------------
    // Pipeline queries
    // ------------------------------------------------------------------

    /// Returns all wall segments that block light/sight as flat (x1,y1,x2,y2) f32 pairs.
    /// Open doors are excluded automatically.
    pub fn get_light_blocking_segments(&self) -> Vec<f32> {
        let mut out = Vec::with_capacity(self.walls.len() * 4);
        for wall in self.walls.values() {
            if wall.blocks_light && !self.door_is_open(wall) {
                out.push(wall.x1);
                out.push(wall.y1);
                out.push(wall.x2);
                out.push(wall.y2);
            }
        }
        out
    }

    // ------------------------------------------------------------------
    // Rendering data
    // ------------------------------------------------------------------

    /// Returns wall geometry + colour for DM overlay rendering.
    /// Each wall emits 8 floats: x1,y1,x2,y2,r,g,b,a
    pub fn get_render_data(&self) -> Vec<f32> {
        let mut out = Vec::with_capacity(self.walls.len() * 8);
        for wall in self.walls.values() {
            let (r, g, b, a) = wall_color(wall);
            out.push(wall.x1);
            out.push(wall.y1);
            out.push(wall.x2);
            out.push(wall.y2);
            out.push(r);
            out.push(g);
            out.push(b);
            out.push(a);
        }
        out
    }

    // ------------------------------------------------------------------
    // Internals
    // ------------------------------------------------------------------

    fn door_is_open(&self, wall: &Wall) -> bool {
        wall.is_door && matches!(wall.door_state, DoorState::Open)
    }

    /// Find the closest wall within `threshold` distance of `point`.
    /// Returns the wall_id if found.
    pub fn find_wall_at(&self, px: f32, py: f32, threshold: f32) -> Option<String> {
        let mut best_id: Option<&str> = None;
        let mut best_dist = threshold;
        for wall in self.walls.values() {
            let d = Self::point_segment_distance(px, py, wall.x1, wall.y1, wall.x2, wall.y2);
            if d < best_dist {
                best_dist = d;
                best_id = Some(&wall.wall_id);
            }
        }
        best_id.map(|s| s.to_string())
    }

    /// Get wall endpoints for a given wall_id.
    pub fn get_wall_endpoints(&self, wall_id: &str) -> Option<(f32, f32, f32, f32)> {
        self.walls.get(wall_id).map(|w| (w.x1, w.y1, w.x2, w.y2))
    }

    /// Translate a wall by (dx, dy).
    pub fn translate_wall(&mut self, wall_id: &str, dx: f32, dy: f32) -> bool {
        if let Some(wall) = self.walls.get_mut(wall_id) {
            wall.x1 += dx;
            wall.y1 += dy;
            wall.x2 += dx;
            wall.y2 += dy;
            true
        } else {
            false
        }
    }

    /// Shortest distance from point (px,py) to segment (ax,ay)-(bx,by).
    fn point_segment_distance(px: f32, py: f32, ax: f32, ay: f32, bx: f32, by: f32) -> f32 {
        let dx = bx - ax;
        let dy = by - ay;
        let len_sq = dx * dx + dy * dy;
        if len_sq < 1e-6 {
            return ((px - ax).powi(2) + (py - ay).powi(2)).sqrt();
        }
        let t = ((px - ax) * dx + (py - ay) * dy) / len_sq;
        let t = t.clamp(0.0, 1.0);
        let proj_x = ax + t * dx;
        let proj_y = ay + t * dy;
        ((px - proj_x).powi(2) + (py - proj_y).powi(2)).sqrt()
    }
}

/// DM colour-coding by wall type / state.
fn wall_color(wall: &Wall) -> (f32, f32, f32, f32) {
    if wall.is_door {
        return match wall.door_state {
            DoorState::Open   => (0.2, 0.8, 0.2, 1.0), // green  = open
            DoorState::Locked => (0.8, 0.2, 0.2, 1.0), // red    = locked
            DoorState::Closed => (0.8, 0.6, 0.0, 1.0), // orange = closed door
        };
    }
    match wall.wall_type {
        WallType::Normal    => (0.2, 0.2, 0.8, 1.0), // blue
        WallType::Terrain   => (0.5, 0.4, 0.2, 1.0), // brown
        WallType::Invisible => (0.7, 0.7, 0.7, 0.6), // grey
        WallType::Ethereal  => (0.6, 0.2, 0.8, 0.8), // purple
        WallType::Window    => (0.2, 0.8, 0.8, 0.8), // cyan
    }
}

// =============================================================================
// WASM exports — all operations go through the RenderEngine which owns
// the WallManager.  These thin helpers are called by render.rs.
// =============================================================================

impl WallManager {
    /// Parse a JSON wall object and add it to the manager.
    pub fn add_wall_from_json(&mut self, json: &str) -> bool {
        match serde_json::from_str::<Wall>(json) {
            Ok(wall) => { self.add_wall(wall); true }
            Err(_)   => false,
        }
    }
}
