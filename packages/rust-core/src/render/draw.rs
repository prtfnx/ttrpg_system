use wasm_bindgen::prelude::*;
use crate::types::*;
use crate::math::*;
use crate::sprite_renderer::SpriteRenderer;

use super::RenderEngine;

#[wasm_bindgen]
impl RenderEngine {
    #[wasm_bindgen]
    pub fn render(&mut self) -> Result<(), JsValue> {
        self.renderer.clear(
            self.background_color[0],
            self.background_color[1],
            self.background_color[2],
            self.background_color[3]
        );
        
        let viewport_bounds = self.get_world_view_bounds();
        
        let (tx, ty, tw, th) = self.table_manager.get_active_table_world_bounds()
            .expect("CRITICAL: No active table found during rendering! Table-centric architecture requires a table to exist.");
        
        let table_bounds = Rect::new(tx as f32, ty as f32, tw as f32, th as f32);
        
        let intersect_min_x = viewport_bounds.min.x.max(table_bounds.min.x);
        let intersect_min_y = viewport_bounds.min.y.max(table_bounds.min.y);
        let intersect_max_x = viewport_bounds.max.x.min(table_bounds.max.x);
        let intersect_max_y = viewport_bounds.max.y.min(table_bounds.max.y);
        let grid_draw_bounds = if intersect_max_x > intersect_min_x && intersect_max_y > intersect_min_y {
            Some(Rect::new(
                intersect_min_x,
                intersect_min_y,
                intersect_max_x - intersect_min_x,
                intersect_max_y - intersect_min_y,
            ))
        } else {
            None
        };

        let mut sorted_layers: Vec<_> = self.layer_manager.get_layers().iter().collect();
        sorted_layers.sort_by_key(|(_, layer)| layer.settings.z_order);

        let active_table_id = self.table_manager.active_table_id()
            .expect("CRITICAL: No active table ID during rendering! Table-centric architecture requires a table to exist.")
            .to_owned();

        let active_layer = self.active_layer.clone();

        // STEP 1: Render MAP layer first (background, below grid)
        for (layer_name, layer) in &sorted_layers {
            if *layer_name == "map" && layer.settings.visible {
                self.renderer.set_blend_mode(&layer.settings.blend_mode);
                self.renderer.set_layer_color(&layer.settings.color);
                let effective_opacity = Self::get_effective_layer_opacity(&layer.settings, layer_name, &active_layer);
                for sprite in &layer.sprites {
                    if sprite.table_id == active_table_id {
                        SpriteRenderer::draw_sprite(sprite, effective_opacity, &self.renderer, &self.texture_manager, &self.text_renderer, &self.input, self.camera.zoom)?;
                    }
                }
            }
        }

        // STEP 2: Draw grid on top of map layer
        if let Some(bounds) = grid_draw_bounds {
            self.grid_system.draw_grid(&self.renderer, bounds)?;
        }

        // STEP 3: Render remaining layers (excluding map, light, fog_of_war)
        for (layer_name, layer) in &sorted_layers {
            if layer.settings.visible
                && *layer_name != "map"
                && *layer_name != "light"
                && *layer_name != "fog_of_war"
            {
                self.renderer.set_blend_mode(&layer.settings.blend_mode);
                self.renderer.set_layer_color(&layer.settings.color);
                let effective_opacity = Self::get_effective_layer_opacity(&layer.settings, layer_name, &active_layer);
                
                for sprite in &layer.sprites {
                    if sprite.table_id == active_table_id {
                        SpriteRenderer::draw_sprite(sprite, effective_opacity, &self.renderer, &self.texture_manager, &self.text_renderer, &self.input, self.camera.zoom)?;
                    }
                }
            }
        }

        if self.obstacles_dirty {
            self.update_lighting_obstacles();
            self.obstacles_dirty = false;
        }
        
        self.lighting.render_lights_filtered(&self.view_matrix.to_array(), self.canvas_size.x, self.canvas_size.y, Some(&active_table_id))?;
        
        self.paint.render_strokes(&self.renderer)?;

        self.fog.render_fog_filtered(&self.view_matrix.to_array(), self.canvas_size.x, self.canvas_size.y, Some(&active_table_id))?;
        
        if let Some((min, max)) = self.input.get_area_selection_rect() {
            SpriteRenderer::draw_area_selection_rect(min, max, &self.renderer)?;
        }
        
        if let Some((start, end)) = self.input.get_measurement_line() {
            let conv = self.table_manager.get_unit_converter(&active_table_id);
            SpriteRenderer::draw_measurement_line(start, end, &self.renderer, &self.text_renderer, &self.texture_manager, &conv)?;
        }
        
        if let Some((start, end)) = self.input.get_shape_creation_rect() {
            match self.input.input_mode {
                crate::input::InputMode::CreateRectangle => {
                    SpriteRenderer::draw_rectangle_preview(start, end, &self.renderer)?;
                }
                crate::input::InputMode::CreateCircle => {
                    SpriteRenderer::draw_circle_preview(start, end, &self.renderer)?;
                }
                crate::input::InputMode::CreateLine => {
                    SpriteRenderer::draw_line_preview(start, end, &self.renderer)?;
                }
                _ => {}
            }
        }

        if let Some((start, end)) = self.input.get_wall_preview_line() {
            SpriteRenderer::draw_line_preview(start, end, &self.renderer)?;
        }

        if self.input.input_mode == crate::input::InputMode::CreatePolygon && !self.input.polygon_vertices.is_empty() {
            SpriteRenderer::draw_polygon_preview(&self.input.polygon_vertices, self.input.polygon_cursor, &self.renderer)?;
        }
        
        Ok(())
    }
}
