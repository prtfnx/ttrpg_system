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
    SpriteResize(ResizeHandle),
    SpriteRotate,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum ResizeHandle {
    TopLeft,
    TopRight,
    BottomLeft,
    BottomRight,
    TopCenter,
    BottomCenter,
    LeftCenter,
    RightCenter,
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
        
        // Calculate sprite vertices with rotation
        let vertices = if sprite.rotation != 0.0 {
            // Apply rotation around the sprite center
            let center_x = world_pos.x + size.x * 0.5;
            let center_y = world_pos.y + size.y * 0.5;
            let cos_rot = (sprite.rotation as f32).cos();
            let sin_rot = (sprite.rotation as f32).sin();
            let half_width = size.x * 0.5;
            let half_height = size.y * 0.5;
            
            // Calculate rotated corner positions
            let corners = [
                (-half_width, -half_height), // Top-left
                (half_width, -half_height),  // Top-right
                (-half_width, half_height),  // Bottom-left
                (half_width, half_height),   // Bottom-right
            ];
            
            let mut rotated_vertices = Vec::new();
            for (local_x, local_y) in corners {
                let rotated_x = local_x * cos_rot - local_y * sin_rot;
                let rotated_y = local_x * sin_rot + local_y * cos_rot;
                rotated_vertices.push(center_x + rotated_x);
                rotated_vertices.push(center_y + rotated_y);
            }
            rotated_vertices
        } else {
            // No rotation - use simple rectangle
            vec![
                world_pos.x, world_pos.y,                    // Top-left
                world_pos.x + size.x, world_pos.y,          // Top-right
                world_pos.x, world_pos.y + size.y,          // Bottom-left
                world_pos.x + size.x, world_pos.y + size.y, // Bottom-right
            ]
        };
        
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
            // Draw selection border (works for both rotated and non-rotated sprites)
            if sprite.rotation != 0.0 {
                // For rotated sprites, draw border using the same rotation calculation
                let center_x = world_pos.x + size.x * 0.5;
                let center_y = world_pos.y + size.y * 0.5;
                let cos_rot = (sprite.rotation as f32).cos();
                let sin_rot = (sprite.rotation as f32).sin();
                let half_width = size.x * 0.5;
                let half_height = size.y * 0.5;
                
                // Calculate rotated corner positions
                let corners = [
                    (-half_width, -half_height), // Top-left
                    (half_width, -half_height),  // Top-right  
                    (half_width, half_height),   // Bottom-right
                    (-half_width, half_height),  // Bottom-left
                ];
                
                let mut border_vertices = Vec::new();
                for i in 0..corners.len() {
                    let (local_x, local_y) = corners[i];
                    let (next_local_x, next_local_y) = corners[(i + 1) % corners.len()];
                    
                    let rotated_x = local_x * cos_rot - local_y * sin_rot;
                    let rotated_y = local_x * sin_rot + local_y * cos_rot;
                    let next_rotated_x = next_local_x * cos_rot - next_local_y * sin_rot;
                    let next_rotated_y = next_local_x * sin_rot + next_local_y * cos_rot;
                    
                    border_vertices.extend_from_slice(&[
                        center_x + rotated_x, center_y + rotated_y,
                        center_x + next_rotated_x, center_y + next_rotated_y,
                    ]);
                }
                self.draw_lines(&border_vertices, [0.2, 0.8, 0.2, 1.0])?;
            } else {
                // Non-rotated sprites use simple rectangle border
                // Top line
                let top_vertices = [
                    world_pos.x, world_pos.y,
                    world_pos.x + size.x, world_pos.y,
                ];
                self.draw_lines(&top_vertices, [0.2, 0.8, 0.2, 1.0])?;
                
                // Right line  
                let right_vertices = [
                    world_pos.x + size.x, world_pos.y,
                    world_pos.x + size.x, world_pos.y + size.y,
                ];
                self.draw_lines(&right_vertices, [0.2, 0.8, 0.2, 1.0])?;
                
                // Bottom line
                let bottom_vertices = [
                    world_pos.x + size.x, world_pos.y + size.y,
                    world_pos.x, world_pos.y + size.y,
                ];
                self.draw_lines(&bottom_vertices, [0.2, 0.8, 0.2, 1.0])?;
                
                // Left line
                let left_vertices = [
                    world_pos.x, world_pos.y + size.y,
                    world_pos.x, world_pos.y,
                ];
                self.draw_lines(&left_vertices, [0.2, 0.8, 0.2, 1.0])?;
            }
            
            // Draw rotation handle (circle above sprite)
            let rotate_handle_x = world_pos.x + size.x * 0.5;
            let rotate_handle_y = world_pos.y - 20.0 / self.camera.zoom as f32;
            let handle_size = 8.0 / self.camera.zoom as f32;
            self.draw_rotate_handle(rotate_handle_x, rotate_handle_y, handle_size)?;
        }
        
        Ok(())
    }
    
    fn draw_resize_handle(&self, x: f32, y: f32, size: f32) -> Result<(), JsValue> {
        let half = size * 0.5;
        let vertices = [
            x - half, y - half,
            x + half, y - half,
            x - half, y + half,
            x + half, y + half,
        ];
        let tex_coords = [0.0, 0.0, 1.0, 0.0, 0.0, 1.0, 1.0, 1.0];
        self.draw_quad(&vertices, &tex_coords, [1.0, 1.0, 1.0, 1.0], false)?;
        
        // Black border
        let border = [
            x - half, y - half,
            x + half, y - half,
            x + half, y + half,
            x - half, y + half,
            x - half, y - half,
        ];
        self.draw_lines(&border, [0.0, 0.0, 0.0, 1.0])
    }
    
    fn draw_rotate_handle(&self, x: f32, y: f32, size: f32) -> Result<(), JsValue> {
        // Draw a simple circle approximation using lines
        let radius = size * 0.7;
        let mut vertices = Vec::new();
        let segments = 12;
        
        for i in 0..segments {
            let angle1 = (i as f32) * 2.0 * std::f32::consts::PI / (segments as f32);
            let angle2 = ((i + 1) as f32) * 2.0 * std::f32::consts::PI / (segments as f32);
            
            vertices.extend_from_slice(&[
                x + radius * angle1.cos(), y + radius * angle1.sin(),
                x + radius * angle2.cos(), y + radius * angle2.sin(),
            ]);
        }
        
        self.draw_lines(&vertices, [0.8, 0.4, 0.0, 1.0]) // Orange color
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
    pub fn get_cursor_type(&self, screen_x: f32, screen_y: f32) -> String {
        let world_pos = self.camera.screen_to_world(Vec2::new(screen_x, screen_y));
        
        if let Some(selected_id) = &self.selected_sprite_id {
            if let Some((sprite, _)) = self.find_sprite(selected_id) {
                let sprite_pos = Vec2::new(sprite.world_x as f32, sprite.world_y as f32);
                let sprite_size = Vec2::new(
                    (sprite.width * sprite.scale_x) as f32,
                    (sprite.height * sprite.scale_y) as f32
                );
                
                // Check if on selection border (for resizing)
                let border_threshold = 3.0 / self.camera.zoom as f32;
                
                // Check edges for different resize cursors
                let on_left = (world_pos.x >= sprite_pos.x - border_threshold) && (world_pos.x <= sprite_pos.x + border_threshold);
                let on_right = (world_pos.x >= sprite_pos.x + sprite_size.x - border_threshold) && (world_pos.x <= sprite_pos.x + sprite_size.x + border_threshold);
                let on_top = (world_pos.y >= sprite_pos.y - border_threshold) && (world_pos.y <= sprite_pos.y + border_threshold);
                let on_bottom = (world_pos.y >= sprite_pos.y + sprite_size.y - border_threshold) && (world_pos.y <= sprite_pos.y + sprite_size.y + border_threshold);
                
                let in_x_range = world_pos.x >= sprite_pos.x && world_pos.x <= sprite_pos.x + sprite_size.x;
                let in_y_range = world_pos.y >= sprite_pos.y && world_pos.y <= sprite_pos.y + sprite_size.y;
                
                // Corner resize cursors
                if (on_left && on_top) || (on_right && on_bottom) {
                    return "nw-resize".to_string();
                }
                if (on_right && on_top) || (on_left && on_bottom) {
                    return "ne-resize".to_string();
                }
                
                // Edge resize cursors
                if (on_left || on_right) && in_y_range {
                    return "ew-resize".to_string();
                }
                if (on_top || on_bottom) && in_x_range {
                    return "ns-resize".to_string();
                }
                
                // Check rotation handle
                let rotate_handle_x = sprite_pos.x + sprite_size.x * 0.5;
                let rotate_handle_y = sprite_pos.y - 20.0 / self.camera.zoom as f32;
                let handle_size = 8.0 / self.camera.zoom as f32;
                if self.point_in_handle(world_pos, rotate_handle_x, rotate_handle_y, handle_size) {
                    return "crosshair".to_string();
                }
                
                // Check if over sprite body
                if sprite.contains_world_point(world_pos) {
                    return "move".to_string();
                }
            }
        }
        
        // Check if over any sprite
        for (_, layer) in &self.layers {
            if !layer.visible { continue; }
            for sprite in layer.sprites.iter().rev() {
                if sprite.contains_world_point(world_pos) {
                    return "pointer".to_string();
                }
            }
        }
        
        "default".to_string()
    }
    
    #[wasm_bindgen]
    pub fn handle_mouse_down(&mut self, screen_x: f32, screen_y: f32) {
        let world_pos = self.camera.screen_to_world(Vec2::new(screen_x, screen_y));
        self.last_mouse_screen = Vec2::new(screen_x, screen_y);
        
        // First check if we're clicking on edges of the selected sprite for resizing
        if let Some(selected_id) = &self.selected_sprite_id.clone() {
            if let Some((sprite, _)) = self.find_sprite(selected_id) {
                let sprite_pos = Vec2::new(sprite.world_x as f32, sprite.world_y as f32);
                let sprite_size = Vec2::new(
                    (sprite.width * sprite.scale_x) as f32,
                    (sprite.height * sprite.scale_y) as f32
                );
                
                // Check if on selection border for resizing
                let border_threshold = 3.0 / self.camera.zoom as f32;
                
                let on_left = (world_pos.x >= sprite_pos.x - border_threshold) && (world_pos.x <= sprite_pos.x + border_threshold);
                let on_right = (world_pos.x >= sprite_pos.x + sprite_size.x - border_threshold) && (world_pos.x <= sprite_pos.x + sprite_size.x + border_threshold);
                let on_top = (world_pos.y >= sprite_pos.y - border_threshold) && (world_pos.y <= sprite_pos.y + border_threshold);
                let on_bottom = (world_pos.y >= sprite_pos.y + sprite_size.y - border_threshold) && (world_pos.y <= sprite_pos.y + sprite_size.y + border_threshold);
                
                let in_x_range = world_pos.x >= sprite_pos.x && world_pos.x <= sprite_pos.x + sprite_size.x;
                let in_y_range = world_pos.y >= sprite_pos.y && world_pos.y <= sprite_pos.y + sprite_size.y;
                
                // Check corners first
                if on_left && on_top {
                    self.input_mode = InputMode::SpriteResize(ResizeHandle::TopLeft);
                    return;
                }
                if on_right && on_top {
                    self.input_mode = InputMode::SpriteResize(ResizeHandle::TopRight);
                    return;
                }
                if on_left && on_bottom {
                    self.input_mode = InputMode::SpriteResize(ResizeHandle::BottomLeft);
                    return;
                }
                if on_right && on_bottom {
                    self.input_mode = InputMode::SpriteResize(ResizeHandle::BottomRight);
                    return;
                }
                
                // Check edges
                if (on_left || on_right) && in_y_range {
                    if on_left {
                        self.input_mode = InputMode::SpriteResize(ResizeHandle::LeftCenter);
                    } else {
                        self.input_mode = InputMode::SpriteResize(ResizeHandle::RightCenter);
                    }
                    return;
                }
                if (on_top || on_bottom) && in_x_range {
                    if on_top {
                        self.input_mode = InputMode::SpriteResize(ResizeHandle::TopCenter);
                    } else {
                        self.input_mode = InputMode::SpriteResize(ResizeHandle::BottomCenter);
                    }
                    return;
                }
                
                // Check rotation handle
                let rotate_handle_x = sprite_pos.x + sprite_size.x * 0.5;
                let rotate_handle_y = sprite_pos.y - 20.0 / self.camera.zoom as f32;
                let handle_size = 8.0 / self.camera.zoom as f32;
                if self.point_in_handle(world_pos, rotate_handle_x, rotate_handle_y, handle_size) {
                    self.input_mode = InputMode::SpriteRotate;
                    return;
                }
            }
        }
        
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
    
    fn point_in_handle(&self, point: Vec2, handle_x: f32, handle_y: f32, handle_size: f32) -> bool {
        let half = handle_size * 0.5;
        point.x >= handle_x - half && point.x <= handle_x + half &&
        point.y >= handle_y - half && point.y <= handle_y + half
    }
    
    fn find_sprite(&self, sprite_id: &str) -> Option<(&Sprite, &str)> {
        for (layer_name, layer) in &self.layers {
            if let Some(sprite) = layer.sprites.iter().find(|s| s.id == sprite_id) {
                return Some((sprite, layer_name));
            }
        }
        None
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
            InputMode::SpriteResize(handle) => {
                if let Some(sprite_id) = &self.selected_sprite_id {
                    let sprite_id = sprite_id.clone(); // Clone to avoid borrow issues
                    for layer in self.layers.values_mut() {
                        if let Some(sprite) = layer.sprites.iter_mut().find(|s| s.id == sprite_id) {
                            Self::resize_sprite_with_handle(sprite, handle, world_pos);
                            break;
                        }
                    }
                }
            }
            InputMode::SpriteRotate => {
                if let Some(sprite_id) = &self.selected_sprite_id {
                    for layer in self.layers.values_mut() {
                        if let Some(sprite) = layer.sprites.iter_mut().find(|s| &s.id == sprite_id) {
                            let sprite_center = Vec2::new(
                                sprite.world_x as f32 + (sprite.width * sprite.scale_x) as f32 * 0.5,
                                sprite.world_y as f32 + (sprite.height * sprite.scale_y) as f32 * 0.5
                            );
                            let dx = world_pos.x - sprite_center.x;
                            let dy = world_pos.y - sprite_center.y;
                            sprite.rotation = dy.atan2(dx) as f64;
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
    
    fn resize_sprite_with_handle(sprite: &mut Sprite, handle: ResizeHandle, world_pos: Vec2) {
        let original_pos = Vec2::new(sprite.world_x as f32, sprite.world_y as f32);
        let original_size = Vec2::new(
            (sprite.width * sprite.scale_x) as f32,
            (sprite.height * sprite.scale_y) as f32
        );
        
        match handle {
            ResizeHandle::TopLeft => {
                let new_width = (original_pos.x + original_size.x - world_pos.x).max(10.0);
                let new_height = (original_pos.y + original_size.y - world_pos.y).max(10.0);
                sprite.world_x = (original_pos.x + original_size.x - new_width) as f64;
                sprite.world_y = (original_pos.y + original_size.y - new_height) as f64;
                sprite.width = new_width as f64 / sprite.scale_x;
                sprite.height = new_height as f64 / sprite.scale_y;
            }
            ResizeHandle::TopRight => {
                let new_width = (world_pos.x - original_pos.x).max(10.0);
                let new_height = (original_pos.y + original_size.y - world_pos.y).max(10.0);
                sprite.world_y = (original_pos.y + original_size.y - new_height) as f64;
                sprite.width = new_width as f64 / sprite.scale_x;
                sprite.height = new_height as f64 / sprite.scale_y;
            }
            ResizeHandle::BottomLeft => {
                let new_width = (original_pos.x + original_size.x - world_pos.x).max(10.0);
                let new_height = (world_pos.y - original_pos.y).max(10.0);
                sprite.world_x = (original_pos.x + original_size.x - new_width) as f64;
                sprite.width = new_width as f64 / sprite.scale_x;
                sprite.height = new_height as f64 / sprite.scale_y;
            }
            ResizeHandle::BottomRight => {
                let new_width = (world_pos.x - original_pos.x).max(10.0);
                let new_height = (world_pos.y - original_pos.y).max(10.0);
                sprite.width = new_width as f64 / sprite.scale_x;
                sprite.height = new_height as f64 / sprite.scale_y;
            }
            ResizeHandle::TopCenter => {
                let new_height = (original_pos.y + original_size.y - world_pos.y).max(10.0);
                sprite.world_y = (original_pos.y + original_size.y - new_height) as f64;
                sprite.height = new_height as f64 / sprite.scale_y;
            }
            ResizeHandle::BottomCenter => {
                let new_height = (world_pos.y - original_pos.y).max(10.0);
                sprite.height = new_height as f64 / sprite.scale_y;
            }
            ResizeHandle::LeftCenter => {
                let new_width = (original_pos.x + original_size.x - world_pos.x).max(10.0);
                sprite.world_x = (original_pos.x + original_size.x - new_width) as f64;
                sprite.width = new_width as f64 / sprite.scale_x;
            }
            ResizeHandle::RightCenter => {
                let new_width = (world_pos.x - original_pos.x).max(10.0);
                sprite.width = new_width as f64 / sprite.scale_x;
            }
        }
    }
    
    #[wasm_bindgen]
    pub fn handle_mouse_up(&mut self, _screen_x: f32, _screen_y: f32) {
        self.input_mode = InputMode::None;
    }
    
    #[wasm_bindgen]
    pub fn handle_wheel(&mut self, screen_x: f32, screen_y: f32, delta_y: f32) {
        let zoom_factor = if delta_y > 0.0 { 0.9 } else { 1.1 };
        
        // Get the world position under the mouse cursor before zoom
        let world_point_before = self.camera.screen_to_world(Vec2::new(screen_x, screen_y));
        
        // Update zoom
        let old_zoom = self.camera.zoom;
        self.camera.zoom = (self.camera.zoom * zoom_factor as f64).clamp(0.1, 5.0);
        
        // If zoom actually changed, adjust camera position to keep world point under cursor
        if self.camera.zoom != old_zoom {
            let world_point_after = self.camera.screen_to_world(Vec2::new(screen_x, screen_y));
            let world_delta = world_point_before - world_point_after;
            
            self.camera.world_x += world_delta.x as f64;
            self.camera.world_y += world_delta.y as f64;
        }
        
        self.update_view_matrix();
    }
    
    #[wasm_bindgen]
    pub fn handle_right_click(&mut self, screen_x: f32, screen_y: f32) -> Option<String> {
        let world_pos = self.camera.screen_to_world(Vec2::new(screen_x, screen_y));
        
        // Find topmost sprite under cursor
        for (_, layer) in &self.layers {
            if !layer.visible { continue; }
            for sprite in layer.sprites.iter().rev() {
                if sprite.contains_world_point(world_pos) {
                    self.selected_sprite_id = Some(sprite.id.clone());
                    return Some(sprite.id.clone());
                }
            }
        }
        None
    }
    
    #[wasm_bindgen]
    pub fn delete_sprite(&mut self, sprite_id: &str) -> bool {
        for layer in self.layers.values_mut() {
            if let Some(pos) = layer.sprites.iter().position(|s| s.id == sprite_id) {
                layer.sprites.remove(pos);
                if self.selected_sprite_id.as_ref() == Some(&sprite_id.to_string()) {
                    self.selected_sprite_id = None;
                }
                return true;
            }
        }
        false
    }
    
    #[wasm_bindgen]
    pub fn copy_sprite(&self, sprite_id: &str) -> Option<String> {
        for layer in self.layers.values() {
            if let Some(sprite) = layer.sprites.iter().find(|s| s.id == sprite_id) {
                match serde_json::to_string(sprite) {
                    Ok(json) => return Some(json),
                    Err(_) => return None,
                }
            }
        }
        None
    }
    
    #[wasm_bindgen]
    pub fn paste_sprite(&mut self, layer_name: &str, sprite_json: &str, offset_x: f64, offset_y: f64) -> Result<String, JsValue> {
        let mut sprite: Sprite = serde_json::from_str(sprite_json)
            .map_err(|e| JsValue::from_str(&format!("Failed to parse sprite: {}", e)))?;
        
        // Generate new ID and apply offset
        sprite.id = format!("sprite_{}", js_sys::Date::now() as u64);
        sprite.world_x += offset_x;
        sprite.world_y += offset_y;
        
        let sprite_id = sprite.id.clone();
        
        if let Some(layer) = self.layers.get_mut(layer_name) {
            layer.sprites.push(sprite);
        } else {
            return Err(JsValue::from_str(&format!("Layer '{}' not found", layer_name)));
        }
        
        Ok(sprite_id)
    }
    
    #[wasm_bindgen]
    pub fn resize_sprite(&mut self, sprite_id: &str, new_width: f64, new_height: f64) -> bool {
        for layer in self.layers.values_mut() {
            if let Some(sprite) = layer.sprites.iter_mut().find(|s| s.id == sprite_id) {
                sprite.width = new_width;
                sprite.height = new_height;
                return true;
            }
        }
        false
    }
    
    #[wasm_bindgen]
    pub fn rotate_sprite(&mut self, sprite_id: &str, rotation_degrees: f64) -> bool {
        for layer in self.layers.values_mut() {
            if let Some(sprite) = layer.sprites.iter_mut().find(|s| s.id == sprite_id) {
                sprite.rotation = rotation_degrees.to_radians();
                return true;
            }
        }
        false
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
