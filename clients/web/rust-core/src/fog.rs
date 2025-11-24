use wasm_bindgen::prelude::*;
use web_sys::{WebGl2RenderingContext as WebGlRenderingContext, WebGlProgram, WebGlShader};
use indexmap::IndexMap;
use crate::math::Vec2;

#[derive(Clone, Debug)]
pub struct FogRectangle {
    pub id: String,
    pub table_id: String, // NEW: Associates fog with specific table
    pub start: Vec2,
    pub end: Vec2,
    pub mode: FogMode, // hide or reveal
}

#[derive(Clone, Debug, PartialEq)]
pub enum FogMode {
    Hide,
    Reveal,
}

impl FogRectangle {
    pub fn new(id: String, start_x: f32, start_y: f32, end_x: f32, end_y: f32, mode: FogMode) -> Self {
        Self {
            id,
            table_id: "default".to_string(), // Default to "default" (matches server table name)
            start: Vec2::new(start_x, start_y),
            end: Vec2::new(end_x, end_y),
            mode,
        }
    }

    pub fn normalized(&self) -> Self {
        let min_x = self.start.x.min(self.end.x);
        let min_y = self.start.y.min(self.end.y);
        let max_x = self.start.x.max(self.end.x);
        let max_y = self.start.y.max(self.end.y);
        
        Self {
            id: self.id.clone(),
            start: Vec2::new(min_x, min_y),
            end: Vec2::new(max_x, max_y),
            mode: self.mode.clone(),
            table_id: self.table_id.clone(),
        }
    }

    pub fn contains_point(&self, point: Vec2) -> bool {
        let normalized = self.normalized();
        point.x >= normalized.start.x && point.x <= normalized.end.x &&
        point.y >= normalized.start.y && point.y <= normalized.end.y
    }
}

pub struct FogOfWarSystem {
    gl: WebGlRenderingContext,
    fog_shader: Option<WebGlProgram>,
    texture_shader: Option<WebGlProgram>,
    fog_rectangles: IndexMap<String, FogRectangle>,
    is_gm: bool,
    table_bounds: Option<(f32, f32, f32, f32)>, // (x, y, width, height)
    
    // Render-to-texture system
    fog_framebuffer: Option<web_sys::WebGlFramebuffer>,
    fog_texture: Option<web_sys::WebGlTexture>,
    texture_width: i32,
    texture_height: i32,
    needs_full_rebuild: bool, // Flag to rebuild entire fog texture
    
    // Canvas dimensions for viewport restoration
    canvas_width: f32,
    canvas_height: f32,
}

impl FogOfWarSystem {
    pub fn new(gl: WebGlRenderingContext) -> Result<Self, JsValue> {
        let mut system = Self {
            gl,
            fog_shader: None,
            texture_shader: None,
            fog_rectangles: IndexMap::new(),
            is_gm: false,
            table_bounds: None,
            fog_framebuffer: None,
            fog_texture: None,
            texture_width: 2048,
            texture_height: 2048,
            needs_full_rebuild: true,
            canvas_width: 800.0,
            canvas_height: 600.0,
        };
        
        system.init_shaders()?;
        system.init_fog_texture()?;
        Ok(system)
    }
    
    pub fn set_table_bounds(&mut self, x: f32, y: f32, width: f32, height: f32) {
        self.table_bounds = Some((x, y, width, height));
        self.needs_full_rebuild = true; // Rebuild fog texture with new bounds
        web_sys::console::log_1(&format!(
            "[FOG-INIT] Table bounds set: origin=({}, {}), size={}x{}", 
            x, y, width, height
        ).into());
    }

