use crate::types::*;
use crate::unit_converter::{DistanceUnit, UnitConverter};
use std::collections::HashSet;
use wasm_bindgen::prelude::*;

use super::{parse_hex_color, RenderEngine};

struct PreparedSprite {
    layer: String,
    sprite: Sprite,
    aura_light: Option<crate::lighting::Light>,
    texture_id: String,
}

#[wasm_bindgen]
impl RenderEngine {
    /// Handle table data received from server
    #[wasm_bindgen]
    pub fn handle_table_data(&mut self, table_data_js: &JsValue) -> Result<(), JsValue> {
        // Parse and validate the complete snapshot before touching any resident
        // renderer state. This keeps malformed payloads from clearing the
        // currently visible table part-way through hydration.
        let table: crate::table_sync::TableData =
            serde_wasm_bindgen::from_value(table_data_js.clone()).map_err(|e| {
                JsValue::from_str(&format!("Failed to parse table data for rendering: {}", e))
            })?;
        validate_table_snapshot(&table)?;
        let prepared_sprites = prepare_table_sprites(&table)?;
        self.table_sync.handle_table_data(table_data_js)?;

        if let Some(table_id) = self.table_sync.get_table_id() {
            web_sys::console::log_1(
                &format!(
                    "[RUST] handle_table_data: Setting active table to '{}'",
                    table_id
                )
                .into(),
            );

            let old_table_id = self.table_manager.get_active_table_id();
            let is_switching_tables = old_table_id
                .as_ref()
                .is_some_and(|old_id| old_id != &table_id);

            if is_switching_tables {
                if let Some(old_id) = old_table_id {
                    web_sys::console::log_1(
                        &format!(
                            "[TABLE-SWITCH] [SYNC] Switching from table '{}' to '{}'",
                            old_id, table_id
                        )
                        .into(),
                    );

                    let sprites_removed = self.layer_manager.clear_sprites_for_table(&old_id);
                    let lights_removed = self.lighting.clear_lights_for_table(&old_id);
                    let fog_removed = self.fog.clear_fog_for_table(&old_id);

                    web_sys::console::log_1(&format!(
                        "[TABLE-SWITCH] [DEL] Cleaned up old table '{}': {} sprites, {} lights, {} fog",
                        old_id, sprites_removed, lights_removed, fog_removed
                    ).into());
                }
            }

            self.table_manager.create_table(
                &table_id,
                &table.table_name,
                table.width,
                table.height,
            )?;
            self.table_manager.set_active_table(&table_id);
            self.table_manager.set_table_units(
                &table_id,
                table.grid_cell_px,
                table.cell_distance,
                &table.distance_unit,
            );
            self.grid_system.sync_from_table(table.grid_cell_px as f32);

            let active = self.table_manager.get_active_table_id();
            web_sys::console::log_1(
                &format!(
                    "[RUST] handle_table_data: Active table is now: {:?}",
                    active
                )
                .into(),
            );

            if let Some((tx, ty, tw, th)) = self.table_manager.get_active_table_world_bounds() {
                self.camera.set_table_bounds(tx, ty, tw, th);
                web_sys::console::log_1(
                    &format!(
                        "[TABLE-SWITCH] [TARGET] Updated camera bounds: {}x{}",
                        tw, th
                    )
                    .into(),
                );

                self.fog
                    .set_table_bounds(tx as f32, ty as f32, tw as f32, th as f32);
                web_sys::console::log_1(
                    &format!("[TABLE-SWITCH] [FOG] Updated fog bounds: {}x{}", tw, th).into(),
                );

                self.camera
                    .set_camera(table.x_moved, table.y_moved, table.scale);
                web_sys::console::log_1(
                    &format!(
                        "[TABLE-SWITCH] [CAM] Restored camera at ({}, {}) with zoom {}",
                        table.x_moved, table.y_moved, table.scale
                    )
                    .into(),
                );

                self.update_view_matrix();
                web_sys::console::log_1(&"[TABLE-SWITCH] [OK] View matrix updated".into());
            }
        }

        self.layer_manager.clear_all_layers();

        for prepared in prepared_sprites {
            // Layer existence was checked during preflight. Keeping this phase
            // infallible prevents a partially replaced scene after clearing.
            if let Some(layer) = self.layer_manager.get_layer_mut(&prepared.layer) {
                layer.sprites.push(prepared.sprite);
            }
            if let Some(light) = prepared.aura_light {
                self.lighting.add_light(light);
            }
            if !prepared.texture_id.is_empty() {
                self.request_asset_if_needed(&prepared.texture_id);
            }
        }

        web_sys::console::log_1(
            &format!(
                "Successfully synced table '{}' with {} layers",
                table.table_name,
                table.layers.len()
            )
            .into(),
        );

        Ok(())
    }
    fn request_asset_if_needed(&self, texture_path: &str) {
        if !self.texture_manager.has_texture(texture_path) {
            self.emit_asset_download_requested(texture_path);
        }
    }

