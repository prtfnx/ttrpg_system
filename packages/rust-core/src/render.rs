use wasm_bindgen::prelude::*;
use web_sys::{HtmlCanvasElement, WebGl2RenderingContext as WebGlRenderingContext, HtmlImageElement};
use serde_wasm_bindgen;

use crate::types::*;
use crate::math::*;
use crate::camera::Camera;
use crate::input::{InputHandler, InputMode, HandleDetector};
use crate::sprite_manager::SpriteManager;
use crate::sprite_renderer::SpriteRenderer;
use crate::webgl_renderer::WebGLRenderer;
use crate::text_renderer::TextRenderer;
use crate::lighting::LightingSystem;
use crate::fog::FogOfWarSystem;
use crate::event_system::{EventSystem, MouseEventResult};
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
    layer_manager: LayerManager,
    grid_system: GridSystem,
    texture_manager: TextureManager,
    
    // Camera and transforms
    camera: Camera,
    view_matrix: Mat3,
    canvas_size: Vec2,
    
    // Input handling
    input: InputHandler,
    event_system: EventSystem,
    
    // Core rendering
    renderer: WebGLRenderer,
    text_renderer: TextRenderer,
    
    // Lighting system
    lighting: LightingSystem,
    
    // Fog of war system
    fog: FogOfWarSystem,
    
    // Actions system
    actions: ActionsClient,
    
    // Paint system
    paint: PaintSystem,
    
    // Table synchronization
    table_sync: TableSync,
    
    // Table management
    table_manager: TableManager,
    
    // Wall segments
    wall_manager: WallManager,

    // Dirty flag — set whenever obstacles may have changed
    obstacles_dirty: bool,

    // Rendering settings
    background_color: [f32; 4], // RGBA background color
    is_gm: bool,
    current_user_id: Option<i32>,
    active_layer: String,
}

#[wasm_bindgen]
impl RenderEngine {
    // Helper function to convert hex color to RGBA bytes
    fn hex_to_rgba(hex: &str, alpha: f32) -> [u8; 4] {
        let hex = hex.trim_start_matches('#');
        if hex.len() == 6 {
            let r = u8::from_str_radix(&hex[0..2], 16).unwrap_or(255);
            let g = u8::from_str_radix(&hex[2..4], 16).unwrap_or(255);
            let b = u8::from_str_radix(&hex[4..6], 16).unwrap_or(255);
            let a = (alpha * 255.0) as u8;
            [r, g, b, a]
        } else {
            [255, 255, 255, (alpha * 255.0) as u8] // Default white
        }
    }
    
    // Get shape settings from window.shapeSettings
    fn get_shape_settings(&self) -> (String, f32, bool) {
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
        // Default values
        ("#ffffff".to_string(), 1.0, false)
    }
    
    #[wasm_bindgen(constructor)]
    pub fn new(canvas: HtmlCanvasElement) -> Result<RenderEngine, JsValue> {
        // Create WebGL context with stencil buffer enabled for shadow casting
        let context_options = js_sys::Object::new();
        js_sys::Reflect::set(&context_options, &"stencil".into(), &true.into())?;
        js_sys::Reflect::set(&context_options, &"alpha".into(), &false.into())?;
        js_sys::Reflect::set(&context_options, &"antialias".into(), &true.into())?;
        
        let gl = canvas
            .get_context_with_context_options("webgl2", &context_options)?
            .unwrap()
            .dyn_into::<WebGlRenderingContext>()?;
        
        // Verify stencil buffer bits
        let stencil_bits = gl.get_parameter(WebGlRenderingContext::STENCIL_BITS)?;
        web_sys::console::log_1(&format!("[RUST] WebGL context created with {} stencil buffer bits", 
            stencil_bits.as_f64().unwrap_or(0.0)).into());
        
        let renderer = WebGLRenderer::new(gl.clone())?;
        let mut text_renderer = TextRenderer::new();
        let lighting = LightingSystem::new(gl.clone())?;
        let fog = FogOfWarSystem::new(gl.clone())?;
        let mut texture_manager = TextureManager::new(gl);
        
        // Load font atlas texture asynchronously
        web_sys::console::log_1(&"[RENDER] Loading font atlas texture...".into());
        texture_manager.load_texture_from_url("font_atlas", "/static/ui/assets/font_atlas.png")?;
        
        // Initialize text renderer
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
            background_color: [0.1, 0.1, 0.1, 1.0], // Default dark gray background
            is_gm: false,
            current_user_id: None,
            active_layer: "tokens".to_string(),
        };
        
        // ===== MANDATORY TABLE CREATION =====
        // The table MUST exist for the system to work properly
        web_sys::console::log_1(&"[TABLE-INIT] 🎯 Creating mandatory default table...".into());
        
        // Create default table - this MUST succeed
        engine.table_manager.create_table("default_table", "Default Table", 1200.0, 1200.0)
            .expect("CRITICAL: Failed to create default table - cannot continue!");
        
        // Set as active table - this should always succeed since we just created it
        let set_active_result = engine.table_manager.set_active_table("default_table");
        if !set_active_result {
            panic!("CRITICAL: Failed to set default table as active - cannot continue!");
        }
        
        web_sys::console::log_1(&"[TABLE-INIT] ✅ Default table created successfully".into());
        
        // Verify table was created and is active
        let active_id = engine.table_manager.get_active_table_id();
        match active_id {
            Some(ref id) => {
                web_sys::console::log_1(&format!("[TABLE-INIT] ✅ Active table ID: '{}'", id).into());
                
                // Get and log table bounds
                if let Some((x, y, width, height)) = engine.table_manager.get_active_table_world_bounds() {
                    web_sys::console::log_1(&format!(
                        "[TABLE-INIT] ✅ Table bounds: origin=({}, {}), size={}x{}", 
                        x, y, width, height
                    ).into());
                } else {
                    web_sys::console::error_1(&"[TABLE-INIT] ❌ ERROR: Table exists but get_active_table_world_bounds() returned None!".into());
                }
            }
            None => {
                panic!("CRITICAL: Table was created but active_table_id is still None!");
            }
        }
        
        // Position camera at table origin (0, 0)
        // This makes screen top-left align with table top-left
        engine.camera.center_on(0.0, 0.0);
        web_sys::console::log_1(&"[TABLE-INIT] 📷 Camera positioned at table origin (0, 0)".into());
        
        // Set camera bounds to match table (allows panning with padding)
        if let Some((tx, ty, tw, th)) = engine.table_manager.get_active_table_world_bounds() {
            engine.camera.set_table_bounds(tx, ty, tw, th);
            engine.camera.allow_outside_table = true; // Allow some panning beyond table edges
            
            // Set fog system table bounds
            engine.fog.set_table_bounds(tx as f32, ty as f32, tw as f32, th as f32);
        }
        
