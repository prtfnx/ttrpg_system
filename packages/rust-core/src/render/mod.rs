mod draw;
mod input_handling;
mod sprites;
mod state;
mod sync;

use wasm_bindgen::prelude::*;
use web_sys::{HtmlCanvasElement, WebGl2RenderingContext as WebGlRenderingContext};

use crate::actions::ActionsClient;
use crate::camera::Camera;
use crate::event_system::EventSystem;
use crate::fog::FogOfWarSystem;
use crate::grid_system::GridSystem;
use crate::input::InputHandler;
use crate::layer_manager::LayerManager;
use crate::lighting::LightingSystem;
use crate::math::*;
use crate::occlusion::{OcclusionScene, VisibilityWorkspace};
use crate::paint::PaintSystem;
use crate::render_diagnostics::RenderFrameCounters;
use crate::table_manager::TableManager;
use crate::table_sync::TableSync;
use crate::text_renderer::TextRenderer;
use crate::texture_manager::TextureManager;
use crate::wall_manager::WallManager;
use crate::webgl_renderer::WebGLRenderer;

fn parse_hex_color(hex: &str) -> Option<crate::types::Color> {
    let [r, g, b] = crate::types::parse_hex_rgb(hex)?;
    Some(crate::types::Color::new(
        r as f32 / 255.0,
        g as f32 / 255.0,
        b as f32 / 255.0,
        1.0,
    ))
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

    // Renderer-owned, atomically replaced sight and light occlusion indexes.
    pub(crate) occlusion_scene: OcclusionScene,
    pub(crate) visibility_workspace: VisibilityWorkspace,

    // Deterministic diagnostics for the most recently submitted frame.
    pub(crate) diagnostics: RenderFrameCounters,

    // Dirty flag — set whenever obstacles may have changed
    pub(crate) occlusion_dirty: bool,

    // Rendering settings
    pub(crate) background_color: [f32; 4],
    pub(crate) is_gm: bool,
    pub(crate) current_user_id: Option<i32>,
    pub(crate) active_layer: String,

    // Shape creation defaults. React should update these through WasmRuntime.
    pub(crate) shape_color: String,
    pub(crate) shape_opacity: f32,
    pub(crate) shape_filled: bool,

    // Runtime bridge callbacks owned by the TypeScript WasmRuntime facade.
    pub(crate) runtime_operation_handler: Option<js_sys::Function>,
    pub(crate) runtime_event_handler: Option<js_sys::Function>,
}

#[wasm_bindgen]
impl RenderEngine {
    pub(crate) fn hex_to_rgba(hex: &str, alpha: f32) -> [u8; 4] {
        let [r, g, b] = crate::types::parse_hex_rgb(hex).unwrap_or([255, 255, 255]);
        [r, g, b, (alpha * 255.0) as u8]
    }

    pub(crate) fn get_shape_settings(&self) -> (String, f32, bool) {
        (
            self.shape_color.clone(),
            self.shape_opacity,
            self.shape_filled,
        )
    }

    #[wasm_bindgen(constructor)]
    pub fn new(canvas: HtmlCanvasElement) -> Result<RenderEngine, JsValue> {
        let context_options = js_sys::Object::new();
        js_sys::Reflect::set(&context_options, &"stencil".into(), &true.into())?;
        js_sys::Reflect::set(&context_options, &"alpha".into(), &false.into())?;
        js_sys::Reflect::set(&context_options, &"antialias".into(), &true.into())?;

        let gl = canvas
            .get_context_with_context_options("webgl2", &context_options)?
            .ok_or_else(|| JsValue::from_str("WebGL2 is unavailable"))?
            .dyn_into::<WebGlRenderingContext>()?;

        let stencil_bits = gl.get_parameter(WebGlRenderingContext::STENCIL_BITS)?;
        web_sys::console::log_1(
            &format!(
                "[RUST] WebGL context created with {} stencil buffer bits",
                stencil_bits.as_f64().unwrap_or(0.0)
            )
            .into(),
        );

        let renderer = WebGLRenderer::new(gl.clone())?;
        let mut text_renderer = TextRenderer::new();
        let lighting = LightingSystem::new(gl.clone())?;
        let fog = FogOfWarSystem::new(gl.clone())?;
        let mut texture_manager = TextureManager::new(gl, canvas.width(), canvas.height())?;
        texture_manager
            .reserve_renderer_resources(fog.estimated_gpu_bytes(), fog.resident_texture_count());

        web_sys::console::log_1(&"[RENDER] Loading font atlas texture...".into());
        texture_manager
            .load_pinned_texture_from_url("font_atlas", "/static/ui/assets/font_atlas.png")?;

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

        let engine = Self {
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
            occlusion_scene: OcclusionScene::default(),
            visibility_workspace: VisibilityWorkspace::default(),
            diagnostics: RenderFrameCounters::default(),
            occlusion_dirty: true,
            background_color: [0.1, 0.1, 0.1, 1.0],
            is_gm: false,
            current_user_id: None,
            active_layer: "tokens".to_string(),
            shape_color: "#ffffff".to_string(),
            shape_opacity: 1.0,
            shape_filled: false,
            runtime_operation_handler: None,
            runtime_event_handler: None,
        };

        Ok(engine)
    }

