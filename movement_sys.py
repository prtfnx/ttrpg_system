import sdl3
import context
import ctypes
TIME_TO_DIE = 2000
def check_collision_with_all_sprites(table, sprite):
    #TODO make another function for checking collision in layers
    #print(f'dict are: {table.dict_of_sprites_list}')
    #print(f'and values are: {table.dict_of_sprites_list.values()}')
    for layers in table.dict_of_sprites_list.values():
        #print(layers)
        #print(f'layers are: {layers} ')
        for other_sprite in layers:
   
            print(f'Checking collision between {sprite} and {other_sprite}')
            #print(f'sprite.frect {sprite.frect.x} {sprite.frect.y} {sprite.frect.w} {sprite.frect.h}')
            #print(f'other_sprite.frect {other_sprite.frect.x} {other_sprite.frect.y} {other_sprite.frect.w} {other_sprite.frect.h}')
            #print(other_sprite != sprite and other_sprite != table.selected_sprite and other_sprite.collidable)
            if other_sprite != sprite and other_sprite != table.selected_sprite and other_sprite.collidable:
                #print(f'Checking collision between {sprite.frect} and {other_sprite.frect}')
                # Check for collision
                if sdl3.SDL_HasRectIntersectionFloat(ctypes.byref(sprite.frect), ctypes.byref(other_sprite.frect)):
                    print(f'other sprite {other_sprite}, and sprite {sprite}, and table {table}')
                    print(f'sprite.frect {sprite.frect.x} {sprite.frect.y} {sprite.frect.w} {sprite.frect.h}')
                    print(f'other_sprite.frect {other_sprite.frect.x} {other_sprite.frect.y} {other_sprite.frect.w} {other_sprite.frect.h}')
                    return True
                return False

def move_sprites(cnt, delta_time):
    width = cnt.window_width
    height = cnt.window_height
    #print(f'cnt.current_table.dict_of_sprites_list.values() {cnt.current_table.dict_of_sprites_list.values()}')
    for layers in cnt.current_table.dict_of_sprites_list.values():
        for sprite in layers:
            #movement
            if sprite.moving:
                #print(sprite)
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
                        print('collision')
                        sprite.set_texture('resources/fire_explosion.png'.encode())
                        sprite.moving = False
                        sprite.collidable = False
                        sprite.set_die_timer(TIME_TO_DIE)
            #print(cnt.selected.moving)
            #Check for die
            if sprite.die_timer is not None:
                sprite.die_timer -= delta_time
                if sprite.die_timer <= 0:
                    sprite.die()
                    cnt.current_table.dict_of_sprites_list[sprite.layer].remove(sprite)
                    #sprite.coord_x.value = 0
                    #sprite.coord_y.value = 0
                    
            frect=sprite.frect
            
            table_scale = cnt.current_table.scale
            table_x_moved= cnt.current_table.x_moved
            table_y_moved= cnt.current_table.y_moved
            #change view position of table
            frect.x = sprite.coord_x.value + table_x_moved
            frect.y = sprite.coord_y.value + table_y_moved
            # scale sprites to window size and table scale
            try:
                frect.w = sprite.original_w * width.value / cnt.base_width * sprite.scale_x *table_scale 
                frect.h = sprite.original_h * height.value / cnt.base_height * sprite.scale_y *table_scale 

            except ZeroDivisionError:
                print('error zero division')
            
            print(sprite)
            #print(sprite.original_h , height.value , test_context.base_height , sprite.scale_y)
            cnt.step.value= max(frect.w, frect.h)
            #print(sprite.text)
            sdl3.SDL_RenderTexture(cnt.renderer, sprite.texture, None, ctypes.byref(sprite.frect))

def test_margin(cnt):
    sprite= cnt.current_table.selected_sprite
    frect=sprite.frect
    
    #make 4 rectangles for 4 sides
    rec1,rec2,rec3,rec4 = sdl3.SDL_FRect(),sdl3.SDL_FRect(),sdl3.SDL_FRect(),sdl3.SDL_FRect()
    
    # rec1: left edge
    margin_w = frect.w/40
    margin_h = frect.h/40
    rec1.x = ctypes.c_float(sprite.frect.x - margin_w)
    rec1.y = ctypes.c_float(sprite.frect.y - margin_h)
    rec1.w = ctypes.c_float(margin_w*2)
    rec1.h = ctypes.c_float(sprite.frect.h+2*margin_h)
    # rec2: bottom edge
    rec2.x = ctypes.c_float(sprite.frect.x-margin_w)
    rec2.y = ctypes.c_float(sprite.frect.y +sprite.frect.h - margin_h)
    rec2.w = ctypes.c_float(sprite.frect.w+2*margin_w)
    rec2.h = ctypes.c_float(margin_h*2)

    # rec3: top edge
    rec3.x = ctypes.c_float(sprite.frect.x - margin_w)
    rec3.y = ctypes.c_float(sprite.frect.y - margin_h)
    rec3.w = ctypes.c_float(sprite.frect.w+margin_w*2)
    rec3.h = ctypes.c_float(margin_h*2)

    # rec4: right edge
    rec4.x = ctypes.c_float(sprite.frect.x + sprite.frect.w - margin_w)
    rec4.y = ctypes.c_float(sprite.frect.y - margin_h)
    rec4.w = ctypes.c_float(margin_w*2)
    rec4.h = ctypes.c_float(sprite.frect.h+margin_h*2)
    sdl3.SDL_SetRenderDrawColor(cnt.renderer, 0, 255, 0, sdl3.SDL_ALPHA_OPAQUE)  
    sdl3.SDL_RenderRect(cnt.renderer, ctypes.byref(rec1))
    sdl3.SDL_RenderRect(cnt.renderer, ctypes.byref(rec2))
    sdl3.SDL_RenderRect(cnt.renderer, ctypes.byref(rec3))
    sdl3.SDL_RenderRect(cnt.renderer, ctypes.byref(rec4))
    sdl3.SDL_RenderRect(cnt.renderer, ctypes.byref(cnt.current_table.selected_sprite.frect))