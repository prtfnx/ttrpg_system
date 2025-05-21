import sdl3
import ctypes

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
        # Handle dragging
        if cnt.selected is not None:
            cnt.selected.coord_x = ctypes.c_float(event.motion.x - cnt.selected.coord_x.value / 2)
            cnt.selected.coord_y = ctypes.c_float(event.motion.y - cnt.selected.coord_y.value  / 2)
            #print('grabbing')
    if cnt.resizing:
        # Handle resizing
        match cnt.resize_direction:
            case Directions.EAST:
                # Handle east resize
                cnt.selected.frect.w = cnt.selected.frect.w + event.motion.xrel
                cnt.selected.scale_x = cnt.selected.frect.w / cnt.selected.original_w
                print('east', cnt.selected.frect.w)
            case Directions.WEST:
                # Handle west resize
                cnt.selected.frect.w = cnt.selected.frect.w - event.motion.xrel
                cnt.selected.scale_x = cnt.selected.frect.w / cnt.selected.original_w
                print('west', cnt.selected.frect.w)
            case Directions.NORTH:
                # Handle north resize
                cnt.selected.frect.h = cnt.selected.frect.h - event.motion.yrel
                cnt.selected.scale_y = cnt.selected.frect.h / cnt.selected.original_h
                print('north', cnt.selected.frect.h)
            case Directions.SOUTH:
                # Handle south resize
                cnt.selected.frect.h = cnt.selected.frect.h + event.motion.yrel
                cnt.selected.scale_y = cnt.selected.frect.h / cnt.selected.original_h
                print('south', cnt.selected.frect.h)
            case Directions.NORTHEAST:
                # Handle northeast resize
                cnt.selected.frect.w = cnt.selected.frect.w + event.motion.xrel
                cnt.selected.frect.h = cnt.selected.frect.h - event.motion.yrel
                cnt.selected.scale_x = cnt.selected.frect.w / cnt.selected.original_w
                cnt.selected.scale_y = cnt.selected.frect.h / cnt.selected.original_h
                print('northeast', cnt.selected.frect.w, cnt.selected.frect.h)
            case Directions.NORTHWEST:
                # Handle northwest resize
                cnt.selected.frect.w = cnt.selected.frect.w - event.motion.xrel
                cnt.selected.frect.h = cnt.selected.frect.h - event.motion.yrel
                cnt.selected.scale_x = cnt.selected.frect.w / cnt.selected.original_w
                cnt.selected.scale_y = cnt.selected.frect.h / cnt.selected.original_h
                print('northwest', cnt.selected.frect.w, cnt.selected.frect.h)
            case Directions.SOUTHEAST:
                # Handle southeast resize
                cnt.selected.frect.w = cnt.selected.frect.w + event.motion.xrel
                cnt.selected.frect.h = cnt.selected.frect.h + event.motion.yrel
                cnt.selected.scale_x = cnt.selected.frect.w / cnt.selected.original_w
                cnt.selected.scale_y = cnt.selected.frect.h / cnt.selected.original_h
                print('southeast', cnt.selected.frect.w, cnt.selected.frect.h)
            case Directions.SOUTHWEST:
                # Handle southwest resize
                cnt.selected.frect.w = cnt.selected.frect.w - event.motion.xrel
                cnt.selected.frect.h = cnt.selected.frect.h + event.motion.yrel
                cnt.selected.scale_x = cnt.selected.frect.w / cnt.selected.original_w
                cnt.selected.scale_y = cnt.selected.frect.h / cnt.selected.original_h
                print('southwest', cnt.selected.frect.w, cnt.selected.frect.h)
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
        sprite = cnt.selected
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
#             if hasattr(cnt, 'selected') and cnt.selected is not None:
#                 sprite = cnt.selected
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
    for sprite in cnt.sprites_list:
       #print('button 1 point')
       #print(point, point.x, point.y)
       #print(sprite.frect, sprite.frect.x, sprite.frect.y)
       #print(sdl3.SDL_PointInRectFloat(ctypes.byref(point), ctypes.byref(sprite.frect)))
       if sdl3.SDL_PointInRectFloat(ctypes.byref(point), ctypes.byref(sprite.frect)):
            #print('intersect')
            cnt.selected = sprite
            cnt.grabing = True
            #print("grabed")
            pass
    

