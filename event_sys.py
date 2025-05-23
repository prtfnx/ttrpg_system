import sdl3
import ctypes
import json

class Directions:
    EAST=1
    WEST=2
    NORTH=3
    SOUTH=4
    NORTHEAST=5
    NORTHWEST=6
    SOUTHEAST=7
    SOUTHWEST=8

def handle_mouse_motion(cnt, event):
    if cnt.grabing:
        # Handle grabing
        if cnt.current_table.selected_sprite is not None:
            sprite = cnt.current_table.selected_sprite
            # Move sprite so its center follows the mouse
            sprite.coord_x.value = event.motion.x - sprite.frect.w / 2
            sprite.coord_y.value = event.motion.y - sprite.frect.h / 2
    if cnt.moving_table:
        # Handle moving table
        
        cnt.current_table.x_moved += event.motion.xrel
        cnt.current_table.y_moved += event.motion.yrel
        print(f'moving table {cnt.current_table.x_moved} {cnt.current_table.y_moved}')
        #print(cnt.current_table.coord_x.value, cnt.current_table.coord_y.value)
    if cnt.resizing:
        # Handle resizing
        match cnt.resize_direction:
            case Directions.EAST:
                # Handle east resize
                cnt.current_table.selected_sprite.frect.w = cnt.current_table.selected_sprite.frect.w + event.motion.xrel
                cnt.current_table.selected_sprite.scale_x = cnt.current_table.selected_sprite.frect.w / cnt.current_table.selected_sprite.original_w
                print('east', cnt.current_table.selected_sprite.frect.w)
            case Directions.WEST:
                # Handle west resize
                cnt.current_table.selected_sprite.frect.w = cnt.current_table.selected_sprite.frect.w - event.motion.xrel
                cnt.current_table.selected_sprite.scale_x = cnt.current_table.selected_sprite.frect.w / cnt.current_table.selected_sprite.original_w
                print('west', cnt.current_table.selected_sprite.frect.w)
            case Directions.NORTH:
                # Handle north resize
                cnt.current_table.selected_sprite.frect.h = cnt.current_table.selected_sprite.frect.h - event.motion.yrel
                cnt.current_table.selected_sprite.scale_y = cnt.current_table.selected_sprite.frect.h / cnt.current_table.selected_sprite.original_h
                print('north', cnt.current_table.selected_sprite.frect.h)
            case Directions.SOUTH:
                # Handle south resize
                cnt.current_table.selected_sprite.frect.h = cnt.current_table.selected_sprite.frect.h + event.motion.yrel
                cnt.current_table.selected_sprite.scale_y = cnt.current_table.selected_sprite.frect.h / cnt.current_table.selected_sprite.original_h
                print('south', cnt.current_table.selected_sprite.frect.h)
            case Directions.NORTHEAST:
                # Handle northeast resize
                cnt.current_table.selected_sprite.frect.w = cnt.current_table.selected_sprite.frect.w + event.motion.xrel
                cnt.current_table.selected_sprite.frect.h = cnt.current_table.selected_sprite.frect.h - event.motion.yrel
                cnt.current_table.selected_sprite.scale_x = cnt.current_table.selected_sprite.frect.w / cnt.current_table.selected_sprite.original_w
                cnt.current_table.selected_sprite.scale_y = cnt.current_table.selected_sprite.frect.h / cnt.current_table.selected_sprite.original_h
                print('northeast', cnt.current_table.selected_sprite.frect.w, cnt.current_table.selected_sprite.frect.h)
            case Directions.NORTHWEST:
                # Handle northwest resize
                cnt.current_table.selected_sprite.frect.w = cnt.current_table.selected_sprite.frect.w - event.motion.xrel
                cnt.current_table.selected_sprite.frect.h = cnt.current_table.selected_sprite.frect.h - event.motion.yrel
                cnt.current_table.selected_sprite.scale_x = cnt.current_table.selected_sprite.frect.w / cnt.current_table.selected_sprite.original_w
                cnt.current_table.selected_sprite.scale_y = cnt.current_table.selected_sprite.frect.h / cnt.current_table.selected_sprite.original_h
                print('northwest', cnt.current_table.selected_sprite.frect.w, cnt.current_table.selected_sprite.frect.h)
            case Directions.SOUTHEAST:
                # Handle southeast resize
                cnt.current_table.selected_sprite.frect.w = cnt.current_table.selected_sprite.frect.w + event.motion.xrel
                cnt.current_table.selected_sprite.frect.h = cnt.current_table.selected_sprite.frect.h + event.motion.yrel
                cnt.current_table.selected_sprite.scale_x = cnt.current_table.selected_sprite.frect.w / cnt.current_table.selected_sprite.original_w
                cnt.current_table.selected_sprite.scale_y = cnt.current_table.selected_sprite.frect.h / cnt.current_table.selected_sprite.original_h
                print('southeast', cnt.current_table.selected_sprite.frect.w, cnt.current_table.selected_sprite.frect.h)
            case Directions.SOUTHWEST:
                # Handle southwest resize
                cnt.current_table.selected_sprite.frect.w = cnt.current_table.selected_sprite.frect.w - event.motion.xrel
                cnt.current_table.selected_sprite.frect.h = cnt.current_table.selected_sprite.frect.h + event.motion.yrel
                cnt.current_table.selected_sprite.scale_x = cnt.current_table.selected_sprite.frect.w / cnt.current_table.selected_sprite.original_w
                cnt.current_table.selected_sprite.scale_y = cnt.current_table.selected_sprite.frect.h / cnt.current_table.selected_sprite.original_h
                print('southwest', cnt.current_table.selected_sprite.frect.w, cnt.current_table.selected_sprite.frect.h)
        #print('resizing')
    else:
        # Determine intersect with sprites
        # Get position
        point = sdl3.SDL_FPoint()
        # print(event.motion)
        point.x, point.y = event.motion.x, event.motion.y
        #print('movement point')
        resize_cursor = None
        #  Check if edge is near
        frec1, frec2, frec3, frec4 = sdl3.SDL_FRect(), sdl3.SDL_FRect(), sdl3.SDL_FRect(), sdl3.SDL_FRect()
        sprite = cnt.current_table.selected_sprite
        if sprite is not None:    
            #print(point, point.x, point.y)
            # rec1: left edge
            margin_w = sprite.frect.w/40
            margin_h = sprite.frect.h/40
            frec1.x = ctypes.c_float(sprite.frect.x - margin_w)
            frec1.y = ctypes.c_float(sprite.frect.y - margin_h)
            frec1.w = ctypes.c_float(margin_w*2)
            frec1.h = ctypes.c_float(sprite.frect.h+2*margin_h)
            # rec2: bottom edge
            frec2.x = ctypes.c_float(sprite.frect.x-margin_w)
            frec2.y = ctypes.c_float(sprite.frect.y +sprite.frect.h - margin_h)
            frec2.w = ctypes.c_float(sprite.frect.w+2*margin_w)
            frec2.h = ctypes.c_float(margin_h*2)

            # rec3: top edge
            frec3.x = ctypes.c_float(sprite.frect.x - margin_w)
            frec3.y = ctypes.c_float(sprite.frect.y - margin_h)
            frec3.w = ctypes.c_float(sprite.frect.w+margin_w*2)
            frec3.h = ctypes.c_float(margin_h*2)

            # rec4: right edge
            frec4.x = ctypes.c_float(sprite.frect.x + sprite.frect.w - margin_w)
            frec4.y = ctypes.c_float(sprite.frect.y - margin_h)
            frec4.w = ctypes.c_float(margin_w*2)
            frec4.h = ctypes.c_float(sprite.frect.h+margin_h*2)
            # Check if mouse is near any edge for resizing
            
            if sdl3.SDL_PointInRectFloat(ctypes.byref(point), ctypes.byref(frec1)):
                resize_cursor = sdl3.SDL_SYSTEM_CURSOR_W_RESIZE
                if sdl3.SDL_PointInRectFloat(ctypes.byref(point), ctypes.byref(frec2)):
                    resize_cursor = sdl3.SDL_SYSTEM_CURSOR_SW_RESIZE
                elif sdl3.SDL_PointInRectFloat(ctypes.byref(point), ctypes.byref(frec3)):
                    resize_cursor = sdl3.SDL_SYSTEM_CURSOR_NW_RESIZE
            elif sdl3.SDL_PointInRectFloat(ctypes.byref(point), ctypes.byref(frec2)):
                resize_cursor = sdl3.SDL_SYSTEM_CURSOR_S_RESIZE
                if sdl3.SDL_PointInRectFloat(ctypes.byref(point), ctypes.byref(frec4)):
                    resize_cursor = sdl3.SDL_SYSTEM_CURSOR_SE_RESIZE
            elif sdl3.SDL_PointInRectFloat(ctypes.byref(point), ctypes.byref(frec3)):
                resize_cursor = sdl3.SDL_SYSTEM_CURSOR_N_RESIZE
                if sdl3.SDL_PointInRectFloat(ctypes.byref(point), ctypes.byref(frec4)):
                    resize_cursor = sdl3.SDL_SYSTEM_CURSOR_NE_RESIZE
            elif sdl3.SDL_PointInRectFloat(ctypes.byref(point), ctypes.byref(frec4)):
                resize_cursor = sdl3.SDL_SYSTEM_CURSOR_E_RESIZE

            if resize_cursor is not None:
                #print('edge   detected')
                cnt.cursor = resize_cursor
                cursor = sdl3.SDL_CreateSystemCursor(resize_cursor)
                sdl3.SDL_SetCursor(cursor)
            else:
                sdl3.SDL_SetCursor(sdl3.SDL_CreateSystemCursor(sdl3.SDL_SYSTEM_CURSOR_DEFAULT))
                cnt.cursor = sdl3.SDL_SYSTEM_CURSOR_DEFAULT
            #print(sdl3.SDL_PointInRectFloat(ctypes.byref(point),ctypes.byref(sprite.frect)))
        

