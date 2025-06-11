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
DIFF_POSITION = 10  # Minimum position change to trigger network sync
# Fix the handle_mouse_motion to use the stored offset:

def handle_mouse_motion(cnt, event):
    cnt.cursor_position_x, cnt.cursor_position_y = event.motion.x, event.motion.y

    #print(f"event motion.x y {event.motion.x}, {event.motion.y}")
    #print(f"cursor: {cnt.cursor_position_x}, {cnt.cursor_position_y}")
    #print(f"rect: {cnt.LightingManager.rectLight_x}, {cnt.LightingManager.rectLight_y}")    
    if cnt.grabing:
        if cnt.current_table.selected_sprite is not None:
            sprite = cnt.current_table.selected_sprite
            
            # Store old position for network sync
            old_pos = (sprite.coord_x.value, sprite.coord_y.value)
            
            # Use new coordinate system for movement
            if hasattr(cnt.current_table, 'screen_to_table'):
                # Convert mouse movement from screen coordinates to table coordinates
                # This automatically accounts for zoom level
                start_table_x, start_table_y = cnt.current_table.screen_to_table(0, 0)
                end_table_x, end_table_y = cnt.current_table.screen_to_table(event.motion.xrel, event.motion.yrel)
                
                # Apply movement in table coordinate space
                sprite.coord_x.value += (end_table_x - start_table_x)
                sprite.coord_y.value += (end_table_y - start_table_y)
            else:
                # Fallback to legacy system
                table_scale = cnt.current_table.scale
                movement_scale = 1.0 / table_scale
                sprite.coord_x.value += event.motion.xrel * movement_scale
                sprite.coord_y.value += event.motion.yrel * movement_scale
            
            # Constrain sprite to table boundaries
            cnt.current_table.constrain_sprite_to_bounds(sprite)
            
            # New position for network sync
            new_pos = (sprite.coord_x.value, sprite.coord_y.value)
            
            # Send network update if position changed significantly
            
            if hasattr(sprite, '_last_network_x'):
                dx = abs(new_pos[0] - sprite._last_network_x)
                dy = abs(new_pos[1] - sprite._last_network_y)
                  
            # Only send if moved more than threshold (reduce network spam)
                if dx > DIFF_POSITION or dy > DIFF_POSITION:
                    #print(f"cnt.network_context.sync_sprite_move: {cnt.network_context.sync_sprite_move} ")
                    cnt.network_context.sync_sprite_move(sprite, old_pos, new_pos)
                    
                    sprite._last_network_x = new_pos[0]            
                    sprite._last_network_y = new_pos[1]
            
            logger.debug(f"Grabing sprite at {sprite.coord_x.value}, {sprite.coord_y.value}")
            
    if cnt.moving_table:
        # Handle moving table using new coordinate system
        if hasattr(cnt.current_table, 'pan_viewport'):
            # Use new coordinate system for panning
            cnt.current_table.pan_viewport(-event.motion.xrel, -event.motion.yrel)
            logger.debug(f"Panning table viewport {cnt.current_table.viewport_x} {cnt.current_table.viewport_y}")
        else:
            # Fallback to legacy system
            cnt.current_table.move_table(event.motion.xrel, event.motion.yrel)
            logger.debug(f"Moving table {cnt.current_table.x_moved} {cnt.current_table.y_moved}")
        
    if cnt.resizing:
        # Handle resizing - FIXED to work correctly with all scales
        sprite = cnt.current_table.selected_sprite
        if sprite is not None:
            # Use absolute positioning from stored start values
            if hasattr(sprite, '_resize_start_scale_x'):
                
                moved_dx = event.motion.x - sprite._resize_start_mouse_x
                moved_dy = event.motion.y - sprite._resize_start_mouse_y
                
                # Scale sensitivity based on table scale for consistent feel
                table_scale = cnt.current_table.scale
                #base_sensitivity = 0.001
                 # Also factor in sprite's current scale to prevent tiny sprites from being hard to resize
                dx = moved_dx/ sprite._resize_start_width* sprite._resize_start_scale_x 
                dy= moved_dy/ sprite._resize_start_height* sprite._resize_start_scale_y 
                
                match cnt.resize_direction:
                    case Directions.EAST:
                        sprite.scale_x = max(0.05, sprite._resize_start_scale_x + dx) 
                    case Directions.WEST:
                        sprite.scale_x = max(0.05, sprite._resize_start_scale_x - dx)
                        # Adjust position to keep right edge in place
                        sprite.coord_x.value = sprite._resize_start_coord_x+moved_dx/table_scale
                        # Constrain position after adjustment
                        
                       # print(f'Resize WEST: frect_x={sprite.frect.x:.3f}, moved={moved_dx:.3f}')

                    case Directions.NORTH:
                        sprite.scale_y = max(0.05, sprite._resize_start_scale_y - dy )
                        # Adjust position to keep bottom edge in place
                        sprite.coord_y.value = sprite._resize_start_coord_y+moved_dy/table_scale
                        # Constrain position after adjustment
                        

                    case Directions.SOUTH:
                        sprite.scale_y = max(0.05, sprite._resize_start_scale_y + dy)
                        
                    case Directions.SOUTHEAST:
                        sprite.scale_x = max(0.05, sprite._resize_start_scale_x + dx )
                        sprite.scale_y = max(0.05, sprite._resize_start_scale_y + dy )
                        
                    case Directions.SOUTHWEST:
                        sprite.scale_x = max(0.05, sprite._resize_start_scale_x - dx)
                        sprite.scale_y = max(0.05, sprite._resize_start_scale_y + dy)
                        sprite.coord_x.value = sprite._resize_start_coord_x+ moved_dx/table_scale
                        # Constrain position after adjustment
                        

                    case Directions.NORTHEAST:
                        sprite.scale_x = max(0.05, sprite._resize_start_scale_x + dx)
                        sprite.scale_y = max(0.05, sprite._resize_start_scale_y - dy)
                        sprite.coord_y.value = sprite._resize_start_coord_y+ moved_dy/table_scale
                        # Constrain position after adjustment
                        
                        
                    case Directions.NORTHWEST:
                        sprite.scale_x = max(0.05, sprite._resize_start_scale_x - dx)
                        sprite.scale_y = max(0.05, sprite._resize_start_scale_y - dy)
                        sprite.coord_x.value = sprite._resize_start_coord_x+ moved_dx/table_scale
                        sprite.coord_y.value = sprite._resize_start_coord_y+ moved_dy/table_scale
                        # Constrain position after adjustment
                
                
            # Clamp maximum scale
            sprite.scale_x = min(10.0, sprite.scale_x)
            sprite.scale_y = min(10.0, sprite.scale_y)
            
            # Constrain sprite to table boundaries after resize
            cnt.current_table.constrain_sprite_to_bounds(sprite)
            if cnt.current_table.out_of_bounds(sprite):
                sprite.scale_x = sprite._last_valid_scale_x
                sprite.scale_y = sprite._last_valid_scale_y
            else:
                sprite._last_valid_scale_x = sprite.scale_x
                sprite._last_valid_scale_y = sprite.scale_y
            
            logger.debug(f"Resize: scale_x={sprite.scale_x:.3f}, scale_y={sprite.scale_y:.3f}")
    
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

