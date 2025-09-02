use crate::types::Sprite;
use crate::math::Vec2;
use crate::webgl_renderer::WebGLRenderer;
use crate::texture_manager::TextureManager;
use crate::sprite_manager::SpriteManager;
use crate::input::InputHandler;
use wasm_bindgen::prelude::*;

pub struct SpriteRenderer;

impl SpriteRenderer {
    pub fn draw_sprite(
        sprite: &Sprite,
        layer_opacity: f32,
        renderer: &WebGLRenderer,
        texture_manager: &TextureManager,
        input: &InputHandler,
    ) -> Result<(), JsValue> {
        let is_selected = input.is_sprite_selected(&sprite.id);
        let is_primary_selected = input.selected_sprite_id.as_ref() == Some(&sprite.id);
        let world_pos = Vec2::new(sprite.world_x as f32, sprite.world_y as f32);
        let size = Vec2::new(
            (sprite.width * sprite.scale_x) as f32,
            (sprite.height * sprite.scale_y) as f32
        );
        
        // Calculate sprite vertices with rotation
        let vertices = Self::calculate_sprite_vertices(sprite, world_pos, size);
        let tex_coords = [0.0, 0.0, 1.0, 0.0, 0.0, 1.0, 1.0, 1.0];
        
        let mut color = sprite.tint_color;
        
        // Apply layer color modulation
        color = renderer.modulate_color(color);
        
        let has_texture = !sprite.texture_id.is_empty() && texture_manager.has_texture(&sprite.texture_id);
        if has_texture {
            texture_manager.bind_texture(&sprite.texture_id);
            // Apply layer opacity to textured sprites
            color[3] = if layer_opacity <= 0.01 { 
                0.0  // Make completely invisible when layer opacity is very low
            } else {
                color[3] * layer_opacity  // For textured sprites, use linear opacity
            };
            // Render textured sprite normally
            renderer.draw_quad(&vertices, &tex_coords, color, has_texture)?;
        } else {
            // For sprites without texture, unbind any texture and apply dramatic opacity effect
            texture_manager.unbind_texture();
            
            let border_opacity = if layer_opacity <= 0.01 { 
                0.0  // Make completely invisible when layer opacity is very low
            } else {
                layer_opacity.powf(0.5)  // Use power curve for more dramatic effect on non-textured sprites
            };
            
            // Create border vertices in proper order for a continuous rectangle
            // vertices = [top-left-x, top-left-y, top-right-x, top-right-y, bottom-left-x, bottom-left-y, bottom-right-x, bottom-right-y]
            let border_vertices = vec![
                vertices[0], vertices[1],   // Top-left to Top-right
                vertices[2], vertices[3],
                vertices[2], vertices[3],   // Top-right to Bottom-right  
                vertices[6], vertices[7],
                vertices[6], vertices[7],   // Bottom-right to Bottom-left
                vertices[4], vertices[5],
                vertices[4], vertices[5],   // Bottom-left to Top-left
                vertices[0], vertices[1],
            ];
            // Use sprite color with dramatic layer opacity effect, but ensure it's visible
            let border_color = [color[0], color[1], color[2], (color[3] * border_opacity).max(0.2)];
            renderer.draw_lines(&border_vertices, border_color)?;
        }
        
        if is_selected {
            Self::draw_selection_border(sprite, world_pos, size, is_primary_selected, renderer)?;
            // Only draw handles for the primary selected sprite
            if is_primary_selected {
                Self::draw_handles(sprite, world_pos, size, renderer)?;
            }
        }
        
        Ok(())
    }
    
    pub fn calculate_sprite_vertices(sprite: &Sprite, world_pos: Vec2, size: Vec2) -> Vec<f32> {
        if sprite.rotation != 0.0 {
            // Apply rotation around the sprite center
            let center_x = world_pos.x + size.x * 0.5;
            let center_y = world_pos.y + size.y * 0.5;
            let cos_rot = (sprite.rotation as f32).cos();
            let sin_rot = (sprite.rotation as f32).sin();
            let half_width = size.x * 0.5;
            let half_height = size.y * 0.5;
            
            // Calculate rotated corner positions
            let corners = [
                (-half_width, -half_height), // Top-left
                (half_width, -half_height),  // Top-right
                (-half_width, half_height),  // Bottom-left
                (half_width, half_height),   // Bottom-right
            ];
            
            let mut rotated_vertices = Vec::new();
            for (local_x, local_y) in corners {
                let rotated_x = local_x * cos_rot - local_y * sin_rot;
                let rotated_y = local_x * sin_rot + local_y * cos_rot;
                rotated_vertices.push(center_x + rotated_x);
                rotated_vertices.push(center_y + rotated_y);
            }
            rotated_vertices
        } else {
            // No rotation - use simple rectangle
            vec![
                world_pos.x, world_pos.y,                    // Top-left
                world_pos.x + size.x, world_pos.y,          // Top-right
                world_pos.x, world_pos.y + size.y,          // Bottom-left
                world_pos.x + size.x, world_pos.y + size.y, // Bottom-right
            ]
        }
    }
    
