# Fix menu.py - ensure proper ImGui begin/end pairing
import logging
import sys
import subprocess
import os
import sdl3
import ctypes
from imgui_bundle import imgui
from imgui_bundle.python_backends.sdl3_backend import SDL3Renderer
import OpenGL.GL as gl

logger = logging.getLogger(__name__)

class MenuApp:
    def __init__(self):
        self.window = None
        self.gl_context = None
        self.imgui_renderer = None
        self.selected_mode = "player"
        self.server_ip = "127.0.0.1"
        self.server_port = "12345"
        self.show_settings = False
        
    def init_sdl(self):
        if not sdl3.SDL_Init(sdl3.SDL_INIT_VIDEO):
            return False
        
        # Set OpenGL attributes
        sdl3.SDL_GL_SetAttribute(sdl3.SDL_GL_CONTEXT_MAJOR_VERSION, 4)
        sdl3.SDL_GL_SetAttribute(sdl3.SDL_GL_CONTEXT_MINOR_VERSION, 1)
        sdl3.SDL_GL_SetAttribute(sdl3.SDL_GL_CONTEXT_PROFILE_MASK, sdl3.SDL_GL_CONTEXT_PROFILE_CORE)
        sdl3.SDL_GL_SetAttribute(sdl3.SDL_GL_DOUBLEBUFFER, 1)
        
        self.window = sdl3.SDL_CreateWindow(
            "TTRPG Menu".encode(), 400, 300,
            sdl3.SDL_WINDOW_OPENGL | sdl3.SDL_WINDOW_RESIZABLE
        )
        
        if not self.window:
            return False
            
        self.gl_context = sdl3.SDL_GL_CreateContext(self.window)
        sdl3.SDL_GL_SetSwapInterval(1)
        return True
        
    def init_imgui(self):
        try:
            imgui.create_context()
            imgui.style_colors_dark()
            self.imgui_renderer = SDL3Renderer(self.window)
            return True
        except Exception as e:
            logger.error(f"ImGui init failed: {e}")
            return False
    
    def render_menu(self):
        should_continue = True
        
        # Center main window
        viewport = imgui.get_main_viewport()
        imgui.set_next_window_pos((viewport.work_size.x * 0.5, viewport.work_size.y * 0.5), 
                                 imgui.Cond_.always, (0.5, 0.5))
        imgui.set_next_window_size((300, 250), imgui.Cond_.always)
        
        flags = (imgui.WindowFlags_.no_resize | imgui.WindowFlags_.no_collapse | 
                imgui.WindowFlags_.no_move)
        
        # Always call begin/end pair
        imgui.begin("TTRPG System", None, flags)
        
        # Mode selection
        imgui.text("Mode:")
        if imgui.radio_button("Player", self.selected_mode == "player"):
            self.selected_mode = "player"
        imgui.same_line()
        if imgui.radio_button("Master", self.selected_mode == "Master"):
            self.selected_mode = "Master"
        
        imgui.separator()
        
        # Buttons with ASCII icons
        if imgui.button("[C] Connect to Table", (-1, 35)):
            self._launch_main()
            should_continue = False
            
        if imgui.button("[P] Character Manager", (-1, 35)):
            imgui.open_popup("Character Manager")
            
        if imgui.button("[S] Settings", (-1, 35)):
            self.show_settings = True
            
        if imgui.button("[X] Exit", (-1, 35)):
            should_continue = False
        
        imgui.end()  # Always call end
        
        # Settings window
        if self.show_settings:
            self._render_settings()
            
        # Character manager popup
        if imgui.begin_popup_modal("Character Manager")[0]:
            imgui.text("Character Manager")
            imgui.text("(Will be implemented in main game)")
            if imgui.button("Close"):
                imgui.close_current_popup()
            imgui.end_popup()
            
        return should_continue
    
    def _render_settings(self):
        imgui.set_next_window_size((300, 200), imgui.Cond_.first_use_ever)
        
        # Always call begin/end pair
        imgui.begin("Settings", None, imgui.WindowFlags_.no_collapse)
        
        imgui.text("Server IP:")
        _, self.server_ip = imgui.input_text("##ip", self.server_ip)
        
        imgui.text("Port:")
        _, self.server_port = imgui.input_text("##port", self.server_port)
        
        if imgui.button("Save & Close"):
            self.show_settings = False
        imgui.same_line()
        if imgui.button("Cancel"):
            self.show_settings = False
            
        imgui.end()  # Always call end
    
    def _launch_main(self):
        try:
            cmd = [sys.executable, "main.py", "--mode", self.selected_mode]
            if self.selected_mode == "player":
                cmd.extend(["--server", self.server_ip, "--port", self.server_port])
            
            subprocess.Popen(cmd)
            logger.info(f"Launched main.py: {' '.join(cmd)}")
        except Exception as e:
            logger.error(f"Failed to launch: {e}")
    
    def run(self):
        if not self.init_sdl() or not self.init_imgui():
            return
            
        running = True
        event = sdl3.SDL_Event()
        
        while running:
            while sdl3.SDL_PollEvent(ctypes.byref(event)):
                self.imgui_renderer.process_event(event)
                if event.type == sdl3.SDL_EVENT_QUIT:
                    running = False
            
            self.imgui_renderer.process_inputs()
            imgui.new_frame()
            
            if not self.render_menu():
                running = False
            
            gl.glClearColor(0.1, 0.1, 0.1, 1.0)
            gl.glClear(gl.GL_COLOR_BUFFER_BIT)
            
            imgui.render()
            self.imgui_renderer.render(imgui.get_draw_data())
            sdl3.SDL_GL_SwapWindow(self.window)
        
        # Cleanup
        if self.imgui_renderer:
            self.imgui_renderer.shutdown()
        imgui.destroy_context()
        if self.gl_context:
            sdl3.SDL_GL_DestroyContext(self.gl_context)
        if self.window:
            sdl3.SDL_DestroyWindow(self.window)
        sdl3.SDL_Quit()

def main():
    logging.basicConfig(level=logging.INFO)
    MenuApp().run()

if __name__ == "__main__":
    main()