    fn init_shaders(&mut self) -> Result<(), JsValue> {
        // Fog rendering shader for writing to texture
        // Input: world coordinates, Output: NDC coordinates for framebuffer
        let fog_vertex_source = r#"#version 300 es
            precision highp float;
            
            in vec2 a_position;  // World coordinates
            
            uniform mat3 u_view_matrix;  // Orthographic projection matrix
            
            void main() {
                // Transform world coords directly to NDC (-1 to 1)
                // The orthographic matrix handles the full transformation
                vec3 pos = u_view_matrix * vec3(a_position, 1.0);
                gl_Position = vec4(pos.xy, 0.0, 1.0);
            }
        "#;

        let fog_fragment_source = r#"#version 300 es
            precision highp float;
            
            uniform vec4 u_fog_color;
            
            out vec4 fragColor;
            
            void main() {
                // Write fog mask value to red channel
                // u_fog_color.r = 1.0 for hide (fogged), 0.0 for reveal (clear)
                fragColor = vec4(u_fog_color.r, 0.0, 0.0, 1.0);
            }
        "#;

        self.fog_shader = Some(self.create_program(fog_vertex_source, fog_fragment_source)?);
        
        // Texture rendering shader for displaying cached fog texture
        let texture_vertex_source = r#"#version 300 es
            precision highp float;
            
            in vec2 a_position;  // World coordinates
            in vec2 a_texcoord;  // Texture coordinates
            
            uniform mat3 u_view_matrix;
            uniform vec2 u_canvas_size;
            
            out vec2 v_texcoord;
            
            void main() {
                vec3 view_pos = u_view_matrix * vec3(a_position, 1.0);
                vec2 ndc = (view_pos.xy / u_canvas_size) * 2.0 - 1.0;
                ndc.y = -ndc.y;
                
                gl_Position = vec4(ndc, 0.0, 1.0);
                v_texcoord = a_texcoord;
            }
        "#;

        let texture_fragment_source = r#"#version 300 es
            precision highp float;
            
            in vec2 v_texcoord;
            
            uniform sampler2D u_fog_texture;
            uniform bool u_is_gm;
            
            out vec4 fragColor;
            
            void main() {
                float fogValue = texture(u_fog_texture, v_texcoord).r;
                
                if (fogValue > 0.5) {
                    // Fogged area
                    if (u_is_gm) {
                        fragColor = vec4(0.5, 0.5, 0.5, 0.3); // Semi-transparent gray for GM
                    } else {
                        fragColor = vec4(0.0, 0.0, 0.0, 1.0); // Opaque black for players
                    }
                } else {
                    // Revealed area - transparent
                    discard;
                }
            }
        "#;

        self.texture_shader = Some(self.create_program(texture_vertex_source, texture_fragment_source)?);
        
        Ok(())
    }

    fn init_fog_texture(&mut self) -> Result<(), JsValue> {
        // Create framebuffer for render-to-texture
        let framebuffer = self.gl.create_framebuffer()
            .ok_or("Failed to create fog framebuffer")?;
        
        // Create texture to store fog state
        let texture = self.gl.create_texture()
            .ok_or("Failed to create fog texture")?;
        
        self.gl.bind_texture(WebGlRenderingContext::TEXTURE_2D, Some(&texture));
        
        // Configure texture parameters
        self.gl.tex_parameteri(
            WebGlRenderingContext::TEXTURE_2D,
            WebGlRenderingContext::TEXTURE_MIN_FILTER,
            WebGlRenderingContext::LINEAR as i32,
        );
        self.gl.tex_parameteri(
            WebGlRenderingContext::TEXTURE_2D,
            WebGlRenderingContext::TEXTURE_MAG_FILTER,
            WebGlRenderingContext::LINEAR as i32,
        );
        self.gl.tex_parameteri(
            WebGlRenderingContext::TEXTURE_2D,
            WebGlRenderingContext::TEXTURE_WRAP_S,
            WebGlRenderingContext::CLAMP_TO_EDGE as i32,
        );
        self.gl.tex_parameteri(
            WebGlRenderingContext::TEXTURE_2D,
            WebGlRenderingContext::TEXTURE_WRAP_T,
            WebGlRenderingContext::CLAMP_TO_EDGE as i32,
        );
        
        // Allocate texture storage (single channel for fog mask)
        self.gl.tex_image_2d_with_i32_and_i32_and_i32_and_format_and_type_and_opt_u8_array(
            WebGlRenderingContext::TEXTURE_2D,
            0, // mipmap level
            WebGlRenderingContext::R8 as i32, // internal format: single 8-bit red channel
            self.texture_width,
            self.texture_height,
            0, // border (must be 0)
            WebGlRenderingContext::RED, // format
            WebGlRenderingContext::UNSIGNED_BYTE, // type
            None, // data (null = allocate storage only)
        )?;
        
        // Attach texture to framebuffer
        self.gl.bind_framebuffer(WebGlRenderingContext::FRAMEBUFFER, Some(&framebuffer));
        self.gl.framebuffer_texture_2d(
            WebGlRenderingContext::FRAMEBUFFER,
            WebGlRenderingContext::COLOR_ATTACHMENT0,
            WebGlRenderingContext::TEXTURE_2D,
            Some(&texture),
            0, // mipmap level
        );
        
        // Verify framebuffer is complete
        let status = self.gl.check_framebuffer_status(WebGlRenderingContext::FRAMEBUFFER);
        if status != WebGlRenderingContext::FRAMEBUFFER_COMPLETE {
            return Err(JsValue::from_str(&format!("Framebuffer incomplete: {}", status)));
        }
        
        // Unbind framebuffer
        self.gl.bind_framebuffer(WebGlRenderingContext::FRAMEBUFFER, None);
        
        self.fog_framebuffer = Some(framebuffer);
        self.fog_texture = Some(texture);
        
        web_sys::console::log_1(&format!(
            "[FOG-TEXTURE] Initialized {}x{} fog texture with framebuffer",
            self.texture_width, self.texture_height
        ).into());
        
        // Clear texture to fully revealed state (0.0 = no fog)
        self.gl.bind_framebuffer(WebGlRenderingContext::FRAMEBUFFER, Some(self.fog_framebuffer.as_ref().unwrap()));
        self.gl.viewport(0, 0, self.texture_width, self.texture_height);
        self.gl.clear_color(0.0, 0.0, 0.0, 1.0); // Clear to black (0 = revealed)
        self.gl.clear(WebGlRenderingContext::COLOR_BUFFER_BIT);
        self.gl.bind_framebuffer(WebGlRenderingContext::FRAMEBUFFER, None);
        
        web_sys::console::log_1(&"[FOG-TEXTURE] Cleared fog texture to revealed state".into());
        
        Ok(())
    }