    fn draw_selection_border(sprite: &Sprite, world_pos: Vec2, size: Vec2, is_primary: bool, renderer: &WebGLRenderer) -> Result<(), JsValue> {
        // Always use the same vertex calculation as the sprite itself for consistency
        let vertices = Self::calculate_sprite_vertices(sprite, world_pos, size);
        
        // Create border from the calculated vertices in proper order
        // vertices = [top-left-x, top-left-y, top-right-x, top-right-y, bottom-left-x, bottom-left-y, bottom-right-x, bottom-right-y]
        let border_vertices = vec![
            vertices[0], vertices[1],   // Top-left to Top-right
            vertices[2], vertices[3],
            vertices[2], vertices[3],   // Top-right to Bottom-right  
            vertices[6], vertices[7],
            vertices[6], vertices[7],   // Bottom-right to Bottom-left
            vertices[4], vertices[5],
            vertices[4], vertices[5],   // Bottom-left to Top-left
            vertices[0], vertices[1],
        ];
        
        // Different colors for primary vs secondary selection
        let color = if is_primary {
            [0.2, 0.8, 0.2, 1.0]  // Bright green for primary selection
        } else {
            [0.8, 0.8, 0.2, 1.0]  // Yellow for secondary selections
        };
        
        renderer.draw_lines(&border_vertices, color)
    }
    
    fn draw_handles(sprite: &Sprite, world_pos: Vec2, size: Vec2, renderer: &WebGLRenderer) -> Result<(), JsValue> {
        // We need to get camera zoom somehow - for now let's assume it's passed or use a default
        let camera_zoom = 1.0; // TODO: Pass camera zoom as parameter
        
        // Draw rotation handle (circle above sprite)
        let rotate_handle_pos = SpriteManager::get_rotation_handle_position(sprite, camera_zoom);
        let handle_size = 8.0 / camera_zoom as f32;
        Self::draw_rotate_handle(rotate_handle_pos.x, rotate_handle_pos.y, handle_size, renderer)?;
        
        // Draw resize handles for non-rotated sprites only
        if sprite.rotation == 0.0 {
            let handle_size = 6.0 / camera_zoom as f32;
            
            // Corner handles
            Self::draw_resize_handle(world_pos.x, world_pos.y, handle_size, renderer)?; // TopLeft
            Self::draw_resize_handle(world_pos.x + size.x, world_pos.y, handle_size, renderer)?; // TopRight
            Self::draw_resize_handle(world_pos.x, world_pos.y + size.y, handle_size, renderer)?; // BottomLeft
            Self::draw_resize_handle(world_pos.x + size.x, world_pos.y + size.y, handle_size, renderer)?; // BottomRight
            
            // Side handles
            Self::draw_resize_handle(world_pos.x + size.x * 0.5, world_pos.y, handle_size, renderer)?; // TopCenter
            Self::draw_resize_handle(world_pos.x + size.x * 0.5, world_pos.y + size.y, handle_size, renderer)?; // BottomCenter
            Self::draw_resize_handle(world_pos.x, world_pos.y + size.y * 0.5, handle_size, renderer)?; // LeftCenter
            Self::draw_resize_handle(world_pos.x + size.x, world_pos.y + size.y * 0.5, handle_size, renderer)?; // RightCenter
        }
        
        Ok(())
    }
    
    fn draw_resize_handle(x: f32, y: f32, size: f32, renderer: &WebGLRenderer) -> Result<(), JsValue> {
        let half = size * 0.5;
        let vertices = [
            x - half, y - half,
            x + half, y - half,
            x - half, y + half,
            x + half, y + half,
        ];
        let tex_coords = [0.0, 0.0, 1.0, 0.0, 0.0, 1.0, 1.0, 1.0];
        renderer.draw_quad(&vertices, &tex_coords, [1.0, 1.0, 1.0, 1.0], false)?;
        
        // Black border
        let border = [
            x - half, y - half,
            x + half, y - half,
            x + half, y + half,
            x - half, y + half,
            x - half, y - half,
        ];
        renderer.draw_lines(&border, [0.0, 0.0, 0.0, 1.0])
    }
    
    fn draw_rotate_handle(x: f32, y: f32, size: f32, renderer: &WebGLRenderer) -> Result<(), JsValue> {
        // Draw a simple circle approximation using lines
        let radius = size * 0.7;
        let mut vertices = Vec::new();
        let segments = 16;
        for i in 0..segments {
            let angle1 = (i as f32) * 2.0 * std::f32::consts::PI / (segments as f32);
            let angle2 = ((i + 1) as f32) * 2.0 * std::f32::consts::PI / (segments as f32);
            vertices.extend_from_slice(&[
                x + radius * angle1.cos(), y + radius * angle1.sin(),
                x + radius * angle2.cos(), y + radius * angle2.sin(),
            ]);
        }
        renderer.draw_lines(&vertices, [0.8, 0.8, 0.8, 1.0])
    }
    
