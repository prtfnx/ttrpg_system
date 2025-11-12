use std::collections::HashMap;
use std::rc::Rc;
use std::cell::RefCell;
use web_sys::{WebGl2RenderingContext as WebGlRenderingContext, WebGlTexture, HtmlImageElement};
use wasm_bindgen::prelude::*;
use wasm_bindgen::JsCast;

pub struct TextureManager {
    textures: HashMap<String, WebGlTexture>,
    gl: WebGlRenderingContext,
}

impl TextureManager {
    pub fn new(gl: WebGlRenderingContext) -> Self {
        Self {
            textures: HashMap::new(),
            gl,
        }
    }
    
    pub fn load_texture(&mut self, name: &str, image: &HtmlImageElement) -> Result<(), JsValue> {
        let texture = self.gl.create_texture().ok_or("Failed to create texture")?;
        self.gl.bind_texture(WebGlRenderingContext::TEXTURE_2D, Some(&texture));
        self.gl.tex_image_2d_with_u32_and_u32_and_html_image_element(
            WebGlRenderingContext::TEXTURE_2D, 0, WebGlRenderingContext::RGBA as i32,
            WebGlRenderingContext::RGBA, WebGlRenderingContext::UNSIGNED_BYTE, image
        )?;
        self.gl.tex_parameteri(WebGlRenderingContext::TEXTURE_2D, WebGlRenderingContext::TEXTURE_MIN_FILTER, WebGlRenderingContext::NEAREST as i32);
        self.gl.tex_parameteri(WebGlRenderingContext::TEXTURE_2D, WebGlRenderingContext::TEXTURE_MAG_FILTER, WebGlRenderingContext::NEAREST as i32);
        self.gl.tex_parameteri(WebGlRenderingContext::TEXTURE_2D, WebGlRenderingContext::TEXTURE_WRAP_S, WebGlRenderingContext::CLAMP_TO_EDGE as i32);
        self.gl.tex_parameteri(WebGlRenderingContext::TEXTURE_2D, WebGlRenderingContext::TEXTURE_WRAP_T, WebGlRenderingContext::CLAMP_TO_EDGE as i32);
        self.textures.insert(name.to_string(), texture);
        Ok(())
    }
    
    pub fn has_texture(&self, name: &str) -> bool {
        self.textures.contains_key(name)
    }
    
    pub fn bind_texture(&self, name: &str) {
        if let Some(texture) = self.textures.get(name) {
            self.gl.active_texture(WebGlRenderingContext::TEXTURE0);
            self.gl.bind_texture(WebGlRenderingContext::TEXTURE_2D, Some(texture));
        }
    }
    