    fn emit_asset_download_requested(&self, asset_id: &str) {
        let Some(handler) = &self.runtime_event_handler else {
            return;
        };

        let data = js_sys::Object::new();
        js_sys::Reflect::set(&data, &"asset_id".into(), &asset_id.into()).unwrap();

        let event = js_sys::Object::new();
        js_sys::Reflect::set(&event, &"type".into(), &"assetDownloadRequested".into()).unwrap();
        js_sys::Reflect::set(&event, &"data".into(), &data).unwrap();
        let _ = handler.call1(&JsValue::NULL, &event.into());
    }
}

fn prepare_table_sprites(
    table: &crate::table_sync::TableData,
) -> Result<Vec<PreparedSprite>, JsValue> {
    let converter = UnitConverter::new(
        table.grid_cell_px as f32,
        table.cell_distance as f32,
        DistanceUnit::from_str(&table.distance_unit),
    );
    let sprite_count = table.layers.values().map(Vec::len).sum();
    let mut prepared = Vec::with_capacity(sprite_count);

    for sprites in table.layers.values() {
        for sprite_data in sprites {
            let width = if sprite_data.width > 0.0 {
                sprite_data.width
            } else {
                50.0
            };
            let height = if sprite_data.height > 0.0 {
                sprite_data.height
            } else {
                50.0
            };
            let aura_radius = sprite_data
                .aura_radius_units
                .map(|units| converter.to_pixels(units as f32) as f64)
                .or(sprite_data.aura_radius);
            let polygon_vertices = parse_obstacle_vertices(sprite_data)?;
            let sprite = Sprite {
                id: sprite_data.sprite_id.clone(),
                world_x: sprite_data.coord_x,
                world_y: sprite_data.coord_y,
                width,
                height,
                scale_x: sprite_data.scale_x,
                scale_y: sprite_data.scale_y,
                rotation: sprite_data.rotation.unwrap_or(0.0),
                layer: sprite_data.layer.clone(),
                texture_id: sprite_data.texture_path.clone(),
                tint_color: [1.0, 1.0, 1.0, 1.0],
                table_id: table.table_id.clone(),
                character_id: sprite_data.character_id.clone(),
                controlled_by: sprite_data.controlled_by.clone().unwrap_or_default(),
                hp: sprite_data.hp,
                max_hp: sprite_data.max_hp,
                ac: sprite_data.ac,
                aura_radius,
                aura_color: sprite_data.aura_color.clone(),
                is_text_sprite: None,
                text_content: None,
                text_size: None,
                text_color: None,
                obstacle_type: sprite_data.obstacle_type.clone(),
                polygon_vertices,
                shape_filled: None,
            };

            let aura_light = aura_radius.map(|radius| {
                let center_x = (sprite_data.coord_x + width * 0.5) as f32;
                let center_y = (sprite_data.coord_y + height * 0.5) as f32;
                let light_id = format!("token_light_{}", sprite_data.sprite_id);
                let mut light = crate::lighting::Light::new(
                    light_id,
                    center_x,
                    center_y,
                    table.table_id.clone(),
                );
                light.set_radius(radius as f32);
                if let Some(color) = sprite_data.aura_color.as_deref().and_then(parse_hex_color) {
                    light.set_color(color);
                }
                light
            });

            prepared.push(PreparedSprite {
                layer: sprite_data.layer.clone(),
                sprite,
                aura_light,
                texture_id: sprite_data.texture_path.clone(),
            });
        }
    }

    Ok(prepared)
}

