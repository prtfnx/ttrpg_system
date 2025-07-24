use wasm_bindgen::prelude::*;
use web_sys::{HtmlCanvasElement, WebGl2RenderingContext as WebGlRenderingContext, WebGlProgram, WebGlShader, WebGlTexture, HtmlImageElement};
use std::collections::HashMap;
use crate::types::*;
use gloo_utils::format::JsValueSerdeExt;

// Import the `console.log` function from the host environment
#[wasm_bindgen]
extern "C" {
    #[wasm_bindgen(js_namespace = console)]
    fn log(s: &str);
}

// Define a macro to make console.log! work like println!
macro_rules! console_log {
    ($($t:tt)*) => (log(&format_args!($($t)*).to_string()))
}

#[wasm_bindgen]
pub struct RenderManager {
    canvas: HtmlCanvasElement,
    gl: WebGlRenderingContext,
    shader_program: Option<WebGlProgram>,
    sprites: Vec<Sprite>,
    camera: Camera,
    textures: HashMap<String, WebGlTexture>,
    is_dragging: bool,
    last_mouse_pos: (f32, f32),
    grid_enabled: bool,
    selected_sprite: Option<String>,
    drag_mode: DragMode,
    drag_offset: (f64, f64),
    resize_handle: Option<ResizeHandle>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum DragMode {
    None,
    Camera,
    MoveSprite,
    ResizeSprite,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum ResizeHandle {
    BottomRight,
    // Add more handles if needed
}

#[wasm_bindgen]
impl RenderManager {
    #[wasm_bindgen(constructor)]
    pub fn new(canvas: HtmlCanvasElement) -> Result<RenderManager, JsValue> {
        let gl = canvas
            .get_context("webgl2")?
            .unwrap()
            .dyn_into::<WebGlRenderingContext>()?;

        let mut renderer = RenderManager {
            canvas,
            gl,
            shader_program: None,
            sprites: Vec::new(),
            camera: Camera::default(),
            textures: HashMap::new(),
            is_dragging: false,
            last_mouse_pos: (0.0, 0.0),
            grid_enabled: true,
            selected_sprite: None,
            drag_mode: DragMode::None,
            drag_offset: (0.0, 0.0),
            resize_handle: None,
        };

        renderer.init_shaders()?;
        renderer.setup_gl()?;

        Ok(renderer)
    }

    fn init_shaders(&mut self) -> Result<(), JsValue> {
        let vertex_shader_source = r#"
            attribute vec2 a_position;
            attribute vec2 a_texCoord;
            
            uniform mat3 u_transform;
            uniform vec2 u_resolution;
            
            varying vec2 v_texCoord;
            
            void main() {
                vec3 position = u_transform * vec3(a_position, 1.0);
                vec2 clipSpace = ((position.xy / u_resolution) * 2.0) - 1.0;
                gl_Position = vec4(clipSpace * vec2(1, -1), 0, 1);
                v_texCoord = a_texCoord;
            }
        "#;

        let fragment_shader_source = r#"
            precision mediump float;
            
            varying vec2 v_texCoord;
            uniform sampler2D u_texture;
            uniform vec4 u_color;
            uniform bool u_hasTexture;
            
            void main() {
                if (u_hasTexture) {
                    gl_FragColor = texture2D(u_texture, v_texCoord) * u_color;
                } else {
                    gl_FragColor = u_color;
                }
            }
        "#;

        let vertex_shader = self.compile_shader(WebGlRenderingContext::VERTEX_SHADER, vertex_shader_source)?;
        let fragment_shader = self.compile_shader(WebGlRenderingContext::FRAGMENT_SHADER, fragment_shader_source)?;
        
        let program = self.gl.create_program().ok_or("Failed to create program")?;
        self.gl.attach_shader(&program, &vertex_shader);
        self.gl.attach_shader(&program, &fragment_shader);
        self.gl.link_program(&program);

        if !self.gl.get_program_parameter(&program, WebGlRenderingContext::LINK_STATUS).as_bool().unwrap_or(false) {
            return Err(JsValue::from_str(&format!(
                "Failed to link shader program: {}",
                self.gl.get_program_info_log(&program).unwrap_or_default()
            )));
        }

        self.shader_program = Some(program);
        Ok(())
    }

    fn compile_shader(&self, shader_type: u32, source: &str) -> Result<WebGlShader, JsValue> {
        let shader = self.gl.create_shader(shader_type).ok_or("Failed to create shader")?;
        self.gl.shader_source(&shader, source);
        self.gl.compile_shader(&shader);

        if !self.gl.get_shader_parameter(&shader, WebGlRenderingContext::COMPILE_STATUS).as_bool().unwrap_or(false) {
            return Err(JsValue::from_str(&format!(
                "Failed to compile shader: {}",
                self.gl.get_shader_info_log(&shader).unwrap_or_default()
            )));
        }

        Ok(shader)
    }

    fn setup_gl(&mut self) -> Result<(), JsValue> {
        self.gl.enable(WebGlRenderingContext::BLEND);
        self.gl.blend_func(WebGlRenderingContext::SRC_ALPHA, WebGlRenderingContext::ONE_MINUS_SRC_ALPHA);
        self.gl.clear_color(0.1, 0.1, 0.1, 1.0);
        Ok(())
    }

    #[wasm_bindgen]
    pub fn add_sprite(&mut self, sprite_data: &JsValue) -> Result<(), JsValue> {
        console_log!("add_sprite called with data: {:?}", sprite_data);
        
        let mut sprite: Sprite = sprite_data.into_serde()
            .map_err(|e| {
                console_log!("Failed to parse sprite JSON: {}", e);
                JsValue::from_str(&format!("Failed to parse sprite: {}", e))
            })?;
        
        console_log!("Parsed sprite: id='{}', texture_path='{}', pos=({}, {})", 
                    sprite.id, sprite.texture_path, sprite.x, sprite.y);
        
        // Generate unique ID if not provided
        if sprite.id.is_empty() {
            sprite.id = format!("sprite_{}", self.sprites.len());
            console_log!("Generated sprite ID: {}", sprite.id);
        }
        
        // Check if texture exists
        if !sprite.texture_path.is_empty() {
            if self.textures.contains_key(&sprite.texture_path) {
                console_log!("Texture '{}' found in texture map", sprite.texture_path);
            } else {
                console_log!("WARNING: Texture '{}' not found! Available textures: {:?}", 
                            sprite.texture_path, self.textures.keys().collect::<Vec<_>>());
            }
        } else {
            console_log!("Sprite has no texture_path, will render as colored rectangle");
        }
        
        self.sprites.push(sprite);
        console_log!("Added sprite. Total sprites: {}", self.sprites.len());
        Ok(())
    }

    #[wasm_bindgen]
    pub fn load_texture(&mut self, name: &str, image: &HtmlImageElement) -> Result<(), JsValue> {
        console_log!("Loading texture: {}", name);
        console_log!("Image size: {}x{}", image.width(), image.height());
        
        let texture = self.gl.create_texture().ok_or("Failed to create texture")?;
        
        self.gl.bind_texture(WebGlRenderingContext::TEXTURE_2D, Some(&texture));
        self.gl.tex_image_2d_with_u32_and_u32_and_html_image_element(
            WebGlRenderingContext::TEXTURE_2D,
            0,
            WebGlRenderingContext::RGBA as i32,
            WebGlRenderingContext::RGBA,
            WebGlRenderingContext::UNSIGNED_BYTE,
            image,
        )?;
        
        // Set texture parameters for pixel art
        self.gl.tex_parameteri(WebGlRenderingContext::TEXTURE_2D, WebGlRenderingContext::TEXTURE_MIN_FILTER, WebGlRenderingContext::NEAREST as i32);
        self.gl.tex_parameteri(WebGlRenderingContext::TEXTURE_2D, WebGlRenderingContext::TEXTURE_MAG_FILTER, WebGlRenderingContext::NEAREST as i32);
        self.gl.tex_parameteri(WebGlRenderingContext::TEXTURE_2D, WebGlRenderingContext::TEXTURE_WRAP_S, WebGlRenderingContext::CLAMP_TO_EDGE as i32);
        self.gl.tex_parameteri(WebGlRenderingContext::TEXTURE_2D, WebGlRenderingContext::TEXTURE_WRAP_T, WebGlRenderingContext::CLAMP_TO_EDGE as i32);
        
        self.textures.insert(name.to_string(), texture);
        console_log!("Texture '{}' loaded successfully. Total textures: {}", name, self.textures.len());
        
        // List all available textures for debugging
        let texture_names: Vec<&str> = self.textures.keys().map(|s| s.as_str()).collect();
        console_log!("Available textures: {:?}", texture_names);
        
        Ok(())
    }

    #[wasm_bindgen]
    pub fn render(&mut self) -> Result<(), JsValue> {
        let width = self.canvas.width() as f32;
        let height = self.canvas.height() as f32;
        
        self.gl.viewport(0, 0, width as i32, height as i32);
        self.gl.clear(WebGlRenderingContext::COLOR_BUFFER_BIT);
        
        if let Some(program) = &self.shader_program {
            self.gl.use_program(Some(program));
            
            // Set resolution uniform
            let resolution_location = self.gl.get_uniform_location(program, "u_resolution");
            self.gl.uniform2f(resolution_location.as_ref(), width, height);
            
            // Draw grid if enabled
            if self.grid_enabled {
                self.draw_grid(width, height)?;
            }
            
            // Draw sprites
            console_log!("Rendering {} sprites", self.sprites.len());
            for sprite in &self.sprites {
                self.draw_sprite(sprite)?;
            }
        }
        
        Ok(())
    }

    fn draw_grid(&self, width: f32, height: f32) -> Result<(), JsValue> {
        let grid_size = 50.0 * self.camera.zoom as f32;
        let start_x = (-self.camera.x as f32 % grid_size) - grid_size;
        let start_y = (-self.camera.y as f32 % grid_size) - grid_size;
        
        // Create line vertices for grid
        let mut vertices = Vec::new();
        
        // Vertical lines
        let mut x = start_x;
        while x < width + grid_size {
            vertices.extend_from_slice(&[
                x, 0.0,
                x, height,
            ]);
            x += grid_size;
        }
        
        // Horizontal lines
        let mut y = start_y;
        while y < height + grid_size {
            vertices.extend_from_slice(&[
                0.0, y,
                width, y,
            ]);
            y += grid_size;
        }
        
        self.draw_lines(&vertices, (0.2, 0.2, 0.2, 1.0))?;
        Ok(())
    }

    fn draw_sprite(&self, sprite: &Sprite) -> Result<(), JsValue> {
        let is_selected = self.selected_sprite.as_ref().map_or(false, |id| id == &sprite.id);
        let border_color = if is_selected { (0.2, 0.8, 0.2, 1.0) } else { (1.0, 1.0, 1.0, 1.0) };
        let world_x = sprite.x as f32 - self.camera.x as f32;
        let world_y = sprite.y as f32 - self.camera.y as f32;
        let scaled_width = (sprite.width * sprite.scale_x * self.camera.zoom) as f32;
        let scaled_height = (sprite.height * sprite.scale_y * self.camera.zoom) as f32;
        let vertices = [
            world_x, world_y,
            world_x + scaled_width, world_y,
            world_x, world_y + scaled_height,
            world_x + scaled_width, world_y + scaled_height,
        ];
        let tex_coords = [
            0.0, 1.0,
            1.0, 1.0,
            0.0, 0.0,
            1.0, 0.0,
        ];
        let has_texture = !sprite.texture_path.is_empty() && self.textures.contains_key(&sprite.texture_path);
        if has_texture {
            if let Some(texture) = self.textures.get(&sprite.texture_path) {
                self.gl.bind_texture(WebGlRenderingContext::TEXTURE_2D, Some(texture));
            }
        }
        self.draw_quad(&vertices, &tex_coords, border_color, has_texture)?;
        // Draw selection border if selected
        if is_selected {
            let border_vertices = [
                world_x, world_y,
                world_x + scaled_width, world_y,
                world_x + scaled_width, world_y + scaled_height,
                world_x, world_y + scaled_height,
                world_x, world_y,
            ];
            self.draw_lines(&border_vertices, (0.2, 0.8, 0.2, 1.0))?;
        }
        Ok(())
    }

    fn draw_quad(&self, vertices: &[f32], tex_coords: &[f32], color: (f32, f32, f32, f32), has_texture: bool) -> Result<(), JsValue> {
        if let Some(program) = &self.shader_program {
            // Create and bind vertex buffer
            let position_buffer = self.gl.create_buffer().ok_or("Failed to create position buffer")?;
            self.gl.bind_buffer(WebGlRenderingContext::ARRAY_BUFFER, Some(&position_buffer));
            
            unsafe {
                let positions_array = js_sys::Float32Array::view(vertices);
                self.gl.buffer_data_with_array_buffer_view(
                    WebGlRenderingContext::ARRAY_BUFFER,
                    &positions_array,
                    WebGlRenderingContext::STATIC_DRAW,
                );
            }
            
            let position_location = self.gl.get_attrib_location(program, "a_position") as u32;
            self.gl.enable_vertex_attrib_array(position_location);
            self.gl.vertex_attrib_pointer_with_i32(position_location, 2, WebGlRenderingContext::FLOAT, false, 0, 0);
            
            // Create and bind texture coordinate buffer
            let tex_coord_buffer = self.gl.create_buffer().ok_or("Failed to create tex coord buffer")?;
            self.gl.bind_buffer(WebGlRenderingContext::ARRAY_BUFFER, Some(&tex_coord_buffer));
            
            unsafe {
                let tex_coords_array = js_sys::Float32Array::view(tex_coords);
                self.gl.buffer_data_with_array_buffer_view(
                    WebGlRenderingContext::ARRAY_BUFFER,
                    &tex_coords_array,
                    WebGlRenderingContext::STATIC_DRAW,
                );
            }
            
            let tex_coord_location = self.gl.get_attrib_location(program, "a_texCoord") as u32;
            self.gl.enable_vertex_attrib_array(tex_coord_location);
            self.gl.vertex_attrib_pointer_with_i32(tex_coord_location, 2, WebGlRenderingContext::FLOAT, false, 0, 0);
            
            // Set uniforms
            let transform_location = self.gl.get_uniform_location(program, "u_transform");
            let transform_matrix = [
                self.camera.zoom as f32, 0.0, -self.camera.x as f32,
                0.0, self.camera.zoom as f32, -self.camera.y as f32,
                0.0, 0.0, 1.0,
            ];
            self.gl.uniform_matrix3fv_with_f32_array(transform_location.as_ref(), false, &transform_matrix);
            
            let color_location = self.gl.get_uniform_location(program, "u_color");
            self.gl.uniform4f(color_location.as_ref(), color.0, color.1, color.2, color.3);
            
            let has_texture_location = self.gl.get_uniform_location(program, "u_hasTexture");
            self.gl.uniform1i(has_texture_location.as_ref(), if has_texture { 1 } else { 0 });
            
            // Draw
            self.gl.draw_arrays(WebGlRenderingContext::TRIANGLE_STRIP, 0, 4);
        }
        
        Ok(())
    }

    fn draw_lines(&self, vertices: &[f32], color: (f32, f32, f32, f32)) -> Result<(), JsValue> {
        if let Some(program) = &self.shader_program {
            let position_buffer = self.gl.create_buffer().ok_or("Failed to create position buffer")?;
            self.gl.bind_buffer(WebGlRenderingContext::ARRAY_BUFFER, Some(&position_buffer));
            
            unsafe {
                let positions_array = js_sys::Float32Array::view(vertices);
                self.gl.buffer_data_with_array_buffer_view(
                    WebGlRenderingContext::ARRAY_BUFFER,
                    &positions_array,
                    WebGlRenderingContext::STATIC_DRAW,
                );
            }
            
            let position_location = self.gl.get_attrib_location(program, "a_position") as u32;
            self.gl.enable_vertex_attrib_array(position_location);
            self.gl.vertex_attrib_pointer_with_i32(position_location, 2, WebGlRenderingContext::FLOAT, false, 0, 0);
            
            // Set uniforms
            let transform_location = self.gl.get_uniform_location(program, "u_transform");
            let identity_matrix = [1.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0];
            self.gl.uniform_matrix3fv_with_f32_array(transform_location.as_ref(), false, &identity_matrix);
            
            let color_location = self.gl.get_uniform_location(program, "u_color");
            self.gl.uniform4f(color_location.as_ref(), color.0, color.1, color.2, color.3);
            
            let has_texture_location = self.gl.get_uniform_location(program, "u_hasTexture");
            self.gl.uniform1i(has_texture_location.as_ref(), 0);
            
            self.gl.draw_arrays(WebGlRenderingContext::LINES, 0, (vertices.len() / 2) as i32);
        }
        
        Ok(())
    }

    // Sprite selection, movement, resize, and scaling
    #[wasm_bindgen]
    pub fn handle_mouse_down(&mut self, x: f32, y: f32) {
        let world = self.screen_to_world(x as f64, y as f64);
        let wx = world[0];
        let wy = world[1];
        // Check for resize handle first if a sprite is selected
        if let Some(selected_id) = &self.selected_sprite {
            if let Some(sprite) = self.sprites.iter().find(|s| &s.id == selected_id) {
                let handle_size = 12.0 / self.camera.zoom;
                let handle_x = sprite.x + sprite.width * sprite.scale_x;
                let handle_y = sprite.y + sprite.height * sprite.scale_y;
                if (wx - handle_x).abs() < handle_size && (wy - handle_y).abs() < handle_size {
                    self.drag_mode = DragMode::ResizeSprite;
                    self.resize_handle = Some(ResizeHandle::BottomRight);
                    self.last_mouse_pos = (x, y);
                    return;
                }
            }
        }
        // Check for sprite under cursor
        if let Some((idx, sprite)) = self.sprites.iter().enumerate().rev().find(|(_, s)| {
            wx >= s.x && wx <= s.x + s.width * s.scale_x && wy >= s.y && wy <= s.y + s.height * s.scale_y
        }) {
            self.selected_sprite = Some(sprite.id.clone());
            self.drag_mode = DragMode::MoveSprite;
            self.drag_offset = (wx - sprite.x, wy - sprite.y);
            self.last_mouse_pos = (x, y);
            // Bring selected sprite to front
            let sprite = self.sprites.remove(idx);
            self.sprites.push(sprite);
        } else {
            self.selected_sprite = None;
            self.drag_mode = DragMode::Camera;
            self.last_mouse_pos = (x, y);
        }
    }

    #[wasm_bindgen]
    pub fn handle_mouse_move(&mut self, x: f32, y: f32) {
        let world = self.screen_to_world(x as f64, y as f64);
        let wx = world[0];
        let wy = world[1];
        match self.drag_mode {
            DragMode::MoveSprite => {
                if let Some(selected_id) = &self.selected_sprite {
                    if let Some(sprite) = self.sprites.iter_mut().find(|s| &s.id == selected_id) {
                        sprite.x = wx - self.drag_offset.0;
                        sprite.y = wy - self.drag_offset.1;
                    }
                }
            }
            DragMode::ResizeSprite => {
                if let Some(selected_id) = &self.selected_sprite {
                    if let Some(sprite) = self.sprites.iter_mut().find(|s| &s.id == selected_id) {
                        let min_size = 10.0;
                        let new_width = (wx - sprite.x).max(min_size);
                        let new_height = (wy - sprite.y).max(min_size);
                        sprite.width = new_width / sprite.scale_x;
                        sprite.height = new_height / sprite.scale_y;
                    }
                }
            }
            DragMode::Camera => {
                let dx = x - self.last_mouse_pos.0;
                let dy = y - self.last_mouse_pos.1;
                self.camera.x -= dx as f64;
                self.camera.y -= dy as f64;
                self.last_mouse_pos = (x, y);
            }
            _ => {}
        }
    }

    #[wasm_bindgen]
    pub fn handle_mouse_up(&mut self, _x: f32, _y: f32) {
        self.drag_mode = DragMode::None;
        self.resize_handle = None;
    }

    #[wasm_bindgen]
    pub fn handle_wheel(&mut self, x: f32, y: f32, delta_y: f32) {
        if let Some(selected_id) = &self.selected_sprite {
            if let Some(sprite) = self.sprites.iter_mut().find(|s| &s.id == selected_id) {
                let scale_factor = if delta_y > 0.0 { 0.9 } else { 1.1 };
                sprite.scale_x = (sprite.scale_x * scale_factor).clamp(0.1, 10.0);
                sprite.scale_y = (sprite.scale_y * scale_factor).clamp(0.1, 10.0);
                return;
            }
        }
        // Fallback to camera zoom if no sprite selected
        let zoom_factor = if delta_y > 0.0 { 0.9 } else { 1.1 };
        self.camera.zoom = (self.camera.zoom * zoom_factor as f64).clamp(0.1, 5.0);
    }

    #[wasm_bindgen]
    pub fn get_selected_sprite(&self) -> JsValue {
        if let Some(selected_id) = &self.selected_sprite {
            if let Some(sprite) = self.sprites.iter().find(|s| &s.id == selected_id) {
                return JsValue::from_serde(sprite).unwrap_or(JsValue::NULL);
            }
        }
        JsValue::NULL
    }

    #[wasm_bindgen]
    pub fn screen_to_world(&self, screen_x: f64, screen_y: f64) -> Vec<f64> {
        vec![
            screen_x / self.camera.zoom + self.camera.x,
            screen_y / self.camera.zoom + self.camera.y
        ]
    }

    #[wasm_bindgen]
    pub fn toggle_grid(&mut self) {
        self.grid_enabled = !self.grid_enabled;
    }

    #[wasm_bindgen]
    pub fn clear_sprites(&mut self) {
        self.sprites.clear();
    }

    #[wasm_bindgen]
    pub fn resize(&mut self, width: u32, height: u32) {
        self.canvas.set_width(width);
        self.canvas.set_height(height);
        self.gl.viewport(0, 0, width as i32, height as i32);
    }
}
