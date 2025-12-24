use crate::types::Sprite;
use crate::math::Vec2;
use crate::webgl_renderer::WebGLRenderer;
use crate::texture_manager::TextureManager;
use crate::text_renderer::{TextRenderer, format_distance};
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
        text_renderer: &TextRenderer,
        input: &InputHandler,
        camera_zoom: f64,
    ) -> Result<(), JsValue> {
        // Check if this is a text sprite - render with bitmap font atlas
        if sprite.is_text_sprite.unwrap_or(false) {
            return Self::draw_text_sprite(sprite, layer_opacity, renderer, texture_manager, text_renderer, input, camera_zoom);
        }
        
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
                Self::draw_handles(sprite, world_pos, size, renderer, camera_zoom)?;
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
    
    fn draw_handles(sprite: &Sprite, world_pos: Vec2, size: Vec2, renderer: &WebGLRenderer, camera_zoom: f64) -> Result<(), JsValue> {
        // Draw rotation handle (circle above sprite)
        let rotate_handle_pos = SpriteManager::get_rotation_handle_position(sprite, camera_zoom);
        let handle_size = 16.0 / camera_zoom as f32; // Match the increased size in event_system.rs
        Self::draw_rotate_handle(rotate_handle_pos.x, rotate_handle_pos.y, handle_size, renderer)?;
        
        // Draw resize handles for all sprites (including rotated ones)
        let resize_handle_visual_size = 4.0 / camera_zoom as f32; // Smaller visual size
        
        // Corner handles
        Self::draw_resize_handle(world_pos.x, world_pos.y, resize_handle_visual_size, renderer)?; // TopLeft
        Self::draw_resize_handle(world_pos.x + size.x, world_pos.y, resize_handle_visual_size, renderer)?; // TopRight
        Self::draw_resize_handle(world_pos.x, world_pos.y + size.y, resize_handle_visual_size, renderer)?; // BottomLeft
        Self::draw_resize_handle(world_pos.x + size.x, world_pos.y + size.y, resize_handle_visual_size, renderer)?; // BottomRight
        
        // Side handles
        Self::draw_resize_handle(world_pos.x + size.x * 0.5, world_pos.y, resize_handle_visual_size, renderer)?; // TopCenter
        Self::draw_resize_handle(world_pos.x + size.x * 0.5, world_pos.y + size.y, resize_handle_visual_size, renderer)?; // BottomCenter
        Self::draw_resize_handle(world_pos.x, world_pos.y + size.y * 0.5, resize_handle_visual_size, renderer)?; // LeftCenter
        Self::draw_resize_handle(world_pos.x + size.x, world_pos.y + size.y * 0.5, resize_handle_visual_size, renderer)?; // RightCenter
        
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
    
    /// Render text sprite using bitmap font atlas (WebGL)
    fn draw_text_sprite(
        sprite: &Sprite,
        layer_opacity: f32,
        renderer: &WebGLRenderer,
        texture_manager: &TextureManager,
        text_renderer: &TextRenderer,
        input: &InputHandler,
        camera_zoom: f64,
    ) -> Result<(), JsValue> {
        let is_selected = input.is_sprite_selected(&sprite.id);
        let is_primary_selected = input.selected_sprite_id.as_ref() == Some(&sprite.id);
        let world_pos = Vec2::new(sprite.world_x as f32, sprite.world_y as f32);
        let size = Vec2::new(
            (sprite.width * sprite.scale_x) as f32,
            (sprite.height * sprite.scale_y) as f32
        );
        
        // Get text properties with defaults
        let text = sprite.text_content.as_ref().map(|s| s.as_str()).unwrap_or("Text");
        let text_size = sprite.text_size.unwrap_or(1.0) as f32;
        let mut text_color = sprite.text_color.unwrap_or([1.0, 1.0, 1.0, 1.0]);
        
        // Apply layer opacity
        text_color[3] *= layer_opacity;
        
        // Render text at sprite center
        let text_x = world_pos.x + size.x * 0.5;
        let text_y = world_pos.y + size.y * 0.5;
        
        text_renderer.draw_text(
            text,
            text_x,
            text_y,
            text_size,
            text_color,
            true,
            renderer,
            texture_manager
        )?;
        
        // Draw selection indicators if selected
        if is_selected {
            Self::draw_selection_border(sprite, world_pos, size, is_primary_selected, renderer)?;
            if is_primary_selected {
                Self::draw_handles(sprite, world_pos, size, renderer, camera_zoom)?;
            }
        }
        
        Ok(())
    }
    
    pub fn draw_measurement_line(
        start: Vec2, 
        end: Vec2, 
        renderer: &WebGLRenderer,
        text_renderer: &TextRenderer,
        texture_manager: &TextureManager,
    ) -> Result<(), JsValue> {
        // Calculate direction and distance
        let dx = end.x - start.x;
        let dy = end.y - start.y;
        let distance = (dx * dx + dy * dy).sqrt();
        
        if distance < 1.0 {
            return Ok(()); // Too short to draw
        }
        
        // Normalize direction
        let dir_x = dx / distance;
        let dir_y = dy / distance;
        
        // Perpendicular direction for arrow heads
        let perp_x = -dir_y;
        let perp_y = dir_x;
        
        // Arrow styling - cyan with black outline (standard CAD/measurement color)
        let line_color = [0.0, 0.9, 0.9, 1.0]; // Cyan
        let outline_color = [0.0, 0.0, 0.0, 1.0]; // Black
        
        // Draw black outline (thicker line first)
        renderer.draw_lines(&vec![start.x, start.y, end.x, end.y], outline_color)?;
        
        // Draw main cyan line (thinner, on top)
        renderer.draw_lines(&vec![start.x, start.y, end.x, end.y], line_color)?;
        
        // Arrow head size
        let arrow_size = 12.0;
        let arrow_width = 6.0;
        
        // Draw START arrowhead (pointing from start towards end)
        let start_arrow_tip = start;
        let start_arrow_base_x = start.x + dir_x * arrow_size;
        let start_arrow_base_y = start.y + dir_y * arrow_size;
        
        let start_arrow_left_x = start_arrow_base_x + perp_x * arrow_width;
        let start_arrow_left_y = start_arrow_base_y + perp_y * arrow_width;
        let start_arrow_right_x = start_arrow_base_x - perp_x * arrow_width;
        let start_arrow_right_y = start_arrow_base_y - perp_y * arrow_width;
        
        // Start arrow triangle (filled)
        let start_arrow_vertices = vec![
            start_arrow_left_x, start_arrow_left_y,
            start_arrow_right_x, start_arrow_right_y,
            start_arrow_tip.x, start_arrow_tip.y,
        ];
        renderer.draw_triangles(&start_arrow_vertices, line_color)?;
        
        // Draw END arrowhead (pointing from end back towards start)
        let end_arrow_tip = end;
        let end_arrow_base_x = end.x - dir_x * arrow_size;
        let end_arrow_base_y = end.y - dir_y * arrow_size;
        
        let end_arrow_left_x = end_arrow_base_x + perp_x * arrow_width;
        let end_arrow_left_y = end_arrow_base_y + perp_y * arrow_width;
        let end_arrow_right_x = end_arrow_base_x - perp_x * arrow_width;
        let end_arrow_right_y = end_arrow_base_y - perp_y * arrow_width;
        
        // End arrow triangle (filled)
        let end_arrow_vertices = vec![
            end_arrow_left_x, end_arrow_left_y,
            end_arrow_right_x, end_arrow_right_y,
            end_arrow_tip.x, end_arrow_tip.y,
        ];
        renderer.draw_triangles(&end_arrow_vertices, line_color)?;
        
        // ===== TEXT RENDERING =====
        // Draw distance label at midpoint using WebGL text renderer
        let mid_point = Vec2::new((start.x + end.x) / 2.0, (start.y + end.y) / 2.0);
        
        // Format distance text
        let distance_text = format_distance(distance);
        
        // Offset label perpendicular to line so it doesn't overlap the arrow
        let label_offset = 35.0; // Increased from 20.0 to prevent text overlap
        let label_x = mid_point.x + perp_x * label_offset;
        let label_y = mid_point.y + perp_y * label_offset;
        
        // Measure text width to center it
        let text_width = text_renderer.measure_text(&distance_text, 1.0);
        let text_x = label_x - text_width / 2.0;
        
        // Draw text in world space (cyan to match arrow)
        text_renderer.draw_text(
            &distance_text,
            text_x,
            label_y,
            1.0,  // Size multiplier
            [0.0, 0.9, 0.9, 1.0],  // Cyan text
            false,  // no background - clean text only
            renderer,
            texture_manager,
        )?;
        
        web_sys::console::log_1(&format!("[SPRITE RENDERER] Drew measurement label '{}' at world coords ({:.1}, {:.1})", distance_text, label_x, label_y).into());
        
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
