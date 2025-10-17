use wasm_bindgen::prelude::*;
use web_sys::{WebGl2RenderingContext as WebGlRenderingContext, WebGlProgram, WebGlShader, WebGlBuffer};
use std::collections::HashMap;
use std::cell::RefCell;
use serde::{Serialize, Deserialize};
use crate::math::Vec2;
use crate::types::Color;
use super::visibility::{VisibilityCalculator, Point};

/// Light types supported by the system
#[derive(Clone, Debug, Serialize, Deserialize)]
pub enum LightType {
    Point,
    #[allow(dead_code)]
    Spot { direction: f32, arc: f32 },
    #[allow(dead_code)]
    Area { width: f32, height: f32 },
}

/// Light source with shadow casting
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Light {
    pub id: String,
    pub table_id: String, // NEW: Associates light with specific table
    pub position: Vec2,
    pub color: Color,
    pub intensity: f32,
    pub radius: f32,
    pub falloff: f32,
    pub is_on: bool,
    pub light_type: LightType,
    
    #[serde(skip)]
    pub(crate) dirty: bool,
    
    #[serde(skip)]
    pub(crate) cached_polygon: Option<Vec<Point>>,
}

impl Light {
    pub fn new(id: String, x: f32, y: f32) -> Self {
        Self {
            id,
            table_id: "default_table".to_string(), // Default to default_table
            position: Vec2::new(x, y),
            color: Color::new(1.0, 1.0, 0.9, 1.0), // Warm white
            intensity: 1.0,
            radius: 200.0,
            falloff: 2.0,
            is_on: true,
            light_type: LightType::Point,
            dirty: true,
            cached_polygon: None,
        }
    }

    pub fn set_position(&mut self, position: Vec2) {
        if (self.position.x - position.x).abs() > 0.01 || 
           (self.position.y - position.y).abs() > 0.01 {
            self.position = position;
            self.dirty = true;
        }
    }

    pub fn set_color(&mut self, color: Color) {
        self.color = color;
    }

    pub fn set_intensity(&mut self, intensity: f32) {
        self.intensity = intensity.clamp(0.0, 2.0);
    }

    pub fn set_radius(&mut self, radius: f32) {
        let new_radius = radius.max(10.0);
        if (self.radius - new_radius).abs() > 0.01 {
            self.radius = new_radius;
            self.dirty = true;
        }
    }

    pub fn set_falloff(&mut self, falloff: f32) {
        self.falloff = falloff.clamp(0.5, 4.0);
    }

    pub fn toggle(&mut self) {
        self.is_on = !self.is_on;
    }

    fn mark_dirty(&mut self) {
        self.dirty = true;
        self.cached_polygon = None;
    }
}

/// Lighting system with shadow casting using hybrid CPU/GPU approach
pub struct LightingSystem {
    gl: WebGlRenderingContext,
    light_shader: Option<WebGlProgram>,
    lights: HashMap<String, Light>,
    visibility_calculator: RefCell<VisibilityCalculator>,
    ambient_light: f32,
    obstacles_dirty: bool,
    vertex_buffer: Option<WebGlBuffer>,
}

impl LightingSystem {
    pub fn new(gl: WebGlRenderingContext) -> Result<Self, JsValue> {
        // Verify stencil buffer is available
        let stencil_bits = gl.get_parameter(web_sys::WebGl2RenderingContext::STENCIL_BITS)
            .ok()
            .and_then(|v| v.as_f64())
            .unwrap_or(0.0) as i32;
        
        web_sys::console::log_1(&format!("[LIGHTING-DEBUG] 🎨 Stencil buffer bits: {}", stencil_bits).into());
        
        if stencil_bits == 0 {
            web_sys::console::error_1(&"[LIGHTING-DEBUG] ❌ ERROR: No stencil buffer available! Shadow casting will not work.".into());
        } else {
            web_sys::console::log_1(&"[LIGHTING-DEBUG] ✅ Stencil buffer is available".into());
        }
        
        let mut system = Self {
            gl,
            light_shader: None,
            lights: HashMap::new(),
            visibility_calculator: RefCell::new(VisibilityCalculator::new()),
            ambient_light: 0.3,
            obstacles_dirty: true,
            vertex_buffer: None,
        };
        
        system.init_shaders()?;
        system.init_buffers()?;
        
        Ok(system)
    }