# # Handle resizing texture when mouse button is pressed near edge
#             if hasattr(cnt, 'current_table.selected_sprite') and cnt.current_table.selected_sprite is not None:
#                 sprite = cnt.current_table.selected_sprite
#                 margin_w = sprite.frect.w / 40
#                 margin_h = sprite.frect.h / 40
#                 frec1 = sdl3.SDL_FRect(sprite.frect.x - margin_w, sprite.frect.y - margin_h, margin_w * 2, sprite.frect.h + 2 * margin_h)
#                 frec2 = sdl3.SDL_FRect(sprite.frect.x - margin_w, sprite.frect.y + sprite.frect.h - margin_h, sprite.frect.w + 2 * margin_w, margin_h * 2)
#                 frec3 = sdl3.SDL_FRect(sprite.frect.x - margin_w, sprite.frect.y - margin_h, sprite.frect.w + margin_w * 2, margin_h * 2)
#                 frec4 = sdl3.SDL_FRect(sprite.frect.x + sprite.frect.w - margin_w, sprite.frect.y - margin_h, margin_w * 2, sprite.frect.h + margin_h * 2)
#                 if sdl3.SDL_PointInRectFloat(ctypes.byref(point), ctypes.byref(frec1)):
#                     sprite.scale = max(0.05, sprite.scale - 0.01)
#                 elif sdl3.SDL_PointInRectFloat(ctypes.byref(point), ctypes.byref(frec2)):
#                     sprite.scale += 0.01
#                 elif sdl3.SDL_PointInRectFloat(ctypes.byref(point), ctypes.byref(frec3)):
#                     sprite.scale += 0.01
#                 elif sdl3.SDL_PointInRectFloat(ctypes.byref(point), ctypes.byref(frec4)):
#                     sprite.scale = max(0.05, sprite.scale - 0.01)            

