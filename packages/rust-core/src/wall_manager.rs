use std::collections::HashMap;
use serde_json;
use crate::types::{Wall, WallType, WallDirection, DoorState};

/// Manages wall segments for a single virtual table.
///
/// Walls are first-class geometric entities separate from sprites.  They feed
/// directly into the lighting/vision pipeline as line segments and are rendered
/// as colour-coded overlays in the DM view.
#[cfg_attr(not(target_arch = "wasm32"), allow(dead_code))]
pub struct WallManager {
    walls: HashMap<String, Wall>,
}

#[cfg_attr(not(target_arch = "wasm32"), allow(dead_code))]
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

    #[cfg(test)]
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
    // Rendering data (WASM only — used by DM overlay rendering)
    // ------------------------------------------------------------------

    /// Returns wall geometry + colour for DM overlay rendering.
    /// Each wall emits 8 floats: x1,y1,x2,y2,r,g,b,a
    #[cfg(target_arch = "wasm32")]
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
#[cfg(target_arch = "wasm32")]
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

#[cfg_attr(not(target_arch = "wasm32"), allow(dead_code))]
impl WallManager {
    /// Parse a JSON wall object and add it to the manager.
    pub fn add_wall_from_json(&mut self, json: &str) -> bool {
        match serde_json::from_str::<Wall>(json) {
            Ok(wall) => { self.add_wall(wall); true }
            Err(_)   => false,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_wall(id: &str, x1: f32, y1: f32, x2: f32, y2: f32) -> Wall {
        Wall {
            wall_id: id.to_string(),
            table_id: "t1".to_string(),
            x1, y1, x2, y2,
            wall_type: WallType::Normal,
            blocks_movement: true,
            blocks_light: true,
            blocks_sight: true,
            blocks_sound: true,
            is_door: false,
            door_state: DoorState::Closed,
            is_secret: false,
            direction: WallDirection::Both,
        }
    }

    fn make_door(id: &str, state: DoorState) -> Wall {
        Wall {
            wall_id: id.to_string(),
            table_id: "t1".to_string(),
            x1: 0.0, y1: 0.0, x2: 100.0, y2: 0.0,
            wall_type: WallType::Normal,
            blocks_movement: true,
            blocks_light: true,
            blocks_sight: true,
            blocks_sound: true,
            is_door: true,
            door_state: state,
            is_secret: false,
            direction: WallDirection::Both,
        }
    }

    #[test]
    fn add_remove_count() {
        let mut wm = WallManager::new();
        wm.add_wall(make_wall("w1", 0.0, 0.0, 10.0, 0.0));
        wm.add_wall(make_wall("w2", 0.0, 0.0, 0.0, 10.0));
        wm.add_wall(make_wall("w3", 5.0, 5.0, 15.0, 5.0));
        assert_eq!(wm.count(), 3);
        assert!(wm.remove_wall("w2"));
        assert_eq!(wm.count(), 2);
        assert!(!wm.remove_wall("nonexistent"));
        assert_eq!(wm.count(), 2);
    }

    #[test]
    fn light_blocking_normal_wall() {
        let mut wm = WallManager::new();
        wm.add_wall(make_wall("w1", 0.0, 0.0, 50.0, 0.0));
        let segs = wm.get_light_blocking_segments();
        assert_eq!(segs, vec![0.0, 0.0, 50.0, 0.0]);
    }

    #[test]
    fn door_open_excluded_from_light_blocking() {
        let mut wm = WallManager::new();
        wm.add_wall(make_door("d1", DoorState::Open));
        let segs = wm.get_light_blocking_segments();
        assert!(segs.is_empty(), "open door must not block light");
    }

    #[test]
    fn door_closed_blocks_light() {
        let mut wm = WallManager::new();
        wm.add_wall(make_door("d1", DoorState::Closed));
        let segs = wm.get_light_blocking_segments();
        assert_eq!(segs.len(), 4);
    }

    #[test]
    fn door_locked_blocks_light() {
        let mut wm = WallManager::new();
        wm.add_wall(make_door("d1", DoorState::Locked));
        let segs = wm.get_light_blocking_segments();
        assert_eq!(segs.len(), 4);
    }

    #[test]
    fn non_blocking_wall_excluded_from_light() {
        let mut wm = WallManager::new();
        let mut w = make_wall("w1", 0.0, 0.0, 50.0, 0.0);
        w.blocks_light = false;
        wm.add_wall(w);
        assert!(wm.get_light_blocking_segments().is_empty());
    }

    #[test]
    fn translate_wall_moves_both_endpoints() {
        let mut wm = WallManager::new();
        wm.add_wall(make_wall("w1", 10.0, 20.0, 30.0, 40.0));
        assert!(wm.translate_wall("w1", 5.0, -10.0));
        let (x1, y1, x2, y2) = wm.get_wall_endpoints("w1").unwrap();
        assert_eq!((x1, y1, x2, y2), (15.0, 10.0, 35.0, 30.0));
    }

    #[test]
    fn translate_unknown_wall_returns_false() {
        let mut wm = WallManager::new();
        assert!(!wm.translate_wall("none", 1.0, 1.0));
    }

    #[test]
    fn find_wall_at_within_threshold() {
        let mut wm = WallManager::new();
        wm.add_wall(make_wall("w1", 0.0, 0.0, 100.0, 0.0));
        // Point 3 units above middle of segment — within threshold of 5
        let id = wm.find_wall_at(50.0, 3.0, 5.0);
        assert_eq!(id.as_deref(), Some("w1"));
    }

    #[test]
    fn find_wall_at_outside_threshold_returns_none() {
        let mut wm = WallManager::new();
        wm.add_wall(make_wall("w1", 0.0, 0.0, 100.0, 0.0));
        assert!(wm.find_wall_at(50.0, 20.0, 5.0).is_none());
    }

    #[test]
    fn get_wall_endpoints_returns_correct_coords() {
        let mut wm = WallManager::new();
        wm.add_wall(make_wall("w1", 1.5, 2.5, 3.5, 4.5));
        assert_eq!(wm.get_wall_endpoints("w1"), Some((1.5, 2.5, 3.5, 4.5)));
        assert_eq!(wm.get_wall_endpoints("missing"), None);
    }

    #[test]
    fn update_from_json_partial_update() {
        let mut wm = WallManager::new();
        wm.add_wall(make_wall("w1", 0.0, 0.0, 10.0, 0.0));
        let ok = wm.update_from_json("w1", r#"{"x2": 99.0, "blocks_light": false}"#);
        assert!(ok);
        let (_, _, x2, _) = wm.get_wall_endpoints("w1").unwrap();
        assert_eq!(x2, 99.0);
        // Non-blocking wall should now be absent from light segments
        assert!(wm.get_light_blocking_segments().is_empty());
    }

    #[test]
    fn add_wall_from_json_invalid_returns_false() {
        let mut wm = WallManager::new();
        assert!(!wm.add_wall_from_json("not json"));
        assert_eq!(wm.count(), 0);
    }

    #[test]
    fn light_blocking_segments_format_is_flat_quads() {
        let mut wm = WallManager::new();
        wm.add_wall(make_wall("w1", 1.0, 2.0, 3.0, 4.0));
        wm.add_wall(make_wall("w2", 5.0, 6.0, 7.0, 8.0));
        let segs = wm.get_light_blocking_segments();
        assert_eq!(segs.len(), 8); // 2 walls × 4 floats each
    }

    #[test]
    fn clear_removes_all_walls() {
        let mut wm = WallManager::new();
        wm.add_wall(make_wall("w1", 0.0, 0.0, 1.0, 0.0));
        wm.add_wall(make_wall("w2", 0.0, 0.0, 0.0, 1.0));
        wm.clear();
        assert_eq!(wm.count(), 0);
        assert!(wm.get_light_blocking_segments().is_empty());
    }
}
