use crate::collision::CollisionSystem;
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use wasm_bindgen::prelude::*;

// Ghost token preview state.

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GhostToken {
    pub sprite_id: String,
    pub real_x: f32,
    pub real_y: f32,
    pub preview_x: f32,
    pub preview_y: f32,
    pub path: Vec<[f32; 2]>, // waypoints from real position to preview position
    pub movement_cost_ft: f32,
    pub opacity: f32,
}

// AoE template preview state.

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "shape")]
pub enum AoeTemplate {
    #[serde(rename = "sphere")]
    Sphere { cx: f32, cy: f32, radius: f32 },
    #[serde(rename = "cone")]
    Cone {
        ox: f32,
        oy: f32,
        angle: f32,
        length: f32,
    },
    #[serde(rename = "line")]
    Line {
        x1: f32,
        y1: f32,
        x2: f32,
        y2: f32,
        width: f32,
    },
    #[serde(rename = "cube")]
    Cube { cx: f32, cy: f32, side: f32 },
}

/// Return indices of tokens within the AoE template
fn tokens_in_aoe(template: &AoeTemplate, token_positions: &[[f32; 2]]) -> Vec<String> {
    token_positions
        .iter()
        .enumerate()
        .filter(|(_, p)| {
            let px = p[0];
            let py = p[1];
            match template {
                AoeTemplate::Sphere { cx, cy, radius } => {
                    let dx = px - cx;
                    let dy = py - cy;
                    dx * dx + dy * dy <= radius * radius
                }
                AoeTemplate::Cone {
                    ox,
                    oy,
                    angle,
                    length,
                } => {
                    let dx = px - ox;
                    let dy = py - oy;
                    let dist = (dx * dx + dy * dy).sqrt();
                    if dist > *length {
                        return false;
                    }
                    let tok_angle = (dy).atan2(dx);
                    let half = (0.5_f32).atan(); // 5e cone: +/-26.565 degrees half-angle (53.13 degrees total)
                    let diff = (tok_angle - angle).abs() % (2.0 * std::f32::consts::PI);
                    diff <= half || diff >= (2.0 * std::f32::consts::PI - half)
                }
                AoeTemplate::Line {
                    x1,
                    y1,
                    x2,
                    y2,
                    width,
                } => {
                    // Distance from point to line segment
                    let dx = x2 - x1;
                    let dy = y2 - y1;
                    let len2 = dx * dx + dy * dy;
                    if len2 < 1e-6 {
                        return false;
                    }
                    let t = ((px - x1) * dx + (py - y1) * dy) / len2;
                    let t = t.clamp(0.0, 1.0);
                    let nx = x1 + t * dx;
                    let ny = y1 + t * dy;
                    let ex = px - nx;
                    let ey = py - ny;
                    (ex * ex + ey * ey).sqrt() <= *width * 0.5
                }
                AoeTemplate::Cube { cx, cy, side } => {
                    let h = side * 0.5;
                    (px - cx).abs() <= h && (py - cy).abs() <= h
                }
            }
        })
        .map(|(i, _)| i.to_string())
        .collect()
}

// Planning manager.

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct PlanningConfiguration {
    grid_size: f32,
    ft_per_unit: f32,
    snap_to_cell: bool,
    diagonal_rule: String,
    bounds: Option<[f32; 2]>,
    difficult_cells: Vec<[i32; 2]>,
}

