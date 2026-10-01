//! Authoritative, renderer-independent paint object scene.
//!
//! This module deliberately owns no WebSocket or durable-write behavior. It
//! accepts validated snapshots/events, preserves server ordering, and provides
//! geometry queries that rendering and selection can share.

use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};

const COORDINATE_LIMIT: f32 = 1_000_000.0;
const DIMENSION_LIMIT: f32 = 2_000_000.0;
const SCALE_LIMIT: f32 = 1_000.0;
const STROKE_WIDTH_MIN: f32 = 0.125;
const STROKE_WIDTH_MAX: f32 = 512.0;

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct PaintPoint {
    pub x: f32,
    pub y: f32,
    pub pressure: f32,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum PaintKind {
    Freehand,
    Line,
    Rectangle,
    Square,
    Ellipse,
    Circle,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "lowercase")]
pub enum PaintGeometry {
    Freehand { points: Vec<PaintPoint> },
    Line { start: PaintPoint, end: PaintPoint },
    Rectangle { width: f32, height: f32 },
    Square { size: f32 },
    Ellipse { width: f32, height: f32 },
    Circle { diameter: f32 },
}

impl PaintGeometry {
    fn kind(&self) -> PaintKind {
        match self {
            Self::Freehand { .. } => PaintKind::Freehand,
            Self::Line { .. } => PaintKind::Line,
            Self::Rectangle { .. } => PaintKind::Rectangle,
            Self::Square { .. } => PaintKind::Square,
            Self::Ellipse { .. } => PaintKind::Ellipse,
            Self::Circle { .. } => PaintKind::Circle,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct PaintTransform {
    pub x: f32,
    pub y: f32,
    pub scale_x: f32,
    pub scale_y: f32,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct PaintStyle {
    pub stroke_rgba: [f32; 4],
    pub width: f32,
    pub fill_rgba: Option<[f32; 4]>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct PaintObject {
    pub id: String,
    pub table_id: String,
    pub kind: PaintKind,
    pub geometry: PaintGeometry,
    pub transform: PaintTransform,
    pub style: PaintStyle,
    pub created_by: u64,
    pub version: u64,
    pub z_order: u64,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct PaintObjectInput {
    pub id: String,
    pub kind: PaintKind,
    pub geometry: PaintGeometry,
    pub transform: PaintTransform,
    pub style: PaintStyle,
}

impl PaintObjectInput {
    pub fn into_transient(self, table_id: &str) -> Result<PaintObject, PaintSceneError> {
        let object = PaintObject {
            id: self.id,
            table_id: table_id.to_owned(),
            kind: self.kind,
            geometry: self.geometry,
            transform: self.transform,
            style: self.style,
            created_by: 1,
            version: 1,
            z_order: 1,
            created_at: String::new(),
            updated_at: String::new(),
        };
        validate_object(&object)?;
        Ok(object)
    }
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct PaintBounds {
    pub min_x: f32,
    pub min_y: f32,
    pub max_x: f32,
    pub max_y: f32,
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct PaintHandle {
    pub kind: &'static str,
    pub x: f32,
    pub y: f32,
}

impl PaintBounds {
    pub fn contains(self, x: f32, y: f32, tolerance: f32) -> bool {
        x >= self.min_x - tolerance
            && x <= self.max_x + tolerance
            && y >= self.min_y - tolerance
            && y <= self.max_y + tolerance
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum PaintSceneError {
    DuplicateObject(String),
    InvalidObject(String),
    ObjectNotFound(String),
    TableMismatch,
    RevisionMismatch { expected: u64, actual: u64 },
    VersionMismatch { expected: u64, actual: u64 },
}

#[derive(Debug, Default)]
pub struct PaintScene {
    table_id: Option<String>,
    revision: u64,
    objects: HashMap<String, PaintObject>,
}

impl PaintScene {
    pub fn activate_table(&mut self, table_id: &str) {
        if self.table_id.as_deref() != Some(table_id) {
            self.table_id = Some(table_id.to_owned());
            self.revision = 0;
            self.objects.clear();
        }
    }

    pub fn table_id(&self) -> Option<&str> {
        self.table_id.as_deref()
    }

    pub fn revision(&self) -> u64 {
        self.revision
    }

    pub fn len(&self) -> usize {
        self.objects.len()
    }

    pub fn is_empty(&self) -> bool {
        self.objects.is_empty()
    }

    pub fn get(&self, id: &str) -> Option<&PaintObject> {
        self.objects.get(id)
    }

    pub fn ordered_objects(&self) -> Vec<&PaintObject> {
        let mut ordered: Vec<_> = self.objects.values().collect();
        ordered.sort_unstable_by(|left, right| {
            left.z_order
                .cmp(&right.z_order)
                .then_with(|| left.id.cmp(&right.id))
        });
        ordered
    }

    pub fn replace_snapshot(
        &mut self,
        table_id: &str,
        revision: u64,
        objects: Vec<PaintObject>,
    ) -> Result<(), PaintSceneError> {
        let mut ids = HashSet::with_capacity(objects.len());
        let mut replacement = HashMap::with_capacity(objects.len());
        for object in objects {
            if object.table_id != table_id {
                return Err(PaintSceneError::TableMismatch);
            }
            validate_object(&object)?;
            if !ids.insert(object.id.clone()) {
                return Err(PaintSceneError::DuplicateObject(object.id));
            }
            replacement.insert(object.id.clone(), object);
        }
        self.table_id = Some(table_id.to_owned());
        self.revision = revision;
        self.objects = replacement;
        Ok(())
    }

    pub fn apply_upsert(
        &mut self,
        table_id: &str,
        revision: u64,
        object: PaintObject,
    ) -> Result<(), PaintSceneError> {
        self.require_next_revision(table_id, revision)?;
        if object.table_id != table_id {
            return Err(PaintSceneError::TableMismatch);
        }
        validate_object(&object)?;
        let expected_version = self
            .objects
            .get(&object.id)
            .map_or(1, |current| current.version + 1);
        if object.version != expected_version {
            return Err(PaintSceneError::VersionMismatch {
                expected: expected_version,
                actual: object.version,
            });
        }
        self.objects.insert(object.id.clone(), object);
        self.revision = revision;
        Ok(())
    }

    pub fn apply_delete(
        &mut self,
        table_id: &str,
        revision: u64,
        id: &str,
        deleted_version: u64,
    ) -> Result<(), PaintSceneError> {
        self.require_next_revision(table_id, revision)?;
        let current = self
            .objects
            .get(id)
            .ok_or_else(|| PaintSceneError::ObjectNotFound(id.to_owned()))?;
        if current.version != deleted_version {
            return Err(PaintSceneError::VersionMismatch {
                expected: current.version,
                actual: deleted_version,
            });
        }
        self.objects.remove(id);
        self.revision = revision;
        Ok(())
    }

    pub fn hit_test(&self, world_x: f32, world_y: f32, tolerance: f32) -> Option<&str> {
        self.ordered_objects()
            .into_iter()
            .rev()
            .find(|object| object.hit_test(world_x, world_y, tolerance.max(0.0)))
            .map(|object| object.id.as_str())
    }

    pub fn handles(&self, object_id: &str) -> Vec<PaintHandle> {
        self.objects
            .get(object_id)
            .map_or_else(Vec::new, PaintObject::handles)
    }

    pub fn hit_test_handle(
        &self,
        object_id: &str,
        world_x: f32,
        world_y: f32,
        tolerance: f32,
    ) -> Option<&'static str> {
        self.handles(object_id)
            .into_iter()
            .filter_map(|handle| {
                let distance = (handle.x - world_x).hypot(handle.y - world_y);
                (distance <= tolerance.max(0.0)).then_some((handle.kind, distance))
            })
            .min_by(|left, right| left.1.total_cmp(&right.1))
            .map(|(kind, _)| kind)
    }

    fn require_next_revision(&self, table_id: &str, revision: u64) -> Result<(), PaintSceneError> {
        if self.table_id.as_deref() != Some(table_id) {
            return Err(PaintSceneError::TableMismatch);
        }
        let expected = self.revision + 1;
        if revision != expected {
            return Err(PaintSceneError::RevisionMismatch {
                expected,
                actual: revision,
            });
        }
        Ok(())
    }
}

impl PaintObject {
    pub fn world_bounds(&self) -> PaintBounds {
        let (min_x, min_y, max_x, max_y) = self.local_bounds();
        let half_stroke =
            self.style.width * self.transform.scale_x.max(self.transform.scale_y) / 2.0;
        PaintBounds {
            min_x: self.transform.x + min_x * self.transform.scale_x - half_stroke,
            min_y: self.transform.y + min_y * self.transform.scale_y - half_stroke,
            max_x: self.transform.x + max_x * self.transform.scale_x + half_stroke,
            max_y: self.transform.y + max_y * self.transform.scale_y + half_stroke,
        }
    }

    fn local_bounds(&self) -> (f32, f32, f32, f32) {
        match &self.geometry {
            PaintGeometry::Freehand { points } => points.iter().fold(
                (
                    f32::INFINITY,
                    f32::INFINITY,
                    f32::NEG_INFINITY,
                    f32::NEG_INFINITY,
                ),
                |(min_x, min_y, max_x, max_y), point| {
                    (
                        min_x.min(point.x),
                        min_y.min(point.y),
                        max_x.max(point.x),
                        max_y.max(point.y),
                    )
                },
            ),
            PaintGeometry::Line { start, end } => (
                start.x.min(end.x),
                start.y.min(end.y),
                start.x.max(end.x),
                start.y.max(end.y),
            ),
            PaintGeometry::Rectangle { width, height }
            | PaintGeometry::Ellipse { width, height } => (0.0, 0.0, *width, *height),
            PaintGeometry::Square { size } => (0.0, 0.0, *size, *size),
            PaintGeometry::Circle { diameter } => (0.0, 0.0, *diameter, *diameter),
        }
    }

    fn handles(&self) -> Vec<PaintHandle> {
        if let PaintGeometry::Line { start, end } = self.geometry {
            return vec![
                PaintHandle {
                    kind: "line-start",
                    x: self.transform.x + start.x * self.transform.scale_x,
                    y: self.transform.y + start.y * self.transform.scale_y,
                },
                PaintHandle {
                    kind: "line-end",
                    x: self.transform.x + end.x * self.transform.scale_x,
                    y: self.transform.y + end.y * self.transform.scale_y,
                },
            ];
        }
        let (min_x, min_y, max_x, max_y) = self.local_bounds();
        [
            ("nw", min_x, min_y),
            ("ne", max_x, min_y),
            ("se", max_x, max_y),
            ("sw", min_x, max_y),
        ]
        .into_iter()
        .map(|(kind, x, y)| PaintHandle {
            kind,
            x: self.transform.x + x * self.transform.scale_x,
            y: self.transform.y + y * self.transform.scale_y,
        })
        .collect()
    }

    fn hit_test(&self, world_x: f32, world_y: f32, tolerance: f32) -> bool {
        if !self.world_bounds().contains(world_x, world_y, tolerance) {
            return false;
        }
        let x = (world_x - self.transform.x) / self.transform.scale_x;
        let y = (world_y - self.transform.y) / self.transform.scale_y;
        let local_tolerance = tolerance / self.transform.scale_x.min(self.transform.scale_y);
        let stroke_tolerance = self.style.width / 2.0 + local_tolerance;
        match &self.geometry {
            PaintGeometry::Freehand { points } => hit_polyline(points, x, y, stroke_tolerance),
            PaintGeometry::Line { start, end } => {
                distance_to_segment(x, y, *start, *end) <= stroke_tolerance
            }
            PaintGeometry::Rectangle { width, height }
            | PaintGeometry::Ellipse { width, height }
                if self.style.fill_rgba.is_some() =>
            {
                if matches!(self.geometry, PaintGeometry::Ellipse { .. }) {
                    ellipse_contains(x, y, *width, *height, stroke_tolerance, true)
                } else {
                    x >= -stroke_tolerance
                        && x <= *width + stroke_tolerance
                        && y >= -stroke_tolerance
                        && y <= *height + stroke_tolerance
                }
            }
            PaintGeometry::Rectangle { width, height } => {
                rectangle_outline_contains(x, y, *width, *height, stroke_tolerance)
            }
            PaintGeometry::Square { size } if self.style.fill_rgba.is_some() => {
                x >= -stroke_tolerance
                    && x <= *size + stroke_tolerance
                    && y >= -stroke_tolerance
                    && y <= *size + stroke_tolerance
            }
            PaintGeometry::Square { size } => {
                rectangle_outline_contains(x, y, *size, *size, stroke_tolerance)
            }
            PaintGeometry::Ellipse { width, height } => {
                ellipse_contains(x, y, *width, *height, stroke_tolerance, false)
            }
            PaintGeometry::Circle { diameter } => ellipse_contains(
                x,
                y,
                *diameter,
                *diameter,
                stroke_tolerance,
                self.style.fill_rgba.is_some(),
            ),
        }
    }
}

fn validate_object(object: &PaintObject) -> Result<(), PaintSceneError> {
    let finite = |value: f32| value.is_finite();
    let coordinate = |value: f32| finite(value) && value.abs() <= COORDINATE_LIMIT;
    let dimension = |value: f32| finite(value) && value > 0.0 && value <= DIMENSION_LIMIT;
    let valid_rgba = |rgba: &[f32; 4]| {
        rgba.iter()
            .all(|value| finite(*value) && (0.0..=1.0).contains(value))
    };
    let valid_point = |point: &PaintPoint| {
        coordinate(point.x)
            && coordinate(point.y)
            && finite(point.pressure)
            && (0.0..=1.0).contains(&point.pressure)
    };
    let geometry_valid = match &object.geometry {
        PaintGeometry::Freehand { points } => {
            !points.is_empty() && points.len() <= 8192 && points.iter().all(valid_point)
        }
        PaintGeometry::Line { start, end } => valid_point(start) && valid_point(end),
        PaintGeometry::Rectangle { width, height } | PaintGeometry::Ellipse { width, height } => {
            dimension(*width) && dimension(*height)
        }
        PaintGeometry::Square { size } => dimension(*size),
        PaintGeometry::Circle { diameter } => dimension(*diameter),
    };
    let preserves_aspect = !matches!(object.kind, PaintKind::Square | PaintKind::Circle)
        || (object.transform.scale_x - object.transform.scale_y).abs()
            <= (object.transform.scale_x.abs() * 1e-9).max(1e-12);
    let valid = !object.id.is_empty()
        && !object.table_id.is_empty()
        && object.kind == object.geometry.kind()
        && geometry_valid
        && coordinate(object.transform.x)
        && coordinate(object.transform.y)
        && finite(object.transform.scale_x)
        && object.transform.scale_x <= SCALE_LIMIT
        && object.transform.scale_x > 0.0
        && finite(object.transform.scale_y)
        && object.transform.scale_y <= SCALE_LIMIT
        && object.transform.scale_y > 0.0
        && preserves_aspect
        && valid_rgba(&object.style.stroke_rgba)
        && object.style.fill_rgba.as_ref().is_none_or(valid_rgba)
        && finite(object.style.width)
        && (STROKE_WIDTH_MIN..=STROKE_WIDTH_MAX).contains(&object.style.width)
        && object.created_by > 0
        && object.version > 0
        && object.z_order > 0;
    if valid {
        Ok(())
    } else {
        Err(PaintSceneError::InvalidObject(object.id.clone()))
    }
}

fn hit_polyline(points: &[PaintPoint], x: f32, y: f32, tolerance: f32) -> bool {
    if points.len() == 1 {
        return ((points[0].x - x).powi(2) + (points[0].y - y).powi(2)).sqrt() <= tolerance;
    }
    points
        .windows(2)
        .any(|pair| distance_to_segment(x, y, pair[0], pair[1]) <= tolerance)
}

fn distance_to_segment(x: f32, y: f32, start: PaintPoint, end: PaintPoint) -> f32 {
    let dx = end.x - start.x;
    let dy = end.y - start.y;
    let length_squared = dx * dx + dy * dy;
    if length_squared == 0.0 {
        return ((x - start.x).powi(2) + (y - start.y).powi(2)).sqrt();
    }
    let projection = (((x - start.x) * dx + (y - start.y) * dy) / length_squared).clamp(0.0, 1.0);
    let nearest_x = start.x + projection * dx;
    let nearest_y = start.y + projection * dy;
    ((x - nearest_x).powi(2) + (y - nearest_y).powi(2)).sqrt()
}

fn rectangle_outline_contains(x: f32, y: f32, width: f32, height: f32, tolerance: f32) -> bool {
    let inside_outer =
        x >= -tolerance && x <= width + tolerance && y >= -tolerance && y <= height + tolerance;
    let inside_inner =
        x > tolerance && x < width - tolerance && y > tolerance && y < height - tolerance;
    inside_outer && !inside_inner
}

fn ellipse_contains(x: f32, y: f32, width: f32, height: f32, tolerance: f32, filled: bool) -> bool {
    let radius_x = width / 2.0;
    let radius_y = height / 2.0;
    let normalized =
        (((x - radius_x) / radius_x).powi(2) + ((y - radius_y) / radius_y).powi(2)).sqrt();
    let normalized_tolerance = tolerance / radius_x.min(radius_y);
    if filled {
        normalized <= 1.0 + normalized_tolerance
    } else {
        (normalized - 1.0).abs() <= normalized_tolerance
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn object(id: &str, z_order: u64, geometry: PaintGeometry) -> PaintObject {
        PaintObject {
            id: id.to_owned(),
            table_id: "table".to_owned(),
            kind: geometry.kind(),
            geometry,
            transform: PaintTransform {
                x: 10.0,
                y: 20.0,
                scale_x: 2.0,
                scale_y: 3.0,
            },
            style: PaintStyle {
                stroke_rgba: [0.1, 0.2, 0.3, 1.0],
                width: 2.0,
                fill_rgba: None,
            },
            created_by: 1,
            version: 1,
            z_order,
            created_at: "2026-09-29T00:00:00Z".to_owned(),
            updated_at: "2026-09-29T00:00:00Z".to_owned(),
        }
    }

    fn line(id: &str, z_order: u64) -> PaintObject {
        object(
            id,
            z_order,
            PaintGeometry::Line {
                start: PaintPoint {
                    x: 0.0,
                    y: 0.0,
                    pressure: 1.0,
                },
                end: PaintPoint {
                    x: 10.0,
                    y: 0.0,
                    pressure: 1.0,
                },
            },
        )
    }

    #[test]
    fn snapshot_replacement_is_atomic_and_ordered() {
        let mut scene = PaintScene::default();
        scene
            .replace_snapshot("table", 4, vec![line("b", 2), line("a", 2)])
            .unwrap();
        assert_eq!(scene.revision(), 4);
        assert_eq!(
            scene
                .ordered_objects()
                .iter()
                .map(|item| item.id.as_str())
                .collect::<Vec<_>>(),
            vec!["a", "b"]
        );

        let mut invalid = line("foreign", 3);
        invalid.table_id = "other".to_owned();
        assert_eq!(
            scene.replace_snapshot("table", 5, vec![invalid]),
            Err(PaintSceneError::TableMismatch)
        );
        assert_eq!(scene.revision(), 4);
        assert_eq!(scene.len(), 2);
    }

    #[test]
    fn events_require_contiguous_revisions_and_versions() {
        let mut scene = PaintScene::default();
        scene.replace_snapshot("table", 0, vec![]).unwrap();
        scene.apply_upsert("table", 1, line("line", 1)).unwrap();

        let mut update = line("line", 1);
        update.version = 2;
        update.transform.x = 50.0;
        assert_eq!(
            scene.apply_upsert("table", 3, update.clone()),
            Err(PaintSceneError::RevisionMismatch {
                expected: 2,
                actual: 3
            })
        );
        assert_eq!(scene.get("line").unwrap().version, 1);
        scene.apply_upsert("table", 2, update).unwrap();
        scene.apply_delete("table", 3, "line", 2).unwrap();
        assert!(scene.is_empty());
        assert_eq!(scene.revision(), 3);
    }

    #[test]
    fn bounds_apply_transform_and_stroke_padding() {
        let bounds = line("line", 1).world_bounds();
        assert_eq!(
            bounds,
            PaintBounds {
                min_x: 7.0,
                min_y: 17.0,
                max_x: 33.0,
                max_y: 23.0,
            }
        );
    }

    #[test]
    fn hit_test_uses_geometry_and_returns_topmost_object() {
        let mut lower = line("lower", 1);
        lower.transform = PaintTransform {
            x: 0.0,
            y: 0.0,
            scale_x: 1.0,
            scale_y: 1.0,
        };
        let mut upper = lower.clone();
        upper.id = "upper".to_owned();
        upper.z_order = 2;
        let mut scene = PaintScene::default();
        scene
            .replace_snapshot("table", 2, vec![upper, lower])
            .unwrap();

        assert_eq!(scene.hit_test(5.0, 0.5, 0.0), Some("upper"));
        assert_eq!(scene.hit_test(5.0, 5.0, 0.0), None);
    }

    #[test]
    fn handles_use_transformed_geometry_and_precise_line_endpoints() {
        let mut scene = PaintScene::default();
        scene
            .replace_snapshot("table", 1, vec![line("line", 1)])
            .unwrap();
        assert_eq!(
            scene.handles("line"),
            vec![
                PaintHandle {
                    kind: "line-start",
                    x: 10.0,
                    y: 20.0
                },
                PaintHandle {
                    kind: "line-end",
                    x: 30.0,
                    y: 20.0
                },
            ]
        );
        assert_eq!(
            scene.hit_test_handle("line", 30.5, 20.0, 1.0),
            Some("line-end")
        );
        assert_eq!(scene.hit_test_handle("line", 30.5, 20.0, 0.25), None);

        let mut square = object("square", 2, PaintGeometry::Square { size: 10.0 });
        square.transform.scale_y = 2.0;
        scene.replace_snapshot("table", 2, vec![square]).unwrap();
        assert_eq!(
            scene.handles("square"),
            vec![
                PaintHandle {
                    kind: "nw",
                    x: 10.0,
                    y: 20.0
                },
                PaintHandle {
                    kind: "ne",
                    x: 30.0,
                    y: 20.0
                },
                PaintHandle {
                    kind: "se",
                    x: 30.0,
                    y: 40.0
                },
                PaintHandle {
                    kind: "sw",
                    x: 10.0,
                    y: 40.0
                },
            ]
        );
    }

    #[test]
    fn serde_supports_every_geometry_kind() {
        let geometries = vec![
            PaintGeometry::Freehand {
                points: vec![PaintPoint {
                    x: 0.0,
                    y: 0.0,
                    pressure: 0.5,
                }],
            },
            PaintGeometry::Line {
                start: PaintPoint {
                    x: 0.0,
                    y: 0.0,
                    pressure: 1.0,
                },
                end: PaintPoint {
                    x: 1.0,
                    y: 1.0,
                    pressure: 1.0,
                },
            },
            PaintGeometry::Rectangle {
                width: 2.0,
                height: 3.0,
            },
            PaintGeometry::Square { size: 2.0 },
            PaintGeometry::Ellipse {
                width: 2.0,
                height: 3.0,
            },
            PaintGeometry::Circle { diameter: 2.0 },
        ];
        for (index, geometry) in geometries.into_iter().enumerate() {
            let value = object(&format!("object-{index}"), index as u64 + 1, geometry);
            let json = serde_json::to_string(&value).unwrap();
            let decoded: PaintObject = serde_json::from_str(&json).unwrap();
            assert_eq!(decoded, value);
        }
    }

    #[test]
    fn canonical_limits_and_aspect_ratio_fail_closed() {
        let mut scene = PaintScene::default();
        let mut too_wide = line("wide", 1);
        too_wide.style.width = STROKE_WIDTH_MAX + 1.0;
        assert_eq!(
            scene.replace_snapshot("table", 1, vec![too_wide]),
            Err(PaintSceneError::InvalidObject("wide".to_owned()))
        );

        let mut square = object("square", 1, PaintGeometry::Square { size: 10.0 });
        square.transform.scale_y = 4.0;
        assert_eq!(
            scene.replace_snapshot("table", 1, vec![square]),
            Err(PaintSceneError::InvalidObject("square".to_owned()))
        );
        assert_eq!(scene.table_id(), None);
    }

    #[test]
    fn transient_inputs_share_authoritative_geometry_validation() {
        let valid = PaintObjectInput {
            id: "draft".to_owned(),
            kind: PaintKind::Circle,
            geometry: PaintGeometry::Circle { diameter: 10.0 },
            transform: PaintTransform {
                x: 2.0,
                y: 3.0,
                scale_x: 1.0,
                scale_y: 1.0,
            },
            style: PaintStyle {
                stroke_rgba: [1.0, 0.0, 0.0, 1.0],
                width: 2.0,
                fill_rgba: Some([1.0, 0.0, 0.0, 0.25]),
            },
        };
        assert_eq!(
            valid.clone().into_transient("table").unwrap().table_id,
            "table"
        );

        let mut invalid = valid;
        invalid.transform.scale_y = 2.0;
        assert_eq!(
            invalid.into_transient("table"),
            Err(PaintSceneError::InvalidObject("draft".to_owned()))
        );
    }

    #[test]
    fn table_activation_clears_only_on_an_actual_switch() {
        let mut scene = PaintScene::default();
        scene
            .replace_snapshot(
                "first",
                3,
                vec![{
                    let mut value = line("line", 1);
                    value.table_id = "first".to_owned();
                    value
                }],
            )
            .unwrap();

        scene.activate_table("first");
        assert_eq!(scene.revision(), 3);
        assert_eq!(scene.len(), 1);

        scene.activate_table("second");
        assert_eq!(scene.table_id(), Some("second"));
        assert_eq!(scene.revision(), 0);
        assert!(scene.is_empty());
    }
}
