from imgui_bundle import imgui
from imgui_bundle.python_backends.sdl3_backend import SDL3Renderer
import OpenGL.GL as gl
import sdl3
import ctypes
import logging
import sys


logger = logging.getLogger(__name__)

class ImGuiSystem:
    """Main ImGui system with simplified SDL3 integration"""
    
    def __init__(self, window, gl_context, sdl_context):
        """Initialize the ImGui system"""
        self.window = window
        self.gl_context = gl_context
        self.sdl_context = sdl_context
        self.impl = None
        self.io = None
        
        try:
            # Create ImGui context
            imgui.create_context()
            self.io = imgui.get_io()
            
            # Create SDL3 renderer backend (this handles font atlas internally)
            self.impl = SDL3Renderer(window)
            
            self.app_state = AppState()
            self.show_custom_window = True
            
            logger.info("ImGui system initialized successfully")
            
        except Exception as e:
            logger.error(f"ImGui init failed: {e}")
            # Clean up any partial initialization
            try:
                if self.impl:
                    self.impl.shutdown()
            except:
                pass
            self.impl = None
            self.io = None
            raise e

    def process_event(self, event):
        """Process SDL events for ImGui - fix the logic"""
        if not self.impl:
            return False
        
        try:
            # Let ImGui process the event and return what IT consumed
            imgui_consumed = self.impl.process_event(event)
            
            # Debug info (you can remove this later)
            wants_mouse = self.io.want_capture_mouse
            wants_keyboard = self.io.want_capture_keyboard
            #print(f"Event: {event.type}, ImGui consumed: {imgui_consumed}, wants_mouse: {wants_mouse}, wants_keyboard: {wants_keyboard}")
            
            # Only return what ImGui actually consumed for THIS event
            return wants_mouse and imgui_consumed
            
        except Exception as e:
            logger.error(f"ImGui process_event error: {e}")
            return False

    def iterate(self):
        """Run the ImGui frame"""
        if not self.impl or not self.io:
            return
            
        try:
            # Process inputs
            self.impl.process_inputs()
            
            # Start new frame
            imgui.new_frame()
            
            # Show demo window
            imgui.show_demo_window()
            
            # Main menu bar
            if imgui.begin_main_menu_bar():
                if imgui.begin_menu("File", True):
                    clicked_quit, selected_quit = imgui.menu_item(
                        "Quit", "Cmd+Q", False, True
                    )
                    if clicked_quit:
                        sys.exit(0)
                    imgui.end_menu()
                imgui.end_main_menu_bar()

            # Custom window
            if self.show_custom_window:
                imgui.set_next_window_size((400, 400))
                is_expand, self.show_custom_window = imgui.begin("Custom window", True)
                if is_expand:
                    imgui.text("Example Text")
                    if imgui.button("Hello"):
                        print("World")
                    _, self.app_state.text = imgui.input_text_multiline(
                        "Edit", self.app_state.text, imgui.ImVec2(200, 200)
                    )
                    _, self.app_state.text2 = imgui.input_text("Text2", self.app_state.text2)
                imgui.end()
            
            # Render
            imgui.render()
            
            # Enable blending
            gl.glEnable(gl.GL_BLEND)
            gl.glBlendFunc(gl.GL_SRC_ALPHA, gl.GL_ONE_MINUS_SRC_ALPHA)
            
            # Render ImGui
            self.impl.render(imgui.get_draw_data())
            
        except Exception as e:
            logger.error(f"ImGui iterate error: {e}")
            try:
                imgui.end_frame()
            except:
                pass

class AppState:
    text: str = """Hello, World\nLorem ipsum, etc.\netc."""
    text2: str = "Ahh"