    pub fn draw_area_selection_rect(min: Vec2, max: Vec2, renderer: &WebGLRenderer) -> Result<(), JsValue> {
        // Draw selection rectangle outline
        let border_vertices = vec![
            min.x, min.y,     // Top-left to Top-right
            max.x, min.y,
            max.x, min.y,     // Top-right to Bottom-right
            max.x, max.y,
            max.x, max.y,     // Bottom-right to Bottom-left
            min.x, max.y,
            min.x, max.y,     // Bottom-left to Top-left
            min.x, min.y,
        ];
        renderer.draw_lines(&border_vertices, [0.3, 0.7, 1.0, 0.8])?;
        
        // Draw semi-transparent fill
        let fill_vertices = vec![
            min.x, min.y,     // Top-left
            max.x, min.y,     // Top-right
            min.x, max.y,     // Bottom-left
            max.x, max.y,     // Bottom-right
        ];
        let tex_coords = [0.0, 0.0, 1.0, 0.0, 0.0, 1.0, 1.0, 1.0];
        renderer.draw_quad(&fill_vertices, &tex_coords, [0.3, 0.7, 1.0, 0.2], false)?;
        
        Ok(())
    }
    
    pub fn draw_measurement_line(start: Vec2, end: Vec2, renderer: &WebGLRenderer) -> Result<(), JsValue> {
        // Draw measurement line
        let line_vertices = vec![
            start.x, start.y,
            end.x, end.y,
        ];
        renderer.draw_lines(&line_vertices, [1.0, 1.0, 0.0, 1.0])?; // Yellow line
        
        // Draw start and end points
        let point_size = 5.0;
        
        // Start point
        let start_vertices = vec![
            start.x - point_size, start.y - point_size,
            start.x + point_size, start.y - point_size,
            start.x - point_size, start.y + point_size,
            start.x + point_size, start.y + point_size,
        ];
        let tex_coords = [0.0, 0.0, 1.0, 0.0, 0.0, 1.0, 1.0, 1.0];
        renderer.draw_quad(&start_vertices, &tex_coords, [0.0, 1.0, 0.0, 1.0], false)?; // Green start
        
        // End point
        let end_vertices = vec![
            end.x - point_size, end.y - point_size,
            end.x + point_size, end.y - point_size,
            end.x - point_size, end.y + point_size,
            end.x + point_size, end.y + point_size,
        ];
        renderer.draw_quad(&end_vertices, &tex_coords, [1.0, 0.0, 0.0, 1.0], false)?; // Red end
        
        // TODO: Add distance text rendering
        Ok(())
    }
    
    pub fn draw_rectangle_preview(start: Vec2, end: Vec2, renderer: &WebGLRenderer) -> Result<(), JsValue> {
        let min_x = start.x.min(end.x);
        let min_y = start.y.min(end.y);
        let max_x = start.x.max(end.x);
        let max_y = start.y.max(end.y);
        
        // Draw preview rectangle outline
        let border_vertices = vec![
            min_x, min_y,     // Top-left to Top-right
            max_x, min_y,
            max_x, min_y,     // Top-right to Bottom-right
            max_x, max_y,
            max_x, max_y,     // Bottom-right to Bottom-left
            min_x, max_y,
            min_x, max_y,     // Bottom-left to Top-left
            min_x, min_y,
        ];
        renderer.draw_lines(&border_vertices, [0.0, 1.0, 0.0, 0.8])?; // Green preview
        
        Ok(())
    }
    
    pub fn draw_circle_preview(start: Vec2, end: Vec2, renderer: &WebGLRenderer) -> Result<(), JsValue> {
        let radius = ((end.x - start.x).powi(2) + (end.y - start.y).powi(2)).sqrt();
        let segments = 32;
        let mut vertices = Vec::new();
        
        for i in 0..segments {
            let angle1 = (i as f32) * 2.0 * std::f32::consts::PI / (segments as f32);
            let angle2 = ((i + 1) % segments) as f32 * 2.0 * std::f32::consts::PI / (segments as f32);
            
            vertices.push(start.x + radius * angle1.cos());
            vertices.push(start.y + radius * angle1.sin());
            vertices.push(start.x + radius * angle2.cos());
            vertices.push(start.y + radius * angle2.sin());
        }
        
        renderer.draw_lines(&vertices, [0.0, 1.0, 0.0, 0.8])?; // Green preview
        Ok(())
    }
    
    pub fn draw_line_preview(start: Vec2, end: Vec2, renderer: &WebGLRenderer) -> Result<(), JsValue> {
        let line_vertices = vec![
            start.x, start.y,
            end.x, end.y,
        ];
        renderer.draw_lines(&line_vertices, [0.0, 1.0, 0.0, 0.8])?; // Green preview
        Ok(())
    }
}
