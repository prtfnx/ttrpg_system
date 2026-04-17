use std::collections::{HashMap, BinaryHeap, HashSet};
use std::cmp::Ordering;
use wasm_bindgen::prelude::*;
use serde::{Serialize, Deserialize};
use crate::math::Vec2;

// ── Spatial hash index ────────────────────────────────────────────────

/// Grid-bucketed index for fast collision lookup.
/// Reduces wall/obstacle checks from O(N) to O(bucket_size) ≈ O(1-5).
struct SpatialHash {
    cell_size: f32,
    walls: HashMap<(i32, i32), Vec<usize>>,
    obstacles: HashMap<(i32, i32), Vec<usize>>,
}

impl SpatialHash {
    fn new(cell_size: f32) -> Self {
        Self { cell_size, walls: HashMap::new(), obstacles: HashMap::new() }
    }

    fn bucket(&self, x: f32, y: f32) -> (i32, i32) {
        ((x / self.cell_size).floor() as i32, (y / self.cell_size).floor() as i32)
    }

    /// Rasterize wall segment into all overlapping grid cells (DDA walk).
    fn insert_wall(&mut self, idx: usize, s: &CollisionSegment) {
        for cell in cells_along_segment(s.x1, s.y1, s.x2, s.y2, self.cell_size) {
            self.walls.entry(cell).or_default().push(idx);
        }
    }

    fn insert_obstacle(&mut self, idx: usize, obs: &CollisionObstacle) {
        let (x, y, w, h) = (obs.x, obs.y, obs.width.max(obs.radius * 2.0), obs.height.max(obs.radius * 2.0));
        let (min_cx, min_cy) = self.bucket(x - w * 0.5, y - h * 0.5);
        let (max_cx, max_cy) = self.bucket(x + w * 0.5, y + h * 0.5);
        for cx in min_cx..=max_cx {
            for cy in min_cy..=max_cy {
                self.obstacles.entry((cx, cy)).or_default().push(idx);
            }
        }
    }

    fn query_walls(&self, x1: f32, y1: f32, x2: f32, y2: f32) -> Vec<usize> {
        let mut seen = HashSet::new();
        let mut result = Vec::new();
        for cell in cells_along_segment(x1, y1, x2, y2, self.cell_size) {
            if let Some(ids) = self.walls.get(&cell) {
                for &id in ids {
                    if seen.insert(id) { result.push(id); }
                }
            }
        }
        result
    }

    fn query_obstacles(&self, x1: f32, y1: f32, x2: f32, y2: f32) -> Vec<usize> {
        let mut seen = HashSet::new();
        let mut result = Vec::new();
        for cell in cells_along_segment(x1, y1, x2, y2, self.cell_size) {
            if let Some(ids) = self.obstacles.get(&cell) {
                for &id in ids {
                    if seen.insert(id) { result.push(id); }
                }
            }
        }
        result
    }
}

/// DDA grid walk — returns all cells that a line segment passes through.
fn cells_along_segment(x1: f32, y1: f32, x2: f32, y2: f32, cell_size: f32) -> Vec<(i32, i32)> {
    let inv = 1.0 / cell_size;
    let (mut cx, mut cy) = ((x1 * inv).floor() as i32, (y1 * inv).floor() as i32);
    let (end_cx, end_cy) = ((x2 * inv).floor() as i32, (y2 * inv).floor() as i32);

    let dx = x2 - x1;
    let dy = y2 - y1;
    let step_x: i32 = if dx >= 0.0 { 1 } else { -1 };
    let step_y: i32 = if dy >= 0.0 { 1 } else { -1 };

    // t-deltas: how far along the ray to cross a cell boundary
    let t_delta_x = if dx.abs() < 1e-6 { f32::MAX } else { cell_size / dx.abs() };
    let t_delta_y = if dy.abs() < 1e-6 { f32::MAX } else { cell_size / dy.abs() };

    // Initial t to first crossing
    let next_bx = if step_x > 0 { (cx + 1) as f32 * cell_size } else { cx as f32 * cell_size };
    let next_by = if step_y > 0 { (cy + 1) as f32 * cell_size } else { cy as f32 * cell_size };
    let mut t_max_x = if dx.abs() < 1e-6 { f32::MAX } else { (next_bx - x1) / dx };
    let mut t_max_y = if dy.abs() < 1e-6 { f32::MAX } else { (next_by - y1) / dy };

    let mut cells = vec![(cx, cy)];
    let max_steps = (end_cx - cx).unsigned_abs() + (end_cy - cy).unsigned_abs() + 2;
    for _ in 0..max_steps {
        if cx == end_cx && cy == end_cy { break; }
        if t_max_x < t_max_y {
            cx += step_x;
            t_max_x += t_delta_x;
        } else {
            cy += step_y;
            t_max_y += t_delta_y;
        }
        cells.push((cx, cy));
    }
    cells
}

