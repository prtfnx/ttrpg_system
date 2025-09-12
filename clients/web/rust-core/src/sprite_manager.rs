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
    
    pub fn get_rotation_handle_position(sprite: &Sprite, zoom: f64) -> Vec2 {
        let sprite_pos = Vec2::new(sprite.world_x as f32, sprite.world_y as f32);
        let sprite_size = Vec2::new(
            (sprite.width * sprite.scale_x) as f32,
            (sprite.height * sprite.scale_y) as f32
        );
        Vec2::new(
            sprite_pos.x + sprite_size.x * 0.5,
            sprite_pos.y - 20.0 / zoom as f32
        )
    }
    
    // Additional sprite operation methods for better separation of concerns
    
    pub fn get_sprite_bounds(sprite: &Sprite) -> (Vec2, Vec2) {
        let top_left = Vec2::new(sprite.world_x as f32, sprite.world_y as f32);
        let size = Vec2::new(
            (sprite.width * sprite.scale_x) as f32,
            (sprite.height * sprite.scale_y) as f32
        );
        (top_left, size)
    }
}
