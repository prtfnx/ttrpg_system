use std::collections::HashMap;
use wasm_bindgen::prelude::*;
use serde::{Serialize, Deserialize};
use crate::collision::CollisionSystem;

// ── Ghost token ───────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GhostToken {
    pub sprite_id: String,
    pub real_x: f32,
    pub real_y: f32,
    pub preview_x: f32,
    pub preview_y: f32,
    pub path: Vec<[f32; 2]>, // waypoints from real → preview
    pub movement_cost_ft: f32,
    pub opacity: f32,
}

// ── AoE template ─────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "shape")]
pub enum AoeTemplate {
    #[serde(rename = "sphere")]
    Sphere { cx: f32, cy: f32, radius: f32 },
    #[serde(rename = "cone")]
    Cone { ox: f32, oy: f32, angle: f32, length: f32 },
    #[serde(rename = "line")]
    Line { x1: f32, y1: f32, x2: f32, y2: f32, width: f32 },
    #[serde(rename = "cube")]
    Cube { cx: f32, cy: f32, side: f32 },
}

/// Return indices of tokens within the AoE template
fn tokens_in_aoe(template: &AoeTemplate, token_positions: &[[f32; 2]]) -> Vec<String> {
    token_positions.iter().enumerate().filter(|(_, p)| {
        let px = p[0]; let py = p[1];
        match template {
            AoeTemplate::Sphere { cx, cy, radius } => {
                let dx = px - cx; let dy = py - cy;
                dx*dx + dy*dy <= radius*radius
            }
            AoeTemplate::Cone { ox, oy, angle, length } => {
                let dx = px - ox; let dy = py - oy;
                let dist = (dx*dx + dy*dy).sqrt();
                if dist > *length { return false; }
                let tok_angle = (dy).atan2(dx);
                let half = (0.5_f32).atan(); // 5e cone: ±26.565° half-angle (53.13° total)
                let diff = (tok_angle - angle).abs() % (2.0 * std::f32::consts::PI);
                diff <= half || diff >= (2.0 * std::f32::consts::PI - half)
            }
            AoeTemplate::Line { x1, y1, x2, y2, width } => {
                // Distance from point to line segment
                let dx = x2 - x1; let dy = y2 - y1;
                let len2 = dx*dx + dy*dy;
                if len2 < 1e-6 { return false; }
                let t = ((px - x1)*dx + (py - y1)*dy) / len2;
                let t = t.clamp(0.0, 1.0);
                let nx = x1 + t*dx; let ny = y1 + t*dy;
                let ex = px - nx; let ey = py - ny;
                (ex*ex + ey*ey).sqrt() <= *width * 0.5
            }
            AoeTemplate::Cube { cx, cy, side } => {
                let h = side * 0.5;
                (px - cx).abs() <= h && (py - cy).abs() <= h
            }
        }
    }).map(|(i, _)| i.to_string()).collect()
}

// ── Planning manager ──────────────────────────────────────────────────

/// Client-side planning layer — computes previews without mutating game state.
/// All results are read-only overlays on top of committed state.
#[wasm_bindgen]
pub struct PlanningManager {
    ghost_tokens: HashMap<String, GhostToken>,
    aoe_template: Option<AoeTemplate>,
    collision: Option<CollisionSystem>,
    grid_size: f32,
    ft_per_unit: f32,
}

#[wasm_bindgen]
impl PlanningManager {
    #[wasm_bindgen(constructor)]
    pub fn new(grid_size: f32, ft_per_unit: f32) -> Self {
        Self {
            ghost_tokens: HashMap::new(),
            aoe_template: None,
            collision: None,
            grid_size,
            ft_per_unit,
        }
    }

    // ── Collision setup ───────────────────────────────────────────────

    pub fn set_walls(&mut self, json: &str) {
        let sys = self.collision.get_or_insert_with(|| CollisionSystem::new(self.grid_size));
        sys.set_walls(json);
    }

    pub fn set_obstacles(&mut self, json: &str) {
        let sys = self.collision.get_or_insert_with(|| CollisionSystem::new(self.grid_size));
        sys.set_obstacles(json);
    }

    // ── Ghost tokens ──────────────────────────────────────────────────