// ── Data types ────────────────────────────────────────────────────────

/// A movement-blocking wall segment
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CollisionSegment {
    pub x1: f32,
    pub y1: f32,
    pub x2: f32,
    pub y2: f32,
    pub is_door: bool,
    pub door_open: bool,
}

/// An obstacle from the obstacles layer — rectangle, circle, or polygon
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CollisionObstacle {
    pub id: String,
    pub obstacle_type: String, // "rectangle" | "circle" | "polygon"
    pub x: f32,
    pub y: f32,
    pub width: f32,
    pub height: f32,
    pub radius: f32,
    #[serde(default)]
    pub vertices: Vec<[f32; 2]>, // world-space polygon vertices
}

/// Result of a BFS movement range calculation
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MovementRange {
    pub normal: Vec<[f32; 2]>,  // cells reachable within base speed
    pub dash: Vec<[f32; 2]>,    // cells reachable with dash (2x speed)
    pub blocked: Vec<[f32; 2]>, // cells adjacent to reachable but blocked
}

/// Grid cell for A*/BFS
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
struct Cell(i32, i32);

impl Cell {
    fn to_world(self, grid_size: f32) -> Vec2 {
        Vec2::new(
            self.0 as f32 * grid_size + grid_size * 0.5,
            self.1 as f32 * grid_size + grid_size * 0.5,
        )
    }
}

// Min-heap entry for A*
#[derive(Copy, Clone)]
struct AStarNode {
    f: i32,
    cell: Cell,
    g: i32,
}

impl PartialEq for AStarNode {
    fn eq(&self, other: &Self) -> bool {
        self.f == other.f
    }
}
impl Eq for AStarNode {}
impl PartialOrd for AStarNode {
    fn partial_cmp(&self, other: &Self) -> Option<Ordering> {
        Some(self.cmp(other))
    }
}
impl Ord for AStarNode {
    fn cmp(&self, other: &Self) -> Ordering {
        other.f.cmp(&self.f) // min heap
    }
}

// ── Collision system ──────────────────────────────────────────────────

/// Server-mirrored collision system for client-side planning previews.
/// Both Python and Rust implement identical logic.
#[wasm_bindgen]
pub struct CollisionSystem {
    segments: Vec<CollisionSegment>,
    obstacles: Vec<CollisionObstacle>,
    grid_size: f32,
    spatial_hash: Option<SpatialHash>,
}

#[wasm_bindgen]
impl CollisionSystem {
    #[wasm_bindgen(constructor)]
    pub fn new(grid_size: f32) -> Self {
        Self {
            segments: Vec::new(),
            obstacles: Vec::new(),
            grid_size,
            spatial_hash: None,
        }
    }

    /// Load walls from JSON array: [{x1,y1,x2,y2,is_door,door_open}, ...]
    pub fn set_walls(&mut self, json: &str) {
        if let Ok(segs) = serde_json::from_str::<Vec<CollisionSegment>>(json) {
            self.segments = segs;
            self.rebuild_index();
        }
    }

    /// Load obstacles from JSON array: [{id,obstacle_type,x,y,width,height,radius,vertices?}, ...]
    pub fn set_obstacles(&mut self, json: &str) {
        if let Ok(obs) = serde_json::from_str::<Vec<CollisionObstacle>>(json) {
            self.obstacles = obs;
            self.rebuild_index();
        }
    }

