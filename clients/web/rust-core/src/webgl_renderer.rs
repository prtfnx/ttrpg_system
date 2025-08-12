use wasm_bindgen::prelude::*;
use web_sys::{WebGl2RenderingContext as WebGlRenderingContext, WebGlProgram, WebGlShader, WebGlBuffer};
use crate::math::Vec2;
use crate::types::BlendMode;

pub struct WebGLRenderer {
    pub gl: WebGlRenderingContext,
    pub shader_program: Option<WebGlProgram>,
    vertex_buffer: Option<WebGlBuffer>,
    index_buffer: Option<WebGlBuffer>,
    current_layer_color: [f32; 3],
}

impl WebGLRenderer {
    pub fn new(gl: WebGlRenderingContext) -> Result<Self, JsValue> {
        // Enable blending for transparency support
        gl.enable(WebGlRenderingContext::BLEND);
        gl.blend_func(WebGlRenderingContext::SRC_ALPHA, WebGlRenderingContext::ONE_MINUS_SRC_ALPHA);
        
        let mut renderer = Self {
            gl,
            shader_program: None,
            vertex_buffer: None,
            index_buffer: None,
            current_layer_color: [1.0, 1.0, 1.0], // Default to white
        };
        renderer.init_shaders()?;
        renderer.init_buffers()?;
        Ok(renderer)
    }
    
