use crate::math::Vec2;
use crate::types::Layer;
use crate::input::{InputHandler, InputMode};
use crate::sprite_manager::SpriteManager;
use crate::lighting::LightingSystem;
use crate::wall_manager::WallManager;
use std::collections::HashMap;

use super::{EventSystem, MouseEventResult};

impl EventSystem {
    pub fn handle_mouse_move(
        &mut self,
        world_pos: Vec2,
        input: &mut InputHandler,
        layers: &mut HashMap<String, Layer>,
        lighting: &mut LightingSystem,
        wall_manager: &mut WallManager,
    ) -> MouseEventResult {
        // Update fog drawing preview
        if matches!(input.input_mode, InputMode::FogDraw | InputMode::FogErase) {
            input.update_fog_draw(world_pos);
            return MouseEventResult::Handled;
        }
        
        match input.input_mode {
            InputMode::SpriteMove => {
                if let Some(sprite_id) = &input.selected_sprite_id {
                    if let Some((sprite, _layer_name)) = Self::find_sprite_mut(sprite_id, layers) {
                        let old_pos = Vec2::new(sprite.world_x as f32, sprite.world_y as f32);
                        let new_pos = world_pos - input.drag_offset;
                        let delta = new_pos - old_pos;
                        if sprite.obstacle_type.as_deref() == Some("polygon") {
                            if let Some(verts) = &mut sprite.polygon_vertices {
                                for v in verts.iter_mut() {
                                    v[0] += delta.x;
                                    v[1] += delta.y;
                                }
                            }
                        }
                        sprite.world_x = new_pos.x as f64;
                        sprite.world_y = new_pos.y as f64;
                        Self::dispatch_drag_preview(sprite_id, sprite.world_x, sprite.world_y);
                    }
                }
                MouseEventResult::Handled
            }
            InputMode::SpriteResize(handle) => {
                if let Some(sprite_id) = &input.selected_sprite_id {
                    if let Some((sprite, _)) = Self::find_sprite_mut(sprite_id, layers) {
                        SpriteManager::resize_sprite_with_handle(sprite, handle, world_pos);
                        Self::dispatch_resize_preview(sprite_id, sprite.width * sprite.scale_x, sprite.height * sprite.scale_y);
                    }
                }
                MouseEventResult::Handled
            }
            InputMode::SpriteRotate => {
                if let Some(sprite_id) = &input.selected_sprite_id {
                    if let Some((sprite, _)) = Self::find_sprite_mut(sprite_id, layers) {
                        SpriteManager::update_rotation(sprite, world_pos, input.rotation_start_angle, input.sprite_initial_rotation);
                        Self::dispatch_rotate_preview(sprite_id, sprite.rotation.to_degrees());
                    }
                }
                MouseEventResult::Handled
            }
            InputMode::CameraPan => {
                // Camera panning is handled directly in RenderEngine::handle_mouse_move
                // with actual screen coordinates. This branch is unreachable.
                MouseEventResult::Handled
            }
            InputMode::LightDrag => {
                if let Some(new_pos) = input.update_light_drag(world_pos) {
                    if let Some(ref light_id) = input.selected_light_id {
                        lighting.update_light_position(light_id, new_pos);
                    }
                }
                MouseEventResult::Handled
            }
            InputMode::WallDrag => {
                if let Some(ref wall_id) = input.dragged_wall_id {
                    let delta = world_pos - input.wall_drag_last;
                    wall_manager.translate_wall(wall_id, delta.x, delta.y);
                }
                input.wall_drag_last = world_pos;
                MouseEventResult::Handled
            }
            InputMode::FogDraw | InputMode::FogErase => {
                input.update_fog_draw(world_pos);
                MouseEventResult::Handled
            }
            InputMode::Measurement => {
                input.update_measurement(world_pos);
                MouseEventResult::Handled
            }
            InputMode::CreateRectangle | InputMode::CreateCircle | 
            InputMode::CreateLine | InputMode::CreateText => {
                input.update_shape_creation(world_pos);
                MouseEventResult::Handled
            }
            InputMode::DrawWall => {
                input.update_wall_draw(world_pos);
                MouseEventResult::Handled
            }
            InputMode::CreatePolygon => {
                input.update_polygon_cursor(world_pos);
                MouseEventResult::Handled
            }
            _ => MouseEventResult::None
        }
    }
}
