from imgui_bundle import imgui
from imgui_bundle.python_backends.sdl3_backend import SDL3Renderer
from imgui_bundle import imgui_node_editor
import OpenGL.GL as gl
import sdl3
import ctypes
import logging
import sys
import io_sys


logger = logging.getLogger(__name__)

class GuiState:
    """State management for GUI components"""
    def __init__(self):
        # Tool states
        self.selected_tool = "select"  # select, paint, dice, measure
        self.paint_brush_size = 5
        self.paint_color = [1.0, 1.0, 1.0, 1.0]  # RGBA
        
        # Sidebar visibility
        self.show_left_sidebar = True
        self.show_right_sidebar = True
        self.show_top_sidebar = True
        self.show_bottom_sidebar = True
        
        # Chat state
        self.chat_messages = []
        self.chat_input = ""
        
        # Entity management
        self.selected_entity = None
        self.entity_list = []
        
        # Table management
        self.table_list = []
        self.selected_table = None
        
        # Right sidebar tabs
        self.right_tab = 0  # 0=Chat, 1=Entities, 2=Debug, 3=Network
        
        # Debug info
        self.show_fps = True
        self.fps = 0.0

class ImGuiSystem:
    """Main ImGui system with complete UI layout"""
    
    def __init__(self, window, gl_context, sdl_context):
        """Initialize the ImGui system"""
        self.window = window
        self.gl_context = gl_context
        self.sdl_context = sdl_context
        self.impl = None
        self.io = None
        self.gui_state = GuiState()
        self.docking_initialized = False  # Track if we've set up initial docking
        
        try:
            # Create ImGui context
            imgui.create_context()
            self.io = imgui.get_io()
            
            # Configure ImGui
            self.io.config_flags |= imgui.ConfigFlags_.docking_enable
            
            # Create SDL3 renderer backend
            self.impl = SDL3Renderer(window)
            
            logger.info("ImGui system initialized successfully")
            
        except Exception as e:
            logger.error(f"ImGui init failed: {e}")
            if self.impl:
                try:
                    self.impl.shutdown()
                except:
                    pass
            self.impl = None
            self.io = None
            raise e

    def process_event(self, event):
        """Process SDL events for ImGui and pass through to SDL if needed"""
        if not self.impl:
            return False
        
        try:
            # Let ImGui process the event first
            imgui_wants_event = self.impl.process_event(event)
            
            # Check if ImGui wants to capture the event
            if self.io:
                wants_capture_mouse = self.io.want_capture_mouse
                wants_capture_keyboard = self.io.want_capture_keyboard
                
                # For mouse events, only let ImGui capture if it's over a window
                if event.type in [sdl3.SDL_EVENT_MOUSE_BUTTON_DOWN, sdl3.SDL_EVENT_MOUSE_BUTTON_UP, 
                                sdl3.SDL_EVENT_MOUSE_MOTION, sdl3.SDL_EVENT_MOUSE_WHEEL]:
                    # If ImGui doesn't want the mouse event, let SDL handle it
                    if not wants_capture_mouse:
                        return False  # Let SDL process the event
                        
                # For keyboard events
                elif event.type in [sdl3.SDL_EVENT_KEY_DOWN, sdl3.SDL_EVENT_KEY_UP, sdl3.SDL_EVENT_TEXT_INPUT]:
                    # If ImGui doesn't want the keyboard event, let SDL handle it
                    if not wants_capture_keyboard:
                        return False  # Let SDL process the event
            
            return imgui_wants_event
            
        except Exception as e:
            logger.error(f"ImGui process_event error: {e}")
            return False

    def iterate(self):
        """Run the ImGui frame with complete UI layout"""
        if not self.impl or not self.io:
            return
            
        try:
            # Process inputs
            self.impl.process_inputs()
            
            # Start new frame
            imgui.new_frame()
            
            # Create main dockspace
            self._create_dockspace()
            
            # Render all UI components with error handling
            try:
                if self.gui_state.show_left_sidebar:
                    self._render_left_sidebar()
            except Exception as e:
                logger.error(f"Error rendering left sidebar: {e}")
            
            try:
                if self.gui_state.show_right_sidebar:
                    self._render_right_sidebar()
            except Exception as e:
                logger.error(f"Error rendering right sidebar: {e}")
                
            try:
                if self.gui_state.show_top_sidebar:
                    self._render_top_sidebar()
            except Exception as e:
                logger.error(f"Error rendering top sidebar: {e}")
                
            try:
                if self.gui_state.show_bottom_sidebar:
                    self._render_bottom_sidebar()
            except Exception as e:
                logger.error(f"Error rendering bottom sidebar: {e}")
            
            # Render main menu
            try:
                self._render_main_menu()
            except Exception as e:
                logger.error(f"Error rendering main menu: {e}")
            
            # Update FPS
            self.gui_state.fps = self.io.framerate
            
            # Render - this must be called before render()
            imgui.render()
            
            # Enable blending
            gl.glEnable(gl.GL_BLEND)
            gl.glBlendFunc(gl.GL_SRC_ALPHA, gl.GL_ONE_MINUS_SRC_ALPHA)
            
            # Render ImGui
            self.impl.render(imgui.get_draw_data())
            
            # End frame - this ensures proper frame lifecycle
            imgui.end_frame()
            
        except Exception as e:
            logger.error(f"ImGui iterate error: {e}")
            # Emergency cleanup - ensure we end the frame even on error
            try:
                imgui.end_frame()
            except:
                pass

    def _create_dockspace(self):
        """Create the main dockspace for the application"""
        viewport = imgui.get_main_viewport()
        imgui.set_next_window_pos(viewport.work_pos)
        imgui.set_next_window_size(viewport.work_size)
        
        window_flags = (
            imgui.WindowFlags_.no_title_bar |
            imgui.WindowFlags_.no_collapse |
            imgui.WindowFlags_.no_resize |
            imgui.WindowFlags_.no_move |
            imgui.WindowFlags_.no_bring_to_front_on_focus |
            imgui.WindowFlags_.no_nav_focus |
            imgui.WindowFlags_.no_background
        )
        
        imgui.push_style_var(imgui.StyleVar_.window_rounding, 0.0)
        imgui.push_style_var(imgui.StyleVar_.window_border_size, 0.0)
        imgui.push_style_var(imgui.StyleVar_.window_padding, (0.0, 0.0))
        
        imgui.begin("DockSpace", None, window_flags)
        imgui.pop_style_var(3)
        
        # Create dockspace with passthru_central_node for SDL transparency
        dock_flags = imgui.DockNodeFlags_.passthru_central_node
        dockspace_id = imgui.get_id("MainDockSpace")
        imgui.dock_space(dockspace_id, (0, 0), dock_flags)
        
        # Setup initial docking layout using hello_imgui pattern
        if not self.docking_initialized:
            self._setup_initial_docking_layout(dockspace_id)
            self.docking_initialized = True
        
        imgui.end()

    def _setup_initial_docking_layout(self, dockspace_id):
        """Setup initial docking layout following hello_imgui pattern"""
        try:
            # Check if dock builder is available
            if not hasattr(imgui, 'dock_builder_remove_node'):
                logger.warning("Dock builder not available, using fallback positioning")
                self._setup_fallback_docking()
                return
            print('sdsdl;')
            # Clear any existing layout
            imgui.dock_builder_remove_node(dockspace_id)
            imgui.dock_builder_add_node(dockspace_id, imgui.DockNodeFlags_.dockspace)
            imgui.dock_builder_set_node_size(dockspace_id, imgui.get_main_viewport().work_size)
            
            # Following hello_imgui pattern for splits
            # Split left side (Tools) - 20% of total width
            dock_left = imgui.dock_builder_split_node(dockspace_id, imgui.Dir_.left, 0.20, None, None)
            
            # Split right side (Information Panel) - 25% of remaining width 
            dock_right = imgui.dock_builder_split_node(dockspace_id, imgui.Dir_.right, 0.30, None, None)
            
            # Split top (Table Management) - 12% of remaining height
            dock_top = imgui.dock_builder_split_node(dockspace_id, imgui.Dir_.up, 0.12, None, None)
            
            # Split bottom (Actions & Quick Chat) - 18% of remaining height
            dock_bottom = imgui.dock_builder_split_node(dockspace_id, imgui.Dir_.down, 0.20, None, None)
            
            # Dock windows to their respective areas
            imgui.dock_builder_dock_window("Tools", dock_left)
            imgui.dock_builder_dock_window("Information Panel", dock_right)
            imgui.dock_builder_dock_window("Table Management", dock_top)
            imgui.dock_builder_dock_window("Actions & Quick Chat", dock_bottom)
            
            # Finish the layout
            imgui.dock_builder_finish(dockspace_id)
            
            logger.info("Initial docking layout configured")
            
        except Exception as e:
            logger.error(f"Failed to setup docking layout: {e}")
            self._setup_fallback_docking()

    def _setup_fallback_docking(self):
        """Fallback docking setup using set_next_window_dock_id"""
        try:
            viewport = imgui.get_main_viewport()
            dockspace_id = imgui.get_id("MainDockSpace")
            
            # Set initial docking for each window
            self.initial_dock_setup = {
                "Tools": {
                    "pos": (viewport.work_pos.x, viewport.work_pos.y + 25),
                    "size": (200, viewport.work_size.y - 25),
                    "dock_id": dockspace_id
                },
                "Information Panel": {
                    "pos": (viewport.work_pos.x + viewport.work_size.x - 300, viewport.work_pos.y + 25),
                    "size": (300, viewport.work_size.y - 25),
                    "dock_id": dockspace_id
                },
                "Table Management": {
                    "pos": (viewport.work_pos.x + 200, viewport.work_pos.y + 25),
                    "size": (viewport.work_size.x - 500, 100),
                    "dock_id": dockspace_id
                },
                "Actions & Quick Chat": {
                    "pos": (viewport.work_pos.x + 200, viewport.work_pos.y + viewport.work_size.y - 150),
                    "size": (viewport.work_size.x - 500, 125),
                    "dock_id": dockspace_id
                }
            }
            
            logger.info("Fallback docking setup configured")
            
        except Exception as e:
            logger.error(f"Failed to setup fallback docking: {e}")

    def _render_main_menu(self):
        """Render the main menu bar"""
        if imgui.begin_main_menu_bar():
            if imgui.begin_menu("File"):
                if imgui.menu_item("New Table")[0]:
                    self._create_new_table()
                if imgui.menu_item("Load Table")[0]:
                    self._load_table()
                if imgui.menu_item("Save Table")[0]:
                    self._save_table()
                imgui.separator()
                if imgui.menu_item("Exit")[0]:
                    sys.exit(0)
                imgui.end_menu()
            
            if imgui.begin_menu("View"):
                _, self.gui_state.show_left_sidebar = imgui.menu_item(
                    "Left Sidebar", None, self.gui_state.show_left_sidebar
                )
                _, self.gui_state.show_right_sidebar = imgui.menu_item(
                    "Right Sidebar", None, self.gui_state.show_right_sidebar
                )
                _, self.gui_state.show_top_sidebar = imgui.menu_item(
                    "Top Sidebar", None, self.gui_state.show_top_sidebar
                )
                _, self.gui_state.show_bottom_sidebar = imgui.menu_item(
                    "Bottom Sidebar", None, self.gui_state.show_bottom_sidebar
                )
                imgui.end_menu()
            
            if imgui.begin_menu("Tools"):
                if imgui.menu_item("Select Tool")[0]:
                    self.gui_state.selected_tool = "select"
                if imgui.menu_item("Paint Tool")[0]:
                    self.gui_state.selected_tool = "paint"
                if imgui.menu_item("Dice Tool")[0]:
                    self.gui_state.selected_tool = "dice"
                if imgui.menu_item("Measure Tool")[0]:
                    self.gui_state.selected_tool = "measure"
                imgui.end_menu()
            
            # Show FPS in menu bar
            if self.gui_state.show_fps:
                imgui.same_line()
                imgui.text(f"FPS: {self.gui_state.fps:.1f}")
            
            imgui.end_main_menu_bar()

    def _render_left_sidebar(self):
        """Render the left sidebar with tool selection"""
        # Apply initial docking setup if available
        if hasattr(self, 'initial_dock_setup') and "Tools" in self.initial_dock_setup:
            setup = self.initial_dock_setup["Tools"]
            imgui.set_next_window_pos(setup["pos"], imgui.Cond_.first_use_ever)
            imgui.set_next_window_size(setup["size"], imgui.Cond_.first_use_ever)
            imgui.set_next_window_dock_id(setup["dock_id"], imgui.Cond_.first_use_ever)
        
        window_open = imgui.begin("Tools")
        
        try:
            if window_open[0]:
                imgui.text("Tool Selection")
                imgui.separator()
                
                # Tool buttons
                tools = [
                    ("Select", "select", "🔍"),
                    ("Paint", "paint", "🎨"),
                    ("Dice", "dice", "🎲"),
                    ("Measure", "measure", "📏")
                ]
                
                for name, tool_id, icon in tools:
                    is_active = self.gui_state.selected_tool == tool_id
                    if is_active:
                        imgui.push_style_color(imgui.Col_.button, (0.2, 0.6, 0.8, 1.0))
                    
                    if imgui.button(f"{icon} {name}", (-1, 40)):
                        self.gui_state.selected_tool = tool_id
                        self._on_tool_selected(tool_id)
                    
                    if is_active:
                        imgui.pop_style_color()
            
            imgui.separator()
            
            # Tool-specific options
            if self.gui_state.selected_tool == "paint":
                self._render_paint_options()
            elif self.gui_state.selected_tool == "dice":
                self._render_dice_options()
            elif self.gui_state.selected_tool == "measure":
                self._render_measure_options()
            elif self.gui_state.selected_tool == "select":
                self._render_select_options()
                
        except Exception as e:
            logger.error(f"Error rendering left sidebar: {e}")
        finally:
            imgui.end()

    def _render_paint_options(self):
        """Render paint tool options"""
        imgui.text("Paint Options")
        
        # Paint mode toggle
        if imgui.button("Toggle Paint Mode", (-1, 30)):
            import paint
            paint.toggle_paint_mode()
        
        # Paint controls (only show if paint mode is active)
        import paint
        if paint.is_paint_mode_active():
            imgui.text("Color:")
            if imgui.button("Cycle Colors", (-1, 25)):
                paint.cycle_paint_colors()
            
            imgui.text("Brush Size:")
            if imgui.button("+ Size", (-1, 25)):
                paint.adjust_paint_width(1)
            if imgui.button("- Size", (-1, 25)):
                paint.adjust_paint_width(-1)

    def _render_dice_options(self):
        """Render dice tool options"""
        imgui.text("Dice Options")
        
        dice_types = ["d4", "d6", "d8", "d10", "d12", "d20", "d100"]
        for dice in dice_types:
            if imgui.button(f"Roll {dice}", (-1, 30)):
                self._roll_dice(dice)

    def _render_measure_options(self):
        """Render measure tool options"""
        imgui.text("Measurement Options")
        
        if imgui.button("Linear Ruler", (-1, 30)):
            self._activate_linear_measurement()
        
        if imgui.button("Area Measurement", (-1, 30)):
            self._activate_area_measurement()
        
        if imgui.button("Clear Measurements", (-1, 30)):
            self._clear_measurements()

    def _render_select_options(self):
        """Render select tool options"""
        imgui.text("Selection Options")
        
        if imgui.button("Delete Selected", (-1, 30)):
            self._delete_selected()
        
        if imgui.button("Duplicate Selected", (-1, 30)):
            self._duplicate_selected()
        
        if imgui.button("Group Selected", (-1, 30)):
            self._group_selected()

    def _render_top_sidebar(self):
        """Render the top sidebar with table management"""
        if hasattr(self, 'initial_dock_setup') and "Table Management" in self.initial_dock_setup:
            setup = self.initial_dock_setup["Table Management"]
            imgui.set_next_window_pos(setup["pos"], imgui.Cond_.first_use_ever)
            imgui.set_next_window_size(setup["size"], imgui.Cond_.first_use_ever)
            imgui.set_next_window_dock_id(setup["dock_id"], imgui.Cond_.first_use_ever)
        
        window_open = imgui.begin("Table Management")
        
        try:
            if window_open[0]:
                # Table actions
                if imgui.button("New Table"):
                    self._create_new_table()
                imgui.same_line()
                
                if imgui.button("Load Table"):
                    self._load_table_from_disk()
                imgui.same_line()
                
                if imgui.button("Save Table"):
                    self._save_table_to_disk()
                imgui.same_line()
                
                if imgui.button("Delete Table"):
                    self._delete_current_table()
                
                imgui.separator()
                
                # Current table info
                if self.sdl_context.current_table:
                    table = self.sdl_context.current_table
                    imgui.text(f"Current: {table.name}")
                    imgui.same_line()
                    imgui.text(f"({table.width}x{table.height})")
                
                # Table list
                if self.sdl_context.list_of_tables:
                    imgui.text("Available Tables:")
                    for i, table in enumerate(self.sdl_context.list_of_tables):
                        is_current = table == self.sdl_context.current_table
                        if imgui.selectable(f"📋 {table.name}##table{i}", is_current)[0]:
                            self._switch_to_table(i)
                            
        except Exception as e:
            logger.error(f"Error rendering top sidebar: {e}")
        finally:
            imgui.end()

    def _render_bottom_sidebar(self):
        """Render the bottom sidebar with character actions"""
        if hasattr(self, 'initial_dock_setup') and "Actions & Quick Chat" in self.initial_dock_setup:
            setup = self.initial_dock_setup["Actions & Quick Chat"]
            imgui.set_next_window_pos(setup["pos"], imgui.Cond_.first_use_ever)
            imgui.set_next_window_size(setup["size"], imgui.Cond_.first_use_ever)
            imgui.set_next_window_dock_id(setup["dock_id"], imgui.Cond_.first_use_ever)
        
        window_open = imgui.begin("Actions & Quick Chat")
        
        try:
            if window_open[0]:
                # Character actions
                imgui.text("Character Actions")
                
                if imgui.button("⚔️ Attack"):
                    self._character_attack()
                imgui.same_line()
                
                if imgui.button("✨ Spell"):
                    self._character_spell()
                imgui.same_line()
                
                if imgui.button("🏃 Move"):
                    self._character_move()
                imgui.same_line()
                
                if imgui.button("⏹️ End Turn"):
                    self._end_turn()
                
                imgui.separator()
                
                # Quick actions
                imgui.text("Quick Actions")
                if imgui.button("🎲 Initiative"):
                    self._roll_initiative()
                imgui.same_line()
                
                if imgui.button("💾 Save Game"):
                    self._save_game()
                imgui.same_line()
                
                if imgui.button("📁 Load Game"):
                    self._load_game()
            
                imgui.separator()
                
                # Quick chat
                imgui.text("Quick Chat")
                _, self.gui_state.chat_input = imgui.input_text("##chat_input", self.gui_state.chat_input)
                imgui.same_line()
                
                if imgui.button("Send") or (imgui.is_item_focused() and imgui.is_key_pressed(imgui.Key.enter)):
                    if self.gui_state.chat_input.strip():
                        self._send_chat_message(self.gui_state.chat_input)
                        self.gui_state.chat_input = ""
                        
        except Exception as e:
            logger.error(f"Error rendering bottom sidebar: {e}")
        finally:
            imgui.end()

    def _render_right_sidebar(self):
        """Render the right sidebar with tabs"""
        if hasattr(self, 'initial_dock_setup') and "Information Panel" in self.initial_dock_setup:
            setup = self.initial_dock_setup["Information Panel"]
            imgui.set_next_window_pos(setup["pos"], imgui.Cond_.first_use_ever)
            imgui.set_next_window_size(setup["size"], imgui.Cond_.first_use_ever)
            imgui.set_next_window_dock_id(setup["dock_id"], imgui.Cond_.first_use_ever)
        
        window_open = imgui.begin("Information Panel")
        
        try:
            if window_open[0]:
                if imgui.begin_tab_bar("RightTabs"):
                    
                    if imgui.begin_tab_item("Chat")[0]:
                        self._render_chat_tab()
                        imgui.end_tab_item()
                    
                    if imgui.begin_tab_item("Character")[0]:
                        self._render_character_tab()
                        imgui.end_tab_item()
                    
                    if imgui.begin_tab_item("Entities")[0]:
                        self._render_entities_tab()
                        imgui.end_tab_item()
                    
                    if imgui.begin_tab_item("Network")[0]:
                        self._render_network_tab()
                        imgui.end_tab_item()
                    
                    if imgui.begin_tab_item("Debug")[0]:
                        self._render_debug_tab()
                        imgui.end_tab_item()
                    
                    imgui.end_tab_bar()
                    
        except Exception as e:
            logger.error(f"Error rendering right sidebar: {e}")
        finally:
            imgui.end()

    def _render_chat_tab(self):
        """Render the chat tab"""
        imgui.text("Chat Messages")
        imgui.separator()
        
        # Chat messages area with scrolling
        if imgui.begin_child("ChatMessages", (0, -25), True):
            for message in self.gui_state.chat_messages:
                imgui.text(message)
            imgui.end_child()
        
        # Chat input (always visible at bottom)
        imgui.separator()
        imgui.text("Message:")
        _, self.gui_state.chat_input = imgui.input_text("##chat_input_main", self.gui_state.chat_input)

    def _render_entities_tab(self):
        """Render the entities tab"""
        imgui.text("Entities on Table")
        imgui.separator()
        
        # Entity list with scrolling
        if imgui.begin_child("EntityList", (0, -60), True):
            if self.sdl_context.current_table:
                for layer, sprites in self.sdl_context.current_table.dict_of_sprites_list.items():
                    if imgui.tree_node(f"{layer} ({len(sprites)} entities)"):
                        for i, sprite in enumerate(sprites):
                            entity_name = f"Entity {i}"
                            if hasattr(sprite, 'name') and sprite.name:
                                entity_name = sprite.name
                            
                            is_selected = sprite == self.sdl_context.current_table.selected_sprite
                            if imgui.selectable(f"🎭 {entity_name}##entity{i}", is_selected)[0]:
                                self.sdl_context.current_table.selected_sprite = sprite
                        imgui.tree_pop()
            else:
                imgui.text("No table loaded")
            imgui.end_child()
        
        # Entity actions
        imgui.separator()
        if imgui.button("Add Character", (-1, 25)):
            self._add_character()
        if imgui.button("Add Monster", (-1, 25)):
            self._add_monster()

    def _render_debug_tab(self):
        """Render the debug tab with sprite and system information"""
        imgui.text("Debug Information")
        imgui.separator()
        
        # System info
        imgui.text(f"FPS: {self.gui_state.fps:.1f}")
        imgui.text(f"Frame Time: {1000.0/max(self.gui_state.fps, 1):.1f}ms")
        
        # Get context if available
        if hasattr(self.sdl_context, 'current_table') and self.sdl_context.current_table:
            table = self.sdl_context.current_table
            
            imgui.separator()
            imgui.text("Table Info")
            imgui.text(f"Name: {table.name}")
            imgui.text(f"Size: {table.width}x{table.height}")
            imgui.text(f"Scale: {table.scale:.2f}")
            imgui.text(f"Position: ({table.x_moved:.1f}, {table.y_moved:.1f})")
            
            imgui.separator()
            imgui.text("Sprites by Layer")
            
            # Use scrolling child for sprite list
            if imgui.begin_child("SpriteDebugList", (0, -30), True):
                for layer, sprites in table.dict_of_sprites_list.items():
                    if imgui.tree_node(f"{layer} ({len(sprites)} sprites)"):
                        for i, sprite in enumerate(sprites):
                            sprite_name = f"Sprite {i}"
                            if hasattr(sprite, 'texture_path'):
                                texture_path = sprite.texture_path
                                if isinstance(texture_path, bytes):
                                    texture_path = texture_path.decode()
                                sprite_name = f"Sprite {i}: {texture_path}"
                            
                            if imgui.selectable(sprite_name)[0]:
                                table.selected_sprite = sprite
                        imgui.tree_pop()
                imgui.end_child()
        
        imgui.separator()
        if imgui.button("Clear Debug Log", (-1, 25)):
            logger.info("Debug log cleared")

    def _render_network_tab(self):
        """Render network management tab"""
        imgui.text("Network Status")
        imgui.separator()
        
        # Show network activity
        if hasattr(self.sdl_context, 'network_context'):
            pending = len(self.sdl_context.network_context.pending_changes)
            imgui.text(f"Pending Updates: {pending}")
            
            if hasattr(self.sdl_context, 'protocol'):
                imgui.text(f"Client ID: {self.sdl_context.protocol.client_id}")
        
        # Connection status
        is_connected = hasattr(self.sdl_context, 'net_socket') and self.sdl_context.net_socket
        
        if is_connected:
            imgui.text_colored((0, 1, 0, 1), "🟢 Connected")
        else:
            imgui.text_colored((1, 0, 0, 1), "🔴 Disconnected")
        
        # Connection controls
        if imgui.button("Reconnect" if is_connected else "Connect", (-1, 30)):
            self._toggle_network_connection()
        
        imgui.separator()
        
        # Network actions
        imgui.text("Table Sync")
        if imgui.button("📥 Request Table", (-1, 30)):
            self._request_table_from_server()
        
        if imgui.button("📤 Upload Table", (-1, 30)):
            self._upload_table_to_server()
        
        if imgui.button("🔄 Sync Changes", (-1, 30)):
            self._sync_table_changes()
        
        imgui.separator()
        
        # Connection info
        imgui.text("Server Info")
        if hasattr(self.sdl_context, 'protocol'):
            imgui.text(f"Client ID: {self.sdl_context.protocol.client_id}")
        else:
            imgui.text("No protocol connection")
        
        # Ping
        if imgui.button("📡 Send Ping", (-1, 30)):
            self._send_network_ping()

    def _render_character_tab(self):
        """Render character screen with skills and inventory"""
        imgui.text("Character Sheet")
        imgui.separator()
        
        # Get selected character
        character = self._get_selected_character()
        
        # Always create the child window, regardless of character selection
        if imgui.begin_child("CharacterInfo", (0, 0), True):
            if not character:
                imgui.text("No character selected")
                imgui.text("Select a character token to view stats")
            else:
                # Basic info
                imgui.text(f"Name: {character.name if hasattr(character, 'name') else 'Unknown'}")
                imgui.text(f"Race: {character.race if hasattr(character, 'race') else 'Unknown'}")
                imgui.text(f"Class: {character.char_class if hasattr(character, 'char_class') else 'Unknown'}")
                imgui.text(f"Level: {character.level if hasattr(character, 'level') else '1'}")
                imgui.text(f"HP: {character.hp if hasattr(character, 'hp') else '10'}")
                
                imgui.separator()
                
                # Stats
                if hasattr(character, 'stats') and character.stats:
                    imgui.text("Stats:")
                    for stat, value in character.stats.items():
                        imgui.text(f"  {stat}: {value}")
                else:
                    imgui.text("Stats: Not available")
                
                imgui.separator()
                
                # Spells
                if hasattr(character, 'spells') and character.spells:
                    imgui.text("Spells:")
                    for i, spell in enumerate(character.spells):
                        if imgui.selectable(f"✨ {spell.name} (Lv.{spell.level})")[0]:
                            self._cast_spell(spell)
                        if imgui.is_item_hovered():
                            imgui.set_tooltip(spell.description)
                else:
                    imgui.text("Spells: None available")
                
                imgui.separator()
                
                # Inventory placeholder
                imgui.text("Inventory:")
                imgui.text("  [Inventory system not implemented]")
        
        # Always end the child window
        imgui.end_child()

    # Event handlers
    def _on_tool_selected(self, tool_id):
        """Handle tool selection"""
        logger.info(f"Tool selected: {tool_id}")
        # Implement tool-specific logic here

    def _create_new_table(self):
        """Create a new table"""
        try:
            table_name = f"Table {len(self.sdl_context.list_of_tables) + 1}"
            new_table = self.sdl_context.add_table(table_name, 1920, 1080)
            if new_table:
                self.gui_state.chat_messages.append(f"Created new table: {table_name}")
                logger.info(f"Created new table: {table_name}")
                # Trigger icon update
                self._update_table_icons()
            else:
                self.gui_state.chat_messages.append("Failed to create new table")
                logger.error("Failed to create new table")
        except Exception as e:
            error_msg = f"Error creating table: {e}"
            self.gui_state.chat_messages.append(error_msg)
            logger.error(error_msg)

    def _load_table_from_disk(self):
        """Load table from disk"""
        table_data = io_sys.load_json_from_disk(None)
        loaded_table = self.sdl_context.create_table_from_json(table_data)
        filename='none'
        try:    
            if loaded_table:
                self.gui_state.chat_messages.append(f"Loaded table from {filename}")
                logger.info(f"Loaded table from {filename}")
                # Trigger icon update
                self._update_table_icons()
            else:
                self.gui_state.chat_messages.append(f"Failed to load table from {filename}")
                
        except Exception as e:
            error_msg = f"Error loading table: {e}"
            self.gui_state.chat_messages.append(error_msg)
            logger.error(error_msg)

    def _save_table_to_disk(self):
        """Save current table to disk"""
        if not self.sdl_context.current_table:
            self.gui_state.chat_messages.append("No table to save")
            logger.warning("No current table to save")
            return
        
        data = self.sdl_context.current_table.save_to_dict()
        print(data)
        io_sys.save_dict_to_disk(data)
        
        


    def _delete_current_table(self):
        """Delete current table"""
        if not self.sdl_context.current_table:
            self.gui_state.chat_messages.append("No table to delete")
            return
        
        if len(self.sdl_context.list_of_tables) <= 1:
            self.gui_state.chat_messages.append("Cannot delete the last table")
            logger.warning("Cannot delete the last table")
            return
        
        try:
            table_name = self.sdl_context.current_table.name
            
            # Clean up the table's resources
            self.sdl_context.cleanup_table(self.sdl_context.current_table)
            
            # Remove from list
            self.sdl_context.list_of_tables.remove(self.sdl_context.current_table)
            
            # Switch to another table
            self.sdl_context.current_table = self.sdl_context.list_of_tables[0]
            
            self.gui_state.chat_messages.append(f"Deleted table: {table_name}")
            logger.info(f"Deleted table: {table_name}")
            
            # Trigger icon update
            self._update_table_icons()
            
        except Exception as e:
            error_msg = f"Error deleting table: {e}"
            self.gui_state.chat_messages.append(error_msg)
            logger.error(error_msg)

    def _switch_to_table(self, table_index):
        """Switch to a different table"""
        try:
            if 0 <= table_index < len(self.sdl_context.list_of_tables):
                old_table = self.sdl_context.current_table.name if self.sdl_context.current_table else "None"
                self.sdl_context.current_table = self.sdl_context.list_of_tables[table_index]
                new_table = self.sdl_context.current_table.name
                
                self.gui_state.chat_messages.append(f"Switched from '{old_table}' to '{new_table}'")
                logger.info(f"Switched to table: {new_table}")
            else:
                logger.error(f"Invalid table index: {table_index}")
                
        except Exception as e:
            error_msg = f"Error switching table: {e}"
            self.gui_state.chat_messages.append(error_msg)
            logger.error(error_msg)

    def _update_table_icons(self):
        """Update table icons - called when tables are added/removed"""
        # This method is called to trigger icon updates
        # The actual icon rendering happens in _render_table_icons()
        logger.info("Table icons updated")

    def _render_table_icons(self):
        """Render table icons in the top sidebar"""
        if not self.sdl_context.list_of_tables:
            return
        
        imgui.text("Quick Switch:")
        imgui.same_line()
        
        # Render table icons
        for i, table in enumerate(self.sdl_context.list_of_tables):
            if i > 0:  # Add spacing between icons
                imgui.same_line()
            
            # Choose icon based on table state
            icon = "📋"
            if table == self.sdl_context.current_table:
                icon = "📄"  # Different icon for current table
                imgui.push_style_color(imgui.Col_.button, (0.2, 0.6, 0.8, 1.0))
            
            # Create button with icon and table index
            button_label = f"{icon}##table_icon_{i}"
            if imgui.button(button_label):
                self._switch_to_table(i)
            
            # Tooltip with table name and info
            if imgui.is_item_hovered():
                tooltip_text = f"{table.name}\n{table.width}x{table.height}\nEntities: {sum(len(sprites) for sprites in table.dict_of_sprites_list.values())}"
                imgui.set_tooltip(tooltip_text)
            
            # Pop style color if we pushed it
            if table == self.sdl_context.current_table:
                imgui.pop_style_color()

    def _render_top_sidebar(self):
        """Render the top sidebar with table management"""
        if hasattr(self, 'initial_dock_setup') and "Table Management" in self.initial_dock_setup:
            setup = self.initial_dock_setup["Table Management"]
            imgui.set_next_window_pos(setup["pos"], imgui.Cond_.first_use_ever)
            imgui.set_next_window_size(setup["size"], imgui.Cond_.first_use_ever)
            imgui.set_next_window_dock_id(setup["dock_id"], imgui.Cond_.first_use_ever)
        
        window_open = imgui.begin("Table Management")
        
        try:
            if window_open[0]:
                # Table action buttons
                if imgui.button("New Table"):
                    self._create_new_table()
                imgui.same_line()
                
                if imgui.button("Load Table"):
                    self._load_table_from_disk()
                imgui.same_line()
                
                if imgui.button("Save Table"):
                    self._save_table_to_disk()
                imgui.same_line()
                
                if imgui.button("Delete Table"):
                    self._delete_current_table()
                
                imgui.separator()
                
                # Table icons for quick switching
                self._render_table_icons()
                
                imgui.separator()
                
                # Current table info
                if self.sdl_context.current_table:
                    table = self.sdl_context.current_table
                    imgui.text(f"Current: {table.name}")
                    imgui.same_line()
                    imgui.text(f"({table.width}x{table.height})")
                    imgui.same_line()
                    
                    # Show table stats
                    entity_count = sum(len(sprites) for sprites in table.dict_of_sprites_list.values())
                    imgui.text(f"Entities: {entity_count}")
                else:
                    imgui.text("No table loaded")
                
                # Detailed table list (collapsible)
                if self.sdl_context.list_of_tables and imgui.collapsing_header("All Tables"):
                    for i, table in enumerate(self.sdl_context.list_of_tables):
                        is_current = table == self.sdl_context.current_table
                        
                        # Table entry with selection
                        if imgui.selectable(f"📋 {table.name}##table_list_{i}", is_current)[0]:
                            self._switch_to_table(i)
                        
                        # Show additional info on same line
                        if imgui.is_item_hovered():
                            entity_count = sum(len(sprites) for sprites in table.dict_of_sprites_list.values())
                            tooltip = f"Size: {table.width}x{table.height}\nScale: {table.scale:.2f}\nEntities: {entity_count}\nPosition: ({table.x_moved:.1f}, {table.y_moved:.1f})"
                            imgui.set_tooltip(tooltip)
                        
        except Exception as e:
            logger.error(f"Error rendering top sidebar: {e}")
        finally:
            imgui.end()

