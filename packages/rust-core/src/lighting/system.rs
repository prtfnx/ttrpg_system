#[cfg(target_arch = "wasm32")]
use super::visibility::{distance_squared_to_segment, shadow_quad, Point, VisibilityCalculator};
use crate::math::Vec2;
use crate::types::Color;
use serde::{Deserialize, Serialize};
#[cfg(target_arch = "wasm32")]
use std::cell::{Cell, RefCell};
#[cfg(target_arch = "wasm32")]
use std::collections::HashMap;
#[cfg(target_arch = "wasm32")]
use wasm_bindgen::prelude::*;
#[cfg(target_arch = "wasm32")]
use web_sys::{
    WebGl2RenderingContext as WebGlRenderingContext, WebGlBuffer, WebGlProgram, WebGlShader,
    WebGlUniformLocation, WebGlVertexArrayObject,
};

#[cfg(target_arch = "wasm32")]
const LIGHT_VERTEX_BYTES: i32 = (132 * std::mem::size_of::<f32>()) as i32;

/// Light types supported by the system
#[derive(Clone, Debug, Serialize, Deserialize)]
pub enum LightType {
    Point,
}

/// Light source with shadow casting
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Light {
    pub id: String,
    pub table_id: String,
    pub position: Vec2,
    pub color: Color,
    pub intensity: f32,
    pub radius: f32,               // pixels — used for rendering
    pub radius_units: Option<f32>, // game units (ft/m) — source of truth
    pub falloff: f32,
    pub is_on: bool,
    pub light_type: LightType,

    #[serde(skip)]
    pub(crate) dirty: bool,

    #[serde(skip)]
    #[cfg(target_arch = "wasm32")]
    pub(crate) cached_polygon: Option<Vec<Point>>,
}

impl Light {
    pub fn new(id: String, x: f32, y: f32, table_id: String) -> Self {
        Self {
            id,
            table_id,
            position: Vec2::new(x, y),
            color: Color::new(1.0, 1.0, 0.9, 1.0), // Warm white
            intensity: 1.0,
            radius: 200.0,
            radius_units: None,
            falloff: 2.0,
            is_on: true,
            light_type: LightType::Point,
            dirty: true,
            #[cfg(target_arch = "wasm32")]
            cached_polygon: None,
        }
    }

