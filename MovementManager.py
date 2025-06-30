import sdl3
import ctypes
from logger import setup_logger
import numpy as np
from net.protocol import Message, MessageType

logger = setup_logger(__name__)

TIME_TO_DIE = 2000

def sync_sprite_move(context, sprite, old_pos, new_pos):
    """Handle sprite movement with network sync"""
    if not hasattr(context, 'protocol') or not context.protocol:
        return  # No network connection
        
    # Ensure sprite has an ID
    if not hasattr(sprite, 'sprite_id') or not sprite.sprite_id:
        sprite.sprite_id = str(__import__('uuid').uuid4())

    # Send sprite movement update with proper protocol format
    change = {
        'category': 'sprite',
        'type': 'sprite_move',
        'data': {
            'table_id': context.current_table.table_id,
            'table_name': context.current_table.name,
            'sprite_id': sprite.sprite_id,
            'from': {'x': old_pos[0], 'y': old_pos[1]},
            'to': {'x': new_pos[0], 'y': new_pos[1]},                
            'timestamp': __import__('time').time()
        }
    }
    
    # Send via protocol using SPRITE_UPDATE message type
    
    msg = Message(MessageType.SPRITE_UPDATE, change, 
                getattr(context.protocol, 'client_id', 'unknown'))
    
    #print(f"Sending sprite move: {sprite.sprite_id} from ({old_pos[0]:.1f}, {old_pos[1]:.1f}) to ({new_pos[0]:.1f}, {new_pos[1]:.1f})")
    #print(f"Sender: {context.protocol.send}")
    try:
        # Send the message 
        context.protocol.send(msg.to_json())
        logger.debug(f"Sent sprite move: {sprite.sprite_id} to ({new_pos[0]:.1f}, {new_pos[1]:.1f})")

    except Exception as e:
        logger.error(f"Failed to send sprite movement: {e}")

def sync_sprite_scale(context, sprite, old_scale, new_scale):
    """Handle sprite scaling with network sync"""
    if not hasattr(context, 'protocol') or not context.protocol:
        return
          # Ensure sprite has an ID
    if not hasattr(sprite, 'sprite_id') or not sprite.sprite_id:
        sprite.sprite_id = str(__import__('uuid').uuid4())
        
    change = {
        'category': 'sprite',
        'type': 'sprite_scale',
        'data': {
            'table_id': context.current_table.table_id,
            'table_name': context.current_table.name,
            'sprite_id': sprite.sprite_id,
            'from': {'x': old_scale[0], 'y': old_scale[1]},
            'to': {'x': new_scale[0], 'y': new_scale[1]},               
            'timestamp': __import__('time').time()
        }
    }
    
    
    msg = Message(MessageType.TABLE_UPDATE, change,
                 getattr(context.protocol, 'client_id', 'unknown'))
    
    try:
        if hasattr(context.protocol, 'send'):
            context.protocol.send(msg.to_json())
        elif hasattr(context.protocol, 'send_message'):
            context.protocol.send_message(msg)
            logger.info(f"Sent sprite scale: {sprite.sprite_id} to ({new_scale[0]:.2f}, {new_scale[1]:.2f})")
        
    except Exception as e:
        logger.error(f"Failed to send sprite scaling: {e}")

def sync_sprite_rotation(context, sprite, old_rotation, new_rotation):
    """Handle sprite rotation with network sync"""
    if not hasattr(context, 'protocol') or not context.protocol:
        return
        
    # Ensure sprite has an ID
    if not hasattr(sprite, 'sprite_id') or not sprite.sprite_id:
        sprite.sprite_id = str(__import__('uuid').uuid4())
        
    change = {
        'category': 'sprite',
        'type': 'sprite_rotate',
        'data': {
            'table_id': context.current_table.table_id,
            'table_name': context.current_table.name,
            'sprite_id': sprite.sprite_id,
            'from': old_rotation,
            'to': new_rotation,
            'timestamp': __import__('time').time()
        }
    }
    
    msg = Message(MessageType.SPRITE_UPDATE, change,
                 getattr(context.protocol, 'client_id', 'unknown'))
    
    try:
        if hasattr(context.protocol, 'send'):
            context.protocol.send(msg.to_json())
        elif hasattr(context.protocol, 'send_message'):
            context.protocol.send_message(msg)
        logger.debug(f"Sent sprite rotation: {sprite.sprite_id} to {new_rotation:.1f} degrees")
        
    except Exception as e:
        logger.error(f"Failed to send sprite rotation: {e}")

def check_collision_with_all_sprites(table, sprite):
    """Check collision of a sprite with all other collidable sprites in the table."""
    #TODO: make anothet function for checking collision in the same layer
    for layers in table.dict_of_sprites_list.values():
        for other_sprite in layers:
            if other_sprite != sprite and other_sprite != table.selected_sprite and other_sprite.collidable:
                if sdl3.SDL_HasRectIntersectionFloat(ctypes.byref(sprite.frect), ctypes.byref(other_sprite.frect)):
                    logger.info(
                        f"Collision detected: sprite={sprite}, other_sprite={other_sprite}, table={table}"
                    )
                    logger.debug(
                        f"sprite.frect {sprite.frect.x} {sprite.frect.y} {sprite.frect.w} {sprite.frect.h}"
                    )
                    logger.debug(
                        f"other_sprite.frect {other_sprite.frect.x} {other_sprite.frect.y} {other_sprite.frect.w} {other_sprite.frect.h}"
                    )
                    return True
    return False


def move_sprites(cnt, delta_time):
    """Move all sprites, handle collisions and dying sprites."""
    width = cnt.window_width
    height = cnt.window_height   
  
     
    for layer, sprite_list in cnt.current_table.dict_of_sprites_list.items():                 
        for sprite in sprite_list:
            # Movement
            if sprite.moving:
                sprite.move(delta_time)
                if sprite.coord_x.value > width.value:
                    sprite.coord_x.value = 0
                if sprite.coord_y.value > height.value:
                    sprite.coord_y.value = 0
                if sprite.coord_x.value < 0:
                    sprite.coord_x.value = width.value
                if sprite.coord_y.value < 0:
                    sprite.coord_y.value = height.value
                if sprite.collidable:
                    if check_collision_with_all_sprites(cnt.current_table, sprite):
                        logger.info("Collision occurred, changing sprite texture and stopping movement.")
                        sprite.set_texture(b'resources/fire_explosion.png')
                        sprite.moving = False
                        sprite.collidable = False
                        sprite.set_die_timer(TIME_TO_DIE)
            # Handle dying sprites
            if sprite.die_timer is not None:
                sprite.die_timer -= delta_time
                if sprite.die_timer <= 0:
                    sprite.die()
                    cnt.current_table.dict_of_sprites_list[sprite.layer].remove(sprite)
            
            # Convert sprite's table coordinates to screen coordinates for rendering
            if hasattr(cnt.current_table, 'table_to_screen'):
                # Use new coordinate system
                screen_x, screen_y = cnt.current_table.table_to_screen(sprite.coord_x.value, sprite.coord_y.value)
                sprite.frect.x = ctypes.c_float(screen_x)
                sprite.frect.y = ctypes.c_float(screen_y)                
                # Scale sprites based on table scale
                sprite.frect.w = ctypes.c_float(sprite.original_w * sprite.scale_x * cnt.current_table.table_scale)
                sprite.frect.h = ctypes.c_float(sprite.original_h * sprite.scale_y * cnt.current_table.table_scale)
            
            cnt.step.value = max(float(sprite.frect.w), float(sprite.frect.h))

