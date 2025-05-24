import sdl3
import ctypes
import json
import logging
import paint
import clipboard_sys  # Add clipboard import
import dragdrop_sys   # Add drag drop import

logger = logging.getLogger(__name__)

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
            logger.debug(f"grabing sprite {sprite} ")            
    if cnt.moving_table:
        # Handle moving table       
        cnt.current_table.move_table(event.motion.xrel, event.motion.yrel)

        logger.debug(f"Moving table {cnt.current_table.x_moved} {cnt.current_table.y_moved}")
    if cnt.resizing:
        # Handle resizing
        match cnt.resize_direction:
            case Directions.EAST:
                # Handle east resize
                cnt.current_table.selected_sprite.frect.w = cnt.current_table.selected_sprite.frect.w + event.motion.xrel
                cnt.current_table.selected_sprite.scale_x = cnt.current_table.selected_sprite.frect.w / cnt.current_table.selected_sprite.original_w
                logger.debug(f"East resize: {cnt.current_table.selected_sprite.frect.w}")
            case Directions.WEST:
                cnt.current_table.selected_sprite.frect.w -= event.motion.xrel
                cnt.current_table.selected_sprite.scale_x = cnt.current_table.selected_sprite.frect.w / cnt.current_table.selected_sprite.original_w
                logger.debug(f"West resize: {cnt.current_table.selected_sprite.frect.w}")
            case Directions.NORTH:
                cnt.current_table.selected_sprite.frect.h -= event.motion.yrel
                cnt.current_table.selected_sprite.scale_y = cnt.current_table.selected_sprite.frect.h / cnt.current_table.selected_sprite.original_h
                logger.debug(f"North resize: {cnt.current_table.selected_sprite.frect.h}")
            case Directions.SOUTH:
                cnt.current_table.selected_sprite.frect.h += event.motion.yrel
                cnt.current_table.selected_sprite.scale_y = cnt.current_table.selected_sprite.frect.h / cnt.current_table.selected_sprite.original_h
                logger.debug(f"South resize: {cnt.current_table.selected_sprite.frect.h}")
            case Directions.NORTHEAST:
                cnt.current_table.selected_sprite.frect.w += event.motion.xrel
                cnt.current_table.selected_sprite.frect.h -= event.motion.yrel
                cnt.current_table.selected_sprite.scale_x = cnt.current_table.selected_sprite.frect.w / cnt.current_table.selected_sprite.original_w
                cnt.current_table.selected_sprite.scale_y = cnt.current_table.selected_sprite.frect.h / cnt.current_table.selected_sprite.original_h
                logger.debug(f"Northeast resize: {cnt.current_table.selected_sprite.frect.w}, {cnt.current_table.selected_sprite.frect.h}")
            case Directions.NORTHWEST:
                cnt.current_table.selected_sprite.frect.w -= event.motion.xrel
                cnt.current_table.selected_sprite.frect.h -= event.motion.yrel
                cnt.current_table.selected_sprite.scale_x = cnt.current_table.selected_sprite.frect.w / cnt.current_table.selected_sprite.original_w
                cnt.current_table.selected_sprite.scale_y = cnt.current_table.selected_sprite.frect.h / cnt.current_table.selected_sprite.original_h
                logger.debug(f"Northwest resize: {cnt.current_table.selected_sprite.frect.w}, {cnt.current_table.selected_sprite.frect.h}")
            case Directions.SOUTHEAST:
                cnt.current_table.selected_sprite.frect.w += event.motion.xrel
                cnt.current_table.selected_sprite.frect.h += event.motion.yrel
                cnt.current_table.selected_sprite.scale_x = cnt.current_table.selected_sprite.frect.w / cnt.current_table.selected_sprite.original_w
                cnt.current_table.selected_sprite.scale_y = cnt.current_table.selected_sprite.frect.h / cnt.current_table.selected_sprite.original_h
                logger.debug(f"Southeast resize: {cnt.current_table.selected_sprite.frect.w}, {cnt.current_table.selected_sprite.frect.h}")
            case Directions.SOUTHWEST:
                cnt.current_table.selected_sprite.frect.w -= event.motion.xrel
                cnt.current_table.selected_sprite.frect.h += event.motion.yrel
                cnt.current_table.selected_sprite.scale_x = cnt.current_table.selected_sprite.frect.w / cnt.current_table.selected_sprite.original_w
                cnt.current_table.selected_sprite.scale_y = cnt.current_table.selected_sprite.frect.h / cnt.current_table.selected_sprite.original_h
                logger.debug(f"Southwest resize: {cnt.current_table.selected_sprite.frect.w}, {cnt.current_table.selected_sprite.frect.h}")
    else:
        # Determine intersect with sprites
        # Get position
        point = sdl3.SDL_FPoint()
        point.x, point.y = event.motion.x, event.motion.y
        resize_cursor = None
        #  Check if edge is near
        frec1, frec2, frec3, frec4 = sdl3.SDL_FRect(), sdl3.SDL_FRect(), sdl3.SDL_FRect(), sdl3.SDL_FRect()
        sprite = cnt.current_table.selected_sprite
        if sprite is not None:    
            
            # frec1: left edge
            margin_w = sprite.frect.w/40
            margin_h = sprite.frect.h/40
            frec1.x = ctypes.c_float(sprite.frect.x - margin_w)
            frec1.y = ctypes.c_float(sprite.frect.y - margin_h)
            frec1.w = ctypes.c_float(margin_w*2)
            frec1.h = ctypes.c_float(sprite.frect.h+2*margin_h)
            # frec2: bottom edge
            frec2.x = ctypes.c_float(sprite.frect.x-margin_w)
            frec2.y = ctypes.c_float(sprite.frect.y +sprite.frect.h - margin_h)
            frec2.w = ctypes.c_float(sprite.frect.w+2*margin_w)
            frec2.h = ctypes.c_float(margin_h*2)

            # frec3: top edge
            frec3.x = ctypes.c_float(sprite.frect.x - margin_w)
            frec3.y = ctypes.c_float(sprite.frect.y - margin_h)
            frec3.w = ctypes.c_float(sprite.frect.w+margin_w*2)
            frec3.h = ctypes.c_float(margin_h*2)

            # rec4: right edge
            frec4.x = ctypes.c_float(sprite.frect.x + sprite.frect.w - margin_w)
            frec4.y = ctypes.c_float(sprite.frect.y - margin_h)
            frec4.w = ctypes.c_float(margin_w*2)
            frec4.h = ctypes.c_float(sprite.frect.h+margin_h*2)
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
                cnt.cursor = resize_cursor
                cursor = sdl3.SDL_CreateSystemCursor(resize_cursor)
                sdl3.SDL_SetCursor(cursor)
            else:
                sdl3.SDL_SetCursor(sdl3.SDL_CreateSystemCursor(sdl3.SDL_SYSTEM_CURSOR_DEFAULT))
                cnt.cursor = sdl3.SDL_SYSTEM_CURSOR_DEFAULT

