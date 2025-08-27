use wasm_bindgen::prelude::*;
use js_sys::Array;
use serde::{Serialize};
use crate::math::Vec2;

#[derive(Serialize)]
struct Point { x: f32, y: f32 }

// Simple segment intersection helper
fn seg_intersect(a1: Vec2, a2: Vec2, b1: Vec2, b2: Vec2) -> Option<Vec2> {
    let r = a2 - a1;
    let s = b2 - b1;
    let rxs = r.x * s.y - r.y * s.x;
    if rxs.abs() < 1e-6 { return None; }
    let t = ((b1 - a1).x * s.y - (b1 - a1).y * s.x) / rxs;
    let u = ((b1 - a1).x * r.y - (b1 - a1).y * r.x) / rxs;
    if t >= 0.0 && t <= 1.0 && u >= 0.0 && u <= 1.0 {
        return Some(Vec2::new(a1.x + t * r.x, a1.y + t * r.y));
    }
    None
}

// Obstacles expected as flat array: [x1,y1,x2,y2, x1,y1,x2,y2, ...]
#[wasm_bindgen]
pub fn compute_visibility_polygon(player_x: f32, player_y: f32, obstacles: &js_sys::Float32Array, max_dist: f32) -> JsValue {
    let mut endpoints: Vec<Vec2> = Vec::new();
    let data = obstacles.to_vec();
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

    let player = Vec2::new(player_x, player_y);
    let mut points: Vec<(f32, Vec2)> = Vec::new();
    for ang in angles {
        let dir = Vec2::new(ang.cos(), ang.sin());
        let ray_end = Vec2::new(player.x + dir.x * max_dist, player.y + dir.y * max_dist);
        let mut closest: Option<Vec2> = None;
        let mut closest_dist = max_dist;
        for (s1, s2) in &segments {
            if let Some(pt) = seg_intersect(player, ray_end, *s1, *s2) {
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

    let arr = Array::new();
    for (_, p) in points {
        let pt = Point { x: p.x, y: p.y };
        let js = JsValue::from_serde(&pt).unwrap_or(JsValue::NULL);
        arr.push(&js);
    }
    JsValue::from(arr)
}
