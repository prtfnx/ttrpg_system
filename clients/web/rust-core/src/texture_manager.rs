use std::collections::HashMap;
use web_sys::{WebGl2RenderingContext as WebGlRenderingContext, WebGlTexture, HtmlImageElement};
use wasm_bindgen::prelude::*;

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
    
    pub fn get_texture(&self, name: &str) -> Option<&WebGlTexture> {
        self.textures.get(name)
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
    
    pub fn remove_texture(&mut self, name: &str) -> bool {
        self.textures.remove(name).is_some()
    }
    
    pub fn clear_textures(&mut self) {
        self.textures.clear();
    }
    
    pub fn get_texture_count(&self) -> usize {
        self.textures.len()
    }
}
