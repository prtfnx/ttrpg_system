use wasm_bindgen::prelude::*;
use web_sys::{HtmlCanvasElement, WebGl2RenderingContext as WebGlRenderingContext, WebGlProgram, WebGlShader, WebGlTexture, HtmlImageElement};
use std::collections::HashMap;
use crate::types::*;
use crate::math::*;
use gloo_utils::format::JsValueSerdeExt;

macro_rules! console_log {
    ($($t:tt)*) => (web_sys::console::log_1(&format_args!($($t)*).to_string().into()))
}

const LAYER_NAMES: &[&str] = &["map", "tokens", "dungeon_master", "light", "height", "obstacles", "fog_of_war"];

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum InputMode {
    None,
    CameraPan,
    SpriteMove,
    SpriteResize,
}

#[wasm_bindgen]
pub struct RenderEngine {
    canvas: HtmlCanvasElement,
    gl: WebGlRenderingContext,
    shader_program: Option<WebGlProgram>,
    
    // Layer system
    layers: HashMap<String, Layer>,
    
    // Camera and transforms
    camera: Camera,
    view_matrix: Mat3,
    canvas_size: Vec2,
    
    // Input handling
    input_mode: InputMode,
    last_mouse_screen: Vec2,
    selected_sprite_id: Option<String>,
    drag_offset: Vec2,
    
    // Resources
    textures: HashMap<String, WebGlTexture>,
    grid_enabled: bool,
}

#[wasm_bindgen]
impl RenderEngine {
    #[wasm_bindgen(constructor)]
    pub fn new(canvas: HtmlCanvasElement) -> Result<RenderEngine, JsValue> {
        let gl = canvas.get_context("webgl2")?.unwrap().dyn_into::<WebGlRenderingContext>()?;
        
        let mut layers = HashMap::new();
        for (i, &name) in LAYER_NAMES.iter().enumerate() {
            layers.insert(name.to_string(), Layer::new(i as i32));
        }
        
        let canvas_size = Vec2::new(canvas.width() as f32, canvas.height() as f32);
        let camera = Camera::default();
        let view_matrix = camera.view_matrix(canvas_size);
        
        let mut engine = Self {
            canvas,
            gl,
            shader_program: None,
            layers,
            camera,
            view_matrix,
            canvas_size,
            input_mode: InputMode::None,
            last_mouse_screen: Vec2::new(0.0, 0.0),
            selected_sprite_id: None,
            drag_offset: Vec2::new(0.0, 0.0),
            textures: HashMap::new(),
            grid_enabled: true,
        };
        
        engine.init_gl()?;
        Ok(engine)
    }
    
