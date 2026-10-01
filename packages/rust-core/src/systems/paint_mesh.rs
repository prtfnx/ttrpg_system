//! Deterministic triangle tessellation for authoritative paint objects.

use std::collections::HashMap;

use super::paint_scene::{PaintBounds, PaintGeometry, PaintObject, PaintPoint};

const CURVE_SEGMENTS: usize = 48;
const ROUND_SEGMENTS: usize = 12;

#[derive(Debug, Clone, PartialEq)]
pub struct PaintMesh {
    pub fill_vertices: Vec<f32>,
    pub stroke_vertices: Vec<f32>,
    pub bounds: PaintBounds,
    pub version: u64,
}

#[derive(Debug, Default)]
pub struct PaintMeshCache {
    meshes: HashMap<String, PaintMesh>,
    rebuild_count: u64,
}

impl PaintMeshCache {
    pub fn replace<'a>(&mut self, objects: impl IntoIterator<Item = &'a PaintObject>) {
        self.meshes.clear();
        for object in objects {
            self.upsert(object);
        }
    }

    pub fn upsert(&mut self, object: &PaintObject) {
        self.meshes.insert(object.id.clone(), tessellate(object));
        self.rebuild_count = self.rebuild_count.saturating_add(1);
    }

    pub fn remove(&mut self, object_id: &str) {
        self.meshes.remove(object_id);
    }

    pub fn clear(&mut self) {
        self.meshes.clear();
    }

    pub fn get(&self, object_id: &str) -> Option<&PaintMesh> {
        self.meshes.get(object_id)
    }

    pub fn rebuild_count(&self) -> u64 {
        self.rebuild_count
    }
}

pub(super) fn tessellate(object: &PaintObject) -> PaintMesh {
    let mut fill_vertices = Vec::new();
    let mut stroke_vertices = Vec::new();
    match &object.geometry {
        PaintGeometry::Freehand { points } => {
            tessellate_path(points, object.style.width, false, &mut stroke_vertices);
        }
        PaintGeometry::Line { start, end } => {
            tessellate_path(
                &[*start, *end],
                object.style.width,
                false,
                &mut stroke_vertices,
            );
        }
        PaintGeometry::Rectangle { width, height } => tessellate_rectangle(
            *width,
            *height,
            object.style.width,
            object.style.fill_rgba.is_some(),
            &mut fill_vertices,
            &mut stroke_vertices,
        ),
        PaintGeometry::Square { size } => tessellate_rectangle(
            *size,
            *size,
            object.style.width,
            object.style.fill_rgba.is_some(),
            &mut fill_vertices,
            &mut stroke_vertices,
        ),
        PaintGeometry::Ellipse { width, height } => tessellate_ellipse(
            *width,
            *height,
            object.style.width,
            object.style.fill_rgba.is_some(),
            &mut fill_vertices,
            &mut stroke_vertices,
        ),
        PaintGeometry::Circle { diameter } => tessellate_ellipse(
            *diameter,
            *diameter,
            object.style.width,
            object.style.fill_rgba.is_some(),
            &mut fill_vertices,
            &mut stroke_vertices,
        ),
    }
    transform_vertices(&mut fill_vertices, object);
    transform_vertices(&mut stroke_vertices, object);
    PaintMesh {
        fill_vertices,
        stroke_vertices,
        bounds: object.world_bounds(),
        version: object.version,
    }
}

fn transform_vertices(vertices: &mut [f32], object: &PaintObject) {
    for point in vertices.chunks_exact_mut(2) {
        point[0] = object.transform.x + point[0] * object.transform.scale_x;
        point[1] = object.transform.y + point[1] * object.transform.scale_y;
    }
}

fn push_triangle(target: &mut Vec<f32>, a: [f32; 2], b: [f32; 2], c: [f32; 2]) {
    target.extend_from_slice(&[a[0], a[1], b[0], b[1], c[0], c[1]]);
}

