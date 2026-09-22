//! Deterministic, asset-free scenes used by renderer benchmarks and browser tests.

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum PerformanceFixtureKind {
    Ordinary,
    Large,
    ShadowStress,
    CullingStress,
    LongSegments,
}

impl PerformanceFixtureKind {
    pub const ALL: [Self; 5] = [
        Self::Ordinary,
        Self::Large,
        Self::ShadowStress,
        Self::CullingStress,
        Self::LongSegments,
    ];

    pub fn name(self) -> &'static str {
        match self {
            Self::Ordinary => "ordinary",
            Self::Large => "large",
            Self::ShadowStress => "shadow-stress",
            Self::CullingStress => "culling-stress",
            Self::LongSegments => "long-segments",
        }
    }

    fn counts(self) -> (usize, usize, usize) {
        match self {
            Self::Ordinary => (100, 200, 4),
            Self::Large => (500, 1_000, 12),
            Self::ShadowStress => (100, 2_000, 24),
            Self::CullingStress => (2_000, 200, 4),
            Self::LongSegments => (50, 100, 8),
        }
    }
}

#[derive(Clone, Debug, PartialEq)]
pub struct FixtureSprite {
    pub id: u32,
    pub x: f32,
    pub y: f32,
    pub width: f32,
    pub height: f32,
    pub rotation_radians: f32,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct FixtureLight {
    pub x: f32,
    pub y: f32,
    pub radius: f32,
}

#[derive(Clone, Debug, PartialEq)]
pub struct PerformanceFixture {
    pub name: &'static str,
    pub sprites: Vec<FixtureSprite>,
    pub segments: Vec<[f32; 4]>,
    pub lights: Vec<FixtureLight>,
}

pub fn build_performance_fixture(kind: PerformanceFixtureKind) -> PerformanceFixture {
    let (sprite_count, segment_count, light_count) = kind.counts();
    let sprites = (0..sprite_count)
        .map(|index| {
            let offscreen_offset = if kind == PerformanceFixtureKind::CullingStress && index >= 100
            {
                20_000.0
            } else {
                0.0
            };
            FixtureSprite {
                id: index as u32,
                x: offscreen_offset + ((index * 97) % 1_900) as f32 - 200.0,
                y: offscreen_offset + ((index * 53) % 1_300) as f32 - 150.0,
                width: 24.0 + (index % 5) as f32 * 8.0,
                height: 24.0 + (index % 7) as f32 * 6.0,
                rotation_radians: (index % 16) as f32 * std::f32::consts::PI / 8.0,
            }
        })
        .collect();

    let segments = (0..segment_count)
        .map(|index| {
            let x = ((index * 71) % 2_000) as f32 - 250.0;
            let y = ((index * 43) % 1_400) as f32 - 200.0;
            if kind == PerformanceFixtureKind::LongSegments {
                [x - 2_000.0, y, x + 2_000.0, y + (index % 3) as f32]
            } else {
                [x, y, x + 32.0 + (index % 9) as f32 * 7.0, y + 24.0]
            }
        })
        .collect();

    let lights = (0..light_count)
        .map(|index| FixtureLight {
            x: 100.0 + ((index * 173) % 1_600) as f32,
            y: 100.0 + ((index * 107) % 1_000) as f32,
            radius: 160.0 + (index % 4) as f32 * 40.0,
        })
        .collect();

    PerformanceFixture {
        name: kind.name(),
        sprites,
        segments,
        lights,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn fixture_counts_match_the_performance_plan() {
        let expected = [
            (100, 200, 4),
            (500, 1_000, 12),
            (100, 2_000, 24),
            (2_000, 200, 4),
            (50, 100, 8),
        ];

        for (kind, counts) in PerformanceFixtureKind::ALL.into_iter().zip(expected) {
            let fixture = build_performance_fixture(kind);
            assert_eq!(
                (
                    fixture.sprites.len(),
                    fixture.segments.len(),
                    fixture.lights.len()
                ),
                counts,
                "{} fixture",
                fixture.name
            );
        }
    }

    #[test]
    fn fixture_generation_is_reproducible() {
        for kind in PerformanceFixtureKind::ALL {
            assert_eq!(
                build_performance_fixture(kind),
                build_performance_fixture(kind)
            );
        }
    }

    #[test]
    fn culling_fixture_places_most_sprites_far_from_the_viewport() {
        let fixture = build_performance_fixture(PerformanceFixtureKind::CullingStress);
        let offscreen = fixture
            .sprites
            .iter()
            .filter(|sprite| sprite.x >= 10_000.0 && sprite.y >= 10_000.0)
            .count();

        assert_eq!(offscreen, 1_900);
    }

    #[test]
    fn long_segment_fixture_crosses_large_world_ranges() {
        let fixture = build_performance_fixture(PerformanceFixtureKind::LongSegments);

        assert!(fixture
            .segments
            .iter()
            .all(|segment| segment[2] - segment[0] == 4_000.0));
    }
}
