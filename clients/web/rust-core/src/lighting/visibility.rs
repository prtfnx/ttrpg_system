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

    pub fn from_vec2(v: Vec2) -> Self {
        Self { x: v.x, y: v.y }
    }

    pub fn to_vec2(self) -> Vec2 {
        Vec2::new(self.x, self.y)
    }

    pub fn distance_to(&self, other: &Point) -> f32 {
        let dx = self.x - other.x;
        let dy = self.y - other.y;
        (dx * dx + dy * dy).sqrt()
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

/// Endpoint with angle information for sweep line algorithm
#[derive(Clone, Debug)]
struct Endpoint {
    point: Point,
    angle: f32,
    distance: f32,
    segment_idx: usize,
    is_start: bool,
}

/// Visibility calculator using rotational sweep ray casting
/// This is the industry-standard algorithm for 2D lighting with shadow casting
pub struct VisibilityCalculator {
    segments: Vec<LineSegment>,
    endpoints: Vec<Endpoint>,
    spatial_grid: SpatialGrid,
}

impl VisibilityCalculator {
    pub fn new() -> Self {
        Self {
            segments: Vec::new(),
            endpoints: Vec::new(),
            spatial_grid: SpatialGrid::new(128.0),
        }
    }

    /// Clear all obstacles
    pub fn clear(&mut self) {
        self.segments.clear();
        self.endpoints.clear();
        self.spatial_grid.clear();
    }

    /// Add obstacle line segment
    pub fn add_segment(&mut self, p1: Point, p2: Point) {
        let segment_idx = self.segments.len();
        let segment = LineSegment::new(p1, p2);
        
        self.segments.push(segment);
        self.spatial_grid.add_segment(segment_idx, &segment);
        
        // Add endpoints for sweep line algorithm
        self.endpoints.push(Endpoint {
            point: p1,
            angle: 0.0,
            distance: 0.0,
            segment_idx,
            is_start: true,
        });
        
        self.endpoints.push(Endpoint {
            point: p2,
            angle: 0.0,
            distance: 0.0,
            segment_idx,
            is_start: false,
        });
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

    /// Compute visibility polygon from light position using sweep line algorithm
    /// This is the core algorithm - rotational sweep with ray casting
    pub fn compute_visibility(&mut self, light_pos: Point, max_radius: f32) -> Vec<Point> {
        if self.segments.is_empty() {
            // No obstacles - return circle
            return self.generate_circle(light_pos, max_radius);
        }

        // Get candidate segments from spatial grid first
        let candidates = self.spatial_grid.get_candidates_in_radius(light_pos, max_radius);
        
        if candidates.is_empty() {
            // No obstacles in range - return circle
            return self.generate_circle(light_pos, max_radius);
        }

        // Calculate angles for all endpoints relative to light
        for endpoint in &mut self.endpoints {
            let dx = endpoint.point.x - light_pos.x;
            let dy = endpoint.point.y - light_pos.y;
            endpoint.angle = dy.atan2(dx);
            
            // Calculate distance for filtering
            endpoint.distance = (dx * dx + dy * dy).sqrt();
        }

        // Sort endpoints by angle (sweep line rotation)
        self.endpoints.sort_by(|a, b| {
            a.angle.partial_cmp(&b.angle).unwrap_or(std::cmp::Ordering::Equal)
        });

        let mut visibility_points = Vec::new();
        let mut active_segments: Vec<usize> = Vec::new();

        // Minimum distance threshold to avoid artifacts when light is too close
        let min_distance = 5.0;

        // Sweep through all angles
        for i in 0..self.endpoints.len() {
            let endpoint = &self.endpoints[i];
            
            // Skip endpoints too close to light source to avoid artifacts
            if endpoint.distance < min_distance {
                continue;
            }
            
            // Cast 3 rays per endpoint to catch corners
            let angles = [
                endpoint.angle - 0.0001,
                endpoint.angle,
                endpoint.angle + 0.0001,
            ];

            for &angle in &angles {
                if let Some(intersection) = self.cast_ray(
                    light_pos,
                    angle,
                    &active_segments,
                    &candidates,
                    max_radius,
                ) {
                    visibility_points.push(intersection);
                }
            }

            // Update active segments for sweep line
            if endpoint.is_start {
                if candidates.contains(&endpoint.segment_idx) {
                    active_segments.push(endpoint.segment_idx);
                }
            } else {
                active_segments.retain(|&idx| idx != endpoint.segment_idx);
            }
        }

        // If we got very few points, fall back to circle
        if visibility_points.len() < 8 {
            return self.generate_circle(light_pos, max_radius);
        }

        visibility_points
    }

    /// Cast a single ray and find closest intersection
    fn cast_ray(
        &self,
        origin: Point,
        angle: f32,
        active_segments: &[usize],
        candidates: &[usize],
        max_radius: f32,
    ) -> Option<Point> {
        let ray_dx = angle.cos();
        let ray_dy = angle.sin();
        
        let mut closest_t = max_radius;
        let mut found = false;

        // Only check active segments that are in candidates
        for &seg_idx in active_segments {
            if !candidates.contains(&seg_idx) {
                continue;
            }

            let segment = &self.segments[seg_idx];
            
            if let Some(t) = ray_segment_intersection(
                origin,
                ray_dx,
                ray_dy,
                segment,
            ) {
                if t < closest_t && t > 0.001 {
                    closest_t = t;
                    found = true;
                }
            }
        }

        if found || active_segments.is_empty() {
            Some(Point::new(
                origin.x + ray_dx * closest_t,
                origin.y + ray_dy * closest_t,
            ))
        } else {
            None
        }
    }

    /// Generate circle when no obstacles
    fn generate_circle(&self, center: Point, radius: f32) -> Vec<Point> {
        let segments = 32;
        let mut points = Vec::with_capacity(segments);
        
        for i in 0..segments {
            let angle = (i as f32 / segments as f32) * 2.0 * PI;
            points.push(Point::new(
                center.x + angle.cos() * radius,
                center.y + angle.sin() * radius,
            ));
        }
        
        points
    }
}

/// Ray-segment intersection using parametric equations
/// Returns distance along ray (t) if intersection exists
fn ray_segment_intersection(
    ray_origin: Point,
    ray_dx: f32,
    ray_dy: f32,
    segment: &LineSegment,
) -> Option<f32> {
    let s_dx = segment.p2.x - segment.p1.x;
    let s_dy = segment.p2.y - segment.p1.y;

    // Check if ray and segment are parallel
    let denominator = s_dx * ray_dy - s_dy * ray_dx;
    if denominator.abs() < 1e-6 {
        return None;
    }

    // Parametric intersection
    let t2 = (ray_dx * (segment.p1.y - ray_origin.y) + 
              ray_dy * (ray_origin.x - segment.p1.x)) / denominator;
    
    if t2 < 0.0 || t2 > 1.0 {
        return None; // Not on segment
    }

    let t1 = if ray_dx.abs() > ray_dy.abs() {
        (segment.p1.x + s_dx * t2 - ray_origin.x) / ray_dx
    } else {
        (segment.p1.y + s_dy * t2 - ray_origin.y) / ray_dy
    };
    
    if t1 < 0.0 {
        return None; // Behind ray origin
    }

    Some(t1)
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_ray_segment_intersection() {
        let ray_origin = Point::new(0.0, 0.0);
        let segment = LineSegment::new(
            Point::new(10.0, -5.0),
            Point::new(10.0, 5.0),
        );

        let t = ray_segment_intersection(
            ray_origin,
            1.0,  // ray pointing right
            0.0,
            &segment,
        );

        assert!(t.is_some());
        assert!((t.unwrap() - 10.0).abs() < 0.001);
    }

    #[test]
    fn test_visibility_no_obstacles() {
        let mut calc = VisibilityCalculator::new();
        let light_pos = Point::new(50.0, 50.0);
        let polygon = calc.compute_visibility(light_pos, 100.0);

        assert!(polygon.len() >= 32);
    }

    #[test]
    fn test_visibility_with_wall() {
        let mut calc = VisibilityCalculator::new();
        calc.add_segment(
            Point::new(0.0, 50.0),
            Point::new(100.0, 50.0),
        );

        let light_pos = Point::new(50.0, 0.0);
        let polygon = calc.compute_visibility(light_pos, 100.0);

        // All points should be above the wall
        for point in &polygon {
            assert!(point.y <= 50.1);
        }
    }
}
