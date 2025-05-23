import sys
import sdl3
import ctypes
import colorsys
import event_sys
import context
import sprite
import core_table.Character
import core_table.entities
import movement_sys
import threading
import client_sdl
import time
import json


#/* clear.c ... */

# /*
#  * This example code creates an SDL window and renderer, and then clears the
#  * window to a different color every frame, so you'll effectively get a window
#  * that's smoothly fading between colors.
#  *
#  * This code is public domain. Feel free to use it for any purpose!
#  */

#define SDL_MAIN_USE_CALLBACKS 1  /* use the callbacks instead of main() */
#include <SDL3/SDL.h>
#include <SDL3/SDL_main.h>

# /* We will use this renderer to draw into this window every frame. */
# static SDL_Window *window = NULL;
# static SDL_Renderer *renderer = NULL;

# /* This function runs once at startup. */
texture = sdl3.SDL_Texture()
BASE_WIDTH = 1600
BASE_HEIGHT = 900




# png_path="resources/nude_woman.png".encode()
# #png_path="res/example.png".encode()
# surface = sdl3.IMG_Load(png_path)
# if surface == False:
#     sdl3.SDL_Log("Couldn't load bitmap: %s", sdl3.SDL_GetError())
#     print('error')
    
# sdl3.SDL_GetSurfaceClipRect(surface, ctypes.byref(rect))
# sdl3.SDL_RectToFRect(ctypes.byref(rect), ctypes.byref(frect))
# print(frect.w)
# texture = sdl3.SDL_CreateTextureFromSurface(renderer, surface)
# if texture == False:
#     sdl3.SDL_Log("Couldn't create static texture: %s", sdl3.SDL_GetError())
    

def SDL_AppInit_func():
    
    window = sdl3.SDL_CreateWindow("examp wind".encode(), BASE_WIDTH, BASE_HEIGHT, sdl3.SDL_WINDOW_RESIZABLE)
    renderDrivers = [sdl3.SDL_GetRenderDriver(i).decode() for i in range(sdl3.SDL_GetNumRenderDrivers())]
    tryGetDriver, tryUseVulkan = lambda order, drivers: next((i for i in order if i in drivers), None), False
    renderDriver = tryGetDriver((["vulkan"] if tryUseVulkan else []) + ["opengl", "software"], renderDrivers)
    if not (renderer := sdl3.SDL_CreateRenderer(window, renderDriver.encode())):
            print(f"Failed to create renderer: {sdl3.SDL_GetError().decode()}.")
           
    #renderer = sdl3.SDL_CreateRenderer(window, "examp_rend".encode())
    # test for futures
    test_spell = core_table.entities.Spell(name="test", description="test", level=1, sprite="resources/magic_projectile.gif".encode())
    test_context = context.Context(renderer, window,base_width = BASE_WIDTH, base_height = BASE_HEIGHT)
    print('1') 
    test_table = test_context.add_table("test_table", BASE_WIDTH, BASE_HEIGHT)
    test_character = core_table.Character.Character(name="test_name",race='test_race',char_class=None,hp=10,level=1,stats=None)
    test_character.add_spell(test_spell)
    
    test_context.add_sprite("resources/map.jpg".encode(),scale_x = 0.5,scale_y= 0.5)
    test_context.add_sprite("resources/woman.png".encode(),scale_x = 0.5,scale_y= 0.5, character=test_character)
    test_context.add_sprite("resources/token_1.png".encode(),scale_x = 0.5,scale_y= 0.5,collidable=True)
    test_context.add_sprite("resources/test.gif".encode(),scale_x = 0.5,scale_y= 0.5)
    # Initialize network client and start connection in a separate thread
    def init_net_thread():
        socket = client_sdl.init_connection()
        test_context.net_socket = socket        
    net_thread = threading.Thread(target=init_net_thread, daemon=True)
    net_thread.start()
    test_context.net_client_started = True
    print("init_success")
    return test_context

 
def SDL_AppEvent(event):
    if event.type == sdl3.SDL_EVENT_QUIT:
        return sdl3.SDL_APP_SUCCESS
    return sdl3.SDL_APP_CONTINUE