def handle_resize(cnt, direction):
    cnt.resizing = True
    cnt.resize_direction = direction


def handle_mouse_button_down(cnt, event):
    #determine intersect with sprites
    
    point = sdl3.SDL_FPoint()

    print(event.button)
    point.x, point.y = event.button.x, event.button.y
    

    if event.button.button == 1:
        #check for resize
        cursor = cnt.cursor
        # print(cursor)
        # print(sdl3.SDL_SYSTEM_CURSOR_S_RESIZE)
        print(f'button down postion {event.button.x} {event.button.y}')
        
        match cursor:
            case sdl3.SDL_SYSTEM_CURSOR_W_RESIZE:
                # Handle west resize
                handle_resize(cnt, Directions.WEST)
            case sdl3.SDL_SYSTEM_CURSOR_E_RESIZE:
                # Handle east resize
                handle_resize(cnt, Directions.EAST)
            case sdl3.SDL_SYSTEM_CURSOR_NW_RESIZE:
                # Handle northwest resize
                handle_resize(cnt, Directions.NORTHWEST)
            case sdl3.SDL_SYSTEM_CURSOR_NE_RESIZE:
                # Handle northeast resize
                handle_resize(cnt, Directions.NORTHEAST )
            case sdl3.SDL_SYSTEM_CURSOR_SW_RESIZE:
                # Handle southwest resize
                handle_resize(cnt, Directions.SOUTHWEST)
            case sdl3.SDL_SYSTEM_CURSOR_SE_RESIZE:
                # Handle southeast resize
                handle_resize(cnt, Directions.SOUTHEAST)
            case sdl3.SDL_SYSTEM_CURSOR_S_RESIZE:
                # Handle south resize
                handle_resize(cnt, Directions.SOUTH)
                
            case sdl3.SDL_SYSTEM_CURSOR_N_RESIZE:
                # Handle north resize
                handle_resize(cnt, Directions.NORTH)
        
        # Check if cursor is inside any sprite's rectangle and select it
    for sprites in cnt.current_table.dict_of_sprites_list.values():
        for sprite in sprites:
            #print('button 1 point')
            #print(point, point.x, point.y)
            #print(sprite.frect, sprite.frect.x, sprite.frect.y)
            #print(sdl3.SDL_PointInRectFloat(ctypes.byref(point), ctypes.byref(sprite.frect)))
            if sdl3.SDL_PointInRectFloat(ctypes.byref(point), ctypes.byref(sprite.frect)):
                #print('intersect')
                cnt.current_table.selected_sprite = sprite
                cnt.grabing = True
                #print("grabed")
    if not cnt.grabing:
        cnt.moving_table = True
        print("not grabed, moving table")
           
    

