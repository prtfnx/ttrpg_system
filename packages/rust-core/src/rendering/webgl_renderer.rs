use crate::math::Vec2;
use crate::types::BlendMode;
use std::cell::Cell;
use wasm_bindgen::prelude::*;
use web_sys::{
    WebGl2RenderingContext as WebGlRenderingContext, WebGlBuffer, WebGlProgram, WebGlShader,
    WebGlUniformLocation, WebGlVertexArrayObject,
};

const QUAD_VERTEX_BYTES: i32 = (16 * std::mem::size_of::<f32>()) as i32;
const QUAD_INDICES: [u16; 6] = [0, 1, 2, 1, 3, 2];

struct QuadPipeline {
    gl: WebGlRenderingContext,
    program: WebGlProgram,
    vao: WebGlVertexArrayObject,
    vertex_buffer: WebGlBuffer,
    index_buffer: WebGlBuffer,
    vertex_capacity_bytes: Cell<i32>,
    u_view_matrix: WebGlUniformLocation,
    u_canvas_size: WebGlUniformLocation,
    u_color: WebGlUniformLocation,
    u_use_texture: WebGlUniformLocation,
}

impl QuadPipeline {
    fn new(gl: WebGlRenderingContext) -> Result<Self, JsValue> {
        let vertex_source = r#"#version 300 es
            precision highp float;

            layout(location = 0) in vec2 a_position;
            layout(location = 1) in vec2 a_tex_coord;

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
                fragColor = u_use_texture
                    ? texture(u_texture, v_tex_coord) * u_color
                    : u_color;
            }
        "#;

        let program = Self::link_program(&gl, vertex_source, fragment_source)?;
        let uniforms = (|| {
            Ok((
                Self::required_uniform(&gl, &program, "u_view_matrix")?,
                Self::required_uniform(&gl, &program, "u_canvas_size")?,
                Self::required_uniform(&gl, &program, "u_color")?,
                Self::required_uniform(&gl, &program, "u_use_texture")?,
                Self::required_uniform(&gl, &program, "u_texture")?,
            ))
        })();
        let (u_view_matrix, u_canvas_size, u_color, u_use_texture, u_texture) = match uniforms {
            Ok(uniforms) => uniforms,
            Err(error) => {
                gl.delete_program(Some(&program));
                return Err(error);
            }
        };

        let Some(vao) = gl.create_vertex_array() else {
            gl.delete_program(Some(&program));
            return Err(JsValue::from_str("Failed to create quad VAO"));
        };
        let Some(vertex_buffer) = gl.create_buffer() else {
            gl.delete_vertex_array(Some(&vao));
            gl.delete_program(Some(&program));
            return Err(JsValue::from_str("Failed to create quad vertex buffer"));
        };
        let Some(index_buffer) = gl.create_buffer() else {
            gl.delete_buffer(Some(&vertex_buffer));
            gl.delete_vertex_array(Some(&vao));
            gl.delete_program(Some(&program));
            return Err(JsValue::from_str("Failed to create quad index buffer"));
        };

        gl.bind_vertex_array(Some(&vao));
        gl.bind_buffer(WebGlRenderingContext::ARRAY_BUFFER, Some(&vertex_buffer));
        gl.buffer_data_with_i32(
            WebGlRenderingContext::ARRAY_BUFFER,
            QUAD_VERTEX_BYTES,
            WebGlRenderingContext::DYNAMIC_DRAW,
        );
        gl.enable_vertex_attrib_array(0);
        gl.vertex_attrib_pointer_with_i32(0, 2, WebGlRenderingContext::FLOAT, false, 16, 0);
        gl.enable_vertex_attrib_array(1);
        gl.vertex_attrib_pointer_with_i32(1, 2, WebGlRenderingContext::FLOAT, false, 16, 8);
        gl.bind_buffer(
            WebGlRenderingContext::ELEMENT_ARRAY_BUFFER,
            Some(&index_buffer),
        );
        unsafe {
            let indices = js_sys::Uint16Array::view(&QUAD_INDICES);
            gl.buffer_data_with_array_buffer_view(
                WebGlRenderingContext::ELEMENT_ARRAY_BUFFER,
                &indices,
                WebGlRenderingContext::STATIC_DRAW,
            );
        }
        gl.bind_vertex_array(None);
        gl.bind_buffer(WebGlRenderingContext::ARRAY_BUFFER, None);