    fn create_program(&self, vertex_source: &str, fragment_source: &str) -> Result<WebGlProgram, JsValue> {
        let vertex_shader = self.compile_shader(WebGlRenderingContext::VERTEX_SHADER, vertex_source)?;
        let fragment_shader = self.compile_shader(WebGlRenderingContext::FRAGMENT_SHADER, fragment_source)?;
        
        let program = self.gl.create_program().ok_or("Failed to create program")?;
        self.gl.attach_shader(&program, &vertex_shader);
        self.gl.attach_shader(&program, &fragment_shader);
        self.gl.link_program(&program);
        
        if !self.gl.get_program_parameter(&program, WebGlRenderingContext::LINK_STATUS).as_bool().unwrap_or(false) {
            let info = self.gl.get_program_info_log(&program).unwrap_or_default();
            return Err(JsValue::from_str(&format!("Failed to link program: {}", info)));
        }
        
        Ok(program)
    }

    fn compile_shader(&self, shader_type: u32, source: &str) -> Result<WebGlShader, JsValue> {
        let shader = self.gl.create_shader(shader_type).ok_or("Failed to create shader")?;
        self.gl.shader_source(&shader, source);
        self.gl.compile_shader(&shader);
        
        if !self.gl.get_shader_parameter(&shader, WebGlRenderingContext::COMPILE_STATUS).as_bool().unwrap_or(false) {
            let info = self.gl.get_shader_info_log(&shader).unwrap_or_default();
            return Err(JsValue::from_str(&format!("Failed to compile shader: {}", info)));
        }
        
        Ok(shader)
    }

    pub fn set_gm_mode(&mut self, is_gm: bool) {
        self.is_gm = is_gm;
    }

