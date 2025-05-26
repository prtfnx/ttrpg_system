import imgui
import sdl3
import ctypes
import logging

logger = logging.getLogger(__name__)

class ImGuiSystem:
    """Main ImGui system with simplified SDL3 integration"""
    
    def __init__(self, context, renderer, width, height):
        self.context = context
        self.renderer = renderer
        self.io = imgui.get_io()
        
        # Setup display and basic config
        self._setup_display()
        self._init_sidebars()
        
        # Simple frame management
        self.frame_active = False
        
    def _setup_display(self):
        """Setup ImGui display configuration"""
        w, h = ctypes.c_int(), ctypes.c_int()
        sdl3.SDL_GetWindowSize(self.context.window, ctypes.byref(w), ctypes.byref(h))
        self.io.display_size = (float(w.value), float(h.value))
        self.io.delta_time = 1.0 / 60.0
        
        # Basic font setup
        try:
            self.io.fonts.get_tex_data_as_rgba32()
        except Exception as e:
            logger.warning(f"Font setup failed: {e}")
    
    def _init_sidebars(self):
        """Initialize sidebar data"""
        self.active_tool = "Select"
        self.tools = {"Select": "🔍", "Move": "↔️", "Paint": "🎨", "Erase": "🧹"}
        self.brush_size = 5
        self.paint_color = [1.0, 0.0, 0.0, 1.0]
        self.chat_messages = ["Welcome to TTRPG System! 🎲"]
        self.chat_input = ""
        self.selected_layer = "tokens"
        self.selected_character = None
        self.new_table_name = ""
        
        # Window flags
        self.sidebar_flags = (imgui.WINDOW_NO_TITLE_BAR | imgui.WINDOW_NO_MOVE | 
                             imgui.WINDOW_NO_RESIZE | imgui.WINDOW_NO_COLLAPSE)
    
    def process_event(self, event):
        """Process SDL events for ImGui"""
        try:
            if event.type == sdl3.SDL_EVENT_MOUSE_MOTION:
                self.io.mouse_pos = (float(event.motion.x), float(event.motion.y))
            elif event.type == sdl3.SDL_EVENT_MOUSE_BUTTON_DOWN:
                if event.button.button == sdl3.SDL_BUTTON_LEFT:
                    self.io.mouse_down[0] = True
            elif event.type == sdl3.SDL_EVENT_MOUSE_BUTTON_UP:
                if event.button.button == sdl3.SDL_BUTTON_LEFT:
                    self.io.mouse_down[0] = False
            elif event.type == sdl3.SDL_EVENT_TEXT_INPUT:
                try:
                    text = event.text.text.decode('utf-8')
                    self.io.add_input_characters_utf8(text)
                except:
                    pass
        except Exception as e:
            logger.debug(f"Event error: {e}")
        
        return self.io.want_capture_mouse or self.io.want_capture_keyboard
    
    def render(self):
        """Render the complete ImGui interface"""
        try:
            # Frame management
            if self.frame_active:
                try:
                    imgui.end_frame()
                except:
                    pass
            
            # Update display size
            w, h = ctypes.c_int(), ctypes.c_int()
            sdl3.SDL_GetWindowSize(self.context.window, ctypes.byref(w), ctypes.byref(h))
            self.io.display_size = (float(w.value), float(h.value))
            
            # Start new frame
            imgui.new_frame()
            self.frame_active = True
            
            # Render all sidebars
            self._render_all_sidebars(w.value, h.value)
            
            # Finish frame
            imgui.render()
            self.frame_active = False
            
            # Simple visual feedback
            self._render_visual_feedback(w.value, h.value)
            
        except Exception as e:
            logger.error(f"Render error: {e}")
            if self.frame_active:
                try:
                    imgui.end_frame()
                except:
                    pass
                self.frame_active = False
    
    def _render_all_sidebars(self, width, height):
        """Render all UI sidebars in one method"""
        # Tools (left)
        imgui.set_next_window_position(0, 50)
        imgui.set_next_window_size(140, height - 180)
        if imgui.begin("##Tools", flags=self.sidebar_flags):
            self._render_tools()
        imgui.end()
        
        # Tables (top)
        imgui.set_next_window_position(0, 0)
        imgui.set_next_window_size(width, 50)
        if imgui.begin("##Tables", flags=self.sidebar_flags):
            self._render_tables()
        imgui.end()
        
        # Character (right)
        imgui.set_next_window_position(width - 300, 50)
        imgui.set_next_window_size(300, height - 180)
        if imgui.begin("##Character", flags=self.sidebar_flags):
            self._render_character()
        imgui.end()
        
        # Chat (bottom)
        imgui.set_next_window_position(140, height - 130)
        imgui.set_next_window_size(width - 440, 130)
        if imgui.begin("##Chat", flags=self.sidebar_flags):
            self._render_chat()
        imgui.end()
    
    def _render_tools(self):
        """Render tools sidebar"""
        imgui.text("🛠️ Tools")
        imgui.separator()
        
        for tool, icon in self.tools.items():
            if imgui.button(f"{icon} {tool}", -1, 30):
                self.active_tool = tool
                if tool == "Paint":
                    try:
                        import paint
                        paint.toggle_paint_mode()
                    except:
                        pass
                logger.info(f"Selected tool: {tool}")
            
            if tool == self.active_tool:
                imgui.same_line()
                imgui.text("✓")
        
        if self.active_tool == "Paint":
            imgui.separator()
            imgui.text("🎨 Paint Options")
            _, self.brush_size = imgui.slider_int("Size", self.brush_size, 1, 20)
            _, self.paint_color = imgui.color_edit4("Color", *self.paint_color)
    
    def _render_tables(self):
        """Render tables sidebar"""
        if self.context.list_of_tables:
            for i, table in enumerate(self.context.list_of_tables):
                if imgui.button(f"📋 {table.name}"):
                    self.context.current_table = table
                imgui.same_line()
                if imgui.button(f"❌##{i}"):
                    if len(self.context.list_of_tables) > 1:
                        self.context.list_of_tables.remove(table)
                        if self.context.current_table == table:
                            self.context.current_table = self.context.list_of_tables[0]
                imgui.same_line()
        
        if imgui.button("➕ New"):
            imgui.open_popup("New Table")
        
        if imgui.begin_popup_modal("New Table")[0]:
            _, self.new_table_name = imgui.input_text("Name", self.new_table_name, 64)
            if imgui.button("Create") and self.new_table_name.strip():
                self.context.add_table(self.new_table_name, 50, 50)
                self.new_table_name = ""
                imgui.close_current_popup()
            imgui.same_line()
            if imgui.button("Cancel"):
                imgui.close_current_popup()
            imgui.end_popup()
    
    def _render_character(self):
        """Render character sidebar"""
        imgui.text("👤 Character")
        imgui.separator()
        
        # Character selection
        char_name = self.selected_character.name if self.selected_character else "None"
        if imgui.begin_combo("##char", char_name):
            if imgui.selectable("None")[0]:
                self.selected_character = None
            
            # Find characters in current table
            if self.context.current_table:
                for sprites in self.context.current_table.dict_of_sprites_list.values():
                    for sprite in sprites:
                        if hasattr(sprite, 'character') and sprite.character:
                            char = sprite.character
                            if imgui.selectable(char.name)[0]:
                                self.selected_character = char
            imgui.end_combo()
        
        # Character details
        if self.selected_character:
            char = self.selected_character
            imgui.text(f"📛 {char.name}")
            imgui.text(f"🧬 {char.race}")
            imgui.text(f"📊 Level {char.level}")
            
            # HP bar
            hp_ratio = char.hp / 100.0
            imgui.progress_bar(hp_ratio, (-1, 20), f"❤️ {char.hp}/100")
            
            if imgui.button("➖") and char.hp > 0:
                char.hp = max(0, char.hp - 5)
            imgui.same_line()
            if imgui.button("➕") and char.hp < 100:
                char.hp = min(100, char.hp + 5)
    
    def _render_chat(self):
        """Render chat and layers sidebar"""
        # Chat section (70% width)
        chat_width = imgui.get_window_width() * 0.7
        
        imgui.begin_child("Chat", chat_width, -1, True)
        imgui.text("💬 Chat")
        
        # Messages
        imgui.begin_child("Messages", 0, -35, True)
        for msg in self.chat_messages[-20:]:
            imgui.text(msg)
        imgui.set_scroll_here_y(1.0)
        imgui.end_child()
        
        # Input
        imgui.push_item_width(-50)
        enter_pressed, self.chat_input = imgui.input_text("##input", self.chat_input, 256,
                                                         imgui.INPUT_TEXT_ENTER_RETURNS_TRUE)
        imgui.pop_item_width()
        imgui.same_line()
        send_clicked = imgui.button("📤")
        
        if (enter_pressed or send_clicked) and self.chat_input.strip():
            self.chat_messages.append(f"You: {self.chat_input}")
            logger.info(f"Chat: {self.chat_input}")
            self.chat_input = ""
        
        imgui.end_child()
        imgui.same_line()
        
        # Layers section (25% width)
        imgui.begin_child("Layers", -1, -1, True)
        imgui.text("🎭 Layers")
        
        if self.context.current_table:
            for layer in self.context.current_table.layers:
                sprites = self.context.current_table.dict_of_sprites_list.get(layer, [])
                if imgui.radio_button(f"{layer} ({len(sprites)})", self.selected_layer == layer):
                    self.selected_layer = layer
        
        imgui.end_child()
    
    def _render_visual_feedback(self, width, height):
        """Render simple visual feedback for UI areas"""
        try:
            # Clear clipping
            sdl3.SDL_SetRenderClipRect(self.renderer, None)
            
            # Draw colored rectangles for each sidebar area
            areas = [
                (sdl3.SDL_FRect(0, 50, 140, height - 180), (0.2, 0.4, 0.8, 0.3)),  # Tools
                (sdl3.SDL_FRect(0, 0, width, 50), (0.2, 0.8, 0.4, 0.3)),           # Tables
                (sdl3.SDL_FRect(width - 300, 50, 300, height - 180), (0.8, 0.2, 0.8, 0.3)),  # Character
                (sdl3.SDL_FRect(140, height - 130, width - 440, 130), (0.8, 0.6, 0.2, 0.3))  # Chat
            ]
            
            for rect, color in areas:
                sdl3.SDL_SetRenderDrawColorFloat(self.renderer, *color)
                sdl3.SDL_RenderFillRect(self.renderer, rect)
                
                # White border
                sdl3.SDL_SetRenderDrawColorFloat(self.renderer, 1.0, 1.0, 1.0, 0.8)
                sdl3.SDL_RenderRect(self.renderer, rect)
                
        except Exception as e:
            logger.debug(f"Visual feedback error: {e}")
    
    # Public interface methods
    def get_active_tool(self):
        return self.active_tool
    
    def get_selected_layer(self):
        return self.selected_layer
    
    def add_chat_message(self, message: str):
        self.chat_messages.append(message)

def init_gui_imgui_system(context, renderer, width, height):
    """Initialize the ImGui system"""
    try:
        imgui.create_context()
        
        # Simple style setup
        style = imgui.get_style()
        style.window_rounding = 6.0
        style.frame_rounding = 4.0
        imgui.style_colors_dark()
        
        logger.info("ImGui system initialized")
        return ImGuiSystem(context, renderer, width, height)
        
    except Exception as e:
        logger.error(f"ImGui init failed: {e}")
        return None