def _serialize_table(self, table):
    """Serialize table for saving"""
    return {
        'name': table.name,
        'width': table.width if hasattr(table, 'width') else 1920,
        'height': table.height if hasattr(table, 'height') else 1080,
        'scale': table.scale if hasattr(table, 'scale') else 1.0,
        'x_moved': table.x_moved if hasattr(table, 'x_moved') else 0.0,
        'y_moved': table.y_moved if hasattr(table, 'y_moved') else 0.0,
        'show_grid': table.show_grid if hasattr(table, 'show_grid') else True,
        'cell_side': table.cell_side if hasattr(table, 'cell_side') else 20,
        'layers': {
            layer: [self._serialize_sprite(sprite) for sprite in sprites]
            for layer, sprites in table.dict_of_sprites_list.items()
        } if hasattr(table, 'dict_of_sprites_list') else {}
    }

def _serialize_sprite(self, sprite):
    """Serialize sprite for saving"""
    return {
        'texture_path': sprite.texture_path.decode() if isinstance(sprite.texture_path, bytes) else str(sprite.texture_path),
        'scale_x': sprite.scale_x if hasattr(sprite, 'scale_x') else 1.0,
        'scale_y': sprite.scale_y if hasattr(sprite, 'scale_y') else 1.0,
        'coord_x': sprite.coord_x.value if hasattr(sprite.coord_x, 'value') else float(sprite.coord_x),
        'coord_y': sprite.coord_y.value if hasattr(sprite.coord_y, 'value') else float(sprite.coord_y),
        'moving': sprite.moving if hasattr(sprite, 'moving') else False,
        'collidable': sprite.collidable if hasattr(sprite, 'collidable') else True,
        'layer': getattr(sprite, 'layer', 'tokens')  # Default to tokens layer
    }

