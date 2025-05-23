import ctypes
import logging
import io_sys
import sdl3

logger = logging.getLogger(__name__)

class Sprite:
    def __init__(self, renderer, texture_path, scale_x=1, scale_y=1,
                 character=None, moving=False, speed=None, collidable=False,
                 texture=None, layer='tokens'):
        self.coord_x = ctypes.c_float(0)
        self.coord_y = ctypes.c_float(0)
        self.rect = sdl3.SDL_Rect()
        self.frect = sdl3.SDL_FRect()
        self.texture_path = texture_path
        self.renderer = renderer
        self.set_texture(texture_path)
        self.scale_x = scale_x
        self.scale_y = scale_y
        self.character = character
        self.moving = moving
        self.speed = speed
        self.die_timer = None
        self.collidable = collidable
        self.layer = layer

    def __repr__(self):
        return (f"Sprite(coord_x={self.coord_x}, coord_y={self.coord_y}, rect={self.rect}, "
                f"frect={self.frect}, texture_path={self.texture_path}, scale_x={self.scale_x}, scale_y={self.scale_y})")

    def __str__(self):
        return (f"Sprite at ({self.coord_x.value}, {self.coord_y.value}) "
                f"with texture {self.texture_path} and scale {self.scale_x} {self.scale_y}")

    def set_speed(self, dx, dy):
        self.dx = dx
        self.dy = dy

    def move(self, delta_time):
        if self.moving:
            self.coord_x.value += self.dx * delta_time
            self.coord_y.value += self.dy * delta_time

    def set_die_timer(self, time):
        self.die_timer = time

    def set_texture(self, texture_path):
        self.texture_path = texture_path
        logger.info("Setting texture path: %s", texture_path)
        self.texture = io_sys.load_texture(self)

    def set_position(self, x, y):
        #TODO: fix logic for setting frect
        self.coord_x.value = x
        self.coord_y.value = y
        self.set_frect()

    def set_frect(self):
        #TODO: fix logic for setting frect
        self.frect.x = self.coord_x
        self.frect.y = self.coord_y
        self.frect.w = int(self.frect.w * self.scale_x)
        self.frect.h = int(self.frect.h * self.scale_y)
        #sdl3.SDL_RectToFRect(ctypes.byref(self.rect), ctypes.byref(self.frect))

    def set_rect(self):
        self.rect.x = int(self.coord_x)
        self.rect.y = int(self.coord_y)
        self.rect.w = int(self.frect.w * self.scale_x)
        self.rect.h = int(self.frect.h * self.scale_y)
    def set_original_size(self):
        self.original_w = self.frect.w
        self.original_h = self.frect.h
    def die(self):
        self.texture = None
        self.moving = False
        sdl3.SDL_DestroyTexture(self.texture)