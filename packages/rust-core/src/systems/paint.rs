use crate::types::BlendMode;
use crate::webgl_renderer::WebGLRenderer;
use std::collections::BTreeMap;
use wasm_bindgen::JsValue;

use super::paint_mesh::{tessellate, PaintMesh, PaintMeshCache};
use super::paint_scene::{PaintObject, PaintObjectInput, PaintScene};

struct PaintDraft {
    object: PaintObject,
    mesh: PaintMesh,
}

pub struct PaintObjectRenderer {
    object_scene: PaintScene,
    object_meshes: PaintMeshCache,
    transient_drafts: BTreeMap<String, PaintDraft>,
    selected_object_id: Option<String>,
}

impl Default for PaintObjectRenderer {
    fn default() -> Self {
        Self::new()
    }
}

impl PaintObjectRenderer {
    pub fn new() -> Self {
        Self {
            object_scene: PaintScene::default(),
            object_meshes: PaintMeshCache::default(),
            transient_drafts: BTreeMap::new(),
            selected_object_id: None,
        }
    }

    pub fn replace_object_snapshot_json(
        &mut self,
        table_id: &str,
        revision: u64,
        objects_json: &str,
    ) -> bool {
        let Ok(objects) = serde_json::from_str::<Vec<PaintObject>>(objects_json) else {
            return false;
        };
        if self
            .object_scene
            .replace_snapshot(table_id, revision, objects)
            .is_err()
        {
            return false;
        }
        self.object_meshes
            .replace(self.object_scene.ordered_objects());
        if self
            .selected_object_id
            .as_ref()
            .is_some_and(|id| self.object_scene.get(id).is_none())
        {
            self.selected_object_id = None;
        }
        true
    }

    pub fn upsert_object_json(&mut self, table_id: &str, revision: u64, object_json: &str) -> bool {
        let Ok(object) = serde_json::from_str::<PaintObject>(object_json) else {
            return false;
        };
        let object_id = object.id.clone();
        if self
            .object_scene
            .apply_upsert(table_id, revision, object)
            .is_err()
        {
            return false;
        }
        if let Some(accepted) = self.object_scene.get(&object_id) {
            self.object_meshes.upsert(accepted);
        }
        true
    }

    pub fn remove_object(
        &mut self,
        table_id: &str,
        revision: u64,
        object_id: &str,
        deleted_version: u64,
    ) -> bool {
        if self
            .object_scene
            .apply_delete(table_id, revision, object_id, deleted_version)
            .is_err()
        {
            return false;
        }
        self.object_meshes.remove(object_id);
        if self.selected_object_id.as_deref() == Some(object_id) {
            self.selected_object_id = None;
        }
        true
    }

    pub fn hit_test_object(&self, world_x: f32, world_y: f32, tolerance: f32) -> Option<String> {
        self.object_scene
            .hit_test(world_x, world_y, tolerance)
            .map(str::to_owned)
    }

    pub fn hit_test_handle(
        &self,
        object_id: &str,
        world_x: f32,
        world_y: f32,
        tolerance: f32,
    ) -> Option<String> {
        self.object_scene
            .hit_test_handle(object_id, world_x, world_y, tolerance)
            .map(str::to_owned)
    }

    pub fn select_object(&mut self, object_id: &str) -> bool {
        if self.object_scene.get(object_id).is_none() {
            return false;
        }
        self.selected_object_id = Some(object_id.to_owned());
        true
    }

    pub fn clear_object_selection(&mut self) {
        self.selected_object_id = None;
    }

    pub fn selected_object_id(&self) -> Option<String> {
        self.selected_object_id.clone()
    }

    pub fn object_revision(&self) -> u64 {
        self.object_scene.revision()
    }

    pub fn object_count(&self) -> usize {
        self.object_scene.len()
    }

    pub fn object_mesh_rebuild_count(&self) -> u64 {
        self.object_meshes.rebuild_count()
    }

    pub fn set_draft_json(&mut self, table_id: &str, key: &str, draft_json: &str) -> bool {
        if key.is_empty() || key.len() > 256 || self.object_scene.table_id() != Some(table_id) {
            return false;
        }
        let Ok(input) = serde_json::from_str::<PaintObjectInput>(draft_json) else {
            return false;
        };
        let Ok(object) = input.into_transient(table_id) else {
            return false;
        };
        let mesh = tessellate(&object);
        self.transient_drafts
            .insert(key.to_owned(), PaintDraft { object, mesh });
        true
    }