    pub(crate) fn update_view_matrix(&mut self) {
        self.view_matrix = self.camera.view_matrix(self.canvas_size);
        let matrix_array = self.view_matrix.to_array();
        self.renderer
            .set_view_matrix(&matrix_array, self.canvas_size);
    }

    pub(crate) fn get_world_view_bounds(&self) -> Rect {
        let min = self.camera.screen_to_world(Vec2::new(0.0, 0.0));
        let max = self.camera.screen_to_world(self.canvas_size);
        Rect::new(min.x, min.y, max.x - min.x, max.y - min.y)
    }

    #[wasm_bindgen]
    pub fn set_runtime_operation_handler(&mut self, callback: &js_sys::Function) {
        self.runtime_operation_handler = Some(callback.clone());
    }

    #[wasm_bindgen]
    pub fn clear_runtime_operation_handler(&mut self) {
        self.runtime_operation_handler = None;
    }

    #[wasm_bindgen]
    pub fn set_runtime_event_handler(&mut self, callback: &js_sys::Function) {
        self.runtime_event_handler = Some(callback.clone());
    }

    #[wasm_bindgen]
    pub fn clear_runtime_event_handler(&mut self) {
        self.runtime_event_handler = None;
    }

    #[wasm_bindgen]
    pub fn set_shape_style(&mut self, color: &str, opacity: f32, filled: bool) {
        self.shape_color = color.to_string();
        self.shape_opacity = opacity.clamp(0.0, 1.0);
        self.shape_filled = filled;
    }

    fn get_effective_layer_opacity(
        layer_settings: &crate::types::LayerSettings,
        layer_name: &str,
        active_layer: &str,
    ) -> f32 {
        if layer_name == active_layer {
            return layer_settings.opacity;
        }
        layer_settings.opacity * layer_settings.inactive_opacity
    }

    pub(crate) fn ensure_occlusion_scene_current(&mut self) {
        if !self.occlusion_dirty {
            return;
        }

        let sight = self.collect_vision_obstacle_segments();
        let light = self.collect_lighting_obstacle_segments();
        self.occlusion_scene.replace(&sight, &light);
        self.occlusion_dirty = false;
        self.diagnostics
            .record_occlusion_rebuild(self.occlusion_scene.revision());
    }

    pub(crate) fn mark_occlusion_dirty(&mut self) {
        self.occlusion_dirty = true;
    }

    #[wasm_bindgen]
    pub fn get_render_diagnostics(&mut self) -> Result<JsValue, JsValue> {
        self.ensure_occlusion_scene_current();
        let mut snapshot = self.diagnostics.clone();
        snapshot.draw_calls = self
            .renderer
            .frame_draw_calls()
            .saturating_add(self.lighting.frame_draw_calls())
            .saturating_add(self.fog.frame_draw_calls());
        snapshot.buffer_uploads = self
            .renderer
            .frame_buffer_uploads()
            .saturating_add(self.lighting.frame_buffer_uploads())
            .saturating_add(self.fog.frame_buffer_uploads());
        snapshot.active_lights = self.lighting.frame_active_lights();
        snapshot.shadow_segments_total = self.lighting.frame_shadow_segments_total();
        snapshot.shadow_candidates = self.lighting.frame_shadow_candidates();
        snapshot.shadow_segments_accepted = self.lighting.frame_shadow_segments_accepted();
        snapshot.shadow_draw_calls = self.lighting.frame_shadow_draw_calls();
        snapshot.resident_textures = self.texture_manager.resident_texture_count() as u32;
        snapshot.estimated_texture_bytes = self.texture_manager.estimated_texture_bytes() as f64;
        snapshot.texture_budget_bytes = self.texture_manager.texture_budget_bytes() as f64;
        snapshot.texture_over_budget_bytes =
            self.texture_manager.texture_over_budget_bytes() as f64;

        serde_wasm_bindgen::to_value(&snapshot).map_err(|error| {
            JsValue::from_str(&format!("Failed to serialize diagnostics: {error}"))
        })
    }

    pub(crate) fn collect_lighting_obstacle_segments(&self) -> Vec<f32> {
        let mut obstacles = self.wall_manager.get_light_blocking_segments();
        self.collect_obstacle_sprite_segments(&mut obstacles);
        obstacles
    }

    pub(crate) fn collect_vision_obstacle_segments(&self) -> Vec<f32> {
        let mut obstacles = self.wall_manager.get_sight_blocking_segments();
        self.collect_obstacle_sprite_segments(&mut obstacles);
        obstacles
    }