# Fix the handle_mouse_button_down function:

def handle_mouse_button_down(cnt, event):
    if event.button.button == 1:  # Left mouse button
        # Create the point for mouse position
        point = sdl3.SDL_FPoint()
        point.x, point.y = event.button.x, event.button.y
        logger.debug(f"Mouse button down at {point.x}, {point.y}")
        # Check if we're clicking on a resize handle first
        if cnt.current_table and cnt.current_table.selected_sprite:
            sprite = cnt.current_table.selected_sprite
            resize_direction = None
            
            # Check resize handles (same logic as in handle_mouse_motion)
            margin_w = sprite.frect.w/40
            margin_h = sprite.frect.h/40
            
            # Create resize areas
            frec1 = sdl3.SDL_FRect()  # left edge
            frec1.x = sprite.frect.x - margin_w
            frec1.y = sprite.frect.y - margin_h
            frec1.w = margin_w * 2
            frec1.h = sprite.frect.h + 2 * margin_h
            
            frec2 = sdl3.SDL_FRect()  # bottom edge
            frec2.x = sprite.frect.x - margin_w
            frec2.y = sprite.frect.y + sprite.frect.h - margin_h
            frec2.w = sprite.frect.w + 2 * margin_w
            frec2.h = margin_h * 2
            
            frec3 = sdl3.SDL_FRect()  # top edge
            frec3.x = sprite.frect.x - margin_w
            frec3.y = sprite.frect.y - margin_h
            frec3.w = sprite.frect.w + margin_w * 2
            frec3.h = margin_h * 2
            
            frec4 = sdl3.SDL_FRect()  # right edge
            frec4.x = sprite.frect.x + sprite.frect.w - margin_w
            frec4.y = sprite.frect.y - margin_h
            frec4.w = margin_w * 2
            frec4.h = sprite.frect.h + margin_h * 2
            
            # Check which resize area was clicked
            if sdl3.SDL_PointInRectFloat(ctypes.byref(point), ctypes.byref(frec1)):
                resize_direction = Directions.WEST
                if sdl3.SDL_PointInRectFloat(ctypes.byref(point), ctypes.byref(frec2)):
                    resize_direction = Directions.SOUTHWEST
                elif sdl3.SDL_PointInRectFloat(ctypes.byref(point), ctypes.byref(frec3)):
                    resize_direction = Directions.NORTHWEST
            elif sdl3.SDL_PointInRectFloat(ctypes.byref(point), ctypes.byref(frec2)):
                resize_direction = Directions.SOUTH
                if sdl3.SDL_PointInRectFloat(ctypes.byref(point), ctypes.byref(frec4)):
                    resize_direction = Directions.SOUTHEAST
            elif sdl3.SDL_PointInRectFloat(ctypes.byref(point), ctypes.byref(frec3)):
                resize_direction = Directions.NORTH
                if sdl3.SDL_PointInRectFloat(ctypes.byref(point), ctypes.byref(frec4)):
                    resize_direction = Directions.NORTHEAST
            elif sdl3.SDL_PointInRectFloat(ctypes.byref(point), ctypes.byref(frec4)):
                resize_direction = Directions.EAST
            
            # If we clicked on a resize handle, start resizing
            if resize_direction:
                handle_resize(cnt, resize_direction)
                
                # Store resize start values
                sprite._resize_start_scale_x = sprite.scale_x
                sprite._resize_start_scale_y = sprite.scale_y
                sprite._resize_start_mouse_x = event.button.x
                sprite._resize_start_mouse_y = event.button.y
                sprite._resize_start_coord_x = sprite.coord_x.value
                sprite._resize_start_coord_y = sprite.coord_y.value
                sprite._resize_start_width = sprite.frect.w
                sprite._resize_start_height = sprite.frect.h 
                
                logger.debug(f"Starting resize in direction {resize_direction}")
                return  # Don't process as grab or table move
            
            # If not resizing, prepare for grabbing
            table_scale = cnt.current_table.scale
            
            # Calculate where the mouse clicked relative to sprite position
            sprite_screen_x = (sprite.coord_x.value + cnt.current_table.x_moved) * table_scale
            sprite_screen_y = (sprite.coord_y.value + cnt.current_table.y_moved) * table_scale
            
            # Store the offset from mouse to sprite center
            sprite._grab_offset_x = event.button.x - sprite_screen_x
            sprite._grab_offset_y = event.button.y - sprite_screen_y
        
        # Check if we clicked on any sprite
        clicked_on_sprite = False
        if cnt.current_table:
            for sprites in cnt.current_table.dict_of_sprites_list.values():
                for sprite in sprites:
                    if sdl3.SDL_PointInRectFloat(ctypes.byref(point), ctypes.byref(sprite.frect)):
                        cnt.current_table.selected_sprite = sprite
                        cnt.grabing = True
                        clicked_on_sprite = True
                        logger.debug("Sprite grabbed")
                        break
                if clicked_on_sprite:
                    break
        
        # If we didn't click on a sprite and we're not resizing, start moving the table
        if not clicked_on_sprite and not cnt.resizing:
            cnt.moving_table = True
            logger.debug("Not grabbed, moving table")
        
        logger.debug(f"Button down at {event.button.x}, {event.button.y}")