def handle_resize(cnt, direction):
    cnt.resizing = True
    cnt.resize_direction = direction

def handle_mouse_button_down(cnt, event):
    point = sdl3.SDL_FPoint()
    logger.debug(f"Mouse button event: {event.button}")
    point.x, point.y = event.button.x, event.button.y

    if event.button.button == 1:
        cursor = cnt.cursor
        logger.debug(f"Button down position {event.button.x} {event.button.y}")
        match cursor:
            case sdl3.SDL_SYSTEM_CURSOR_W_RESIZE:
                handle_resize(cnt, Directions.WEST)
            case sdl3.SDL_SYSTEM_CURSOR_E_RESIZE:
                handle_resize(cnt, Directions.EAST)
            case sdl3.SDL_SYSTEM_CURSOR_NW_RESIZE:
                handle_resize(cnt, Directions.NORTHWEST)
            case sdl3.SDL_SYSTEM_CURSOR_NE_RESIZE:
                handle_resize(cnt, Directions.NORTHEAST )
            case sdl3.SDL_SYSTEM_CURSOR_SW_RESIZE:
                handle_resize(cnt, Directions.SOUTHWEST)
            case sdl3.SDL_SYSTEM_CURSOR_SE_RESIZE:
                handle_resize(cnt, Directions.SOUTHEAST)
            case sdl3.SDL_SYSTEM_CURSOR_S_RESIZE:
                handle_resize(cnt, Directions.SOUTH)
            case sdl3.SDL_SYSTEM_CURSOR_N_RESIZE:
                handle_resize(cnt, Directions.NORTH)
    for sprites in cnt.current_table.dict_of_sprites_list.values():
        for sprite in sprites:
            if sdl3.SDL_PointInRectFloat(ctypes.byref(point), ctypes.byref(sprite.frect)):
                cnt.current_table.selected_sprite = sprite
                cnt.grabing = True
                logger.debug("Sprite grabbed")
    if not cnt.grabing and not cnt.resizing:
        cnt.moving_table = True
        logger.debug("Not grabbed, moving table")

