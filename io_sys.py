import sdl3
import ctypes

def load_texture(sprite):
    surface = sdl3.IMG_Load(sprite.texture_path)
    print(sprite.texture_path)
    try:
        if surface.contents == False:
            sdl3.SDL_Log("Couldn't load bitmap: %s", sdl3.SDL_GetError())
            print('error')
    except ValueError:
        print('error %s',ValueError)
    sdl3.SDL_GetSurfaceClipRect(surface, ctypes.byref(sprite.rect))
    sdl3.SDL_RectToFRect(ctypes.byref(sprite.rect), ctypes.byref(sprite.frect))
    print(sprite.frect.w)
    texture = sdl3.SDL_CreateTextureFromSurface(sprite.renderer, surface)
    sprite.set_original_size()
    sdl3.SDL_DestroySurface(surface)
    return texture
   