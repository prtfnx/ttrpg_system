use crate::math::Vec2;
use crate::types::Sprite;
use crate::input::ResizeHandle;

pub struct SpriteManager;

impl SpriteManager {
    pub fn resize_sprite_with_handle(sprite: &mut Sprite, handle: ResizeHandle, world_pos: Vec2) {
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
    
    pub fn rotate_sprite_to_mouse(sprite: &mut Sprite, world_pos: Vec2) {
        let sprite_center = Vec2::new(
            sprite.world_x as f32 + (sprite.width * sprite.scale_x) as f32 * 0.5,
            sprite.world_y as f32 + (sprite.height * sprite.scale_y) as f32 * 0.5
        );
        let dx = world_pos.x - sprite_center.x;
        let dy = world_pos.y - sprite_center.y;
        
        // Calculate the angle from sprite center to mouse
        let new_angle = dy.atan2(dx) as f64;
        
        // Set rotation directly (the relative rotation logic will be handled in render.rs)
        sprite.rotation = new_angle;
    }
    
    pub fn start_rotation(sprite: &Sprite, world_pos: Vec2) -> (f64, f64) {
        let sprite_center = Vec2::new(
            sprite.world_x as f32 + (sprite.width * sprite.scale_x) as f32 * 0.5,
            sprite.world_y as f32 + (sprite.height * sprite.scale_y) as f32 * 0.5
        );
        let dx = world_pos.x - sprite_center.x;
        let dy = world_pos.y - sprite_center.y;
        let start_angle = dy.atan2(dx) as f64;
        (start_angle, sprite.rotation)
    }
    
    pub fn update_rotation(sprite: &mut Sprite, world_pos: Vec2, start_angle: f64, initial_rotation: f64) {
        let sprite_center = Vec2::new(
            sprite.world_x as f32 + (sprite.width * sprite.scale_x) as f32 * 0.5,
            sprite.world_y as f32 + (sprite.height * sprite.scale_y) as f32 * 0.5
        );
        let dx = world_pos.x - sprite_center.x;
        let dy = world_pos.y - sprite_center.y;
        let current_angle = dy.atan2(dx) as f64;
        
        // Calculate relative rotation from start position
        let delta_rotation = current_angle - start_angle;
        sprite.rotation = initial_rotation + delta_rotation;
    }
    
    pub fn move_sprite_to_position(sprite: &mut Sprite, world_pos: Vec2, drag_offset: Vec2) {
        sprite.world_x = (world_pos.x - drag_offset.x) as f64;
        sprite.world_y = (world_pos.y - drag_offset.y) as f64;
    }
    
    pub fn move_sprite_to_snapped_position(sprite: &mut Sprite, snapped_pos: Vec2, drag_offset: Vec2) {
        sprite.world_x = (snapped_pos.x - drag_offset.x) as f64;
        sprite.world_y = (snapped_pos.y - drag_offset.y) as f64;
    }
    
    pub fn get_sprite_center(sprite: &Sprite) -> Vec2 {
        let sprite_size = Vec2::new(
            (sprite.width * sprite.scale_x) as f32,
            (sprite.height * sprite.scale_y) as f32
        );
        Vec2::new(
            sprite.world_x as f32 + sprite_size.x * 0.5,
            sprite.world_y as f32 + sprite_size.y * 0.5
        )
    }
    
    pub fn get_rotation_handle_position(sprite: &Sprite, zoom: f64) -> Vec2 {
        let sprite_pos = Vec2::new(sprite.world_x as f32, sprite.world_y as f32);
        let sprite_size = Vec2::new(
            (sprite.width * sprite.scale_x) as f32,
            (sprite.height * sprite.scale_y) as f32
        );
    web_sys::console::log_1(&format!("[RUST DEBUG] get_rotation_handle_position - sprite_pos=({:.2},{:.2}) size=({:.2},{:.2}) zoom={:.2}", sprite_pos.x, sprite_pos.y, sprite_size.x, sprite_size.y, zoom).into());
        Vec2::new(
            sprite_pos.x + sprite_size.x * 0.5,
            sprite_pos.y - 20.0 / zoom as f32
        )
    }
    
    // Additional sprite operation methods for better separation of concerns
    
    pub fn set_sprite_position(sprite: &mut Sprite, world_pos: Vec2) {
        sprite.world_x = world_pos.x as f64;
        sprite.world_y = world_pos.y as f64;
    }
    
    pub fn set_sprite_size(sprite: &mut Sprite, size: Vec2) {
        sprite.width = size.x as f64 / sprite.scale_x;
        sprite.height = size.y as f64 / sprite.scale_y;
    }
    
    pub fn set_sprite_scale(sprite: &mut Sprite, scale: Vec2) {
        sprite.scale_x = scale.x as f64;
        sprite.scale_y = scale.y as f64;
    }
    
    pub fn set_sprite_rotation(sprite: &mut Sprite, rotation: f64) {
        sprite.rotation = rotation;
    }
    
    pub fn get_sprite_bounds(sprite: &Sprite) -> (Vec2, Vec2) {
        let top_left = Vec2::new(sprite.world_x as f32, sprite.world_y as f32);
        let size = Vec2::new(
            (sprite.width * sprite.scale_x) as f32,
            (sprite.height * sprite.scale_y) as f32
        );
        (top_left, size)
    }
    
    pub fn get_sprite_world_size(sprite: &Sprite) -> Vec2 {
        Vec2::new(
            (sprite.width * sprite.scale_x) as f32,
            (sprite.height * sprite.scale_y) as f32
        )
    }
    
    pub fn is_point_inside_sprite(sprite: &Sprite, world_pos: Vec2) -> bool {
        let sprite_pos = Vec2::new(sprite.world_x as f32, sprite.world_y as f32);
        let sprite_size = Vec2::new(
            (sprite.width * sprite.scale_x) as f32,
            (sprite.height * sprite.scale_y) as f32
        );
        
        world_pos.x >= sprite_pos.x &&
        world_pos.x <= sprite_pos.x + sprite_size.x &&
        world_pos.y >= sprite_pos.y &&
        world_pos.y <= sprite_pos.y + sprite_size.y
    }
    
    pub fn calculate_drag_offset(sprite: &Sprite, world_pos: Vec2) -> Vec2 {
        Vec2::new(
            world_pos.x - sprite.world_x as f32,
            world_pos.y - sprite.world_y as f32
        )
    }
    
    pub fn snap_to_grid(position: Vec2, grid_size: f32) -> Vec2 {
        Vec2::new(
            (position.x / grid_size).round() * grid_size,
            (position.y / grid_size).round() * grid_size
        )
    }
    
    pub fn constrain_to_bounds(sprite: &mut Sprite, bounds_min: Vec2, bounds_max: Vec2) {
        let sprite_size = Self::get_sprite_world_size(sprite);
        
        sprite.world_x = (sprite.world_x as f32).clamp(
            bounds_min.x,
            bounds_max.x - sprite_size.x
        ) as f64;
        
        sprite.world_y = (sprite.world_y as f32).clamp(
            bounds_min.y,
            bounds_max.y - sprite_size.y
        ) as f64;
    }
}
