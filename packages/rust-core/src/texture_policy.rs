#![cfg_attr(not(target_arch = "wasm32"), allow(dead_code))]

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(crate) enum TextureResidency {
    Pinned,
    SceneRequired,
    Evictable,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(crate) struct TextureBudgetPolicy {
    pub bytes_per_canvas_pixel: u64,
    pub minimum_bytes: u64,
    pub maximum_bytes: u64,
}

impl Default for TextureBudgetPolicy {
    fn default() -> Self {
        Self {
            bytes_per_canvas_pixel: 32,
            minimum_bytes: 96 * 1024 * 1024,
            maximum_bytes: 384 * 1024 * 1024,
        }
    }
}

impl TextureBudgetPolicy {
    pub(crate) fn budget_for_canvas(self, width: u32, height: u32) -> u64 {
        u64::from(width)
            .saturating_mul(u64::from(height))
            .saturating_mul(self.bytes_per_canvas_pixel)
            .clamp(self.minimum_bytes, self.maximum_bytes)
    }
}

pub(crate) fn estimated_rgba8_bytes(width: u32, height: u32) -> Option<u64> {
    u64::from(width)
        .checked_mul(u64::from(height))?
        .checked_mul(4)
}

pub(crate) fn texture_over_budget_bytes(estimated_bytes: u64, budget_bytes: u64) -> u64 {
    estimated_bytes.saturating_sub(budget_bytes)
}

pub(crate) fn eviction_order(mut candidates: Vec<(String, u64, TextureResidency)>) -> Vec<String> {
    candidates.retain(|(_, _, residency)| *residency == TextureResidency::Evictable);
    candidates.sort_unstable_by(|(left_name, left_frame, _), (right_name, right_frame, _)| {
        left_frame
            .cmp(right_frame)
            .then_with(|| left_name.cmp(right_name))
    });
    candidates.into_iter().map(|(name, _, _)| name).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rgba8_estimate_uses_checked_u64_arithmetic() {
        assert_eq!(estimated_rgba8_bytes(0, u32::MAX), Some(0));
        assert_eq!(estimated_rgba8_bytes(1, 1), Some(4));
        assert_eq!(estimated_rgba8_bytes(4_096, 2_048), Some(33_554_432));
        assert_eq!(estimated_rgba8_bytes(u32::MAX, u32::MAX), None);
    }

    #[test]
    fn canvas_budget_clamps_to_policy_bounds() {
        let policy = TextureBudgetPolicy::default();

        assert_eq!(policy.budget_for_canvas(0, 0), 96 * 1024 * 1024);
        assert_eq!(policy.budget_for_canvas(2_000, 2_000), 128_000_000);
        assert_eq!(
            policy.budget_for_canvas(u32::MAX, u32::MAX),
            384 * 1024 * 1024
        );
    }

    #[test]
    fn eviction_order_excludes_required_records_and_is_deterministic() {
        let candidates = vec![
            ("zeta".to_string(), 4, TextureResidency::Evictable),
            ("font".to_string(), 0, TextureResidency::Pinned),
            ("beta".to_string(), 2, TextureResidency::Evictable),
            ("map".to_string(), 1, TextureResidency::SceneRequired),
            ("alpha".to_string(), 2, TextureResidency::Evictable),
        ];

        assert_eq!(
            eviction_order(candidates),
            vec!["alpha".to_string(), "beta".to_string(), "zeta".to_string(),]
        );
    }

    #[test]
    fn required_working_set_overflow_is_reported_without_underflow() {
        assert_eq!(texture_over_budget_bytes(120, 100), 20);
        assert_eq!(texture_over_budget_bytes(80, 100), 0);
    }

    #[test]
    fn residency_classes_are_distinct() {
        assert_ne!(TextureResidency::Pinned, TextureResidency::SceneRequired);
        assert_ne!(TextureResidency::Pinned, TextureResidency::Evictable);
    }
}
