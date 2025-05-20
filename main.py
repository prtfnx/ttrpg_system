import sys
import sdl3
import ctypes
import colorsys
import event_sys
import context
import sprite


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




window = sdl3.SDL_CreateWindow("examp wind".encode(), 1600, 900, sdl3.SDL_WINDOW_RESIZABLE)
renderDrivers = [sdl3.SDL_GetRenderDriver(i).decode() for i in range(sdl3.SDL_GetNumRenderDrivers())]
tryGetDriver, tryUseVulkan = lambda order, drivers: next((i for i in order if i in drivers), None), False
renderDriver = tryGetDriver((["vulkan"] if tryUseVulkan else []) + ["opengl", "software"], renderDrivers)
if not (renderer := sdl3.SDL_CreateRenderer(window, renderDriver.encode())):
        print(f"Failed to create renderer: {sdl3.SDL_GetError().decode()}.")
        
#renderer = sdl3.SDL_CreateRenderer(window, "examp_rend".encode())
SDL_MAIN_USE_CALLBACKS = 1

test_context = context.Context(renderer, window)
test_context.add_sprite("resources/map.jpg".encode(),scale = 0.5)
test_context.add_sprite("resources/nude_woman.png".encode(),scale = 0.05)
test_context.add_sprite("resources/token_1.png".encode(),scale = 0.05)

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
    
    sdl3.SDL_SetAppMetadata('Example Renderer Clear'.encode('utf-8'), 
    '1.0'.encode('utf-8'), 'com.example.renderer-clear'.encode('utf-8'))
    
    if sdl3.SDL_Init(sdl3.SDL_INIT_VIDEO) == False:
        sdl3.SDL_log('Couldnt initialize SDL: %s', sdl3.SDL_GetError())
        return sdl3.SDL_APP_FAILURE

    if sdl3.SDL_CreateWindowAndRenderer('examples/renderer/clear'.encode('utf-8'), 640, 480, 0,window, renderer) == False:
        sdl3.SDL_log('Couldnt create window/renderer: %s', sdl3.SDL_GetError())
        return sdl3.SDL_APP_FAILURE
    png_path="resource/nude_woman.png".encode()
    #surface = sdl3.IMG_Load(png_path)
    surface = sdl3.IMG_Load("res/example.png".encode())
    if surface == False:
        sdl3.SDL_Log("Couldn't load bitmap: %s", sdl3.SDL_GetError())
        return sdl3.SDL_APP_FAILURE
    
    sdl3.SDL_free(png_path);  
    print(surface)
    print(surface.w)
    texture = sdl3.SDL_CreateTextureFromSurface(renderer, surface)
    if texture == False:
        sdl3.SDL_Log("Couldn't create static texture: %s", sdl3.SDL_GetError())
        return sdl3.SDL_APP_FAILURE
    
    
    sdl3.SDL_DestroySurface(surface)
    print('xxx')

    return sdl3.SDL_APP_CONTINUE

def SDL_AppEvent(event):
    if event.type == sdl3.SDL_EVENT_QUIT:
        return sdl3.SDL_APP_SUCCESS
    return sdl3.SDL_APP_CONTINUE



def SDL_AppIterate(context,i):
    
    
    now = sdl3.SDL_GetTicks() / 1000.0
    # red=0.5 + 0.5 * sdl3.SDL_sin(now )
    # green= 0.5 + 0.5 * sdl3.SDL_sin(now + sdl3.SDL_PI_D * 2 / 3)
    # blue=0.5 + 0.5 * sdl3.SDL_sin(now + sdl3.SDL_PI_D * 4 / 3)
 
    # now=ctypes.c_double(SDL_GetTicks() / 1000.0 ) = 
    sdl3.SDL_SetRenderDrawColorFloat(renderer, 0, 0, 0, sdl3.SDL_ALPHA_OPAQUE_FLOAT);  

    # /* clear the window to the draw color. */
    sdl3.SDL_RenderClear(renderer)
    # /* put the newly-cleared rendering on the screen. */
    width, height = ctypes.c_int(), ctypes.c_int()
    sdl3.SDL_GetWindowSize(window, width, height)
    scale=0.05
   
    cnt=test_context
    # context.step.value= max(frect.w,frect.h)
    for sprite in cnt.sprites_list:
        frect=sprite.frect
        frect.x = sprite.coord_x
        frect.y = sprite.coord_y
        try:
            frect.w = frect.w * width.value / frect.w * sprite.scale
            frect.h = frect.h * height.value / frect.h * sprite.scale
        except ZeroDivisionError:
             print('error zero division')
        cnt.step.value= max(frect.w, frect.h)
        sdl3.SDL_RenderTexture( cnt.renderer, sprite.texture, None, ctypes.byref(sprite.frect))
    #color selected
    sprite= cnt.selected
    
    
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
    sdl3.SDL_SetRenderDrawColor(cnt.renderer, 0, 255, 0, sdl3.SDL_ALPHA_OPAQUE)  
    sdl3.SDL_RenderRect(cnt.renderer, ctypes.byref(rec1))
    sdl3.SDL_RenderRect(cnt.renderer, ctypes.byref(rec2))
    sdl3.SDL_RenderRect(cnt.renderer, ctypes.byref(rec3))
    sdl3.SDL_RenderRect(cnt.renderer, ctypes.byref(rec4))
    sdl3.SDL_RenderRect(cnt.renderer, ctypes.byref(cnt.selected.frect))

    # if i<5:
    #     print(ctypes.byref(test_context.selected.frect))
         
     # frect= test_context.selected.frect
       
    sdl3.SDL_RenderPresent(test_context.renderer)
    #print(red,green,blue)
    
    return sdl3.SDL_APP_CONTINUE;  

SDL_AppInit_func
running=True
event = sdl3.SDL_Event()
i=1
while running:
        while sdl3.SDL_PollEvent(ctypes.byref(event)):
            running = event_sys.handle_event(test_context,event)

        SDL_AppIterate(test_context,i)
        i=i+1
#quiting
#sdl3.TTF_CloseFont(font)
sdl3.TTF_Quit()

# sdl3.SDL_DestroySurface(surface)
# sdl3.SDL_DestroyTexture(texture)

sdl3.SDL_DestroyRenderer(renderer)
sdl3.SDL_DestroyWindow(window)
sdl3.SDL_Quit()

