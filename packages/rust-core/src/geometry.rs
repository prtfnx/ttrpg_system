#[cfg(target_arch = "wasm32")]
use wasm_bindgen::prelude::*;
#[cfg(target_arch = "wasm32")]
use js_sys::Array;
#[cfg(target_arch = "wasm32")]
use serde::Serialize;
#[cfg(target_arch = "wasm32")]
use serde_wasm_bindgen;
use crate::math::Vec2;

#[cfg(target_arch = "wasm32")]
#[derive(Serialize)]
struct Point { x: f32, y: f32 }

// Simple segment intersection helper (used by compute_visibility_raw)
#[cfg_attr(not(target_arch = "wasm32"), allow(dead_code))]
fn seg_intersect(a1: Vec2, a2: Vec2, b1: Vec2, b2: Vec2) -> Option<Vec2> {
    let r = a2 - a1;
    let s = b2 - b1;
    let rxs = r.x * s.y - r.y * s.x;
    if rxs.abs() < 1e-6 { return None; }
    let t = ((b1 - a1).x * s.y - (b1 - a1).y * s.x) / rxs;
    let u = ((b1 - a1).x * r.y - (b1 - a1).y * r.x) / rxs;
    if (0.0..=1.0).contains(&t) && (0.0..=1.0).contains(&u) {
        return Some(Vec2::new(a1.x + t * r.x, a1.y + t * r.y));
    }
    None
}

// Obstacles expected as flat array: [x1,y1,x2,y2, x1,y1,x2,y2, ...]
// Only used from WASM modules (returns JsValue → Array of {x,y} points).
#[cfg(target_arch = "wasm32")]
pub(crate) fn compute_visibility_impl(player_x: f32, player_y: f32, data: &[f32], max_dist: f32) -> JsValue {
    let points = compute_visibility_raw(player_x, player_y, data, max_dist);

    let arr = Array::new();
    for (_, p) in points {
        let pt = Point { x: p.x, y: p.y };
        let js = serde_wasm_bindgen::to_value(&pt).unwrap_or(JsValue::NULL);
        arr.push(&js);
    }
    JsValue::from(arr)
}

/// Pure visibility polygon computation. Returns sorted (angle, point) pairs.
/// Testable on all targets — no JS dependencies.
#[cfg_attr(not(target_arch = "wasm32"), allow(dead_code))]
pub(crate) fn compute_visibility_raw(player_x: f32, player_y: f32, data: &[f32], max_dist: f32) -> Vec<(f32, Vec2)> {
    let mut endpoints: Vec<Vec2> = Vec::new();
    let mut i = 0usize;
    while i + 3 < data.len() {
        let x1 = data[i]; let y1 = data[i+1]; let x2 = data[i+2]; let y2 = data[i+3];
        endpoints.push(Vec2::new(x1, y1));
        endpoints.push(Vec2::new(x2, y2));
        i += 4;
    }

    // Build ray angles
    let mut angles: Vec<f32> = Vec::new();
    for p in &endpoints {
        let dx = p.x - player_x;
        let dy = p.y - player_y;
        let mut ang = dy.atan2(dx);
        if ang < 0.0 { ang += std::f32::consts::PI * 2.0; }
        angles.push(ang - 0.0001);
        angles.push(ang);
        angles.push(ang + 0.0001);
    }

    // add a few regular rays to cover open areas
    let extra = 32usize;
    for k in 0..extra {
        angles.push((k as f32) * (2.0 * std::f32::consts::PI) / (extra as f32));
    }

    // Collect segments
    let mut segments: Vec<(Vec2, Vec2)> = Vec::new();
    let mut i = 0usize;
    while i + 3 < data.len() {
        segments.push((Vec2::new(data[i], data[i+1]), Vec2::new(data[i+2], data[i+3])));
        i += 4;
    }

    // Build a simple uniform grid spatial index mapping cell -> segment indices
    use std::collections::HashMap;
    let cell_size: f32 = 128.0;
    let mut grid: HashMap<(i32,i32), Vec<usize>> = HashMap::new();
    for (idx, (s1, s2)) in segments.iter().enumerate() {
        let min_x = s1.x.min(s2.x);
        let max_x = s1.x.max(s2.x);
        let min_y = s1.y.min(s2.y);
        let max_y = s1.y.max(s2.y);
        let cx0 = (min_x / cell_size).floor() as i32;
        let cx1 = (max_x / cell_size).floor() as i32;
        let cy0 = (min_y / cell_size).floor() as i32;
        let cy1 = (max_y / cell_size).floor() as i32;
        for cx in cx0..=cx1 {
            for cy in cy0..=cy1 {
                grid.entry((cx,cy)).or_default().push(idx);
            }
        }
    }

    let player = Vec2::new(player_x, player_y);
    let mut points: Vec<(f32, Vec2)> = Vec::new();
    for ang in angles {
        let dir = Vec2::new(ang.cos(), ang.sin());
        let ray_end = Vec2::new(player.x + dir.x * max_dist, player.y + dir.y * max_dist);
        let mut closest: Option<Vec2> = None;
        let mut closest_dist = max_dist;

        // Compute bounding cells covering the ray bbox and gather candidate segment indices
        let min_x = player.x.min(ray_end.x);
        let max_x = player.x.max(ray_end.x);
        let min_y = player.y.min(ray_end.y);
        let max_y = player.y.max(ray_end.y);
        let cx0 = (min_x / cell_size).floor() as i32;
        let cx1 = (max_x / cell_size).floor() as i32;
        let cy0 = (min_y / cell_size).floor() as i32;
        let cy1 = (max_y / cell_size).floor() as i32;

        use std::collections::HashSet;
        let mut candidates: HashSet<usize> = HashSet::new();
        for cx in cx0..=cx1 {
            for cy in cy0..=cy1 {
                if let Some(vec) = grid.get(&(cx,cy)) {
                    for &idx in vec.iter() { candidates.insert(idx); }
                }
            }
        }

        if candidates.is_empty() {
            let final_pt = ray_end;
            let mut ang_norm = ang;
            if ang_norm < 0.0 { ang_norm += std::f32::consts::PI * 2.0; }
            points.push((ang_norm, final_pt));
            continue;
        }

        for &idx in candidates.iter() {
            let (s1, s2) = segments[idx];
            if let Some(pt) = seg_intersect(player, ray_end, s1, s2) {
                let dx = pt.x - player.x; let dy = pt.y - player.y;
                let d = (dx*dx + dy*dy).sqrt();
                if d < closest_dist {
                    closest_dist = d;
                    closest = Some(pt);
                }
            }
        }

        let final_pt = closest.unwrap_or(ray_end);
        let mut ang_norm = ang;
        if ang_norm < 0.0 { ang_norm += std::f32::consts::PI * 2.0; }
        points.push((ang_norm, final_pt));
    }

    // sort by angle
    points.sort_by(|a,b| a.0.partial_cmp(&b.0).unwrap_or(std::cmp::Ordering::Equal));
    points
}