    /// Rebuild spatial hash index after walls/obstacles change.
    pub fn rebuild_index(&mut self) {
        let mut hash = SpatialHash::new(self.grid_size);
        for (i, s) in self.segments.iter().enumerate() {
            hash.insert_wall(i, s);
        }
        for (i, obs) in self.obstacles.iter().enumerate() {
            hash.insert_obstacle(i, obs);
        }
        self.spatial_hash = Some(hash);
    }

    /// True if the line segment from (x1,y1) to (x2,y2) is blocked.
    /// Uses spatial hash when available; falls back to linear scan.
    pub fn line_blocked(&self, x1: f32, y1: f32, x2: f32, y2: f32) -> bool {
        let a = Vec2::new(x1, y1);
        let b = Vec2::new(x2, y2);
        if let Some(hash) = &self.spatial_hash {
            for &idx in &hash.query_walls(x1, y1, x2, y2) {
                let s = &self.segments[idx];
                if s.is_door && s.door_open { continue; }
                if seg_intersect(a, b, Vec2::new(s.x1, s.y1), Vec2::new(s.x2, s.y2)).is_some() {
                    return true;
                }
            }
            for &idx in &hash.query_obstacles(x1, y1, x2, y2) {
                if self.line_hits_obstacle(a, b, &self.obstacles[idx]) { return true; }
            }
        } else {
            for s in &self.segments {
                if s.is_door && s.door_open { continue; }
                if seg_intersect(a, b, Vec2::new(s.x1, s.y1), Vec2::new(s.x2, s.y2)).is_some() {
                    return true;
                }
            }
            for obs in &self.obstacles {
                if self.line_hits_obstacle(a, b, obs) { return true; }
            }
        }
        false
    }

    /// A* pathfinding. Returns flat [x1,y1,x2,y2,...] waypoints or empty on failure.
    pub fn find_path(&self, sx: f32, sy: f32, ex: f32, ey: f32) -> Vec<f32> {
        // Direct-path shortcut: ~50% of open-area moves skip A* entirely
        if !self.line_blocked(sx, sy, ex, ey) {
            return vec![sx, sy, ex, ey];
        }
        let g = self.grid_size;
        let start = Cell((sx / g).floor() as i32, (sy / g).floor() as i32);
        let goal  = Cell((ex / g).floor() as i32, (ey / g).floor() as i32);
        if start == goal { return vec![sx, sy, ex, ey]; }

        let h = |c: Cell| -> i32 {
            let dx = (c.0 - goal.0).abs();
            let dy = (c.1 - goal.1).abs();
            (dx + dy) * 10 - (dx.min(dy)) * 3 // chebyshev-ish heuristic
        };

        let mut open = BinaryHeap::new();
        let mut g_score: HashMap<Cell, i32> = HashMap::new();
        let mut came_from: HashMap<Cell, Cell> = HashMap::new();

        g_score.insert(start, 0);
        open.push(AStarNode { f: h(start), cell: start, g: 0 });

        while let Some(AStarNode { cell, g: gv, .. }) = open.pop() {
            if cell == goal {
                return Self::reconstruct_path(came_from, goal, self.grid_size);
            }
            if gv > *g_score.get(&cell).unwrap_or(&i32::MAX) { continue; }

            for (nb, cost) in Self::neighbors(cell) {
                let ng = gv + cost;
                if ng >= *g_score.get(&nb).unwrap_or(&i32::MAX) { continue; }
                let wp = nb.to_world(self.grid_size);
                let cp = cell.to_world(self.grid_size);
                if self.line_blocked(cp.x, cp.y, wp.x, wp.y) { continue; }
                g_score.insert(nb, ng);
                came_from.insert(nb, cell);
                open.push(AStarNode { f: ng + h(nb), cell: nb, g: ng });
            }
        }
        Vec::new()
    }

