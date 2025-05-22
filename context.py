import ctypes
import sprite
import queue

class Context:
    def __init__(self,renderer, window,base_width, base_height):
        self.step = ctypes.c_float(1)
        self.sprites_list=[]
        self.selected = None
        self.window= window
        self.renderer = renderer
        self.resizing = False
        self.grabing= False
        self.mouse_state = None
        self.cursor = None
        self.base_width = base_width
        self.base_height = base_height
        self.last_time = 0
        self.current_time = 0
        self.window_width, self.window_height = ctypes.c_int(), ctypes.c_int()
        self.net_client_started = False
        self.net_socket = None
        self.queue_to_send = queue.Queue(1000)
        self.queue_to_read = queue.Queue(1000)
    def add_sprite(self, texture_path,scale_x,scale_y,character=None, moving=False,speed=None,collidable=False):
        self.sprites_list.append(sprite.Sprite(self.renderer,texture_path,scale_x=scale_x,scale_y=scale_y,character=character,moving=moving,speed=speed,collidable=collidable))
        if self.selected == None:
            self.selected = self.sprites_list[0]
        return self.sprites_list[-1]
