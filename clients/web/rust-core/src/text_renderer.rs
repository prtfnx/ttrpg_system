use crate::webgl_renderer::WebGLRenderer;
use crate::texture_manager::TextureManager;
use wasm_bindgen::prelude::*;

/// Production bitmap font renderer using pre-generated font atlas texture
/// 
/// Font Atlas: 512x512 RGBA PNG with 96 ASCII characters (32-127)
/// Layout: 16x16 grid, each cell is 32x32 pixels
/// Rendering: UV-mapped textured quads for each character
pub struct TextRenderer {
    font_atlas_id: String,
    atlas_width: f32,
    atlas_height: f32,
    char_size: f32,
    char_advance: f32,  // Default advance for most characters
    chars_per_row: usize,
    start_char: u32,
}

impl TextRenderer {
    pub fn new() -> Self {
        Self {
            font_atlas_id: "font_atlas".to_string(),
            atlas_width: 512.0,
            atlas_height: 512.0,
            char_size: 32.0,
            char_advance: 18.0,  // Default spacing (about 56% of cell size)
            chars_per_row: 16,
            start_char: 32, // ASCII space character
        }
    }
    
    /// Get character advance width (some characters are narrower)
    fn get_char_advance(&self, ch: char) -> f32 {
        match ch {
            '.' | ',' | ':' | ';' | '!' | '\'' | '`' => 8.0,  // Punctuation: narrower
            'i' | 'l' | 'I' | '|' => 10.0,                     // Thin letters
            ' ' => 12.0,                                        // Space
            _ => self.char_advance,                             // Default: 18.0
        }
    }
    
    /// Initialize the font atlas texture
    /// The atlas should be loaded by texture_manager before calling draw_text
    pub fn init_font_atlas(&mut self, _texture_manager: &mut TextureManager) -> Result<(), JsValue> {
        web_sys::console::log_1(&"[TEXT RENDERER] Font atlas initialized - ready to render".into());
        Ok(())
    }
    
    /// Draw text at world position using bitmap font atlas
    /// 
    /// # Arguments
    /// * `text` - The text to render (ASCII 32-127)
    /// * `x` - X position in world coordinates (left edge of text)
    /// * `y` - Y position in world coordinates (top edge of text)
    /// * `size` - Font size multiplier (1.0 = 32px, 0.5 = 16px, etc.)
    /// * `color` - RGBA color [r, g, b, a] (0.0-1.0)
    /// * `renderer` - WebGL renderer
    /// * `texture_manager` - Texture manager
    pub fn draw_text(
        &self,
        text: &str,
        x: f32,
        y: f32,
        size: f32,
        color: [f32; 4],
        renderer: &WebGLRenderer,
        texture_manager: &TextureManager,
    ) -> Result<(), JsValue> {
        if text.is_empty() {
            return Ok(());
        }
        
        // Check if font atlas is loaded
        if !texture_manager.has_texture(&self.font_atlas_id) {
            return Ok(());
        }
        
        // Calculate actual text width using advance spacing
        let text_width = text.len() as f32 * self.char_advance * size;
        let padding = 4.0 * size;
        
        // Center the text in the background box
        let box_width = text_width + padding * 2.0;
        let box_x = x - box_width / 2.0;  // Center horizontally
        let text_x = box_x + padding;      // Start text after left padding
        
        self.draw_text_background(
            box_x,
            y - padding,
            box_width,
            self.char_size * size + padding * 2.0,
            renderer,
        )?;
        
        // Bind font atlas texture
        texture_manager.bind_texture(&self.font_atlas_id);
        
        // Render each character with proper UV mapping
        let mut cursor_x = text_x;
        
        for ch in text.chars() {
            self.draw_char(ch, cursor_x, y, size, color, renderer, texture_manager)?;
            let advance = self.get_char_advance(ch) * size;  // Variable width
            cursor_x += advance;
        }
        
        Ok(())
    }
    
    /// Draw a single character using UV coordinates from font atlas
    fn draw_char(
        &self,
        ch: char,
        x: f32,
        y: f32,
        size: f32,
        color: [f32; 4],
        renderer: &WebGLRenderer,
        texture_manager: &TextureManager,
    ) -> Result<(), JsValue> {
        // Get character code
        let char_code = ch as u32;
        
        // Only render printable ASCII (32-127)
        if char_code < self.start_char || char_code >= 127 {
            return Ok(()); // Skip non-printable characters
        }
        
        // Calculate atlas index (offset from start character)
        let atlas_index = (char_code - self.start_char) as usize;
        
        // Calculate grid position in atlas
        let grid_x = (atlas_index % self.chars_per_row) as f32;
        let grid_y = (atlas_index / self.chars_per_row) as f32;
        
        // Calculate UV coordinates (normalized 0.0-1.0)
        let uv_cell_width = 1.0 / self.chars_per_row as f32;
        let uv_cell_height = 1.0 / self.chars_per_row as f32; // Square atlas
        
        let uv_x = grid_x * uv_cell_width;
        let uv_y = grid_y * uv_cell_height;
        
        // UV coordinates for the character quad
        let tex_coords = [
            uv_x, uv_y,                                    // Top-left
            uv_x + uv_cell_width, uv_y,                   // Top-right
            uv_x, uv_y + uv_cell_height,                  // Bottom-left
            uv_x + uv_cell_width, uv_y + uv_cell_height,  // Bottom-right
        ];
        
        // World space vertices for the character quad
        let char_w = self.char_size * size;
        let char_h = self.char_size * size;
        
        let vertices = vec![
            x, y,                // Top-left
            x + char_w, y,       // Top-right
            x, y + char_h,       // Bottom-left
            x + char_w, y + char_h, // Bottom-right
        ];
        
        // Bind font atlas texture
        texture_manager.bind_texture(&self.font_atlas_id);
        
        // Render character with texture
        renderer.draw_quad(&vertices, &tex_coords, color, true)?; // use_texture = true!
        
        Ok(())
    }
    
    /// Draw a background box behind text for readability
    fn draw_text_background(
        &self,
        x: f32,
        y: f32,
        width: f32,
        height: f32,
        renderer: &WebGLRenderer,
    ) -> Result<(), JsValue> {
        let vertices = vec![
            x, y,                    // Top-left
            x + width, y,            // Top-right
            x, y + height,           // Bottom-left
            x + width, y + height,   // Bottom-right
        ];
        let tex_coords = [0.0, 0.0, 1.0, 0.0, 0.0, 1.0, 1.0, 1.0];
        
        // Semi-transparent black background
        let bg_color = [0.0, 0.0, 0.0, 0.85];
        renderer.draw_quad(&vertices, &tex_coords, bg_color, false)?;
        
        // Cyan border for consistency with measurement line
        let border = vec![
            x, y, x + width, y,
            x + width, y, x + width, y + height,
            x + width, y + height, x, y + height,
            x, y + height, x, y,
        ];
        renderer.draw_lines(&border, [0.0, 0.9, 0.9, 1.0])?;
        
        Ok(())
    }
    
    /// Calculate the width of rendered text in world units
    pub fn measure_text(&self, text: &str, size: f32) -> f32 {
        text.chars()
            .map(|ch| self.get_char_advance(ch))
            .sum::<f32>() * size
    }
}

/// Helper function to format distance for display
pub fn format_distance(distance: f32) -> String {
    let grid_size = 50.0;
    let grid_units = distance / grid_size;
    let feet = grid_units * 5.0; // D&D: 5ft per square
    
    if feet < 10.0 {
        format!("{:.1}ft", feet)
    } else {
        format!("{:.0}ft", feet)
    }
}