def handle_mouse_button_up(cnt, event):
    if event.button.button == 1:
        cnt.resizing = False
        cnt.grabing = False
        cnt.moving_table = False
        cnt.resize_direction = None
        sdl3.SDL_SetCursor(sdl3.SDL_CreateSystemCursor(sdl3.SDL_SYSTEM_CURSOR_DEFAULT))
        cnt.cursor = sdl3.SDL_SYSTEM_CURSOR_DEFAULT
        logger.debug(f"Button up position {event.button.x} {event.button.y}")
        logger.debug(f"Cursor reset to default: {cnt.cursor}")

def handle_key_event(cnt, key_code):
    match key_code:
        case sdl3.SDL_SCANCODE_ESCAPE:
            pass
        case sdl3.SDL_SCANCODE_Q:
            return sdl3.SDL_APP_SUCCESS
        case sdl3.SDL_SCANCODE_P:  # Paint mode toggle
            paint.toggle_paint_mode()
            logger.info("Toggled paint mode")
        case sdl3.SDL_SCANCODE_V:  # Paste
            logger.info("V key pressed - attempting clipboard paste")
            try:
                if clipboard_sys.handle_clipboard_paste(cnt):
                    logger.info("Successfully pasted from clipboard")
                else:
                    logger.info("Nothing to paste from clipboard")
            except Exception as e:
                logger.error(f"Error during clipboard paste: {e}")
        case sdl3.SDL_SCANCODE_C:  # Copy
            logger.info("C key pressed - attempting to copy selected sprite")
            try:
                if clipboard_sys.handle_clipboard_copy(cnt):
                    logger.info("Successfully copied selected sprite")
                else:
                    logger.info("No sprite selected to copy")
            except Exception as e:
                logger.error(f"Error during sprite copy: {e}")
        case sdl3.SDL_SCANCODE_X:  # Cut (copy + delete)
            logger.info("X key pressed - attempting to cut selected sprite")
            try:
                if clipboard_sys.handle_clipboard_copy(cnt):
                    # Delete the original sprite after copying
                    if cnt.current_table and cnt.current_table.selected_sprite:
                        # Remove from all layers
                        for layer_sprites in cnt.current_table.dict_of_sprites_list.values():
                            if cnt.current_table.selected_sprite in layer_sprites:
                                layer_sprites.remove(cnt.current_table.selected_sprite)
                        cnt.current_table.selected_sprite = None
                        logger.info("Successfully cut selected sprite")
                    else:
                        logger.info("No sprite selected to cut")
                else:
                    logger.info("Failed to copy sprite for cutting")
            except Exception as e:
                logger.error(f"Error during sprite cut: {e}")
        case sdl3.SDL_SCANCODE_TAB:  # Cycle paint colors when in paint mode
            if paint.is_paint_mode_active():
                paint.paint_system.cycle_paint_colors()
        case sdl3.SDL_SCANCODE_EQUALS:  # Increase brush width
            if paint.is_paint_mode_active():
                paint.paint_system.adjust_paint_width(1)
        case sdl3.SDL_SCANCODE_MINUS:  # Decrease brush width
            if paint.is_paint_mode_active():
                paint.paint_system.adjust_paint_width(-1)
        case sdl3.SDL_SCANCODE_R:
            pass
        case sdl3.SDL_SCANCODE_RIGHT:
            sprite = cnt.current_table.selected_sprite
            sprite.coord_x.value += min(cnt.step.value, sprite.frect.w)
        case sdl3.SDL_SCANCODE_UP:
            sprite = cnt.current_table.selected_sprite
            sprite.coord_y.value -= min(cnt.step.value, sprite.frect.h)
        case sdl3.SDL_SCANCODE_LEFT:
            sprite = cnt.current_table.selected_sprite
            sprite.coord_x.value -= min(cnt.step.value, sprite.frect.w)
        case sdl3.SDL_SCANCODE_DOWN:
            sprite = cnt.current_table.selected_sprite
            sprite.coord_y.value += min(cnt.step.value, sprite.frect.h)
        case sdl3.SDL_SCANCODE_1:
            cnt.current_table.selected_sprite = cnt.current_table.dict_of_sprites_list['tokens'][0]
        case sdl3.SDL_SCANCODE_2:
            cnt.current_table.selected_sprite = cnt.current_table.dict_of_sprites_list['tokens'][1]
        case sdl3.SDL_SCANCODE_3:
            cnt.current_table.selected_sprite = cnt.current_table.dict_of_sprites_list['tokens'][2]
        case sdl3.SDL_SCANCODE_4:
            cnt.current_table = cnt.list_of_tables[0]
        case sdl3.SDL_SCANCODE_5:
            cnt.current_table = cnt.list_of_tables[1]
        case sdl3.SDL_SCANCODE_KP_PLUS:
            cnt.current_table.selected_sprite.scale_x += 0.1
            cnt.current_table.selected_sprite.scale_y += 0.1
        case sdl3.SDL_SCANCODE_KP_MINUS:
            cnt.current_table.selected_sprite.scale_x -= 0.1
            cnt.current_table.selected_sprite.scale_y -= 0.1
        case sdl3.SDL_SCANCODE_SPACE:
            x, y = ctypes.c_float(), ctypes.c_float()
            sdl3.SDL_GetMouseState(ctypes.byref(x), ctypes.byref(y))
            logger.info(f"Mouse pos {x.value}, {y.value}")
            if cnt.current_table.selected_sprite.character is not None:
                spell = cnt.current_table.selected_sprite.character.spells[0]
                cnt.current_table.selected_sprite.character.spell_attack(x, y, spell)
                sprite = cnt.add_sprite(spell.sprite, scale_x=0.1, scale_y=0.1, moving=True, speed=1, collidable=True)
                sprite.set_position(cnt.current_table.selected_sprite.coord_x.value, cnt.current_table.selected_sprite.coord_y.value)
                dx = x.value - cnt.current_table.selected_sprite.coord_x.value
                dy = y.value - cnt.current_table.selected_sprite.coord_y.value
                length = (dx ** 2 + dy ** 2) ** 0.5
                vx = dx / length
                vy = dy / length
                sprite.set_speed(vx * sprite.speed, vy * sprite.speed)
                logger.info(f"Projectile dx/dy: {dx} {dy}, speed: {vx} {vy}")
        case sdl3.SDL_SCANCODE_LCTRL:
            logger.info("Control key pressed, sending message")
            cnt.queue_to_send.put("hello")
        case sdl3.SDL_SCANCODE_LALT:
            logger.info("Alt key pressed, make table from json")
            with open('table.json', 'r') as f:
                data = json.load(f)
            logger.info(f"Loaded table data: {data}")
            table = cnt.create_table_from_json(data)
            cnt.list_of_tables.append(table)
            cnt.current_table = table
            logger.info("Table created and changed")
        case _:
            return sdl3.SDL_APP_CONTINUE

