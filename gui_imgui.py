import imgui
import sdl3
import ctypes
from imgui_sdl3 import SDL3ImGuiRenderer  # <-- Add this import

class ImGuiSystem:
    def __init__(self, context, renderer, width, height):
        self.context = context
        self.renderer = renderer
        self.width = width
        self.height = height
        self.selected_table = 0
        self.selected_layer = 0
        self.chat_log = []
        self.chat_input = ""
        self.active_instrument = "Select"
        self.show_character = True
        self.imgui_renderer = SDL3ImGuiRenderer(context.window, renderer)  # <-- Pass renderer

    def render(self):
        self.imgui_renderer.new_frame()

        # Simple test window first
        imgui.begin("Test Window")
        imgui.text("Hello ImGui!")
        imgui.button("Test Button")
        imgui.end()

        imgui.render()
        
        # Actually render the draw data
        draw_data = imgui.get_draw_data()
        if draw_data:
            self.imgui_renderer.render_draw_data(draw_data)

    def process_event(self, event):
        self.imgui_renderer.process_event(event)

def init_gui_imgui_system(context, renderer, width, height):
    imgui.create_context()
    io = imgui.get_io()
    io.fonts.get_tex_data_as_rgba32()
    return ImGuiSystem(context, renderer, width, height)