def handle_mouse_button_up(cnt, event):
    # Stop resizing when mouse button is released
    if event.button.button == 1:
        cnt.resizing = False
        cnt.grabing = False
        cnt.resize_direction = None
        sdl3.SDL_SetCursor(sdl3.SDL_CreateSystemCursor(sdl3.SDL_SYSTEM_CURSOR_DEFAULT))
        cnt.cursor = sdl3.SDL_SYSTEM_CURSOR_DEFAULT
        print(f'button up postion {event.button.x} {event.button.y}')
        print(cnt.cursor)
     
def handle_key_event(cnt, key_code):
    #print(cnt.selected.coord_y.value, cnt.selected.coord_x.value, cnt.selected, cnt.selected.frect)
    #print(ctypes.byref(cnt.selected.frect))
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
            cnt.selected.coord_x.value=cnt.selected.coord_x.value+cnt.step.value
        case sdl3.SDL_SCANCODE_UP:
            
            print('up')
            cnt.selected.coord_y.value=cnt.selected.coord_y.value-cnt.step.value
            
        case sdl3.SDL_SCANCODE_LEFT:
            cnt.selected.coord_x.value=cnt.selected.coord_x.value-cnt.step.value
        case sdl3.SDL_SCANCODE_DOWN:
            cnt.selected.coord_y.value=cnt.selected.coord_y.value+cnt.step.value
        case sdl3.SDL_SCANCODE_1:
            cnt.selected=cnt.sprites_list[0]
        case sdl3.SDL_SCANCODE_2:
            cnt.selected=cnt.sprites_list[1]  
        case sdl3.SDL_SCANCODE_3:
            cnt.selected=cnt.sprites_list[2]
        case sdl3.SDL_SCANCODE_KP_PLUS:
            cnt.selected.scale_x=cnt.selected.scale_x+0.1
            cnt.selected.scale_y=cnt.selected.scale_y+0.1
        case sdl3.SDL_SCANCODE_KP_MINUS:
            cnt.selected.scale_x=cnt.selected.scale_x-0.1
            cnt.selected.scale_y=cnt.selected.scale_y-0.1
        case sdl3.SDL_SCANCODE_SPACE:
            #test attack projectile, refactor later
            x, y = ctypes.c_float(), ctypes.c_float()
            sdl3.SDL_GetMouseState(ctypes.byref(x), ctypes.byref(y))
            #target = find_target_at_position(cnt, x.value, y.value)
            # target.x=x.value
            # target.y=y.value
            # target.name='test_target'
            print("mouse pos", x.value, y.value)
            if cnt.selected.character is not None:
                spell = cnt.selected.character.spells[0]
                cnt.selected.character.spell_attack(x,y,spell)
                sprite=cnt.add_sprite(spell.sprite,scale_x = 0.1,scale_y=0.1, moving=True,speed=1,collidable=True)
                sprite.set_position(cnt.selected.coord_x, cnt.selected.coord_y)
                # # Calculate direction vector from sprite's position to (x.value, y.value)
                # dx = x.value - sprite.frect.x
                # dy = y.value - sprite.frect.y
                # length = (dx ** 2 + dy ** 2) ** 0.5
                # if length != 0:
                #     vx = dx / length * 0.1
                #     vy = dy / length * 0.1
                # else:
                #     vx, vy = 0, 0
                dx= x.value - cnt.selected.coord_x.value
                dy= y.value - cnt.selected.coord_y.value
                # calculate length
                length = (dx ** 2 + dy ** 2) ** 0.5
                vx=dx/length
                vy=dy/length
                sprite.set_speed(vx*sprite.speed, vy*sprite.speed)
                print(f'dx and dy {dx} {dy}projectile speed {vx} {vy}')
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
    # Resize selected sprite's texture on mouse wheel scroll
    if hasattr(cnt, 'selected') and cnt.selected is not None:
        if event.wheel.y > 0:
            cnt.selected.scale_x += 0.01
            cnt.selected.scale_y += 0.01
        elif event.wheel.y < 0:
            cnt.selected.scale_x = max(0.05, cnt.selected.scale_x - 0.01)
            cnt.selected.scale_y = max(0.05, cnt.selected.scale_y - 0.01)

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