def handle_mouse_wheel(cnt, event):
    if event.wheel.y > 0:
        cnt.current_table.change_scale(0.1)
        logger.debug("Table scale increased and now: %s", cnt.current_table.scale)
    elif event.wheel.y < 0:
        cnt.current_table.change_scale(-0.1)

def handle_event(cnt, event):
    # First check if paint system should handle the event
    try:
        if paint.handle_paint_events(event):
            return True
    except Exception as e:
        logger.error(f"Error in paint system event handling: {e}")
    
    match event.type:
        case sdl3.SDL_EVENT_QUIT:
            return False
        case sdl3.SDL_EVENT_KEY_DOWN:
            try:
                # Handle Ctrl+C for copy
                if event.key.scancode == sdl3.SDL_SCANCODE_C and (event.key.mod & sdl3.SDL_KMOD_CTRL):
                    logger.info("Ctrl+C pressed - attempting to copy selected sprite")
                    if clipboard_sys.handle_clipboard_copy(cnt):
                        logger.info("Successfully copied selected sprite (Ctrl+C)")
                    else:
                        logger.info("No sprite selected to copy (Ctrl+C)")
                    return True
                # Handle Ctrl+V for paste
                elif event.key.scancode == sdl3.SDL_SCANCODE_V and (event.key.mod & sdl3.SDL_KMOD_CTRL):
                    logger.info("Ctrl+V pressed - attempting clipboard paste")
                    if clipboard_sys.handle_clipboard_paste(cnt):
                        logger.info("Successfully pasted from clipboard (Ctrl+V)")
                    else:
                        logger.info("Nothing to paste from clipboard (Ctrl+V)")
                    return True
                # Handle Ctrl+X for cut
                elif event.key.scancode == sdl3.SDL_SCANCODE_X and (event.key.mod & sdl3.SDL_KMOD_CTRL):
                    logger.info("Ctrl+X pressed - attempting to cut selected sprite")
                    if clipboard_sys.handle_clipboard_copy(cnt):
                        # Delete the original sprite after copying
                        if cnt.current_table and cnt.current_table.selected_sprite:
                            # Remove from all layers
                            for layer_sprites in cnt.current_table.dict_of_sprites_list.values():
                                if cnt.current_table.selected_sprite in layer_sprites:
                                    layer_sprites.remove(cnt.current_table.selected_sprite)
                            cnt.current_table.selected_sprite = None
                            logger.info("Successfully cut selected sprite (Ctrl+X)")
                        else:
                            logger.info("No sprite selected to cut (Ctrl+X)")
                    else:
                        logger.info("Failed to copy sprite for cutting (Ctrl+X)")
                    return True
                else:
                    handle_key_event(cnt, event.key.scancode)
                    return True
            except Exception as e:
                logger.error(f"Error handling key event: {e}")
                import traceback
                logger.error(traceback.format_exc())
                return True
        case sdl3.SDL_EVENT_MOUSE_BUTTON_DOWN:
            try:
                handle_mouse_button_down(cnt, event)
                return True
            except Exception as e:
                logger.error(f"Error handling mouse button down: {e}")
                return True
        case sdl3.SDL_EVENT_MOUSE_BUTTON_UP:
            try:
                handle_mouse_button_up(cnt, event)
                return True
            except Exception as e:
                logger.error(f"Error handling mouse button up: {e}")
                return True
        case sdl3.SDL_EVENT_MOUSE_WHEEL:
            try:
                handle_mouse_wheel(cnt, event)
                return True
            except Exception as e:
                logger.error(f"Error handling mouse wheel: {e}")
                return True
        case sdl3.SDL_EVENT_MOUSE_MOTION:
            try:
                handle_mouse_motion(cnt, event)
                return True
            except Exception as e:
                logger.error(f"Error handling mouse motion: {e}")
                return True
        # Add drag and drop event handling
        case sdl3.SDL_EVENT_DROP_BEGIN | sdl3.SDL_EVENT_DROP_FILE | sdl3.SDL_EVENT_DROP_TEXT | sdl3.SDL_EVENT_DROP_COMPLETE:
            try:
                dragdrop_sys.handle_drag_drop_event(cnt, event)
                return True
            except Exception as e:
                logger.error(f"Error handling drag drop: {e}")
                return True
        case _:
            return True