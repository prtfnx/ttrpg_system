use crate::math::Vec2;
use std::f32::consts::PI;

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
                self.grid.entry((cx, cy)).or_insert_with(Vec::new).push(idx);
            }
        }
    }

    fn get_candidates_in_radius(&self, center: Point, radius: f32) -> Vec<usize> {
        let min_x = center.x - radius;
        let max_x = center.x + radius;
        let min_y = center.y - radius;
        let max_y = center.y + radius;

        let cx0 = (min_x / self.cell_size).floor() as i32;
        let cx1 = (max_x / self.cell_size).floor() as i32;
        let cy0 = (min_y / self.cell_size).floor() as i32;
        let cy1 = (max_y / self.cell_size).floor() as i32;

        let mut candidates = std::collections::HashSet::new();
        
        for cx in cx0..=cx1 {
            for cy in cy0..=cy1 {
                if let Some(indices) = self.grid.get(&(cx, cy)) {
                    for &idx in indices {
                        candidates.insert(idx);
                    }
                }
            }
        }

        candidates.into_iter().collect()
    }
}