    pub fn add_fog_rectangle(&mut self, id: String, start_x: f32, start_y: f32, end_x: f32, end_y: f32, mode: &str, table_id: String) {
        let fog_mode = match mode {
            "reveal" => FogMode::Reveal,
            _ => FogMode::Hide,
        };
        
        // Clamp coordinates to table bounds if table bounds are set
        let (clamped_start_x, clamped_start_y, clamped_end_x, clamped_end_y) = if let Some((tx, ty, tw, th)) = self.table_bounds {
            let clamped_sx = start_x.clamp(tx, tx + tw);
            let clamped_sy = start_y.clamp(ty, ty + th);
            let clamped_ex = end_x.clamp(tx, tx + tw);
            let clamped_ey = end_y.clamp(ty, ty + th);
            
            // Only log clamping in debug builds to avoid spamming console every time users draw
            #[cfg(debug_assertions)]
            if start_x != clamped_sx || start_y != clamped_sy || end_x != clamped_ex || end_y != clamped_ey {
                web_sys::console::debug_1(&format!(
                    "[FOG-DEBUG] Coordinates clamped to table: ({}, {}) → ({}, {}) became ({}, {}) → ({}, {})",
                    start_x, start_y, end_x, end_y, clamped_sx, clamped_sy, clamped_ex, clamped_ey
                ).into());
            }
            
            (clamped_sx, clamped_sy, clamped_ex, clamped_ey)
        } else {
            (start_x, start_y, end_x, end_y)
        };
        
        // Concise informational log for fog additions (safe to keep in production)
        web_sys::console::log_1(&format!(
            "[FOG] Add: {} ({:.2}, {:.2})→({:.2}, {:.2}) mode={} table={}",
            id, clamped_start_x, clamped_start_y, clamped_end_x, clamped_end_y, mode, table_id
        ).into());

        let mut rectangle = FogRectangle::new(id.clone(), clamped_start_x, clamped_start_y, clamped_end_x, clamped_end_y, fog_mode);
        rectangle.table_id = table_id; // Set the table_id
        self.fog_rectangles.insert(id.clone(), rectangle.clone());
        
        // If we need a full rebuild (e.g., first rectangle or table bounds changed),
        // mark it for rebuild on next render. Otherwise, update incrementally.
        if !self.needs_full_rebuild {
            // Incrementally update fog texture with this single rectangle
            if let Err(e) = self.update_fog_texture_incremental(&rectangle) {
                web_sys::console::error_1(&format!("[FOG-ERROR] Failed to update fog texture: {:?}", e).into());
            }
        }
    }

    pub fn remove_fog_rectangle(&mut self, id: &str) {
        self.fog_rectangles.shift_remove(id);
        // Removing requires full rebuild since we can't "un-draw" from texture
        self.needs_full_rebuild = true;
    }

    pub fn clear_fog(&mut self) {
        self.fog_rectangles.clear();
        self.needs_full_rebuild = true;
    }

    pub fn hide_entire_table(&mut self, table_width: f32, table_height: f32, table_id: String) {
        self.clear_fog();
        self.add_fog_rectangle(
            "full_table_fog".to_string(),
            0.0, 0.0,
            table_width, table_height,
            "hide",
            table_id
        );
    }

    pub fn is_point_in_fog(&self, x: f32, y: f32) -> bool {
        let point = Vec2::new(x, y);
        let mut in_hide_area = false;
        
        // Check if point is in any hide rectangle
        for rectangle in self.fog_rectangles.values() {
            if rectangle.mode == FogMode::Hide && rectangle.contains_point(point) {
                in_hide_area = true;
                break;
            }
        }
        
        if !in_hide_area {
            return false;
        }
        
        // Check if point is revealed by any reveal rectangle
        for rectangle in self.fog_rectangles.values() {
            if rectangle.mode == FogMode::Reveal && rectangle.contains_point(point) {
                return false; // Point is revealed
            }
        }
        
        true // Point is in fog
    }
    