fn tessellate_rectangle(
    width: f32,
    height: f32,
    stroke_width: f32,
    filled: bool,
    fill: &mut Vec<f32>,
    stroke: &mut Vec<f32>,
) {
    if filled {
        push_triangle(fill, [0.0, 0.0], [width, 0.0], [0.0, height]);
        push_triangle(fill, [width, 0.0], [width, height], [0.0, height]);
    }
    let points = [
        PaintPoint {
            x: 0.0,
            y: 0.0,
            pressure: 1.0,
        },
        PaintPoint {
            x: width,
            y: 0.0,
            pressure: 1.0,
        },
        PaintPoint {
            x: width,
            y: height,
            pressure: 1.0,
        },
        PaintPoint {
            x: 0.0,
            y: height,
            pressure: 1.0,
        },
        PaintPoint {
            x: 0.0,
            y: 0.0,
            pressure: 1.0,
        },
    ];
    tessellate_path(&points, stroke_width, true, stroke);
}

fn tessellate_ellipse(
    width: f32,
    height: f32,
    stroke_width: f32,
    filled: bool,
    fill: &mut Vec<f32>,
    stroke: &mut Vec<f32>,
) {
    let center = [width / 2.0, height / 2.0];
    let outer_x = width / 2.0 + stroke_width / 2.0;
    let outer_y = height / 2.0 + stroke_width / 2.0;
    let inner_x = (width / 2.0 - stroke_width / 2.0).max(0.0);
    let inner_y = (height / 2.0 - stroke_width / 2.0).max(0.0);
    for index in 0..CURVE_SEGMENTS {
        let first = index as f32 * std::f32::consts::TAU / CURVE_SEGMENTS as f32;
        let second = (index + 1) as f32 * std::f32::consts::TAU / CURVE_SEGMENTS as f32;
        let edge_a = [
            center[0] + width / 2.0 * first.cos(),
            center[1] + height / 2.0 * first.sin(),
        ];
        let edge_b = [
            center[0] + width / 2.0 * second.cos(),
            center[1] + height / 2.0 * second.sin(),
        ];
        if filled {
            push_triangle(fill, center, edge_a, edge_b);
        }
        let outer_a = [
            center[0] + outer_x * first.cos(),
            center[1] + outer_y * first.sin(),
        ];
        let outer_b = [
            center[0] + outer_x * second.cos(),
            center[1] + outer_y * second.sin(),
        ];
        let inner_a = [
            center[0] + inner_x * first.cos(),
            center[1] + inner_y * first.sin(),
        ];
        let inner_b = [
            center[0] + inner_x * second.cos(),
            center[1] + inner_y * second.sin(),
        ];
        push_triangle(stroke, outer_a, outer_b, inner_a);
        push_triangle(stroke, outer_b, inner_b, inner_a);
    }
}

fn tessellate_path(points: &[PaintPoint], width: f32, closed: bool, target: &mut Vec<f32>) {
    if points.is_empty() {
        return;
    }
    if points.len() == 1 {
        push_round_disk(points[0], width * pressure(points[0]) / 2.0, target);
        return;
    }
    for pair in points.windows(2) {
        let start = pair[0];
        let end = pair[1];
        let dx = end.x - start.x;
        let dy = end.y - start.y;
        let length = (dx * dx + dy * dy).sqrt();
        if length <= f32::EPSILON {
            continue;
        }
        let normal = [-dy / length, dx / length];
        let start_radius = width * pressure(start) / 2.0;
        let end_radius = width * pressure(end) / 2.0;
        let start_left = [
            start.x + normal[0] * start_radius,
            start.y + normal[1] * start_radius,
        ];
        let start_right = [
            start.x - normal[0] * start_radius,
            start.y - normal[1] * start_radius,
        ];
        let end_left = [
            end.x + normal[0] * end_radius,
            end.y + normal[1] * end_radius,
        ];
        let end_right = [
            end.x - normal[0] * end_radius,
            end.y - normal[1] * end_radius,
        ];
        push_triangle(target, start_left, start_right, end_left);
        push_triangle(target, start_right, end_right, end_left);
    }
    let joint_end = if closed {
        points.len() - 1
    } else {
        points.len()
    };
    for point in &points[1..joint_end] {
        push_round_disk(*point, width * pressure(*point) / 2.0, target);
    }
    if !closed {
        push_round_disk(points[0], width * pressure(points[0]) / 2.0, target);
        push_round_disk(
            *points.last().expect("non-empty path"),
            width * pressure(*points.last().expect("non-empty path")) / 2.0,
            target,
        );
    }
}