    /// Start previewing a token move. Returns movement cost in feet.
    pub fn start_ghost(&mut self, sprite_id: &str, real_x: f32, real_y: f32, preview_x: f32, preview_y: f32, speed_ft: f32) -> f32 {
        // Snap preview to grid
        let g = self.grid_size;
        let snapped_x = (preview_x / g).floor() * g + g * 0.5;
        let snapped_y = (preview_y / g).floor() * g + g * 0.5;

        let (path, cost) = if let Some(sys) = &self.collision {
            let raw = sys.find_path(real_x, real_y, snapped_x, snapped_y);
            let cost = sys.distance_ft(real_x, real_y, snapped_x, snapped_y, self.ft_per_unit);
            let waypoints = raw.chunks(2).map(|c| [c[0], c[1]]).collect();
            (waypoints, cost)
        } else {
            let cost = distance_ft_simple(real_x, real_y, snapped_x, snapped_y, self.grid_size, self.ft_per_unit);
            (vec![[real_x, real_y], [snapped_x, snapped_y]], cost)
        };

        // Ghost is dimmer if out of movement range
        let opacity = if cost <= speed_ft { 0.45 } else { 0.2 };

        self.ghost_tokens.insert(sprite_id.to_string(), GhostToken {
            sprite_id: sprite_id.to_string(),
            real_x,
            real_y,
            preview_x: snapped_x,
            preview_y: snapped_y,
            path,
            movement_cost_ft: cost,
            opacity,
        });
        cost
    }

    /// Remove a ghost token preview
    pub fn clear_ghost(&mut self, sprite_id: &str) {
        self.ghost_tokens.remove(sprite_id);
    }

    /// Remove all ghost previews
    pub fn clear_all(&mut self) {
        self.ghost_tokens.clear();
        self.aoe_template = None;
    }

    /// Get all ghost tokens as JSON
    pub fn get_ghosts(&self) -> JsValue {
        let ghosts: Vec<&GhostToken> = self.ghost_tokens.values().collect();
        serde_wasm_bindgen::to_value(&ghosts).unwrap_or(JsValue::NULL)
    }

    /// Get a single ghost token as JSON
    pub fn get_ghost(&self, sprite_id: &str) -> JsValue {
        match self.ghost_tokens.get(sprite_id) {
            Some(g) => serde_wasm_bindgen::to_value(g).unwrap_or(JsValue::NULL),
            None => JsValue::NULL,
        }
    }

    // ── Movement range overlay ────────────────────────────────────────

    /// Compute movement range BFS. Returns JSON with {normal, dash, blocked} cell arrays.
    pub fn movement_range(&self, sx: f32, sy: f32, speed_ft: f32, diagonal_5_10_5: bool) -> JsValue {
        if let Some(sys) = &self.collision {
            sys.movement_range(sx, sy, speed_ft, self.ft_per_unit, diagonal_5_10_5)
        } else {
            // No collision data — return single ring of reachable cells
            let cells = simple_range_cells(sx, sy, speed_ft, self.grid_size, self.ft_per_unit);
            serde_wasm_bindgen::to_value(&serde_json::json!({
                "normal": cells,
                "dash": [],
                "blocked": []
            })).unwrap_or(JsValue::NULL)
        }
    }

    // ── Distance measurement ──────────────────────────────────────────

    pub fn measure_ft(&self, x1: f32, y1: f32, x2: f32, y2: f32) -> f32 {
        if let Some(sys) = &self.collision {
            sys.distance_ft(x1, y1, x2, y2, self.ft_per_unit)
        } else {
            distance_ft_simple(x1, y1, x2, y2, self.grid_size, self.ft_per_unit)
        }
    }

    // ── AoE templates ─────────────────────────────────────────────────

    /// Set sphere AoE template
    pub fn set_aoe_sphere(&mut self, cx: f32, cy: f32, radius: f32) {
        self.aoe_template = Some(AoeTemplate::Sphere { cx, cy, radius });
    }

    /// Set cone AoE template (angle in radians)
    pub fn set_aoe_cone(&mut self, ox: f32, oy: f32, angle: f32, length: f32) {
        self.aoe_template = Some(AoeTemplate::Cone { ox, oy, angle, length });
    }

    /// Set line AoE template
    pub fn set_aoe_line(&mut self, x1: f32, y1: f32, x2: f32, y2: f32, width: f32) {
        self.aoe_template = Some(AoeTemplate::Line { x1, y1, x2, y2, width });
    }

    /// Set cube AoE template
    pub fn set_aoe_cube(&mut self, cx: f32, cy: f32, side: f32) {
        self.aoe_template = Some(AoeTemplate::Cube { cx, cy, side });
    }

    pub fn clear_aoe(&mut self) {
        self.aoe_template = None;
    }

