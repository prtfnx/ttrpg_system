use crate::math::Vec2;
#[cfg(target_arch = "wasm32")]
use js_sys::Array;
#[cfg(target_arch = "wasm32")]
use serde::Serialize;
use std::collections::{HashMap, HashSet};
#[cfg(target_arch = "wasm32")]
use wasm_bindgen::prelude::*;

#[cfg(target_arch = "wasm32")]
#[derive(Serialize)]
struct Point {
    x: f32,
    y: f32,
}

// Simple segment intersection helper (used by compute_visibility_raw)
#[cfg_attr(not(target_arch = "wasm32"), allow(dead_code))]
fn seg_intersect(a1: Vec2, a2: Vec2, b1: Vec2, b2: Vec2) -> Option<Vec2> {
    let r = a2 - a1;
    let s = b2 - b1;
    let rxs = r.x * s.y - r.y * s.x;
    if rxs.abs() < 1e-6 {
        return None;
    }
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
pub(crate) fn compute_visibility_impl(
    player_x: f32,
    player_y: f32,
    data: &[f32],
    max_dist: f32,
) -> JsValue {
    let points = compute_visibility_raw(player_x, player_y, data, max_dist);

    visibility_points_to_js(points)
}

#[cfg(target_arch = "wasm32")]
fn visibility_points_to_js(points: Vec<(f32, Vec2)>) -> JsValue {
    let arr = Array::new();
    for (_, p) in points {
        let pt = Point { x: p.x, y: p.y };
        let js = serde_wasm_bindgen::to_value(&pt).unwrap_or(JsValue::NULL);
        arr.push(&js);
    }
    JsValue::from(arr)
}

struct VisibilityScene {
    endpoints: Vec<Vec2>,
    segments: Vec<(Vec2, Vec2)>,
    grid: HashMap<(i32, i32), Vec<usize>>,
}

impl VisibilityScene {
    const CELL_SIZE: f32 = 128.0;

    fn new(data: &[f32]) -> Self {
        let mut endpoints = Vec::with_capacity(data.len() / 2);
        let mut segments = Vec::with_capacity(data.len() / 4);
        let mut grid: HashMap<(i32, i32), Vec<usize>> = HashMap::new();

        for segment in data.chunks_exact(4) {
            let start = Vec2::new(segment[0], segment[1]);
            let end = Vec2::new(segment[2], segment[3]);
            let segment_idx = segments.len();
            endpoints.extend([start, end]);
            segments.push((start, end));

            let cx0 = (start.x.min(end.x) / Self::CELL_SIZE).floor() as i32;
            let cx1 = (start.x.max(end.x) / Self::CELL_SIZE).floor() as i32;
            let cy0 = (start.y.min(end.y) / Self::CELL_SIZE).floor() as i32;
            let cy1 = (start.y.max(end.y) / Self::CELL_SIZE).floor() as i32;
            for cx in cx0..=cx1 {
                for cy in cy0..=cy1 {
                    grid.entry((cx, cy)).or_default().push(segment_idx);
                }
            }
        }

        Self {
            endpoints,
            segments,
            grid,
        }
    }

    fn compute(&self, player_x: f32, player_y: f32, max_dist: f32) -> Vec<(f32, Vec2)> {
        let mut angles = Vec::with_capacity(self.endpoints.len() * 3 + 32);
        for endpoint in &self.endpoints {
            let mut angle = (endpoint.y - player_y).atan2(endpoint.x - player_x);
            if angle < 0.0 {
                angle += std::f32::consts::PI * 2.0;
            }
            angles.extend([angle - 0.0001, angle, angle + 0.0001]);
        }
        for ray in 0..32 {
            angles.push((ray as f32) * (2.0 * std::f32::consts::PI) / 32.0);
        }

        let player = Vec2::new(player_x, player_y);
        let mut points = Vec::with_capacity(angles.len());
        for angle in angles {
            let direction = Vec2::new(angle.cos(), angle.sin());
            let ray_end = Vec2::new(
                player.x + direction.x * max_dist,
                player.y + direction.y * max_dist,
            );
            let cx0 = (player.x.min(ray_end.x) / Self::CELL_SIZE).floor() as i32;
            let cx1 = (player.x.max(ray_end.x) / Self::CELL_SIZE).floor() as i32;
            let cy0 = (player.y.min(ray_end.y) / Self::CELL_SIZE).floor() as i32;
            let cy1 = (player.y.max(ray_end.y) / Self::CELL_SIZE).floor() as i32;
            let mut candidates = HashSet::new();
            for cx in cx0..=cx1 {
                for cy in cy0..=cy1 {
                    if let Some(indices) = self.grid.get(&(cx, cy)) {
                        candidates.extend(indices.iter().copied());
                    }
                }
            }

            let mut closest = None;
            let mut closest_dist = max_dist;
            for segment_idx in candidates {
                let (start, end) = self.segments[segment_idx];
                if let Some(point) = seg_intersect(player, ray_end, start, end) {
                    let dx = point.x - player.x;
                    let dy = point.y - player.y;
                    let distance = (dx * dx + dy * dy).sqrt();
                    if distance < closest_dist {
                        closest_dist = distance;
                        closest = Some(point);
                    }
                }
            }

            let normalized_angle = if angle < 0.0 {
                angle + std::f32::consts::PI * 2.0
            } else {
                angle
            };
            points.push((normalized_angle, closest.unwrap_or(ray_end)));
        }

        points.sort_by(|a, b| a.0.partial_cmp(&b.0).unwrap_or(std::cmp::Ordering::Equal));
        points
    }
}

/// Pure visibility polygon computation. Returns sorted (angle, point) pairs.
/// Testable on all targets — no JS dependencies.
#[cfg_attr(not(target_arch = "wasm32"), allow(dead_code))]
pub(crate) fn compute_visibility_raw(
    player_x: f32,
    player_y: f32,
    data: &[f32],
    max_dist: f32,
) -> Vec<(f32, Vec2)> {
    VisibilityScene::new(data).compute(player_x, player_y, max_dist)
}

#[cfg(target_arch = "wasm32")]
#[wasm_bindgen]
pub fn compute_visibility_polygon(
    player_x: f32,
    player_y: f32,
    obstacles: &js_sys::Float32Array,
    max_dist: f32,
) -> JsValue {
    compute_visibility_impl(player_x, player_y, &obstacles.to_vec(), max_dist)
}

/// Compute multiple visibility polygons while building the obstacle index once.
/// Sources are packed as `[x, y, max_distance, ...]`.
#[cfg(target_arch = "wasm32")]
#[wasm_bindgen]
pub fn compute_visibility_polygons(
    sources: &js_sys::Float32Array,
    obstacles: &js_sys::Float32Array,
) -> JsValue {
    let scene = VisibilityScene::new(&obstacles.to_vec());
    let polygons = Array::new();
    for source in sources.to_vec().chunks_exact(3) {
        polygons.push(&visibility_points_to_js(
            scene.compute(source[0], source[1], source[2]),
        ));
    }
    JsValue::from(polygons)
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
        let upward = pts
            .iter()
            .min_by(|a, b| {
                (a.0 - PI / 2.0)
                    .abs()
                    .partial_cmp(&(b.0 - PI / 2.0).abs())
                    .unwrap()
            })
            .unwrap();
        // Should hit the wall around y=100, not extend to 500
        assert!(
            upward.1.y < 150.0,
            "ray should have been blocked near y=100, got y={}",
            upward.1.y
        );
    }

    #[test]
    fn wall_does_not_block_opposite_side() {
        // Same horizontal wall, but rays going DOWNWARD should NOT be blocked
        let wall = [0.0_f32, 100.0, 200.0, 100.0];
        let pts = compute_visibility_raw(100.0, 0.0, &wall, MAX);
        // Downward ray is at angle 3π/2 ≈ 4.712
        let downward = pts
            .iter()
            .min_by(|a, b| {
                (a.0 - 3.0 * PI / 2.0)
                    .abs()
                    .partial_cmp(&(b.0 - 3.0 * PI / 2.0).abs())
                    .unwrap()
            })
            .unwrap();
        // Must not be blocked; should reach near MAX
        let d = ((downward.1.x - 100.0).powi(2) + downward.1.y.powi(2)).sqrt();
        assert!(
            d > MAX * 0.9,
            "downward ray should not be blocked, dist={}",
            d
        );
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

    #[test]
    fn shared_scene_matches_independent_visibility_computations() {
        let obstacles = [0.0_f32, 100.0, 200.0, 100.0, 200.0, 100.0, 200.0, 300.0];
        let scene = VisibilityScene::new(&obstacles);

        for (x, y, radius) in [(100.0, 0.0, 500.0), (250.0, 150.0, 300.0)] {
            let shared = scene.compute(x, y, radius);
            let independent = compute_visibility_raw(x, y, &obstacles, radius);
            assert_eq!(shared.len(), independent.len());
            for (actual, expected) in shared.iter().zip(independent) {
                assert!((actual.0 - expected.0).abs() < f32::EPSILON);
                assert!((actual.1.x - expected.1.x).abs() < f32::EPSILON);
                assert!((actual.1.y - expected.1.y).abs() < f32::EPSILON);
            }
        }
    }
}