def _get_selected_character(self):
    """Get currently selected character"""
    if (self.sdl_context.current_table and 
        self.sdl_context.current_table.selected_sprite and
        hasattr(self.sdl_context.current_table.selected_sprite, 'character')):
        return self.sdl_context.current_table.selected_sprite.character
    return None

def _cast_spell(self, spell):
    """Cast a spell"""
    self.gui_state.chat_messages.append(f"Casting {spell.name}!")
    logger.info(f"Casting spell: {spell.name}")

def _character_attack(self):
    """Handle character attack"""
    character = self._get_selected_character()
    if character:
        name = character.name if hasattr(character, 'name') else 'Character'
        self.gui_state.chat_messages.append(f"{name} attacks!")
        logger.info(f"Character {name} performs attack")
    else:
        self.gui_state.chat_messages.append("No character selected for attack!")

def _character_spell(self):
    """Handle character spell casting"""
    character = self._get_selected_character()
    if character and hasattr(character, 'spells') and character.spells:
        spell = character.spells[0]  # Use first spell for now
        self._cast_spell(spell)
    else:
        self.gui_state.chat_messages.append("No spells available!")

def _character_move(self):
    """Handle character movement"""
    character = self._get_selected_character()
    if character:
        name = character.name if hasattr(character, 'name') else 'Character'
        self.gui_state.chat_messages.append(f"{name} moves!")
        logger.info(f"Character {name} moves")
    else:
        self.gui_state.chat_messages.append("No character selected for movement!")