fn parse_obstacle_vertices(
    sprite: &crate::table_sync::SpriteData,
) -> Result<Option<Vec<[f32; 2]>>, JsValue> {
    if !matches!(sprite.obstacle_type.as_deref(), Some("polygon" | "line")) {
        return Ok(None);
    }
    let Some(data) = sprite.obstacle_data.as_ref() else {
        return Err(JsValue::from_str(&format!(
            "Sprite '{}' is missing obstacle geometry",
            sprite.sprite_id
        )));
    };

    let parse_vertices = |value: &serde_json::Value| {
        serde_json::from_value::<Vec<[f32; 2]>>(value.clone()).map_err(|error| {
            JsValue::from_str(&format!(
                "Sprite '{}' contains invalid obstacle vertices: {}",
                sprite.sprite_id, error
            ))
        })
    };

    match sprite.obstacle_type.as_deref() {
        Some("polygon") => {
            let vertices = data
                .get("vertices")
                .ok_or_else(|| {
                    JsValue::from_str(&format!(
                        "Sprite '{}' is missing polygon vertices",
                        sprite.sprite_id
                    ))
                })
                .and_then(parse_vertices)?;
            if vertices.len() < 3 {
                return Err(JsValue::from_str(&format!(
                    "Sprite '{}' polygon requires at least three vertices",
                    sprite.sprite_id
                )));
            }
            Ok(Some(vertices))
        }
        Some("line") => {
            if let Some(vertices) = data.get("vertices") {
                let vertices = parse_vertices(vertices)?;
                if vertices.len() != 2 {
                    return Err(JsValue::from_str(&format!(
                        "Sprite '{}' line requires exactly two vertices",
                        sprite.sprite_id
                    )));
                }
                return Ok(Some(vertices));
            }
            let endpoints = ["x1", "y1", "x2", "y2"]
                .map(|key| data.get(key).and_then(serde_json::Value::as_f64));
            match endpoints {
                [Some(x1), Some(y1), Some(x2), Some(y2)] => {
                    Ok(Some(vec![[x1 as f32, y1 as f32], [x2 as f32, y2 as f32]]))
                }
                _ => Err(JsValue::from_str(&format!(
                    "Sprite '{}' contains incomplete line endpoints",
                    sprite.sprite_id
                ))),
            }
        }
        _ => Ok(None),
    }
}

fn validate_table_snapshot(table: &crate::table_sync::TableData) -> Result<(), JsValue> {
    if table.table_id.trim().is_empty() || table.table_name.trim().is_empty() {
        return Err(JsValue::from_str("Table id and name must not be empty"));
    }
    if !table.width.is_finite()
        || table.width <= 0.0
        || !table.height.is_finite()
        || table.height <= 0.0
        || !table.scale.is_finite()
        || table.scale <= 0.0
        || !table.grid_cell_px.is_finite()
        || table.grid_cell_px <= 0.0
        || !table.cell_distance.is_finite()
        || table.cell_distance <= 0.0
    {
        return Err(JsValue::from_str(
            "Table dimensions, scale, and grid units must be positive finite numbers",
        ));
    }

    let mut sprite_ids = HashSet::new();
    for (layer_name, sprites) in &table.layers {
        if !crate::rendering::layer_manager::LAYER_NAMES.contains(&layer_name.as_str()) {
            return Err(JsValue::from_str(&format!(
                "Unknown renderer layer: {}",
                layer_name
            )));
        }
        for sprite in sprites {
            if sprite.sprite_id.trim().is_empty() || !sprite_ids.insert(sprite.sprite_id.as_str()) {
                return Err(JsValue::from_str("Sprite ids must be non-empty and unique"));
            }
            if sprite.layer != *layer_name {
                return Err(JsValue::from_str(&format!(
                    "Sprite '{}' layer does not match its container",
                    sprite.sprite_id
                )));
            }
            let numeric = [
                sprite.coord_x,
                sprite.coord_y,
                sprite.scale_x,
                sprite.scale_y,
                sprite.width,
                sprite.height,
                sprite.rotation.unwrap_or(0.0),
            ];
            if numeric.iter().any(|value| !value.is_finite()) {
                return Err(JsValue::from_str(&format!(
                    "Sprite '{}' contains non-finite geometry",
                    sprite.sprite_id
                )));
            }
            if [sprite.aura_radius, sprite.aura_radius_units]
                .into_iter()
                .flatten()
                .any(|radius| !radius.is_finite() || radius < 0.0)
            {
                return Err(JsValue::from_str(&format!(
                    "Sprite '{}' contains an invalid aura radius",
                    sprite.sprite_id
                )));
            }
        }
    }
    Ok(())
}
