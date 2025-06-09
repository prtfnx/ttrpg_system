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
        
        # Authentication state
        self.show_auth_menu = False
        self.show_session_menu = False
        self.username = ""
        self.password = ""
        self.session_code = ""
        self.server_url = "http://localhost:8000"
        self.connection_type = "websocket"  # Default to websocket for new auth flow        self.jwt_token = ""
        self.is_authenticated = False
        self.auth_error = ""
        self.auth_success = ""
        self.available_sessions = []
        
    def init_sdl(self):
        if not sdl3.SDL_Init(sdl3.SDL_INIT_VIDEO):
            return False
        
        # Set OpenGL attributes
        sdl3.SDL_GL_SetAttribute(sdl3.SDL_GL_CONTEXT_MAJOR_VERSION, 4)
        sdl3.SDL_GL_SetAttribute(sdl3.SDL_GL_CONTEXT_MINOR_VERSION, 1)
        sdl3.SDL_GL_SetAttribute(sdl3.SDL_GL_CONTEXT_PROFILE_MASK, sdl3.SDL_GL_CONTEXT_PROFILE_CORE)
        sdl3.SDL_GL_SetAttribute(sdl3.SDL_GL_DOUBLEBUFFER, 1)
        self.window = sdl3.SDL_CreateWindow(
            "TTRPG Menu".encode(), 500, 600,
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
        imgui.set_next_window_size((350, 400), imgui.Cond_.always)
        
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
        if imgui.button("[A] Authenticate & Connect", (-1, 35)):
            self.show_auth_menu = True
            
        if imgui.button("[C] Connect to Table (Legacy)", (-1, 35)):
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
            
        # Authentication window
        if self.show_auth_menu:
            self._render_auth_menu()
            
        # Session selection window
        if self.show_session_menu:
            self._render_session_menu()
            
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
        
    def _render_auth_menu(self):
        """Render authentication menu"""
        imgui.set_next_window_size((450, 400), imgui.Cond_.first_use_ever)
        
        imgui.begin("Authentication", None, imgui.WindowFlags_.no_collapse)
        
        imgui.text("Server Connection")
        imgui.separator()
        
        # Server URL
        imgui.text("Server URL:")
        _, self.server_url = imgui.input_text("##server_url", self.server_url)
        
        # Connection type
        imgui.text("Connection Type:")
        if imgui.radio_button("WebSocket", self.connection_type == "websocket"):
            self.connection_type = "websocket"
        imgui.same_line()
        if imgui.radio_button("Webhook", self.connection_type == "webhook"):
            self.connection_type = "webhook"
        
        imgui.separator()
        imgui.text("Authentication")
        
        # Username and password
        imgui.text("Username:")
        _, self.username = imgui.input_text("##username", self.username)
        
        imgui.text("Password:")
        _, self.password = imgui.input_text("##password", self.password, imgui.InputTextFlags_.password)
          # Error/Success messages
        if self.auth_error:
            imgui.text_colored((1.0, 0.2, 0.2, 1.0), f"Error: {self.auth_error}")
        
        if self.auth_success:
            imgui.text_colored((0.2, 1.0, 0.2, 1.0), f"✓ {self.auth_success}")
          # Authentication status
        if self.is_authenticated:
            imgui.text_colored((0.2, 1.0, 0.2, 1.0), f"✓ Authenticated as {self.username}")
            
            imgui.separator()
              # Available sessions dropdown
            if self.available_sessions:
                imgui.text("Available Sessions:")
                session_names = [f"{session.get('name', 'Unnamed')} ({session.get('session_code', '')})" 
                               for session in self.available_sessions]
                current_selection = session_names[0] if session_names else "No sessions"
                
                if imgui.begin_combo("##sessions_combo", current_selection):
                    for i, session_name in enumerate(session_names):
                        is_selected = False
                        if imgui.selectable(session_name, is_selected)[0]:
                            self.session_code = self.available_sessions[i].get('session_code', '')
                    imgui.end_combo()
                
                imgui.same_line()
                if imgui.button("Refresh", (80, 0)):
                    self._fetch_user_sessions()
            
            imgui.text("Or enter Session Code manually:")
            _, self.session_code = imgui.input_text("##session_code", self.session_code)
            
            if imgui.button("Connect to Session", (-1, 30)):
                if self.session_code.strip():
                    self._launch_authenticated_game()
                    self.show_auth_menu = False
                else:
                    self.auth_error = "Please enter a session code"
        
        imgui.separator()
        
        # Action buttons
        if not self.is_authenticated:
            if imgui.button("Register", (120, 30)):
                self._register_user()
            imgui.same_line()
            if imgui.button("Login", (120, 30)):
                self._login_user()
        else:
            if imgui.button("Logout", (120, 30)):
                self._logout_user()
        
        imgui.same_line()
        if imgui.button("Cancel", (120, 30)):
            self.show_auth_menu = False
            self.auth_error = ""
            
        imgui.end()
    
    def _render_session_menu(self):
        """Render session selection menu"""
        imgui.set_next_window_size((300, 200), imgui.Cond_.first_use_ever)
        
        imgui.begin("Session Selection", None, imgui.WindowFlags_.no_collapse)
        
        imgui.text("Enter Session Code:")
        _, self.session_code = imgui.input_text("##session_code", self.session_code)
        
        if imgui.button("Connect", (-1, 30)):
            if self.session_code.strip():
                self._launch_authenticated_game()
                self.show_session_menu = False
            else:
                self.auth_error = "Please enter a session code"
        if imgui.button("Cancel", (-1, 30)):
            self.show_session_menu = False
            
        imgui.end()

    def _register_user(self):
        """Register a new user"""
        try:
            import requests
            response = requests.post(
                f"{self.server_url}/users/register",
                data={
                    "username": self.username,
                    "password": self.password
                },
                timeout=10
            )
            
            if response.status_code == 200:
                self.auth_success = "Registration successful! Please login."
                self.auth_error = ""
            else:
                self.auth_error = f"Registration failed: {response.text}"
                self.auth_success = ""
                
        except Exception as e:
            self.auth_error = f"Connection error: {str(e)}"
            self.auth_success = ""

    def _login_user(self):
        """Login user and get JWT token"""
        try:
            import requests
            response = requests.post(
                f"{self.server_url}/users/token",
                data={
                    "username": self.username,
                    "password": self.password
                },
                headers={"Content-Type": "application/x-www-form-urlencoded"},
                timeout=10
            )
            
            if response.status_code == 200:
                data = response.json()
                self.jwt_token = data.get("access_token", "")
                self.is_authenticated = True
                self.auth_error = ""
                self.auth_success = ""
                self._fetch_user_sessions()  # Fetch available sessions
                logger.info(f"Successfully authenticated as {self.username}")
            else:
                self.auth_error = f"Login failed: {response.text}"
                self.auth_success = ""
                
        except Exception as e:
            self.auth_error = f"Connection error: {str(e)}"
            self.auth_success = ""
    def _logout_user(self):
        """Logout user"""
        self.jwt_token = ""
        self.is_authenticated = False
        self.username = ""
        self.password = ""
        self.session_code = ""
        self.auth_error = ""
        self.auth_success = ""
        self.available_sessions = []
        logger.info("User logged out")
        
    def _fetch_user_sessions(self):
        """Fetch user's available game sessions"""
        try:
            import requests
            response = requests.get(
                f"{self.server_url}/game/api/sessions",
                headers={"Authorization": f"Bearer {self.jwt_token}"},
                timeout=10
            )
            
            if response.status_code == 200:
                self.available_sessions = response.json()
                logger.info(f"Fetched {len(self.available_sessions)} sessions")
            else:
                logger.error(f"Failed to fetch sessions: {response.text}")
                self.available_sessions = []
                
        except Exception as e:
            logger.error(f"Error fetching sessions: {str(e)}")
            self.available_sessions = []
    
    def _launch_authenticated_game(self):
        """Launch main.py with authentication parameters"""
        try:
            cmd = [sys.executable, "main.py", "--mode", self.selected_mode]
            
            if self.connection_type == "websocket":
                cmd.extend([
                    "--connection", "websocket",
                    "--server-url", self.server_url,
                    "--session-code", self.session_code,
                    "--jwt-token", self.jwt_token,
                    "--username", self.username
                ])
            elif self.connection_type == "webhook":
                cmd.extend([
                    "--connection", "webhook",
                    "--server-url", self.server_url,
                    "--username", self.username
                ])
            
            subprocess.Popen(cmd)
            logger.info(f"Launched authenticated game: {' '.join(cmd[:6])}...")  # Don't log tokens
        except Exception as e:
            logger.error(f"Failed to launch authenticated game: {e}")
            self.auth_error = f"Failed to launch: {str(e)}"

def main():
    logging.basicConfig(level=logging.INFO)
    MenuApp().run()

if __name__ == "__main__":
    main()