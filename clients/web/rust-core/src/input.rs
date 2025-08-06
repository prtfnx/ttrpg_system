use crate::math::Vec2;
use crate::types::Sprite;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum InputMode {
    None,
    CameraPan,
    SpriteMove,
    SpriteResize(ResizeHandle),
    SpriteRotate,
    AreaSelect,  // New: Area selection rectangle
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
        }
    }
}

impl InputHandler {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn reset(&mut self) {
        self.input_mode = InputMode::None;
        self.selected_sprite_id = None;
        self.selected_sprite_ids.clear();
        self.drag_offset = Vec2::new(0.0, 0.0);
        self.area_select_start = None;
        self.area_select_current = None;
    }
    
    // Multi-select management methods
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
    
    pub fn update_area_selection(&mut self, world_pos: Vec2) {
        if self.input_mode == InputMode::AreaSelect {
            self.area_select_current = Some(world_pos);
        }
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
}
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
        let border_threshold = 3.0 / zoom as f32;
        
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
            ResizeHandle::LeftCenter | ResizeHandle::RightCenter => "ew-resize",
            ResizeHandle::TopCenter | ResizeHandle::BottomCenter => "ns-resize",
        }
    }
}
