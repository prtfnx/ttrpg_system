mod draw;
mod input_handling;
mod sprites;
mod state;
mod sync;

use wasm_bindgen::prelude::*;
use web_sys::{HtmlCanvasElement, WebGl2RenderingContext as WebGlRenderingContext};

use crate::math::*;
use crate::camera::Camera;
use crate::input::InputHandler;
use crate::webgl_renderer::WebGLRenderer;
use crate::text_renderer::TextRenderer;
use crate::lighting::LightingSystem;
use crate::fog::FogOfWarSystem;
use crate::event_system::EventSystem;
use crate::layer_manager::LayerManager;
use crate::grid_system::GridSystem;
use crate::texture_manager::TextureManager;
use crate::actions::ActionsClient;
use crate::paint::PaintSystem;
use crate::table_sync::TableSync;
use crate::table_manager::TableManager;
use crate::wall_manager::WallManager;

fn parse_hex_color(hex: &str) -> Option<crate::types::Color> {
    let s = hex.trim_start_matches('#');
    if s.len() != 6 { return None; }
    let r = u8::from_str_radix(&s[0..2], 16).ok()? as f32 / 255.0;
    let g = u8::from_str_radix(&s[2..4], 16).ok()? as f32 / 255.0;
    let b = u8::from_str_radix(&s[4..6], 16).ok()? as f32 / 255.0;
    Some(crate::types::Color::new(r, g, b, 1.0))
}

#[wasm_bindgen]
pub struct RenderEngine {
    // Systems
    pub(crate) layer_manager: LayerManager,
    pub(crate) grid_system: GridSystem,
    pub(crate) texture_manager: TextureManager,
    
    // Camera and transforms
    pub(crate) camera: Camera,
    pub(crate) view_matrix: Mat3,
    pub(crate) canvas_size: Vec2,
    
    // Input handling
    pub(crate) input: InputHandler,
    pub(crate) event_system: EventSystem,
    
    // Core rendering
    pub(crate) renderer: WebGLRenderer,
    pub(crate) text_renderer: TextRenderer,
    
    // Lighting system
    pub(crate) lighting: LightingSystem,
    
    // Fog of war system
    pub(crate) fog: FogOfWarSystem,
    
    // Actions system
    pub(crate) actions: ActionsClient,
    
    // Paint system
    pub(crate) paint: PaintSystem,
    
    // Table synchronization
    pub(crate) table_sync: TableSync,
    
    // Table management
    pub(crate) table_manager: TableManager,
    
    // Wall segments
    pub(crate) wall_manager: WallManager,

    // Dirty flag — set whenever obstacles may have changed
    pub(crate) obstacles_dirty: bool,

    // Rendering settings
    pub(crate) background_color: [f32; 4],
    pub(crate) is_gm: bool,
    pub(crate) current_user_id: Option<i32>,
    pub(crate) active_layer: String,
}

#[wasm_bindgen]
impl RenderEngine {
    pub(crate) fn hex_to_rgba(hex: &str, alpha: f32) -> [u8; 4] {
        let hex = hex.trim_start_matches('#');
        if hex.len() == 6 {
            let r = u8::from_str_radix(&hex[0..2], 16).unwrap_or(255);
            let g = u8::from_str_radix(&hex[2..4], 16).unwrap_or(255);
            let b = u8::from_str_radix(&hex[4..6], 16).unwrap_or(255);
            let a = (alpha * 255.0) as u8;
            [r, g, b, a]
        } else {
            [255, 255, 255, (alpha * 255.0) as u8]
        }
    }
    
    pub(crate) fn get_shape_settings(&self) -> (String, f32, bool) {
        if let Some(window) = web_sys::window() {
            if let Ok(shape_settings) = js_sys::Reflect::get(&window, &"shapeSettings".into()) {
                if !shape_settings.is_undefined() {
                    let color = js_sys::Reflect::get(&shape_settings, &"color".into())
                        .ok()
                        .and_then(|v| v.as_string())
                        .unwrap_or_else(|| "#ffffff".to_string());
                    let opacity = js_sys::Reflect::get(&shape_settings, &"opacity".into())
                        .ok()
                        .and_then(|v| v.as_f64())
                        .unwrap_or(1.0) as f32;
                    let filled = js_sys::Reflect::get(&shape_settings, &"filled".into())
                        .ok()
                        .and_then(|v| v.as_bool())
                        .unwrap_or(false);
                    return (color, opacity, filled);
                }
            }
        }
        ("#ffffff".to_string(), 1.0, false)
    }
    