    pub fn set_position(&mut self, position: Vec2) {
        if (self.position.x - position.x).abs() > 0.01
            || (self.position.y - position.y).abs() > 0.01
        {
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

    pub fn set_enabled(&mut self, enabled: bool) {
        self.is_on = enabled;
    }

    #[cfg(target_arch = "wasm32")]
    fn mark_dirty(&mut self) {
        self.dirty = true;
        self.cached_polygon = None;
    }
}

#[cfg(target_arch = "wasm32")]
struct LightPipeline {
    gl: WebGlRenderingContext,
    program: WebGlProgram,
    vao: WebGlVertexArrayObject,
    vertex_buffer: WebGlBuffer,
    vertex_capacity_bytes: Cell<i32>,
    u_view_matrix: WebGlUniformLocation,
    u_canvas_size: WebGlUniformLocation,
    u_light_pos: WebGlUniformLocation,
    u_light_radius: WebGlUniformLocation,
    u_light_color: WebGlUniformLocation,
    u_light_intensity: WebGlUniformLocation,
    u_light_falloff: WebGlUniformLocation,
}

#[cfg(target_arch = "wasm32")]
impl LightPipeline {
    fn new(gl: WebGlRenderingContext) -> Result<Self, JsValue> {
        let vertex_source = r#"#version 300 es
            precision highp float;

            layout(location = 0) in vec2 a_position;

            uniform mat3 u_view_matrix;
            uniform vec2 u_canvas_size;
            uniform vec2 u_light_pos;

            out vec2 v_light_coord;

            void main() {
                vec3 world_pos = u_view_matrix * vec3(a_position, 1.0);
                vec2 clip_pos = (world_pos.xy / u_canvas_size) * 2.0 - 1.0;
                clip_pos.y = -clip_pos.y;
                gl_Position = vec4(clip_pos, 0.0, 1.0);
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
                float attenuation = pow(max(0.0, 1.0 - normalized_dist), u_light_falloff);
                vec3 light_contribution = u_light_color * u_light_intensity * attenuation;
                fragColor = vec4(light_contribution, attenuation * 0.8);
            }
        "#;

        let program = Self::link_program(&gl, vertex_source, fragment_source)?;
        let uniforms = (|| {
            Ok((
                Self::required_uniform(&gl, &program, "u_view_matrix")?,
                Self::required_uniform(&gl, &program, "u_canvas_size")?,
                Self::required_uniform(&gl, &program, "u_light_pos")?,
                Self::required_uniform(&gl, &program, "u_light_radius")?,
                Self::required_uniform(&gl, &program, "u_light_color")?,
                Self::required_uniform(&gl, &program, "u_light_intensity")?,
                Self::required_uniform(&gl, &program, "u_light_falloff")?,
            ))
        })();
        let (
            u_view_matrix,
            u_canvas_size,
            u_light_pos,
            u_light_radius,
            u_light_color,
            u_light_intensity,
            u_light_falloff,
        ) = match uniforms {
            Ok(uniforms) => uniforms,
            Err(error) => {
                gl.delete_program(Some(&program));
                return Err(error);
            }
        };

        let Some(vao) = gl.create_vertex_array() else {
            gl.delete_program(Some(&program));
            return Err(JsValue::from_str("Failed to create light VAO"));
        };
        let Some(vertex_buffer) = gl.create_buffer() else {
            gl.delete_vertex_array(Some(&vao));
            gl.delete_program(Some(&program));
            return Err(JsValue::from_str("Failed to create light vertex buffer"));
        };

        gl.bind_vertex_array(Some(&vao));
        gl.bind_buffer(WebGlRenderingContext::ARRAY_BUFFER, Some(&vertex_buffer));
        gl.buffer_data_with_i32(
            WebGlRenderingContext::ARRAY_BUFFER,
            LIGHT_VERTEX_BYTES,
            WebGlRenderingContext::DYNAMIC_DRAW,
        );
        gl.enable_vertex_attrib_array(0);
        gl.vertex_attrib_pointer_with_i32(0, 2, WebGlRenderingContext::FLOAT, false, 0, 0);
        gl.bind_vertex_array(None);
        gl.bind_buffer(WebGlRenderingContext::ARRAY_BUFFER, None);

        Ok(Self {
            gl,
            program,
            vao,
            vertex_buffer,
            vertex_capacity_bytes: Cell::new(LIGHT_VERTEX_BYTES),
            u_view_matrix,
            u_canvas_size,
            u_light_pos,
            u_light_radius,
            u_light_color,
            u_light_intensity,
            u_light_falloff,
        })
    }

    fn compile_shader(
        gl: &WebGlRenderingContext,
        shader_type: u32,
        source: &str,
    ) -> Result<WebGlShader, JsValue> {
        let shader = gl
            .create_shader(shader_type)
            .ok_or_else(|| JsValue::from_str("Failed to create light shader"))?;
        gl.shader_source(&shader, source);
        gl.compile_shader(&shader);
        if gl
            .get_shader_parameter(&shader, WebGlRenderingContext::COMPILE_STATUS)
            .as_bool()
            .unwrap_or(false)
        {
            return Ok(shader);
        }

        let info = gl.get_shader_info_log(&shader).unwrap_or_default();
        gl.delete_shader(Some(&shader));
        Err(JsValue::from_str(&format!(
            "Failed to compile light shader: {info}"
        )))
    }

    fn link_program(
        gl: &WebGlRenderingContext,
        vertex_source: &str,
        fragment_source: &str,
    ) -> Result<WebGlProgram, JsValue> {
        let vertex_shader =
            Self::compile_shader(gl, WebGlRenderingContext::VERTEX_SHADER, vertex_source)?;
        let fragment_shader =
            match Self::compile_shader(gl, WebGlRenderingContext::FRAGMENT_SHADER, fragment_source)
            {
                Ok(shader) => shader,
                Err(error) => {
                    gl.delete_shader(Some(&vertex_shader));
                    return Err(error);
                }
            };
        let Some(program) = gl.create_program() else {
            gl.delete_shader(Some(&vertex_shader));
            gl.delete_shader(Some(&fragment_shader));
            return Err(JsValue::from_str("Failed to create light program"));
        };

        gl.attach_shader(&program, &vertex_shader);
        gl.attach_shader(&program, &fragment_shader);
        gl.link_program(&program);
        let linked = gl
            .get_program_parameter(&program, WebGlRenderingContext::LINK_STATUS)
            .as_bool()
            .unwrap_or(false);
        gl.detach_shader(&program, &vertex_shader);
        gl.detach_shader(&program, &fragment_shader);
        gl.delete_shader(Some(&vertex_shader));
        gl.delete_shader(Some(&fragment_shader));
        if linked {
            return Ok(program);
        }

        let info = gl.get_program_info_log(&program).unwrap_or_default();
        gl.delete_program(Some(&program));
        Err(JsValue::from_str(&format!(
            "Failed to link light program: {info}"
        )))
    }

    fn required_uniform(
        gl: &WebGlRenderingContext,
        program: &WebGlProgram,
        name: &str,
    ) -> Result<WebGlUniformLocation, JsValue> {
        gl.get_uniform_location(program, name).ok_or_else(|| {
            JsValue::from_str(&format!("Light shader is missing required uniform {name}"))
        })
    }

    fn bind(&self) {
        self.gl.use_program(Some(&self.program));
        self.gl.bind_vertex_array(Some(&self.vao));
    }

    fn upload_vertices(&self, vertices: &[f32]) -> u32 {
        self.gl.bind_buffer(
            WebGlRenderingContext::ARRAY_BUFFER,
            Some(&self.vertex_buffer),
        );
        let required_bytes = i32::try_from(std::mem::size_of_val(vertices)).unwrap_or(i32::MAX);
        let mut uploads = 1;
        if required_bytes > self.vertex_capacity_bytes.get() {
            self.gl.buffer_data_with_i32(
                WebGlRenderingContext::ARRAY_BUFFER,
                required_bytes,
                WebGlRenderingContext::DYNAMIC_DRAW,
            );
            self.vertex_capacity_bytes.set(required_bytes);
            uploads += 1;
        }
        unsafe {
            let view = js_sys::Float32Array::view(vertices);
            self.gl.buffer_sub_data_with_i32_and_array_buffer_view(
                WebGlRenderingContext::ARRAY_BUFFER,
                0,
                &view,
            );
        }
        uploads
    }
}

#[cfg(target_arch = "wasm32")]
impl Drop for LightPipeline {
    fn drop(&mut self) {
        self.gl.delete_vertex_array(Some(&self.vao));
        self.gl.delete_buffer(Some(&self.vertex_buffer));
        self.gl.delete_program(Some(&self.program));
    }
}

/// Lighting system with shadow casting using hybrid CPU/GPU approach
#[cfg(target_arch = "wasm32")]
pub struct LightingSystem {
    gl: WebGlRenderingContext,
    pipeline: LightPipeline,
    lights: HashMap<String, Light>,
    visibility_calculator: RefCell<VisibilityCalculator>,
    ambient_light: f32,
    obstacles_dirty: bool,
    frame_draw_calls: Cell<u32>,
    frame_buffer_uploads: Cell<u32>,
    frame_active_lights: Cell<u32>,
    frame_shadow_segments_total: Cell<u32>,
    frame_shadow_candidates: Cell<u32>,
    frame_shadow_segments_accepted: Cell<u32>,
    frame_shadow_draw_calls: Cell<u32>,
}

#[cfg(target_arch = "wasm32")]
impl LightingSystem {
    pub fn new(gl: WebGlRenderingContext) -> Result<Self, JsValue> {
        // Verify stencil buffer is available
        let stencil_bits = gl
            .get_parameter(web_sys::WebGl2RenderingContext::STENCIL_BITS)
            .ok()
            .and_then(|v| v.as_f64())
            .unwrap_or(0.0) as i32;

        log_info!("[PAINT] Stencil buffer bits: {}", stencil_bits);

        if stencil_bits == 0 {
            log_error!("[ERR] No stencil buffer available! Shadow casting will not work.");
        } else {
            log_info!("[OK] Stencil buffer is available");
        }

        let pipeline = LightPipeline::new(gl.clone())?;
        Ok(Self {
            gl,
            pipeline,
            lights: HashMap::new(),
            visibility_calculator: RefCell::new(VisibilityCalculator::new()),
            ambient_light: 0.3,
            obstacles_dirty: true,
            frame_draw_calls: Cell::new(0),
            frame_buffer_uploads: Cell::new(0),
            frame_active_lights: Cell::new(0),
            frame_shadow_segments_total: Cell::new(0),
            frame_shadow_candidates: Cell::new(0),
            frame_shadow_segments_accepted: Cell::new(0),
            frame_shadow_draw_calls: Cell::new(0),
        })
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
        // web_sys::console::log_1(&format!("[LIGHTING-DEBUG] [IN] Received {} floats = {} segments",
        //     obstacles.len(), obstacles.len() / 4).into());

        let mut calc = self.visibility_calculator.borrow_mut();
        calc.clear();
        calc.add_segments_from_array(obstacles);

        // let segment_count = calc.get_segments().len();
        // web_sys::console::log_1(&format!("[LIGHTING-DEBUG] [GEOM] VisibilityCalculator now has {} segments",
        //     segment_count).into());

        drop(calc); // Release borrow

        self.obstacles_dirty = true;

        // Mark all lights dirty
        for light in self.lights.values_mut() {
            light.mark_dirty();
        }
    }

    /// Render all lights with shadow casting
    /// Strategy: Render full light circle, then subtract shadow volumes
    pub fn render_lights(
        &mut self,
        view_matrix: &[f32; 9],
        canvas_width: f32,
        canvas_height: f32,
    ) -> Result<(), JsValue> {
        // Default: render all lights (backwards compatibility)
        self.render_lights_filtered(view_matrix, canvas_width, canvas_height, None, None)
    }

    pub fn begin_frame(&self) {
        self.frame_draw_calls.set(0);
        self.frame_buffer_uploads.set(0);
        self.frame_active_lights.set(0);
        self.frame_shadow_segments_total.set(0);
        self.frame_shadow_candidates.set(0);
        self.frame_shadow_segments_accepted.set(0);
        self.frame_shadow_draw_calls.set(0);
    }

    pub fn frame_draw_calls(&self) -> u32 {
        self.frame_draw_calls.get()
    }

    pub fn frame_buffer_uploads(&self) -> u32 {
        self.frame_buffer_uploads.get()
    }

    pub fn frame_active_lights(&self) -> u32 {
        self.frame_active_lights.get()
    }

    pub fn frame_shadow_segments_total(&self) -> u32 {
        self.frame_shadow_segments_total.get()
    }

    pub fn frame_shadow_candidates(&self) -> u32 {
        self.frame_shadow_candidates.get()
    }

    pub fn frame_shadow_segments_accepted(&self) -> u32 {
        self.frame_shadow_segments_accepted.get()
    }

    pub fn frame_shadow_draw_calls(&self) -> u32 {
        self.frame_shadow_draw_calls.get()
    }

    /// Render lights filtered by table_id
    pub fn render_lights_filtered(
        &mut self,
        view_matrix: &[f32; 9],
        canvas_width: f32,
        canvas_height: f32,
        table_id: Option<&str>,
        scissor_rect: Option<[i32; 4]>,
    ) -> Result<(), JsValue> {
        // Clip the complete light/stencil pass to the visible table plane.
        // Scissor coordinates use a bottom-left origin, unlike camera space.
        if let Some([x, y, width, height]) = scissor_rect {
            self.gl.enable(WebGlRenderingContext::SCISSOR_TEST);
            self.gl.scissor(x, y, width, height);
        }

        // Enable stencil test for shadow masking
        self.gl.enable(WebGlRenderingContext::STENCIL_TEST);
        self.gl.stencil_mask(0xFF);
        self.gl.clear_stencil(0);
        self.gl.clear(WebGlRenderingContext::STENCIL_BUFFER_BIT);

        // Enable additive blending for light accumulation
        self.gl.enable(WebGlRenderingContext::BLEND);
        self.gl
            .blend_func(WebGlRenderingContext::ONE, WebGlRenderingContext::ONE);

        self.pipeline.bind();
        self.gl.uniform_matrix3fv_with_f32_array(
            Some(&self.pipeline.u_view_matrix),
            false,
            view_matrix,
        );
        self.gl.uniform2f(
            Some(&self.pipeline.u_canvas_size),
            canvas_width,
            canvas_height,
        );

        // Render each light — capture result to ensure cleanup runs regardless
        let light_ids: Vec<String> = self.lights.keys().cloned().collect();
        let mut render_result: Result<(), JsValue> = Ok(());
        for light_id in light_ids {
            let (
                id,
                position,
                color,
                intensity,
                radius,
                falloff,
                cached_polygon,
                dirty,
                _light_table_id,
            ) = {
                if let Some(light) = self.lights.get(&light_id) {
                    if !light.is_on {
                        continue;
                    }
                    if let Some(filter_table_id) = table_id {
                        if light.table_id != filter_table_id {
                            continue;
                        }
                    }
                    self.frame_active_lights
                        .set(self.frame_active_lights.get().saturating_add(1));
                    (
                        light.id.clone(),
                        light.position,
                        light.color,
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

            match self.render_single_light(
                &id,
                position,
                color,
                intensity,
                radius,
                falloff,
                cached_polygon,
                dirty,
            ) {
                Ok((new_polygon, new_dirty)) => {
                    if let Some(light) = self.lights.get_mut(&light_id) {
                        light.cached_polygon = new_polygon;
                        light.dirty = new_dirty;
                    }
                }
                Err(e) => {
                    render_result = Err(e);
                    break;
                }
            }
        }

        // ALWAYS restore GL state — even if rendering failed
        self.gl.color_mask(true, true, true, true);
        self.gl.blend_func(
            WebGlRenderingContext::SRC_ALPHA,
            WebGlRenderingContext::ONE_MINUS_SRC_ALPHA,
        );
        self.gl.disable(WebGlRenderingContext::STENCIL_TEST);
        if scissor_rect.is_some() {
            self.gl.disable(WebGlRenderingContext::SCISSOR_TEST);
        }
        self.gl.stencil_mask(0xFF);
        self.gl.bind_vertex_array(None);
        self.gl
            .bind_buffer(WebGlRenderingContext::ARRAY_BUFFER, None);

        self.obstacles_dirty = false;

        render_result
    }

    /// Render a single light with shadow casting
    /// CORRECTED APPROACH: Stencil buffer marks SHADOW areas, light renders everywhere EXCEPT shadows
    /// Best practice: Shadow geometry - project obstacles away from light to create shadow quads
    fn render_single_light(
        &self,
        _light_id: &str,
        position: Vec2,
        color: Color,
        intensity: f32,
        radius: f32,
        falloff: f32,
        _cached_polygon: Option<Vec<Point>>,
        _dirty: bool,
    ) -> Result<(Option<Vec<Point>>, bool), JsValue> {
        // Set light-specific uniforms
        self.set_light_uniforms(&position, &color, intensity, radius, falloff);

        // Stencil contents are a per-light shadow mask. Without this clear,
        // shadows produced for an earlier light also block every later light.
        self.gl.stencil_mask(0xFF);
        self.gl.clear_stencil(0);
        self.gl.clear(WebGlRenderingContext::STENCIL_BUFFER_BIT);

        // CORRECTED APPROACH: Use stencil buffer to BLOCK shadows
        // 1. Render shadow quads to stencil buffer (mark as 1 where shadows are)
        // 2. Render full light circle where stencil = 0 (NOT in shadow)

        // Step 1: Compute and render shadow quads to stencil
        let shadow_quads = self.compute_shadow_quads(position, radius);

        // web_sys::console::log_1(&format!("[STENCIL-DEBUG] [DARK] Computing shadows for light at ({:.1}, {:.1}), found {} shadow quads",
        //     position.x, position.y, shadow_quads.len()).into());

        if !shadow_quads.is_empty() {
            // Write shadows to stencil (set to 1)
            self.gl.stencil_func(WebGlRenderingContext::ALWAYS, 1, 0xFF);
            self.gl.stencil_op(
                WebGlRenderingContext::KEEP,
                WebGlRenderingContext::KEEP,
                WebGlRenderingContext::REPLACE,
            );
            self.gl.stencil_mask(0xFF); // Ensure stencil can be written
            self.gl.color_mask(false, false, false, false); // Don't write color, only stencil

            // web_sys::console::log_1(&"[STENCIL-DEBUG] [STENCIL] Stencil setup: ALWAYS pass, REPLACE with 1, color mask OFF".into());

            // Render each shadow quad as triangle strip
            let mut shadow_result: Result<(), JsValue> = Ok(());
            for quad in shadow_quads.iter() {
                if quad.len() == 4 {
                    let shadow_vertices = self.quad_to_vertices(quad);
                    if let Err(e) = self.upload_and_draw_triangle_strip(&shadow_vertices) {
                        shadow_result = Err(e);
                        break;
                    }
                }
            }

            // ALWAYS restore color writing, even if a shadow quad failed
            self.gl.color_mask(true, true, true, true);

            shadow_result?;
        }

        // Step 2: Render full light circle where stencil = 0 (not shadowed)
        self.gl.stencil_func(WebGlRenderingContext::EQUAL, 0, 0xFF);
        self.gl.stencil_op(
            WebGlRenderingContext::KEEP,
            WebGlRenderingContext::KEEP,
            WebGlRenderingContext::KEEP,
        );
        self.gl.stencil_mask(0x00);

        let circle = self.generate_circle(position, radius);
        let circle_vertices = self.polygon_to_vertices_from_light(&circle, position);
        let draw_result = self.upload_and_draw_vertices(&circle_vertices);

        // ALWAYS reset stencil state for the next light
        self.gl.stencil_func(WebGlRenderingContext::ALWAYS, 0, 0xFF);
        self.gl.stencil_mask(0xFF);

        draw_result?;
        Ok((None, false))
    }

    /// Helper to upload vertices and draw triangle fan
    fn upload_and_draw_vertices(&self, vertices: &[f32]) -> Result<(), JsValue> {
        self.pipeline.bind();
        let uploads = self.pipeline.upload_vertices(vertices);
        self.frame_buffer_uploads
            .set(self.frame_buffer_uploads.get().saturating_add(uploads));

        self.gl.draw_arrays(
            WebGlRenderingContext::TRIANGLE_FAN,
            0,
            (vertices.len() / 2) as i32,
        );
        self.frame_draw_calls
            .set(self.frame_draw_calls.get().saturating_add(1));

        Ok(())
    }

    /// Helper to upload vertices and draw triangle strip (for shadow quads)
    fn upload_and_draw_triangle_strip(&self, vertices: &[f32]) -> Result<(), JsValue> {
        self.pipeline.bind();
        let uploads = self.pipeline.upload_vertices(vertices);
        self.frame_buffer_uploads
            .set(self.frame_buffer_uploads.get().saturating_add(uploads));

        self.gl.draw_arrays(
            WebGlRenderingContext::TRIANGLE_STRIP,
            0,
            (vertices.len() / 2) as i32,
        );
        self.frame_draw_calls
            .set(self.frame_draw_calls.get().saturating_add(1));
        self.frame_shadow_draw_calls
            .set(self.frame_shadow_draw_calls.get().saturating_add(1));

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
    fn set_light_uniforms(
        &self,
        position: &Vec2,
        color: &Color,
        intensity: f32,
        radius: f32,
        falloff: f32,
    ) {
        self.gl
            .uniform2f(Some(&self.pipeline.u_light_pos), position.x, position.y);
        self.gl
            .uniform1f(Some(&self.pipeline.u_light_radius), radius);
        self.gl.uniform3f(
            Some(&self.pipeline.u_light_color),
            color.r,
            color.g,
            color.b,
        );
        self.gl
            .uniform1f(Some(&self.pipeline.u_light_intensity), intensity);
        self.gl
            .uniform1f(Some(&self.pipeline.u_light_falloff), falloff);
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
    /// Performance optimization: Only processes segments within light radius for shadow casting
    fn compute_shadow_quads(&self, light_pos: Vec2, radius: f32) -> Vec<Vec<Point>> {
        let calc = self.visibility_calculator.borrow();
        let mut shadow_quads = Vec::new();

        let segment_count = calc.get_segments().len();
        let segment_count = u32::try_from(segment_count).unwrap_or(u32::MAX);
        self.frame_shadow_segments_total.set(
            self.frame_shadow_segments_total
                .get()
                .saturating_add(segment_count),
        );
        self.frame_shadow_candidates.set(
            self.frame_shadow_candidates
                .get()
                .saturating_add(segment_count),
        );
        // web_sys::console::log_1(&format!("[LIGHTING-DEBUG] [DARK] Computing shadows for light at ({:.1}, {:.1}) with radius {:.1}, {} segments available",
        //     light_pos.x, light_pos.y, radius, segment_count).into());

        if segment_count == 0 {
            // web_sys::console::warn_1(&"[LIGHTING-DEBUG] [WARN] WARNING: No segments for shadow casting!".into());
            return shadow_quads;
        }

        let light = Point::new(light_pos.x, light_pos.y);
        let radius_squared = radius * radius;
        // One extra world unit keeps the projected edge outside the 64-sided
        // light mesh despite floating-point rounding at the perimeter.
        let shadow_length = radius + 1.0;

        for segment in calc.get_segments() {
            // A long segment can intersect the light even when its midpoint
            // is far away, so cull against its actual closest point.
            if distance_squared_to_segment(light, segment) > radius_squared {
                continue; // Segment is beyond light influence, skip shadow computation
            }

            // Segments are undirected. Endpoint order must not define a
            // one-way wall, so every in-range segment casts away from light.
            if let Some(quad) = shadow_quad(segment, light, shadow_length) {
                shadow_quads.push(quad.to_vec());
            }
        }

        self.frame_shadow_segments_accepted.set(
            self.frame_shadow_segments_accepted
                .get()
                .saturating_add(u32::try_from(shadow_quads.len()).unwrap_or(u32::MAX)),
        );

        shadow_quads
    }

    /// Get light at position (for mouse interaction)
    pub fn get_light_at_position(&self, world_pos: Vec2, tolerance: f32) -> Option<&String> {
        self.lights
            .iter()
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
        self.lights
            .values()
            .filter(|light| light.table_id == table_id)
            .count()
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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::math::Vec2;

    #[test]
    fn light_new_defaults() {
        let l = Light::new("l1".to_string(), 100.0, 200.0, "table-1".to_string());
        assert_eq!(l.id, "l1");
        assert_eq!(l.position.x, 100.0);
        assert_eq!(l.position.y, 200.0);
        assert_eq!(l.radius, 200.0);
        assert_eq!(l.intensity, 1.0);
        assert_eq!(l.falloff, 2.0);
        assert!(l.is_on);
        assert!(l.dirty);
    }

    #[test]
    fn set_radius_clamps_to_minimum() {
        let mut l = Light::new("l1".to_string(), 0.0, 0.0, "table-1".to_string());
        l.set_radius(1.0); // below min
        assert_eq!(l.radius, 10.0);
    }

    #[test]
    fn set_radius_sets_dirty() {
        let mut l = Light::new("l1".to_string(), 0.0, 0.0, "table-1".to_string());
        l.dirty = false;
        l.set_radius(300.0);
        assert!(l.dirty);
    }

    #[test]
    fn set_intensity_clamps_range() {
        let mut l = Light::new("l1".to_string(), 0.0, 0.0, "table-1".to_string());
        l.set_intensity(-1.0);
        assert_eq!(l.intensity, 0.0);
        l.set_intensity(99.0);
        assert_eq!(l.intensity, 2.0);
        l.set_intensity(1.5);
        assert_eq!(l.intensity, 1.5);
    }

    #[test]
    fn set_falloff_clamps_range() {
        let mut l = Light::new("l1".to_string(), 0.0, 0.0, "table-1".to_string());
        l.set_falloff(0.0);
        assert_eq!(l.falloff, 0.5);
        l.set_falloff(10.0);
        assert_eq!(l.falloff, 4.0);
        l.set_falloff(2.0);
        assert_eq!(l.falloff, 2.0);
    }

    #[test]
    fn toggle_flips_is_on() {
        let mut l = Light::new("l1".to_string(), 0.0, 0.0, "table-1".to_string());
        assert!(l.is_on);
        l.toggle();
        assert!(!l.is_on);
        l.toggle();
        assert!(l.is_on);
    }

    #[test]
    fn set_enabled_is_idempotent() {
        let mut l = Light::new("l1".to_string(), 0.0, 0.0, "table-1".to_string());
        l.set_enabled(false);
        l.set_enabled(false);
        assert!(!l.is_on);
        l.set_enabled(true);
        assert!(l.is_on);
    }

    #[test]
    fn set_position_marks_dirty_on_change() {
        let mut l = Light::new("l1".to_string(), 0.0, 0.0, "table-1".to_string());
        l.dirty = false;
        l.set_position(Vec2::new(50.0, 50.0));
        assert!(l.dirty);
    }

    #[test]
    fn set_position_no_dirty_on_same_position() {
        let mut l = Light::new("l1".to_string(), 50.0, 50.0, "table-1".to_string());
        l.dirty = false;
        l.set_position(Vec2::new(50.0, 50.0)); // same coords
        assert!(!l.dirty);
    }

    #[test]
    fn set_color_updates_color() {
        let mut l = Light::new("l1".to_string(), 0.0, 0.0, "table-1".to_string());
        l.set_color(Color::new(1.0, 0.0, 0.0, 1.0));
        assert_eq!(l.color.r, 1.0);
        assert_eq!(l.color.g, 0.0);
    }

    #[test]
    fn light_uses_explicit_table_id() {
        let l = Light::new("l1".to_string(), 0.0, 0.0, "table-1".to_string());
        assert_eq!(l.table_id, "table-1");
    }

    #[test]
    fn set_radius_no_dirty_on_same_radius() {
        let mut l = Light::new("l1".to_string(), 0.0, 0.0, "table-1".to_string());
        l.dirty = false;
        l.set_radius(200.0); // same as default
        assert!(!l.dirty);
    }

    #[test]
    fn light_serializes_and_deserializes() {
        let l = Light::new("test_light".to_string(), 42.0, 84.0, "table-1".to_string());
        let json = serde_json::to_string(&l).unwrap();
        let l2: Light = serde_json::from_str(&json).unwrap();
        assert_eq!(l2.id, "test_light");
        assert_eq!(l2.position.x, 42.0);
        assert_eq!(l2.position.y, 84.0);
        assert_eq!(l2.radius, 200.0);
    }
}