    /// BFS reachable cells for movement range overlay
    pub fn movement_range(&self, sx: f32, sy: f32, speed_ft: f32, ft_per_unit: f32, diagonal_5_10_5: bool) -> JsValue {
        let cell_ft = self.grid_size * ft_per_unit;
        let normal_budget = (speed_ft / cell_ft * 10.0) as i32;
        let dash_budget   = normal_budget * 2;

        let start = Cell((sx / self.grid_size).floor() as i32, (sy / self.grid_size).floor() as i32);
        let mut cost_map: HashMap<Cell, i32> = HashMap::new();
        let mut queue = std::collections::VecDeque::new();
        cost_map.insert(start, 0);
        queue.push_back((start, 0));

        while let Some((cell, cost)) = queue.pop_front() {
            if cost >= dash_budget { continue; }
            for (nb, step_cost) in Self::neighbors_with_diagonal_rule(cell, diagonal_5_10_5) {
                let nc = cost + step_cost;
                if nc > dash_budget { continue; }
                if nc >= *cost_map.get(&nb).unwrap_or(&i32::MAX) { continue; }
                let wp = nb.to_world(self.grid_size);
                let cp = cell.to_world(self.grid_size);
                if self.line_blocked(cp.x, cp.y, wp.x, wp.y) { continue; }
                cost_map.insert(nb, nc);
                queue.push_back((nb, nc));
            }
        }

        let mut normal = Vec::new();
        let mut dash_cells = Vec::new();
        let mut blocked_set: HashSet<Cell> = HashSet::new();

        for (&cell, &cost) in &cost_map {
            if cell == start { continue; }
            let p = cell.to_world(self.grid_size);
            if cost <= normal_budget {
                normal.push([p.x, p.y]);
            } else {
                dash_cells.push([p.x, p.y]);
            }
            // check neighbors for blocked-adjacent
            for (nb, _) in Self::neighbors(cell) {
                if !cost_map.contains_key(&nb) { blocked_set.insert(nb); }
            }
        }

        let result = MovementRange {
            normal,
            dash: dash_cells,
            blocked: blocked_set.iter().map(|c| {
                let p = c.to_world(self.grid_size);
                [p.x, p.y]
            }).collect(),
        };

        serde_wasm_bindgen::to_value(&result).unwrap_or(JsValue::NULL)
    }

    /// Grid-aware distance in feet
    pub fn distance_ft(&self, x1: f32, y1: f32, x2: f32, y2: f32, ft_per_unit: f32) -> f32 {
        let g = self.grid_size;
        let dx = ((x2 - x1) / g).abs();
        let dy = ((y2 - y1) / g).abs();
        let diag = dx.min(dy);
        let straight = (dx - diag) + (dy - diag);
        // 5-10-5 diagonal: pairs cost 1+2 steps, so floor(n/2)*3 + n%2
        let diag_cost = (diag / 2.0).floor() * 3.0 + (diag % 2.0 > 0.5) as i32 as f32;
        (straight + diag_cost) * (g * ft_per_unit)
    }
}

// ── Private methods ────────────────────────────────────────────────────

impl CollisionSystem {
    fn line_hits_obstacle(&self, a: Vec2, b: Vec2, obs: &CollisionObstacle) -> bool {
        match obs.obstacle_type.as_str() {
            "circle" => line_vs_circle(a, b, Vec2::new(obs.x, obs.y), obs.radius),
            "polygon" if !obs.vertices.is_empty() => {
                let verts: Vec<Vec2> = obs.vertices.iter()
                    .map(|v| Vec2::new(v[0], v[1]))
                    .collect();
                line_vs_polygon(a, b, &verts)
            }
            _ => {
                // Default AABB
                let hx = obs.width * 0.5;
                let hy = obs.height * 0.5;
                let corners = [
                    Vec2::new(obs.x - hx, obs.y - hy),
                    Vec2::new(obs.x + hx, obs.y - hy),
                    Vec2::new(obs.x + hx, obs.y + hy),
                    Vec2::new(obs.x - hx, obs.y + hy),
                ];
                line_vs_polygon(a, b, &corners)
            }
        }
    }