    fn init_shaders(&mut self) -> Result<(), JsValue> {
        // Shader for rendering visibility polygon with radial gradient
        let vertex_source = r#"#version 300 es
            precision highp float;
            
            in vec2 a_position;
            
            uniform mat3 u_view_matrix;
            uniform vec2 u_canvas_size;
            uniform vec2 u_light_pos;
            
            out vec2 v_light_coord;
            
            void main() {
                vec3 world_pos = u_view_matrix * vec3(a_position, 1.0);
                vec2 clip_pos = (world_pos.xy / u_canvas_size) * 2.0 - 1.0;
                clip_pos.y = -clip_pos.y;
                gl_Position = vec4(clip_pos, 0.0, 1.0);
                
                // Distance from light center for gradient
                v_light_coord = a_position - u_light_pos;
            }
        "#;

        let fragment_source = r#"#version 300 es
            precision highp float;
            
            in vec2 v_light_coord;
            
            uniform vec3 u_light_color;
            uniform float u_light_intensity;
            uniform float u_light_radius;
            uniform float u_light_falloff;
            
            out vec4 fragColor;
            
            void main() {
                float distance = length(v_light_coord);
                float normalized_dist = distance / u_light_radius;
                
                // Smooth falloff curve
                float attenuation = pow(max(0.0, 1.0 - normalized_dist), u_light_falloff);
                
                vec3 light_contribution = u_light_color * u_light_intensity * attenuation;
                
                fragColor = vec4(light_contribution, attenuation * 0.8);
            }
        "#;

        self.light_shader = Some(self.create_program(vertex_source, fragment_source)?);
        
        Ok(())
    }