        engine.update_view_matrix();
        Ok(engine)
    }
    
    #[wasm_bindgen]
    pub fn render(&mut self) -> Result<(), JsValue> {
        // Use stored background color
        self.renderer.clear(
            self.background_color[0],
            self.background_color[1],
            self.background_color[2],
            self.background_color[3]
        );
        
        // ===== TABLE & VIEWPORT BOUNDS =====
        // Get what the camera can see (viewport in world coords)
        let viewport_bounds = self.get_world_view_bounds();
        
        // Get table bounds (ALWAYS exists - enforced at initialization)
        let (tx, ty, tw, th) = self.table_manager.get_active_table_world_bounds()
            .expect("CRITICAL: No active table found during rendering! Table-centric architecture requires a table to exist.");
        
        let table_bounds = Rect::new(
            tx as f32,
            ty as f32,
            tw as f32,
            th as f32,
        );
        
        // Compute grid bounds (for use after map layer render)
        let intersect_min_x = viewport_bounds.min.x.max(table_bounds.min.x);
        let intersect_min_y = viewport_bounds.min.y.max(table_bounds.min.y);
        let intersect_max_x = viewport_bounds.max.x.min(table_bounds.max.x);
        let intersect_max_y = viewport_bounds.max.y.min(table_bounds.max.y);
        let grid_draw_bounds = if intersect_max_x > intersect_min_x && intersect_max_y > intersect_min_y {
            Some(Rect::new(
                intersect_min_x,
                intersect_min_y,
                intersect_max_x - intersect_min_x,
                intersect_max_y - intersect_min_y,
            ))
        } else {
            None
        };

        // Sort layers by z_order
        let mut sorted_layers: Vec<_> = self.layer_manager.get_layers().iter().collect();
        sorted_layers.sort_by_key(|(_, layer)| layer.settings.z_order);

        // Clone active table ID to an owned String so the immutable borrow on
        // table_manager is released before we need &mut self (update_lighting_obstacles).
        let active_table_id = self.table_manager.active_table_id()
            .expect("CRITICAL: No active table ID during rendering! Table-centric architecture requires a table to exist.")
            .to_owned();

        let active_layer = self.active_layer.clone();

        // ===== STEP 1: Render MAP layer first (background, below grid) =====
        for (layer_name, layer) in &sorted_layers {
            if *layer_name == "map" && layer.settings.visible {
                self.renderer.set_blend_mode(&layer.settings.blend_mode);
                self.renderer.set_layer_color(&layer.settings.color);
                let effective_opacity = Self::get_effective_layer_opacity(&layer.settings, layer_name, &active_layer);
                for sprite in &layer.sprites {
                    if sprite.table_id == active_table_id {
                        SpriteRenderer::draw_sprite(sprite, effective_opacity, &self.renderer, &self.texture_manager, &self.text_renderer, &self.input, self.camera.zoom)?;
                    }
                }
            }
        }

        // ===== STEP 2: Draw grid on top of map layer =====
        if let Some(bounds) = grid_draw_bounds {
            self.grid_system.draw_grid(&self.renderer, bounds)?;
        }

        // ===== STEP 3: Render remaining layers (excluding map, light, fog_of_war) =====
        for (layer_name, layer) in &sorted_layers {
            if layer.settings.visible
                && *layer_name != "map"
                && *layer_name != "light"
                && *layer_name != "fog_of_war"
            {
                self.renderer.set_blend_mode(&layer.settings.blend_mode);
                self.renderer.set_layer_color(&layer.settings.color);
                let effective_opacity = Self::get_effective_layer_opacity(&layer.settings, layer_name, &active_layer);
                
                // Only render sprites that belong to the active table
                for sprite in &layer.sprites {
                    if sprite.table_id == active_table_id {
                        SpriteRenderer::draw_sprite(sprite, effective_opacity, &self.renderer, &self.texture_manager, &self.text_renderer, &self.input, self.camera.zoom)?;
                    }
                }
            }
        }

        // Extract obstacles for lighting shadows (only when something changed)
        if self.obstacles_dirty {
            self.update_lighting_obstacles();
            self.obstacles_dirty = false;
        }
        
        // web_sys::console::log_1(&"[RENDER-ORDER] 1️⃣ About to render lighting".into());
        // Render lighting system with shadow casting (filtered by active table)
        self.lighting.render_lights_filtered(&self.view_matrix.to_array(), self.canvas_size.x, self.canvas_size.y, Some(&active_table_id))?;
        // web_sys::console::log_1(&"[RENDER-ORDER] 2️⃣ Lighting complete".into());
        
        // Render paint strokes (on top of everything except fog)
        self.paint.render_strokes(&self.renderer)?;

        // Render fog of war system (last, alpha-overlaid on top of everything)
        self.fog.render_fog_filtered(&self.view_matrix.to_array(), self.canvas_size.x, self.canvas_size.y, Some(&active_table_id))?;
        // web_sys::console::log_1(&"[RENDER-ORDER] 4️⃣ Fog complete".into());
        
        // Draw area selection rectangle if active
        if let Some((min, max)) = self.input.get_area_selection_rect() {
            SpriteRenderer::draw_area_selection_rect(min, max, &self.renderer)?;
        }
        
        // Draw measurement line if active
        if let Some((start, end)) = self.input.get_measurement_line() {
            let conv = self.table_manager.get_unit_converter(&active_table_id);
            SpriteRenderer::draw_measurement_line(start, end, &self.renderer, &self.text_renderer, &self.texture_manager, &conv)?;
        }
        
        // Draw shape creation preview if active
        if let Some((start, end)) = self.input.get_shape_creation_rect() {
            match self.input.input_mode {
                InputMode::CreateRectangle => {
                    SpriteRenderer::draw_rectangle_preview(start, end, &self.renderer)?;
                }
                InputMode::CreateCircle => {
                    SpriteRenderer::draw_circle_preview(start, end, &self.renderer)?;
                }
                InputMode::CreateLine => {
                    SpriteRenderer::draw_line_preview(start, end, &self.renderer)?;
                }
                _ => {}
            }
        }

        // Wall draw preview line (two-click placement)
        if let Some((start, end)) = self.input.get_wall_preview_line() {
            SpriteRenderer::draw_line_preview(start, end, &self.renderer)?;
        }

        // Polygon creation preview
        if self.input.input_mode == InputMode::CreatePolygon && !self.input.polygon_vertices.is_empty() {
            SpriteRenderer::draw_polygon_preview(&self.input.polygon_vertices, self.input.polygon_cursor, &self.renderer)?;
        }
        
        Ok(())
    }

    #[wasm_bindgen]
    pub fn get_active_table_world_bounds(&self) -> Vec<f64> {
        // Table MUST exist - if it doesn't, this is a critical error
        if let Some((x, y, width, height)) = self.table_manager.get_active_table_world_bounds() {
            vec![x, y, width, height]
        } else {
            // This should NEVER happen - panic to catch bugs early
            web_sys::console::error_1(&"[TABLE-ERROR] ❌ CRITICAL: No active table found!".into());
            panic!("No active table found - this should never happen! Table creation must have failed.");
        }
    }
    
    #[wasm_bindgen]
    pub fn get_active_table_id(&self) -> Option<String> {
        self.table_manager.get_active_table_id()
    }
    
    fn update_view_matrix(&mut self) {
        self.view_matrix = self.camera.view_matrix(self.canvas_size);
        let matrix_array = self.view_matrix.to_array();
        self.renderer.set_view_matrix(&matrix_array, self.canvas_size);
    }
    
    fn get_world_view_bounds(&self) -> Rect {
        let min = self.camera.screen_to_world(Vec2::new(0.0, 0.0));
        let max = self.camera.screen_to_world(self.canvas_size);
        Rect::new(min.x, min.y, max.x - min.x, max.y - min.y)
    }

    /// Returns the effective opacity for a layer based on which layer is currently active.
    /// Uses `inactive_opacity` from layer settings; falls back to legacy hard-coded values.
    fn get_effective_layer_opacity(layer_settings: &crate::types::LayerSettings, layer_name: &str, active_layer: &str) -> f32 {
        if layer_name == active_layer {
            return layer_settings.opacity;
        }
        layer_settings.opacity * layer_settings.inactive_opacity
    }
    /// Extract obstacles from sprites and wall manager for shadow casting.
    /// Wall segments are sourced from WallManager (respects door state).
    /// Sprite obstacles (rectangles/polygons on the obstacles layer) are also included.
    fn update_lighting_obstacles(&mut self) {
        let mut obstacles = Vec::new();

        // Walls from WallManager — open doors are automatically excluded
        let wall_segs = self.wall_manager.get_light_blocking_segments();
        obstacles.extend_from_slice(&wall_segs);

        if let Some(obstacles_layer) = self.layer_manager.get_layer("obstacles") {
            for sprite in &obstacles_layer.sprites {
                // Polygon obstacle: use stored world-space vertices directly
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

                // Rectangle (default): use scaled+rotated AABB corners
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
    
    // Public API methods
    #[wasm_bindgen]
    pub fn resize_canvas(&mut self, width: f32, height: f32) {
        self.canvas_size = Vec2::new(width, height);
        self.update_view_matrix();
    }
    #[wasm_bindgen]
    pub fn set_ambient_light(&mut self, level: f32) {
        self.fog.set_ambient_light(level);
    }
    #[wasm_bindgen]
    pub fn handle_wheel(&mut self, screen_x: f32, screen_y: f32, delta_y: f32) {
        // Debug-only wheel logging to avoid spamming console
        #[cfg(debug_assertions)]
        web_sys::console::debug_1(&format!("[RUST-DEBUG] Wheel event at screen: {}, {}, delta: {}", screen_x, screen_y, delta_y).into());
        self.camera.handle_wheel(screen_x, screen_y, delta_y);
        self.update_view_matrix();
    }
    
    pub fn set_zoom(&mut self, zoom: f64) {
        self.camera.zoom = zoom.clamp(0.1, 5.0);
        self.update_view_matrix();
    }
    
    #[wasm_bindgen]
    pub fn center_camera(&mut self, world_x: f64, world_y: f64) {
        self.camera.center_on(world_x, world_y);
        self.update_view_matrix();
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
    pub fn world_to_screen(&self, world_x: f32, world_y: f32) -> Vec<f64> {
        let screen = self.camera.world_to_screen(Vec2::new(world_x, world_y));
        vec![screen.x as f64, screen.y as f64]
    }
    
    #[wasm_bindgen]
    pub fn get_cursor_type(&self, screen_x: f32, screen_y: f32) -> String {
        let world_pos = self.camera.screen_to_world(Vec2::new(screen_x, screen_y));
        let uid_opt = self.current_user_id;

        // Inline helper: can this user control the sprite?
        let user_can_control = |s: &crate::types::Sprite| -> bool {
            if self.is_gm { return true; }
            let Some(uid) = uid_opt else { return false; };
            !s.controlled_by.is_empty() && s.controlled_by.contains(&(uid as i32))
        };

        // Inspect the currently selected sprite (resize/rotate handles + body)
        if let Some(selected_id) = &self.input.selected_sprite_id {
            if let Some((sprite, _)) = self.layer_manager.find_sprite(selected_id) {
                if user_can_control(sprite) {
                    let rotate_handle_pos = SpriteManager::get_rotation_handle_position(sprite, self.camera.zoom);
                    let handle_size = 16.0 / self.camera.zoom as f32;
                    if HandleDetector::point_in_handle(world_pos, rotate_handle_pos.x, rotate_handle_pos.y, handle_size) {
                        return "crosshair".to_string();
                    }
                    if sprite.rotation == 0.0 {
                        if let Some(handle) = HandleDetector::get_resize_handle_for_cursor_detection(sprite, world_pos, self.camera.zoom) {
                            return HandleDetector::get_cursor_for_handle(handle).to_string();
                        }
                    }
                    if sprite.contains_world_point(world_pos) {
                        return "move".to_string();
                    }
                }
            }
        }

        // Hover over any sprite: show grab cursor only if user controls it
        if let Some(hovered_id) = self.layer_manager.find_sprite_for_right_click(world_pos) {
            if let Some((sprite, _)) = self.layer_manager.find_sprite(&hovered_id) {
                if user_can_control(sprite) {
                    return "grab".to_string();
                }
            }
        }

        "default".to_string()
    }
    
    #[wasm_bindgen]
    pub fn handle_mouse_down(&mut self, screen_x: f32, screen_y: f32) {
        self.handle_mouse_down_internal(screen_x, screen_y, false);
    }
    
    #[wasm_bindgen]
    pub fn handle_mouse_down_with_ctrl(&mut self, screen_x: f32, screen_y: f32, ctrl_pressed: bool) {
        self.handle_mouse_down_internal(screen_x, screen_y, ctrl_pressed);
    }
    
    // Clean mouse handling without fallbacks  
    fn handle_mouse_down_internal(&mut self, screen_x: f32, screen_y: f32, ctrl_pressed: bool) {
        let world_pos = self.camera.screen_to_world(Vec2::new(screen_x, screen_y));
        self.input.last_mouse_screen = Vec2::new(screen_x, screen_y);
        
        // Check paint mode first
        if self.input.input_mode == InputMode::Paint {
            self.paint.start_stroke(world_pos.x, world_pos.y, 1.0);
            return;
        }
        
        // Use event system for all other input handling
        let result = self.event_system.handle_mouse_down(
            world_pos,
            &mut self.input,
            self.layer_manager.get_layers_mut(),
            &mut self.lighting,
            &self.wall_manager,
            self.camera.zoom,
            ctrl_pressed,
            &self.active_layer.clone()
        );
        
        // Ownership check: block drag on sprites user doesn't control.
        // Fail-closed: unknown uid → deny drag for non-GMs.
        let uid_opt = self.current_user_id;
        let dragging = matches!(self.input.input_mode, InputMode::SpriteMove | InputMode::SpriteResize(_) | InputMode::SpriteRotate);
        let selected_id = self.input.selected_sprite_id.clone();
        let block_drag = !self.is_gm
            && dragging
            && (uid_opt.is_none()
                || selected_id.as_deref()
                    .and_then(|id| self.layer_manager.find_sprite(id))
                    // empty controlled_by = DM-only; non-empty but excludes user = blocked
                    .map(|(s, _)| s.controlled_by.is_empty() || !s.controlled_by.contains(&uid_opt.unwrap()))
                    .unwrap_or(true));
        if block_drag {
            self.input.input_mode = InputMode::None;
            self.input.selected_sprite_id = None;
            self.input.selected_sprite_ids.clear();
        }

        // Handle results - no fallbacks
        match result {
            MouseEventResult::CameraOperation(op) if op == "focus_selection" => {
                if let Some(sprite_id) = &self.input.selected_sprite_id {
                    if let Some((sprite, _)) = self.layer_manager.find_sprite(sprite_id) {
                        let (pos, size) = SpriteManager::get_sprite_bounds(sprite);
                        let rect = crate::math::Rect::new(pos.x, pos.y, size.x, size.y);
                        self.camera.focus_on_rect(rect, self.canvas_size, 50.0);
                        self.view_matrix = self.camera.view_matrix(self.canvas_size);
                    }
                }
            }
            _ => {}
        }
    }
    
    #[wasm_bindgen]
    pub fn handle_mouse_move(&mut self, screen_x: f32, screen_y: f32) {
        let current_screen = Vec2::new(screen_x, screen_y);
        let world_pos = self.camera.screen_to_world(current_screen);
        
        // Check if paint mode is active first
        if self.input.input_mode == InputMode::Paint {
            // Continue paint stroke if we're currently drawing
            if self.paint.add_stroke_point(world_pos.x, world_pos.y, 1.0) {
                // Successfully added point
            }
            self.input.last_mouse_screen = current_screen;
            return;
        }
        
        // Handle camera panning directly here since we have screen coordinates
        if self.input.input_mode == InputMode::CameraPan {
            let last_screen = self.input.last_mouse_screen;
            let screen_delta = current_screen - last_screen;
            // Debug-only pan logging
            #[cfg(debug_assertions)]
            web_sys::console::debug_1(&format!("[RUST-DEBUG] Camera panning by screen delta: {}, {}", -screen_delta.x, -screen_delta.y).into());
            self.camera.pan_by_screen_delta(Vec2::new(-screen_delta.x, -screen_delta.y));
            self.input.last_mouse_screen = current_screen;
            self.update_view_matrix(); // This calls renderer.set_view_matrix()
            #[cfg(debug_assertions)]
            web_sys::console::debug_1(&format!("[RUST-DEBUG] Camera position now: {}, {}", self.camera.world_x, self.camera.world_y).into());
            return;
        }
        
        // Use the event system to handle other mouse move events
        let result = self.event_system.handle_mouse_move(
            world_pos,
            &mut self.input,
            self.layer_manager.get_layers_mut(),
            &mut self.lighting,
            &mut self.wall_manager,
        );

        // Mark obstacles dirty when dragging a sprite on the obstacles layer
        // or when dragging a wall
        if self.input.input_mode == InputMode::WallDrag {
            self.obstacles_dirty = true;
        } else if matches!(self.input.input_mode, InputMode::SpriteMove | InputMode::SpriteResize(_)) {
            if let Some(ref sprite_id) = self.input.selected_sprite_id.clone() {
                let on_obstacles = self.layer_manager.find_sprite(sprite_id).map(|(_, l)| l == "obstacles").unwrap_or(false);
                if on_obstacles { self.obstacles_dirty = true; }
            }
        }
        
        // Update last mouse position
        self.input.last_mouse_screen = current_screen;
        
        // Handle event system results that need render engine specific operations
        match result {
            MouseEventResult::Handled => {
                // Event was handled by event system, update matrices if needed
                self.view_matrix = self.camera.view_matrix(self.canvas_size);
            }
            MouseEventResult::CameraOperation(cam_op) => {
                // Handle camera operations
                match cam_op.as_str() {
                    "update_view_matrix" => {
                        self.view_matrix = self.camera.view_matrix(self.canvas_size);
                    }
                    _ => {}
                }
            }
            MouseEventResult::CreateSprite(_) => {
                // Shape creation is handled in mouse up, not mouse move
            }
            MouseEventResult::None => {
                // Fallback to legacy handling if needed
            }
        }
        
        // Update last mouse position for next frame
        self.input.last_mouse_screen = current_screen;
    }
    
    #[wasm_bindgen]
    pub fn handle_mouse_up(&mut self, screen_x: f32, screen_y: f32) {
        let world_pos = self.camera.screen_to_world(Vec2::new(screen_x, screen_y));
        
        // Check if paint mode is active first
        if self.input.input_mode == InputMode::Paint {
            web_sys::console::log_1(&"[RUST] Paint mode active, ending paint stroke".into());
            self.paint.end_stroke();
            return;
        }
        
        // Use the event system to handle mouse up events
        let table_id = self.table_manager.get_active_table_id()
            .unwrap_or("default_table".to_string());
        let converter = self.table_manager.get_unit_converter(&table_id);
        
        let result = self.event_system.handle_mouse_up(
            world_pos,
            &mut self.input,
            self.layer_manager.get_layers_mut(),
            &mut self.lighting,
            &self.wall_manager,
            &mut self.fog,
            table_id,
            &self.active_layer.clone(),
            &converter,
        );
        
        // Handle event system results that need render engine specific operations
        match result {
            MouseEventResult::Handled => {
                // Event was handled by event system
            }
            MouseEventResult::CameraOperation(cam_op) => {
                // Handle camera operations if needed
                match cam_op.as_str() {
                    "update_view_matrix" => {
                        self.view_matrix = self.camera.view_matrix(self.canvas_size);
                    }
                    _ => {}
                }
            }
            MouseEventResult::CreateSprite(sprite_data) => {
                // Handle sprite creation
                let parts: Vec<&str> = sprite_data.split(':').collect();
                match parts[0] {
                    "rectangle" => {
                        if parts.len() >= 5 {
                            if let (Ok(x), Ok(y), Ok(width), Ok(height)) = (
                                parts[1].parse::<f32>(),
                                parts[2].parse::<f32>(),
                                parts[3].parse::<f32>(),
                                parts[4].parse::<f32>()
                            ) {
                                web_sys::console::log_1(&format!("[RUST] Creating rectangle sprite at {},{} size {}x{}", x, y, width, height).into());
                                
                                // Get shape settings from window
                                let (color, opacity, filled) = self.get_shape_settings();
                                let active_layer = self.active_layer.clone();

                                // Create sprite locally in Rust for immediate visibility
                                let sprite_id = self.create_rectangle_sprite_with_options(x, y, width, height, &active_layer, &color, opacity, filled);

                                // Send to server via gameAPI for synchronization
                                if let Some(window) = web_sys::window() {
                                    if let Ok(game_api) = js_sys::Reflect::get(&window, &"gameAPI".into()) {
                                        if let Ok(send_message) = js_sys::Reflect::get(&game_api, &"sendMessage".into()) {
                                            if let Ok(send_fn) = send_message.dyn_into::<js_sys::Function>() {
                                                let sprite_data = js_sys::Object::new();
                                                js_sys::Reflect::set(&sprite_data, &"id".into(), &sprite_id.into()).unwrap();
                                                js_sys::Reflect::set(&sprite_data, &"x".into(), &x.into()).unwrap();
                                                js_sys::Reflect::set(&sprite_data, &"y".into(), &y.into()).unwrap();
                                                js_sys::Reflect::set(&sprite_data, &"width".into(), &width.into()).unwrap();
                                                js_sys::Reflect::set(&sprite_data, &"height".into(), &height.into()).unwrap();
                                                js_sys::Reflect::set(&sprite_data, &"layer".into(), &active_layer.as_str().into()).unwrap();
                                                js_sys::Reflect::set(&sprite_data, &"texture_path".into(), &"".into()).unwrap();
                                                js_sys::Reflect::set(&sprite_data, &"color".into(), &color.as_str().into()).unwrap();
                                                js_sys::Reflect::set(&sprite_data, &"obstacle_type".into(), &"rectangle".into()).unwrap();
                                                let obs = js_sys::Object::new();
                                                js_sys::Reflect::set(&obs, &"x".into(), &x.into()).unwrap();
                                                js_sys::Reflect::set(&obs, &"y".into(), &y.into()).unwrap();
                                                js_sys::Reflect::set(&obs, &"width".into(), &width.into()).unwrap();
                                                js_sys::Reflect::set(&obs, &"height".into(), &height.into()).unwrap();
                                                js_sys::Reflect::set(&sprite_data, &"obstacle_data".into(), &obs).unwrap();

                                                let _ = send_fn.call2(&game_api, &"sprite_create".into(), &sprite_data);
                                            }
                                        }
                                    }
                                }
                                
                                // Dispatch event to notify UI
                                if let Some(window) = web_sys::window() {
                                    let event = web_sys::Event::new("spriteAdded").unwrap();
                                    let _ = window.dispatch_event(&event);
                                }
                            }
                        }
                    }
                    "circle" => {
                        if parts.len() >= 4 {
                            if let (Ok(x), Ok(y), Ok(radius)) = (
                                parts[1].parse::<f32>(),
                                parts[2].parse::<f32>(),
                                parts[3].parse::<f32>()
                            ) {
                                web_sys::console::log_1(&format!("[RUST] Creating circle sprite at {},{} radius {}", x, y, radius).into());
                                
                                // Get shape settings from window
                                let (color, opacity, filled) = self.get_shape_settings();
                                let active_layer = self.active_layer.clone();

                                // Create sprite locally in Rust for immediate visibility
                                let sprite_id = self.create_circle_sprite_with_options(x, y, radius, &active_layer, &color, opacity, filled);

                                // Send to server via gameAPI for synchronization
                                let diameter = radius * 2.0;
                                if let Some(window) = web_sys::window() {
                                    if let Ok(game_api) = js_sys::Reflect::get(&window, &"gameAPI".into()) {
                                        if let Ok(send_message) = js_sys::Reflect::get(&game_api, &"sendMessage".into()) {
                                            if let Ok(send_fn) = send_message.dyn_into::<js_sys::Function>() {
                                                let sprite_data = js_sys::Object::new();
                                                js_sys::Reflect::set(&sprite_data, &"id".into(), &sprite_id.into()).unwrap();
                                                js_sys::Reflect::set(&sprite_data, &"x".into(), &(x - radius).into()).unwrap();
                                                js_sys::Reflect::set(&sprite_data, &"y".into(), &(y - radius).into()).unwrap();
                                                js_sys::Reflect::set(&sprite_data, &"width".into(), &diameter.into()).unwrap();
                                                js_sys::Reflect::set(&sprite_data, &"height".into(), &diameter.into()).unwrap();
                                                js_sys::Reflect::set(&sprite_data, &"layer".into(), &active_layer.as_str().into()).unwrap();
                                                js_sys::Reflect::set(&sprite_data, &"texture_path".into(), &"".into()).unwrap();
                                                js_sys::Reflect::set(&sprite_data, &"color".into(), &color.as_str().into()).unwrap();
                                                js_sys::Reflect::set(&sprite_data, &"obstacle_type".into(), &"circle".into()).unwrap();
                                                let obs = js_sys::Object::new();
                                                js_sys::Reflect::set(&obs, &"cx".into(), &x.into()).unwrap();
                                                js_sys::Reflect::set(&obs, &"cy".into(), &y.into()).unwrap();
                                                js_sys::Reflect::set(&obs, &"radius".into(), &radius.into()).unwrap();
                                                js_sys::Reflect::set(&sprite_data, &"obstacle_data".into(), &obs).unwrap();

                                                let _ = send_fn.call2(&game_api, &"sprite_create".into(), &sprite_data);
                                            }
                                        }
                                    }
                                }
                                
                                // Dispatch event to notify UI
                                if let Some(window) = web_sys::window() {
                                    let event = web_sys::Event::new("spriteAdded").unwrap();
                                    let _ = window.dispatch_event(&event);
                                }
                            }
                        }
                    }
                    "line" => {
                        if parts.len() >= 5 {
                            if let (Ok(x1), Ok(y1), Ok(x2), Ok(y2)) = (
                                parts[1].parse::<f32>(),
                                parts[2].parse::<f32>(),
                                parts[3].parse::<f32>(),
                                parts[4].parse::<f32>()
                            ) {
                                web_sys::console::log_1(&format!("[RUST] Creating line sprite from {},{} to {},{}", x1, y1, x2, y2).into());
                                
                                // Get shape settings from window
                                let (color, opacity, _) = self.get_shape_settings(); // Lines don't use filled
                                let active_layer = self.active_layer.clone();

                                // Create sprite locally in Rust for immediate visibility
                                let sprite_id = self.create_line_sprite_with_options(x1, y1, x2, y2, &active_layer, &color, opacity);

                                // Send to server via gameAPI for synchronization
                                let min_x = x1.min(x2);
                                let min_y = y1.min(y2);
                                let width = (x2 - x1).abs().max(2.0);
                                let height = (y2 - y1).abs().max(2.0);

                                if let Some(window) = web_sys::window() {
                                    if let Ok(game_api) = js_sys::Reflect::get(&window, &"gameAPI".into()) {
                                        if let Ok(send_message) = js_sys::Reflect::get(&game_api, &"sendMessage".into()) {
                                            if let Ok(send_fn) = send_message.dyn_into::<js_sys::Function>() {
                                                let sprite_data = js_sys::Object::new();
                                                js_sys::Reflect::set(&sprite_data, &"id".into(), &sprite_id.into()).unwrap();
                                                js_sys::Reflect::set(&sprite_data, &"x".into(), &min_x.into()).unwrap();
                                                js_sys::Reflect::set(&sprite_data, &"y".into(), &min_y.into()).unwrap();
                                                js_sys::Reflect::set(&sprite_data, &"width".into(), &width.into()).unwrap();
                                                js_sys::Reflect::set(&sprite_data, &"height".into(), &height.into()).unwrap();
                                                js_sys::Reflect::set(&sprite_data, &"layer".into(), &active_layer.as_str().into()).unwrap();
                                                js_sys::Reflect::set(&sprite_data, &"texture_path".into(), &"".into()).unwrap();
                                                js_sys::Reflect::set(&sprite_data, &"color".into(), &color.as_str().into()).unwrap();
                                                js_sys::Reflect::set(&sprite_data, &"obstacle_type".into(), &"line".into()).unwrap();
                                                let obs = js_sys::Object::new();
                                                js_sys::Reflect::set(&obs, &"x1".into(), &x1.into()).unwrap();
                                                js_sys::Reflect::set(&obs, &"y1".into(), &y1.into()).unwrap();
                                                js_sys::Reflect::set(&obs, &"x2".into(), &x2.into()).unwrap();
                                                js_sys::Reflect::set(&obs, &"y2".into(), &y2.into()).unwrap();
                                                js_sys::Reflect::set(&sprite_data, &"obstacle_data".into(), &obs).unwrap();

                                                let _ = send_fn.call2(&game_api, &"sprite_create".into(), &sprite_data);
                                            }
                                        }
                                    }
                                }
                                
                                // Dispatch event to notify UI
                                if let Some(window) = web_sys::window() {
                                    let event = web_sys::Event::new("spriteAdded").unwrap();
                                    let _ = window.dispatch_event(&event);
                                }
                            }
                        }
                    }
                    _ => {}
                }
            }
            MouseEventResult::None => {
                // Fallback to legacy handling if needed
            }
        }
    }
    
    // Sprite management methods
    #[wasm_bindgen]
    pub fn add_sprite_to_layer(&mut self, layer_name: &str, sprite_data: &JsValue) -> Result<String, JsValue> {
        let result = self.layer_manager.add_sprite_to_layer(layer_name, sprite_data);
        if result.is_ok() && layer_name == "obstacles" { self.obstacles_dirty = true; }
        result
    }
    
    #[wasm_bindgen]
    pub fn remove_sprite(&mut self, sprite_id: &str) -> bool {
        let on_obstacles = self.layer_manager.find_sprite(sprite_id).map(|(_, l)| l == "obstacles").unwrap_or(false);
        let result = self.layer_manager.remove_sprite(sprite_id);
        if result {
            if self.input.selected_sprite_id.as_ref() == Some(&sprite_id.to_string()) {
                self.input.selected_sprite_id = None;
            }
            if on_obstacles { self.obstacles_dirty = true; }
        }
        result
    }
    
    #[wasm_bindgen]
    pub fn rotate_sprite(&mut self, sprite_id: &str, rotation_degrees: f64) -> bool {
        self.layer_manager.rotate_sprite(sprite_id, rotation_degrees)
    }
    
    #[wasm_bindgen]
    pub fn update_sprite_position(&mut self, sprite_id: &str, x: f64, y: f64) -> bool {
        let new_position = crate::math::Vec2::new(x as f32, y as f32);
        let ok = self.layer_manager.update_sprite_position(sprite_id, new_position);
        if ok {
            let on_obstacles = self.layer_manager.find_sprite(sprite_id).map(|(_, l)| l == "obstacles").unwrap_or(false);
            if on_obstacles { self.obstacles_dirty = true; }
        }
        ok
    }
    
    pub fn update_sprite_scale(&mut self, sprite_id: &str, scale_x: f64, scale_y: f64) -> bool {
        let new_scale = crate::math::Vec2::new(scale_x as f32, scale_y as f32);
        self.layer_manager.update_sprite_scale(sprite_id, new_scale)
    }
    #[wasm_bindgen]
    pub fn set_grid_enabled(&mut self, enabled: bool) {
        self.grid_system.set_enabled(enabled);
    }
    #[wasm_bindgen]
    pub fn set_grid_snapping(&mut self, enabled: bool) {
        self.grid_system.set_snapping(enabled);
    }
    
    #[wasm_bindgen]
    pub fn set_grid_size(&mut self, size: f32) {
        self.grid_system.set_size(size);
    }
    
    #[wasm_bindgen]
    pub fn get_grid_size(&self) -> f32 {
        self.grid_system.get_size()
    }
    // Texture management
    #[wasm_bindgen]
    pub fn load_texture(&mut self, name: &str, image: &HtmlImageElement) -> Result<(), JsValue> {
        self.texture_manager.load_texture(name, image)
    }

    // Right-click handling for context menu
    #[wasm_bindgen]
    pub fn handle_right_click(&self, screen_x: f32, screen_y: f32) -> Option<String> {
        let world_pos = self.camera.screen_to_world(Vec2::new(screen_x, screen_y));
        self.layer_manager.find_sprite_for_right_click(world_pos)
    }

    // Additional sprite management methods for frontend compatibility
    #[wasm_bindgen]
    pub fn delete_sprite(&mut self, sprite_id: &str) -> bool {
        self.remove_sprite(sprite_id)
    }

    #[wasm_bindgen]
    pub fn copy_sprite(&self, sprite_id: &str) -> Option<String> {
        self.layer_manager.copy_sprite(sprite_id)
    }

    #[wasm_bindgen]
    pub fn paste_sprite(&mut self, layer_name: &str, sprite_json: &str, offset_x: f64, offset_y: f64) -> Result<String, JsValue> {
        self.layer_manager.paste_sprite(layer_name, sprite_json, offset_x, offset_y)
    }

    #[wasm_bindgen]
    pub fn resize_sprite(&mut self, sprite_id: &str, new_width: f64, new_height: f64) -> bool {
        self.layer_manager.resize_sprite(sprite_id, new_width, new_height)
    }

    // Alias for resize_canvas to match frontend expectations
    #[wasm_bindgen]
    pub fn resize(&mut self, width: f32, height: f32) {
        self.resize_canvas(width, height);
    }

    // Lighting system methods
    #[wasm_bindgen]
    pub fn add_light(&mut self, id: &str, x: f32, y: f32) {
        web_sys::console::log_1(&format!("[RUST] add_light called: id={}, x={}, y={}", id, x, y).into());
        
        // Get active table_id
        let active_table_opt = self.table_manager.get_active_table_id();
        web_sys::console::log_1(&format!("[RUST] get_active_table_id returned: {:?}", active_table_opt).into());
        
        let table_id = active_table_opt.unwrap_or("default_table".to_string());
        
        let mut light = crate::lighting::Light::new(id.to_string(), x, y);
        light.table_id = table_id.clone(); // Set the active table_id
        
        self.lighting.add_light(light);
        web_sys::console::log_1(&format!("[RUST] Light added to table '{}'. Total lights: {}", 
            table_id, self.lighting.get_light_count()).into());
    }

    #[wasm_bindgen]
    pub fn remove_light(&mut self, id: &str) {
        self.lighting.remove_light(id);
    }

    #[wasm_bindgen]
    pub fn set_light_color(&mut self, id: &str, r: f32, g: f32, b: f32, a: f32) {
        if let Some(light) = self.lighting.get_light_mut(id) {
            light.set_color(Color::new(r, g, b, a));
        }
    }

    #[wasm_bindgen]
    pub fn set_light_intensity(&mut self, id: &str, intensity: f32) {
        if let Some(light) = self.lighting.get_light_mut(id) {
            light.set_intensity(intensity);
        }
    }

    #[wasm_bindgen]
    pub fn set_light_radius(&mut self, id: &str, radius: f32) {
        if let Some(light) = self.lighting.get_light_mut(id) {
            light.set_radius(radius);
        }
    }

    #[wasm_bindgen]
    pub fn toggle_light(&mut self, id: &str) {
        if let Some(light) = self.lighting.get_light_mut(id) {
            light.toggle();
        }
    }

    #[wasm_bindgen]
    pub fn update_light_position(&mut self, id: &str, x: f32, y: f32) {
        self.lighting.update_light_position(id, Vec2::new(x, y));
    }
    // ===== FOG OF WAR METHODS =====

    #[wasm_bindgen]
    pub fn set_gm_mode(&mut self, is_gm: bool) {
        self.is_gm = is_gm;
        self.fog.set_gm_mode(is_gm);
    }

    #[wasm_bindgen]
    pub fn set_active_layer(&mut self, layer_name: &str) {
        self.active_layer = layer_name.to_string();
    }
    // ===== WALL MANAGEMENT =====

    /// Add or replace a wall from a JSON object string.
    /// Returns true if the wall was successfully parsed and stored.
    #[wasm_bindgen]
    pub fn add_wall(&mut self, wall_json: &str) -> bool {
        let ok = self.wall_manager.add_wall_from_json(wall_json);
        if ok { self.obstacles_dirty = true; }
        ok
    }

    /// Remove a wall by its UUID string.
    #[wasm_bindgen]
    pub fn remove_wall(&mut self, wall_id: &str) -> bool {
        let removed = self.wall_manager.remove_wall(wall_id);
        if removed { self.obstacles_dirty = true; }
        removed
    }

    /// Update mutable fields of a wall from a partial JSON object.
    #[wasm_bindgen]
    pub fn update_wall(&mut self, wall_id: &str, updates_json: &str) -> bool {
        let ok = self.wall_manager.update_from_json(wall_id, updates_json);
        if ok { self.obstacles_dirty = true; }
        ok
    }

    /// Clear all walls (e.g. on table switch).
    #[wasm_bindgen]
    pub fn clear_walls(&mut self) {
        self.wall_manager.clear();
        self.obstacles_dirty = true;
    }

    /// Returns wall render data as a flat Float32Array: [x1,y1,x2,y2,r,g,b,a, ...] per wall.
    #[wasm_bindgen]
    pub fn get_wall_render_data(&self) -> js_sys::Float32Array {
        let data = self.wall_manager.get_render_data();
        js_sys::Float32Array::from(data.as_slice())
    }
    #[wasm_bindgen]
    pub fn set_current_user_id(&mut self, user_id: i32) {
        self.current_user_id = Some(user_id);
    }

    #[wasm_bindgen]
    pub fn add_fog_rectangle(&mut self, id: &str, start_x: f32, start_y: f32, end_x: f32, end_y: f32, mode: &str) {
        // Get active table_id
        let table_id = self.table_manager.get_active_table_id()
            .unwrap_or("default_table".to_string());
        
    self.fog.add_fog_rectangle(id.to_string(), start_x, start_y, end_x, end_y, mode, table_id.clone());
    // Debug-only confirmation to avoid duplicating higher-level JS logs
    #[cfg(debug_assertions)]
    web_sys::console::debug_1(&format!("[RUST-DEBUG] Fog rectangle added to table '{}'", table_id).into());
    }

    #[wasm_bindgen]
    pub fn remove_fog_rectangle(&mut self, id: &str) {
        self.fog.remove_fog_rectangle(id);
    }

    #[wasm_bindgen]
    pub fn clear_fog(&mut self) {
        self.fog.clear_fog();
    }

    #[wasm_bindgen]
    pub fn hide_entire_table(&mut self, table_width: f32, table_height: f32) {
        // Get active table_id
        let table_id = self.table_manager.get_active_table_id()
            .unwrap_or("default_table".to_string());
        
        self.fog.hide_entire_table(table_width, table_height, table_id);
    }

    pub fn is_point_in_fog(&self, x: f32, y: f32) -> bool {
        self.fog.is_point_in_fog(x, y)
    }
    // ============================================================================
    // INTERACTIVE CONTROLS - Mouse-based light positioning and fog drawing
    // ============================================================================
    
    // Light interaction methods
    pub fn get_light_at_position(&self, x: f32, y: f32) -> Option<String> {
        let world_pos = Vec2::new(x, y);
        self.lighting.get_light_at_position(world_pos, 30.0).map(|s| s.clone())
    }
    pub fn is_in_fog_draw_mode(&self) -> bool {
        matches!(self.input.input_mode, InputMode::FogDraw | InputMode::FogErase)
    }

    pub fn is_in_light_drag_mode(&self) -> bool {
        self.input.input_mode == InputMode::LightDrag
    }
    // ============================================================================
    // INPUT MODE CONTROL - Methods to set specific input modes
    // ============================================================================
    
    pub fn set_input_mode_measurement(&mut self) {
        self.input.input_mode = InputMode::Measurement;
        web_sys::console::log_1(&"[RUST] Input mode set to Measurement".into());
    }
    #[wasm_bindgen]
    pub fn set_input_mode_paint(&mut self) {
        self.input.input_mode = InputMode::Paint;
        web_sys::console::log_1(&"[RUST] Input mode set to Paint".into());
    }
    pub fn create_rectangle_sprite_with_options(&mut self, x: f32, y: f32, width: f32, height: f32, layer_name: &str, color: &str, opacity: f32, filled: bool) -> String {
        web_sys::console::log_1(&format!("[RUST] create_rectangle_sprite called: {},{} {}x{} on layer '{}' color: {} opacity: {} filled: {}", x, y, width, height, layer_name, color, opacity, filled).into());
        let sprite_id = format!("rect_{}", js_sys::Date::now() as u64);
        
        // Convert color and opacity to RGBA bytes
        let rgba_color = Self::hex_to_rgba(color, opacity);
        
        // Create procedural rectangle texture with color and fill
        let texture_name = format!("rect_texture_{}", sprite_id);
        let texture_width = width.max(16.0) as u32;
        let texture_height = height.max(16.0) as u32;
        let border_width = 2u32; // Border thickness in pixels
        if let Err(e) = self.texture_manager.create_rectangle_texture_with_color(&texture_name, texture_width, texture_height, border_width, rgba_color, filled) {
            web_sys::console::log_1(&format!("[RUST] Failed to create rectangle texture: {:?}", e).into());
        }
        
        let active_table_id = self.table_manager.get_active_table_id()
            .unwrap_or("default_table".to_string());
        
        let sprite = Sprite {
            id: sprite_id.clone(),
            world_x: x as f64,
            world_y: y as f64,
            width: width as f64,
            height: height as f64,
            rotation: 0.0,
            scale_x: 1.0,
            scale_y: 1.0,
            layer: layer_name.to_string(),
            texture_id: texture_name, // Use procedural rectangle texture
            tint_color: [1.0, 1.0, 1.0, 1.0], // White tint (no color change)
            table_id: active_table_id,
            ..Default::default()
        };
        
        web_sys::console::log_1(&format!("[RUST] Created sprite {}, adding to layer '{}'", sprite_id, layer_name).into());
        // Convert to JsValue for layer manager
        let sprite_data = serde_wasm_bindgen::to_value(&sprite).unwrap();
        let result = self.layer_manager.add_sprite_to_layer(layer_name, &sprite_data);
        web_sys::console::log_1(&format!("[RUST] add_sprite_to_layer result: {:?}", result).into());
        web_sys::console::log_1(&format!("[RUST] Created rectangle sprite: {}", sprite_id).into());
        sprite_id
    }
    pub fn create_circle_sprite_with_options(&mut self, x: f32, y: f32, radius: f32, layer_name: &str, color: &str, opacity: f32, filled: bool) -> String {
        let sprite_id = format!("circle_{}", js_sys::Date::now() as u64);
        let diameter = radius * 2.0;
        
        // Convert color and opacity to RGBA bytes
        let rgba_color = Self::hex_to_rgba(color, opacity);
        
        // Create procedural circle texture with color and fill
        let texture_name = format!("circle_texture_{}", sprite_id);
        let texture_size = (diameter.max(32.0) as u32).min(256); // Reasonable size limits
        if let Err(e) = self.texture_manager.create_circle_texture_with_color(&texture_name, texture_size, rgba_color, filled) {
            web_sys::console::log_1(&format!("[RUST] Failed to create circle texture: {:?}", e).into());
        }
        
        let active_table_id = self.table_manager.get_active_table_id()
            .unwrap_or("default_table".to_string());
        
        let sprite = Sprite {
            id: sprite_id.clone(),
            world_x: (x - radius) as f64,
            world_y: (y - radius) as f64,
            width: diameter as f64,
            height: diameter as f64,
            rotation: 0.0,
            scale_x: 1.0,
            scale_y: 1.0,
            layer: layer_name.to_string(),
            texture_id: texture_name, // Use procedural circle texture
            tint_color: [1.0, 1.0, 1.0, 1.0], // White tint (no color change)
            table_id: active_table_id,
            ..Default::default()
        };
        
        // Convert to JsValue for layer manager
        let sprite_data = serde_wasm_bindgen::to_value(&sprite).unwrap();
        let _ = self.layer_manager.add_sprite_to_layer(layer_name, &sprite_data);
        web_sys::console::log_1(&format!("[RUST] Created circle sprite: {}", sprite_id).into());
        sprite_id
    }

    pub fn create_line_sprite_with_options(&mut self, start_x: f32, start_y: f32, end_x: f32, end_y: f32, layer_name: &str, color: &str, opacity: f32) -> String {
        let sprite_id = format!("line_{}", js_sys::Date::now() as u64);

        let dx = end_x - start_x;
        let dy = end_y - start_y;
        let length = (dx * dx + dy * dy).sqrt();
        let width: f32 = 4.0;

        let center_x = (start_x + end_x) / 2.0;
        let center_y = (start_y + end_y) / 2.0;
        let angle = dy.atan2(dx);

        let rgba_color = Self::hex_to_rgba(color, opacity);

        let texture_name = format!("line_texture_{}", sprite_id);
        let texture_width = length.max(8.0) as u32;
        let texture_height = width.max(4.0) as u32;
        let line_width = 2u32;
        if let Err(e) = self.texture_manager.create_line_texture_with_color(&texture_name, texture_width, texture_height, line_width, rgba_color) {
            web_sys::console::log_1(&format!("[RUST] Failed to create line texture: {:?}", e).into());
        }

        let active_table_id = self.table_manager.get_active_table_id()
            .unwrap_or("default_table".to_string());

        let sprite = Sprite {
            id: sprite_id.clone(),
            world_x: (center_x - length / 2.0) as f64,
            world_y: (center_y - width / 2.0) as f64,
            width: length as f64,
            height: width as f64,
            rotation: angle as f64,
            scale_x: 1.0,
            scale_y: 1.0,
            layer: layer_name.to_string(),
            texture_id: texture_name,
            tint_color: [1.0, 1.0, 1.0, 1.0],
            table_id: active_table_id,
            ..Default::default()
        };

        let sprite_data = serde_wasm_bindgen::to_value(&sprite).unwrap();
        let _ = self.layer_manager.add_sprite_to_layer(layer_name, &sprite_data);
        web_sys::console::log_1(&format!("[RUST] Created line sprite: {} at ({:.1}, {:.1})", sprite_id, center_x, center_y).into());
        sprite_id
    }

    pub fn batch_actions(&mut self, actions: &JsValue) -> JsValue {
        self.actions.batch_actions(actions)
    }
    pub fn can_undo(&self) -> bool {
        self.actions.can_undo()
    }

    pub fn can_redo(&self) -> bool {
        self.actions.can_redo()
    }
    // Advanced Layer Management for Rendering Pipeline
    #[wasm_bindgen]
    pub fn set_layer_opacity(&mut self, layer_name: &str, opacity: f32) -> bool {
        self.layer_manager.set_layer_opacity(layer_name, opacity)
    }
    
    #[wasm_bindgen]
    pub fn set_layer_visibility(&mut self, layer_name: &str, visible: bool) -> bool {
        self.layer_manager.set_layer_visibility(layer_name, visible)
    }
    
    #[wasm_bindgen]
    pub fn set_layer_blend_mode(&mut self, layer_name: &str, blend_mode: &str) -> bool {
        use crate::types::BlendMode;
        let blend_mode = match blend_mode {
            "alpha" => BlendMode::Alpha,
            "additive" => BlendMode::Additive,
            "modulate" => BlendMode::Modulate,
            "multiply" => BlendMode::Multiply,
            _ => return false,
        };
        self.layer_manager.set_layer_blend_mode(layer_name, blend_mode)
    }
    
    #[wasm_bindgen]
    pub fn set_layer_color(&mut self, layer_name: &str, r: f32, g: f32, b: f32) -> bool {
        self.layer_manager.set_layer_color(layer_name, r, g, b)
    }
    #[wasm_bindgen]
    pub fn get_layer_names(&self) -> Vec<String> {
        self.layer_manager.get_layers().keys().cloned().collect()
    }
    
    #[wasm_bindgen]
    pub fn get_layer_sprite_count(&self, layer_name: &str) -> usize {
        if let Some(layer) = self.layer_manager.get_layer(layer_name) {
            layer.sprites.len()
        } else {
            0
        }
    }
    pub fn clear_layer(&mut self, layer_name: &str) -> bool {
        if let Some(layer) = self.layer_manager.get_layer_mut(layer_name) {
            layer.sprites.clear();
            true
        } else {
            false
        }
    }
    pub fn set_layer_visible(&mut self, layer_name: &str, visible: bool) -> bool {
        self.layer_manager.set_layer_visibility(layer_name, visible)
    }

    // Paint System Methods
    
    // Table management for paint
    pub fn paint_set_current_table(&mut self, table_id: &str) {
        self.paint.set_current_table(table_id);
    }
    #[wasm_bindgen]
    pub fn paint_enter_mode(&mut self, width: f32, height: f32) {
        self.paint.enter_paint_mode(width, height);
    }
    
    #[wasm_bindgen]
    pub fn paint_exit_mode(&mut self) {
        self.paint.exit_paint_mode();
    }
    #[wasm_bindgen]
    pub fn paint_set_brush_color(&mut self, r: f32, g: f32, b: f32, a: f32) {
        self.paint.set_brush_color(r, g, b, a);
    }
    
    #[wasm_bindgen]
    pub fn paint_set_brush_width(&mut self, width: f32) {
        self.paint.set_brush_width(width);
    }
    
    #[wasm_bindgen]
    pub fn paint_set_blend_mode(&mut self, blend_mode: &str) {
        self.paint.set_blend_mode(blend_mode);
    }
    #[wasm_bindgen]
    pub fn paint_start_stroke(&mut self, world_x: f32, world_y: f32, pressure: f32) -> bool {
        self.paint.start_stroke(world_x, world_y, pressure)
    }
    
    #[wasm_bindgen]
    pub fn paint_add_point(&mut self, world_x: f32, world_y: f32, pressure: f32) -> bool {
        self.paint.add_stroke_point(world_x, world_y, pressure)
    }
    
    #[wasm_bindgen]
    pub fn paint_end_stroke(&mut self) -> bool {
        self.paint.end_stroke()
    }
    #[wasm_bindgen]
    pub fn paint_clear_all(&mut self) {
        self.paint.clear_all_strokes();
    }
    #[wasm_bindgen]
    pub fn paint_undo_stroke(&mut self) -> bool {
        self.paint.undo_last_stroke()
    }
    /// Handle table data received from server
    #[wasm_bindgen]
    pub fn handle_table_data(&mut self, table_data_js: &JsValue) -> Result<(), JsValue> {
        // First, parse and store the table data
        self.table_sync.handle_table_data(table_data_js)?;
        
        // Get the parsed table data
        let table_data = self.table_sync.get_table_data();
        if table_data.is_null() {
            return Err(JsValue::from_str("Failed to get table data"));
        }

        // Parse the table data to sync with render engine
        let table: crate::table_sync::TableData = serde_wasm_bindgen::from_value(table_data)
            .map_err(|e| JsValue::from_str(&format!("Failed to parse table data for rendering: {}", e)))?;

        // Update table manager
        if let Some(table_id) = self.table_sync.get_table_id() {
            web_sys::console::log_1(&format!("[RUST] handle_table_data: Setting active table to '{}'", table_id).into());
            
            // Check if we're switching from a different table
            let old_table_id = self.table_manager.get_active_table_id();
            let is_switching_tables = old_table_id.as_ref().map_or(false, |old_id| old_id != &table_id);
            
            if is_switching_tables {
                if let Some(old_id) = old_table_id {
                    web_sys::console::log_1(&format!("[TABLE-SWITCH] 🔄 Switching from table '{}' to '{}'", old_id, table_id).into());
                    
                    // Clean up old table's resources
                    let sprites_removed = self.layer_manager.clear_sprites_for_table(&old_id);
                    let lights_removed = self.lighting.clear_lights_for_table(&old_id);
                    let fog_removed = self.fog.clear_fog_for_table(&old_id);
                    
                    web_sys::console::log_1(&format!(
                        "[TABLE-SWITCH] 🗑️ Cleaned up old table '{}': {} sprites, {} lights, {} fog",
                        old_id, sprites_removed, lights_removed, fog_removed
                    ).into());
                }
            }
            
            self.table_manager.create_table(&table_id, &table.table_name, table.width, table.height)?;
            self.table_manager.set_active_table(&table_id);
            // Sync unit system from server table config
            self.table_manager.set_table_units(
                &table_id,
                table.grid_cell_px,
                table.cell_distance,
                &table.distance_unit,
            );
            // Keep grid system in sync
            self.grid_system.sync_from_table(table.grid_cell_px as f32);
            
            // Verify it was set
            let active = self.table_manager.get_active_table_id();
            web_sys::console::log_1(&format!("[RUST] handle_table_data: Active table is now: {:?}", active).into());
            
            // ===== UPDATE CAMERA AND FOG BOUNDS FOR NEW TABLE =====
            // Get the new table bounds
            if let Some((tx, ty, tw, th)) = self.table_manager.get_active_table_world_bounds() {
                // Update camera bounds to match new table
                self.camera.set_table_bounds(tx, ty, tw, th);
                web_sys::console::log_1(&format!("[TABLE-SWITCH] 🎯 Updated camera bounds: {}x{}", tw, th).into());
                
                // Update fog system bounds to match new table
                self.fog.set_table_bounds(tx as f32, ty as f32, tw as f32, th as f32);
                web_sys::console::log_1(&format!("[TABLE-SWITCH] 🌫️ Updated fog bounds: {}x{}", tw, th).into());
                
                // Position camera at table origin (0, 0)
                // This aligns screen top-left with table top-left
                self.camera.center_on(tx, ty);
                web_sys::console::log_1(&format!("[TABLE-SWITCH] 📷 Camera positioned at table origin ({}, {})", tx, ty).into());
                
                // CRITICAL: Update view matrix after camera position change!
                self.update_view_matrix();
                web_sys::console::log_1(&"[TABLE-SWITCH] ✅ View matrix updated".into());
            }
        }

        // Clear existing sprites from all layers
        self.layer_manager.clear_all_layers();

        // Add sprites to appropriate layers - pass table_id to ensure correct association
        let table_id = table.table_id.clone();
        for (_layer_name, sprites) in &table.layers {
            // Note: layer_name is available if needed for layer-specific logic
            for sprite_data in sprites {
                // The sprite data already contains layer information
                self.add_sprite_from_table_data(sprite_data, &table_id)?;
            }
        }

        web_sys::console::log_1(&format!("Successfully synced table '{}' with {} layers", 
            table.table_name, table.layers.len()).into());

        Ok(())
    }

    /// Add a sprite from table sync data to the render engine
    fn add_sprite_from_table_data(&mut self, sprite_data: &crate::table_sync::SpriteData, table_id: &str) -> Result<(), JsValue> {
        let character_id = sprite_data.character_id.clone();
        let controlled_by = sprite_data.controlled_by.clone().unwrap_or_default();
        // Prefer game-unit aura radius; fall back to legacy pixel radius
        let aura_radius = if let Some(units) = sprite_data.aura_radius_units {
            let conv = self.table_manager.get_unit_converter(table_id);
            Some(conv.to_pixels(units as f32) as f64)
        } else {
            sprite_data.aura_radius
        };
        let aura_color = sprite_data.aura_color.clone();

        let sprite = Sprite {
            id: sprite_data.sprite_id.clone(),
            world_x: sprite_data.coord_x,
            world_y: sprite_data.coord_y,
            width: 50.0,
            height: 50.0,
            scale_x: sprite_data.scale_x,
            scale_y: sprite_data.scale_y,
            rotation: sprite_data.rotation.unwrap_or(0.0),
            layer: sprite_data.layer.clone(),
            texture_id: sprite_data.texture_path.clone(),
            tint_color: [1.0, 1.0, 1.0, 1.0],
            table_id: table_id.to_string(),
            character_id,
            controlled_by,
            hp: sprite_data.hp,
            max_hp: sprite_data.max_hp,
            ac: sprite_data.ac,
            aura_radius,
            aura_color: aura_color.clone(),
            is_text_sprite: None,
            text_content: None,
            text_size: None,
            text_color: None,
            obstacle_type: None,
            polygon_vertices: None,
        };

        let sprite_js = serde_wasm_bindgen::to_value(&sprite)?;
        self.layer_manager.add_sprite_to_layer(&sprite_data.layer, &sprite_js)?;

        // Auto-attach light for tokens with aura_radius
        if let Some(radius) = aura_radius {
            let cx = (sprite_data.coord_x + 25.0) as f32;
            let cy = (sprite_data.coord_y + 25.0) as f32;
            let light_id = format!("token_light_{}", sprite_data.sprite_id);
            let active_table = self.table_manager.get_active_table_id().unwrap_or_else(|| table_id.to_string());
            let mut light = crate::lighting::Light::new(light_id, cx, cy);
            light.table_id = active_table;
            light.set_radius(radius as f32);
            if let Some(hex) = aura_color {
                if let Some(color) = parse_hex_color(&hex) {
                    light.set_color(color);
                }
            }
            self.lighting.add_light(light);
        }

        if !sprite_data.texture_path.is_empty() {
            self.request_asset_if_needed(&sprite_data.texture_path);
        }

        Ok(())
    }

    /// Request asset download if not already available
    fn request_asset_if_needed(&self, texture_path: &str) {
        // Check if we already have this asset
        if !self.texture_manager.has_texture(texture_path) {
            // Dispatch event to request asset download
            let detail = js_sys::Object::new();
            js_sys::Reflect::set(&detail, &"asset_path".into(), &texture_path.into()).unwrap();
            
            let event_init = web_sys::CustomEventInit::new();
            event_init.set_detail(&detail);
            let event = web_sys::CustomEvent::new_with_event_init_dict(
                "asset-download-request",
                &event_init
            ).unwrap();
            
            if let Some(window) = web_sys::window() {
                let _ = window.dispatch_event(&event);
            }
        }
    }
    /// Send sprite move update to server
    pub fn send_sprite_move(&mut self, sprite_id: &str, x: f64, y: f64) -> Result<String, JsValue> {
        self.table_sync.send_sprite_move(sprite_id, x, y)
    }
    /// Send sprite creation to server
    pub fn send_sprite_create(&self, sprite_data_js: &JsValue) -> Result<(), JsValue> {
        self.table_sync.send_sprite_create(sprite_data_js)
    }
    /// Request table data from server
    pub fn request_table(&self, table_name: &str) -> Result<(), JsValue> {
        self.table_sync.request_table(table_name)
    }
    // ===== ENHANCED INPUT & SELECTION METHODS =====
    
    /// Get list of currently selected sprite IDs
    #[wasm_bindgen]
    pub fn get_selected_sprites(&self) -> Vec<JsValue> {
        self.input.selected_sprite_ids
            .iter()
            .map(|id| JsValue::from_str(id))
            .collect()
    }

    /// Select all sprites in the current layer
    #[wasm_bindgen]
    pub fn select_all_sprites(&mut self) {
        self.input.selected_sprite_ids.clear();
        // Iterate through all layers to find sprites
        for layer in self.layer_manager.get_layers().values() {
            for sprite in &layer.sprites {
                self.input.selected_sprite_ids.push(sprite.id.clone());
            }
        }
        self.input.selected_sprite_id = self.input.selected_sprite_ids.first().cloned();
    }

    /// Clear current selection
    #[wasm_bindgen]
    pub fn clear_selection(&mut self) {
        self.input.clear_selection();
    }
    /// Get sprite position for movement operations
    #[wasm_bindgen]
    pub fn get_sprite_position(&self, sprite_id: &str) -> Option<Vec<f32>> {
        self.find_sprite(sprite_id).map(|sprite| vec![sprite.world_x as f32, sprite.world_y as f32])
    }

    /// Get sprite scale for scaling operations  
    #[wasm_bindgen]
    pub fn get_sprite_scale(&self, sprite_id: &str) -> Option<Vec<f32>> {
        self.find_sprite(sprite_id).map(|sprite| vec![sprite.scale_x as f32, sprite.scale_y as f32])
    }

    /// Get sprite data for network synchronization
    pub fn get_sprite_data(&self, sprite_id: &str) -> JsValue {
        if let Some(sprite) = self.find_sprite(sprite_id) {
            serde_wasm_bindgen::to_value(sprite).unwrap_or(JsValue::NULL)
        } else {
            JsValue::NULL
        }
    }

    /// Enhanced mouse down handler with modifier key support
    pub fn handle_mouse_down_with_modifiers(&mut self, screen_x: f64, screen_y: f64, ctrl_key: bool, shift_key: bool) -> Option<String> {
        let world_coords = self.screen_to_world(screen_x as f32, screen_y as f32);
        let world_pos = Vec2::new(world_coords[0] as f32, world_coords[1] as f32);
        
        if ctrl_key {
            if let Some(sprite_id) = self.find_sprite_at_position(world_pos) {
                if self.input.is_sprite_selected(&sprite_id) {
                    self.input.remove_from_selection(&sprite_id);
                } else {
                    self.input.add_to_selection(sprite_id.clone());
                }
                return Some(sprite_id);
            }
        } else {
            if let Some(sprite_id) = self.find_sprite_at_position(world_pos) {
                self.input.set_single_selection(sprite_id.clone());
                return Some(sprite_id);
            } else if !shift_key {
                self.input.start_area_selection(world_pos);
            }
        }
        None
    }

    // Helper methods
    fn find_sprite(&self, sprite_id: &str) -> Option<&crate::types::Sprite> {
        self.layer_manager.find_sprite(sprite_id).map(|(sprite, _)| sprite)
    }

    fn find_sprite_at_position(&self, world_pos: Vec2) -> Option<String> {
        // Use existing LayerManager method for finding sprites at position
        self.layer_manager.find_sprite_for_right_click(world_pos)
    }
}
