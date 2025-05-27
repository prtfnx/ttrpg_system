from imgui_bundle import imgui
from imgui_bundle.python_backends.sdl3_backend import SDL3Renderer
from imgui_bundle import imgui_node_editor
import OpenGL.GL as gl
import sdl3
import ctypes
import logging
import sys


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
        
        # Fix: Ensure proper begin/end pairing with error handling
        window_open = imgui.begin("Tools")
        
        try:
            if window_open[0]:  # Only render content if window is open
                imgui.text("Tool Selection")
                imgui.separator()
                
                # Tool buttons
                tools = [
                    ("Select", "select", "🔍"),
                    ("Paint", "paint", "🎨"),
                    ("Dice", "dice", "🎲"),
                    ("Measure", "measure", "📏")
                ]
                
                style_pushed = False
                for name, tool_id, icon in tools:
                    if self.gui_state.selected_tool == tool_id:
                        imgui.push_style_color(imgui.Col_.button, (0.2, 0.6, 0.8, 1.0))
                        style_pushed = True
                    
                    if imgui.button(f"{icon} {name}", (-1, 40)):
                        self.gui_state.selected_tool = tool_id
                        self._on_tool_selected(tool_id)
                    
                    if style_pushed:
                        imgui.pop_style_color()
                        style_pushed = False
                
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
            # Always call end(), regardless of what happened
            imgui.end()

    def _render_paint_options(self):
        """Render paint tool options"""
        imgui.text("Paint Options")
        
        # Brush size
        _, self.gui_state.paint_brush_size = imgui.slider_int(
            "Brush Size", self.gui_state.paint_brush_size, 1, 50
        )
        
        # Color picker
        _, self.gui_state.paint_color = imgui.color_edit4(
            "Color", self.gui_state.paint_color
        )
        
        # Paint actions
        if imgui.button("Clear Canvas", (-1, 30)):
            self._clear_paint_canvas()
        
        if imgui.button("Undo Last Stroke", (-1, 30)):
            self._undo_paint_stroke()

    def _render_dice_options(self):
        """Render dice tool options"""
        imgui.text("Dice Options")
        
        dice_types = ["d4", "d6", "d8", "d10", "d12", "d20", "d100"]
        for dice in dice_types:
            if imgui.button(f"Roll {dice}", (-1, 30)):
                self._roll_dice(dice)

    def _render_measure_options(self):
        """Render measure tool options"""
        imgui.text("Measure Options")
        
        if imgui.button("Clear Measurements", (-1, 30)):
            self._clear_measurements()
        
        imgui.text("Units:")
        imgui.radio_button("Feet", True)
        imgui.radio_button("Meters", False)
        imgui.radio_button("Grid Squares", False)

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
        # Apply initial docking setup if available
        if hasattr(self, 'initial_dock_setup') and "Table Management" in self.initial_dock_setup:
            setup = self.initial_dock_setup["Table Management"]
            imgui.set_next_window_pos(setup["pos"], imgui.Cond_.first_use_ever)
            imgui.set_next_window_size(setup["size"], imgui.Cond_.first_use_ever)
            imgui.set_next_window_dock_id(setup["dock_id"], imgui.Cond_.first_use_ever)
        
        window_open = imgui.begin("Table Management")
        
        try:
            if window_open[0]:
                imgui.text("Tables")
                imgui.same_line()
                
                if imgui.button("New Table"):
                    self._create_new_table()
                imgui.same_line()
                
                if imgui.button("Load Table"):
                    self._load_table()
                imgui.same_line()
                
                if imgui.button("Save Table"):
                    self._save_table()
                
                # Table list
                if self.gui_state.table_list:
                    imgui.text("Current Tables:")
                    for i, table in enumerate(self.gui_state.table_list):
                        if imgui.selectable(f"Table {i+1}: {table}", i == self.gui_state.selected_table)[0]:
                            self.gui_state.selected_table = i
                            self._switch_to_table(i)
                            
        except Exception as e:
            logger.error(f"Error rendering top sidebar: {e}")
        finally:
            imgui.end()

    def _render_bottom_sidebar(self):
        """Render the bottom sidebar with action buttons and chat"""
        # Apply initial docking setup if available
        if hasattr(self, 'initial_dock_setup') and "Actions & Quick Chat" in self.initial_dock_setup:
            setup = self.initial_dock_setup["Actions & Quick Chat"]
            imgui.set_next_window_pos(setup["pos"], imgui.Cond_.first_use_ever)
            imgui.set_next_window_size(setup["size"], imgui.Cond_.first_use_ever)
            imgui.set_next_window_dock_id(setup["dock_id"], imgui.Cond_.first_use_ever)
        
        window_open = imgui.begin("Actions & Quick Chat")
        
        try:
            if window_open[0]:
                # Action buttons
                imgui.text("Quick Actions")
                
                if imgui.button("Initiative"):
                    self._roll_initiative()
                imgui.same_line()
                
                if imgui.button("Save Game"):
                    self._save_game()
                imgui.same_line()
                
                if imgui.button("Load Game"):
                    self._load_game()
                imgui.same_line()
                
                if imgui.button("End Turn"):
                    self._end_turn()
                
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
        # Apply initial docking setup if available
        if hasattr(self, 'initial_dock_setup') and "Information Panel" in self.initial_dock_setup:
            setup = self.initial_dock_setup["Information Panel"]
            imgui.set_next_window_pos(setup["pos"], imgui.Cond_.first_use_ever)
            imgui.set_next_window_size(setup["size"], imgui.Cond_.first_use_ever)
            imgui.set_next_window_dock_id(setup["dock_id"], imgui.Cond_.first_use_ever)
        
        window_open = imgui.begin("Information Panel")
        
        try:
            if window_open[0]:
                # Tab bar
                if imgui.begin_tab_bar("RightTabs"):
                    
                    if imgui.begin_tab_item("Chat")[0]:
                        self._render_chat_tab()
                        imgui.end_tab_item()
                    
                    if imgui.begin_tab_item("Entities")[0]:
                        self._render_entities_tab()
                        imgui.end_tab_item()
                    
                    if imgui.begin_tab_item("Debug")[0]:
                        self._render_debug_tab()
                        imgui.end_tab_item()
                    
                    if imgui.begin_tab_item("Network")[0]:
                        self._render_network_tab()
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
        
        # Chat history
        if imgui.begin_child("ChatHistory", (0, -60)):
            for message in self.gui_state.chat_messages:
                imgui.text(message)
        imgui.end_child()
        
        # Chat input
        imgui.separator()
        _, self.gui_state.chat_input = imgui.input_text_multiline(
            "##detailed_chat", self.gui_state.chat_input, (-1, 40)
        )
        
        if imgui.button("Send Message", (-1, 0)):
            if self.gui_state.chat_input.strip():
                self._send_chat_message(self.gui_state.chat_input)
                self.gui_state.chat_input = ""

    def _render_entities_tab(self):
        """Render the entities management tab"""
        imgui.text("Entity Management")
        imgui.separator()
        
        if imgui.button("Add Character", (-1, 30)):
            self._add_character()
        
        if imgui.button("Add Monster", (-1, 30)):
            self._add_monster()
        
        if imgui.button("Add Object", (-1, 30)):
            self._add_object()
        
        imgui.separator()
        imgui.text("Entities on Table")
        
        # Entity list
        if imgui.begin_child("EntityList", (0, -100)):
            for i, entity in enumerate(self.gui_state.entity_list):
                if imgui.selectable(f"{entity.get('name', 'Unknown')} [{entity.get('type', 'Unknown')}]")[0]:
                    self.gui_state.selected_entity = i
        imgui.end_child()
        
        # Entity properties
        if self.gui_state.selected_entity is not None:
            imgui.separator()
            imgui.text("Entity Properties")
            # Add entity property editing here

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
            
            for layer, sprites in table.dict_of_sprites_list.items():
                if imgui.tree_node(f"{layer} ({len(sprites)} sprites)"):
                    for i, sprite in enumerate(sprites):
                        sprite_name = f"Sprite {i}: {sprite.texture_path.decode() if isinstance(sprite.texture_path, bytes) else sprite.texture_path}"
                        if imgui.selectable(sprite_name)[0]:
                            table.selected_sprite = sprite
                    imgui.tree_pop()
        
        imgui.separator()
        if imgui.button("Clear Debug Log", (-1, 30)):
            pass  # Implement debug log clearing

    def _render_network_tab(self):
        """Render the network management tab"""
        imgui.text("Network Status")
        imgui.separator()
        
        # Connection status
        is_connected = hasattr(self.sdl_context, 'net_client_started') and self.sdl_context.net_client_started
        
        if is_connected:
            imgui.text_colored((0, 1, 0, 1), "Connected")
        else:
            imgui.text_colored((1, 0, 0, 1), "Disconnected")
        
        if imgui.button("Reconnect" if is_connected else "Connect", (-1, 30)):
            self._toggle_connection()
        
        imgui.separator()
        imgui.text("Network Actions")
        
        if imgui.button("Sync Table", (-1, 30)):
            self._sync_table()
        
        if imgui.button("Request Table", (-1, 30)):
            self._request_table()
        
        if imgui.button("Send Ping", (-1, 30)):
            self._send_ping()

    # Event handlers
    def _on_tool_selected(self, tool_id):
        """Handle tool selection"""
        logger.info(f"Tool selected: {tool_id}")
        # Implement tool-specific logic here

    def _create_new_table(self):
        """Create a new table"""
        logger.info("Creating new table")
        # Implement table creation

    def _load_table(self):
        """Load a table"""
        logger.info("Loading table")
        # Implement table loading

    def _save_table(self):
        """Save current table"""
        logger.info("Saving table")
        # Implement table saving

    def _switch_to_table(self, table_index):
        """Switch to a different table"""
        logger.info(f"Switching to table {table_index}")
        # Implement table switching

    def _send_chat_message(self, message):
        """Send a chat message"""
        self.gui_state.chat_messages.append(f"You: {message}")
        logger.info(f"Chat message: {message}")
        # Implement actual message sending

    def _roll_dice(self, dice_type):
        """Roll dice"""
        import random
        sides = int(dice_type[1:])
        result = random.randint(1, sides)
        self.gui_state.chat_messages.append(f"Rolled {dice_type}: {result}")
        logger.info(f"Rolled {dice_type}: {result}")

    def _clear_paint_canvas(self):
        """Clear the paint canvas"""
        logger.info("Clearing paint canvas")
        # Implement paint canvas clearing

    def _undo_paint_stroke(self):
        """Undo last paint stroke"""
        logger.info("Undoing paint stroke")
        # Implement paint undo

    def _clear_measurements(self):
        """Clear all measurements"""
        logger.info("Clearing measurements")
        # Implement measurement clearing

    def _delete_selected(self):
        """Delete selected entities"""
        logger.info("Deleting selected")
        # Implement entity deletion

    def _duplicate_selected(self):
        """Duplicate selected entities"""
        logger.info("Duplicating selected")
        # Implement entity duplication

    def _group_selected(self):
        """Group selected entities"""
        logger.info("Grouping selected")
        # Implement entity grouping

    def _roll_initiative(self):
        """Roll initiative"""
        logger.info("Rolling initiative")
        # Implement initiative rolling

    def _save_game(self):
        """Save the game"""
        logger.info("Saving game")
        # Implement game saving

    def _load_game(self):
        """Load a game"""
        logger.info("Loading game")
        # Implement game loading

    def _end_turn(self):
        """End current turn"""
        logger.info("Ending turn")
        # Implement turn ending

    def _add_character(self):
        """Add a character entity"""
        logger.info("Adding character")
        # Implement character addition

    def _add_monster(self):
        """Add a monster entity"""
        logger.info("Adding monster")
        # Implement monster addition

    def _add_object(self):
        """Add an object entity"""
        logger.info("Adding object")
        # Implement object addition

    def _toggle_connection(self):
        """Toggle network connection"""
        logger.info("Toggling connection")
        # Implement connection toggling

    def _sync_table(self):
        """Sync table with server"""
        logger.info("Syncing table")
        # Implement table syncing

    def _request_table(self):
        """Request table from server"""
        logger.info("Requesting table")
        # Implement table request

    def _send_ping(self):
        """Send ping to server"""
        logger.info("Sending ping")
        # Implement ping sending