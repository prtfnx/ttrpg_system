//! Shared, renderer-owned geometry for sight and light occlusion.

use crate::math::Vec2;
use std::collections::HashMap;

const DEFAULT_CELL_SIZE: f32 = 128.0;

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Segment {
    pub start: Vec2,
    pub end: Vec2,
}

impl Segment {
    pub fn new(start: Vec2, end: Vec2) -> Self {
        Self { start, end }
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum QueryMode {
    Indexed,
    FullScan,
}

#[derive(Debug, Default)]
pub struct QueryWorkspace {
    candidates: Vec<usize>,
    seen_generation: Vec<u32>,
    generation: u32,
}

impl QueryWorkspace {
    pub fn candidates(&self) -> &[usize] {
        &self.candidates
    }

    fn begin(&mut self, segment_count: usize) {
        self.candidates.clear();
        self.seen_generation.resize(segment_count, 0);
        self.generation = self.generation.wrapping_add(1);
        if self.generation == 0 {
            self.seen_generation.fill(0);
            self.generation = 1;
        }
    }

    fn push_if_unseen(&mut self, index: usize) {
        if self.seen_generation[index] != self.generation {
            self.seen_generation[index] = self.generation;
            self.candidates.push(index);
        }
    }
}

#[derive(Debug, Default)]
pub(crate) struct VisibilityWorkspace {
    angles: Vec<f32>,
    query: QueryWorkspace,
}

#[derive(Debug)]
struct UniformGrid {
    cell_size: f32,
    cells: HashMap<(i32, i32), Vec<usize>>,
    memberships: usize,
}

impl UniformGrid {
    fn new(cell_size: f32) -> Self {
        debug_assert!(cell_size.is_finite() && cell_size > 0.0);
        Self {
            cell_size,
            cells: HashMap::new(),
            memberships: 0,
        }
    }

    fn insert(&mut self, index: usize, segment: Segment) {
        let min_x = segment.start.x.min(segment.end.x);
        let max_x = segment.start.x.max(segment.end.x);
        let min_y = segment.start.y.min(segment.end.y);
        let max_y = segment.start.y.max(segment.end.y);
        let cx0 = self.cell(min_x);
        let cx1 = self.cell(max_x);
        let cy0 = self.cell(min_y);
        let cy1 = self.cell(max_y);

        for cx in cx0..=cx1 {
            for cy in cy0..=cy1 {
                self.cells.entry((cx, cy)).or_default().push(index);
                self.memberships = self.memberships.saturating_add(1);
            }
        }
    }

    fn query(
        &self,
        min: Vec2,
        max: Vec2,
        segment_count: usize,
        workspace: &mut QueryWorkspace,
    ) -> QueryMode {
        workspace.begin(segment_count);
        if segment_count == 0 {
            return QueryMode::Indexed;
        }
        if !min.x.is_finite() || !min.y.is_finite() || !max.x.is_finite() || !max.y.is_finite() {
            return QueryMode::FullScan;
        }

        let cx0 = self.cell(min.x.min(max.x));
        let cx1 = self.cell(min.x.max(max.x));
        let cy0 = self.cell(min.y.min(max.y));
        let cy1 = self.cell(min.y.max(max.y));
        let columns = u64::try_from(i64::from(cx1) - i64::from(cx0) + 1).unwrap_or(u64::MAX);
        let rows = u64::try_from(i64::from(cy1) - i64::from(cy0) + 1).unwrap_or(u64::MAX);
        let queried_cells = columns.checked_mul(rows).unwrap_or(u64::MAX);
        let comparison_size = segment_count.min(self.cells.len());
        let cell_budget = u64::try_from(comparison_size)
            .unwrap_or(u64::MAX)
            .saturating_mul(2)
            .max(16);
        let estimated_visits = queried_cells
            .saturating_mul(u64::try_from(self.memberships).unwrap_or(u64::MAX))
            .div_ceil(u64::try_from(self.cells.len()).unwrap_or(u64::MAX).max(1));
        let dense_limit = u64::try_from(segment_count)
            .unwrap_or(u64::MAX)
            .saturating_mul(3)
            .div_ceil(4);
        if queried_cells > cell_budget || estimated_visits >= dense_limit {
            return QueryMode::FullScan;
        }

        for cx in cx0..=cx1 {
            for cy in cy0..=cy1 {
                if let Some(indexes) = self.cells.get(&(cx, cy)) {
                    for &index in indexes {
                        workspace.push_if_unseen(index);
                    }
                }
            }
        }
        QueryMode::Indexed
    }

    fn cell(&self, coordinate: f32) -> i32 {
        (coordinate / self.cell_size).floor() as i32
    }
}

#[derive(Debug)]
pub struct SegmentIndex {
    segments: Vec<Segment>,
    endpoints: Vec<Vec2>,
    grid: UniformGrid,
}

impl Default for SegmentIndex {
    fn default() -> Self {
        Self::from_flat(&[])
    }
}

impl SegmentIndex {
    pub fn from_flat(data: &[f32]) -> Self {
        let mut index = Self {
            segments: Vec::with_capacity(data.len() / 4),
            endpoints: Vec::with_capacity(data.len() / 2),
            grid: UniformGrid::new(DEFAULT_CELL_SIZE),
        };
        for values in data.chunks_exact(4) {
            index.push(Segment::new(
                Vec2::new(values[0], values[1]),
                Vec2::new(values[2], values[3]),
            ));
        }
        index
    }

    fn push(&mut self, segment: Segment) {
        let segment_index = self.segments.len();
        self.endpoints.extend([segment.start, segment.end]);
        self.segments.push(segment);
        self.grid.insert(segment_index, segment);
    }

    pub fn segments(&self) -> &[Segment] {
        &self.segments
    }

    #[cfg(test)]
    fn endpoint_count(&self) -> usize {
        self.endpoints.len()
    }

    pub fn query_aabb(&self, min: Vec2, max: Vec2, workspace: &mut QueryWorkspace) -> QueryMode {
        self.grid.query(min, max, self.segments.len(), workspace)
    }

    pub(crate) fn compute_visibility(
        &self,
        origin: Vec2,
        max_distance: f32,
        workspace: &mut VisibilityWorkspace,
    ) -> Vec<(f32, Vec2)> {
        workspace.angles.clear();
        workspace
            .angles
            .reserve(self.endpoints.len().saturating_mul(3).saturating_add(32));
        for endpoint in &self.endpoints {
            let mut angle = (endpoint.y - origin.y).atan2(endpoint.x - origin.x);
            if angle < 0.0 {
                angle += std::f32::consts::TAU;
            }
            workspace
                .angles
                .extend([angle - 0.0001, angle, angle + 0.0001]);
        }
        for ray in 0..32 {
            workspace
                .angles
                .push(ray as f32 * std::f32::consts::TAU / 32.0);
        }

        let mut points = Vec::with_capacity(workspace.angles.len());
        for &angle in &workspace.angles {
            let direction = Vec2::new(angle.cos(), angle.sin());
            let ray_end = origin + direction * max_distance;
            let query_mode = self.query_aabb(origin, ray_end, &mut workspace.query);
            let candidates = match query_mode {
                QueryMode::Indexed => Some(workspace.query.candidates()),
                QueryMode::FullScan => None,
            };
            let mut closest = None;
            let mut closest_distance = max_distance;
            let mut visit = |segment: Segment| {
                if let Some(point) = segment_intersection(origin, ray_end, segment) {
                    let distance = (point - origin).length();
                    if distance < closest_distance {
                        closest_distance = distance;
                        closest = Some(point);
                    }
                }
            };
            if let Some(indexes) = candidates {
                for &index in indexes {
                    visit(self.segments[index]);
                }
            } else {
                for &segment in &self.segments {
                    visit(segment);
                }
            }
            let normalized_angle = if angle < 0.0 {
                angle + std::f32::consts::TAU
            } else {
                angle
            };
            points.push((normalized_angle, closest.unwrap_or(ray_end)));
        }
        points.sort_by(|left, right| {
            left.0
                .partial_cmp(&right.0)
                .unwrap_or(std::cmp::Ordering::Equal)
        });
        points
    }
}

#[derive(Debug, Default)]
pub(crate) struct OcclusionScene {
    revision: u32,
    pub sight: SegmentIndex,
    pub light: SegmentIndex,
}

impl OcclusionScene {
    pub(crate) fn replace(&mut self, sight: &[f32], light: &[f32]) {
        let next_sight = SegmentIndex::from_flat(sight);
        let next_light = SegmentIndex::from_flat(light);
        self.sight = next_sight;
        self.light = next_light;
        self.revision = self.revision.wrapping_add(1);
    }

    pub(crate) fn revision(&self) -> u32 {
        self.revision
    }
}

fn segment_intersection(ray_start: Vec2, ray_end: Vec2, segment: Segment) -> Option<Vec2> {
    let ray = ray_end - ray_start;
    let edge = segment.end - segment.start;
    let cross = ray.x * edge.y - ray.y * edge.x;
    if cross.abs() < 1e-6 {
        return None;
    }
    let offset = segment.start - ray_start;
    let ray_t = (offset.x * edge.y - offset.y * edge.x) / cross;
    let edge_t = (offset.x * ray.y - offset.y * ray.x) / cross;
    if (0.0..=1.0).contains(&ray_t) && (0.0..=1.0).contains(&edge_t) {
        Some(ray_start + ray * ray_t)
    } else {
        None
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::performance_fixtures::{build_performance_fixture, PerformanceFixtureKind};

    fn fixture_index(kind: PerformanceFixtureKind) -> SegmentIndex {
        let fixture = build_performance_fixture(kind);
        let mut values = Vec::with_capacity(fixture.segments.len() * 4);
        for segment in fixture.segments {
            values.extend_from_slice(&segment);
        }
        SegmentIndex::from_flat(&values)
    }

    fn distance_squared_to_segment(point: Vec2, segment: Segment) -> f32 {
        let edge = segment.end - segment.start;
        let length_squared = edge.x * edge.x + edge.y * edge.y;
        if length_squared <= f32::EPSILON {
            let offset = point - segment.start;
            return offset.x * offset.x + offset.y * offset.y;
        }
        let offset = point - segment.start;
        let projection = (offset.x * edge.x + offset.y * edge.y) / length_squared;
        let distance = point - (segment.start + edge * projection.clamp(0.0, 1.0));
        distance.x * distance.x + distance.y * distance.y
    }

    fn exact_indexes(index: &SegmentIndex, origin: Vec2, radius: f32) -> Vec<usize> {
        let radius_squared = radius * radius;
        index
            .segments()
            .iter()
            .enumerate()
            .filter_map(|(segment_index, &segment)| {
                (distance_squared_to_segment(origin, segment) <= radius_squared)
                    .then_some(segment_index)
            })
            .collect()
    }

    fn queried_exact_indexes(
        index: &SegmentIndex,
        origin: Vec2,
        radius: f32,
        workspace: &mut QueryWorkspace,
    ) -> Vec<usize> {
        let mode = index.query_aabb(
            origin - Vec2::new(radius, radius),
            origin + Vec2::new(radius, radius),
            workspace,
        );
        let radius_squared = radius * radius;
        let mut indexes = match mode {
            QueryMode::Indexed => workspace
                .candidates()
                .iter()
                .copied()
                .filter(|&candidate| {
                    distance_squared_to_segment(origin, index.segments()[candidate])
                        <= radius_squared
                })
                .collect(),
            QueryMode::FullScan => exact_indexes(index, origin, radius),
        };
        indexes.sort_unstable();
        indexes
    }

    fn reference_visibility(origin: Vec2, data: &[f32], radius: f32) -> Vec<(f32, Vec2)> {
        let segments: Vec<_> = data
            .chunks_exact(4)
            .map(|values| {
                Segment::new(
                    Vec2::new(values[0], values[1]),
                    Vec2::new(values[2], values[3]),
                )
            })
            .collect();
        let mut angles = Vec::with_capacity(segments.len() * 6 + 32);
        for segment in &segments {
            for endpoint in [segment.start, segment.end] {
                let mut angle = (endpoint.y - origin.y).atan2(endpoint.x - origin.x);
                if angle < 0.0 {
                    angle += std::f32::consts::TAU;
                }
                angles.extend([angle - 0.0001, angle, angle + 0.0001]);
            }
        }
        for ray in 0..32 {
            angles.push(ray as f32 * std::f32::consts::TAU / 32.0);
        }

        let mut points = Vec::with_capacity(angles.len());
        for angle in angles {
            let ray_end = origin + Vec2::new(angle.cos(), angle.sin()) * radius;
            let mut closest = None;
            let mut closest_distance = radius;
            for &segment in &segments {
                if let Some(point) = segment_intersection(origin, ray_end, segment) {
                    let distance = (point - origin).length();
                    if distance < closest_distance {
                        closest_distance = distance;
                        closest = Some(point);
                    }
                }
            }
            points.push((
                if angle < 0.0 {
                    angle + std::f32::consts::TAU
                } else {
                    angle
                },
                closest.unwrap_or(ray_end),
            ));
        }
        points.sort_by(|left, right| {
            left.0
                .partial_cmp(&right.0)
                .unwrap_or(std::cmp::Ordering::Equal)
        });
        points
    }

    fn assert_visibility_matches_old(data: &[f32], sources: &[(f32, f32, f32)]) {
        let index = SegmentIndex::from_flat(data);
        let mut workspace = VisibilityWorkspace::default();
        for &(x, y, radius) in sources {
            let actual = index.compute_visibility(Vec2::new(x, y), radius, &mut workspace);
            let expected = reference_visibility(Vec2::new(x, y), data, radius);
            assert_eq!(actual.len(), expected.len());
            for (actual, expected) in actual.iter().zip(expected) {
                assert!((actual.0 - expected.0).abs() < f32::EPSILON);
                assert!((actual.1.x - expected.1.x).abs() < 0.001);
                assert!((actual.1.y - expected.1.y).abs() < 0.001);
            }
        }
    }

    #[test]
    fn visibility_matches_existing_geometry_across_edge_cases() {
        let cases: &[&[f32]] = &[
            &[],
            &[0.0, 100.0, 200.0, 100.0, 200.0, 100.0, 200.0, 300.0],
            &[-2_000.0, -10.0, 2_000.0, -10.0],
            &[-300.0, -200.0, -50.0, -200.0, -50.0, -200.0, -50.0, 50.0],
            &[0.0, 100.0, 200.0, 100.0, 0.0, 100.0, 200.0, 100.0],
            &[0.0, 0.0, 200.0, 0.0, 50.0, 0.0, 150.0, 0.0],
        ];
        let sources = [
            (0.0, 0.0, 500.0),
            (100.0, 99.9, 300.0),
            (-100.0, -100.0, 700.0),
        ];
        for data in cases {
            assert_visibility_matches_old(data, &sources);
        }
    }

    #[test]
    fn replacement_is_atomic_and_revision_wrap_is_safe() {
        let mut scene = OcclusionScene::default();
        scene.replace(&[0.0, 0.0, 1.0, 0.0], &[0.0, 0.0, 0.0, 1.0]);
        assert_eq!(scene.revision(), 1);
        assert_eq!(scene.sight.segments().len(), 1);
        assert_eq!(scene.light.segments().len(), 1);
        scene.revision = u32::MAX;
        scene.replace(&[], &[]);
        assert_eq!(scene.revision(), 0);
        assert!(scene.sight.segments().is_empty());
        assert!(scene.light.segments().is_empty());
    }

    #[test]
    fn index_keeps_endpoints_and_deduplicates_aabb_candidates() {
        let index = SegmentIndex::from_flat(&[-1_000.0, 10.0, 1_000.0, 10.0]);
        let mut workspace = QueryWorkspace::default();
        let mode = index.query_aabb(
            Vec2::new(-20.0, -20.0),
            Vec2::new(20.0, 20.0),
            &mut workspace,
        );
        assert_eq!(index.endpoint_count(), 2);
        if mode == QueryMode::Indexed {
            assert_eq!(workspace.candidates(), &[0]);
        }
    }

    #[test]
    fn indexed_queries_match_full_scans_for_every_performance_fixture() {
        for kind in PerformanceFixtureKind::ALL {
            let fixture = build_performance_fixture(kind);
            let index = fixture_index(kind);
            let mut workspace = QueryWorkspace::default();
            for light in fixture.lights {
                let origin = Vec2::new(light.x, light.y);
                assert_eq!(
                    queried_exact_indexes(&index, origin, light.radius, &mut workspace),
                    exact_indexes(&index, origin, light.radius),
                    "{} fixture light at ({}, {})",
                    fixture.name,
                    light.x,
                    light.y
                );
            }
        }
    }

    #[test]
    fn ordinary_query_reduces_candidates_and_negative_cells_are_indexed() {
        let fixture = build_performance_fixture(PerformanceFixtureKind::Ordinary);
        let light = fixture.lights[0];
        let index = fixture_index(PerformanceFixtureKind::Ordinary);
        let mut workspace = QueryWorkspace::default();
        assert_eq!(
            index.query_aabb(
                Vec2::new(light.x - light.radius, light.y - light.radius),
                Vec2::new(light.x + light.radius, light.y + light.radius),
                &mut workspace,
            ),
            QueryMode::Indexed
        );
        assert!(workspace.candidates().len() < index.segments().len());

        let negative = SegmentIndex::from_flat(&[
            -200.0, -200.0, -150.0, -150.0, 10_000.0, 10_000.0, 10_010.0, 10_010.0,
        ]);
        assert_eq!(
            negative.query_aabb(
                Vec2::new(-210.0, -210.0),
                Vec2::new(-140.0, -140.0),
                &mut workspace,
            ),
            QueryMode::Indexed
        );
        assert_eq!(workspace.candidates(), &[0]);
    }

    #[test]
    fn huge_and_dense_long_queries_use_full_scan_fallback() {
        let ordinary = fixture_index(PerformanceFixtureKind::Ordinary);
        let mut workspace = QueryWorkspace::default();
        assert_eq!(
            ordinary.query_aabb(
                Vec2::new(-10_000.0, -10_000.0),
                Vec2::new(10_000.0, 10_000.0),
                &mut workspace,
            ),
            QueryMode::FullScan
        );

        let fixture = build_performance_fixture(PerformanceFixtureKind::LongSegments);
        let light = fixture.lights[0];
        let long = fixture_index(PerformanceFixtureKind::LongSegments);
        assert_eq!(
            long.query_aabb(
                Vec2::new(light.x - light.radius, light.y - light.radius),
                Vec2::new(light.x + light.radius, light.y + light.radius),
                &mut workspace,
            ),
            QueryMode::FullScan
        );
    }

    #[test]
    fn generation_wrap_clears_seen_stamps() {
        let index =
            SegmentIndex::from_flat(&[0.0, 0.0, 10.0, 0.0, 10_000.0, 10_000.0, 10_010.0, 10_010.0]);
        let mut workspace = QueryWorkspace {
            candidates: vec![99],
            seen_generation: vec![1],
            generation: u32::MAX,
        };
        assert_eq!(
            index.query_aabb(Vec2::new(0.0, 0.0), Vec2::new(10.0, 10.0), &mut workspace,),
            QueryMode::Indexed
        );
        assert_eq!(workspace.generation, 1);
        assert_eq!(workspace.candidates(), &[0]);
    }
}