def _end_turn(self):
    """End current turn"""
    self.gui_state.chat_messages.append("Turn ended")
    logger.info("Turn ended")

def _roll_initiative(self):
    """Roll initiative"""
    import random
    result = random.randint(1, 20)
    self.gui_state.chat_messages.append(f"Initiative roll: {result}")
    logger.info(f"Initiative rolled: {result}")

def _save_game(self):
    """Save the entire game state"""
    try:
        import json
        game_state = {
            'current_table_index': self.sdl_context.list_of_tables.index(self.sdl_context.current_table) if self.sdl_context.current_table else 0,
            'tables': [self._serialize_table(table) for table in self.sdl_context.list_of_tables]
        }
        
        with open('game_save.json', 'w') as f:
            json.dump(game_state, f, indent=2)
            
        self.gui_state.chat_messages.append("Game saved successfully")
        logger.info("Game saved to game_save.json")
        
    except Exception as e:
        error_msg = f"Error saving game: {e}"
        self.gui_state.chat_messages.append(error_msg)
        logger.error(error_msg)

def _load_game(self):
    """Load the entire game state"""
    try:
        import json
        import os
        
        if not os.path.exists('game_save.json'):
            self.gui_state.chat_messages.append("No saved game found")
            return
            
        with open('game_save.json', 'r') as f:
            game_state = json.load(f)
        
        # Clear current tables
        for table in self.sdl_context.list_of_tables:
            self.sdl_context.cleanup_table(table)
        self.sdl_context.list_of_tables.clear()
        
        # Load tables
        for table_data in game_state.get('tables', []):
            self.sdl_context.create_table_from_json(table_data)
        
        # Set current table
        current_index = game_state.get('current_table_index', 0)
        if self.sdl_context.list_of_tables and current_index < len(self.sdl_context.list_of_tables):
            self.sdl_context.current_table = self.sdl_context.list_of_tables[current_index]
        
        # Update icons
        self._update_table_icons()
        
        self.gui_state.chat_messages.append("Game loaded successfully")
        logger.info("Game loaded from game_save.json")
        
    except Exception as e:
        error_msg = f"Error loading game: {e}"
        self.gui_state.chat_messages.append(error_msg)
        logger.error(error_msg)

