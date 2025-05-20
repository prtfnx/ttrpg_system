import sdl3
import ctypes



def handle_mouse_motion(cnt, event):
    
    # Determine intersect with sprites
    # Get position
    point = sdl3.SDL_FPoint()
    print(event.motion)
    point.x, point.y = event.motion.x, event.motion.y
    print('movement point')
    resize_cursor = None
    #  Check if edge is near
    for sprite in cnt.sprites_list:
        
        print(point, point.x, point.y)
        #make 4 rectangles for 4 sides
        rec1,rec2,rec3,rec4 = sdl3.SDL_FRect(),sdl3.SDL_FRect(),sdl3.SDL_FRect(),sdl3.SDL_FRect()
        
        # rec1: left edge
        rec1.x = ctypes.c_float(sprite.frect.x - 20)
        rec1.y = ctypes.c_float(sprite.frect.y - 20)
        rec1.w = ctypes.c_float(40)
        rec1.h = ctypes.c_float(sprite.frect.h+40)
        # rec2: bottom edge
        rec2.x = ctypes.c_float(sprite.frect.x-20)
        rec2.y = ctypes.c_float(sprite.frect.y +sprite.frect.h -20)
        rec2.w = ctypes.c_float(sprite.frect.w+40)
        rec2.h = ctypes.c_float(40)

        # rec3: top edge
        rec3.x = ctypes.c_float(sprite.frect.x - 20)
        rec3.y = ctypes.c_float(sprite.frect.y - 20)
        rec3.w = ctypes.c_float(sprite.frect.w+40)
        rec3.h = ctypes.c_float(40)

        # rec4: right edge
        rec4.x = ctypes.c_float(sprite.frect.x + sprite.frect.w - 20)
        rec4.y = ctypes.c_float(sprite.frect.y - 20)
        rec4.w = ctypes.c_float(40)
        rec4.h = ctypes.c_float(sprite.frect.h+40)
        # Check if mouse is near any edge for resizing
        
        if sdl3.SDL_PointInRectFloat(ctypes.byref(point), ctypes.byref(rec1)):
            resize_cursor = sdl3.SDL_SYSTEM_CURSOR_W_RESIZE
        elif sdl3.SDL_PointInRectFloat(ctypes.byref(point), ctypes.byref(rec2)):
            resize_cursor = sdl3.SDL_SYSTEM_CURSOR_S_RESIZE
        elif sdl3.SDL_PointInRectFloat(ctypes.byref(point), ctypes.byref(rec3)):
            resize_cursor = sdl3.SDL_SYSTEM_CURSOR_N_RESIZE
        elif sdl3.SDL_PointInRectFloat(ctypes.byref(point), ctypes.byref(rec4)):
            resize_cursor = sdl3.SDL_SYSTEM_CURSOR_E_RESIZE

        if resize_cursor is not None:
            print('intersect')
            cursor = sdl3.SDL_CreateSystemCursor(resize_cursor)
            sdl3.SDL_SetCursor(cursor)
        else:
            sdl3.SDL_SetCursor(sdl3.SDL_CreateSystemCursor(sdl3.SDL_SYSTEM_CURSOR_DEFAULT))
        print(sdl3.SDL_PointInRectFloat(ctypes.byref(point),ctypes.byref(sprite.frect)))
        
            
            


def handle_mouse_button_down(cnt, event):
    #determine intersect with sprites
    
    point = sdl3.SDL_FPoint()

    print(event.button)
    point.x, point.y = event.button.x, event.button.y
    
    if event.button.button == 1:
        for sprite in cnt.sprites_list:
            print('button 1 point')
            print(point, point.x, point.y)
            print(sprite.frect, sprite.frect.x, sprite.frect.y)
            print(sdl3.SDL_PointInRectFloat(ctypes.byref(point),ctypes.byref(sprite.frect)))
            if sdl3.SDL_PointInRectFloat(ctypes.byref(point),ctypes.byref(sprite.frect)):
                print('intersect')
                cnt.selected=sprite
                pass
    print("check")
            
def handle_key_event(cnt, key_code):
    print(cnt.selected.coord_y.value,cnt.selected.coord_x.value, cnt.selected, cnt.selected.frect)
    print(ctypes.byref(cnt.selected.frect))
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
            cnt.selected.scale=cnt.selected.scale+0.1
        case sdl3.SDL_SCANCODE_KP_MINUS:
            cnt.selected.scale=cnt.selected.scale-0.1     
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
            cnt.selected.scale += 0.01
        elif event.wheel.y < 0:
            cnt.selected.scale = max(0.05, cnt.selected.scale - 0.01)

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
        case sdl3.SDL_EVENT_MOUSE_WHEEL:
            handle_mouse_wheel(cnt, event)
            return True
        case sdl3.SDL_EVENT_MOUSE_MOTION:
            handle_mouse_motion(cnt, event)
            return True
        case _:
            return True