    fn init_buffers(&mut self) -> Result<(), JsValue> {
        self.vertex_buffer = Some(
            self.gl.create_buffer()
                .ok_or("Failed to create vertex buffer")?
        );
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

    /// Add a new light source
    pub fn add_light(&mut self, light: Light) {
        self.lights.insert(light.id.clone(), light);
    }

    /// Remove a light source
    pub fn remove_light(&mut self, light_id: &str) {
        self.lights.remove(light_id);
    }

    /// Get mutable reference to light
    pub fn get_light_mut(&mut self, light_id: &str) -> Option<&mut Light> {
        self.lights.get_mut(light_id)
    }

    /// Get immutable reference to light
    pub fn get_light(&self, light_id: &str) -> Option<&Light> {
        self.lights.get(light_id)
    }

    /// Update light position
    pub fn update_light_position(&mut self, light_id: &str, position: Vec2) {
        if let Some(light) = self.lights.get_mut(light_id) {
            light.set_position(position);
        }
    }

    /// Set obstacles for shadow casting
    pub fn set_obstacles(&mut self, obstacles: &[f32]) {
        web_sys::console::log_1(&format!("[LIGHTING-DEBUG] 📥 Received {} floats = {} segments", 
            obstacles.len(), obstacles.len() / 4).into());
        
        let mut calc = self.visibility_calculator.borrow_mut();
        calc.clear();
        calc.add_segments_from_array(obstacles);
        
        let segment_count = calc.get_segments().len();
        web_sys::console::log_1(&format!("[LIGHTING-DEBUG] 📐 VisibilityCalculator now has {} segments", 
            segment_count).into());
        
        drop(calc); // Release borrow
        
        self.obstacles_dirty = true;
        
        // Mark all lights dirty
        for light in self.lights.values_mut() {
            light.mark_dirty();
        }
    }

    /// Render all lights with shadow casting
    /// Strategy: Render full light circle, then subtract shadow volumes
    pub fn render_lights(&mut self, view_matrix: &[f32; 9], canvas_width: f32, canvas_height: f32) -> Result<(), JsValue> {
        // Default: render all lights (backwards compatibility)
        self.render_lights_filtered(view_matrix, canvas_width, canvas_height, None)
    }
    
    /// Render lights filtered by table_id
    pub fn render_lights_filtered(&mut self, view_matrix: &[f32; 9], canvas_width: f32, canvas_height: f32, table_id: Option<&str>) -> Result<(), JsValue> {
        let program = self.light_shader.as_ref().ok_or("Light shader not initialized")?;
        
        // Enable stencil test for shadow masking
        self.gl.enable(WebGlRenderingContext::STENCIL_TEST);
        self.gl.stencil_mask(0xFF); // Enable writing all stencil bits
        self.gl.clear_stencil(0);
        self.gl.clear(WebGlRenderingContext::STENCIL_BUFFER_BIT);
        
        web_sys::console::log_1(&"[STENCIL-DEBUG] 🎭 Stencil buffer enabled and cleared".into());
        
        // Enable additive blending for light accumulation
        self.gl.enable(WebGlRenderingContext::BLEND);
        self.gl.blend_func(WebGlRenderingContext::ONE, WebGlRenderingContext::ONE);
        
        self.gl.use_program(Some(program));
        
        // Set common uniforms
        let view_matrix_location = self.gl.get_uniform_location(program, "u_view_matrix");
        if let Some(location) = view_matrix_location {
            self.gl.uniform_matrix3fv_with_f32_array(Some(&location), false, view_matrix);
        }
        
        let canvas_size_location = self.gl.get_uniform_location(program, "u_canvas_size");
        if let Some(location) = canvas_size_location {
            self.gl.uniform2f(Some(&location), canvas_width, canvas_height);
        }
        
        // Render each light (filtered by table_id if specified)
        let light_ids: Vec<String> = self.lights.keys().cloned().collect();
        for light_id in light_ids {
            // Get light data for rendering
            let (id, position, color, intensity, radius, falloff, cached_polygon, dirty, light_table_id) = {
                if let Some(light) = self.lights.get(&light_id) {
                    if !light.is_on {
                        continue;
                    }
                    
                    // Filter by table_id if specified
                    if let Some(filter_table_id) = table_id {
                        if light.table_id != filter_table_id {
                            continue; // Skip lights not belonging to active table
                        }
                    }
                    
                    (
                        light.id.clone(),
                        light.position,
                        light.color.clone(),
                        light.intensity,
                        light.radius,
                        light.falloff,
                        light.cached_polygon.clone(),
                        light.dirty,
                        light.table_id.clone(),
                    )
                } else {
                    continue;
                }
            };
            
            // Render light (immutable borrow of self)
            let (new_polygon, new_dirty) = self.render_single_light(
                program,
                &id,
                position,
                color,
                intensity,
                radius,
                falloff,
                cached_polygon,
                dirty,
            )?;
            
            // Update light state
            if let Some(light) = self.lights.get_mut(&light_id) {
                light.cached_polygon = new_polygon;
                light.dirty = new_dirty;
            }
        }
        
        // Restore normal blending and disable stencil test
        self.gl.blend_func(WebGlRenderingContext::SRC_ALPHA, WebGlRenderingContext::ONE_MINUS_SRC_ALPHA);
        self.gl.disable(WebGlRenderingContext::STENCIL_TEST);
        
        web_sys::console::log_1(&"[STENCIL-DEBUG] 🎭 Stencil test disabled, rendering complete".into());
        
        self.obstacles_dirty = false;
        
        Ok(())
    }

    /// Render a single light with shadow casting
    /// CORRECTED APPROACH: Stencil buffer marks SHADOW areas, light renders everywhere EXCEPT shadows
    /// Best practice: Shadow geometry - project obstacles away from light to create shadow quads
    fn render_single_light(
        &self,
        program: &WebGlProgram,
        _light_id: &str,
        position: Vec2,
        color: Color,
        intensity: f32,
        radius: f32,
        falloff: f32,
        _cached_polygon: Option<Vec<Point>>,
        _dirty: bool,
    ) -> Result<(Option<Vec<Point>>, bool), JsValue> {
        // Check if light is inside an opaque obstacle
        if self.is_light_occluded(position) {
            web_sys::console::log_1(&format!("[LIGHTING-DEBUG] 🚫 Light at ({:.1}, {:.1}) is inside obstacle, skipping render", 
                position.x, position.y).into());
            return Ok((None, false));
        }
        
        // Set light-specific uniforms
        self.set_light_uniforms_explicit(program, &position, &color, intensity, radius, falloff)?;
        
        // CORRECTED APPROACH: Use stencil buffer to BLOCK shadows
        // 1. Render shadow quads to stencil buffer (mark as 1 where shadows are)
        // 2. Render full light circle where stencil = 0 (NOT in shadow)
        
        // Step 1: Compute and render shadow quads to stencil
        let shadow_quads = self.compute_shadow_quads(position, radius);
        
        web_sys::console::log_1(&format!("[STENCIL-DEBUG] 🌑 Computing shadows for light at ({:.1}, {:.1}), found {} shadow quads", 
            position.x, position.y, shadow_quads.len()).into());
        
        if !shadow_quads.is_empty() {
            // Write shadows to stencil (set to 1)
            self.gl.stencil_func(WebGlRenderingContext::ALWAYS, 1, 0xFF);
            self.gl.stencil_op(WebGlRenderingContext::KEEP, WebGlRenderingContext::KEEP, WebGlRenderingContext::REPLACE);
            self.gl.stencil_mask(0xFF); // Ensure stencil can be written
            self.gl.color_mask(false, false, false, false); // Don't write color, only stencil
            
            web_sys::console::log_1(&"[STENCIL-DEBUG] 🎭 Stencil setup: ALWAYS pass, REPLACE with 1, color mask OFF".into());
            
            // Render each shadow quad as triangle strip
            for (i, quad) in shadow_quads.iter().enumerate() {
                if quad.len() == 4 {
                    let shadow_vertices = self.quad_to_vertices(quad);
                    web_sys::console::log_1(&format!("[STENCIL-DEBUG] 🌑 Drawing shadow quad {} with {} vertices", 
                        i, shadow_vertices.len() / 2).into());
                    self.upload_and_draw_triangle_strip(&shadow_vertices, program)?;
                }
            }
            
            // Re-enable color writing
            self.gl.color_mask(true, true, true, true);
            web_sys::console::log_1(&"[STENCIL-DEBUG] ✅ Shadow quads written to stencil, color mask restored".into());
        }
        
        // Step 2: Render full light circle where stencil = 0 (not shadowed)
        self.gl.stencil_func(WebGlRenderingContext::EQUAL, 0, 0xFF);
        self.gl.stencil_op(WebGlRenderingContext::KEEP, WebGlRenderingContext::KEEP, WebGlRenderingContext::KEEP);
        self.gl.stencil_mask(0x00); // Don't modify stencil during light rendering
        
        web_sys::console::log_1(&"[STENCIL-DEBUG] 💡 Rendering light circle where stencil = 0 (not in shadow)".into());
        
        // Render full light circle (only where NOT in shadow)
        let circle = self.generate_circle(position, radius);
        let circle_vertices = self.polygon_to_vertices_from_light(&circle, position);
        self.upload_and_draw_vertices(&circle_vertices, program)?;
        
        web_sys::console::log_1(&format!("[STENCIL-DEBUG] ✅ Light circle drawn with {} vertices", circle_vertices.len() / 2).into());
        
        // Reset stencil state
        self.gl.stencil_func(WebGlRenderingContext::ALWAYS, 0, 0xFF);
        self.gl.stencil_mask(0xFF);
        
        Ok((None, false))
    }

    /// Helper to upload vertices and draw triangle fan
    fn upload_and_draw_vertices(&self, vertices: &[f32], program: &WebGlProgram) -> Result<(), JsValue> {
        let buffer = self.vertex_buffer.as_ref().ok_or("Vertex buffer not initialized")?;
        self.gl.bind_buffer(WebGlRenderingContext::ARRAY_BUFFER, Some(buffer));
        
        unsafe {
            let vertices_array = js_sys::Float32Array::view(vertices);
            self.gl.buffer_data_with_array_buffer_view(
                WebGlRenderingContext::ARRAY_BUFFER,
                &vertices_array,
                WebGlRenderingContext::DYNAMIC_DRAW,
            );
        }
        
        let position_location = self.gl.get_attrib_location(program, "a_position") as u32;
        self.gl.enable_vertex_attrib_array(position_location);
        self.gl.vertex_attrib_pointer_with_i32(
            position_location,
            2,
            WebGlRenderingContext::FLOAT,
            false,
            0,
            0,
        );
        
        self.gl.draw_arrays(WebGlRenderingContext::TRIANGLE_FAN, 0, (vertices.len() / 2) as i32);
        self.gl.disable_vertex_attrib_array(position_location);
        
        Ok(())
    }

    /// Helper to upload vertices and draw triangle strip (for shadow quads)
    fn upload_and_draw_triangle_strip(&self, vertices: &[f32], program: &WebGlProgram) -> Result<(), JsValue> {
        let buffer = self.vertex_buffer.as_ref().ok_or("Vertex buffer not initialized")?;
        self.gl.bind_buffer(WebGlRenderingContext::ARRAY_BUFFER, Some(buffer));
        
        unsafe {
            let vertices_array = js_sys::Float32Array::view(vertices);
            self.gl.buffer_data_with_array_buffer_view(
                WebGlRenderingContext::ARRAY_BUFFER,
                &vertices_array,
                WebGlRenderingContext::DYNAMIC_DRAW,
            );
        }
        
        let position_location = self.gl.get_attrib_location(program, "a_position") as u32;
        self.gl.enable_vertex_attrib_array(position_location);
        self.gl.vertex_attrib_pointer_with_i32(
            position_location,
            2,
            WebGlRenderingContext::FLOAT,
            false,
            0,
            0,
        );
        
        self.gl.draw_arrays(WebGlRenderingContext::TRIANGLE_STRIP, 0, (vertices.len() / 2) as i32);
        self.gl.disable_vertex_attrib_array(position_location);
        
        Ok(())
    }

    /// Convert shadow quad to vertex array for triangle strip
    fn quad_to_vertices(&self, quad: &[Point]) -> Vec<f32> {
        let mut vertices = Vec::with_capacity(8);
        for point in quad {
            vertices.push(point.x);
            vertices.push(point.y);
        }
        vertices
    }

    /// Set uniforms for specific light
    fn set_light_uniforms_explicit(
        &self,
        program: &WebGlProgram,
        position: &Vec2,
        color: &Color,
        intensity: f32,
        radius: f32,
        falloff: f32,
    ) -> Result<(), JsValue> {
        if let Some(location) = self.gl.get_uniform_location(program, "u_light_pos") {
            self.gl.uniform2f(Some(&location), position.x, position.y);
        }
        
        if let Some(location) = self.gl.get_uniform_location(program, "u_light_radius") {
            self.gl.uniform1f(Some(&location), radius);
        }
        
        if let Some(location) = self.gl.get_uniform_location(program, "u_light_color") {
            self.gl.uniform3f(Some(&location), color.r, color.g, color.b);
        }
        
        if let Some(location) = self.gl.get_uniform_location(program, "u_light_intensity") {
            self.gl.uniform1f(Some(&location), intensity);
        }
        
        if let Some(location) = self.gl.get_uniform_location(program, "u_light_falloff") {
            self.gl.uniform1f(Some(&location), falloff);
        }
        
        Ok(())
    }

    /// Convert visibility polygon to vertex array for triangle fan
    /// Triangle fan: light position as center + polygon vertices forming the lit area
    fn polygon_to_vertices_from_light(&self, polygon: &[Point], light_position: Vec2) -> Vec<f32> {
        let mut vertices = Vec::with_capacity((polygon.len() + 2) * 2);
        
        // Center vertex MUST be the light position, not the polygon centroid!
        // This is critical for correct shadow rendering
        vertices.push(light_position.x);
        vertices.push(light_position.y);
        
        // Polygon vertices form the perimeter of the lit area
        for point in polygon {
            vertices.push(point.x);
            vertices.push(point.y);
        }
        
        // Close the fan
        if !polygon.is_empty() {
            vertices.push(polygon[0].x);
            vertices.push(polygon[0].y);
        }
        
        vertices
    }

    /// Generate circle polygon for full light rendering
    fn generate_circle(&self, center: Vec2, radius: f32) -> Vec<Point> {
        const SEGMENTS: usize = 64;
        let mut points = Vec::with_capacity(SEGMENTS);
        use std::f32::consts::PI;
        
        for i in 0..SEGMENTS {
            let angle = (i as f32 / SEGMENTS as f32) * 2.0 * PI;
            points.push(Point::new(
                center.x + radius * angle.cos(),
                center.y + radius * angle.sin(),
            ));
        }
        
        points
    }

    /// Compute shadow quads from obstacles (for subtractive shadow rendering)
    /// Each obstacle edge that faces away from light casts a shadow quad
    /// This is the standard "shadow geometry" approach for 2D lighting
    fn compute_shadow_quads(&self, light_pos: Vec2, radius: f32) -> Vec<Vec<Point>> {
        let calc = self.visibility_calculator.borrow();
        let mut shadow_quads = Vec::new();
        
        let segment_count = calc.get_segments().len();
        web_sys::console::log_1(&format!("[LIGHTING-DEBUG] 🌑 Computing shadows for light at ({:.1}, {:.1}) with radius {:.1}, {} segments available", 
            light_pos.x, light_pos.y, radius, segment_count).into());
        
        if segment_count == 0 {
            web_sys::console::warn_1(&"[LIGHTING-DEBUG] ⚠️ WARNING: No segments for shadow casting!".into());
            return shadow_quads;
        }
        
        let mut back_facing_count = 0;
        let mut front_facing_count = 0;
        
        for segment in calc.get_segments() {
            // Segment direction vector
            let seg_dx = segment.p2.x - segment.p1.x;
            let seg_dy = segment.p2.y - segment.p1.y;
            
            // Segment normal (perpendicular vector, rotate 90° counter-clockwise)
            let normal_x = -seg_dy;
            let normal_y = seg_dx;
            
            // Vector from segment start to light
            let to_light_x = light_pos.x - segment.p1.x;
            let to_light_y = light_pos.y - segment.p1.y;
            
            // Dot product: negative = back-facing (segment faces away from light, should cast shadow)
            // This is geometrically correct: tests if the segment's outward normal points away from light
            let faces_light = normal_x * to_light_x + normal_y * to_light_y;
            
            if faces_light < 0.0 {  // Back-facing segments cast shadows
                back_facing_count += 1;
                // Project segment endpoints away from light to create shadow quad
                // Use a very large shadow length to ensure shadows extend beyond visible area
                // This prevents light leaking when light source is very close to obstacle edges
                let shadow_length = 10000.0; // Large enough to cover entire screen
                
                // Direction from light to each endpoint
                let dir1_x = segment.p1.x - light_pos.x;
                let dir1_y = segment.p1.y - light_pos.y;
                let len1 = (dir1_x * dir1_x + dir1_y * dir1_y).sqrt();
                
                let dir2_x = segment.p2.x - light_pos.x;
                let dir2_y = segment.p2.y - light_pos.y;
                let len2 = (dir2_x * dir2_x + dir2_y * dir2_y).sqrt();
                
                if len1 > 0.01 && len2 > 0.01 {
                    // Normalize and extend
                    let norm1_x = dir1_x / len1;
                    let norm1_y = dir1_y / len1;
                    let norm2_x = dir2_x / len2;
                    let norm2_y = dir2_y / len2;
                    
                    // Shadow quad vertices (CORRECT order for triangle strip)
                    // Triangle strip order: v0, v1, v2, v3 creates triangles (v0,v1,v2) and (v1,v2,v3)
                    // We want: (p1, proj_p1, p2) and (proj_p1, p2, proj_p2)
                    let projected_p1 = Point::new(
                        segment.p1.x + norm1_x * shadow_length, 
                        segment.p1.y + norm1_y * shadow_length
                    );
                    let projected_p2 = Point::new(
                        segment.p2.x + norm2_x * shadow_length, 
                        segment.p2.y + norm2_y * shadow_length
                    );
                    
                    let quad = vec![
                        segment.p1.clone(),      // v0: segment start
                        projected_p1,            // v1: projected start (forms diagonal)
                        segment.p2.clone(),      // v2: segment end
                        projected_p2,            // v3: projected end
                    ];
                    
                    shadow_quads.push(quad);
                }
            } else {
                front_facing_count += 1;
            }
        }
    
    web_sys::console::log_1(&format!("[LIGHTING-DEBUG] 🌑 Segment analysis: {} back-facing (casting shadows), {} front-facing (lit)", 
        back_facing_count, front_facing_count).into());
    web_sys::console::log_1(&format!("[LIGHTING-DEBUG] 🌑 Generated {} shadow quads", shadow_quads.len()).into());
    
    shadow_quads
}

    /// Check if a light position is inside an opaque obstacle
    /// Uses ray-casting algorithm for point-in-polygon test
    fn is_light_occluded(&self, light_pos: Vec2) -> bool {
        let calc = self.visibility_calculator.borrow();
        let segments = calc.get_segments();
        
        if segments.is_empty() {
            return false;
        }
        
        // Build polygons from connected segments (assuming obstacles form closed rectangles)
        // For a simple rectangle, we'll check if the point is inside by counting ray intersections
        
        // Ray-casting algorithm: cast a ray from the point to infinity
        // Count how many times it crosses polygon edges
        // Odd = inside, Even = outside
        
        let ray_end_x = light_pos.x + 10000.0; // Ray goes far to the right
        let ray_end_y = light_pos.y;
        
        let mut intersections = 0;
        
        for segment in segments {
            // Check if ray intersects this segment
            let x1 = segment.p1.x;
            let y1 = segment.p1.y;
            let x2 = segment.p2.x;
            let y2 = segment.p2.y;
            
            // Check if segment crosses the horizontal ray
            if (y1 > light_pos.y) != (y2 > light_pos.y) {
                // Calculate x coordinate of intersection
                let x_intersect = x1 + (light_pos.y - y1) * (x2 - x1) / (y2 - y1);
                
                // Count intersection if it's to the right of the point
                if x_intersect > light_pos.x {
                    intersections += 1;
                }
            }
        }
        
        // Odd number of intersections = point is inside
        let is_occluded = intersections % 2 == 1;
        
        if is_occluded {
            web_sys::console::log_1(&format!("[LIGHTING-DEBUG] 🚫 Light occluded at ({:.1}, {:.1}): {} ray intersections", 
                light_pos.x, light_pos.y, intersections).into());
        }
        
        is_occluded
    }

    /// Get light at position (for mouse interaction)
    pub fn get_light_at_position(&self, world_pos: Vec2, tolerance: f32) -> Option<&String> {
        self.lights.iter()
            .find(|(_, light)| {
                let dx = world_pos.x - light.position.x;
                let dy = world_pos.y - light.position.y;
                let distance_squared = dx * dx + dy * dy;
                let click_radius = tolerance.max(20.0);
                distance_squared <= click_radius * click_radius
            })
            .map(|(id, _)| id)
    }

    /// Get light position
    pub fn get_light_position(&self, light_id: &str) -> Option<Vec2> {
        self.lights.get(light_id).map(|light| light.position)
    }

    /// Get light radius
    pub fn get_light_radius(&self, light_id: &str) -> Option<f32> {
        self.lights.get(light_id).map(|light| light.radius)
    }

    /// Turn all lights on
    pub fn turn_on_all(&mut self) {
        for light in self.lights.values_mut() {
            light.is_on = true;
        }
    }

    /// Turn all lights off
    pub fn turn_off_all(&mut self) {
        for light in self.lights.values_mut() {
            light.is_on = false;
        }
    }

    /// Get light count
    pub fn get_light_count(&self) -> usize {
        self.lights.len()
    }

    /// Clear all lights
    pub fn clear_lights(&mut self) {
        self.lights.clear();
    }

    /// Get all lights
    pub fn get_all_lights(&self) -> Vec<(&String, &Light)> {
        self.lights.iter().collect()
    }

    /// Set ambient light level
    pub fn set_ambient_light(&mut self, level: f32) {
        self.ambient_light = level.clamp(0.0, 1.0);
    }

    /// Get ambient light level
    pub fn get_ambient_light(&self) -> f32 {
        self.ambient_light
    }
    
    // ===== TABLE-BASED OPTIMIZATION METHODS =====
    
    /// Count lights per table
    pub fn count_lights_by_table(&self) -> std::collections::HashMap<String, usize> {
        let mut counts = std::collections::HashMap::new();
        for light in self.lights.values() {
            *counts.entry(light.table_id.clone()).or_insert(0) += 1;
        }
        counts
    }
    
    /// Get light count for specific table only
    pub fn count_lights_for_table(&self, table_id: &str) -> usize {
        self.lights.values().filter(|light| light.table_id == table_id).count()
    }
    
    /// Remove all lights not belonging to the specified table (optimization)
    pub fn remove_lights_not_in_table(&mut self, table_id: &str) -> usize {
        let before_count = self.lights.len();
        self.lights.retain(|_, light| light.table_id == table_id);
        before_count - self.lights.len()
    }
    
    /// Clear all lights from a specific table
    pub fn clear_lights_for_table(&mut self, table_id: &str) -> usize {
        let before_count = self.lights.len();
        self.lights.retain(|_, light| light.table_id != table_id);
        before_count - self.lights.len()
    }
}