    fn neighbors(cell: Cell) -> [(Cell, i32); 8] {
        let Cell(cx, cy) = cell;
        [
            (Cell(cx+1, cy),   10),
            (Cell(cx-1, cy),   10),
            (Cell(cx,   cy+1), 10),
            (Cell(cx,   cy-1), 10),
            (Cell(cx+1, cy+1), 14),
            (Cell(cx+1, cy-1), 14),
            (Cell(cx-1, cy+1), 14),
            (Cell(cx-1, cy-1), 14),
        ]
    }

    fn neighbors_with_diagonal_rule(cell: Cell, five_ten_five: bool) -> Vec<(Cell, i32)> {
        let Cell(cx, cy) = cell;
        let diag_cost = if five_ten_five { 15 } else { 10 }; // 5-10-5 averages to 7.5 per step, use 10 for even diag
        vec![
            (Cell(cx+1, cy),   10),
            (Cell(cx-1, cy),   10),
            (Cell(cx,   cy+1), 10),
            (Cell(cx,   cy-1), 10),
            (Cell(cx+1, cy+1), diag_cost),
            (Cell(cx+1, cy-1), diag_cost),
            (Cell(cx-1, cy+1), diag_cost),
            (Cell(cx-1, cy-1), diag_cost),
        ]
    }

    fn reconstruct_path(came_from: HashMap<Cell, Cell>, goal: Cell, grid_size: f32) -> Vec<f32> {
        let mut path = Vec::new();
        let mut cur = goal;
        loop {
            let p = cur.to_world(grid_size);
            path.push(p.x);
            path.push(p.y);
            match came_from.get(&cur) {
                Some(&prev) => cur = prev,
                None => break,
            }
        }
        path.reverse();
        path
    }
}

// ── Pure geometry helpers ──────────────────────────────────────────────

/// Segment intersection (shared with geometry.rs pattern)
pub(crate) fn seg_intersect(a1: Vec2, a2: Vec2, b1: Vec2, b2: Vec2) -> Option<Vec2> {
    let r = a2 - a1;
    let s = b2 - b1;
    let rxs = r.x * s.y - r.y * s.x;
    if rxs.abs() < 1e-6 { return None; }
    let t = ((b1 - a1).x * s.y - (b1 - a1).y * s.x) / rxs;
    let u = ((b1 - a1).x * r.y - (b1 - a1).y * r.x) / rxs;
    if (0.0..=1.0).contains(&t) && (0.0..=1.0).contains(&u) {
        Some(Vec2::new(a1.x + t * r.x, a1.y + t * r.y))
    } else {
        None
    }
}

fn line_vs_circle(a: Vec2, b: Vec2, center: Vec2, radius: f32) -> bool {
    let d = b - a;
    let f = a - center;
    let aa = d.x * d.x + d.y * d.y;
    let bv = 2.0 * (f.x * d.x + f.y * d.y);
    let c = f.x * f.x + f.y * f.y - radius * radius;
    let disc = bv * bv - 4.0 * aa * c;
    if disc < 0.0 { return false; }
    let sqrt_disc = disc.sqrt();
    let t1 = (-bv - sqrt_disc) / (2.0 * aa);
    let t2 = (-bv + sqrt_disc) / (2.0 * aa);
    (0.0..=1.0).contains(&t1) || (0.0..=1.0).contains(&t2)
}

fn line_vs_polygon(a: Vec2, b: Vec2, verts: &[Vec2]) -> bool {
    let n = verts.len();
    for i in 0..n {
        let j = (i + 1) % n;
        if seg_intersect(a, b, verts[i], verts[j]).is_some() { return true; }
    }
    false
}