def _add_character(self):
    """Add a character entity"""
    if not self.sdl_context.current_table:
        self.gui_state.chat_messages.append("No table selected")
        return
    
    try:
        # Create a test character
        import core_table.Character
        test_character = core_table.Character.Character(
            name=f"Character {len(self.sdl_context.current_table.dict_of_sprites_list['tokens']) + 1}",
            race="Human",
            char_class="Fighter",
            hp=20,
            level=1,
            stats={"STR": 15, "DEX": 12, "CON": 14, "INT": 10, "WIS": 13, "CHA": 11}
        )
        
        # Add sprite with character
        sprite = self.sdl_context.add_sprite(
            b"resources/woman.png",
            scale_x=0.5,
            scale_y=0.5,
            layer='tokens',
            character=test_character
        )
        
        if sprite:
            self.gui_state.chat_messages.append(f"Added character: {test_character.name}")
            logger.info(f"Added character: {test_character.name}")
        else:
            self.gui_state.chat_messages.append("Failed to add character")
            
    except Exception as e:
        error_msg = f"Error adding character: {e}"
        self.gui_state.chat_messages.append(error_msg)
        logger.error(error_msg)

def _add_monster(self):
    """Add a monster entity"""
    if not self.sdl_context.current_table:
        self.gui_state.chat_messages.append("No table selected")
        return
    
    try:
        # Add a monster sprite
        sprite = self.sdl_context.add_sprite(
            b"resources/token_1.png",
            scale_x=0.5,
            scale_y=0.5,
            layer='tokens',
            collidable=True
        )
        
        if sprite:
            self.gui_state.chat_messages.append("Added monster")
            logger.info("Added monster sprite")
        else:
            self.gui_state.chat_messages.append("Failed to add monster")
            
    except Exception as e:
        error_msg = f"Error adding monster: {e}"
        self.gui_state.chat_messages.append(error_msg)
        logger.error(error_msg)