# Fix the handle_mouse_button_up to clean up stored values:

def handle_mouse_button_up(cnt, event):
    if event.button.button == 1:
        # Handle resize end
        if cnt.resizing and cnt.current_table and cnt.current_table.selected_sprite:
            handle_resize_end(cnt, cnt.current_table.selected_sprite)
        
        # Send final position update when releasing sprite
        if cnt.grabing and cnt.current_table and cnt.current_table.selected_sprite:
            sprite = cnt.current_table.selected_sprite
            
            # Send final position to ensure sync
            final_pos = (sprite.coord_x.value, sprite.coord_y.value)
            old_pos = (getattr(sprite, '_last_network_x', final_pos[0]), 
                      getattr(sprite, '_last_network_y', final_pos[1]))
            
            cnt.network_context.sync_sprite_move(sprite, old_pos, final_pos)
            
            # Update last network position
            sprite._last_network_x = final_pos[0]
            sprite._last_network_y = final_pos[1]
        
        # Clean up all stored interaction data
        if cnt.current_table and cnt.current_table.selected_sprite:
            sprite = cnt.current_table.selected_sprite
            
            # Remove grab offset data
            if hasattr(sprite, '_grab_offset_x'):
                delattr(sprite, '_grab_offset_x')
            if hasattr(sprite, '_grab_offset_y'):
                delattr(sprite, '_grab_offset_y')
                
            # Remove resize data
            for attr in ['_resize_start_scale_x', '_resize_start_scale_y', 
                        '_resize_start_mouse_x', '_resize_start_mouse_y',
                        '_resize_start_coord_x', '_resize_start_coord_y']:
                if hasattr(sprite, attr):
                    delattr(sprite, attr)
        
        # Reset interaction states
        cnt.resizing = False
        cnt.grabing = False
        cnt.moving_table = False
        cnt.resize_direction = None
        
        # Reset cursor
        sdl3.SDL_SetCursor(sdl3.SDL_CreateSystemCursor(sdl3.SDL_SYSTEM_CURSOR_DEFAULT))
        cnt.cursor = sdl3.SDL_SYSTEM_CURSOR_DEFAULT
        
        logger.debug(f"Button up at {event.button.x}, {event.button.y}")

