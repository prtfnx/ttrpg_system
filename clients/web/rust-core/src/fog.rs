use wasm_bindgen::prelude::*;
use web_sys::{WebGl2RenderingContext as WebGlRenderingContext, WebGlProgram, WebGlShader};
use std::collections::HashMap;
use crate::math::Vec2;
use crate::types::Color;

#[derive(Clone, Debug)]
pub struct FogRectangle {
    pub id: String,
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
    fog_rectangles: HashMap<String, FogRectangle>,
    is_gm: bool,
}

impl FogOfWarSystem {
    pub fn new(gl: WebGlRenderingContext) -> Result<Self, JsValue> {
        let mut system = Self {
            gl,
            fog_shader: None,
            fog_rectangles: HashMap::new(),
            is_gm: false,
        };
        
        system.init_shaders()?;
        Ok(system)
    }

    fn init_shaders(&mut self) -> Result<(), JsValue> {
        // Fog rendering shader with proper alpha blending
        let fog_vertex_source = r#"#version 300 es
            precision highp float;
            
            in vec2 a_position;
            
            uniform mat3 u_view_matrix;
            uniform vec2 u_canvas_size;
            
            void main() {
                vec3 world_pos = u_view_matrix * vec3(a_position, 1.0);
                vec2 clip_pos = (world_pos.xy / u_canvas_size) * 2.0 - 1.0;
                clip_pos.y = -clip_pos.y;
                gl_Position = vec4(clip_pos, 0.0, 1.0);
            }
        "#;

        let fog_fragment_source = r#"#version 300 es
            precision highp float;
            
            uniform vec4 u_fog_color;
            uniform bool u_is_gm;
            
            out vec4 fragColor;
            
            void main() {
                if (u_is_gm) {
                    // GM sees semi-transparent gray fog
                    fragColor = vec4(0.5, 0.5, 0.5, 0.3);
                } else {
                    // Players see opaque black fog
                    fragColor = vec4(0.0, 0.0, 0.0, 1.0);
                }
            }
        "#;

        self.fog_shader = Some(self.create_program(fog_vertex_source, fog_fragment_source)?);
        
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

    pub fn add_fog_rectangle(&mut self, id: String, start_x: f32, start_y: f32, end_x: f32, end_y: f32, mode: &str) {
        let fog_mode = match mode {
            "reveal" => FogMode::Reveal,
            _ => FogMode::Hide,
        };
        
        let rectangle = FogRectangle::new(id.clone(), start_x, start_y, end_x, end_y, fog_mode);
        self.fog_rectangles.insert(id, rectangle);
    }

    pub fn remove_fog_rectangle(&mut self, id: &str) {
        self.fog_rectangles.remove(id);
    }

    pub fn clear_fog(&mut self) {
        self.fog_rectangles.clear();
    }

    pub fn hide_entire_table(&mut self, table_width: f32, table_height: f32) {
        self.clear_fog();
        self.add_fog_rectangle(
            "full_table_fog".to_string(),
            0.0, 0.0,
            table_width, table_height,
            "hide"
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

    pub fn render_fog(&self, view_matrix: &[f32; 9], canvas_width: f32, canvas_height: f32) -> Result<(), JsValue> {
        if self.fog_rectangles.is_empty() {
            return Ok(());
        }

        let program = self.fog_shader.as_ref().ok_or("Fog shader not initialized")?;
        
        // Enable alpha blending for fog overlay
        self.gl.enable(WebGlRenderingContext::BLEND);
        self.gl.blend_func(WebGlRenderingContext::SRC_ALPHA, WebGlRenderingContext::ONE_MINUS_SRC_ALPHA);
        
        self.gl.use_program(Some(program));
        
        // Set view matrix uniform
        let view_matrix_location = self.gl.get_uniform_location(program, "u_view_matrix");
        if let Some(location) = view_matrix_location {
            self.gl.uniform_matrix3fv_with_f32_array(Some(&location), false, view_matrix);
        }
        
        // Set canvas size uniform
        let canvas_size_location = self.gl.get_uniform_location(program, "u_canvas_size");
        if let Some(location) = canvas_size_location {
            self.gl.uniform2f(Some(&location), canvas_width, canvas_height);
        }
        
        // Set GM mode uniform
        let is_gm_location = self.gl.get_uniform_location(program, "u_is_gm");
        if let Some(location) = is_gm_location {
            self.gl.uniform1i(Some(&location), if self.is_gm { 1 } else { 0 });
        }
        
        // Render fog rectangles using stencil buffer approach
        self.render_fog_with_stencil(program)?;
        
        Ok(())
    }

    fn render_fog_with_stencil(&self, program: &WebGlProgram) -> Result<(), JsValue> {
        // Enable stencil testing
        self.gl.enable(WebGlRenderingContext::STENCIL_TEST);
        self.gl.clear_stencil(0);
        self.gl.clear(WebGlRenderingContext::STENCIL_BUFFER_BIT);
        
        // First pass: Render hide rectangles to stencil buffer
        self.gl.color_mask(false, false, false, false); // Don't write to color buffer
        self.gl.stencil_func(WebGlRenderingContext::ALWAYS, 1, 0xFF);
        self.gl.stencil_op(WebGlRenderingContext::KEEP, WebGlRenderingContext::KEEP, WebGlRenderingContext::REPLACE);
        
        for rectangle in self.fog_rectangles.values() {
            if rectangle.mode == FogMode::Hide {
                self.render_single_rectangle(program, rectangle)?;
            }
        }
        
        // Second pass: Subtract reveal rectangles from stencil
        self.gl.stencil_func(WebGlRenderingContext::EQUAL, 1, 0xFF);
        self.gl.stencil_op(WebGlRenderingContext::KEEP, WebGlRenderingContext::KEEP, WebGlRenderingContext::ZERO);
        
        for rectangle in self.fog_rectangles.values() {
            if rectangle.mode == FogMode::Reveal {
                self.render_single_rectangle(program, rectangle)?;
            }
        }
        
        // Final pass: Render fog color where stencil == 1
        self.gl.color_mask(true, true, true, true); // Re-enable color writes
        self.gl.stencil_func(WebGlRenderingContext::EQUAL, 1, 0xFF);
        self.gl.stencil_op(WebGlRenderingContext::KEEP, WebGlRenderingContext::KEEP, WebGlRenderingContext::KEEP);
        
        // Render full-screen quad with fog color
        self.render_fullscreen_fog(program)?;
        
        // Disable stencil testing
        self.gl.disable(WebGlRenderingContext::STENCIL_TEST);
        
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

    fn render_fullscreen_fog(&self, program: &WebGlProgram) -> Result<(), JsValue> {
        // Create full-screen quad in normalized device coordinates
        let vertices: [f32; 8] = [
            -1.0, -1.0,
            1.0, -1.0,
            1.0, 1.0,
            -1.0, 1.0,
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
        
        // Draw full-screen quad
        self.gl.draw_arrays(WebGlRenderingContext::TRIANGLE_FAN, 0, 4);
        
        self.gl.disable_vertex_attrib_array(position_location);
        
        Ok(())
    }

    pub fn get_fog_count(&self) -> usize {
        self.fog_rectangles.len()
    }

    pub fn get_fog_data(&self) -> (Vec<(f32, f32, f32, f32)>, Vec<(f32, f32, f32, f32)>) {
        let mut hide_rects = Vec::new();
        let mut reveal_rects = Vec::new();
        
        for rectangle in self.fog_rectangles.values() {
            let normalized = rectangle.normalized();
            let rect_data = (normalized.start.x, normalized.start.y, normalized.end.x, normalized.end.y);
            
            match rectangle.mode {
                FogMode::Hide => hide_rects.push(rect_data),
                FogMode::Reveal => reveal_rects.push(rect_data),
            }
        }
        
        (hide_rects, reveal_rects)
    }
}