def handle_mouse_button_up(cnt, event):
    # Stop resizing when mouse button is released
    if event.button.button == 1:
        cnt.resizing = False
        cnt.grabing = False
        cnt.moving_table = False
        cnt.resize_direction = None
        sdl3.SDL_SetCursor(sdl3.SDL_CreateSystemCursor(sdl3.SDL_SYSTEM_CURSOR_DEFAULT))
        cnt.cursor = sdl3.SDL_SYSTEM_CURSOR_DEFAULT
        print(f'button up postion {event.button.x} {event.button.y}')
        print(cnt.cursor)
     
def handle_key_event(cnt, key_code):
    #print(cnt.current_table.selected_sprite.coord_y.value, cnt.current_table.selected_sprite.coord_x.value, cnt.current_table.selected_sprite, cnt.current_table.selected_sprite.frect)
    #print(ctypes.byref(cnt.current_table.selected_sprite.frect))
    match key_code: 
    # /* Quit. */
        case sdl3.SDL_SCANCODE_ESCAPE:
            pass
        case sdl3.SDL_SCANCODE_Q:
            return sdl3.SDL_APP_SUCCESS
    # /* Restart the game as if the program was launched. */
        case sdl3.SDL_SCANCODE_R:
            pass
        # /* Decide new direction of the snake. */
        case sdl3.SDL_SCANCODE_RIGHT:
            sprite = cnt.current_table.selected_sprite
            sprite.coord_x.value = sprite.coord_x.value + min(cnt.step.value, sprite.frect.w)
        case sdl3.SDL_SCANCODE_UP:
            sprite = cnt.current_table.selected_sprite
            sprite.coord_y.value = sprite.coord_y.value - min(cnt.step.value, sprite.frect.h)
        case sdl3.SDL_SCANCODE_LEFT:
            sprite = cnt.current_table.selected_sprite
            sprite.coord_x.value = sprite.coord_x.value - min(cnt.step.value, sprite.frect.w)
        case sdl3.SDL_SCANCODE_DOWN:
            sprite = cnt.current_table.selected_sprite
            sprite.coord_y.value = sprite.coord_y.value + min(cnt.step.value, sprite.frect.h)
        case sdl3.SDL_SCANCODE_1:
            cnt.current_table.selected_sprite=cnt.current_table.dict_of_sprites_list['tokens'][0]
        case sdl3.SDL_SCANCODE_2:
            cnt.current_table.selected_sprite=cnt.current_table.dict_of_sprites_list['tokens'][1]  
        case sdl3.SDL_SCANCODE_3:
            cnt.current_table.selected_sprite=cnt.current_table.dict_of_sprites_list['tokens'][2]
        case sdl3.SDL_SCANCODE_4:
            cnt.current_table=cnt.list_of_tables[0]
        case sdl3.SDL_SCANCODE_5:
            cnt.current_table=cnt.list_of_tables[1]
        case sdl3.SDL_SCANCODE_KP_PLUS:
            cnt.current_table.selected_sprite.scale_x=cnt.current_table.selected_sprite.scale_x+0.1
            cnt.current_table.selected_sprite.scale_y=cnt.current_table.selected_sprite.scale_y+0.1
        case sdl3.SDL_SCANCODE_KP_MINUS:
            cnt.current_table.selected_sprite.scale_x=cnt.current_table.selected_sprite.scale_x-0.1
            cnt.current_table.selected_sprite.scale_y=cnt.current_table.selected_sprite.scale_y-0.1
        case sdl3.SDL_SCANCODE_SPACE:
            #test attack projectile, refactor later
            x, y = ctypes.c_float(), ctypes.c_float()
            sdl3.SDL_GetMouseState(ctypes.byref(x), ctypes.byref(y))
            #target = find_target_at_position(cnt, x.value, y.value)
            # target.x=x.value
            # target.y=y.value
            # target.name='test_target'
            print("mouse pos", x.value, y.value)
            if cnt.current_table.selected_sprite.character is not None:
                spell = cnt.current_table.selected_sprite.character.spells[0]
                cnt.current_table.selected_sprite.character.spell_attack(x,y,spell)
                sprite=cnt.add_sprite(spell.sprite,scale_x = 0.1,scale_y=0.1, moving=True,speed=1,collidable=True)
                sprite.set_position(cnt.current_table.selected_sprite.coord_x, cnt.current_table.selected_sprite.coord_y)
                # # Calculate direction vector from sprite's position to (x.value, y.value)
                # dx = x.value - sprite.frect.x
                # dy = y.value - sprite.frect.y
                # length = (dx ** 2 + dy ** 2) ** 0.5
                # if length != 0:
                #     vx = dx / length * 0.1
                #     vy = dy / length * 0.1
                # else:
                #     vx, vy = 0, 0
                dx= x.value - cnt.current_table.selected_sprite.coord_x.value
                dy= y.value - cnt.current_table.selected_sprite.coord_y.value
                # calculate length
                length = (dx ** 2 + dy ** 2) ** 0.5
                vx=dx/length
                vy=dy/length
                sprite.set_speed(vx*sprite.speed, vy*sprite.speed)
                print(f'dx and dy {dx} {dy}projectile speed {vx} {vy}')
        case sdl3.SDL_SCANCODE_LCTRL:
            print("Control key pressed, sending message")
            cnt.queue_to_send.put("hello")
        case sdl3.SDL_SCANCODE_LALT:
            print("Alt key pressed, make table from json")
            with open('table.json', 'r') as f:
                data = json.load(f)
            print(data)
            table = cnt.create_table_from_json(data)
            cnt.list_of_tables.append(table)
            cnt.current_table = table
            print("table created and changed")
        case _:
            return sdl3.SDL_APP_CONTINUE
        