#[cfg(target_arch = "wasm32")]
#[wasm_bindgen]
pub fn compute_visibility_polygon(player_x: f32, player_y: f32, obstacles: &js_sys::Float32Array, max_dist: f32) -> JsValue {
    compute_visibility_impl(player_x, player_y, &obstacles.to_vec(), max_dist)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::f32::consts::PI;

    const MAX: f32 = 500.0;

    #[test]
    fn no_obstacles_returns_points_at_max_dist() {
        let pts = compute_visibility_raw(0.0, 0.0, &[], MAX);
        // With no walls, all 32 extra rays should reach max_dist
        assert!(!pts.is_empty());
        for (_, pt) in &pts {
            let d = (pt.x * pt.x + pt.y * pt.y).sqrt();
            assert!((d - MAX).abs() < 0.5, "expected ~{} got {}", MAX, d);
        }
    }

    #[test]
    fn points_sorted_by_angle() {
        // Sorting is required for a correct TRIANGLE_FAN
        let pts = compute_visibility_raw(0.0, 0.0, &[], MAX);
        for w in pts.windows(2) {
            assert!(w[0].0 <= w[1].0, "not sorted: {} > {}", w[0].0, w[1].0);
        }
    }

    #[test]
    fn wall_blocks_ray_behind_it() {
        // A horizontal wall at y=100 directly above the player at origin
        // Rays going upward should be blocked at y=100, not reach y=500
        let wall = [0.0_f32, 100.0, 200.0, 100.0]; // x1,y1,x2,y2
        let pts = compute_visibility_raw(100.0, 0.0, &wall, MAX);
        // Find the upward ray (closest to angle=π/2 ≈ 1.5708)
        let upward = pts.iter()
            .min_by(|a, b| (a.0 - PI / 2.0).abs().partial_cmp(&(b.0 - PI / 2.0).abs()).unwrap())
            .unwrap();
        // Should hit the wall around y=100, not extend to 500
        assert!(upward.1.y < 150.0, "ray should have been blocked near y=100, got y={}", upward.1.y);
    }

    #[test]
    fn wall_does_not_block_opposite_side() {
        // Same horizontal wall, but rays going DOWNWARD should NOT be blocked
        let wall = [0.0_f32, 100.0, 200.0, 100.0];
        let pts = compute_visibility_raw(100.0, 0.0, &wall, MAX);
        // Downward ray is at angle 3π/2 ≈ 4.712
        let downward = pts.iter()
            .min_by(|a, b| (a.0 - 3.0 * PI / 2.0).abs().partial_cmp(&(b.0 - 3.0 * PI / 2.0).abs()).unwrap())
            .unwrap();
        // Must not be blocked; should reach near MAX
        let d = ((downward.1.x - 100.0).powi(2) + downward.1.y.powi(2)).sqrt();
        assert!(d > MAX * 0.9, "downward ray should not be blocked, dist={}", d);
    }

    #[test]
    fn player_in_open_space_sees_full_circle() {
        let pts = compute_visibility_raw(250.0, 250.0, &[], MAX);
        // All points should be at max distance (no walls)
        for (_, pt) in &pts {
            let dx = pt.x - 250.0;
            let dy = pt.y - 250.0;
            let d = (dx * dx + dy * dy).sqrt();
            assert!((d - MAX).abs() < 1.0, "expected ~{} got {}", MAX, d);
        }
    }
}