    /// Incrementally update fog texture by rendering a single new rectangle
    fn update_fog_texture_incremental(&mut self, rectangle: &FogRectangle) -> Result<(), JsValue> {
        let framebuffer = self.fog_framebuffer.as_ref().ok_or("Fog framebuffer not initialized")?;
        let program = self.fog_shader.as_ref().ok_or("Fog shader not initialized")?;
        
        // Bind framebuffer to render to texture
        self.gl.bind_framebuffer(WebGlRenderingContext::FRAMEBUFFER, Some(framebuffer));
        
        // Set viewport to texture size
        self.gl.viewport(0, 0, self.texture_width, self.texture_height);
        
        self.gl.use_program(Some(program));
        
        // Set up orthographic projection for texture space (0,0 → table bounds)
        let (tx, ty, tw, th) = self.table_bounds.unwrap_or((0.0, 0.0, 2000.0, 2000.0));
        let ortho_matrix = self.create_orthographic_matrix(tx, ty, tw, th);
        
        let view_matrix_location = self.gl.get_uniform_location(program, "u_view_matrix");
        if let Some(location) = view_matrix_location {
            self.gl.uniform_matrix3fv_with_f32_array(Some(&location), false, &ortho_matrix);
        }
        
        // Render rectangle directly to texture color buffer
        // Color value: 1.0 = fogged, 0.0 = revealed
        let fog_value = match rectangle.mode {
            FogMode::Hide => 1.0,
            FogMode::Reveal => 0.0,
        };
        
        let fog_color_location = self.gl.get_uniform_location(program, "u_fog_color");
        if let Some(location) = fog_color_location {
            self.gl.uniform4f(Some(&location), fog_value, 0.0, 0.0, 1.0);
        }
        
        // Disable blending - overwrite pixels directly
        self.gl.disable(WebGlRenderingContext::BLEND);
        
        // Ensure depth/stencil tests are disabled
        self.gl.disable(WebGlRenderingContext::DEPTH_TEST);
        self.gl.disable(WebGlRenderingContext::STENCIL_TEST);
        
        self.render_single_rectangle(program, rectangle)?;
        
        // Unbind framebuffer
        self.gl.bind_framebuffer(WebGlRenderingContext::FRAMEBUFFER, None);
        
        // CRITICAL: Restore viewport to canvas size (otherwise camera gets misplaced)
        self.gl.viewport(0, 0, self.canvas_width as i32, self.canvas_height as i32);
        
        Ok(())
    }
    
    /// Rebuild entire fog texture from all rectangles (used after removal or clear)
    fn rebuild_fog_texture(&mut self) -> Result<(), JsValue> {
        let framebuffer = self.fog_framebuffer.as_ref().ok_or("Fog framebuffer not initialized")?;
        let program = self.fog_shader.as_ref().ok_or("Fog shader not initialized")?;
        
        // Bind framebuffer
        self.gl.bind_framebuffer(WebGlRenderingContext::FRAMEBUFFER, Some(framebuffer));
        self.gl.viewport(0, 0, self.texture_width, self.texture_height);
        
        // Clear texture to 0.0 (fully revealed)
        self.gl.clear_color(0.0, 0.0, 0.0, 1.0);
        self.gl.clear(WebGlRenderingContext::COLOR_BUFFER_BIT);
        
        self.gl.use_program(Some(program));
        
        // Set up orthographic projection
        let (tx, ty, tw, th) = self.table_bounds.unwrap_or((0.0, 0.0, 2000.0, 2000.0));
        let ortho_matrix = self.create_orthographic_matrix(tx, ty, tw, th);
        
        let view_matrix_location = self.gl.get_uniform_location(program, "u_view_matrix");
        if let Some(location) = view_matrix_location {
            self.gl.uniform_matrix3fv_with_f32_array(Some(&location), false, &ortho_matrix);
        }
        
        self.gl.disable(WebGlRenderingContext::BLEND);
        
        // Ensure depth/stencil tests are disabled
        self.gl.disable(WebGlRenderingContext::DEPTH_TEST);
        self.gl.disable(WebGlRenderingContext::STENCIL_TEST);
        
        // Render all rectangles in chronological order
        for rectangle in self.fog_rectangles.values() {
            let fog_value = match rectangle.mode {
                FogMode::Hide => 1.0,
                FogMode::Reveal => 0.0,
            };
            
            let fog_color_location = self.gl.get_uniform_location(program, "u_fog_color");
            if let Some(location) = fog_color_location {
                self.gl.uniform4f(Some(&location), fog_value, 0.0, 0.0, 1.0);
            }
            
            self.render_single_rectangle(program, rectangle)?;
        }
        
        // Unbind framebuffer
        self.gl.bind_framebuffer(WebGlRenderingContext::FRAMEBUFFER, None);
        
        // CRITICAL: Restore viewport to canvas size
        self.gl.viewport(0, 0, self.canvas_width as i32, self.canvas_height as i32);
        
        Ok(())
    }
    