    #[wasm_bindgen(constructor)]
    pub fn new(canvas: HtmlCanvasElement) -> Result<RenderEngine, JsValue> {
        let context_options = js_sys::Object::new();
        js_sys::Reflect::set(&context_options, &"stencil".into(), &true.into())?;
        js_sys::Reflect::set(&context_options, &"alpha".into(), &false.into())?;
        js_sys::Reflect::set(&context_options, &"antialias".into(), &true.into())?;
        
        let gl = canvas
            .get_context_with_context_options("webgl2", &context_options)?
            .unwrap()
            .dyn_into::<WebGlRenderingContext>()?;
        
        let stencil_bits = gl.get_parameter(WebGlRenderingContext::STENCIL_BITS)?;
        web_sys::console::log_1(&format!("[RUST] WebGL context created with {} stencil buffer bits", 
            stencil_bits.as_f64().unwrap_or(0.0)).into());
        
        let renderer = WebGLRenderer::new(gl.clone())?;
        let mut text_renderer = TextRenderer::new();
        let lighting = LightingSystem::new(gl.clone())?;
        let fog = FogOfWarSystem::new(gl.clone())?;
        let mut texture_manager = TextureManager::new(gl);
        
        web_sys::console::log_1(&"[RENDER] Loading font atlas texture...".into());
        texture_manager.load_texture_from_url("font_atlas", "/static/ui/assets/font_atlas.png")?;
        
        text_renderer.init_font_atlas(&mut texture_manager)?;
        
        let layer_manager = LayerManager::new();
        let grid_system = GridSystem::new();
        let actions = ActionsClient::new();
        let paint = PaintSystem::new();
        let table_sync = TableSync::new();
        let table_manager = TableManager::new();
        let wall_manager = WallManager::new();        
        let canvas_size = Vec2::new(canvas.width() as f32, canvas.height() as f32);
        let camera = Camera::default();
        let view_matrix = camera.view_matrix(canvas_size);
        
        let mut engine = Self {
            layer_manager,
            grid_system,
            texture_manager,
            camera,
            view_matrix,
            canvas_size,
            input: InputHandler::new(),
            event_system: EventSystem::new(),
            renderer,
            text_renderer,
            lighting,
            fog,
            actions,
            paint,
            table_sync,
            table_manager,
            wall_manager,
            obstacles_dirty: true,
            background_color: [0.1, 0.1, 0.1, 1.0],
            is_gm: false,
            current_user_id: None,
            active_layer: "tokens".to_string(),
        };
        
        web_sys::console::log_1(&"[TABLE-INIT] [TARGET] Creating mandatory default table...".into());

        engine.table_manager.create_table("default_table", "Default Table", 1200.0, 1200.0)
            .map_err(|e| JsValue::from_str(&format!("[TABLE-INIT] Failed to create default table: {}", e)))?;

        if !engine.table_manager.set_active_table("default_table") {
            return Err(JsValue::from_str("[TABLE-INIT] Failed to set default table as active"));
        }

        web_sys::console::log_1(&"[TABLE-INIT] [OK] Default table created successfully".into());

        let active_id = engine.table_manager.get_active_table_id()
            .ok_or_else(|| JsValue::from_str("[TABLE-INIT] Table created but active_table_id is None"))?;

        web_sys::console::log_1(&format!("[TABLE-INIT] [OK] Active table ID: '{}'", active_id).into());

        if let Some((x, y, width, height)) = engine.table_manager.get_active_table_world_bounds() {
            web_sys::console::log_1(&format!(
                "[TABLE-INIT] [OK] Table bounds: origin=({}, {}), size={}x{}",
                x, y, width, height
            ).into());
        } else {
            web_sys::console::error_1(&"[TABLE-INIT] [ERR] Table exists but get_active_table_world_bounds() returned None".into());
        }
        
        engine.camera.center_on(0.0, 0.0);
        web_sys::console::log_1(&"[TABLE-INIT] [CAM] Camera positioned at table origin (0, 0)".into());
        
        if let Some((tx, ty, tw, th)) = engine.table_manager.get_active_table_world_bounds() {
            engine.camera.set_table_bounds(tx, ty, tw, th);
            engine.camera.allow_outside_table = true;
            engine.fog.set_table_bounds(tx as f32, ty as f32, tw as f32, th as f32);
        }
        
        engine.update_view_matrix();
        Ok(engine)
    }