# Fix the indentation and move these methods inside the class
def _activate_linear_measurement(self):
    """Activate linear measurement tool"""
    self.gui_state.measurement_mode = "linear"
    self.gui_state.chat_messages.append("Linear measurement activated")
    logger.info("Activated linear measurement")

def _activate_area_measurement(self):
    """Activate area measurement tool"""
    self.gui_state.measurement_mode = "area"
    self.gui_state.chat_messages.append("Area measurement activated")
    logger.info("Activated area measurement")

def _clear_measurements(self):
    """Clear all measurements"""
    self.gui_state.chat_messages.append("Measurements cleared")
    logger.info("Cleared all measurements")

def _delete_selected(self):
    """Delete selected sprite"""
    if not self.sdl_context.current_table or not self.sdl_context.current_table.selected_sprite:
        self.gui_state.chat_messages.append("No sprite selected")
        return
    
    try:
        sprite = self.sdl_context.current_table.selected_sprite
        if self.sdl_context.remove_sprite(sprite):
            self.gui_state.chat_messages.append("Selected sprite deleted")
            logger.info("Deleted selected sprite")
        else:
            self.gui_state.chat_messages.append("Failed to delete sprite")
    except Exception as e:
        error_msg = f"Error deleting sprite: {e}"
        self.gui_state.chat_messages.append(error_msg)
        logger.error(error_msg)

