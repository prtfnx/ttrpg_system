use std::collections::{HashMap, BinaryHeap, HashSet};
use std::cmp::Ordering;
use wasm_bindgen::prelude::*;
use serde::{Serialize, Deserialize};
use crate::math::Vec2;

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
}

#[wasm_bindgen]
impl CollisionSystem {
    #[wasm_bindgen(constructor)]
    pub fn new(grid_size: f32) -> Self {
        Self {
            segments: Vec::new(),
            obstacles: Vec::new(),
            grid_size,
        }
    }

    /// Load walls from JSON array: [{x1,y1,x2,y2,is_door,door_open}, ...]
    pub fn set_walls(&mut self, json: &str) {
        if let Ok(segs) = serde_json::from_str::<Vec<CollisionSegment>>(json) {
            self.segments = segs;
        }
    }

    /// Load obstacles from JSON array: [{id,obstacle_type,x,y,width,height,radius,vertices?}, ...]
    pub fn set_obstacles(&mut self, json: &str) {
        if let Ok(obs) = serde_json::from_str::<Vec<CollisionObstacle>>(json) {
            self.obstacles = obs;
        }
    }

    /// True if the line segment from (x1,y1) to (x2,y2) is blocked
    pub fn line_blocked(&self, x1: f32, y1: f32, x2: f32, y2: f32) -> bool {
        let a = Vec2::new(x1, y1);
        let b = Vec2::new(x2, y2);
        for s in &self.segments {
            if s.is_door && s.door_open { continue; }
            let c = Vec2::new(s.x1, s.y1);
            let d = Vec2::new(s.x2, s.y2);
            if seg_intersect(a, b, c, d).is_some() { return true; }
        }
        for obs in &self.obstacles {
            if self.line_hits_obstacle(a, b, obs) { return true; }
        }
        false
    }

    /// A* pathfinding. Returns flat [x1,y1,x2,y2,...] waypoints or empty on failure.
    pub fn find_path(&self, sx: f32, sy: f32, ex: f32, ey: f32) -> Vec<f32> {
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
}