# def handle_event(cnt, event):
#     match event.type:
#         case sdl3.SDL_EVENT_QUIT:
#             return False

#         case sdl3.SDL_EVENT_KEY_DOWN:
#             handle_key_event(cnt, event.key.scancode)
#                 # if event.key.key in [sdl3.SDLK_ESCAPE]:
#                 #     running = False
#             return True
#         case sdl3.SDL_EVENT_MOUSE_BUTTON_DOWN:
#             handle_mouse_button_down(cnt, event)
#             return True
#         case _:
#             return True
        
def handle_mouse_wheel(cnt, event):
    # zoom in and out on mouse wheel scroll
    if event.wheel.y > 0:
        cnt.current_table.scale += 0.1
    elif event.wheel.y < 0:
        cnt.current_table.scale -= 0.1

    # Resize current_table.selected_sprite sprite's texture on mouse wheel scroll
    # if hasattr(cnt, 'current_table.selected_sprite') and cnt.current_table.selected_sprite is not None:
    #     if event.wheel.y > 0:
    #         cnt.current_table.selected_sprite.scale_x += 0.01
    #         cnt.current_table.selected_sprite.scale_y += 0.01
    #     elif event.wheel.y < 0:
    #         cnt.current_table.selected_sprite.scale_x = max(0.05, cnt.current_table.selected_sprite.scale_x - 0.01)
    #         cnt.current_table.selected_sprite.scale_y = max(0.05, cnt.current_table.selected_sprite.scale_y - 0.01)


# Add mouse wheel event handling to handle_event
def handle_event(cnt, event):
    match event.type:
        case sdl3.SDL_EVENT_QUIT:
            return False
        case sdl3.SDL_EVENT_KEY_DOWN:
            handle_key_event(cnt, event.key.scancode)
            return True
        case sdl3.SDL_EVENT_MOUSE_BUTTON_DOWN:
            handle_mouse_button_down(cnt, event)
            return True
        case sdl3.SDL_EVENT_MOUSE_BUTTON_UP:
            handle_mouse_button_up(cnt, event)
            return True
        case sdl3.SDL_EVENT_MOUSE_WHEEL:
            handle_mouse_wheel(cnt, event)
            return True
        case sdl3.SDL_EVENT_MOUSE_MOTION:
            handle_mouse_motion(cnt, event)
            return True
        case _:
            return True