    /// Create orthographic projection matrix for texture space
    fn create_orthographic_matrix(&self, x: f32, y: f32, width: f32, height: f32) -> [f32; 9] {
        // Map world coordinates (x, y, width, height) to NDC (-1 to 1)
        let sx = 2.0 / width;
        let sy = 2.0 / height;
        let tx = -1.0 - (x * sx);
        let ty = -1.0 - (y * sy);
        
        [
            sx,  0.0, 0.0,
            0.0, sy,  0.0,
            tx,  ty,  1.0,
        ]
    }
    
    pub fn render_fog_filtered(&mut self, view_matrix: &[f32; 9], canvas_width: f32, canvas_height: f32, _table_id: Option<&str>) -> Result<(), JsValue> {
        // Update canvas dimensions for viewport restoration
        self.canvas_width = canvas_width;
        self.canvas_height = canvas_height;
        
        if self.fog_rectangles.is_empty() {
            return Ok(());
        }
        
        // Rebuild texture if needed
        if self.needs_full_rebuild {
            self.rebuild_fog_texture()?;
            self.needs_full_rebuild = false;
        }
        
        // Render cached fog texture to screen
        let texture = self.fog_texture.as_ref().ok_or("Fog texture not initialized")?;
        let program = self.texture_shader.as_ref().ok_or("Texture shader not initialized")?;
        
        self.gl.use_program(Some(program));
        
        // Bind fog texture
        self.gl.active_texture(WebGlRenderingContext::TEXTURE0);
        self.gl.bind_texture(WebGlRenderingContext::TEXTURE_2D, Some(texture));
        
        let texture_location = self.gl.get_uniform_location(program, "u_fog_texture");
        if let Some(location) = texture_location {
            self.gl.uniform1i(Some(&location), 0); // Texture unit 0
        }
        
        // Set view matrix
        let view_matrix_location = self.gl.get_uniform_location(program, "u_view_matrix");
        if let Some(location) = view_matrix_location {
            self.gl.uniform_matrix3fv_with_f32_array(Some(&location), false, view_matrix);
        }
        
        let canvas_size_location = self.gl.get_uniform_location(program, "u_canvas_size");
        if let Some(location) = canvas_size_location {
            self.gl.uniform2f(Some(&location), canvas_width, canvas_height);
        }
        
        let is_gm_location = self.gl.get_uniform_location(program, "u_is_gm");
        if let Some(location) = is_gm_location {
            self.gl.uniform1i(Some(&location), if self.is_gm { 1 } else { 0 });
        }
        
        // Enable blending for fog overlay
        self.gl.enable(WebGlRenderingContext::BLEND);
        self.gl.blend_func(WebGlRenderingContext::SRC_ALPHA, WebGlRenderingContext::ONE_MINUS_SRC_ALPHA);
        
        // Render textured quad covering table bounds
        self.render_textured_quad(program)?;
        
        Ok(())
    }

    fn render_single_rectangle(&self, program: &WebGlProgram, rectangle: &FogRectangle) -> Result<(), JsValue> {
        let normalized = rectangle.normalized();
        
        // Create rectangle vertices
        let vertices: [f32; 8] = [
            normalized.start.x, normalized.start.y,
            normalized.end.x, normalized.start.y,
            normalized.end.x, normalized.end.y,
            normalized.start.x, normalized.end.y,
        ];
        
        // Create and bind vertex buffer
        let buffer = self.gl.create_buffer().ok_or("Failed to create buffer")?;
        self.gl.bind_buffer(WebGlRenderingContext::ARRAY_BUFFER, Some(&buffer));
        
        unsafe {
            let vertices_array = js_sys::Float32Array::view(&vertices);
            self.gl.buffer_data_with_array_buffer_view(
                WebGlRenderingContext::ARRAY_BUFFER,
                &vertices_array,
                WebGlRenderingContext::STATIC_DRAW,
            );
        }
        
        // Set up vertex attributes
        let position_location = self.gl.get_attrib_location(program, "a_position") as u32;
        self.gl.enable_vertex_attrib_array(position_location);
        self.gl.vertex_attrib_pointer_with_i32(position_location, 2, WebGlRenderingContext::FLOAT, false, 0, 0);
        
        // Draw rectangle
        self.gl.draw_arrays(WebGlRenderingContext::TRIANGLE_FAN, 0, 4);
        
        self.gl.disable_vertex_attrib_array(position_location);
        
        Ok(())
    }

