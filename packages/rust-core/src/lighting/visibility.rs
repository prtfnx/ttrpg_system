// Visibility types are only used by LightingSystem (cfg wasm32).
#![cfg_attr(not(target_arch = "wasm32"), allow(dead_code))]

/// Point in 2D space for visibility calculations
#[derive(Clone, Copy, Debug)]
pub struct Point {
    pub x: f32,
    pub y: f32,
}

impl Point {
    pub fn new(x: f32, y: f32) -> Self {
        Self { x, y }
    }
}

/// Line segment for obstacle representation
#[derive(Clone, Copy, Debug)]
pub struct LineSegment {
    pub p1: Point,
    pub p2: Point,
}

impl LineSegment {
    pub fn new(p1: Point, p2: Point) -> Self {
        Self { p1, p2 }
    }
}

/// Squared distance from a point to the closest point on a line segment.
///
/// Keeping this calculation squared avoids a square root in the per-light,
/// per-segment culling path.
pub(crate) fn distance_squared_to_segment(point: Point, segment: &LineSegment) -> f32 {
    let segment_x = segment.p2.x - segment.p1.x;
    let segment_y = segment.p2.y - segment.p1.y;
    let length_squared = segment_x * segment_x + segment_y * segment_y;

    if length_squared <= f32::EPSILON {
        let dx = point.x - segment.p1.x;
        let dy = point.y - segment.p1.y;
        return dx * dx + dy * dy;
    }

    let projection = ((point.x - segment.p1.x) * segment_x
        + (point.y - segment.p1.y) * segment_y)
        / length_squared;
    let t = projection.clamp(0.0, 1.0);
    let closest_x = segment.p1.x + t * segment_x;
    let closest_y = segment.p1.y + t * segment_y;
    let dx = point.x - closest_x;
    let dy = point.y - closest_y;

    dx * dx + dy * dy
}

/// Build the shadow volume for an undirected obstacle segment.
///
/// A wall blocks a ray regardless of which endpoint was stored first or
/// which side contains the light.
pub(crate) fn shadow_quad(
    segment: &LineSegment,
    light: Point,
    shadow_length: f32,
) -> Option<[Point; 4]> {
    let dir1_x = segment.p1.x - light.x;
    let dir1_y = segment.p1.y - light.y;
    let len1 = (dir1_x * dir1_x + dir1_y * dir1_y).sqrt();

    let dir2_x = segment.p2.x - light.x;
    let dir2_y = segment.p2.y - light.y;
    let len2 = (dir2_x * dir2_x + dir2_y * dir2_y).sqrt();

    if len1 <= 0.01 || len2 <= 0.01 {
        return None;
    }

    let projected_p1 = Point::new(
        segment.p1.x + dir1_x / len1 * shadow_length,
        segment.p1.y + dir1_y / len1 * shadow_length,
    );
    let projected_p2 = Point::new(
        segment.p2.x + dir2_x / len2 * shadow_length,
        segment.p2.y + dir2_y / len2 * shadow_length,
    );

    // TRIANGLE_STRIP produces (p1, projected_p1, p2) and
    // (projected_p1, p2, projected_p2).
    Some([segment.p1, projected_p1, segment.p2, projected_p2])
}

/// Visibility calculator using shadow quad generation for 2D lighting
/// Stores obstacle line segments and provides access for shadow casting
pub struct VisibilityCalculator {
    segments: Vec<LineSegment>,
    spatial_grid: SpatialGrid,
}

impl VisibilityCalculator {
    pub fn new() -> Self {
        Self {
            segments: Vec::new(),
            spatial_grid: SpatialGrid::new(128.0),
        }
    }

    /// Clear all obstacles
    pub fn clear(&mut self) {
        self.segments.clear();
        self.spatial_grid.clear();
    }

    /// Add obstacle line segment
    pub fn add_segment(&mut self, p1: Point, p2: Point) {
        let segment_idx = self.segments.len();
        let segment = LineSegment::new(p1, p2);

        self.segments.push(segment);
        self.spatial_grid.add_segment(segment_idx, &segment);
    }

    /// Add multiple segments from flat array [x1, y1, x2, y2, x1, y1, x2, y2, ...]
    pub fn add_segments_from_array(&mut self, data: &[f32]) {
        let mut i = 0;
        while i + 3 < data.len() {
            let p1 = Point::new(data[i], data[i + 1]);
            let p2 = Point::new(data[i + 2], data[i + 3]);
            self.add_segment(p1, p2);
            i += 4;
        }
    }

    /// Get all obstacle segments (for shadow quad generation)
    pub fn get_segments(&self) -> &[LineSegment] {
        &self.segments
    }
}

/// Spatial grid for fast obstacle lookup
/// Uses uniform grid subdivision for O(1) spatial queries
struct SpatialGrid {
    cell_size: f32,
    grid: std::collections::HashMap<(i32, i32), Vec<usize>>,
}

impl SpatialGrid {
    fn new(cell_size: f32) -> Self {
        Self {
            cell_size,
            grid: std::collections::HashMap::new(),
        }
    }

    fn clear(&mut self) {
        self.grid.clear();
    }