    fn init_shaders(&mut self) -> Result<(), JsValue> {
        let vertex_source = r#"#version 300 es
            precision highp float;
            
            in vec2 a_position;
            in vec2 a_tex_coord;
            
            uniform mat3 u_view_matrix;
            uniform vec2 u_canvas_size;
            
            out vec2 v_tex_coord;
            
            void main() {
                vec3 world_pos = u_view_matrix * vec3(a_position, 1.0);
                vec2 clip_pos = (world_pos.xy / u_canvas_size) * 2.0 - 1.0;
                clip_pos.y = -clip_pos.y;
                gl_Position = vec4(clip_pos, 0.0, 1.0);
                v_tex_coord = a_tex_coord;
            }
        "#;
        
        let fragment_source = r#"#version 300 es
            precision highp float;
            
            in vec2 v_tex_coord;
            
            uniform sampler2D u_texture;
            uniform vec4 u_color;
            uniform bool u_use_texture;
            
            out vec4 fragColor;
            
            void main() {
                if (u_use_texture) {
                    fragColor = texture(u_texture, v_tex_coord) * u_color;
                } else {
                    fragColor = u_color;
                }
            }
        "#;
        
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
        
        self.shader_program = Some(program);
        Ok(())
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
    
    fn init_buffers(&mut self) -> Result<(), JsValue> {
        self.vertex_buffer = Some(self.gl.create_buffer().ok_or("Failed to create vertex buffer")?);
        self.index_buffer = Some(self.gl.create_buffer().ok_or("Failed to create index buffer")?);
        Ok(())
    }
    
    pub fn clear(&self, r: f32, g: f32, b: f32, a: f32) {
        self.gl.clear_color(r, g, b, a);
        self.gl.clear(WebGlRenderingContext::COLOR_BUFFER_BIT);
    }
    
    pub fn draw_quad(&self, vertices: &[f32], tex_coords: &[f32], color: [f32; 4], use_texture: bool) -> Result<(), JsValue> {
        if let Some(program) = &self.shader_program {
            self.gl.use_program(Some(program));
            
            // Prepare vertex data: interleave position and tex coords
            let mut vertex_data = Vec::new();
            for i in 0..4 {
                vertex_data.push(vertices[i * 2]);     // x
                vertex_data.push(vertices[i * 2 + 1]); // y
                vertex_data.push(tex_coords[i * 2]);   // u
                vertex_data.push(tex_coords[i * 2 + 1]); // v
            }
            
            // Upload vertex data
            if let Some(buffer) = &self.vertex_buffer {
                self.gl.bind_buffer(WebGlRenderingContext::ARRAY_BUFFER, Some(buffer));
                unsafe {
                    let view = js_sys::Float32Array::view(&vertex_data);
                    self.gl.buffer_data_with_array_buffer_view(
                        WebGlRenderingContext::ARRAY_BUFFER,
                        &view,
                        WebGlRenderingContext::DYNAMIC_DRAW
                    );
                }
            }
            
            // Set up vertex attributes
            let position_location = self.gl.get_attrib_location(program, "a_position") as u32;
            let tex_coord_location = self.gl.get_attrib_location(program, "a_tex_coord") as u32;
            
            self.gl.enable_vertex_attrib_array(position_location);
            self.gl.vertex_attrib_pointer_with_i32(position_location, 2, WebGlRenderingContext::FLOAT, false, 16, 0);
            
            self.gl.enable_vertex_attrib_array(tex_coord_location);
            self.gl.vertex_attrib_pointer_with_i32(tex_coord_location, 2, WebGlRenderingContext::FLOAT, false, 16, 8);
            
            // Set uniforms
            let color_location = self.gl.get_uniform_location(program, "u_color");
            self.gl.uniform4f(color_location.as_ref(), color[0], color[1], color[2], color[3]);
            
            let use_texture_location = self.gl.get_uniform_location(program, "u_use_texture");
            self.gl.uniform1i(use_texture_location.as_ref(), if use_texture { 1 } else { 0 });
            
            // Set texture sampler to use texture unit 0
            if use_texture {
                let texture_location = self.gl.get_uniform_location(program, "u_texture");
                self.gl.uniform1i(texture_location.as_ref(), 0);
            }
            
            // Draw
            let indices: [u16; 6] = [0, 1, 2, 1, 3, 2];
            if let Some(buffer) = &self.index_buffer {
                self.gl.bind_buffer(WebGlRenderingContext::ELEMENT_ARRAY_BUFFER, Some(buffer));
                unsafe {
                    let view = js_sys::Uint16Array::view(&indices);
                    self.gl.buffer_data_with_array_buffer_view(
                        WebGlRenderingContext::ELEMENT_ARRAY_BUFFER,
                        &view,
                        WebGlRenderingContext::DYNAMIC_DRAW
                    );
                }
            }
            
            self.gl.draw_elements_with_i32(WebGlRenderingContext::TRIANGLES, 6, WebGlRenderingContext::UNSIGNED_SHORT, 0);
        }
        
        Ok(())
    }
    
    pub fn draw_line_strip(&self, vertices: &[f32], color: [f32; 4], line_width: f32) -> Result<(), JsValue> {
        if vertices.len() < 4 || vertices.len() % 2 != 0 { return Ok(()); }
        
        if let Some(program) = &self.shader_program {
            self.gl.use_program(Some(program));
            
            // Set line width using WebGL's built-in lineWidth
            self.gl.line_width(line_width);
            
            // Prepare vertex data with dummy tex coords
            let mut vertex_data = Vec::new();
            for i in 0..(vertices.len() / 2) {
                vertex_data.push(vertices[i * 2]);     // x
                vertex_data.push(vertices[i * 2 + 1]); // y
                vertex_data.push(0.0);                 // u
                vertex_data.push(0.0);                 // v
            }
            
            if let Some(buffer) = &self.vertex_buffer {
                self.gl.bind_buffer(WebGlRenderingContext::ARRAY_BUFFER, Some(buffer));
                unsafe {
                    let view = js_sys::Float32Array::view(&vertex_data);
                    self.gl.buffer_data_with_array_buffer_view(
                        WebGlRenderingContext::ARRAY_BUFFER,
                        &view,
                        WebGlRenderingContext::DYNAMIC_DRAW
                    );
                }
            }
            
            // Set up vertex attributes
            let position_location = self.gl.get_attrib_location(program, "a_position") as u32;
            let tex_coord_location = self.gl.get_attrib_location(program, "a_tex_coord") as u32;
            
            self.gl.enable_vertex_attrib_array(position_location);
            self.gl.vertex_attrib_pointer_with_i32(position_location, 2, WebGlRenderingContext::FLOAT, false, 16, 0);
            
            self.gl.enable_vertex_attrib_array(tex_coord_location);
            self.gl.vertex_attrib_pointer_with_i32(tex_coord_location, 2, WebGlRenderingContext::FLOAT, false, 16, 8);
            
            // Set uniforms
            let color_location = self.gl.get_uniform_location(program, "u_color");
            self.gl.uniform4f(color_location.as_ref(), color[0], color[1], color[2], color[3]);
            
            let use_texture_location = self.gl.get_uniform_location(program, "u_use_texture");
            self.gl.uniform1i(use_texture_location.as_ref(), 0);
            
            // Draw as LINE_STRIP for smooth connected lines
            self.gl.draw_arrays(WebGlRenderingContext::LINE_STRIP, 0, (vertices.len() / 2) as i32);
            
            // Reset line width to default
            self.gl.line_width(1.0);
        }
        
        Ok(())
    }
    
    pub fn draw_triangles(&self, vertices: &[f32], color: [f32; 4]) -> Result<(), JsValue> {
        if vertices.len() < 6 || vertices.len() % 2 != 0 { return Ok(()); }
        
        if let Some(program) = &self.shader_program {
            self.gl.use_program(Some(program));
            
            // Prepare vertex data with dummy tex coords
            let mut vertex_data = Vec::new();
            for i in 0..(vertices.len() / 2) {
                vertex_data.push(vertices[i * 2]);     // x
                vertex_data.push(vertices[i * 2 + 1]); // y
                vertex_data.push(0.0);                 // u
                vertex_data.push(0.0);                 // v
            }
            
            if let Some(buffer) = &self.vertex_buffer {
                self.gl.bind_buffer(WebGlRenderingContext::ARRAY_BUFFER, Some(buffer));
                unsafe {
                    let view = js_sys::Float32Array::view(&vertex_data);
                    self.gl.buffer_data_with_array_buffer_view(
                        WebGlRenderingContext::ARRAY_BUFFER,
                        &view,
                        WebGlRenderingContext::DYNAMIC_DRAW
                    );
                }
            }
            
            // Set up vertex attributes
            let position_location = self.gl.get_attrib_location(program, "a_position") as u32;
            let tex_coord_location = self.gl.get_attrib_location(program, "a_tex_coord") as u32;
            
            self.gl.enable_vertex_attrib_array(position_location);
            self.gl.vertex_attrib_pointer_with_i32(position_location, 2, WebGlRenderingContext::FLOAT, false, 16, 0);
            
            self.gl.enable_vertex_attrib_array(tex_coord_location);
            self.gl.vertex_attrib_pointer_with_i32(tex_coord_location, 2, WebGlRenderingContext::FLOAT, false, 16, 8);
            
            // Set uniforms
            let color_location = self.gl.get_uniform_location(program, "u_color");
            self.gl.uniform4f(color_location.as_ref(), color[0], color[1], color[2], color[3]);
            
            let use_texture_location = self.gl.get_uniform_location(program, "u_use_texture");
            self.gl.uniform1i(use_texture_location.as_ref(), 0);
            
            // Draw as triangles
            self.gl.draw_arrays(WebGlRenderingContext::TRIANGLES, 0, (vertices.len() / 2) as i32);
        }
        
        Ok(())
    }
    
    pub fn draw_lines(&self, vertices: &[f32], color: [f32; 4]) -> Result<(), JsValue> {
        if vertices.len() < 4 || vertices.len() % 2 != 0 { return Ok(()); }
        
        if let Some(program) = &self.shader_program {
            self.gl.use_program(Some(program));
            
            // Prepare vertex data with dummy tex coords
            let mut vertex_data = Vec::new();
            for i in 0..(vertices.len() / 2) {
                vertex_data.push(vertices[i * 2]);     // x
                vertex_data.push(vertices[i * 2 + 1]); // y
                vertex_data.push(0.0);                 // u
                vertex_data.push(0.0);                 // v
            }
            
            if let Some(buffer) = &self.vertex_buffer {
                self.gl.bind_buffer(WebGlRenderingContext::ARRAY_BUFFER, Some(buffer));
                unsafe {
                    let view = js_sys::Float32Array::view(&vertex_data);
                    self.gl.buffer_data_with_array_buffer_view(
                        WebGlRenderingContext::ARRAY_BUFFER,
                        &view,
                        WebGlRenderingContext::DYNAMIC_DRAW
                    );
                }
            }
            
            // Set up vertex attributes
            let position_location = self.gl.get_attrib_location(program, "a_position") as u32;
            let tex_coord_location = self.gl.get_attrib_location(program, "a_tex_coord") as u32;
            
            self.gl.enable_vertex_attrib_array(position_location);
            self.gl.vertex_attrib_pointer_with_i32(position_location, 2, WebGlRenderingContext::FLOAT, false, 16, 0);
            
            self.gl.enable_vertex_attrib_array(tex_coord_location);
            self.gl.vertex_attrib_pointer_with_i32(tex_coord_location, 2, WebGlRenderingContext::FLOAT, false, 16, 8);
            
            // Set uniforms
            let color_location = self.gl.get_uniform_location(program, "u_color");
            self.gl.uniform4f(color_location.as_ref(), color[0], color[1], color[2], color[3]);
            
            let use_texture_location = self.gl.get_uniform_location(program, "u_use_texture");
            self.gl.uniform1i(use_texture_location.as_ref(), 0);
            
            // Draw
            self.gl.draw_arrays(WebGlRenderingContext::LINES, 0, (vertices.len() / 2) as i32);
        }
        
        Ok(())
    }
    
    pub fn set_view_matrix(&self, matrix: &[f32; 9], canvas_size: Vec2) {
        if let Some(program) = &self.shader_program {
            self.gl.use_program(Some(program));
            
            let view_location = self.gl.get_uniform_location(program, "u_view_matrix");
            self.gl.uniform_matrix3fv_with_f32_array(view_location.as_ref(), false, matrix);
            
            let canvas_size_location = self.gl.get_uniform_location(program, "u_canvas_size");
            self.gl.uniform2f(canvas_size_location.as_ref(), canvas_size.x, canvas_size.y);
        }
    }
    
    /// Set the blend mode for the renderer based on the layer settings
    pub fn set_blend_mode(&self, blend_mode: &BlendMode) {
        let (src_factor, dst_factor) = blend_mode.to_webgl_equation();
        self.gl.blend_func(src_factor, dst_factor);
    }
    
    /// Set the layer color that will be multiplied with textures
    pub fn set_layer_color(&mut self, color: &[f32; 3]) {
        self.current_layer_color = *color;
    }
    
    /// Get the current layer color for sprite rendering
    pub fn get_layer_color(&self) -> [f32; 3] {
        self.current_layer_color
    }
    
    /// Apply layer color modulation to a sprite color
    pub fn modulate_color(&self, sprite_color: [f32; 4]) -> [f32; 4] {
        [
            sprite_color[0] * self.current_layer_color[0],
            sprite_color[1] * self.current_layer_color[1], 
            sprite_color[2] * self.current_layer_color[2],
            sprite_color[3], // Alpha remains unchanged
        ]
    }
}
