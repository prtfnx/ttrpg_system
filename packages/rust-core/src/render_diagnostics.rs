use serde::Serialize;

/// Stable, allocation-free counters collected while one renderer frame is submitted.
///
/// The fields use JavaScript-safe scalar types so the WASM boundary does not require
/// `BigInt`. Texture byte accounting remains `u64` in its owner and is converted only
/// when a snapshot is assembled.
#[derive(Clone, Debug, Default, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct RenderFrameCounters {
    pub frame_number: u32,
    pub sprites_considered: u32,
    pub sprites_drawn: u32,
    pub sprites_culled: u32,
    pub draw_calls: u32,
    pub buffer_uploads: u32,
    pub active_lights: u32,
    pub shadow_segments_total: u32,
    pub shadow_candidates: u32,
    pub shadow_segments_accepted: u32,
    pub shadow_draw_calls: u32,
    pub occlusion_revision: u32,
    pub occlusion_rebuilds: u32,
    pub resident_textures: u32,
    pub estimated_texture_bytes: f64,
    pub texture_budget_bytes: f64,
    pub texture_over_budget_bytes: f64,
}

impl RenderFrameCounters {
    pub fn begin_frame(&mut self) {
        self.frame_number = self.frame_number.wrapping_add(1);
        self.sprites_considered = 0;
        self.sprites_drawn = 0;
        self.sprites_culled = 0;
        self.draw_calls = 0;
        self.buffer_uploads = 0;
        self.active_lights = 0;
        self.shadow_segments_total = 0;
        self.shadow_candidates = 0;
        self.shadow_segments_accepted = 0;
        self.shadow_draw_calls = 0;
        self.resident_textures = 0;
        self.estimated_texture_bytes = 0.0;
        self.texture_budget_bytes = 0.0;
        self.texture_over_budget_bytes = 0.0;
    }

    pub fn record_occlusion_rebuild(&mut self, revision: u32) {
        self.occlusion_revision = revision;
        self.occlusion_rebuilds = self.occlusion_rebuilds.saturating_add(1);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn begin_frame_resets_transient_counts_and_keeps_lifetime_counts() {
        let mut counters = RenderFrameCounters {
            frame_number: 9,
            sprites_considered: 12,
            draw_calls: 8,
            buffer_uploads: 5,
            occlusion_revision: 3,
            occlusion_rebuilds: 7,
            resident_textures: 4,
            estimated_texture_bytes: 1024.0,
            ..Default::default()
        };

        counters.begin_frame();

        assert_eq!(counters.frame_number, 10);
        assert_eq!(counters.sprites_considered, 0);
        assert_eq!(counters.draw_calls, 0);
        assert_eq!(counters.buffer_uploads, 0);
        assert_eq!(counters.resident_textures, 0);
        assert_eq!(counters.estimated_texture_bytes, 0.0);
        assert_eq!(counters.occlusion_revision, 3);
        assert_eq!(counters.occlusion_rebuilds, 7);
    }

    #[test]
    fn occlusion_rebuild_records_scene_revision_and_lifetime_total() {
        let mut counters = RenderFrameCounters::default();

        counters.record_occlusion_rebuild(7);
        counters.record_occlusion_rebuild(8);

        assert_eq!(counters.occlusion_revision, 8);
        assert_eq!(counters.occlusion_rebuilds, 2);
    }
}
