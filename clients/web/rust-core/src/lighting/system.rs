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
        let mut calc = self.visibility_calculator.borrow_mut();
        calc.clear();
        calc.add_segments_from_array(obstacles);
        drop(calc); // Release borrow
        
        self.obstacles_dirty = true;
        
        // Mark all lights dirty
        for light in self.lights.values_mut() {
            light.mark_dirty();
        }
    }

    /// Render all lights with shadow casting
    pub fn render_lights(&mut self, view_matrix: &[f32; 9], canvas_width: f32, canvas_height: f32) -> Result<(), JsValue> {
        let program = self.light_shader.as_ref().ok_or("Light shader not initialized")?;
        
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
        
        // Render each light
        let light_ids: Vec<String> = self.lights.keys().cloned().collect();
        for light_id in light_ids {
            // Get light data for rendering
            let (id, position, color, intensity, radius, falloff, cached_polygon, dirty) = {
                if let Some(light) = self.lights.get(&light_id) {
                    if !light.is_on {
                        continue;
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
        
        // Restore normal blending
        self.gl.blend_func(WebGlRenderingContext::SRC_ALPHA, WebGlRenderingContext::ONE_MINUS_SRC_ALPHA);
        
        self.obstacles_dirty = false;
        
        Ok(())
    }

    /// Render a single light with visibility polygon
    fn render_single_light(
        &self,
        program: &WebGlProgram,
        light_id: &str,
        position: Vec2,
        color: Color,
        intensity: f32,
        radius: f32,
        falloff: f32,
        cached_polygon: Option<Vec<Point>>,
        dirty: bool,
    ) -> Result<(Option<Vec<Point>>, bool), JsValue> {
        // Compute or retrieve cached visibility polygon
        let (polygon, new_dirty) = if dirty || cached_polygon.is_none() {
            let light_pos = Point::from_vec2(position);
            let poly = self.visibility_calculator.borrow_mut().compute_visibility(light_pos, radius);
            (poly, false)
        } else {
            (cached_polygon.unwrap(), false)
        };
        
        let polygon = &polygon;
        
        if polygon.len() < 3 {
            return Ok((Some(polygon.clone()), new_dirty)); // Need at least 3 points
        }
        
        // Set light-specific uniforms
        self.set_light_uniforms_explicit(program, &position, &color, intensity, radius, falloff)?;
        
        // Convert polygon to triangle fan vertices
        let vertices = self.polygon_to_vertices(polygon);
        
        // Upload vertices to GPU
        let buffer = self.vertex_buffer.as_ref().ok_or("Vertex buffer not initialized")?;
        self.gl.bind_buffer(WebGlRenderingContext::ARRAY_BUFFER, Some(buffer));
        
        unsafe {
            let vertices_array = js_sys::Float32Array::view(&vertices);
            self.gl.buffer_data_with_array_buffer_view(
                WebGlRenderingContext::ARRAY_BUFFER,
                &vertices_array,
                WebGlRenderingContext::DYNAMIC_DRAW,
            );
        }
        
        // Set up vertex attributes
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
        
        // Draw as triangle fan
        self.gl.draw_arrays(WebGlRenderingContext::TRIANGLE_FAN, 0, (vertices.len() / 2) as i32);
        
        self.gl.disable_vertex_attrib_array(position_location);
        
        Ok((Some(polygon.clone()), new_dirty))
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
    /// Triangle fan: center point + polygon vertices
    fn polygon_to_vertices(&self, polygon: &[Point]) -> Vec<f32> {
        let mut vertices = Vec::with_capacity((polygon.len() + 2) * 2);
        
        // Calculate center point (light position)
        let mut center_x = 0.0;
        let mut center_y = 0.0;
        for point in polygon {
            center_x += point.x;
            center_y += point.y;
        }
        center_x /= polygon.len() as f32;
        center_y /= polygon.len() as f32;
        
        // Center vertex
        vertices.push(center_x);
        vertices.push(center_y);
        
        // Polygon vertices
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
}