    fn init_gl(&mut self) -> Result<(), JsValue> {
        let vertex_source = r#"#version 300 es
            precision highp float;
            
            in vec2 a_position;
            in vec2 a_tex_coord;
            
            uniform mat3 u_view_matrix;
            uniform vec2 u_canvas_size;
            
            out vec2 v_tex_coord;
            
            void main() {
                vec3 screen_pos = u_view_matrix * vec3(a_position, 1.0);
                vec2 ndc = (screen_pos.xy / u_canvas_size) * 2.0 - 1.0;
                ndc.y *= -1.0;
                gl_Position = vec4(ndc, 0.0, 1.0);
                v_tex_coord = a_tex_coord;
            }
        "#;
        
        let fragment_source = r#"#version 300 es
            precision mediump float;
            
            in vec2 v_tex_coord;
            uniform sampler2D u_texture;
            uniform vec4 u_color;
            uniform bool u_has_texture;
            
            out vec4 fragColor;
            
            void main() {
                if (u_has_texture) {
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
            return Err(JsValue::from_str(&format!(
                "Failed to link shader: {}",
                self.gl.get_program_info_log(&program).unwrap_or_default()
            )));
        }
        
        self.shader_program = Some(program);
        
        self.gl.enable(WebGlRenderingContext::BLEND);
        self.gl.blend_func(WebGlRenderingContext::SRC_ALPHA, WebGlRenderingContext::ONE_MINUS_SRC_ALPHA);
        self.gl.clear_color(0.1, 0.1, 0.1, 1.0);
        
        Ok(())
    }
    
    fn compile_shader(&self, shader_type: u32, source: &str) -> Result<WebGlShader, JsValue> {
        let shader = self.gl.create_shader(shader_type).ok_or("Failed to create shader")?;
        self.gl.shader_source(&shader, source);
        self.gl.compile_shader(&shader);
        
        if !self.gl.get_shader_parameter(&shader, WebGlRenderingContext::COMPILE_STATUS).as_bool().unwrap_or(false) {
            return Err(JsValue::from_str(&format!(
                "Shader compile error: {}",
                self.gl.get_shader_info_log(&shader).unwrap_or_default()
            )));
        }
        
        Ok(shader)
    }
    
    fn update_view_matrix(&mut self) {
        self.view_matrix = self.camera.view_matrix(self.canvas_size);
    }
    
    #[wasm_bindgen]
    pub fn render(&mut self) -> Result<(), JsValue> {
        self.gl.viewport(0, 0, self.canvas_size.x as i32, self.canvas_size.y as i32);
        self.gl.clear(WebGlRenderingContext::COLOR_BUFFER_BIT);
        
        if let Some(program) = &self.shader_program {
            self.gl.use_program(Some(program));
            
            // Set view matrix uniform
            let view_location = self.gl.get_uniform_location(program, "u_view_matrix");
            self.gl.uniform_matrix3fv_with_f32_array(view_location.as_ref(), false, &self.view_matrix.to_array());
            
            let canvas_location = self.gl.get_uniform_location(program, "u_canvas_size");
            self.gl.uniform2f(canvas_location.as_ref(), self.canvas_size.x, self.canvas_size.y);
            
            if self.grid_enabled {
                self.draw_grid()?;
            }
            
            // Draw layers in order
            let mut sorted_layers: Vec<_> = self.layers.iter().collect();
            sorted_layers.sort_by_key(|(_, layer)| layer.z_order);
            
            for (_, layer) in sorted_layers {
                if layer.visible {
                    for sprite in &layer.sprites {
                        self.draw_sprite(sprite, layer.opacity)?;
                    }
                }
            }
        }
        
        Ok(())
    }
    
    fn draw_grid(&self) -> Result<(), JsValue> {
        let grid_size = 50.0;
        let world_bounds = self.get_world_view_bounds();
        
        let start_x = (world_bounds.min.x / grid_size).floor() * grid_size;
        let end_x = (world_bounds.max.x / grid_size).ceil() * grid_size;
        let start_y = (world_bounds.min.y / grid_size).floor() * grid_size;
        let end_y = (world_bounds.max.y / grid_size).ceil() * grid_size;
        
        let mut vertices = Vec::new();
        
        // Vertical lines
        let mut x = start_x;
        while x <= end_x {
            vertices.extend_from_slice(&[x, world_bounds.min.y, x, world_bounds.max.y]);
            x += grid_size;
        }
        
        // Horizontal lines
        let mut y = start_y;
        while y <= end_y {
            vertices.extend_from_slice(&[world_bounds.min.x, y, world_bounds.max.x, y]);
            y += grid_size;
        }
        
        self.draw_lines(&vertices, [0.2, 0.2, 0.2, 1.0])
    }
    
    fn draw_sprite(&self, sprite: &Sprite, layer_opacity: f32) -> Result<(), JsValue> {
        let is_selected = self.selected_sprite_id.as_ref() == Some(&sprite.id);
        let world_pos = Vec2::new(sprite.world_x as f32, sprite.world_y as f32);
        let size = Vec2::new(
            (sprite.width * sprite.scale_x) as f32,
            (sprite.height * sprite.scale_y) as f32
        );
        
        let vertices = [
            world_pos.x, world_pos.y,
            world_pos.x + size.x, world_pos.y,
            world_pos.x, world_pos.y + size.y,
            world_pos.x + size.x, world_pos.y + size.y,
        ];
        
        let tex_coords = [0.0, 0.0, 1.0, 0.0, 0.0, 1.0, 1.0, 1.0];
        
        let mut color = sprite.tint_color;
        color[3] *= layer_opacity;
        
        let has_texture = !sprite.texture_id.is_empty() && self.textures.contains_key(&sprite.texture_id);
        if has_texture {
            if let Some(texture) = self.textures.get(&sprite.texture_id) {
                self.gl.bind_texture(WebGlRenderingContext::TEXTURE_2D, Some(texture));
            }
        }
        
        self.draw_quad(&vertices, &tex_coords, color, has_texture)?;
        
        if is_selected {
            let border = [
                world_pos.x, world_pos.y,
                world_pos.x + size.x, world_pos.y,
                world_pos.x + size.x, world_pos.y + size.y,
                world_pos.x, world_pos.y + size.y,
                world_pos.x, world_pos.y,
            ];
            self.draw_lines(&border, [0.2, 0.8, 0.2, 1.0])?;
        }
        
        Ok(())
    }
    
    fn draw_quad(&self, vertices: &[f32], tex_coords: &[f32], color: [f32; 4], has_texture: bool) -> Result<(), JsValue> {
        if let Some(program) = &self.shader_program {
            let pos_buffer = self.gl.create_buffer().ok_or("Failed to create buffer")?;
            self.gl.bind_buffer(WebGlRenderingContext::ARRAY_BUFFER, Some(&pos_buffer));
            
            unsafe {
                let array = js_sys::Float32Array::view(vertices);
                self.gl.buffer_data_with_array_buffer_view(WebGlRenderingContext::ARRAY_BUFFER, &array, WebGlRenderingContext::STATIC_DRAW);
            }
            
            let pos_loc = self.gl.get_attrib_location(program, "a_position") as u32;
            self.gl.enable_vertex_attrib_array(pos_loc);
            self.gl.vertex_attrib_pointer_with_i32(pos_loc, 2, WebGlRenderingContext::FLOAT, false, 0, 0);
            
            let tex_buffer = self.gl.create_buffer().ok_or("Failed to create buffer")?;
            self.gl.bind_buffer(WebGlRenderingContext::ARRAY_BUFFER, Some(&tex_buffer));
            
            unsafe {
                let array = js_sys::Float32Array::view(tex_coords);
                self.gl.buffer_data_with_array_buffer_view(WebGlRenderingContext::ARRAY_BUFFER, &array, WebGlRenderingContext::STATIC_DRAW);
            }
            
            let tex_loc = self.gl.get_attrib_location(program, "a_tex_coord") as u32;
            self.gl.enable_vertex_attrib_array(tex_loc);
            self.gl.vertex_attrib_pointer_with_i32(tex_loc, 2, WebGlRenderingContext::FLOAT, false, 0, 0);
            
            let color_loc = self.gl.get_uniform_location(program, "u_color");
            self.gl.uniform4f(color_loc.as_ref(), color[0], color[1], color[2], color[3]);
            
            let has_tex_loc = self.gl.get_uniform_location(program, "u_has_texture");
            self.gl.uniform1i(has_tex_loc.as_ref(), if has_texture { 1 } else { 0 });
            
            self.gl.draw_arrays(WebGlRenderingContext::TRIANGLE_STRIP, 0, 4);
        }
        
        Ok(())
    }
    
    fn draw_lines(&self, vertices: &[f32], color: [f32; 4]) -> Result<(), JsValue> {
        if let Some(program) = &self.shader_program {
            let buffer = self.gl.create_buffer().ok_or("Failed to create buffer")?;
            self.gl.bind_buffer(WebGlRenderingContext::ARRAY_BUFFER, Some(&buffer));
            
            unsafe {
                let array = js_sys::Float32Array::view(vertices);
                self.gl.buffer_data_with_array_buffer_view(WebGlRenderingContext::ARRAY_BUFFER, &array, WebGlRenderingContext::STATIC_DRAW);
            }
            
            let pos_loc = self.gl.get_attrib_location(program, "a_position") as u32;
            self.gl.enable_vertex_attrib_array(pos_loc);
            self.gl.vertex_attrib_pointer_with_i32(pos_loc, 2, WebGlRenderingContext::FLOAT, false, 0, 0);
            
            let color_loc = self.gl.get_uniform_location(program, "u_color");
            self.gl.uniform4f(color_loc.as_ref(), color[0], color[1], color[2], color[3]);
            
            let has_tex_loc = self.gl.get_uniform_location(program, "u_has_texture");
            self.gl.uniform1i(has_tex_loc.as_ref(), 0);
            
            self.gl.draw_arrays(WebGlRenderingContext::LINES, 0, (vertices.len() / 2) as i32);
        }
        
        Ok(())
    }
    
    fn get_world_view_bounds(&self) -> Rect {
        let top_left = self.camera.screen_to_world(Vec2::new(0.0, 0.0));
        let bottom_right = self.camera.screen_to_world(self.canvas_size);
        Rect { min: top_left, max: bottom_right }
    }
    
    // Public API
    #[wasm_bindgen]
    pub fn resize(&mut self, width: u32, height: u32) {
        self.canvas.set_width(width);
        self.canvas.set_height(height);
        self.canvas_size = Vec2::new(width as f32, height as f32);
        self.update_view_matrix();
        self.gl.viewport(0, 0, width as i32, height as i32);
    }
    
    #[wasm_bindgen]
    pub fn set_camera(&mut self, world_x: f64, world_y: f64, zoom: f64) {
        self.camera.world_x = world_x;
        self.camera.world_y = world_y;
        self.camera.zoom = zoom.clamp(0.1, 5.0);
        self.update_view_matrix();
    }
    
    #[wasm_bindgen]
    pub fn screen_to_world(&self, screen_x: f32, screen_y: f32) -> Vec<f64> {
        let world = self.camera.screen_to_world(Vec2::new(screen_x, screen_y));
        vec![world.x as f64, world.y as f64]
    }
    
    #[wasm_bindgen]
    pub fn add_sprite_to_layer(&mut self, layer_name: &str, sprite_data: &JsValue) -> Result<String, JsValue> {
        let mut sprite: Sprite = sprite_data.into_serde()
            .map_err(|e| JsValue::from_str(&format!("Failed to parse sprite: {}", e)))?;
        
        if sprite.id.is_empty() {
            sprite.id = format!("sprite_{}", js_sys::Math::random());
        }
        
        let sprite_id = sprite.id.clone();
        
        if let Some(layer) = self.layers.get_mut(layer_name) {
            layer.sprites.push(sprite);
        } else {
            return Err(JsValue::from_str("Layer not found"));
        }
        
        Ok(sprite_id)
    }
    
    #[wasm_bindgen]
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
    
    #[wasm_bindgen]
    pub fn handle_mouse_down(&mut self, screen_x: f32, screen_y: f32) {
        let world_pos = self.camera.screen_to_world(Vec2::new(screen_x, screen_y));
        self.last_mouse_screen = Vec2::new(screen_x, screen_y);
        
        // Find topmost sprite under cursor
        let mut selected_sprite = None;
        for (_, layer) in &self.layers {
            if !layer.selectable { continue; }
            for sprite in layer.sprites.iter().rev() {
                if sprite.contains_world_point(world_pos) {
                    selected_sprite = Some(sprite.id.clone());
                    self.drag_offset = Vec2::new(
                        world_pos.x - sprite.world_x as f32,
                        world_pos.y - sprite.world_y as f32
                    );
                    break;
                }
            }
            if selected_sprite.is_some() { break; }
        }
        
        if let Some(sprite_id) = selected_sprite {
            self.selected_sprite_id = Some(sprite_id);
            self.input_mode = InputMode::SpriteMove;
        } else {
            self.selected_sprite_id = None;
            self.input_mode = InputMode::CameraPan;
        }
    }
    
    #[wasm_bindgen]
    pub fn handle_mouse_move(&mut self, screen_x: f32, screen_y: f32) {
        let current_screen = Vec2::new(screen_x, screen_y);
        let world_pos = self.camera.screen_to_world(current_screen);
        
        match self.input_mode {
            InputMode::SpriteMove => {
                if let Some(sprite_id) = &self.selected_sprite_id {
                    for layer in self.layers.values_mut() {
                        if let Some(sprite) = layer.sprites.iter_mut().find(|s| &s.id == sprite_id) {
                            sprite.world_x = (world_pos.x - self.drag_offset.x) as f64;
                            sprite.world_y = (world_pos.y - self.drag_offset.y) as f64;
                            break;
                        }
                    }
                }
            }
            InputMode::CameraPan => {
                let screen_delta = current_screen - self.last_mouse_screen;
                let world_delta = screen_delta * (1.0 / self.camera.zoom as f32);
                self.camera.world_x -= world_delta.x as f64;
                self.camera.world_y -= world_delta.y as f64;
                self.update_view_matrix();
            }
            _ => {}
        }
        
        self.last_mouse_screen = current_screen;
    }
    
    #[wasm_bindgen]
    pub fn handle_mouse_up(&mut self, _screen_x: f32, _screen_y: f32) {
        self.input_mode = InputMode::None;
    }
    
    #[wasm_bindgen]
    pub fn handle_wheel(&mut self, screen_x: f32, screen_y: f32, delta_y: f32) {
        let zoom_factor = if delta_y > 0.0 { 0.9 } else { 1.1 };
        let world_point = self.camera.screen_to_world(Vec2::new(screen_x, screen_y));
        
        self.camera.zoom = (self.camera.zoom * zoom_factor as f64).clamp(0.1, 5.0);
        
        let new_screen = self.camera.world_to_screen(world_point);
        let screen_offset = Vec2::new(screen_x, screen_y) - new_screen;
        let world_offset = screen_offset * (1.0 / self.camera.zoom as f32);
        
        self.camera.world_x += world_offset.x as f64;
        self.camera.world_y += world_offset.y as f64;
        self.update_view_matrix();
    }
    
    #[wasm_bindgen]
    pub fn toggle_grid(&mut self) {
        self.grid_enabled = !self.grid_enabled;
    }
    
    #[wasm_bindgen]
    pub fn set_layer_opacity(&mut self, layer_name: &str, opacity: f32) {
        if let Some(layer) = self.layers.get_mut(layer_name) {
            layer.opacity = opacity.clamp(0.0, 1.0);
        }
    }
    
    #[wasm_bindgen]
    pub fn set_layer_visible(&mut self, layer_name: &str, visible: bool) {
        if let Some(layer) = self.layers.get_mut(layer_name) {
            layer.visible = visible;
        }
    }
}
