import ctypes
import io_sys
import sdl3

class Sprite:
    def __init__(self,renderer, texture_path, scale=1):
        self.coord_x = ctypes.c_float(0)
        self.coord_y = ctypes.c_float(0)
        self.rect = sdl3.SDL_Rect()
        self.frect = sdl3.SDL_FRect()
        self.texture_path=texture_path
        self.renderer = renderer
        io_sys.load_texture(self)
        self.scale=scale