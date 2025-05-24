import imgui
import sdl3
import ctypes
import struct

class SDL3ImGuiRenderer:
    def __init__(self, window, renderer):
        self.window = window
        self.renderer = renderer
        self.io = imgui.get_io()
        self._map_keys()
        self._set_clipboard()
        self._setup_render_state()

    def _map_keys(self):
        # Temporarily disable key mapping to get ImGui working
        pass

    def _set_clipboard(self):
        io = self.io
        io.set_clipboard_text_fn = lambda text: sdl3.SDL_SetClipboardText(text.encode('utf-8'))
        io.get_clipboard_text_fn = lambda: sdl3.SDL_GetClipboardText().decode('utf-8')

    def _setup_render_state(self):
        # Create font texture
        io = self.io
        width, height, pixels = io.fonts.get_tex_data_as_rgba32()
        
        # Create SDL texture from font data
        self.font_texture = sdl3.SDL_CreateTexture(
            self.renderer,
            sdl3.SDL_PIXELFORMAT_RGBA32,
            sdl3.SDL_TEXTUREACCESS_STATIC,
            width, height
        )
        
        # Upload font texture data
        pixels_data = ctypes.cast(pixels, ctypes.POINTER(ctypes.c_ubyte * (width * height * 4))).contents
        sdl3.SDL_UpdateTexture(self.font_texture, None, pixels_data, width * 4)
        sdl3.SDL_SetTextureBlendMode(self.font_texture, sdl3.SDL_BLENDMODE_BLEND)
        
        # Remove this line:
        # io.fonts.tex_id = self.font_texture

    def process_event(self, event):
        io = self.io
        if event.type == sdl3.SDL_EVENT_MOUSE_MOTION:
            io.mouse_pos = event.motion.x, event.motion.y
        elif event.type == sdl3.SDL_EVENT_MOUSE_BUTTON_DOWN:
            if event.button.button == sdl3.SDL_BUTTON_LEFT:
                io.mouse_down[0] = True
            if event.button.button == sdl3.SDL_BUTTON_RIGHT:
                io.mouse_down[1] = True
            if event.button.button == sdl3.SDL_BUTTON_MIDDLE:
                io.mouse_down[2] = True
        elif event.type == sdl3.SDL_EVENT_MOUSE_BUTTON_UP:
            if event.button.button == sdl3.SDL_BUTTON_LEFT:
                io.mouse_down[0] = False
            if event.button.button == sdl3.SDL_BUTTON_RIGHT:
                io.mouse_down[1] = False
            if event.button.button == sdl3.SDL_BUTTON_MIDDLE:
                io.mouse_down[2] = False
        elif event.type == sdl3.SDL_EVENT_MOUSE_WHEEL:
            io.mouse_wheel = event.wheel.y
        elif event.type == sdl3.SDL_EVENT_TEXT_INPUT:
            io.add_input_characters_utf8(event.text.text.decode('utf-8'))

    def new_frame(self):
        # Update display size
        w = ctypes.c_int()
        h = ctypes.c_int()
        sdl3.SDL_GetWindowSize(self.window, ctypes.byref(w), ctypes.byref(h))
        self.io.display_size = (float(w.value), float(h.value))
        imgui.new_frame()

    def render_draw_data(self, draw_data):
        # Simplified renderer - just draw colored rectangles for UI elements
        # This won't render text properly but will show UI layout
        
        fb_width = int(draw_data.display_size.x)
        fb_height = int(draw_data.display_size.y)
        
        if fb_width == 0 or fb_height == 0:
            return

        # Very simple approach - just draw the UI bounds
        for draw_list in draw_data.commands_lists:
            # Use 'commands' instead of 'cmd_buffer'
            for command in draw_list.commands:
                if hasattr(command, 'user_callback') and command.user_callback:
                    continue
                
                # Draw a simple colored rectangle for each UI element
                clip_rect = command.clip_rect
                
                # Set a visible color for UI elements
                sdl3.SDL_SetRenderDrawColorFloat(self.renderer, 0.2, 0.3, 0.8, 0.7)  # Blue
                
                # Draw rectangle outline
                rect = sdl3.SDL_FRect(
                    clip_rect.x, clip_rect.y,
                    clip_rect.z - clip_rect.x, clip_rect.w - clip_rect.y
                )
                sdl3.SDL_RenderRect(self.renderer, rect)