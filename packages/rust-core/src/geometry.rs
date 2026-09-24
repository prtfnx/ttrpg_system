use crate::math::Vec2;
use crate::occlusion::{SegmentIndex, VisibilityWorkspace};
#[cfg(target_arch = "wasm32")]
use js_sys::Array;
#[cfg(target_arch = "wasm32")]
use serde::Serialize;
#[cfg(target_arch = "wasm32")]
use wasm_bindgen::prelude::*;

#[cfg(target_arch = "wasm32")]
#[derive(Serialize)]
struct Point {
    x: f32,
    y: f32,
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

/// Pure visibility polygon computation. Returns sorted (angle, point) pairs.
/// Testable on all targets — no JS dependencies.
#[cfg(test)]
pub(crate) fn compute_visibility_raw(
    player_x: f32,
    player_y: f32,
    data: &[f32],
    max_dist: f32,
) -> Vec<(f32, Vec2)> {
    SegmentIndex::from_flat(data).compute_visibility(
        Vec2::new(player_x, player_y),
        max_dist,
        &mut VisibilityWorkspace::default(),
    )
}

#[cfg(target_arch = "wasm32")]
pub(crate) fn compute_visibility_polygons_impl(
    scene: &SegmentIndex,
    sources: &[f32],
    workspace: &mut VisibilityWorkspace,
) -> JsValue {
    let polygons = Array::new();
    for source in sources.chunks_exact(3) {
        polygons.push(&visibility_points_to_js(scene.compute_visibility(
            Vec2::new(source[0], source[1]),
            source[2],
            workspace,
        )));
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
        let scene = SegmentIndex::from_flat(&obstacles);
        let mut workspace = VisibilityWorkspace::default();

        for (x, y, radius) in [(100.0, 0.0, 500.0), (250.0, 150.0, 300.0)] {
            let shared = scene.compute_visibility(Vec2::new(x, y), radius, &mut workspace);
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
