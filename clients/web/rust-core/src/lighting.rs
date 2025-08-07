use wasm_bindgen::prelude::*;
use web_sys::{WebGl2RenderingContext as WebGlRenderingContext, WebGlProgram, WebGlShader};
use std::collections::HashMap;
use crate::math::Vec2;
use crate::types::Color;

#[derive(Clone, Debug)]
pub struct Light {
    pub id: String,
    pub position: Vec2,
    pub color: Color,
    pub intensity: f32,
    pub radius: f32,
    pub falloff: f32,
    pub is_on: bool,
    pub sprite_id: Option<String>,
}

impl Light {
    pub fn new(id: String, x: f32, y: f32) -> Self {
        Self {
            id,
            position: Vec2::new(x, y),
            color: Color::new(1.0, 1.0, 1.0, 1.0),
            intensity: 1.0,
            radius: 200.0,
            falloff: 1.0,
            is_on: true,
            sprite_id: None,
        }
    }

    pub fn set_color(&mut self, r: f32, g: f32, b: f32, a: f32) {
        self.color = Color::new(r, g, b, a);
    }

    pub fn set_color_struct(&mut self, color: Color) {
        self.color = color;
    }

    pub fn set_intensity(&mut self, intensity: f32) {
        self.intensity = intensity.clamp(0.0, 1.0);
    }

    pub fn set_radius(&mut self, radius: f32) {
        self.radius = radius.max(0.0);
    }

    pub fn set_falloff(&mut self, falloff: f32) {
        self.falloff = falloff.max(0.1);
    }

    pub fn toggle(&mut self) {
        self.is_on = !self.is_on;
    }

    pub fn attach_to_sprite(&mut self, sprite_id: String) {
        self.sprite_id = Some(sprite_id);
    }
}

pub struct LightingSystem {
    gl: WebGlRenderingContext,
    light_shader: Option<WebGlProgram>,
    lights: HashMap<String, Light>,
}

impl LightingSystem {
    pub fn new(gl: WebGlRenderingContext) -> Result<Self, JsValue> {
        let mut system = Self {
            gl,
            light_shader: None,
            lights: HashMap::new(),
        };
        
        system.init_shaders()?;
        Ok(system)
    }

    fn init_shaders(&mut self) -> Result<(), JsValue> {
        // Light rendering shader with additive blending
        let light_vertex_source = r#"#version 300 es
            precision highp float;
            
            in vec2 a_position;
            
            uniform mat3 u_view_matrix;
            uniform vec2 u_canvas_size;
            uniform vec2 u_light_pos;
            uniform float u_light_radius;
            
            out vec2 v_light_coord;
            
            void main() {
                vec3 world_pos = u_view_matrix * vec3(a_position, 1.0);
                vec2 clip_pos = (world_pos.xy / u_canvas_size) * 2.0 - 1.0;
                clip_pos.y = -clip_pos.y;
                gl_Position = vec4(clip_pos, 0.0, 1.0);
                
                v_light_coord = (world_pos.xy - u_light_pos) / u_light_radius;
            }
        "#;

        let light_fragment_source = r#"#version 300 es
            precision highp float;
            
            in vec2 v_light_coord;
            
            uniform vec3 u_light_color;
            uniform float u_light_intensity;
            uniform float u_light_falloff;
            
            out vec4 fragColor;
            
            void main() {
                float distance = length(v_light_coord);
                
                if (distance > 1.0) {
                    discard;
                }
                
                // Smooth falloff with configurable curve
                float attenuation = pow(1.0 - distance, u_light_falloff);
                vec3 light_contribution = u_light_color * u_light_intensity * attenuation;
                
                fragColor = vec4(light_contribution, attenuation);
            }
        "#;

        self.light_shader = Some(self.create_program(light_vertex_source, light_fragment_source)?);
        
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

    pub fn add_light(&mut self, light: Light) {
        self.lights.insert(light.id.clone(), light);
    }

    pub fn remove_light(&mut self, light_id: &str) {
        self.lights.remove(light_id);
    }

    pub fn get_light_mut(&mut self, light_id: &str) -> Option<&mut Light> {
        self.lights.get_mut(light_id)
    }

    pub fn update_light_position(&mut self, light_id: &str, position: Vec2) {
        if let Some(light) = self.lights.get_mut(light_id) {
            light.position = position;
        }
    }

    pub fn render_lights(&self, view_matrix: &[f32; 9], canvas_width: f32, canvas_height: f32) -> Result<(), JsValue> {
        let program = self.light_shader.as_ref().ok_or("Light shader not initialized")?;
        
        // Enable additive blending for light accumulation
        self.gl.enable(WebGlRenderingContext::BLEND);
        self.gl.blend_func(WebGlRenderingContext::ONE, WebGlRenderingContext::ONE);
        
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
        
        // Render each light
        for light in self.lights.values() {
            if !light.is_on {
                continue;
            }
            
            self.render_single_light(program, light)?;
        }
        
        // Restore normal blending
        self.gl.blend_func(WebGlRenderingContext::SRC_ALPHA, WebGlRenderingContext::ONE_MINUS_SRC_ALPHA);
        
        Ok(())
    }

    fn render_single_light(&self, program: &WebGlProgram, light: &Light) -> Result<(), JsValue> {
        // Set light uniforms
        let light_pos_location = self.gl.get_uniform_location(program, "u_light_pos");
        if let Some(location) = light_pos_location {
            self.gl.uniform2f(Some(&location), light.position.x, light.position.y);
        }
        
        let light_radius_location = self.gl.get_uniform_location(program, "u_light_radius");
        if let Some(location) = light_radius_location {
            self.gl.uniform1f(Some(&location), light.radius);
        }
        
        let light_color_location = self.gl.get_uniform_location(program, "u_light_color");
        if let Some(location) = light_color_location {
            self.gl.uniform3f(Some(&location), light.color.r, light.color.g, light.color.b);
        }
        
        let light_intensity_location = self.gl.get_uniform_location(program, "u_light_intensity");
        if let Some(location) = light_intensity_location {
            self.gl.uniform1f(Some(&location), light.intensity);
        }
        
        let light_falloff_location = self.gl.get_uniform_location(program, "u_light_falloff");
        if let Some(location) = light_falloff_location {
            self.gl.uniform1f(Some(&location), light.falloff);
        }
        
        // Create light quad vertices centered on light position
        let size = light.radius * 2.0;
        let vertices: [f32; 8] = [
            light.position.x - size, light.position.y - size,
            light.position.x + size, light.position.y - size,
            light.position.x + size, light.position.y + size,
            light.position.x - size, light.position.y + size,
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
        
        // Draw light quad
        self.gl.draw_arrays(WebGlRenderingContext::TRIANGLE_FAN, 0, 4);
        
        self.gl.disable_vertex_attrib_array(position_location);
        
        Ok(())
    }

    pub fn turn_on_all(&mut self) {
        for light in self.lights.values_mut() {
            light.is_on = true;
        }
    }

    pub fn turn_off_all(&mut self) {
        for light in self.lights.values_mut() {
            light.is_on = false;
        }
    }

    pub fn get_light_count(&self) -> usize {
        self.lights.len()
    }

    pub fn clear_lights(&mut self) {
        self.lights.clear();
    }
}