        gl.use_program(Some(&program));
        gl.uniform1i(Some(&u_texture), 0);

        Ok(Self {
            gl,
            program,
            vao,
            vertex_buffer,
            index_buffer,
            vertex_capacity_bytes: Cell::new(QUAD_VERTEX_BYTES),
            u_view_matrix,
            u_canvas_size,
            u_color,
            u_use_texture,
        })
    }

    fn compile_shader(
        gl: &WebGlRenderingContext,
        shader_type: u32,
        source: &str,
    ) -> Result<WebGlShader, JsValue> {
        let shader = gl
            .create_shader(shader_type)
            .ok_or_else(|| JsValue::from_str("Failed to create quad shader"))?;
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
            "Failed to compile quad shader: {info}"
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
            return Err(JsValue::from_str("Failed to create quad program"));
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
            "Failed to link quad program: {info}"
        )))
    }

    fn required_uniform(
        gl: &WebGlRenderingContext,
        program: &WebGlProgram,
        name: &str,
    ) -> Result<WebGlUniformLocation, JsValue> {
        gl.get_uniform_location(program, name).ok_or_else(|| {
            JsValue::from_str(&format!("Quad shader is missing required uniform {name}"))
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

impl Drop for QuadPipeline {
    fn drop(&mut self) {
        self.gl.delete_vertex_array(Some(&self.vao));
        self.gl.delete_buffer(Some(&self.vertex_buffer));
        self.gl.delete_buffer(Some(&self.index_buffer));
        self.gl.delete_program(Some(&self.program));
    }
}

pub struct WebGLRenderer {
    pub gl: WebGlRenderingContext,
    pipeline: QuadPipeline,
    current_layer_color: [f32; 3],
    frame_draw_calls: Cell<u32>,
    frame_buffer_uploads: Cell<u32>,
}

impl WebGLRenderer {
    pub fn new(gl: WebGlRenderingContext) -> Result<Self, JsValue> {
        gl.enable(WebGlRenderingContext::BLEND);
        gl.blend_func(
            WebGlRenderingContext::SRC_ALPHA,
            WebGlRenderingContext::ONE_MINUS_SRC_ALPHA,
        );
        let pipeline = QuadPipeline::new(gl.clone())?;
        Ok(Self {
            gl,
            pipeline,
            current_layer_color: [1.0, 1.0, 1.0],
            frame_draw_calls: Cell::new(0),
            frame_buffer_uploads: Cell::new(0),
        })
    }

    pub fn clear(&self, r: f32, g: f32, b: f32, a: f32) {
        self.gl.color_mask(true, true, true, true);
        self.gl.disable(WebGlRenderingContext::STENCIL_TEST);
        self.gl.stencil_mask(0xFF);
        self.gl.blend_func(
            WebGlRenderingContext::SRC_ALPHA,
            WebGlRenderingContext::ONE_MINUS_SRC_ALPHA,
        );
        self.gl.clear_color(r, g, b, a);
        self.gl.clear(
            WebGlRenderingContext::COLOR_BUFFER_BIT | WebGlRenderingContext::STENCIL_BUFFER_BIT,
        );
    }

    pub fn begin_frame(&self) {
        self.frame_draw_calls.set(0);
        self.frame_buffer_uploads.set(0);
    }

    pub fn frame_draw_calls(&self) -> u32 {
        self.frame_draw_calls.get()
    }

    pub fn frame_buffer_uploads(&self) -> u32 {
        self.frame_buffer_uploads.get()
    }

    fn record_draw_call(&self) {
        self.frame_draw_calls
            .set(self.frame_draw_calls.get().saturating_add(1));
    }

    fn upload_vertices(&self, vertices: &[f32]) {
        let uploads = self.pipeline.upload_vertices(vertices);
        self.frame_buffer_uploads
            .set(self.frame_buffer_uploads.get().saturating_add(uploads));
    }

    fn set_color(&self, color: [f32; 4], use_texture: bool) {
        self.gl.uniform4f(
            Some(&self.pipeline.u_color),
            color[0],
            color[1],
            color[2],
            color[3],
        );
        self.gl.uniform1i(
            Some(&self.pipeline.u_use_texture),
            if use_texture { 1 } else { 0 },
        );
    }

    pub fn draw_quad(
        &self,
        vertices: &[f32],
        tex_coords: &[f32],
        color: [f32; 4],
        use_texture: bool,
    ) -> Result<(), JsValue> {
        if vertices.len() < 8 || tex_coords.len() < 8 {
            return Err(JsValue::from_str(
                "Quad rendering requires four positions and texture coordinates",
            ));
        }
        let vertex_data = [
            vertices[0],
            vertices[1],
            tex_coords[0],
            tex_coords[1],
            vertices[2],
            vertices[3],
            tex_coords[2],
            tex_coords[3],
            vertices[4],
            vertices[5],
            tex_coords[4],
            tex_coords[5],
            vertices[6],
            vertices[7],
            tex_coords[6],
            tex_coords[7],
        ];
        self.pipeline.bind();
        self.upload_vertices(&vertex_data);
        self.set_color(color, use_texture);
        self.gl.draw_elements_with_i32(
            WebGlRenderingContext::TRIANGLES,
            6,
            WebGlRenderingContext::UNSIGNED_SHORT,
            0,
        );
        self.record_draw_call();
        Ok(())
    }

    pub fn draw_line_strip(
        &self,
        vertices: &[f32],
        color: [f32; 4],
        line_width: f32,
    ) -> Result<(), JsValue> {
        if vertices.len() < 4 || !vertices.len().is_multiple_of(2) {
            return Ok(());
        }
        self.pipeline.bind();
        self.gl.line_width(line_width);
        let vertex_data = Self::interleave_positions(vertices);
        self.upload_vertices(&vertex_data);
        self.set_color(color, false);
        self.gl.draw_arrays(
            WebGlRenderingContext::LINE_STRIP,
            0,
            (vertices.len() / 2) as i32,
        );
        self.record_draw_call();
        self.gl.line_width(1.0);
        Ok(())
    }

    pub fn draw_triangles(&self, vertices: &[f32], color: [f32; 4]) -> Result<(), JsValue> {
        if vertices.len() < 6 || !vertices.len().is_multiple_of(2) {
            return Ok(());
        }
        self.pipeline.bind();
        let vertex_data = Self::interleave_positions(vertices);
        self.upload_vertices(&vertex_data);
        self.set_color(color, false);
        self.gl.draw_arrays(
            WebGlRenderingContext::TRIANGLES,
            0,
            (vertices.len() / 2) as i32,
        );
        self.record_draw_call();
        Ok(())
    }

    pub fn draw_lines(&self, vertices: &[f32], color: [f32; 4]) -> Result<(), JsValue> {
        if vertices.len() < 4 || !vertices.len().is_multiple_of(2) {
            return Ok(());
        }
        self.pipeline.bind();
        let vertex_data = Self::interleave_positions(vertices);
        self.upload_vertices(&vertex_data);
        self.set_color(color, false);
        self.gl
            .draw_arrays(WebGlRenderingContext::LINES, 0, (vertices.len() / 2) as i32);
        self.record_draw_call();
        Ok(())
    }

    fn interleave_positions(vertices: &[f32]) -> Vec<f32> {
        let mut vertex_data = Vec::with_capacity(vertices.len() * 2);
        for point in vertices.chunks_exact(2) {
            vertex_data.extend_from_slice(&[point[0], point[1], 0.0, 0.0]);
        }
        vertex_data
    }

    pub fn set_view_matrix(&self, matrix: &[f32; 9], canvas_size: Vec2) {
        self.pipeline.bind();
        self.gl
            .viewport(0, 0, canvas_size.x as i32, canvas_size.y as i32);
        self.gl
            .uniform_matrix3fv_with_f32_array(Some(&self.pipeline.u_view_matrix), false, matrix);
        self.gl.uniform2f(
            Some(&self.pipeline.u_canvas_size),
            canvas_size.x,
            canvas_size.y,
        );
    }

    pub fn set_blend_mode(&self, blend_mode: &BlendMode) {
        let (src_factor, dst_factor) = blend_mode.to_webgl_equation();
        self.gl.blend_func(src_factor, dst_factor);
    }

    pub fn set_layer_color(&mut self, color: &[f32; 3]) {
        self.current_layer_color = *color;
    }

    pub fn get_layer_color(&self) -> [f32; 3] {
        self.current_layer_color
    }

    pub fn modulate_color(&self, sprite_color: [f32; 4]) -> [f32; 4] {
        [
            sprite_color[0] * self.current_layer_color[0],
            sprite_color[1] * self.current_layer_color[1],
            sprite_color[2] * self.current_layer_color[2],
            sprite_color[3],
        ]
    }
}
