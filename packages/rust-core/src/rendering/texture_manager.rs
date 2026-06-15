use std::collections::HashMap;
use std::rc::Rc;
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
                    // Set texture parameters - use LINEAR filtering for smooth text rendering
                    gl.tex_parameteri(WebGlRenderingContext::TEXTURE_2D, WebGlRenderingContext::TEXTURE_MIN_FILTER, WebGlRenderingContext::LINEAR as i32);
                    gl.tex_parameteri(WebGlRenderingContext::TEXTURE_2D, WebGlRenderingContext::TEXTURE_MAG_FILTER, WebGlRenderingContext::LINEAR as i32);
                    gl.tex_parameteri(WebGlRenderingContext::TEXTURE_2D, WebGlRenderingContext::TEXTURE_WRAP_S, WebGlRenderingContext::CLAMP_TO_EDGE as i32);
                    gl.tex_parameteri(WebGlRenderingContext::TEXTURE_2D, WebGlRenderingContext::TEXTURE_WRAP_T, WebGlRenderingContext::CLAMP_TO_EDGE as i32);
                    web_sys::console::log_1(&format!("[OK] [TEXTURE MANAGER] Successfully loaded texture '{}'", texture_name).into());
                },
                Err(e) => {
                    web_sys::console::error_1(&format!("[ERR] [TEXTURE MANAGER] Failed to upload texture '{}': {:?}", texture_name, e).into());
                }
            }
        }) as Box<dyn FnMut()>);
        
        image.set_onload(Some(onload.as_ref().unchecked_ref()));
        onload.forget(); // Keep callback alive
        
        // Set up onerror callback
        let error_name = name.to_string();
        let error_url = url.to_string();
        let onerror = Closure::wrap(Box::new(move || {
            web_sys::console::error_1(&format!("[ERR] [TEXTURE MANAGER] Failed to load texture '{}' from {}", error_name, error_url).into());
        }) as Box<dyn FnMut()>);
        
        image.set_onerror(Some(onerror.as_ref().unchecked_ref()));
        onerror.forget();
        
        // Start loading
        image.set_src(url);
        
        Ok(())
    }
}