    /// Get current AoE template as JSON
    pub fn get_aoe(&self) -> JsValue {
        match &self.aoe_template {
            Some(t) => serde_wasm_bindgen::to_value(t).unwrap_or(JsValue::NULL),
            None => JsValue::NULL,
        }
    }

    /// Given token positions (flat [x1,y1,x2,y2,...]), returns indices of tokens in AoE
    pub fn tokens_in_aoe(&self, positions_flat: Vec<f32>) -> JsValue {
        let template = match &self.aoe_template {
            Some(t) => t,
            None => return JsValue::NULL,
        };
        let positions: Vec<[f32; 2]> = positions_flat.chunks(2)
            .filter(|c| c.len() == 2)
            .map(|c| [c[0], c[1]])
            .collect();
        let indices = tokens_in_aoe(template, &positions);
        serde_wasm_bindgen::to_value(&indices).unwrap_or(JsValue::NULL)
    }

    // ── Line of sight ─────────────────────────────────────────────────

    /// True if there is clear line of sight from (x1,y1) to (x2,y2)
    pub fn has_los(&self, x1: f32, y1: f32, x2: f32, y2: f32) -> bool {
        match &self.collision {
            Some(sys) => !sys.line_blocked(x1, y1, x2, y2),
            None => true,
        }
    }
}

// ── Fallback helpers (no collision data) ──────────────────────────────

fn distance_ft_simple(x1: f32, y1: f32, x2: f32, y2: f32, grid_size: f32, ft_per_unit: f32) -> f32 {
    let g = grid_size;
    let dx = ((x2 - x1) / g).abs();
    let dy = ((y2 - y1) / g).abs();
    let cells = dx.max(dy); // Chebyshev
    cells * (g * ft_per_unit)
}

fn simple_range_cells(sx: f32, sy: f32, speed_ft: f32, grid_size: f32, ft_per_unit: f32) -> Vec<[f32; 2]> {
    let cells_radius = (speed_ft / (grid_size * ft_per_unit)).ceil() as i32;
    let scx = (sx / grid_size).floor() as i32;
    let scy = (sy / grid_size).floor() as i32;
    let mut result = Vec::new();
    for dx in -cells_radius..=cells_radius {
        for dy in -cells_radius..=cells_radius {
            let wx = (scx + dx) as f32 * grid_size + grid_size * 0.5;
            let wy = (scy + dy) as f32 * grid_size + grid_size * 0.5;
            let d = distance_ft_simple(sx, sy, wx, wy, grid_size, ft_per_unit);
            if d <= speed_ft && (dx != 0 || dy != 0) {
                result.push([wx, wy]);
            }
        }
    }
    result
}

// ── Tests ─────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ghost_snaps_to_grid() {
        let mut pm = PlanningManager::new(64.0, 5.0 / 64.0);
        // click at 90,90 → should snap to center of cell (1,1) = 96,96
        let cost = pm.start_ghost("s1", 32.0, 32.0, 90.0, 90.0, 30.0);
        let g = pm.ghost_tokens.get("s1").unwrap();
        assert!((g.preview_x - 96.0).abs() < 1.0);
        assert!((g.preview_y - 96.0).abs() < 1.0);
        assert!(cost >= 0.0);
    }

    #[test]
    fn aoe_sphere_contains_token() {
        let mut pm = PlanningManager::new(64.0, 5.0 / 64.0);
        pm.set_aoe_sphere(0.0, 0.0, 100.0);
        let positions = vec![50.0_f32, 0.0, 200.0, 0.0];
        // Use the non-wasm path
        let template = pm.aoe_template.as_ref().unwrap();
        let pos: Vec<[f32; 2]> = positions.chunks(2).map(|c| [c[0], c[1]]).collect();
        let hits = tokens_in_aoe(template, &pos);
        assert_eq!(hits, vec!["0"]);
    }

    #[test]
    fn measure_ft_straight() {
        let pm = PlanningManager::new(64.0, 5.0 / 64.0);
        // 64 units = 1 cell = 5ft  (ft_per_unit = 5/64)
        let d = pm.measure_ft(0.0, 0.0, 64.0, 0.0);
        assert!((d - 5.0).abs() < 0.1);
    }

    #[test]
    fn los_no_collision_data_returns_true() {
        let pm = PlanningManager::new(64.0, 5.0 / 64.0);
        assert!(pm.has_los(0.0, 0.0, 100.0, 100.0));
    }
}