def handle_resize_end(cnt, sprite):
    """Called when sprite resize operation ends"""
    logger.debug(f"Resize ended for sprite {sprite.name} at scale ({sprite.scale_x}, {sprite.scale_y})")
    cnt.resizing = False
    if sprite and hasattr(cnt, 'network_context'):
        # Send scale update
        new_scale = (sprite.scale_x, sprite.scale_y)
        old_scale = (getattr(sprite, '_resize_start_scale_x', new_scale[0]),
                    getattr(sprite, '_resize_start_scale_y', new_scale[1]))
        cnt.network_context.sync_sprite_scale(sprite, old_scale, new_scale)
        
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
            cnt.current_table.constrain_sprite_to_bounds(sprite)
              # Send final position to ensure sync
            final_pos = (sprite.coord_x.value, sprite.coord_y.value)
            old_pos = (getattr(sprite, '_last_network_x', final_pos[0]), 
                      getattr(sprite, '_last_network_y', final_pos[1]))
            
            cnt.network_context.sync_sprite_move(sprite, old_pos, final_pos)
            
            # Update last network position
            sprite._last_network_x = final_pos[0]
            sprite._last_network_y = final_pos[1]
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
                table= cnt.current_table
                spell = table.selected_sprite.character.spells[0]
                table.selected_sprite.character.spell_attack(x, y, spell)
                sprite = cnt.add_sprite(spell.sprite, scale_x=0.1, scale_y=0.1, moving=True, speed=1, collidable=True, coord_x=table.selected_sprite.coord_x.value, coord_y=table.selected_sprite.coord_y.value)
                sprite.set_position(cnt.current_table.selected_sprite.coord_x.value, cnt.current_table.selected_sprite.coord_y.value)
                #print(f" x.value:{x.value}, cnt.current_table.selected_sprite.coord_x.value: {cnt.current_table.selected_sprite.coord_x.value}, cnt.current_table.x_moved: {cnt.current_table.x_moved}" )
                dx = x.value - table.selected_sprite.coord_x.value*table.scale - table.x_moved
                dy = y.value - table.selected_sprite.coord_y.value*table.scale - table.y_moved
                length = (dx ** 2 + dy ** 2) ** 0.5
                vx = dx / length
                vy = dy / length
                sprite.set_speed(vx * sprite.speed, vy * sprite.speed)
                logger.info(f"Projectile dx/dy: {dx} {dy}, speed: {vx} {vy}")
        case sdl3.SDL_SCANCODE_LCTRL:
            logger.info("Control key pressed, asking table")
            
            cnt.network_context.ask_for_table('large_table')
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
        # Use new coordinate system for zooming if available
        if hasattr(cnt.current_table, 'zoom_table'):
            cnt.current_table.zoom_table(1.1)  # Zoom in by 10%
            logger.debug("Table zoom increased, new scale: %s", cnt.current_table.table_scale)
        else:
            # Fallback to legacy system
            cnt.current_table.change_scale(0.1)
            logger.debug("Table scale increased and now: %s", cnt.current_table.scale)
    elif event.wheel.y < 0:
        # Use new coordinate system for zooming if available
        if hasattr(cnt.current_table, 'zoom_table'):
            cnt.current_table.zoom_table(0.9)  # Zoom out by 10%
            logger.debug("Table zoom decreased, new scale: %s", cnt.current_table.table_scale)
        else:
            # Fallback to legacy system
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