    fn add_segment(&mut self, idx: usize, segment: &LineSegment) {
        let min_x = segment.p1.x.min(segment.p2.x);
        let max_x = segment.p1.x.max(segment.p2.x);
        let min_y = segment.p1.y.min(segment.p2.y);
        let max_y = segment.p1.y.max(segment.p2.y);

        let cx0 = (min_x / self.cell_size).floor() as i32;
        let cx1 = (max_x / self.cell_size).floor() as i32;
        let cy0 = (min_y / self.cell_size).floor() as i32;
        let cy1 = (max_y / self.cell_size).floor() as i32;

        for cx in cx0..=cx1 {
            for cy in cy0..=cy1 {
                self.grid.entry((cx, cy)).or_default().push(idx);
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn point_new_creates_point() {
        let p = Point::new(1.5, 2.5);
        assert_eq!(p.x, 1.5);
        assert_eq!(p.y, 2.5);
    }

    #[test]
    fn line_segment_stores_endpoints() {
        let seg = LineSegment::new(Point::new(0.0, 0.0), Point::new(10.0, 20.0));
        assert_eq!(seg.p1.x, 0.0);
        assert_eq!(seg.p2.x, 10.0);
        assert_eq!(seg.p2.y, 20.0);
    }

    #[test]
    fn calculator_starts_empty() {
        let calc = VisibilityCalculator::new();
        assert!(calc.get_segments().is_empty());
    }

    #[test]
    fn add_segment_increases_count() {
        let mut calc = VisibilityCalculator::new();
        calc.add_segment(Point::new(0.0, 0.0), Point::new(10.0, 0.0));
        assert_eq!(calc.get_segments().len(), 1);
    }

    #[test]
    fn add_segments_from_array_parses_flat_quads() {
        let mut calc = VisibilityCalculator::new();
        let data = vec![0.0, 0.0, 10.0, 0.0, 10.0, 0.0, 10.0, 10.0];
        calc.add_segments_from_array(&data);
        assert_eq!(calc.get_segments().len(), 2);
        assert_eq!(calc.get_segments()[0].p1.x, 0.0);
        assert_eq!(calc.get_segments()[1].p2.y, 10.0);
    }

    #[test]
    fn add_segments_from_array_ignores_incomplete() {
        let mut calc = VisibilityCalculator::new();
        calc.add_segments_from_array(&[1.0, 2.0, 3.0]);
        assert!(calc.get_segments().is_empty());
    }

    #[test]
    fn clear_removes_all_segments() {
        let mut calc = VisibilityCalculator::new();
        calc.add_segment(Point::new(0.0, 0.0), Point::new(100.0, 0.0));
        calc.add_segment(Point::new(0.0, 100.0), Point::new(100.0, 100.0));
        assert_eq!(calc.get_segments().len(), 2);
        calc.clear();
        assert!(calc.get_segments().is_empty());
    }

    #[test]
    fn multiple_segments_stored_in_order() {
        let mut calc = VisibilityCalculator::new();
        calc.add_segment(Point::new(0.0, 0.0), Point::new(1.0, 0.0));
        calc.add_segment(Point::new(2.0, 0.0), Point::new(3.0, 0.0));
        calc.add_segment(Point::new(4.0, 0.0), Point::new(5.0, 0.0));
        let segs = calc.get_segments();
        assert_eq!(segs.len(), 3);
        assert_eq!(segs[0].p1.x, 0.0);
        assert_eq!(segs[1].p1.x, 2.0);
        assert_eq!(segs[2].p1.x, 4.0);
    }

    #[test]
    fn shadow_quad_is_cast_from_either_side_of_an_undirected_wall() {
        let wall = LineSegment::new(Point::new(0.0, 0.0), Point::new(10.0, 0.0));

        let from_above = shadow_quad(&wall, Point::new(5.0, -10.0), 100.0).unwrap();
        let from_below = shadow_quad(&wall, Point::new(5.0, 10.0), 100.0).unwrap();

        assert!(from_above[1].y > wall.p1.y);
        assert!(from_below[1].y < wall.p1.y);
    }

    #[test]
    fn reversing_wall_endpoints_does_not_disable_its_shadow() {
        let forward = LineSegment::new(Point::new(0.0, 0.0), Point::new(10.0, 0.0));
        let reverse = LineSegment::new(Point::new(10.0, 0.0), Point::new(0.0, 0.0));
        let light = Point::new(5.0, -10.0);

        assert!(shadow_quad(&forward, light, 100.0).is_some());
        assert!(shadow_quad(&reverse, light, 100.0).is_some());
    }

    #[test]
    fn segment_distance_uses_the_closest_point_not_the_midpoint() {
        let segment = LineSegment::new(Point::new(-1_000.0, 0.0), Point::new(10.0, 0.0));

        assert_eq!(
            distance_squared_to_segment(Point::new(0.0, 5.0), &segment),
            25.0
        );
    }

    #[test]
    fn segment_distance_clamps_to_an_endpoint() {
        let segment = LineSegment::new(Point::new(10.0, 10.0), Point::new(20.0, 10.0));

        assert_eq!(
            distance_squared_to_segment(Point::new(0.0, 10.0), &segment),
            100.0
        );
    }

    #[test]
    fn segment_distance_handles_degenerate_segments() {
        let segment = LineSegment::new(Point::new(3.0, 4.0), Point::new(3.0, 4.0));

        assert_eq!(
            distance_squared_to_segment(Point::new(0.0, 0.0), &segment),
            25.0
        );
    }
}
