use crate::math::Vec2;
use crate::types::Sprite;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum InputMode {
    None,
    CameraPan,
    SpriteMove,
    SpriteResize(ResizeHandle),
    SpriteRotate,
    AreaSelect,
    LightDrag,      // New: Dragging light source
    FogDraw,        // New: Drawing fog rectangles
    FogErase,       // New: Erasing fog rectangles
    Measurement,    // New: Measurement tool
    CreateRectangle, // New: Create rectangle sprite
    CreateCircle,   // New: Create circle sprite
    CreateLine,     // New: Create line sprite
    CreateText,     // New: Create text sprite
    Paint,          // New: Paint/brush tool
    DrawWall,       // New: Draw wall segment (two-click placement)
    CreatePolygon,  // New: Create polygon obstacle (multi-click, close-on-first-vertex)
    WallDrag,       // Dragging an existing wall to a new position
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ResizeHandle {
    TopLeft,
    TopRight,
    BottomLeft,
    BottomRight,
    TopCenter,
    BottomCenter,
    LeftCenter,
    RightCenter,
}

pub struct InputHandler {
    pub input_mode: InputMode,
    pub last_mouse_screen: Vec2,
    pub selected_sprite_id: Option<String>,
    pub selected_sprite_ids: Vec<String>,  // New: Multiple selection support
    pub drag_offset: Vec2,
    pub rotation_start_angle: f64,
    pub sprite_initial_rotation: f64,
    pub area_select_start: Option<Vec2>,   // New: Area selection start position
    pub area_select_current: Option<Vec2>, // New: Area selection current position
    
    // Lighting interaction state
    pub selected_light_id: Option<String>,
    pub light_drag_offset: Vec2,
    
    // Fog interaction state
    pub fog_draw_start: Option<Vec2>,
    pub fog_draw_current: Option<Vec2>,
    pub fog_mode: FogDrawMode,
    
    // Measurement tool state
    pub measurement_start: Option<Vec2>,
    pub measurement_current: Option<Vec2>,
    pub completed_measurement: Option<(Vec2, Vec2)>, // Persists after mouse up
    
    // Shape creation state
    pub shape_creation_start: Option<Vec2>,
    pub shape_creation_current: Option<Vec2>,
    
    // Double-click detection
    pub last_click_time: f64,
    pub last_click_sprite: Option<String>,

    // Wall drawing state (two-click placement)
    pub wall_draw_start: Option<Vec2>,
    pub wall_draw_current: Option<Vec2>,

    // Polygon creation state (multi-click, close on first vertex)
    pub polygon_vertices: Vec<Vec2>,
    pub polygon_cursor: Option<Vec2>,

    // Wall drag state
    pub dragged_wall_id: Option<String>,
    pub wall_drag_last: Vec2,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum FogDrawMode {
    Hide,
    Reveal,
}

impl Default for InputHandler {
    fn default() -> Self {
        Self {
            input_mode: InputMode::None,
            last_mouse_screen: Vec2::new(0.0, 0.0),
            selected_sprite_id: None,
            selected_sprite_ids: Vec::new(),
            drag_offset: Vec2::new(0.0, 0.0),
            rotation_start_angle: 0.0,
            sprite_initial_rotation: 0.0,
            area_select_start: None,
            area_select_current: None,
            selected_light_id: None,
            light_drag_offset: Vec2::new(0.0, 0.0),
            fog_draw_start: None,
            fog_draw_current: None,
            fog_mode: FogDrawMode::Hide,
            measurement_start: None,
            measurement_current: None,
            completed_measurement: None,
            shape_creation_start: None,
            shape_creation_current: None,
            last_click_time: 0.0,
            last_click_sprite: None,
            wall_draw_start: None,
            wall_draw_current: None,
            polygon_vertices: Vec::new(),
            polygon_cursor: None,
            dragged_wall_id: None,
            wall_drag_last: Vec2::new(0.0, 0.0),
        }
    }
}

impl InputHandler {
    pub fn new() -> Self {
        Self::default()
    }
    
    // ===== SPRITE SELECTION METHODS =====
    
    pub fn get_selected_sprites(&self) -> &Vec<String> {
        &self.selected_sprite_ids
    }
    
    pub fn add_to_selection(&mut self, sprite_id: String) {
        if !self.selected_sprite_ids.contains(&sprite_id) {
            self.selected_sprite_ids.push(sprite_id.clone());
        }
        self.selected_sprite_id = Some(sprite_id); // Keep primary selection for single operations
    }
    
    pub fn remove_from_selection(&mut self, sprite_id: &str) {
        self.selected_sprite_ids.retain(|id| id != sprite_id);
        if self.selected_sprite_id.as_ref() == Some(&sprite_id.to_string()) {
            self.selected_sprite_id = self.selected_sprite_ids.first().cloned();
        }
    }
    
    pub fn clear_selection(&mut self) {
        self.selected_sprite_ids.clear();
        self.selected_sprite_id = None;
    }
    
    pub fn set_single_selection(&mut self, sprite_id: String) {
        self.selected_sprite_ids.clear();
        self.selected_sprite_ids.push(sprite_id.clone());
        self.selected_sprite_id = Some(sprite_id);
    }
    
    pub fn has_multiple_selected(&self) -> bool {
        self.selected_sprite_ids.len() > 1
    }
    
    pub fn is_sprite_selected(&self, sprite_id: &str) -> bool {
        self.selected_sprite_ids.contains(&sprite_id.to_string())
    }
    
    // Area selection methods
    pub fn start_area_selection(&mut self, world_pos: Vec2) {
        self.area_select_start = Some(world_pos);
        self.area_select_current = Some(world_pos);
        self.input_mode = InputMode::AreaSelect;
    }
    
    pub fn get_area_selection_rect(&self) -> Option<(Vec2, Vec2)> {
        if let (Some(start), Some(current)) = (self.area_select_start, self.area_select_current) {
            let min_x = start.x.min(current.x);
            let max_x = start.x.max(current.x);
            let min_y = start.y.min(current.y);
            let max_y = start.y.max(current.y);
            Some((Vec2::new(min_x, min_y), Vec2::new(max_x, max_y)))
        } else {
            None
        }
    }
    
    pub fn finish_area_selection(&mut self) {
        self.area_select_start = None;
        self.area_select_current = None;
        self.input_mode = InputMode::None;
    }

    // Light interaction methods
    pub fn start_light_drag(&mut self, light_id: String, world_pos: Vec2, light_pos: Vec2) {
        self.input_mode = InputMode::LightDrag;
        self.selected_light_id = Some(light_id);
        self.light_drag_offset = Vec2::new(light_pos.x - world_pos.x, light_pos.y - world_pos.y);
    }

    pub fn update_light_drag(&mut self, world_pos: Vec2) -> Option<Vec2> {
        if self.input_mode == InputMode::LightDrag {
            Some(Vec2::new(
                world_pos.x + self.light_drag_offset.x,
                world_pos.y + self.light_drag_offset.y,
            ))
        } else {
            None
        }
    }

    pub fn end_light_drag(&mut self) -> Option<String> {
        if self.input_mode == InputMode::LightDrag {
            self.input_mode = InputMode::None;
            let light_id = self.selected_light_id.take();
            self.light_drag_offset = Vec2::new(0.0, 0.0);
            light_id
        } else {
            None
        }
    }

    // Fog interaction methods
    pub fn start_fog_draw(&mut self, world_pos: Vec2, mode: FogDrawMode) {
        self.input_mode = match mode {
            FogDrawMode::Hide => InputMode::FogDraw,
            FogDrawMode::Reveal => InputMode::FogErase,
        };
        self.fog_mode = mode;
        self.fog_draw_start = Some(world_pos);
        self.fog_draw_current = Some(world_pos);
    }

    pub fn update_fog_draw(&mut self, world_pos: Vec2) -> Option<(Vec2, Vec2)> {
        if matches!(self.input_mode, InputMode::FogDraw | InputMode::FogErase) {
            self.fog_draw_current = Some(world_pos);
            if let Some(start) = self.fog_draw_start {
                Some((start, world_pos))
            } else {
                None
            }
        } else {
            None
        }
    }

    pub fn end_fog_draw(&mut self) -> Option<(Vec2, Vec2, FogDrawMode)> {
        if matches!(self.input_mode, InputMode::FogDraw | InputMode::FogErase) {
            self.input_mode = InputMode::None;
            if let (Some(start), Some(end)) = (self.fog_draw_start.take(), self.fog_draw_current.take()) {
                let mode = self.fog_mode;
                Some((start, end, mode))
            } else {
                None
            }
        } else {
            None
        }
    }

    // ============================================================================
    // MEASUREMENT TOOL METHODS
    // ============================================================================
    
    pub fn start_measurement(&mut self, pos: Vec2) {
        self.measurement_start = Some(pos);
        self.measurement_current = Some(pos);
    }

    pub fn update_measurement(&mut self, pos: Vec2) {
        if self.measurement_start.is_some() {
            self.measurement_current = Some(pos);
        }
    }

    pub fn end_measurement(&mut self) -> Option<(Vec2, Vec2)> {
        if let (Some(start), Some(end)) = (self.measurement_start, self.measurement_current) {
            self.completed_measurement = Some((start, end)); // Save completed measurement
            self.measurement_start = None;
            self.measurement_current = None;
            Some((start, end))
        } else {
            None
        }
    }

    pub fn get_measurement_line(&self) -> Option<(Vec2, Vec2)> {
        // During active measurement, show current line
        if let (Some(start), Some(current)) = (self.measurement_start, self.measurement_current) {
            Some((start, current))
        }
        // After mouse up, show completed measurement until cleared
        else if let Some(completed) = self.completed_measurement {
            Some(completed)
        } else {
            None
        }
    }
    
    pub fn clear_completed_measurement(&mut self) {
        self.completed_measurement = None;
    }

    // ============================================================================
    // SHAPE CREATION METHODS
    // ============================================================================
    
    pub fn start_shape_creation(&mut self, pos: Vec2) {
        self.shape_creation_start = Some(pos);
        self.shape_creation_current = Some(pos);
    }

    pub fn update_shape_creation(&mut self, pos: Vec2) {
        if self.shape_creation_start.is_some() {
            self.shape_creation_current = Some(pos);
        }
    }

    pub fn end_shape_creation(&mut self) -> Option<(Vec2, Vec2)> {
        if let (Some(start), Some(end)) = (self.shape_creation_start, self.shape_creation_current) {
            self.shape_creation_start = None;
            self.shape_creation_current = None;
            Some((start, end))
        } else {
            None
        }
    }

    pub fn get_shape_creation_rect(&self) -> Option<(Vec2, Vec2)> {
        if let (Some(start), Some(current)) = (self.shape_creation_start, self.shape_creation_current) {
            Some((start, current))
        } else {
            None
        }
    }
    
    /// Check if a sprite click is a double-click (within 300ms of previous click on same sprite)
    /// Returns true if double-click detected
    pub fn check_double_click(&mut self, sprite_id: &str, current_time: f64) -> bool {
        const DOUBLE_CLICK_THRESHOLD_MS: f64 = 300.0;
        
        let is_double_click = if let Some(last_sprite) = &self.last_click_sprite {
            if last_sprite == sprite_id {
                let time_diff = current_time - self.last_click_time;
                time_diff < DOUBLE_CLICK_THRESHOLD_MS
            } else {
                false
            }
        } else {
            false
        };
        
        self.last_click_time = current_time;
        self.last_click_sprite = Some(sprite_id.to_string());
        is_double_click
    }
    
    // ============================================================================
    // WALL DRAWING METHODS (two-click placement)
    // ============================================================================

    /// First click: store start point and start live preview.
    /// Second click: return completed segment and reset start.
    /// Returns Some((start, end)) when a wall segment is ready to be created.
    pub fn register_wall_click(&mut self, pos: Vec2) -> Option<(Vec2, Vec2)> {
        if let Some(start) = self.wall_draw_start.take() {
            // Second click — complete the wall
            self.wall_draw_current = None;
            Some((start, pos))
        } else {
            // First click — start preview
            self.wall_draw_start = Some(pos);
            self.wall_draw_current = Some(pos);
            None
        }
    }

    pub fn update_wall_draw(&mut self, pos: Vec2) {
        if self.wall_draw_start.is_some() {
            self.wall_draw_current = Some(pos);
        }
    }

    pub fn get_wall_preview_line(&self) -> Option<(Vec2, Vec2)> {
        if let (Some(start), Some(current)) = (self.wall_draw_start, self.wall_draw_current) {
            Some((start, current))
        } else {
            None
        }
    }

    pub fn cancel_wall_draw(&mut self) {
        self.wall_draw_start = None;
        self.wall_draw_current = None;
    }

    // ============================================================================
    // POLYGON CREATION
    // ============================================================================

    /// The distance threshold (world units) within which clicking near the first
    /// vertex closes the polygon.
    const POLYGON_CLOSE_THRESHOLD: f32 = 20.0;

    /// Add a vertex. Returns true if the click closes the polygon (≥3 verts, near first).
    pub fn add_polygon_vertex(&mut self, pos: Vec2) -> bool {
        if self.polygon_vertices.len() >= 3 {
            let first = self.polygon_vertices[0];
            let dx = pos.x - first.x;
            let dy = pos.y - first.y;
            if (dx * dx + dy * dy).sqrt() < Self::POLYGON_CLOSE_THRESHOLD {
                return true;
            }
        }
        self.polygon_vertices.push(pos);
        false
    }

    /// Move the live preview cursor.
    pub fn update_polygon_cursor(&mut self, pos: Vec2) {
        self.polygon_cursor = Some(pos);
    }

    /// Consume vertices and return them (resets state).
    pub fn close_polygon(&mut self) -> Option<Vec<Vec2>> {
        if self.polygon_vertices.len() < 3 { return None; }
        let verts = std::mem::take(&mut self.polygon_vertices);
        self.polygon_cursor = None;
        Some(verts)
    }

    /// Remove last placed vertex (undo).
    pub fn undo_polygon_vertex(&mut self) {
        self.polygon_vertices.pop();
    }

    /// Cancel polygon creation without emitting anything.
    pub fn cancel_polygon(&mut self) {
        self.polygon_vertices.clear();
        self.polygon_cursor = None;
    }

    // ===== ENHANCED INPUT METHODS FOR WASM =====
    
    /// Handle mouse down with modifier keys for multi-selection
    pub fn handle_mouse_down_with_modifiers(&mut self, _world_pos: crate::math::Vec2, ctrl_key: bool) -> InputResult {
        // parameter currently unused; retaining signature for future features
        if ctrl_key {
            InputResult::MultiSelectToggle
        } else {
            InputResult::SingleSelect
        }
    }
}

#[derive(Debug, Clone)]
pub enum InputResult {
    SingleSelect,
    MultiSelectToggle,
}

pub struct HandleDetector;

impl HandleDetector {
    pub fn point_in_handle(point: Vec2, handle_x: f32, handle_y: f32, handle_size: f32) -> bool {
        let half = handle_size * 0.5;
        point.x >= handle_x - half && point.x <= handle_x + half &&
            point.y >= handle_y - half && point.y <= handle_y + half
    }
    
    pub fn get_resize_handle_for_non_rotated_sprite(
        sprite: &Sprite, 
        world_pos: Vec2, 
        zoom: f64
    ) -> Option<ResizeHandle> {
        let sprite_pos = Vec2::new(sprite.world_x as f32, sprite.world_y as f32);
        let sprite_size = Vec2::new(
            (sprite.width * sprite.scale_x) as f32,
            (sprite.height * sprite.scale_y) as f32
        );
        let border_threshold = 8.0 / zoom as f32; // Precise click detection
        
        let on_left = (world_pos.x >= sprite_pos.x - border_threshold) && (world_pos.x <= sprite_pos.x + border_threshold);
        let on_right = (world_pos.x >= sprite_pos.x + sprite_size.x - border_threshold) && (world_pos.x <= sprite_pos.x + sprite_size.x + border_threshold);
        let on_top = (world_pos.y >= sprite_pos.y - border_threshold) && (world_pos.y <= sprite_pos.y + border_threshold);
        let on_bottom = (world_pos.y >= sprite_pos.y + sprite_size.y - border_threshold) && (world_pos.y <= sprite_pos.y + sprite_size.y + border_threshold);
        
        let in_x_range = world_pos.x >= sprite_pos.x && world_pos.x <= sprite_pos.x + sprite_size.x;
        let in_y_range = world_pos.y >= sprite_pos.y && world_pos.y <= sprite_pos.y + sprite_size.y;
        
        // Check corners first
        if on_left && on_top {
            Some(ResizeHandle::TopLeft)
        } else if on_right && on_top {
            Some(ResizeHandle::TopRight)
        } else if on_left && on_bottom {
            Some(ResizeHandle::BottomLeft)
        } else if on_right && on_bottom {
            Some(ResizeHandle::BottomRight)
        } else if (on_left || on_right) && in_y_range {
            if on_left {
                Some(ResizeHandle::LeftCenter)
            } else {
                Some(ResizeHandle::RightCenter)
            }
        } else if (on_top || on_bottom) && in_x_range {
            if on_top {
                Some(ResizeHandle::TopCenter)
            } else {
                Some(ResizeHandle::BottomCenter)
            }
        } else {
            None
        }
    }
    
    pub fn get_resize_handle_for_cursor_detection(
        sprite: &Sprite, 
        world_pos: Vec2, 
        zoom: f64
    ) -> Option<ResizeHandle> {
        let sprite_pos = Vec2::new(sprite.world_x as f32, sprite.world_y as f32);
        let sprite_size = Vec2::new(
            (sprite.width * sprite.scale_x) as f32,
            (sprite.height * sprite.scale_y) as f32
        );
        // Very precise cursor detection - only on the border line
        let border_threshold = 4.0 / zoom as f32; // Much smaller for precise cursor feedback
        
        let on_left = (world_pos.x >= sprite_pos.x - border_threshold) && (world_pos.x <= sprite_pos.x + border_threshold);
        let on_right = (world_pos.x >= sprite_pos.x + sprite_size.x - border_threshold) && (world_pos.x <= sprite_pos.x + sprite_size.x + border_threshold);
        let on_top = (world_pos.y >= sprite_pos.y - border_threshold) && (world_pos.y <= sprite_pos.y + border_threshold);
        let on_bottom = (world_pos.y >= sprite_pos.y + sprite_size.y - border_threshold) && (world_pos.y <= sprite_pos.y + sprite_size.y + border_threshold);
        
        let in_x_range = world_pos.x >= sprite_pos.x && world_pos.x <= sprite_pos.x + sprite_size.x;
        let in_y_range = world_pos.y >= sprite_pos.y && world_pos.y <= sprite_pos.y + sprite_size.y;
        
        // Check corners first
        if on_left && on_top {
            Some(ResizeHandle::TopLeft)
        } else if on_right && on_top {
            Some(ResizeHandle::TopRight)
        } else if on_left && on_bottom {
            Some(ResizeHandle::BottomLeft)
        } else if on_right && on_bottom {
            Some(ResizeHandle::BottomRight)
        } else if (on_left || on_right) && in_y_range {
            if on_left {
                Some(ResizeHandle::LeftCenter)
            } else {
                Some(ResizeHandle::RightCenter)
            }
        } else if (on_top || on_bottom) && in_x_range {
            if on_top {
                Some(ResizeHandle::TopCenter)
            } else {
                Some(ResizeHandle::BottomCenter)
            }
        } else {
            None
        }
    }
    
    pub fn get_cursor_for_handle(handle: ResizeHandle) -> &'static str {
        match handle {
            ResizeHandle::TopLeft | ResizeHandle::BottomRight => "nw-resize",
            ResizeHandle::TopRight | ResizeHandle::BottomLeft => "ne-resize",
            ResizeHandle::TopCenter | ResizeHandle::BottomCenter => "ns-resize",
            ResizeHandle::LeftCenter | ResizeHandle::RightCenter => "ew-resize",
        }
    }
}
