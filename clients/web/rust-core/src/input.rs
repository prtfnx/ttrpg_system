use crate::math::Vec2;
use crate::types::Sprite;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum InputMode {
    None,
    CameraPan,
    SpriteMove,
    SpriteResize(ResizeHandle),
    SpriteRotate,
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
    pub drag_offset: Vec2,
}

impl Default for InputHandler {
    fn default() -> Self {
        Self {
            input_mode: InputMode::None,
            last_mouse_screen: Vec2::new(0.0, 0.0),
            selected_sprite_id: None,
            drag_offset: Vec2::new(0.0, 0.0),
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
        self.drag_offset = Vec2::new(0.0, 0.0);
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