    fn render_textured_quad(&self, program: &WebGlProgram) -> Result<(), JsValue> {
        // Render textured quad covering table bounds
        let (x, y, width, height) = self.table_bounds.unwrap_or((0.0, 0.0, 2000.0, 2000.0));
        
        // Vertices: position (x, y) + texcoord (u, v)
        #[rustfmt::skip]
        let vertices: [f32; 16] = [
            // pos_x, pos_y, tex_u, tex_v
            x,         y,          0.0, 0.0, // bottom-left
            x + width, y,          1.0, 0.0, // bottom-right
            x + width, y + height, 1.0, 1.0, // top-right
            x,         y + height, 0.0, 1.0, // top-left
        ];
        
        let buffer = self.gl.create_buffer().ok_or("Failed to create buffer")?;
        self.gl.bind_buffer(WebGlRenderingContext::ARRAY_BUFFER, Some(&buffer));
        
        unsafe {
            let vertices_array = js_sys::Float32Array::view(&vertices);
            self.gl.buffer_data_with_array_buffer_view(
                WebGlRenderingContext::ARRAY_BUFFER,
                &vertices_array,
                WebGlRenderingContext::STATIC_DRAW,
            );
        }
        
        // Set up vertex attributes (interleaved: position + texcoord)
        let position_location = self.gl.get_attrib_location(program, "a_position");
        let texcoord_location = self.gl.get_attrib_location(program, "a_texcoord");
        
        web_sys::console::log_1(&format!(
            "[FOG-QUAD] Attribute locations: position={}, texcoord={}",
            position_location, texcoord_location
        ).into());
        
        if position_location < 0 || texcoord_location < 0 {
            return Err(JsValue::from_str("Shader attribute locations not found"));
        }
        
        let position_location = position_location as u32;
        let texcoord_location = texcoord_location as u32;
        
        let stride = 4 * 4; // 4 floats * 4 bytes per float
        
        self.gl.enable_vertex_attrib_array(position_location);
        self.gl.vertex_attrib_pointer_with_i32(
            position_location,
            2, // 2 components (x, y)
            WebGlRenderingContext::FLOAT,
            false,
            stride,
            0, // offset
        );
        
        self.gl.enable_vertex_attrib_array(texcoord_location);
        self.gl.vertex_attrib_pointer_with_i32(
            texcoord_location,
            2, // 2 components (u, v)
            WebGlRenderingContext::FLOAT,
            false,
            stride,
            8, // offset (2 floats * 4 bytes)
        );
        
        // Draw quad
        self.gl.draw_arrays(WebGlRenderingContext::TRIANGLE_FAN, 0, 4);
        
        web_sys::console::log_1(&"[FOG-QUAD] Drew TRIANGLE_FAN with 4 vertices".into());
        
        self.gl.disable_vertex_attrib_array(position_location);
        self.gl.disable_vertex_attrib_array(texcoord_location);
        
        Ok(())
    }

    pub fn get_fog_count(&self) -> usize {
        self.fog_rectangles.len()
    }
    
    // ===== TABLE-BASED OPTIMIZATION METHODS =====
    
    /// Count fog rectangles per table
    pub fn count_fog_by_table(&self) -> std::collections::HashMap<String, usize> {
        let mut counts = std::collections::HashMap::new();
        for fog in self.fog_rectangles.values() {
            *counts.entry(fog.table_id.clone()).or_insert(0) += 1;
        }
        counts
    }
    
    /// Get fog count for specific table only
    pub fn count_fog_for_table(&self, table_id: &str) -> usize {
        self.fog_rectangles.values().filter(|fog| fog.table_id == table_id).count()
    }
    
    /// Remove all fog not belonging to the specified table (optimization)
    pub fn remove_fog_not_in_table(&mut self, table_id: &str) -> usize {
        let before_count = self.fog_rectangles.len();
        self.fog_rectangles.retain(|_, fog| fog.table_id == table_id);
        before_count - self.fog_rectangles.len()
    }
    
    /// Clear all fog from a specific table
    pub fn clear_fog_for_table(&mut self, table_id: &str) -> usize {
        let before_count = self.fog_rectangles.len();
        self.fog_rectangles.retain(|_, fog| fog.table_id != table_id);
        before_count - self.fog_rectangles.len()
    }
}
