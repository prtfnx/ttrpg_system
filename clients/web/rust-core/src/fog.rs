use wasm_bindgen::prelude::*;
use web_sys::{WebGl2RenderingContext as WebGlRenderingContext, WebGlProgram, WebGlShader};
use std::collections::HashMap;
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
            table_id: "default_table".to_string(), // Default to default_table
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
    table_bounds: Option<(f32, f32, f32, f32)>, // (x, y, width, height)
}

impl FogOfWarSystem {
    pub fn new(gl: WebGlRenderingContext) -> Result<Self, JsValue> {
        let mut system = Self {
            gl,
            fog_shader: None,
            fog_rectangles: HashMap::new(),
            is_gm: false,
            table_bounds: None,
        };
        
        system.init_shaders()?;
        Ok(system)
    }
    
    pub fn set_table_bounds(&mut self, x: f32, y: f32, width: f32, height: f32) {
        self.table_bounds = Some((x, y, width, height));
        web_sys::console::log_1(&format!(
            "[FOG-INIT] Table bounds set: origin=({}, {}), size={}x{}", 
            x, y, width, height
        ).into());
    }

    fn init_shaders(&mut self) -> Result<(), JsValue> {
        // Fog rendering shader with proper alpha blending
        // Input: world coordinates, Output: screen coordinates
        let fog_vertex_source = r#"#version 300 es
            precision highp float;
            
            in vec2 a_position;  // World coordinates
            
            uniform mat3 u_view_matrix;  // Camera transform
            uniform vec2 u_canvas_size;  // Canvas size in pixels
            
            void main() {
                // Transform world coords to view space
                vec3 view_pos = u_view_matrix * vec3(a_position, 1.0);
                
                // Convert to normalized device coordinates (-1 to 1)
                vec2 ndc = (view_pos.xy / u_canvas_size) * 2.0 - 1.0;
                ndc.y = -ndc.y;  // Flip Y axis
                
                gl_Position = vec4(ndc, 0.0, 1.0);
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
        
        // Clamp coordinates to table bounds if table bounds are set
        let (clamped_start_x, clamped_start_y, clamped_end_x, clamped_end_y) = if let Some((tx, ty, tw, th)) = self.table_bounds {
            let clamped_sx = start_x.clamp(tx, tx + tw);
            let clamped_sy = start_y.clamp(ty, ty + th);
            let clamped_ex = end_x.clamp(tx, tx + tw);
            let clamped_ey = end_y.clamp(ty, ty + th);
            
            if start_x != clamped_sx || start_y != clamped_sy || end_x != clamped_ex || end_y != clamped_ey {
                web_sys::console::log_1(&format!(
                    "[FOG] Coordinates clamped to table: ({}, {}) → ({}, {}) became ({}, {}) → ({}, {})",
                    start_x, start_y, end_x, end_y, clamped_sx, clamped_sy, clamped_ex, clamped_ey
                ).into());
            }
            
            (clamped_sx, clamped_sy, clamped_ex, clamped_ey)
        } else {
            (start_x, start_y, end_x, end_y)
        };
        
        web_sys::console::log_1(&format!(
            "[FOG] Adding fog rectangle: {} ({}, {}) → ({}, {}) mode: {}", 
            id, clamped_start_x, clamped_start_y, clamped_end_x, clamped_end_y, mode
        ).into());
        
        let rectangle = FogRectangle::new(id.clone(), clamped_start_x, clamped_start_y, clamped_end_x, clamped_end_y, fog_mode);
        self.fog_rectangles.insert(id, rectangle);
        
        web_sys::console::log_1(&format!("[FOG] Total fog rectangles: {}", self.fog_rectangles.len()).into());
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
        // Default: render all fog (backwards compatibility)
        self.render_fog_filtered(view_matrix, canvas_width, canvas_height, None)
    }
    
    pub fn render_fog_filtered(&self, view_matrix: &[f32; 9], canvas_width: f32, canvas_height: f32, table_id: Option<&str>) -> Result<(), JsValue> {
        if self.fog_rectangles.is_empty() {
            return Ok(());
        }

        web_sys::console::log_1(&format!("Rendering {} fog rectangles", self.fog_rectangles.len()).into());

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
        
        web_sys::console::log_1(&"[FOG-DEBUG] 🌫️ Rendering fog rectangles directly (no stencil)".into());
        
        // Render fog rectangles directly (filtered by table_id if specified)
        for (i, rectangle) in self.fog_rectangles.values().enumerate() {
            // Filter by table_id if specified
            if let Some(filter_table_id) = table_id {
                if rectangle.table_id != filter_table_id {
                    continue; // Skip fog not belonging to active table
                }
            }
            
            if rectangle.mode == FogMode::Hide {
                web_sys::console::log_1(&format!("[FOG-DEBUG] 🌫️ Drawing fog rectangle {} at ({}, {}) to ({}, {})", 
                    i, rectangle.start.x, rectangle.start.y, rectangle.end.x, rectangle.end.y).into());
                self.render_single_rectangle(program, rectangle)?;
            }
        }
        
        web_sys::console::log_1(&"[FOG-DEBUG] 🌫️ Fog rendering complete".into());
        
        Ok(())
    }

    fn render_fog_with_stencil(&self, program: &WebGlProgram) -> Result<(), JsValue> {
        // Enable stencil testing
        self.gl.enable(WebGlRenderingContext::STENCIL_TEST);
        self.gl.clear_stencil(0);
        self.gl.clear(WebGlRenderingContext::STENCIL_BUFFER_BIT);
        
        web_sys::console::log_1(&"Starting stencil rendering pass".into());
        
        // First pass: Render hide rectangles to stencil buffer
        self.gl.color_mask(false, false, false, false); // Don't write to color buffer
        self.gl.stencil_func(WebGlRenderingContext::ALWAYS, 1, 0xFF);
        self.gl.stencil_op(WebGlRenderingContext::KEEP, WebGlRenderingContext::KEEP, WebGlRenderingContext::REPLACE);
        
        let mut hide_count = 0;
        for rectangle in self.fog_rectangles.values() {
            if rectangle.mode == FogMode::Hide {
                hide_count += 1;
                self.render_single_rectangle(program, rectangle)?;
            }
        }
        web_sys::console::log_1(&format!("Rendered {} hide rectangles to stencil", hide_count).into());
        
        // Second pass: Subtract reveal rectangles from stencil
        self.gl.stencil_func(WebGlRenderingContext::EQUAL, 1, 0xFF);
        self.gl.stencil_op(WebGlRenderingContext::KEEP, WebGlRenderingContext::KEEP, WebGlRenderingContext::ZERO);
        
        let mut reveal_count = 0;
        for rectangle in self.fog_rectangles.values() {
            if rectangle.mode == FogMode::Reveal {
                reveal_count += 1;
                self.render_single_rectangle(program, rectangle)?;
            }
        }
        web_sys::console::log_1(&format!("Rendered {} reveal rectangles to stencil", reveal_count).into());
        
        // Final pass: Render fog color where stencil == 1
        self.gl.color_mask(true, true, true, true); // Re-enable color writes
        self.gl.stencil_func(WebGlRenderingContext::EQUAL, 1, 0xFF);
        self.gl.stencil_op(WebGlRenderingContext::KEEP, WebGlRenderingContext::KEEP, WebGlRenderingContext::KEEP);
        
        web_sys::console::log_1(&"Rendering fullscreen fog overlay".into());
        // Render full-screen quad with fog color
        self.render_fullscreen_fog(program)?;
        web_sys::console::log_1(&"Fog stencil rendering complete".into());
        
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