def SDL_AppIterate(context):
    # /* This function runs every frame. */
    renderer = context.renderer
    now = sdl3.SDL_GetTicks() 
    delta_time= now - context.last_time
    context.last_time = now
    # red=0.5 + 0.5 * sdl3.SDL_sin(now )
    # green= 0.5 + 0.5 * sdl3.SDL_sin(now + sdl3.SDL_PI_D * 2 / 3)
    # blue=0.5 + 0.5 * sdl3.SDL_sin(now + sdl3.SDL_PI_D * 4 / 3)
 
    # now=ctypes.c_double(SDL_GetTicks() / 1000.0 ) = 
    # Start the network client in a new thread if not already started
    
    # Send status update to server (example: player position, hp, etc.)
    # if hasattr(context, "net_client"):
    #     status = {
    #         "character": test_character.name,
    #         "hp": test_character.hp,
    #         "position": getattr(test_context.selected, "frect", None)
    #     }
    #     context.net_client.send_status(status)

    # # Optionally, process received data from server
    # if hasattr(context, "net_client"):
    #     while context.net_client.has_data():
    #         server_data = context.net_client.get_data()
    #         # Handle server data (update game state, etc.)
    sdl3.SDL_SetRenderDrawColorFloat(renderer, 0, 0, 0, sdl3.SDL_ALPHA_OPAQUE_FLOAT);

    # /* clear the window to the draw color. */
    sdl3.SDL_RenderClear(renderer)
    # /* put the newly-cleared rendering on the screen. */
    
    sdl3.SDL_GetWindowSize(context.window, context.window_width, context.window_height)

    # context.step.value= max(frect.w,frect.h)
    movement_sys.move_sprites(context,delta_time)
    movement_sys.test_margin(context) 
    
    # if i<5:
    #     print(ctypes.byref(test_context.selected.frect))
    # frect= test_context.selected.frect
    sdl3.SDL_RenderPresent(context.renderer)
    #print(red,green,blue)
    if not context.queue_to_read.empty():
        data = context.queue_to_read.get()
        handle_information(data,context)
        #print("queue size",context.queue_to_read
    return sdl3.SDL_APP_CONTINUE 

def handle_information(msg,context):
    #TODO ugly, need to be fixed. possibly use a dict to map the message to the function
    #TODO add a check for the type of message
    
    if context.waiting_for_table:
        #TODO
        context.waiting_for_table = False
        msg = json.loads(msg)
        table = context.create_table_from_json(msg)
        context.list_of_tables.append(table)
        context.current_table = table
        print("table created and changed")
    print(msg)
    if msg == "INITIALIZE_TABLE":
        context.waiting_for_table = True

    if msg == "hello":
        event_sys.handle_key_event(context, sdl3.SDL_SCANCODE_SPACE)

def net_thread(context):
    ''' This function runs in a separate thread to handle network communication. '''
    print('net_thread started')
    while not context.net_socket:
        time.sleep(0.01)
    socket = context.net_socket
    print("net_thread socket obtained")
    while True:
       

        # Write from queue_to_write to socket
        try:
            while not context.queue_to_send.empty():
                out_data = context.queue_to_send.get_nowait()
                client_sdl.send_data(socket, out_data)
        except Exception as e:
            print("Error sending data:", e)
        # Read from socket and put into queue_to_read
        try:
            data = client_sdl.receive_data(socket)
            if data:
                context.queue_to_read.put(data)
                print("Received data:", data)
        except Exception as e:
            print("Error receiving data:", e)
        time.sleep(0.05)
    
def main():
    # /* This function runs once at startup. */
    # Try to initialize SDL, make window, renderer and connection to server 
    try:
        context = SDL_AppInit_func()
    except Exception as e:
        print(f"Error initializing SDL: {e}")
        sdl3.SDL_Quit()
        sys.exit(1)
    # Create  thread for the network
    if context.net_client_started:
        print('try to start net client')
        t = threading.Thread(target=net_thread, args=(context,), daemon=True)
        t.start()
        

    running=True
    event = sdl3.SDL_Event()
    
    while running:
        while sdl3.SDL_PollEvent(ctypes.byref(event)):
            running = event_sys.handle_event(context,event)
        SDL_AppIterate(context)
        
    #quiting
    #sdl3.TTF_CloseFont(font)
    # sdl3.SDL_DestroySurface(surface)
    # sdl3.SDL_DestroyTexture(texture)
    sdl3.SDL_DestroyRenderer(context.renderer)
    sdl3.SDL_DestroyWindow(context.window)
    sdl3.SDL_Quit()


if __name__ == "__main__":
    main()