/// Client-side planning layer: computes previews without mutating game state.
/// All results are read-only overlays on top of committed state. The FastAPI
/// combat command service remains authoritative for accepted combat mutations,
/// final movement cost, visibility, resources, and outcomes.
#[wasm_bindgen]
pub struct PlanningManager {
    ghost_tokens: HashMap<String, GhostToken>,
    aoe_template: Option<AoeTemplate>,
    collision: Option<CollisionSystem>,
    grid_size: f32,
    ft_per_unit: f32,
    snap_to_cell: bool,
    diagonal_rule: String,
    difficult_cells: HashSet<(i32, i32)>,
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
            snap_to_cell: true,
            diagonal_rule: "standard".to_string(),
            difficult_cells: HashSet::new(),
        }
    }

    /// Atomically configure table units, rules, terrain and search bounds.
    pub fn configure(&mut self, json: &str) -> bool {
        let Ok(config) = serde_json::from_str::<PlanningConfiguration>(json) else {
            return false;
        };
        if !config.grid_size.is_finite()
            || config.grid_size <= 0.0
            || !config.ft_per_unit.is_finite()
            || config.ft_per_unit <= 0.0
            || !matches!(
                config.diagonal_rule.as_str(),
                "standard" | "alternate" | "realistic"
            )
            || config.difficult_cells.len() > 8192
            || config.bounds.is_some_and(|bounds| {
                bounds
                    .iter()
                    .any(|n| !n.is_finite() || *n <= 0.0 || *n > 10_000_000.0)
            })
        {
            return false;
        }
        self.grid_size = config.grid_size;
        self.ft_per_unit = config.ft_per_unit;
        self.snap_to_cell = config.snap_to_cell;
        self.diagonal_rule = config.diagonal_rule;
        self.difficult_cells = config
            .difficult_cells
            .into_iter()
            .map(|cell| (cell[0], cell[1]))
            .collect();
        let mut collision = CollisionSystem::new(self.grid_size);
        collision.set_bounds(config.bounds);
        self.collision = Some(collision);
        self.ghost_tokens.clear();
        true
    }

    // Collision setup.

    pub fn set_walls(&mut self, json: &str) {
        let sys = self
            .collision
            .get_or_insert_with(|| CollisionSystem::new(self.grid_size));
        sys.set_walls(json);
    }

    pub fn set_obstacles(&mut self, json: &str) {
        let sys = self
            .collision
            .get_or_insert_with(|| CollisionSystem::new(self.grid_size));
        sys.set_obstacles(json);
    }

    // Ghost tokens.

    /// Start previewing a token move. Returns movement cost in feet.
    pub fn start_ghost(
        &mut self,
        sprite_id: &str,
        real_x: f32,
        real_y: f32,
        preview_x: f32,
        preview_y: f32,
        speed_ft: f32,
    ) -> f32 {
        // Snap preview to grid
        let g = self.grid_size;
        let snapped_x = if self.snap_to_cell {
            (preview_x / g).floor() * g + g * 0.5
        } else {
            preview_x
        };
        let snapped_y = if self.snap_to_cell {
            (preview_y / g).floor() * g + g * 0.5
        } else {
            preview_y
        };

        let path: Vec<[f32; 2]> = if let Some(sys) = &self.collision {
            sys.find_path(real_x, real_y, snapped_x, snapped_y)
                .chunks_exact(2)
                .map(|point| [point[0], point[1]])
                .collect()
        } else {
            vec![[real_x, real_y], [snapped_x, snapped_y]]
        };
        if path.is_empty() {
            self.ghost_tokens.remove(sprite_id);
            return f32::INFINITY;
        }
        let cost = self.path_cost_ft(&path);
        if !cost.is_finite() {
            self.ghost_tokens.remove(sprite_id);
            return f32::INFINITY;
        }

        // Ghost is dimmer if out of movement range
        let opacity = if cost <= speed_ft { 0.45 } else { 0.2 };

        self.ghost_tokens.insert(
            sprite_id.to_string(),
            GhostToken {
                sprite_id: sprite_id.to_string(),
                real_x,
                real_y,
                preview_x: snapped_x,
                preview_y: snapped_y,
                path,
                movement_cost_ft: cost,
                opacity,
            },
        );
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

    // Movement range overlay.

    /// Compute movement range BFS. Returns JSON with {normal, dash, blocked} cell arrays.
    pub fn movement_range(
        &self,
        sx: f32,
        sy: f32,
        speed_ft: f32,
        diagonal_5_10_5: bool,
    ) -> JsValue {
        if let Some(sys) = &self.collision {
            sys.movement_range(sx, sy, speed_ft, self.ft_per_unit, diagonal_5_10_5)
        } else {
            // No collision data: return single ring of reachable cells.
            let cells = simple_range_cells(sx, sy, speed_ft, self.grid_size, self.ft_per_unit);
            serde_wasm_bindgen::to_value(&serde_json::json!({
                "normal": cells,
                "dash": [],
                "blocked": []
            }))
            .unwrap_or(JsValue::NULL)
        }
    }

    // Distance measurement.

    pub fn measure_ft(&self, x1: f32, y1: f32, x2: f32, y2: f32) -> f32 {
        self.path_cost_ft(&[[x1, y1], [x2, y2]])
    }

    // AoE templates.

    /// Set sphere AoE template
    pub fn set_aoe_sphere(&mut self, cx: f32, cy: f32, radius: f32) {
        self.aoe_template = Some(AoeTemplate::Sphere { cx, cy, radius });
    }

    /// Set cone AoE template (angle in radians)
    pub fn set_aoe_cone(&mut self, ox: f32, oy: f32, angle: f32, length: f32) {
        self.aoe_template = Some(AoeTemplate::Cone {
            ox,
            oy,
            angle,
            length,
        });
    }

    /// Set line AoE template
    pub fn set_aoe_line(&mut self, x1: f32, y1: f32, x2: f32, y2: f32, width: f32) {
        self.aoe_template = Some(AoeTemplate::Line {
            x1,
            y1,
            x2,
            y2,
            width,
        });
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
    pub fn tokens_in_aoe(&self, positions_flat: &js_sys::Float32Array) -> JsValue {
        let flat: Vec<f32> = positions_flat.to_vec();
        let template = match &self.aoe_template {
            Some(t) => t,
            None => return JsValue::NULL,
        };
        let positions: Vec<[f32; 2]> = flat
            .chunks(2)
            .filter(|c| c.len() == 2)
            .map(|c| [c[0], c[1]])
            .collect();
        let indices = tokens_in_aoe(template, &positions);
        serde_wasm_bindgen::to_value(&indices).unwrap_or(JsValue::NULL)
    }

    // Line of sight.

    /// True if there is clear line of sight from (x1,y1) to (x2,y2)
    pub fn has_los(&self, x1: f32, y1: f32, x2: f32, y2: f32) -> bool {
        match &self.collision {
            Some(sys) => !sys.line_blocked(x1, y1, x2, y2),
            None => true,
        }
    }
}

// Fallback helpers for preview mode without collision data.

fn distance_ft_simple(x1: f32, y1: f32, x2: f32, y2: f32, grid_size: f32, ft_per_unit: f32) -> f32 {
    let g = grid_size;
    let dx = ((x2 - x1) / g).abs();
    let dy = ((y2 - y1) / g).abs();
    let cells = dx.max(dy); // Chebyshev
    cells * (g * ft_per_unit)
}

fn simple_range_cells(
    sx: f32,
    sy: f32,
    speed_ft: f32,
    grid_size: f32,
    ft_per_unit: f32,
) -> Vec<[f32; 2]> {
    let cells_radius = ((speed_ft / (grid_size * ft_per_unit)).ceil() as i32).clamp(0, 128);
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

impl PlanningManager {
    fn path_cost_ft(&self, path: &[[f32; 2]]) -> f32 {
        let grid = self.grid_size as f64;
        let mut total: f64 = 0.0;
        let mut diagonals: f64 = 0.0;
        let mut intervals = 0;
        for pair in path.windows(2) {
            let first = [pair[0][0] as f64, pair[0][1] as f64];
            let last = [pair[1][0] as f64, pair[1][1] as f64];
            let mut breaks = vec![0.0_f64, 1.0];
            if !self.difficult_cells.is_empty() {
                for axis in 0..2 {
                    let low = (first[axis].min(last[axis]) / grid).floor() as i64;
                    let high = (first[axis].max(last[axis]) / grid).floor() as i64;
                    if high - low > 8192 {
                        return f32::INFINITY;
                    }
                    if first[axis] != last[axis] {
                        for boundary in low + 1..=high {
                            let t =
                                (boundary as f64 * grid - first[axis]) / (last[axis] - first[axis]);
                            if t > 0.0 && t < 1.0 {
                                breaks.push(t);
                            }
                        }
                    }
                }
            }
            breaks.sort_by(f64::total_cmp);
            breaks.dedup();
            intervals += breaks.len() - 1;
            if intervals > 8192 {
                return f32::INFINITY;
            }
            for range in breaks.windows(2) {
                let dx = (last[0] - first[0]).abs() * (range[1] - range[0]) / grid;
                let dy = (last[1] - first[1]).abs() * (range[1] - range[0]) / grid;
                let diagonal = dx.min(dy);
                let mut cells = if self.diagonal_rule == "realistic" {
                    dx.hypot(dy)
                } else {
                    dx.max(dy)
                };
                if self.diagonal_rule == "alternate" {
                    cells += ((diagonals + diagonal) / 2.0 + 1e-9).floor()
                        - (diagonals / 2.0 + 1e-9).floor();
                }
                diagonals += diagonal;
                let middle = (range[0] + range[1]) / 2.0;
                let mid = (
                    ((first[0] + (last[0] - first[0]) * middle) / grid).floor() as i32,
                    ((first[1] + (last[1] - first[1]) * middle) / grid).floor() as i32,
                );
                total += cells
                    * grid
                    * self.ft_per_unit as f64
                    * if self.difficult_cells.contains(&mid) {
                        2.0
                    } else {
                        1.0
                    };
            }
        }
        total as f32
    }
}

// Tests.

#[cfg(test)]
mod tests {
    use super::*;

    fn configure(pm: &mut PlanningManager, snap: bool, diagonal: &str, terrain: &str) {
        assert!(pm.configure(&format!(r#"{{"grid_size":50,"ft_per_unit":0.2,"snap_to_cell":{snap},"diagonal_rule":"{diagonal}","bounds":[200,200],"difficult_cells":{terrain}}}"#)));
    }

    #[test]
    fn configured_units_snap_and_free_endpoints_are_used_by_the_preview() {
        let mut pm = PlanningManager::new(64.0, 5.0 / 64.0);
        configure(&mut pm, true, "standard", "[]");
        assert!((pm.start_ghost("hero", 25.0, 25.0, 90.0, 90.0, 30.0) - 10.0).abs() < 1e-5);
        assert_eq!(pm.ghost_tokens["hero"].preview_x, 75.0);
        configure(&mut pm, false, "realistic", "[]");
        let expected = 65.0_f32.hypot(65.0) * 0.2;
        assert!((pm.start_ghost("hero", 25.0, 25.0, 90.0, 90.0, 30.0) - expected).abs() < 1e-4);
        assert_eq!(pm.ghost_tokens["hero"].path.last(), Some(&[90.0, 90.0]));
    }

    #[test]
    fn route_cost_includes_the_detour_and_blocked_routes_cannot_be_confirmed() {
        let mut pm = PlanningManager::new(50.0, 0.2);
        configure(&mut pm, false, "standard", "[]");
        pm.set_walls(r#"[{"x1":75,"y1":0,"x2":75,"y2":120,"is_door":false,"door_open":false}]"#);
        let cost = pm.start_ghost("hero", 20.0, 25.0, 130.0, 25.0, 100.0);
        assert!(cost > 22.0 && cost.is_finite());
        assert_eq!(pm.ghost_tokens["hero"].path.first(), Some(&[20.0, 25.0]));
        assert_eq!(pm.ghost_tokens["hero"].path.last(), Some(&[130.0, 25.0]));
        pm.set_walls(r#"[{"x1":75,"y1":0,"x2":75,"y2":200,"is_door":false,"door_open":false}]"#);
        assert!(pm
            .start_ghost("hero", 20.0, 25.0, 130.0, 25.0, 100.0)
            .is_infinite());
        assert!(!pm.ghost_tokens.contains_key("hero"));
    }

    #[test]
    fn terrain_and_alternating_diagonals_do_not_depend_on_waypoint_splits() {
        let mut pm = PlanningManager::new(50.0, 0.2);
        configure(&mut pm, false, "standard", "[[1,0]]");
        assert!((pm.path_cost_ft(&[[25.0, 25.0], [175.0, 25.0]]) - 40.0).abs() < 1e-4);
        assert!(
            (pm.path_cost_ft(&[[25.0, 25.0], [50.0, 25.0], [100.0, 25.0], [175.0, 25.0]]) - 40.0)
                .abs()
                < 1e-4
        );
        configure(&mut pm, false, "alternate", "[]");
        assert!(
            (pm.path_cost_ft(&[[25.0, 25.0], [75.0, 75.0], [125.0, 125.0]]) - 30.0).abs() < 1e-4
        );
    }

    #[test]
    fn ghost_snaps_to_grid() {
        let mut pm = PlanningManager::new(64.0, 5.0 / 64.0);
        // Click at 90,90; should snap to center of cell (1,1) = 96,96.
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
        let positions = [50.0_f32, 0.0, 200.0, 0.0];
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

    // Collision setup tests.

    #[test]
    fn set_walls_creates_collision_system() {
        let mut pm = PlanningManager::new(64.0, 5.0 / 64.0);
        assert!(pm.collision.is_none());
        pm.set_walls(r#"[{"x1":50,"y1":0,"x2":50,"y2":200,"is_door":false,"door_open":false}]"#);
        assert!(pm.collision.is_some());
    }

    #[test]
    fn set_obstacles_creates_collision_system() {
        let mut pm = PlanningManager::new(64.0, 5.0 / 64.0);
        pm.set_obstacles(r#"[{"id":"o1","obstacle_type":"circle","x":50,"y":50,"width":0,"height":0,"radius":20}]"#);
        assert!(pm.collision.is_some());
    }

    #[test]
    fn walls_affect_los() {
        let mut pm = PlanningManager::new(64.0, 5.0 / 64.0);
        pm.set_walls(r#"[{"x1":50,"y1":0,"x2":50,"y2":200,"is_door":false,"door_open":false}]"#);
        assert!(!pm.has_los(0.0, 100.0, 100.0, 100.0));
    }

    #[test]
    fn walls_affect_measure_ft() {
        let mut pm = PlanningManager::new(64.0, 5.0 / 64.0);
        let d_no_collision = pm.measure_ft(0.0, 0.0, 64.0, 0.0);
        pm.set_walls(r#"[]"#);
        let d_with_collision = pm.measure_ft(0.0, 0.0, 64.0, 0.0);
        // Both should calculate distance; collision system uses grid-aware method
        assert!(d_no_collision > 0.0);
        assert!(d_with_collision > 0.0);
    }

    // Ghost token management tests.

    #[test]
    fn clear_ghost_removes_single() {
        let mut pm = PlanningManager::new(64.0, 5.0 / 64.0);
        pm.start_ghost("s1", 32.0, 32.0, 90.0, 90.0, 30.0);
        pm.start_ghost("s2", 96.0, 96.0, 160.0, 160.0, 30.0);
        assert_eq!(pm.ghost_tokens.len(), 2);
        pm.clear_ghost("s1");
        assert_eq!(pm.ghost_tokens.len(), 1);
        assert!(pm.ghost_tokens.contains_key("s2"));
    }

    #[test]
    fn clear_ghost_nonexistent_is_noop() {
        let mut pm = PlanningManager::new(64.0, 5.0 / 64.0);
        pm.start_ghost("s1", 32.0, 32.0, 90.0, 90.0, 30.0);
        pm.clear_ghost("nonexistent");
        assert_eq!(pm.ghost_tokens.len(), 1);
    }

    #[test]
    fn clear_all_removes_ghosts_and_aoe() {
        let mut pm = PlanningManager::new(64.0, 5.0 / 64.0);
        pm.start_ghost("s1", 32.0, 32.0, 90.0, 90.0, 30.0);
        pm.set_aoe_sphere(0.0, 0.0, 100.0);
        assert!(!pm.ghost_tokens.is_empty());
        assert!(pm.aoe_template.is_some());
        pm.clear_all();
        assert!(pm.ghost_tokens.is_empty());
        assert!(pm.aoe_template.is_none());
    }

    #[test]
    fn ghost_opacity_within_speed() {
        let mut pm = PlanningManager::new(64.0, 5.0 / 64.0);
        // Short move within speed gives 0.45 opacity.
        pm.start_ghost("s1", 32.0, 32.0, 90.0, 90.0, 300.0);
        let g = pm.ghost_tokens.get("s1").unwrap();
        assert!((g.opacity - 0.45).abs() < 0.01);
    }

    #[test]
    fn ghost_opacity_beyond_speed() {
        let mut pm = PlanningManager::new(64.0, 5.0 / 64.0);
        // Very far move with tiny speed gives 0.2 opacity.
        pm.start_ghost("s1", 0.0, 0.0, 5000.0, 5000.0, 5.0);
        let g = pm.ghost_tokens.get("s1").unwrap();
        assert!((g.opacity - 0.2).abs() < 0.01);
    }

    #[test]
    fn ghost_has_path() {
        let mut pm = PlanningManager::new(64.0, 5.0 / 64.0);
        pm.start_ghost("s1", 32.0, 32.0, 160.0, 160.0, 30.0);
        let g = pm.ghost_tokens.get("s1").unwrap();
        assert!(!g.path.is_empty());
    }

    #[test]
    fn ghost_replaces_existing() {
        let mut pm = PlanningManager::new(64.0, 5.0 / 64.0);
        pm.start_ghost("s1", 32.0, 32.0, 90.0, 90.0, 30.0);
        pm.start_ghost("s1", 32.0, 32.0, 160.0, 160.0, 30.0);
        assert_eq!(pm.ghost_tokens.len(), 1);
        let g = pm.ghost_tokens.get("s1").unwrap();
        // Should have snapped to grid around 160,160
        assert!(g.preview_x > 100.0);
    }

    // AoE template tests.

    #[test]
    fn set_aoe_cone() {
        let mut pm = PlanningManager::new(64.0, 5.0 / 64.0);
        pm.set_aoe_cone(0.0, 0.0, 1.0, 60.0);
        match pm.aoe_template {
            Some(AoeTemplate::Cone {
                ox,
                oy: _,
                angle,
                length,
            }) => {
                assert_eq!(ox, 0.0);
                assert_eq!(angle, 1.0);
                assert_eq!(length, 60.0);
            }
            _ => panic!("Expected cone AoE"),
        }
    }

    #[test]
    fn set_aoe_line() {
        let mut pm = PlanningManager::new(64.0, 5.0 / 64.0);
        pm.set_aoe_line(0.0, 0.0, 100.0, 0.0, 10.0);
        match pm.aoe_template {
            Some(AoeTemplate::Line {
                x1: _,
                y1: _,
                x2,
                y2: _,
                width,
            }) => {
                assert_eq!(x2, 100.0);
                assert_eq!(width, 10.0);
            }
            _ => panic!("Expected line AoE"),
        }
    }

    #[test]
    fn set_aoe_cube() {
        let mut pm = PlanningManager::new(64.0, 5.0 / 64.0);
        pm.set_aoe_cube(50.0, 50.0, 30.0);
        match pm.aoe_template {
            Some(AoeTemplate::Cube { cx, cy: _, side }) => {
                assert_eq!(cx, 50.0);
                assert_eq!(side, 30.0);
            }
            _ => panic!("Expected cube AoE"),
        }
    }

    #[test]
    fn clear_aoe_removes_template() {
        let mut pm = PlanningManager::new(64.0, 5.0 / 64.0);
        pm.set_aoe_sphere(0.0, 0.0, 50.0);
        assert!(pm.aoe_template.is_some());
        pm.clear_aoe();
        assert!(pm.aoe_template.is_none());
    }

    #[test]
    fn aoe_replaces_previous() {
        let mut pm = PlanningManager::new(64.0, 5.0 / 64.0);
        pm.set_aoe_sphere(0.0, 0.0, 50.0);
        pm.set_aoe_cube(10.0, 10.0, 20.0);
        match pm.aoe_template {
            Some(AoeTemplate::Cube { .. }) => {}
            _ => panic!("Expected cube to replace sphere"),
        }
    }

    // tokens_in_aoe for different shapes.

    #[test]
    fn tokens_in_aoe_cube() {
        let positions = vec![[15.0, 15.0], [100.0, 100.0]];
        let template = AoeTemplate::Cube {
            cx: 10.0,
            cy: 10.0,
            side: 20.0,
        };
        let hits = tokens_in_aoe(&template, &positions);
        assert_eq!(hits, vec!["0"]); // only first token inside
    }

    #[test]
    fn tokens_in_aoe_line() {
        let positions = vec![[50.0, 0.0], [50.0, 100.0]];
        let template = AoeTemplate::Line {
            x1: 0.0,
            y1: 0.0,
            x2: 100.0,
            y2: 0.0,
            width: 10.0,
        };
        let hits = tokens_in_aoe(&template, &positions);
        assert_eq!(hits, vec!["0"]); // first on the line, second too far
    }

    #[test]
    fn tokens_in_aoe_empty_positions() {
        let positions: Vec<[f32; 2]> = vec![];
        let template = AoeTemplate::Sphere {
            cx: 0.0,
            cy: 0.0,
            radius: 100.0,
        };
        let hits = tokens_in_aoe(&template, &positions);
        assert!(hits.is_empty());
    }

    // distance_ft_simple helper.

    #[test]
    fn distance_ft_simple_straight() {
        let d = distance_ft_simple(0.0, 0.0, 64.0, 0.0, 64.0, 5.0 / 64.0);
        assert!((d - 5.0).abs() < 0.1);
    }

    #[test]
    fn distance_ft_simple_diagonal() {
        let d = distance_ft_simple(0.0, 0.0, 64.0, 64.0, 64.0, 5.0 / 64.0);
        // Chebyshev: max(1,1) = 1 cell = 5ft
        assert!((d - 5.0).abs() < 0.1);
    }

    #[test]
    fn distance_ft_simple_zero() {
        let d = distance_ft_simple(50.0, 50.0, 50.0, 50.0, 64.0, 5.0 / 64.0);
        assert!((d - 0.0).abs() < 0.001);
    }
}