    pub fn unbind_texture(&self) {
        self.gl.bind_texture(WebGlRenderingContext::TEXTURE_2D, None);
    }
    

    
    // Create a circle texture with custom color and fill mode
    pub fn create_circle_texture_with_color(&mut self, name: &str, size: u32, color: [u8; 4], filled: bool) -> Result<(), JsValue> {
        let texture = self.gl.create_texture().ok_or("Failed to create texture")?;
        self.gl.bind_texture(WebGlRenderingContext::TEXTURE_2D, Some(&texture));
        
        // Generate circle pixels
        let mut pixels = vec![0u8; (size * size * 4) as usize]; // RGBA
        let center = (size / 2) as f32;
        let radius = center - 1.0;
        let border_width = 2.0; // Thickness of the outline
        
        for y in 0..size {
            for x in 0..size {
                let dx = x as f32 - center;
                let dy = y as f32 - center;
                let distance = (dx * dx + dy * dy).sqrt();
                
                let pixel_index = ((y * size + x) * 4) as usize;
                
                let should_draw = if filled {
                    // Filled circle - draw if inside radius
                    distance <= radius
                } else {
                    // Outline circle - draw if on the border
                    distance <= radius && distance >= (radius - border_width)
                };
                
                if should_draw {
                    // Apply the specified color
                    pixels[pixel_index] = color[0];     // R
                    pixels[pixel_index + 1] = color[1]; // G
                    pixels[pixel_index + 2] = color[2]; // B
                    pixels[pixel_index + 3] = color[3]; // A
                } else {
                    // Outside circle - transparent
                    pixels[pixel_index] = 0;       // R
                    pixels[pixel_index + 1] = 0;   // G
                    pixels[pixel_index + 2] = 0;   // B
                    pixels[pixel_index + 3] = 0;   // A
                }
            }
        }
        
        self.gl.tex_image_2d_with_i32_and_i32_and_i32_and_format_and_type_and_opt_u8_array(
            WebGlRenderingContext::TEXTURE_2D, 0, WebGlRenderingContext::RGBA as i32,
            size as i32, size as i32, 0, WebGlRenderingContext::RGBA,
            WebGlRenderingContext::UNSIGNED_BYTE, Some(&pixels)
        )?;
        
        self.gl.tex_parameteri(WebGlRenderingContext::TEXTURE_2D, WebGlRenderingContext::TEXTURE_MIN_FILTER, WebGlRenderingContext::LINEAR as i32);
        self.gl.tex_parameteri(WebGlRenderingContext::TEXTURE_2D, WebGlRenderingContext::TEXTURE_MAG_FILTER, WebGlRenderingContext::LINEAR as i32);
        self.gl.tex_parameteri(WebGlRenderingContext::TEXTURE_2D, WebGlRenderingContext::TEXTURE_WRAP_S, WebGlRenderingContext::CLAMP_TO_EDGE as i32);
        self.gl.tex_parameteri(WebGlRenderingContext::TEXTURE_2D, WebGlRenderingContext::TEXTURE_WRAP_T, WebGlRenderingContext::CLAMP_TO_EDGE as i32);
        
        self.textures.insert(name.to_string(), texture);
        Ok(())
    }
    

    
    // Create a line texture with custom color
    pub fn create_line_texture_with_color(&mut self, name: &str, width: u32, height: u32, line_width: u32, color: [u8; 4]) -> Result<(), JsValue> {
        let texture = self.gl.create_texture().ok_or("Failed to create texture")?;
        self.gl.bind_texture(WebGlRenderingContext::TEXTURE_2D, Some(&texture));
        
        // Generate line pixels - create a straight horizontal line texture
        let mut pixels = vec![0u8; (width * height * 4) as usize]; // RGBA
        
        let half_height = height / 2;
        let line_thickness = line_width.min(height);
        let line_start = if half_height >= line_thickness / 2 { half_height - line_thickness / 2 } else { 0 };
        let line_end = (line_start + line_thickness).min(height);
        
        for y in 0..height {
            for x in 0..width {
                let pixel_index = ((y * width + x) * 4) as usize;
                
                // Create a horizontal line in the center of the texture
                if y >= line_start && y < line_end {
                    // On the line - apply specified color
                    pixels[pixel_index] = color[0];     // R
                    pixels[pixel_index + 1] = color[1]; // G
                    pixels[pixel_index + 2] = color[2]; // B
                    pixels[pixel_index + 3] = color[3]; // A
                } else {
                    // Off the line - transparent
                    pixels[pixel_index] = 0;       // R
                    pixels[pixel_index + 1] = 0;   // G
                    pixels[pixel_index + 2] = 0;   // B
                    pixels[pixel_index + 3] = 0;   // A
                }
            }
        }
        
        self.gl.tex_image_2d_with_i32_and_i32_and_i32_and_format_and_type_and_opt_u8_array(
            WebGlRenderingContext::TEXTURE_2D, 0, WebGlRenderingContext::RGBA as i32,
            width as i32, height as i32, 0, WebGlRenderingContext::RGBA,
            WebGlRenderingContext::UNSIGNED_BYTE, Some(&pixels)
        )?;
        
        self.gl.tex_parameteri(WebGlRenderingContext::TEXTURE_2D, WebGlRenderingContext::TEXTURE_MIN_FILTER, WebGlRenderingContext::LINEAR as i32);
        self.gl.tex_parameteri(WebGlRenderingContext::TEXTURE_2D, WebGlRenderingContext::TEXTURE_MAG_FILTER, WebGlRenderingContext::LINEAR as i32);
        self.gl.tex_parameteri(WebGlRenderingContext::TEXTURE_2D, WebGlRenderingContext::TEXTURE_WRAP_S, WebGlRenderingContext::CLAMP_TO_EDGE as i32);
        self.gl.tex_parameteri(WebGlRenderingContext::TEXTURE_2D, WebGlRenderingContext::TEXTURE_WRAP_T, WebGlRenderingContext::CLAMP_TO_EDGE as i32);
        
        self.textures.insert(name.to_string(), texture);
        Ok(())
    }
    

    
    // Create a rectangle texture with custom color and fill mode
    pub fn create_rectangle_texture_with_color(&mut self, name: &str, width: u32, height: u32, border_width: u32, color: [u8; 4], filled: bool) -> Result<(), JsValue> {
        let texture = self.gl.create_texture().ok_or("Failed to create texture")?;
        self.gl.bind_texture(WebGlRenderingContext::TEXTURE_2D, Some(&texture));
        
        // Generate rectangle outline pixels
        let mut pixels = vec![0u8; (width * height * 4) as usize]; // RGBA
        
        for y in 0..height {
            for x in 0..width {
                let pixel_index = ((y * width + x) * 4) as usize;
                
                // Check if we're on the border
                let on_border = x < border_width || 
                               x >= width - border_width || 
                               y < border_width || 
                               y >= height - border_width;
                
                let should_draw = if filled {
                    // Filled rectangle - draw everything
                    true
                } else {
                    // Outline rectangle - draw only the border
                    on_border
                };
                
                if should_draw {
                    // Apply the specified color
                    pixels[pixel_index] = color[0];     // R
                    pixels[pixel_index + 1] = color[1]; // G
                    pixels[pixel_index + 2] = color[2]; // B
                    pixels[pixel_index + 3] = color[3]; // A
                } else {
                    // Inside - transparent
                    pixels[pixel_index] = 0;       // R
                    pixels[pixel_index + 1] = 0;   // G
                    pixels[pixel_index + 2] = 0;   // B
                    pixels[pixel_index + 3] = 0;   // A (transparent)
                }
            }
        }
        
        // Upload to GPU
        self.gl.tex_image_2d_with_i32_and_i32_and_i32_and_format_and_type_and_opt_u8_array(
            WebGlRenderingContext::TEXTURE_2D,
            0,
            WebGlRenderingContext::RGBA as i32,
            width as i32,
            height as i32,
            0,
            WebGlRenderingContext::RGBA,
            WebGlRenderingContext::UNSIGNED_BYTE,
            Some(&pixels),
        )?;
        
        // Set texture parameters
        self.gl.tex_parameteri(WebGlRenderingContext::TEXTURE_2D, WebGlRenderingContext::TEXTURE_MIN_FILTER, WebGlRenderingContext::LINEAR as i32);
        self.gl.tex_parameteri(WebGlRenderingContext::TEXTURE_2D, WebGlRenderingContext::TEXTURE_MAG_FILTER, WebGlRenderingContext::LINEAR as i32);
        self.gl.tex_parameteri(WebGlRenderingContext::TEXTURE_2D, WebGlRenderingContext::TEXTURE_WRAP_S, WebGlRenderingContext::CLAMP_TO_EDGE as i32);
        self.gl.tex_parameteri(WebGlRenderingContext::TEXTURE_2D, WebGlRenderingContext::TEXTURE_WRAP_T, WebGlRenderingContext::CLAMP_TO_EDGE as i32);
        
        self.textures.insert(name.to_string(), texture);
        Ok(())
    }
    