def _duplicate_selected(self):
    """Duplicate selected sprite"""
    if not self.sdl_context.current_table or not self.sdl_context.current_table.selected_sprite:
        self.gui_state.chat_messages.append("No sprite selected")
        return
    
    try:
        original = self.sdl_context.current_table.selected_sprite
        # Create duplicate with slight offset
        new_sprite = self.sdl_context.add_sprite(
            original.texture_path,
            scale_x=original.scale_x,
            scale_y=original.scale_y,
            layer='tokens',
            coord_x=original.coord_x.value + 50,
            coord_y=original.coord_y.value + 50
        )
        
        if new_sprite:
            self.gui_state.chat_messages.append("Sprite duplicated")
            logger.info("Duplicated selected sprite")
        else:
            self.gui_state.chat_messages.append("Failed to duplicate sprite")
            
    except Exception as e:
        error_msg = f"Error duplicating sprite: {e}"
        self.gui_state.chat_messages.append(error_msg)
        logger.error(error_msg)

def _group_selected(self):
    """Group selected sprites (placeholder)"""
    self.gui_state.chat_messages.append("Group function not implemented yet")
    logger.info("Group selected called (not implemented)")

def _toggle_network_connection(self):
    """Toggle network connection"""
    self.gui_state.chat_messages.append("Network connection toggled")
    logger.info("Toggling network connection")

def _request_table_from_server(self):
    """Request table from server"""
    if hasattr(self.sdl_context, 'protocol') and self.sdl_context.protocol:
        self.sdl_context.protocol.request_table()
        self.gui_state.chat_messages.append("Requested table from server")
        logger.info("Requested table from server")
    else:
        self.gui_state.chat_messages.append("No server connection")
        logger.warning("No protocol connection available")

def _upload_table_to_server(self):
    """Upload current table to server"""
    self.gui_state.chat_messages.append("Uploading table to server")
    logger.info("Uploading table to server")

def _sync_table_changes(self):
    """Sync table changes"""
    self.gui_state.chat_messages.append("Syncing table changes")
    logger.info("Syncing table changes")

def _send_network_ping(self):
    """Send network ping"""
    if hasattr(self.sdl_context, 'protocol') and self.sdl_context.protocol:
        self.sdl_context.protocol.ping()
        self.gui_state.chat_messages.append("Ping sent")
        logger.info("Sent network ping")
    else:
        self.gui_state.chat_messages.append("No server connection for ping")
        logger.warning("No protocol connection available")