    pub(crate) fn update_view_matrix(&mut self) {
        self.view_matrix = self.camera.view_matrix(self.canvas_size);
        let matrix_array = self.view_matrix.to_array();
        self.renderer.set_view_matrix(&matrix_array, self.canvas_size);
    }
    
    pub(crate) fn get_world_view_bounds(&self) -> Rect {
        let min = self.camera.screen_to_world(Vec2::new(0.0, 0.0));
        let max = self.camera.screen_to_world(self.canvas_size);
        Rect::new(min.x, min.y, max.x - min.x, max.y - min.y)
    }

    fn get_effective_layer_opacity(layer_settings: &crate::types::LayerSettings, layer_name: &str, active_layer: &str) -> f32 {
        if layer_name == active_layer {
            return layer_settings.opacity;
        }
        layer_settings.opacity * layer_settings.inactive_opacity
    }

    pub(crate) fn update_lighting_obstacles(&mut self) {
        let mut obstacles = Vec::new();

        let wall_segs = self.wall_manager.get_light_blocking_segments();
        obstacles.extend_from_slice(&wall_segs);

        if let Some(obstacles_layer) = self.layer_manager.get_layer("obstacles") {
            for sprite in &obstacles_layer.sprites {
                if sprite.obstacle_type.as_deref() == Some("polygon") {
                    if let Some(verts) = &sprite.polygon_vertices {
                        if verts.len() >= 2 {
                            let n = verts.len();
                            for i in 0..n {
                                let next = (i + 1) % n;
                                obstacles.push(verts[i][0]);
                                obstacles.push(verts[i][1]);
                                obstacles.push(verts[next][0]);
                                obstacles.push(verts[next][1]);
                            }
                        }
                    }
                    continue;
                }

                let w = (sprite.width * sprite.scale_x) as f32;
                let h = (sprite.height * sprite.scale_y) as f32;

                let cx = sprite.world_x as f32 + w / 2.0;
                let cy = sprite.world_y as f32 + h / 2.0;

                let half_w = w / 2.0;
                let half_h = h / 2.0;

                let angle = sprite.rotation as f32;
                let cos_a = angle.cos();
                let sin_a = angle.sin();

                let raw = [(-half_w, -half_h), (half_w, -half_h), (half_w, half_h), (-half_w, half_h)];
                let corners: [Vec2; 4] = std::array::from_fn(|i| {
                    let (dx, dy) = raw[i];
                    Vec2::new(
                        cx + dx * cos_a - dy * sin_a,
                        cy + dx * sin_a + dy * cos_a,
                    )
                });

                for i in 0..4 {
                    let next = (i + 1) % 4;
                    obstacles.push(corners[i].x);
                    obstacles.push(corners[i].y);
                    obstacles.push(corners[next].x);
                    obstacles.push(corners[next].y);
                }
            }
        }

        self.lighting.set_obstacles(&obstacles);
    }

    fn find_sprite(&self, sprite_id: &str) -> Option<&crate::types::Sprite> {
        self.layer_manager.find_sprite(sprite_id).map(|(sprite, _)| sprite)
    }

    fn find_sprite_at_position(&self, world_pos: Vec2) -> Option<String> {
        self.layer_manager.find_sprite_for_right_click(world_pos)
    }
}