fn pressure(point: PaintPoint) -> f32 {
    point.pressure.max(0.05)
}

fn push_round_disk(center: PaintPoint, radius: f32, target: &mut Vec<f32>) {
    for index in 0..ROUND_SEGMENTS {
        let first = index as f32 * std::f32::consts::TAU / ROUND_SEGMENTS as f32;
        let second = (index + 1) as f32 * std::f32::consts::TAU / ROUND_SEGMENTS as f32;
        push_triangle(
            target,
            [center.x, center.y],
            [
                center.x + radius * first.cos(),
                center.y + radius * first.sin(),
            ],
            [
                center.x + radius * second.cos(),
                center.y + radius * second.sin(),
            ],
        );
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::paint_scene::{PaintGeometry, PaintKind, PaintStyle, PaintTransform};

    fn object(geometry: PaintGeometry, fill: bool) -> PaintObject {
        PaintObject {
            id: "object".to_owned(),
            table_id: "table".to_owned(),
            kind: match geometry {
                PaintGeometry::Freehand { .. } => PaintKind::Freehand,
                PaintGeometry::Line { .. } => PaintKind::Line,
                PaintGeometry::Rectangle { .. } => PaintKind::Rectangle,
                PaintGeometry::Square { .. } => PaintKind::Square,
                PaintGeometry::Ellipse { .. } => PaintKind::Ellipse,
                PaintGeometry::Circle { .. } => PaintKind::Circle,
            },
            geometry,
            transform: PaintTransform {
                x: 10.0,
                y: 20.0,
                scale_x: 2.0,
                scale_y: 2.0,
            },
            style: PaintStyle {
                stroke_rgba: [1.0, 0.0, 0.0, 1.0],
                width: 4.0,
                fill_rgba: fill.then_some([0.0, 1.0, 0.0, 0.5]),
            },
            created_by: 1,
            version: 1,
            z_order: 1,
            created_at: String::new(),
            updated_at: String::new(),
        }
    }

    #[test]
    fn thick_pressure_path_is_triangle_geometry_with_round_ends() {
        let mesh = tessellate(&object(
            PaintGeometry::Freehand {
                points: vec![
                    PaintPoint {
                        x: 0.0,
                        y: 0.0,
                        pressure: 0.5,
                    },
                    PaintPoint {
                        x: 10.0,
                        y: 0.0,
                        pressure: 1.0,
                    },
                ],
            },
            false,
        ));

        assert!(mesh.stroke_vertices.len() > 12);
        assert!(mesh.stroke_vertices.len().is_multiple_of(6));
        assert!(mesh.fill_vertices.is_empty());
        assert!(mesh.stroke_vertices.iter().all(|value| value.is_finite()));
    }

    #[test]
    fn filled_shapes_generate_separate_fill_and_outline_triangles() {
        for geometry in [
            PaintGeometry::Square { size: 12.0 },
            PaintGeometry::Circle { diameter: 12.0 },
        ] {
            let mesh = tessellate(&object(geometry, true));
            assert!(!mesh.fill_vertices.is_empty());
            assert!(!mesh.stroke_vertices.is_empty());
            assert!(mesh.fill_vertices.len().is_multiple_of(6));
            assert!(mesh.stroke_vertices.len().is_multiple_of(6));
        }
    }

    #[test]
    fn cache_rebuilds_only_changed_objects() {
        let first = object(PaintGeometry::Square { size: 12.0 }, true);
        let mut second = first.clone();
        second.id = "second".to_owned();
        let mut cache = PaintMeshCache::default();
        cache.replace([&first, &second]);
        assert_eq!(cache.rebuild_count(), 2);

        cache.get("object").expect("first mesh");
        cache.get("second").expect("second mesh");
        assert_eq!(cache.rebuild_count(), 2);

        let mut changed = first;
        changed.version = 2;
        cache.upsert(&changed);
        assert_eq!(cache.rebuild_count(), 3);
        assert_eq!(cache.get("object").unwrap().version, 2);
    }
}