    fn collect_obstacle_sprite_segments(&self, obstacles: &mut Vec<f32>) {
        let Some(active_table_id) = self.table_manager.active_table_id() else {
            return;
        };
        if let Some(obstacles_layer) = self.layer_manager.get_layer("obstacles") {
            for sprite in &obstacles_layer.sprites {
                if sprite.table_id == active_table_id {
                    append_sprite_obstacle_segments(sprite, obstacles);
                }
            }
        }
    }

    fn find_sprite(&self, sprite_id: &str) -> Option<&crate::types::Sprite> {
        self.layer_manager
            .find_sprite(sprite_id)
            .map(|(sprite, _)| sprite)
    }
}

fn append_segment(obstacles: &mut Vec<f32>, start: [f32; 2], end: [f32; 2]) {
    obstacles.extend_from_slice(&[start[0], start[1], end[0], end[1]]);
}

fn append_sprite_obstacle_segments(sprite: &crate::types::Sprite, obstacles: &mut Vec<f32>) {
    if sprite.obstacle_type.as_deref() == Some("polygon") {
        if let Some(vertices) = &sprite.polygon_vertices {
            if vertices.len() >= 2 {
                for index in 0..vertices.len() {
                    append_segment(
                        obstacles,
                        vertices[index],
                        vertices[(index + 1) % vertices.len()],
                    );
                }
            }
        }
        return;
    }

    if sprite.obstacle_type.as_deref() == Some("line") {
        if let Some(vertices) = &sprite.polygon_vertices {
            if vertices.len() >= 2 {
                append_segment(obstacles, vertices[0], vertices[1]);
                return;
            }
        }
    }

    let width = (sprite.width * sprite.scale_x) as f32;
    let height = (sprite.height * sprite.scale_y) as f32;
    let center_x = sprite.world_x as f32 + width / 2.0;
    let center_y = sprite.world_y as f32 + height / 2.0;
    let half_width = width / 2.0;
    let half_height = height / 2.0;
    let angle = sprite.rotation as f32;
    let cos_angle = angle.cos();
    let sin_angle = angle.sin();
    let transform = |dx: f32, dy: f32| {
        [
            center_x + dx * cos_angle - dy * sin_angle,
            center_y + dx * sin_angle + dy * cos_angle,
        ]
    };

    if sprite.obstacle_type.as_deref() == Some("circle") {
        const CIRCLE_SEGMENTS: usize = 32;
        let mut previous = transform(half_width, 0.0);
        for index in 1..=CIRCLE_SEGMENTS {
            let theta = index as f32 / CIRCLE_SEGMENTS as f32 * std::f32::consts::TAU;
            let current = transform(half_width * theta.cos(), half_height * theta.sin());
            append_segment(obstacles, previous, current);
            previous = current;
        }
        return;
    }

    if sprite.obstacle_type.as_deref() == Some("line") {
        append_segment(
            obstacles,
            transform(-half_width, 0.0),
            transform(half_width, 0.0),
        );
        return;
    }

    let corners = [
        transform(-half_width, -half_height),
        transform(half_width, -half_height),
        transform(half_width, half_height),
        transform(-half_width, half_height),
    ];
    for index in 0..corners.len() {
        append_segment(
            obstacles,
            corners[index],
            corners[(index + 1) % corners.len()],
        );
    }
}

#[cfg(test)]
mod obstacle_segment_tests {
    use super::*;
    use crate::types::Sprite;

    fn shape(obstacle_type: &str) -> Sprite {
        Sprite {
            obstacle_type: Some(obstacle_type.to_string()),
            world_x: 10.0,
            world_y: 20.0,
            width: 40.0,
            height: 20.0,
            scale_x: 1.0,
            scale_y: 1.0,
            ..Default::default()
        }
    }

    #[test]
    fn line_obstacle_uses_its_stored_endpoints() {
        let mut sprite = shape("line");
        sprite.polygon_vertices = Some(vec![[1.0, 2.0], [30.0, 40.0]]);
        let mut segments = Vec::new();

        append_sprite_obstacle_segments(&sprite, &mut segments);

        assert_eq!(segments, vec![1.0, 2.0, 30.0, 40.0]);
    }

    #[test]
    fn circle_obstacle_uses_a_closed_ellipse_boundary() {
        let sprite = shape("circle");
        let mut segments = Vec::new();

        append_sprite_obstacle_segments(&sprite, &mut segments);

        assert_eq!(segments.len(), 32 * 4);
        assert!((segments[0] - 50.0).abs() < 0.001);
        assert!((segments[1] - 30.0).abs() < 0.001);
        let last = segments.len() - 2;
        assert!((segments[last] - segments[0]).abs() < 0.001);
        assert!((segments[last + 1] - segments[1]).abs() < 0.001);
    }
}