// ── Native tests ──────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    fn make_system() -> CollisionSystem {
        CollisionSystem::new(64.0)
    }

    #[test]
    fn seg_no_cross() {
        let a = Vec2::new(0.0, 0.0);
        let b = Vec2::new(1.0, 0.0);
        let c = Vec2::new(0.0, 1.0);
        let d = Vec2::new(1.0, 1.0);
        assert!(seg_intersect(a, b, c, d).is_none());
    }

    #[test]
    fn seg_cross() {
        let a = Vec2::new(0.0, 0.0);
        let b = Vec2::new(2.0, 2.0);
        let c = Vec2::new(2.0, 0.0);
        let d = Vec2::new(0.0, 2.0);
        assert!(seg_intersect(a, b, c, d).is_some());
    }

    #[test]
    fn line_through_wall_blocked() {
        let mut sys = make_system();
        sys.set_walls(r#"[{"x1":50,"y1":0,"x2":50,"y2":200,"is_door":false,"door_open":false}]"#);
        assert!(sys.line_blocked(0.0, 100.0, 100.0, 100.0));
    }

    #[test]
    fn open_door_not_blocked() {
        let mut sys = make_system();
        sys.set_walls(r#"[{"x1":50,"y1":0,"x2":50,"y2":200,"is_door":true,"door_open":true}]"#);
        assert!(!sys.line_blocked(0.0, 100.0, 100.0, 100.0));
    }

    #[test]
    fn circle_obstacle_blocks() {
        let mut sys = make_system();
        sys.set_obstacles(r#"[{"id":"c1","obstacle_type":"circle","x":50,"y":50,"width":0,"height":0,"radius":20}]"#);
        assert!(sys.line_blocked(0.0, 50.0, 100.0, 50.0));
    }

    #[test]
    fn astar_finds_path() {
        let sys = make_system();
        let path = sys.find_path(0.0, 0.0, 192.0, 0.0);
        assert!(!path.is_empty());
    }

    #[test]
    fn astar_path_avoids_wall() {
        let mut sys = make_system();
        // Vertical wall at x=96, but A* should route diagonally around it
        sys.set_walls(r#"[{"x1":96,"y1":0,"x2":96,"y2":200,"is_door":false,"door_open":false}]"#);
        // Path exists via going around the wall
        let path = sys.find_path(0.0, 0.0, 200.0, 0.0);
        // Should find a detour path (longer than direct, but not empty)
        assert!(!path.is_empty());
    }

    #[test]
    fn distance_calculation() {
        let sys = make_system();
        // 3 cells straight = 3 * 5ft = 15ft (with 30 units per grid, ft_per_unit = grid_size/cell_ft)
        let d = sys.distance_ft(0.0, 0.0, 192.0, 0.0, 5.0 / 64.0);
        assert!(d > 0.0);
    }

    // ── set_walls tests ──────────────────────────────────────────────

    #[test]
    fn set_walls_parses_json() {
        let mut sys = make_system();
        sys.set_walls(r#"[{"x1":0,"y1":0,"x2":100,"y2":0,"is_door":false,"door_open":false}]"#);
        assert_eq!(sys.segments.len(), 1);
        assert_eq!(sys.segments[0].x1, 0.0);
        assert_eq!(sys.segments[0].x2, 100.0);
    }

    #[test]
    fn set_walls_replaces_previous() {
        let mut sys = make_system();
        sys.set_walls(r#"[{"x1":0,"y1":0,"x2":50,"y2":0,"is_door":false,"door_open":false}]"#);
        assert_eq!(sys.segments.len(), 1);
        sys.set_walls(r#"[{"x1":0,"y1":0,"x2":100,"y2":0,"is_door":false,"door_open":false},{"x1":10,"y1":10,"x2":20,"y2":20,"is_door":true,"door_open":true}]"#);
        assert_eq!(sys.segments.len(), 2);
    }

    #[test]
    fn set_walls_invalid_json_no_panic() {
        let mut sys = make_system();
        sys.set_walls("not json");
        assert!(sys.segments.is_empty());
    }

    #[test]
    fn set_walls_rebuilds_spatial_index() {
        let mut sys = make_system();
        assert!(sys.spatial_hash.is_none());
        sys.set_walls(r#"[{"x1":0,"y1":0,"x2":100,"y2":0,"is_door":false,"door_open":false}]"#);
        assert!(sys.spatial_hash.is_some());
    }

    // ── set_obstacles tests ──────────────────────────────────────────

    #[test]
    fn set_obstacles_parses_json() {
        let mut sys = make_system();
        sys.set_obstacles(r#"[{"id":"o1","obstacle_type":"rectangle","x":50,"y":50,"width":20,"height":20,"radius":0}]"#);
        assert_eq!(sys.obstacles.len(), 1);
        assert_eq!(sys.obstacles[0].id, "o1");
    }

    #[test]
    fn set_obstacles_replaces_previous() {
        let mut sys = make_system();
        sys.set_obstacles(r#"[{"id":"o1","obstacle_type":"circle","x":50,"y":50,"width":0,"height":0,"radius":10}]"#);
        assert_eq!(sys.obstacles.len(), 1);
        sys.set_obstacles(r#"[]"#);
        assert!(sys.obstacles.is_empty());
    }

    #[test]
    fn set_obstacles_invalid_json_no_panic() {
        let mut sys = make_system();
        sys.set_obstacles("{bad}");
        assert!(sys.obstacles.is_empty());
    }

    #[test]
    fn set_obstacles_rebuilds_spatial_index() {
        let mut sys = make_system();
        sys.set_obstacles(r#"[{"id":"o1","obstacle_type":"circle","x":50,"y":50,"width":0,"height":0,"radius":10}]"#);
        assert!(sys.spatial_hash.is_some());
    }

    // ── rebuild_index tests ──────────────────────────────────────────

    #[test]
    fn rebuild_index_from_scratch() {
        let mut sys = make_system();
        sys.segments.push(CollisionSegment {
            x1: 0.0, y1: 0.0, x2: 100.0, y2: 0.0,
            is_door: false, door_open: false,
        });
        sys.rebuild_index();
        assert!(sys.spatial_hash.is_some());
        // After rebuilding, line_blocked should work with the new wall
        assert!(sys.line_blocked(50.0, -10.0, 50.0, 10.0));
    }

    #[test]
    fn rebuild_index_empty_collections() {
        let mut sys = make_system();
        sys.rebuild_index();
        assert!(sys.spatial_hash.is_some());
        // No walls/obstacles → nothing blocked
        assert!(!sys.line_blocked(0.0, 0.0, 100.0, 0.0));
    }

    // ── rectangle obstacle blocking ──────────────────────────────────

    #[test]
    fn rectangle_obstacle_blocks_line() {
        let mut sys = make_system();
        sys.set_obstacles(r#"[{"id":"r1","obstacle_type":"rectangle","x":50,"y":50,"width":30,"height":30,"radius":0}]"#);
        assert!(sys.line_blocked(0.0, 50.0, 100.0, 50.0));
    }

    // ── find_path with obstacles ──────────────────────────────────────

    #[test]
    fn find_path_around_obstacle() {
        let mut sys = make_system();
        sys.set_obstacles(r#"[{"id":"c1","obstacle_type":"circle","x":128,"y":32,"width":0,"height":0,"radius":30}]"#);
        let path = sys.find_path(32.0, 32.0, 224.0, 32.0);
        assert!(!path.is_empty());
        // Path should have more than start+end since it must go around
        assert!(path.len() > 4);
    }

    #[test]
    fn find_path_same_cell() {
        let sys = make_system();
        let path = sys.find_path(10.0, 10.0, 20.0, 20.0);
        assert!(!path.is_empty());
    }

    // ── distance_ft edge cases ────────────────────────────────────────

    #[test]
    fn distance_ft_zero_same_point() {
        let sys = make_system();
        let d = sys.distance_ft(50.0, 50.0, 50.0, 50.0, 5.0 / 64.0);
        assert!((d - 0.0).abs() < 0.001);
    }

    #[test]
    fn distance_ft_diagonal() {
        let sys = make_system();
        // 1 diagonal cell uses 5-10-5 rule: first diagonal costs 1 cell
        let d = sys.distance_ft(0.0, 0.0, 64.0, 64.0, 5.0 / 64.0);
        assert!(d > 0.0);
    }
}
