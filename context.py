import ctypes
import sprite

class Context:
    def __init__(self,renderer, window):
        self.step = ctypes.c_float(1)
        self.sprites_list=[]
        self.selected = None
        self.window= window
        self.renderer = renderer
    def add_sprite(self, texture_path,scale):
        self.sprites_list.append(sprite.Sprite(self.renderer,texture_path,scale))
        if self.selected == None:
            self.selected = self.sprites_list[0]