    /// Load texture from URL asynchronously
    /// This creates a placeholder 1x1 texture immediately, then replaces it when the image loads
    pub fn load_texture_from_url(&mut self, name: &str, url: &str) -> Result<(), JsValue> {
        web_sys::console::log_1(&format!("[TEXTURE MANAGER] Loading texture '{}' from: {}", name, url).into());
        
        // Create placeholder 1x1 white texture immediately
        let placeholder_texture = self.gl.create_texture().ok_or("Failed to create placeholder texture")?;
        self.gl.bind_texture(WebGlRenderingContext::TEXTURE_2D, Some(&placeholder_texture));
        
        let white_pixel = vec![255u8, 255, 255, 255];
        self.gl.tex_image_2d_with_i32_and_i32_and_i32_and_format_and_type_and_opt_u8_array(
            WebGlRenderingContext::TEXTURE_2D,
            0,
            WebGlRenderingContext::RGBA as i32,
            1, 1, 0,
            WebGlRenderingContext::RGBA,
            WebGlRenderingContext::UNSIGNED_BYTE,
            Some(&white_pixel),
        )?;
        
        self.textures.insert(name.to_string(), placeholder_texture.clone());
        
        // Load actual image asynchronously
        let image = HtmlImageElement::new()?;
        image.set_cross_origin(Some("anonymous"));
        
        // Clone values for the closure
        let gl = self.gl.clone();
        let texture = placeholder_texture;
        let texture_name = name.to_string();
        let image_rc = Rc::new(image.clone());
        let image_for_onload = image_rc.clone();
        
        // Set up onload callback
        let onload = Closure::wrap(Box::new(move || {
            let img = (*image_for_onload).clone();
            gl.bind_texture(WebGlRenderingContext::TEXTURE_2D, Some(&texture));
            
            match gl.tex_image_2d_with_u32_and_u32_and_html_image_element(
                WebGlRenderingContext::TEXTURE_2D,
                0,
                WebGlRenderingContext::RGBA as i32,
                WebGlRenderingContext::RGBA,
                WebGlRenderingContext::UNSIGNED_BYTE,
                &img,
            ) {
                Ok(_) => {
                    // Set texture parameters
                    gl.tex_parameteri(WebGlRenderingContext::TEXTURE_2D, WebGlRenderingContext::TEXTURE_MIN_FILTER, WebGlRenderingContext::NEAREST as i32);
                    gl.tex_parameteri(WebGlRenderingContext::TEXTURE_2D, WebGlRenderingContext::TEXTURE_MAG_FILTER, WebGlRenderingContext::NEAREST as i32);
                    gl.tex_parameteri(WebGlRenderingContext::TEXTURE_2D, WebGlRenderingContext::TEXTURE_WRAP_S, WebGlRenderingContext::CLAMP_TO_EDGE as i32);
                    gl.tex_parameteri(WebGlRenderingContext::TEXTURE_2D, WebGlRenderingContext::TEXTURE_WRAP_T, WebGlRenderingContext::CLAMP_TO_EDGE as i32);
                    web_sys::console::log_1(&format!("✅ [TEXTURE MANAGER] Successfully loaded texture '{}'", texture_name).into());
                },
                Err(e) => {
                    web_sys::console::error_1(&format!("❌ [TEXTURE MANAGER] Failed to upload texture '{}': {:?}", texture_name, e).into());
                }
            }
        }) as Box<dyn FnMut()>);
        
        image.set_onload(Some(onload.as_ref().unchecked_ref()));
        onload.forget(); // Keep callback alive
        
        // Set up onerror callback
        let error_name = name.to_string();
        let error_url = url.to_string();
        let onerror = Closure::wrap(Box::new(move || {
            web_sys::console::error_1(&format!("❌ [TEXTURE MANAGER] Failed to load texture '{}' from {}", error_name, error_url).into());
        }) as Box<dyn FnMut()>);
        
        image.set_onerror(Some(onerror.as_ref().unchecked_ref()));
        onerror.forget();
        
        // Start loading
        image.set_src(url);
        
        Ok(())
    }
}
