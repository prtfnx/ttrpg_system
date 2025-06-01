import sdl3
import context
import ctypes
import logging

logger = logging.getLogger(__name__)

TIME_TO_DIE = 2000

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
    for layers in cnt.current_table.dict_of_sprites_list.values():
        for sprite in layers:
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
            frect = sprite.frect
            table_scale = cnt.current_table.scale
            table_x_moved = cnt.current_table.x_moved
            table_y_moved = cnt.current_table.y_moved
            # Change view position of table
            frect.x = (sprite.coord_x.value + table_x_moved) * table_scale
            frect.y = (sprite.coord_y.value + table_y_moved) * table_scale
            # Scale sprites to window size and table scale
            try:
                frect.w = sprite.original_w * width.value / cnt.base_width * sprite.scale_x * table_scale
                frect.h = sprite.original_h * height.value / cnt.base_height * sprite.scale_y * table_scale
                #frect.w = sprite.original_w  /  sprite.scale_x * table_scale
                #frect.h = sprite.original_h  /  sprite.scale_y * table_scale
            except ZeroDivisionError:
                logger.error("ZeroDivisionError in sprite scaling.")
            cnt.step.value = max(frect.w, frect.h)
            #cnt.light_on=False
            if cnt.light_on:
                render_texture_light = cnt.LightingManager.render_texture_light
                render_texture = cnt.LightingManager.render_texture
                texture_light = cnt.LightingManager.texture_light
                frect_light = cnt.LightingManager.frect_light
                sdl3.SDL_SetRenderDrawColor(cnt.renderer, 0, 0, 0, sdl3.SDL_ALPHA_OPAQUE)
                sdl3.SDL_SetRenderTarget(cnt.renderer, render_texture_light)
                sdl3.SDL_RenderClear(cnt.renderer)
                sdl3.SDL_RenderTexture(cnt.renderer,texture_light,  None, ctypes.byref(frect_light))
                
                #print(f"frect: {frect_light.x}, y={frect_light.y}, w={frect_light.w}, h={frect_light.h}")
                
                sdl3.SDL_SetRenderTarget(cnt.renderer, render_texture)
                sdl3.SDL_RenderClear(cnt.renderer)

                sdl3.SDL_SetRenderDrawColor(cnt.renderer, 255, 255, 255, 255)
                
                sdl3.SDL_RenderFillRect(cnt.renderer, ctypes.byref(sprite.frect))
                 ### polygon
                sdl3.SDL_SetRenderTarget(cnt.renderer, None)
                sdl3.SDL_RenderClear(cnt.renderer)
                # #mode for sprites
                #sdl3.SDL_SetTextureBlendMode(sprite.texture, sdl3.SDL_BLENDMODE_BLEND)
                
                sdl3.SDL_RenderTexture(cnt.renderer, sprite.texture, None, ctypes.byref(sprite.frect))
                sdl3.SDL_RenderTexture(cnt.renderer, render_texture, None, None)
                sdl3.SDL_RenderTexture(cnt.renderer, render_texture_light, None, None)
                #sdl3.SDL_RenderPresent(cnt.renderer)
            else:
                sdl3.SDL_RenderTexture(cnt.renderer, sprite.texture, None, ctypes.byref(sprite.frect))

def test_margin(cnt):
    """Draw margin rectangles around the selected sprite for visual debugging."""
    # Add this check at the beginning of the function
    if not cnt.current_table or not cnt.current_table.selected_sprite:
        return  # Exit early if no sprite is selected
        
    sprite = cnt.current_table.selected_sprite
    frect = sprite.frect

    # Make 4 rectangles for 4 sides
    rec1, rec2, rec3, rec4 = sdl3.SDL_FRect(), sdl3.SDL_FRect(), sdl3.SDL_FRect(), sdl3.SDL_FRect()

    # rec1: left edge
    margin_w = frect.w / 40
    margin_h = frect.h / 40
    rec1.x = ctypes.c_float(sprite.frect.x - margin_w)
    rec1.y = ctypes.c_float(sprite.frect.y - margin_h)
    rec1.w = ctypes.c_float(margin_w * 2)
    rec1.h = ctypes.c_float(sprite.frect.h + 2 * margin_h)
    # rec2: bottom edge
    rec2.x = ctypes.c_float(sprite.frect.x - margin_w)
    rec2.y = ctypes.c_float(sprite.frect.y + sprite.frect.h - margin_h)
    rec2.w = ctypes.c_float(sprite.frect.w + 2 * margin_w)
    rec2.h = ctypes.c_float(margin_h * 2)
    # rec3: top edge
    rec3.x = ctypes.c_float(sprite.frect.x - margin_w)
    rec3.y = ctypes.c_float(sprite.frect.y - margin_h)
    rec3.w = ctypes.c_float(sprite.frect.w + margin_w * 2)
    rec3.h = ctypes.c_float(margin_h * 2)
    # rec4: right edge
    rec4.x = ctypes.c_float(sprite.frect.x + sprite.frect.w - margin_w)
    rec4.y = ctypes.c_float(sprite.frect.y - margin_h)
    rec4.w = ctypes.c_float(margin_w * 2)
    rec4.h = ctypes.c_float(sprite.frect.h + margin_h * 2)

    sdl3.SDL_SetRenderDrawColor(cnt.renderer, 0, 255, 0, sdl3.SDL_ALPHA_OPAQUE)
    sdl3.SDL_RenderRect(cnt.renderer, ctypes.byref(rec1))
    sdl3.SDL_RenderRect(cnt.renderer, ctypes.byref(rec2))
    sdl3.SDL_RenderRect(cnt.renderer, ctypes.byref(rec3))
    sdl3.SDL_RenderRect(cnt.renderer, ctypes.byref(rec4))
    sdl3.SDL_RenderRect(cnt.renderer, ctypes.byref(cnt.current_table.selected_sprite.frect))