    pub fn clear_draft(&mut self, key: &str) -> bool {
        self.transient_drafts.remove(key).is_some()
    }

    pub fn clear_drafts(&mut self) {
        self.transient_drafts.clear();
    }

    pub fn draft_count(&self) -> usize {
        self.transient_drafts.len()
    }
}

impl PaintObjectRenderer {
    pub fn render_objects(
        &self,
        renderer: &WebGLRenderer,
        viewport: &crate::math::Rect,
        camera_zoom: f32,
    ) -> Result<(), JsValue> {
        renderer.set_blend_mode(&BlendMode::Alpha);
        for object in self.object_scene.ordered_objects() {
            let Some(mesh) = self.object_meshes.get(&object.id) else {
                continue;
            };
            let bounds = crate::math::Rect::new(
                mesh.bounds.min_x,
                mesh.bounds.min_y,
                mesh.bounds.max_x - mesh.bounds.min_x,
                mesh.bounds.max_y - mesh.bounds.min_y,
            );
            if !bounds.intersects(viewport) {
                continue;
            }
            let cache_prefix = format!("paint:{}:{}", object.table_id, object.id);
            if let Some(fill) = object.style.fill_rgba {
                renderer.draw_cached_triangles(
                    &format!("{cache_prefix}:fill"),
                    mesh.version,
                    &mesh.fill_vertices,
                    fill,
                )?;
            }
            renderer.draw_cached_triangles(
                &format!("{cache_prefix}:stroke"),
                mesh.version,
                &mesh.stroke_vertices,
                object.style.stroke_rgba,
            )?;
        }
        for draft in self.transient_drafts.values() {
            let bounds = crate::math::Rect::new(
                draft.mesh.bounds.min_x,
                draft.mesh.bounds.min_y,
                draft.mesh.bounds.max_x - draft.mesh.bounds.min_x,
                draft.mesh.bounds.max_y - draft.mesh.bounds.min_y,
            );
            if !bounds.intersects(viewport) {
                continue;
            }
            if let Some(fill) = draft.object.style.fill_rgba {
                renderer.draw_triangles(&draft.mesh.fill_vertices, fill)?;
            }
            renderer.draw_triangles(&draft.mesh.stroke_vertices, draft.object.style.stroke_rgba)?;
        }
        if let Some(object_id) = self.selected_object_id.as_deref() {
            let radius = 5.0 / camera_zoom.max(f32::EPSILON);
            for handle in self.object_scene.handles(object_id) {
                let vertices = [
                    handle.x - radius,
                    handle.y - radius,
                    handle.x + radius,
                    handle.y - radius,
                    handle.x - radius,
                    handle.y + radius,
                    handle.x + radius,
                    handle.y - radius,
                    handle.x + radius,
                    handle.y + radius,
                    handle.x - radius,
                    handle.y + radius,
                ];
                renderer.draw_triangles(&vertices, [0.1, 0.8, 1.0, 0.95])?;
            }
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::PaintObjectRenderer;

    #[test]
    fn transient_drafts_replace_by_key_and_clear_without_committing() {
        let mut paint = PaintObjectRenderer::new();
        paint.object_scene.activate_table("table");
        let draft = r#"{
            "id":"00000000-0000-4000-8000-000000000001",
            "kind":"line",
            "geometry":{"kind":"line","start":{"x":0,"y":0,"pressure":1},"end":{"x":10,"y":10,"pressure":0.5}},
            "transform":{"x":0,"y":0,"scale_x":1,"scale_y":1},
            "style":{"stroke_rgba":[1,0,0,1],"width":2,"fill_rgba":null}
        }"#;

        assert!(paint.set_draft_json("table", "local", draft));
        assert!(paint.set_draft_json("table", "local", draft));
        assert_eq!(paint.draft_count(), 1);
        assert_eq!(paint.object_count(), 0);
        assert!(!paint.set_draft_json("other", "local", draft));
        assert!(paint.clear_draft("local"));
        assert_eq!(paint.draft_count(), 0);
    }
}
