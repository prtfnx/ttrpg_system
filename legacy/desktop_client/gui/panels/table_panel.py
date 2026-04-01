"""
Table Panel - Top panel for table management and game state
Rewritten from scratch using ImGui best practices
"""

from imgui_bundle import imgui
from logger import setup_logger
logger = setup_logger(__name__)


class TablePanel:
    """Table panel for managing the game table, sessions, and global state"""
    
    def __init__(self, context, actions_bridge):
        self.context = context
        self.actions_bridge = actions_bridge
        
        # Session state
        self.session_name = "New Session"
        self.player_count = 4
        
        
        # Table creation state
        self.new_table_name = "New Table"
        self.new_table_width = 1920
        self.new_table_height = 1080
        self.show_table_creation = False
        
        # File dialog states
        self.show_save_dialog = False
        self.show_load_dialog = False
        self.save_filename = "table_session"
          # Global Style System
        self.current_style = "Default"
        self.available_styles = [
            "Default",
            "Fantasy Parchment", 
            "Dark Theme",
            "High Contrast",
            "Blue Steel",
            "Forest Green",
            "Royal Purple",
            "Cyberpunk",
            "Minimal Clean"
        ]
        self.current_style_index = 0  # Index for combo widget
        
        # Style application state
        self._last_applied_style = None
          # Performance optimization: Cache frequently accessed values
        self._cached_table_info = None
        self._cached_table = None
        self._cached_connection_status = None
        self._last_table_list_size = 0
        self._tab_ids_cache = {}  # Cache tab IDs to avoid string creation
        self._connection_cache_frame = 0  # Frame counter for connection cache

    def render(self):
        """Render the table panel content with clean layout"""
        try:
            # === ROW 0: Global Style Selector ===
            self._render_style_selector()
            imgui.separator()
            
            # === ROW 1: Current Table Status ===
            self._render_table_status()
            
            imgui.separator()
            
            # === ROW 2: Table Management Tabs and Actions ===
            if self.actions_bridge.can_access_panel('table'):
                imgui.text("Table Management:")
                imgui.same_line()
                    
                    # Render table management section
                self._render_table_management()
                
                imgui.separator()
                
                # === ROW 3: Session Controls ===
                self._render_session_controls()
            
                # Handle modal popups
                self._render_table_creation_popup()
                self._render_save_dialog()
                self._render_load_dialog()
            
        except Exception as e:            
            logger.error(f"Error rendering table panel: {e}")            
            imgui.text_colored((1.0, 0.2, 0.2, 1.0), f"Table Panel Error: {str(e)}")
    
    def _render_style_selector(self):
        """Render global style selector"""
        imgui.text("Style:")
        imgui.same_line()
        
        # Style combo box
        changed, new_style_index = imgui.combo("##style_selector", self.current_style_index, self.available_styles)
        if changed:
            self.current_style_index = new_style_index
            self.current_style = self.available_styles[new_style_index]
            self._apply_style(self.current_style)
        
        # Settings button
        imgui.same_line()
        if imgui.button("Settings"):
            self._open_settings_window()

    def _render_table_status(self):
        """Render current table status and sync indicator - OPTIMIZED"""
        current_table = self.context.current_table
        
        # Cache table info to avoid repeated getattr calls
        if current_table != self._cached_table:
            self._cached_table = current_table
            if current_table:
                self._cached_table_info = {
                    'name': getattr(current_table, 'name', 'Unknown'),
                    'width': getattr(current_table, 'width', 0),
                    'height': getattr(current_table, 'height', 0)
                }
            else:
                self._cached_table_info = None
        
        # Cache connection status every few frames to avoid constant method calls
        if (self._cached_connection_status is None or 
            getattr(self, '_connection_cache_frame', 0) % 30 == 0):  # Update every 30 frames (~0.5 seconds)
            
            # Get network status directly from context
            if hasattr(self.context, 'get_network_status'):
                self._cached_connection_status = self.context.get_network_status()
            else:
                # No network status available
                self._cached_connection_status = {
                    'is_connected': False,
                    'is_hosting': False,
                    'connection_quality': 'Unknown',
                    'ping_ms': 0,
                    'player_count': 0
                }
            self._connection_cache_frame = getattr(self, '_connection_cache_frame', 0) + 1
        else:
            self._connection_cache_frame = getattr(self, '_connection_cache_frame', 0) + 1
        
        # Current table info
        imgui.text("Current Table:")
        imgui.same_line()
        
        if self._cached_table_info:
            imgui.text_colored((0.2, 0.8, 0.2, 1.0), f"{self._cached_table_info['name']}")
            imgui.same_line()
            imgui.text_colored((0.6, 0.6, 0.6, 1.0), f"({self._cached_table_info['width']}x{self._cached_table_info['height']})")
        else:
            imgui.text_colored((0.8, 0.4, 0.4, 1.0), "None Selected")
        
        # Sync status indicator with enhanced network info
        imgui.same_line()
        imgui.text(" | Status:")
        imgui.same_line()
        
        if self._cached_connection_status['is_hosting']:
            imgui.text_colored((0.2, 0.8, 0.2, 1.0), "Hosting")
            if self._cached_connection_status['player_count'] > 0:
                imgui.same_line()
                imgui.text_colored((0.6, 0.6, 0.6, 1.0), f"({self._cached_connection_status['player_count']} players)")
        elif self._cached_connection_status['is_connected']:
            # Color code by connection quality
            quality = self._cached_connection_status['connection_quality']
            if quality == "Good":
                color = (0.2, 0.8, 0.2, 1.0)  # Green
            elif quality == "Fair":
                color = (0.8, 0.8, 0.2, 1.0)  # Yellow
            elif quality == "Poor":
                color = (0.8, 0.4, 0.2, 1.0)  # Orange
            else:
                color = (0.6, 0.6, 0.6, 1.0)  # Gray
            
            imgui.text_colored(color, f"Connected ({quality})")
            if self._cached_connection_status['ping_ms'] > 0:
                imgui.same_line()
                imgui.text_colored((0.6, 0.6, 0.6, 1.0), f"{self._cached_connection_status['ping_ms']}ms")
        else:
            imgui.text_colored((0.8, 0.8, 0.2, 1.0), "Local")

    def _render_table_management(self):
        """Render table selection tabs and management buttons"""
        # Row 1: Table selection tabs
        imgui.text("Tables:")
        imgui.same_line()
        self._render_table_selector()
        
        # Row 2: Table management buttons (always on separate line)
        imgui.text("Actions:")
        imgui.same_line()
        
        if imgui.button("New"):
            self.show_table_creation = True
            
        imgui.same_line()
        current_table = self.context.current_table
        if current_table:
            if imgui.button("Delete"):
                self._handle_delete_table()
                
            imgui.same_line()
            if imgui.button("Save"):
                self.show_save_dialog = True
                
            imgui.same_line()
            if imgui.button("Load"):
                self.show_load_dialog = True
        else:
            # Disabled buttons when no table selected
            imgui.push_style_var(imgui.StyleVar_.alpha.value, 0.5)
            imgui.button("Delete (No Table)")
            imgui.same_line()
            imgui.button("Save (No Table)")
            imgui.same_line()
            if imgui.button("Load"):
                self.show_load_dialog = True
            imgui.pop_style_var()

    def _render_table_selector(self):
        """Render table selection using tab bar with proper ImGui patterns - PERFORMANCE OPTIMIZED"""
        if not hasattr(self.context, 'list_of_tables') or not self.context.list_of_tables:
            imgui.text_colored((0.6, 0.6, 0.6, 1.0), "No tables available")
            return
        
        tables = self.context.list_of_tables
        current_table = self.context.current_table
        
        # Performance optimization: Cache tab information when table list changes
        if (len(tables) != self._last_table_list_size or 
            not hasattr(self, '_cached_tab_info')):
            
            self._last_table_list_size = len(tables)
            self._cached_tab_info = []
            
            # Pre-cache all table names and tab IDs to avoid repeated getattr calls
            for i, table in enumerate(tables):
                table_name = getattr(table, 'name', f'Table {i+1}')
                tab_id = f"{table_name}##TableTab_{i}"
                self._cached_tab_info.append({
                    'table': table,
                    'name': table_name,
                    'tab_id': tab_id,
                    'index': i
                })
        
        # Begin tab bar with proper cleanup
        if imgui.begin_tab_bar("TableSelector"):
            try:
                for tab_info in self._cached_tab_info:
                    table = tab_info['table']
                    table_name = tab_info['name']
                    tab_id = tab_info['tab_id']
                    
                    # Check if this table is currently selected
                    is_current = table == current_table
                    
                    # Set tab flags for current selection
                    tab_flags = 0
                    if is_current and not hasattr(self, '_tab_selected_once'):
                        # Only auto-select on first render to prevent continuous switching
                        tab_flags = imgui.TabItemFlags_.set_selected.value
                        self._tab_selected_once = True
                    
                    # Render tab item - only switch on user click
                    # Fix: ImGui Bundle returns tuple for begin_tab_item
                    tab_visible, tab_open = imgui.begin_tab_item(tab_id, None, tab_flags)
                    
                    if tab_visible:  # If tab is visible/active
                        try:
                            # Only switch tables if this tab was actually clicked (not just visible)
                            # We detect clicks by checking if tab was not already current
                            if not is_current:
                                logger.info(f"User clicked table tab: {table_name}")
                                self._switch_to_table(table)
                            
                            # Show table info inside the tab
                            imgui.text(f"Selected: {table_name}")
                            
                        finally:
                            imgui.end_tab_item()
                    
            finally:
                imgui.end_tab_bar()

    def _render_session_controls(self):
        """Render session management and mode controls"""
        # Session info
        imgui.text("Session:")
        imgui.same_line()
        imgui.set_next_item_width(120)
        changed, self.session_name = imgui.input_text("##session_name", self.session_name, 64)
        
        imgui.same_line()
        # Show actual connected players if hosting, or configured player count otherwise
        if self._cached_connection_status and self._cached_connection_status['is_hosting']:
            actual_players = self._cached_connection_status['player_count']
            imgui.text_colored((0.2, 0.8, 0.2, 1.0), f"Players: {actual_players} (Hosting)")
        elif self._cached_connection_status and self._cached_connection_status['is_connected']:
            imgui.text_colored((0.2, 0.8, 0.2, 1.0), f"Players: Connected")
            if 'ping_ms' in self._cached_connection_status:
                imgui.same_line()
                imgui.text_colored((0.6, 0.6, 0.6, 1.0), f"({self._cached_connection_status['ping_ms']}ms)")
        else:
            imgui.text(f"Players: {self.player_count} (Local)")
        
        imgui.same_line()
        imgui.text("|")
        imgui.same_line()
        
        # Network status indicator
        if self._cached_connection_status:
            if self._cached_connection_status['is_hosting']:
                imgui.text_colored((0.2, 0.8, 0.2, 1.0), "🌐 HOST")
            elif self._cached_connection_status['is_connected']:
                quality = self._cached_connection_status.get('connection_quality', 'Unknown')
                quality_colors = {
                    "Good": (0.2, 0.8, 0.2, 1.0),
                    "Fair": (0.8, 0.8, 0.2, 1.0), 
                    "Poor": (0.8, 0.3, 0.2, 1.0),
                    "Unknown": (0.6, 0.6, 0.6, 1.0)
                }
                color = quality_colors.get(quality, quality_colors["Unknown"])
                imgui.text_colored(color, f"🌐 {quality}")
            else:
                imgui.text_colored((0.6, 0.6, 0.6, 1.0), "🏠 LOCAL")
        else:
            imgui.text_colored((0.6, 0.6, 0.6, 1.0), "🏠 LOCAL")
        
        imgui.same_line()
        imgui.text("|")
        imgui.same_line()
        
        # Session actions
        if imgui.button("Save Session"):
            self._handle_save_session()
        
        imgui.same_line()
        if imgui.button("Load Session"):
            self._handle_load_session()
        
        imgui.same_line()
        if imgui.button("New Session"):
            self._handle_new_session()
        
        imgui.same_line()
        imgui.text("|")
        imgui.same_line()
        
        # Table view actions
        if imgui.button("Reset View"):
            self._handle_reset_view()
        
        imgui.same_line()
        if imgui.button("Clear All"):
            self._handle_clear_table()

    def _render_table_creation_popup(self):
        """Render table creation modal popup"""
        if self.show_table_creation:
            imgui.open_popup("Create New Table")
          # Center the popup
        viewport = imgui.get_main_viewport()
        center_x = viewport.work_pos.x + viewport.work_size.x * 0.5
        center_y = viewport.work_pos.y + viewport.work_size.y * 0.5
        imgui.set_next_window_pos((center_x, center_y), imgui.Cond_.appearing.value, (0.5, 0.5))
        
        if imgui.begin_popup_modal("Create New Table", None, imgui.WindowFlags_.always_auto_resize.value)[0]:
            try:
                imgui.text("Create a new table")
                imgui.separator()
                
                # Table configuration
                imgui.text("Table Name:")
                imgui.set_next_item_width(200)
                changed, self.new_table_name = imgui.input_text("##new_table_name", self.new_table_name, 128)
                
                imgui.text("Dimensions:")
                imgui.set_next_item_width(100)
                changed, self.new_table_width = imgui.input_int("Width##new_width", self.new_table_width)
                self.new_table_width = max(800, self.new_table_width)
                
                imgui.same_line()
                imgui.set_next_item_width(100)
                changed, self.new_table_height = imgui.input_int("Height##new_height", self.new_table_height)
                self.new_table_height = max(600, self.new_table_height)
                
                imgui.separator()
                
                # Action buttons
                if imgui.button("Create", (80, 30)):
                    self._handle_create_table()
                    self.show_table_creation = False
                    imgui.close_current_popup()
                
                imgui.same_line()
                if imgui.button("Cancel", (80, 30)):
                    self.show_table_creation = False
                    imgui.close_current_popup()
                    
            finally:
                imgui.end_popup()

    def _render_save_dialog(self):
        """Render save file dialog"""
        if self.show_save_dialog:
            imgui.open_popup("Save Table")
          # Center the popup
        viewport = imgui.get_main_viewport()
        center_x = viewport.work_pos.x + viewport.work_size.x * 0.5
        center_y = viewport.work_pos.y + viewport.work_size.y * 0.5
        imgui.set_next_window_pos((center_x, center_y), imgui.Cond_.appearing.value, (0.5, 0.5))
        
        if imgui.begin_popup_modal("Save Table", None, imgui.WindowFlags_.always_auto_resize.value)[0]:
            try:
                imgui.text("Save current table and session")
                imgui.separator()
                
                imgui.text("Filename:")
                imgui.set_next_item_width(200)
                changed, self.save_filename = imgui.input_text("##save_filename", self.save_filename, 128)
                
                imgui.separator()
                
                # Action buttons
                if imgui.button("Save", (80, 30)):
                    self._handle_save_table()
                    self.show_save_dialog = False
                    imgui.close_current_popup()
                
                imgui.same_line()
                if imgui.button("Cancel", (80, 30)):
                    self.show_save_dialog = False
                    imgui.close_current_popup()
                    
            finally:
                imgui.end_popup()

    def _render_load_dialog(self):
        """Render load file dialog"""
        if self.show_load_dialog:
            imgui.open_popup("Load Table")
        
        # Center the popup
        viewport = imgui.get_main_viewport()
        center_x = viewport.work_pos.x + viewport.work_size.x * 0.5
        center_y = viewport.work_pos.y + viewport.work_size.y * 0.5
        imgui.set_next_window_pos((center_x, center_y), imgui.Cond_.appearing.value, (0.5, 0.5))
        
        if imgui.begin_popup_modal("Load Table", None, imgui.WindowFlags_.always_auto_resize.value)[0]:
            try:
                imgui.text("Load saved table and session")
                imgui.separator()
                
                # TODO: Add file browser or list of saved files
                imgui.text("Available saved tables:")
                imgui.text("(File browser not implemented yet)")
                
                imgui.separator()
                
                # Action buttons
                if imgui.button("Load", (80, 30)):
                    self._handle_load_table()
                    self.show_load_dialog = False
                    imgui.close_current_popup()
                
                imgui.same_line()
                if imgui.button("Cancel", (80, 30)):
                    self.show_load_dialog = False
                    imgui.close_current_popup()
                    
            finally:
                imgui.end_popup()    # === Event Handlers ===
    
    def _switch_to_table(self, table):
        """Switch to a different table - only called on user interaction"""
        if table != self.context.current_table:
            table_name = getattr(table, 'name', 'Unknown')
            logger.info(f"Switching to table: {table_name}")
            
            # Update context
            self.context.current_table = table
            
            # Invalidate table cache since current table changed
            self._cached_table = None
            self._cached_table_info = None
            
            # Add chat message if available
            if hasattr(self.context, 'add_chat_message'):
                self.context.add_chat_message(f"Switched to table: {table_name}")

    def _handle_create_table(self):
        """Handle creating a new table with network validation"""
        try:
            if not self.new_table_name.strip():
                logger.warning("Cannot create table with empty name")
                if hasattr(self.context, 'add_chat_message'):
                    self.context.add_chat_message("Error: Table name cannot be empty")
                return
            
            # Network validation - check permissions for networked sessions
            if hasattr(self.context, 'validate_network_permission'):
                if not self.context.validate_network_permission('create_table'):
                    logger.warning("Cannot create table - insufficient network permissions")
                    if hasattr(self.context, 'add_chat_message'):
                        self.context.add_chat_message("Cannot create table - only host can create tables in networked session")
                    return
                
            logger.info(f"Creating new table: {self.new_table_name}")
            
            # Call actions bridge to create table
            if hasattr(self.actions_bridge, 'create_table'):
                success = self.actions_bridge.create_table(
                    self.new_table_name.strip(), 
                    self.new_table_width, 
                    self.new_table_height
                )
                
                if success:
                    # Notify network about table creation
                    if hasattr(self.context, 'broadcast_table_change'):
                        self.context.broadcast_table_change(
                            self.new_table_name.strip(),
                            'table_created',
                            {
                                'name': self.new_table_name.strip(),
                                'width': self.new_table_width,
                                'height': self.new_table_height
                            }
                        )
                    
                    if hasattr(self.context, 'add_chat_message'):
                        self.context.add_chat_message(f"Created table: {self.new_table_name}")
                    logger.info(f"Successfully created table: {self.new_table_name}")
                else:
                    logger.error(f"Failed to create table: {self.new_table_name}")
                    if hasattr(self.context, 'add_chat_message'):
                        self.context.add_chat_message(f"Failed to create table: {self.new_table_name}")
            else:
                logger.warning("Create table action not available")
                if hasattr(self.context, 'add_chat_message'):
                    self.context.add_chat_message("Table creation not available")
                
        except Exception as e:
            logger.error(f"Exception while creating table: {e}")
            if hasattr(self.context, 'add_chat_message'):
                self.context.add_chat_message(f"Error creating table: {str(e)}")

    def _handle_delete_table(self):
        """Handle deleting the current table with network validation"""
        current_table = self.context.current_table
        if not current_table:
            return
        
        table_name = getattr(current_table, 'name', 'Unknown')
        
        # Network validation - only host or local user can delete tables
        if self._cached_connection_status and self._cached_connection_status['is_connected'] and not self._cached_connection_status['is_hosting']:
            logger.warning("Cannot delete table - not host in networked session")
            if hasattr(self.context, 'add_chat_message'):
                self.context.add_chat_message("Cannot delete table - only host can delete tables in networked session")
            return
        
        logger.info(f"Deleting table: {table_name}")
        
        try:
            if hasattr(self.actions_bridge, 'delete_table'):
                success = self.actions_bridge.delete_table(table_name)
                
                if success:
                    if hasattr(self.context, 'add_chat_message'):
                        self.context.add_chat_message(f"Deleted table: {table_name}")
                else:
                    logger.error(f"Failed to delete table: {table_name}")
                    if hasattr(self.context, 'add_chat_message'):
                        self.context.add_chat_message(f"Failed to delete table: {table_name}")
            else:
                logger.warning("Delete table action not available")
                if hasattr(self.context, 'add_chat_message'):
                    self.context.add_chat_message("Table deletion not available")
                    
        except Exception as e:
            logger.error(f"Exception while deleting table: {e}")
            if hasattr(self.context, 'add_chat_message'):
                self.context.add_chat_message(f"Error deleting table: {str(e)}")

    def _handle_save_table(self):
        """Handle saving the current table with network considerations"""
        if not self.save_filename.strip():
            logger.warning("Cannot save with empty filename")
            if hasattr(self.context, 'add_chat_message'):
                self.context.add_chat_message("Error: Filename cannot be empty")
            return
            
        # Network notification - inform about save in networked sessions
        if self._cached_connection_status and (self._cached_connection_status['is_hosting'] or self._cached_connection_status['is_connected']):
            if hasattr(self.context, 'add_chat_message'):
                self.context.add_chat_message(f"Saving table locally: {self.save_filename}")
        
        logger.info(f"Saving table to: {self.save_filename}")
        
        try:
            if hasattr(self.actions_bridge, 'save_table'):
                success = self.actions_bridge.save_table(self.save_filename.strip())
                
                if success:
                    if hasattr(self.context, 'add_chat_message'):
                        self.context.add_chat_message(f"Table saved as: {self.save_filename}")
                else:
                    logger.error(f"Failed to save table: {self.save_filename}")
                    if hasattr(self.context, 'add_chat_message'):
                        self.context.add_chat_message(f"Failed to save table: {self.save_filename}")
            else:
                logger.warning("Save table action not available")
                if hasattr(self.context, 'add_chat_message'):
                    self.context.add_chat_message("Table saving not available")
                    
        except Exception as e:
            logger.error(f"Exception while saving table: {e}")
            if hasattr(self.context, 'add_chat_message'):
                self.context.add_chat_message(f"Error saving table: {str(e)}")

    def _handle_load_table(self):
        """Handle loading a saved table with network broadcasting"""
        logger.info("Loading table requested")
        
        # Network validation - only host can load tables in networked session
        if self._cached_connection_status and self._cached_connection_status['is_connected'] and not self._cached_connection_status['is_hosting']:
            logger.warning("Cannot load table - not host in networked session")
            if hasattr(self.context, 'add_chat_message'):
                self.context.add_chat_message("Cannot load table - only host can load tables in networked session")
            return
        
        try:
            if hasattr(self.actions_bridge, 'load_table'):
                success = self.actions_bridge.load_table()
                
                if success:
                    # Broadcast table change to all connected players
                    if self._cached_connection_status and self._cached_connection_status['is_hosting']:
                        if hasattr(self.context, 'broadcast_table_change'):
                            self.context.broadcast_table_change("Table loaded by host")
                    
                    if hasattr(self.context, 'add_chat_message'):
                        self.context.add_chat_message("Table loaded successfully")
                        
                    # Notify players in networked session
                    if self._cached_connection_status and (self._cached_connection_status['is_hosting'] or self._cached_connection_status['is_connected']):
                        if hasattr(self.context, 'add_chat_message'):
                            self.context.add_chat_message("Table updated - all players will see the changes")
                else:
                    logger.error("Failed to load table")
                    if hasattr(self.context, 'add_chat_message'):
                        self.context.add_chat_message("Failed to load table")
            else:
                logger.info("Load table functionality not implemented yet")
                if hasattr(self.context, 'add_chat_message'):
                    self.context.add_chat_message("Load functionality not implemented yet")
                    
        except Exception as e:
            logger.error(f"Exception while loading table: {e}")
            if hasattr(self.context, 'add_chat_message'):
                self.context.add_chat_message(f"Error loading table: {str(e)}")

    def _handle_save_session(self):
        """Handle saving the current session"""
        logger.info(f"Saving session: {self.session_name}")
        
        try:
            if hasattr(self.context, 'save_session'):
                self.context.save_session(self.session_name)
                if hasattr(self.context, 'add_chat_message'):
                    self.context.add_chat_message(f"Session '{self.session_name}' saved")
            else:
                if hasattr(self.context, 'add_chat_message'):
                    self.context.add_chat_message("Save session functionality not implemented yet")
                    
        except Exception as e:
            logger.error(f"Failed to save session: {e}")
            if hasattr(self.context, 'add_chat_message'):
                self.context.add_chat_message("Failed to save session")

    def _handle_load_session(self):
        """Handle loading a session"""
        logger.info("Loading session requested")
        
        try:
            if hasattr(self.context, 'load_session'):
                self.context.load_session()
                if hasattr(self.context, 'add_chat_message'):
                    self.context.add_chat_message("Session loaded")
            else:
                if hasattr(self.context, 'add_chat_message'):
                    self.context.add_chat_message("Load session functionality not implemented yet")
                    
        except Exception as e:
            logger.error(f"Failed to load session: {e}")
            if hasattr(self.context, 'add_chat_message'):
                self.context.add_chat_message("Failed to load session")

    def _handle_new_session(self):
        """Handle creating a new session with network disconnection"""
        logger.info("New session requested")
        
        # Network validation - warn if in networked session
        if self._cached_connection_status and (self._cached_connection_status['is_hosting'] or self._cached_connection_status['is_connected']):
            logger.warning("Creating new session will disconnect from network")
            if hasattr(self.context, 'add_chat_message'):
                self.context.add_chat_message("Warning: Starting new session will disconnect from network")
            
            # Disconnect from network session
            if hasattr(self.context, 'disconnect_from_network'):
                self.context.disconnect_from_network()
            elif hasattr(self.context, 'network_panel'):
                network_panel = self.context.network_panel
                if network_panel.is_hosting:
                    network_panel._stop_hosting()
                elif network_panel.is_connected:
                    network_panel._disconnect_from_server()
        
        self.session_name = "New Session"
        
        try:
            if hasattr(self.context, 'new_session'):
                self.context.new_session()
            
            if hasattr(self.context, 'add_chat_message'):
                self.context.add_chat_message("New session started")
                
        except Exception as e:
            logger.error(f"Failed to create new session: {e}")
            if hasattr(self.context, 'add_chat_message'):
                self.context.add_chat_message("Failed to create new session")

    def _handle_reset_view(self):
        """Handle resetting the table view with network sync"""
        logger.info("Reset view requested")
        
        try:
            if hasattr(self.context, 'reset_view'):
                self.context.reset_view()
                
                # Broadcast view reset to connected players
                if self._cached_connection_status and self._cached_connection_status['is_hosting']:
                    if hasattr(self.context, 'broadcast_view_change'):
                        self.context.broadcast_view_change("view_reset")
                    if hasattr(self.context, 'add_chat_message'):
                        self.context.add_chat_message("View reset - synchronized with all players")
                elif self._cached_connection_status and self._cached_connection_status['is_connected']:
                    if hasattr(self.context, 'add_chat_message'):
                        self.context.add_chat_message("View reset locally")
                else:
                    if hasattr(self.context, 'add_chat_message'):
                        self.context.add_chat_message("View reset to center")
            else:
                logger.info("Reset view functionality not available")
                if hasattr(self.context, 'add_chat_message'):
                    self.context.add_chat_message("Reset view not available")
                    
        except Exception as e:
            logger.error(f"Failed to reset view: {e}")
            if hasattr(self.context, 'add_chat_message'):
                self.context.add_chat_message("Failed to reset view")

    def _handle_clear_table(self):
        """Handle clearing the table with network confirmation"""
        logger.info("Clear table requested")
        
        # Network validation - require confirmation in networked sessions
        if self._cached_connection_status and (self._cached_connection_status['is_hosting'] or self._cached_connection_status['is_connected']):
            if self._cached_connection_status['is_connected'] and not self._cached_connection_status['is_hosting']:
                logger.warning("Cannot clear table - not host in networked session")
                if hasattr(self.context, 'add_chat_message'):
                    self.context.add_chat_message("Cannot clear table - only host can clear table in networked session")
                return
            
            # Host clearing - warn about network implications
            if self._cached_connection_status['is_hosting']:
                if hasattr(self.context, 'add_chat_message'):
                    self.context.add_chat_message("Clearing table for all connected players...")
        
        try:
            if hasattr(self.context, 'clear_table'):
                self.context.clear_table()
                
                # Broadcast table clear to all players
                if self._cached_connection_status and self._cached_connection_status['is_hosting']:
                    if hasattr(self.context, 'broadcast_table_change'):
                        self.context.broadcast_table_change("table_cleared")
                    if hasattr(self.context, 'add_chat_message'):
                        self.context.add_chat_message("Table cleared for all players")
                else:
                    if hasattr(self.context, 'add_chat_message'):
                        self.context.add_chat_message("Table cleared")
                        
            elif hasattr(self.context, 'entities') and isinstance(self.context.entities, list):
                # Fallback: clear entities list
                self.context.entities.clear()
                if hasattr(self.context, 'add_chat_message'):
                    self.context.add_chat_message("Entities cleared")
            else:
                logger.info("Clear table functionality not available")
                if hasattr(self.context, 'add_chat_message'):
                    self.context.add_chat_message("Clear table not available")
                    
        except Exception as e:
            logger.error(f"Failed to clear table: {e}")
            if hasattr(self.context, 'add_chat_message'):
                self.context.add_chat_message("Failed to clear table")
                
    def _render_network_status_widget(self):
        """Render a compact network status widget that can be embedded anywhere"""
        if not self._cached_connection_status:
            imgui.text_colored((0.6, 0.6, 0.6, 1.0), "🏠 Local")
            return
            
        if self._cached_connection_status['is_hosting']:
            player_count = self._cached_connection_status.get('player_count', 0)
            imgui.text_colored((0.2, 0.8, 0.2, 1.0), f"🌐 Hosting ({player_count})")
        elif self._cached_connection_status['is_connected']:
            quality = self._cached_connection_status.get('connection_quality', 'Unknown')
            ping = self._cached_connection_status.get('ping_ms', 0)
            
            quality_colors = {
                "Good": (0.2, 0.8, 0.2, 1.0),
                "Fair": (0.8, 0.8, 0.2, 1.0), 
                "Poor": (0.8, 0.3, 0.2, 1.0),
                "Bad": (0.8, 0.2, 0.2, 1.0),
                "Unknown": (0.6, 0.6, 0.6, 1.0)
            }
            color = quality_colors.get(quality, quality_colors["Unknown"])
            imgui.text_colored(color, f"🌐 {quality} ({ping}ms)")
        else:
            imgui.text_colored((0.6, 0.6, 0.6, 1.0), "🏠 Local")

    def _get_network_status_tooltip(self):
        """Get detailed network status for tooltips"""
        if not self._cached_connection_status:
            return "Local session - no network connection"
            
        if self._cached_connection_status['is_hosting']:
            player_count = self._cached_connection_status.get('player_count', 0)
            return f"Hosting session with {player_count} connected players"
        elif self._cached_connection_status['is_connected']:
            quality = self._cached_connection_status.get('connection_quality', 'Unknown')
            ping = self._cached_connection_status.get('ping_ms', 0)
            return f"Connected to session\nConnection: {quality}\nPing: {ping}ms"
        else:
            return "Local session - not connected to any network session"
    def _apply_style(self, style_name):
        """Apply the selected global style theme to ImGui with comprehensive color coverage"""
        try:
            style = imgui.get_style()
            
            if style_name == "Default":
                # Use ImGui's default dark theme
                imgui.style_colors_dark()
                
            elif style_name == "Fantasy Parchment":
                # Fantasy parchment theme - comprehensive styling
                self._apply_fantasy_parchment_colors(style)
                
            elif style_name == "Dark Theme":
                # Enhanced dark theme
                imgui.style_colors_dark()
                style.frame_rounding = 4.0
                style.window_rounding = 8.0
                style.child_rounding = 4.0
                style.frame_padding = imgui.ImVec2(8, 4)
                
            elif style_name == "High Contrast":
                # High contrast theme for accessibility - comprehensive colors
                self._apply_high_contrast_colors(style)
                
            elif style_name == "Blue Steel":
                # Blue steel theme - comprehensive
                self._apply_blue_steel_colors(style)
                
            elif style_name == "Forest Green":
                # Forest green theme - comprehensive
                self._apply_forest_green_colors(style)
                
            elif style_name == "Royal Purple":
                # Royal purple theme - comprehensive
                self._apply_royal_purple_colors(style)
                
            elif style_name == "Cyberpunk":
                # Cyberpunk neon theme - comprehensive
                self._apply_cyberpunk_colors(style)
                
            elif style_name == "Minimal Clean":
                # Minimal clean light theme - comprehensive
                self._apply_minimal_clean_colors(style)
                
            # Cache the applied style to avoid redundant applications
            self._last_applied_style = style_name
            
            logger.info(f"Applied comprehensive style: {style_name}")
            
        except Exception as e:
            logger.error(f"Failed to apply style '{style_name}': {e}")
            
    def _apply_fantasy_parchment_colors(self, style):
        """Apply comprehensive fantasy parchment theme colors"""
        # Parchment colors
        parchment_bg = imgui.ImVec4(0.96, 0.92, 0.86, 1.00)  # Light parchment
        parchment_frame = imgui.ImVec4(0.98, 0.94, 0.82, 1.00)  # Slightly lighter
        parchment_hover = imgui.ImVec4(0.94, 0.90, 0.78, 1.00)  # Darker on hover
        parchment_active = imgui.ImVec4(0.92, 0.88, 0.76, 1.00)  # Even darker when active
        text_color = imgui.ImVec4(0.35, 0.27, 0.13, 1.00)  # Dark brown
        border_color = imgui.ImVec4(0.63, 0.47, 0.31, 1.00)  # Medium brown
        accent_color = imgui.ImVec4(0.55, 0.37, 0.21, 1.00)  # Brown accent
        
        # Apply comprehensive color scheme
        style.set_color_(imgui.Col_.text.value, text_color)
        style.set_color_(imgui.Col_.text_disabled.value, imgui.ImVec4(0.5, 0.4, 0.2, 1.0))
        style.set_color_(imgui.Col_.window_bg.value, parchment_bg)
        style.set_color_(imgui.Col_.child_bg.value, parchment_frame)
        style.set_color_(imgui.Col_.popup_bg.value, parchment_bg)
        style.set_color_(imgui.Col_.border.value, border_color)
        style.set_color_(imgui.Col_.border_shadow.value, imgui.ImVec4(0.0, 0.0, 0.0, 0.0))
        style.set_color_(imgui.Col_.frame_bg.value, parchment_frame)
        style.set_color_(imgui.Col_.frame_bg_hovered.value, parchment_hover)
        style.set_color_(imgui.Col_.frame_bg_active.value, parchment_active)
        style.set_color_(imgui.Col_.title_bg.value, accent_color)
        style.set_color_(imgui.Col_.title_bg_active.value, accent_color)
        style.set_color_(imgui.Col_.title_bg_collapsed.value, imgui.ImVec4(0.45, 0.27, 0.11, 0.8))
        style.set_color_(imgui.Col_.menu_bar_bg.value, parchment_frame)
        style.set_color_(imgui.Col_.scrollbar_bg.value, parchment_frame)
        style.set_color_(imgui.Col_.scrollbar_grab.value, accent_color)
        style.set_color_(imgui.Col_.scrollbar_grab_hovered.value, imgui.ImVec4(0.65, 0.47, 0.31, 1.0))
        style.set_color_(imgui.Col_.scrollbar_grab_active.value, imgui.ImVec4(0.75, 0.57, 0.41, 1.0))
        style.set_color_(imgui.Col_.check_mark.value, accent_color)
        style.set_color_(imgui.Col_.slider_grab.value, accent_color)
        style.set_color_(imgui.Col_.slider_grab_active.value, imgui.ImVec4(0.75, 0.57, 0.41, 1.0))
        style.set_color_(imgui.Col_.button.value, parchment_frame)
        style.set_color_(imgui.Col_.button_hovered.value, parchment_hover)
        style.set_color_(imgui.Col_.button_active.value, parchment_active)
        style.set_color_(imgui.Col_.header.value, parchment_hover)
        style.set_color_(imgui.Col_.header_hovered.value, parchment_active)
        style.set_color_(imgui.Col_.header_active.value, accent_color)
        style.set_color_(imgui.Col_.separator.value, border_color)
        style.set_color_(imgui.Col_.separator_hovered.value, accent_color)
        style.set_color_(imgui.Col_.separator_active.value, imgui.ImVec4(0.75, 0.57, 0.41, 1.0))
        style.set_color_(imgui.Col_.resize_grip.value, border_color)
        style.set_color_(imgui.Col_.resize_grip_hovered.value, accent_color)
        style.set_color_(imgui.Col_.resize_grip_active.value, imgui.ImVec4(0.75, 0.57, 0.41, 1.0))
        style.set_color_(imgui.Col_.tab.value, parchment_frame)
        style.set_color_(imgui.Col_.tab_hovered.value, parchment_hover)
        style.set_color_(imgui.Col_.tab_selected.value, parchment_active)
      
        style.set_color_(imgui.Col_.table_header_bg.value, accent_color)
        style.set_color_(imgui.Col_.table_border_strong.value, border_color)
        style.set_color_(imgui.Col_.table_border_light.value, imgui.ImVec4(0.73, 0.57, 0.41, 0.5))
        style.set_color_(imgui.Col_.table_row_bg.value, imgui.ImVec4(0.0, 0.0, 0.0, 0.0))
        style.set_color_(imgui.Col_.table_row_bg_alt.value, imgui.ImVec4(0.94, 0.90, 0.78, 0.3))
        
        # Fantasy styling
        style.frame_rounding = 5.0
        style.window_rounding = 10.0
        style.child_rounding = 8.0
        style.frame_padding = imgui.ImVec2(12, 8)
        style.item_spacing = imgui.ImVec2(12, 8)
        style.window_padding = imgui.ImVec2(20, 20)
        style.grab_rounding = 4.0
        style.tab_rounding = 6.0

    def _apply_high_contrast_colors(self, style):
        """Apply comprehensive high contrast theme colors"""
        # High contrast colors
        white = imgui.ImVec4(1.0, 1.0, 1.0, 1.0)
        black = imgui.ImVec4(0.0, 0.0, 0.0, 1.0)
        dark_gray = imgui.ImVec4(0.2, 0.2, 0.2, 1.0)
        med_gray = imgui.ImVec4(0.3, 0.3, 0.3, 1.0)
        light_gray = imgui.ImVec4(0.4, 0.4, 0.4, 1.0)
        
        # Apply high contrast colors
        style.set_color_(imgui.Col_.text.value, white)
        style.set_color_(imgui.Col_.text_disabled.value, imgui.ImVec4(0.6, 0.6, 0.6, 1.0))
        style.set_color_(imgui.Col_.window_bg.value, black)
        style.set_color_(imgui.Col_.child_bg.value, black)
        style.set_color_(imgui.Col_.popup_bg.value, black)
        style.set_color_(imgui.Col_.border.value, white)
        style.set_color_(imgui.Col_.border_shadow.value, imgui.ImVec4(0.0, 0.0, 0.0, 0.0))
        style.set_color_(imgui.Col_.frame_bg.value, dark_gray)
        style.set_color_(imgui.Col_.frame_bg_hovered.value, med_gray)
        style.set_color_(imgui.Col_.frame_bg_active.value, light_gray)
        style.set_color_(imgui.Col_.title_bg.value, dark_gray)
        style.set_color_(imgui.Col_.title_bg_active.value, med_gray)
        style.set_color_(imgui.Col_.title_bg_collapsed.value, dark_gray)
        style.set_color_(imgui.Col_.menu_bar_bg.value, dark_gray)
        style.set_color_(imgui.Col_.scrollbar_bg.value, black)
        style.set_color_(imgui.Col_.scrollbar_grab.value, dark_gray)
        style.set_color_(imgui.Col_.scrollbar_grab_hovered.value, med_gray)
        style.set_color_(imgui.Col_.scrollbar_grab_active.value, light_gray)
        style.set_color_(imgui.Col_.check_mark.value, white)
        style.set_color_(imgui.Col_.slider_grab.value, white)
        style.set_color_(imgui.Col_.slider_grab_active.value, light_gray)
        style.set_color_(imgui.Col_.button.value, dark_gray)
        style.set_color_(imgui.Col_.button_hovered.value, med_gray)
        style.set_color_(imgui.Col_.button_active.value, light_gray)
        style.set_color_(imgui.Col_.header.value, dark_gray)
        style.set_color_(imgui.Col_.header_hovered.value, med_gray)
        style.set_color_(imgui.Col_.header_active.value, light_gray)
        style.set_color_(imgui.Col_.separator.value, white)
        style.set_color_(imgui.Col_.separator_hovered.value, white)
        style.set_color_(imgui.Col_.separator_active.value, white)
        style.set_color_(imgui.Col_.resize_grip.value, white)
        style.set_color_(imgui.Col_.resize_grip_hovered.value, light_gray)        
        style.set_color_(imgui.Col_.resize_grip_active.value, white)
        style.set_color_(imgui.Col_.tab.value, dark_gray)
        style.set_color_(imgui.Col_.tab_hovered.value, med_gray)
        style.set_color_(imgui.Col_.tab_selected.value, light_gray)
        # Note: Some tab color enums may not be available in this imgui_bundle version
        style.set_color_(imgui.Col_.table_header_bg.value, dark_gray)
        style.set_color_(imgui.Col_.table_border_strong.value, white)
        style.set_color_(imgui.Col_.table_border_light.value, imgui.ImVec4(0.5, 0.5, 0.5, 1.0))
        style.set_color_(imgui.Col_.table_row_bg.value, imgui.ImVec4(0.0, 0.0, 0.0, 0.0))
        style.set_color_(imgui.Col_.table_row_bg_alt.value, imgui.ImVec4(0.1, 0.1, 0.1, 1.0))
        
        # High contrast styling
        style.frame_rounding = 0.0
        style.window_rounding = 0.0
        style.child_rounding = 0.0
        style.frame_padding = imgui.ImVec2(8, 6)
        style.item_spacing = imgui.ImVec2(8, 6)
        style.window_padding = imgui.ImVec2(16, 16)

    def _apply_blue_steel_colors(self, style):
        """Apply comprehensive blue steel theme colors"""
        # Blue steel colors
        steel_blue = imgui.ImVec4(0.2, 0.3, 0.5, 1.0)
        light_steel = imgui.ImVec4(0.3, 0.4, 0.6, 1.0)
        dark_steel = imgui.ImVec4(0.1, 0.2, 0.4, 1.0)
        accent_blue = imgui.ImVec4(0.4, 0.6, 0.9, 1.0)
        text_color = imgui.ImVec4(0.9, 0.9, 1.0, 1.0)
        
        imgui.style_colors_dark()  # Start with dark theme
        
        # Apply blue steel colors
        style.set_color_(imgui.Col_.text.value, text_color)
        style.set_color_(imgui.Col_.window_bg.value, dark_steel)
        style.set_color_(imgui.Col_.child_bg.value, steel_blue)
        style.set_color_(imgui.Col_.popup_bg.value, dark_steel)
        style.set_color_(imgui.Col_.frame_bg.value, steel_blue)
        style.set_color_(imgui.Col_.frame_bg_hovered.value, light_steel)
        style.set_color_(imgui.Col_.frame_bg_active.value, accent_blue)
        style.set_color_(imgui.Col_.title_bg.value, dark_steel)
        style.set_color_(imgui.Col_.title_bg_active.value, steel_blue)
        style.set_color_(imgui.Col_.button.value, steel_blue)
        style.set_color_(imgui.Col_.button_hovered.value, light_steel)
        style.set_color_(imgui.Col_.button_active.value, accent_blue)
        style.set_color_(imgui.Col_.header.value, steel_blue)
        style.set_color_(imgui.Col_.header_hovered.value, light_steel)
        style.set_color_(imgui.Col_.header_active.value, accent_blue)
        style.set_color_(imgui.Col_.tab.value, steel_blue)
        style.set_color_(imgui.Col_.tab_hovered.value, light_steel)
        style.set_color_(imgui.Col_.tab_selected.value, accent_blue)
        style.set_color_(imgui.Col_.table_header_bg.value, steel_blue)
        
        # Blue steel styling
        style.frame_rounding = 3.0
        style.window_rounding = 6.0
        style.child_rounding = 4.0

    def _apply_forest_green_colors(self, style):
        """Apply comprehensive forest green theme colors"""
        # Forest green colors
        forest_green = imgui.ImVec4(0.1, 0.3, 0.1, 1.0)
        light_green = imgui.ImVec4(0.2, 0.4, 0.2, 1.0)
        dark_green = imgui.ImVec4(0.05, 0.2, 0.05, 1.0)
        accent_green = imgui.ImVec4(0.3, 0.6, 0.3, 1.0)
        text_color = imgui.ImVec4(0.9, 1.0, 0.9, 1.0)
        
        imgui.style_colors_dark()  # Start with dark theme
        
        # Apply forest green colors
        style.set_color_(imgui.Col_.text.value, text_color)
        style.set_color_(imgui.Col_.window_bg.value, dark_green)
        style.set_color_(imgui.Col_.child_bg.value, forest_green)
        style.set_color_(imgui.Col_.popup_bg.value, dark_green)
        style.set_color_(imgui.Col_.frame_bg.value, forest_green)
        style.set_color_(imgui.Col_.frame_bg_hovered.value, light_green)
        style.set_color_(imgui.Col_.frame_bg_active.value, accent_green)
        style.set_color_(imgui.Col_.title_bg.value, dark_green)
        style.set_color_(imgui.Col_.title_bg_active.value, forest_green)
        style.set_color_(imgui.Col_.button.value, forest_green)
        style.set_color_(imgui.Col_.button_hovered.value, light_green)
        style.set_color_(imgui.Col_.button_active.value, accent_green)
        style.set_color_(imgui.Col_.header.value, forest_green)
        style.set_color_(imgui.Col_.header_hovered.value, light_green)
        style.set_color_(imgui.Col_.header_active.value, accent_green)
        style.set_color_(imgui.Col_.tab.value, forest_green)
        style.set_color_(imgui.Col_.tab_hovered.value, light_green)
        style.set_color_(imgui.Col_.tab_selected.value, accent_green)
        style.set_color_(imgui.Col_.table_header_bg.value, forest_green)

    def _apply_royal_purple_colors(self, style):
        """Apply comprehensive royal purple theme colors"""
        # Royal purple colors
        royal_purple = imgui.ImVec4(0.3, 0.1, 0.3, 1.0)
        light_purple = imgui.ImVec4(0.4, 0.2, 0.4, 1.0)
        dark_purple = imgui.ImVec4(0.2, 0.05, 0.2, 1.0)
        accent_purple = imgui.ImVec4(0.6, 0.3, 0.6, 1.0)
        text_color = imgui.ImVec4(1.0, 0.9, 1.0, 1.0)
        
        imgui.style_colors_dark()  # Start with dark theme
        
        # Apply royal purple colors
        style.set_color_(imgui.Col_.text.value, text_color)
        style.set_color_(imgui.Col_.window_bg.value, dark_purple)
        style.set_color_(imgui.Col_.child_bg.value, royal_purple)
        style.set_color_(imgui.Col_.popup_bg.value, dark_purple)
        style.set_color_(imgui.Col_.frame_bg.value, royal_purple)
        style.set_color_(imgui.Col_.frame_bg_hovered.value, light_purple)
        style.set_color_(imgui.Col_.frame_bg_active.value, accent_purple)
        style.set_color_(imgui.Col_.title_bg.value, dark_purple)
        style.set_color_(imgui.Col_.title_bg_active.value, royal_purple)
        style.set_color_(imgui.Col_.button.value, royal_purple)
        style.set_color_(imgui.Col_.button_hovered.value, light_purple)
        style.set_color_(imgui.Col_.button_active.value, accent_purple)
        style.set_color_(imgui.Col_.header.value, royal_purple)
        style.set_color_(imgui.Col_.header_hovered.value, light_purple)
        style.set_color_(imgui.Col_.header_active.value, accent_purple)
        style.set_color_(imgui.Col_.tab.value, royal_purple)
        style.set_color_(imgui.Col_.tab_hovered.value, light_purple)
        style.set_color_(imgui.Col_.tab_selected.value, accent_purple)
        style.set_color_(imgui.Col_.table_header_bg.value, royal_purple)

    def _apply_cyberpunk_colors(self, style):
        """Apply comprehensive cyberpunk theme colors"""
        # Cyberpunk colors
        cyber_dark = imgui.ImVec4(0.05, 0.05, 0.1, 1.0)
        cyber_frame = imgui.ImVec4(0.1, 0.1, 0.2, 1.0)
        neon_cyan = imgui.ImVec4(0.0, 1.0, 1.0, 1.0)
        neon_magenta = imgui.ImVec4(1.0, 0.0, 1.0, 1.0)
        neon_pink = imgui.ImVec4(1.0, 0.2, 0.6, 1.0)
        
        imgui.style_colors_dark()  # Start with dark theme
        
        # Apply cyberpunk colors
        style.set_color_(imgui.Col_.text.value, neon_cyan)
        style.set_color_(imgui.Col_.window_bg.value, cyber_dark)
        style.set_color_(imgui.Col_.child_bg.value, cyber_frame)
        style.set_color_(imgui.Col_.popup_bg.value, cyber_dark)
        style.set_color_(imgui.Col_.frame_bg.value, cyber_frame)
        style.set_color_(imgui.Col_.frame_bg_hovered.value, imgui.ImVec4(0.15, 0.15, 0.25, 1.0))
        style.set_color_(imgui.Col_.frame_bg_active.value, imgui.ImVec4(0.2, 0.2, 0.3, 1.0))
        style.set_color_(imgui.Col_.title_bg.value, cyber_dark)
        style.set_color_(imgui.Col_.title_bg_active.value, cyber_frame)
        style.set_color_(imgui.Col_.button.value, imgui.ImVec4(0.8, 0.0, 0.8, 0.6))
        style.set_color_(imgui.Col_.button_hovered.value, neon_magenta)
        style.set_color_(imgui.Col_.button_active.value, neon_pink)
        style.set_color_(imgui.Col_.header.value, cyber_frame)
        style.set_color_(imgui.Col_.header_hovered.value, imgui.ImVec4(0.15, 0.15, 0.25, 1.0))
        style.set_color_(imgui.Col_.header_active.value, neon_magenta)
        style.set_color_(imgui.Col_.tab.value, cyber_frame)
        style.set_color_(imgui.Col_.tab_hovered.value, imgui.ImVec4(0.15, 0.15, 0.25, 1.0))
        style.set_color_(imgui.Col_.tab_selected.value, neon_magenta)
        style.set_color_(imgui.Col_.table_header_bg.value, cyber_frame)
        
        # Cyberpunk styling - sharp edges
        style.frame_rounding = 0.0
        style.window_rounding = 0.0
        style.child_rounding = 0.0
        style.grab_rounding = 0.0
        style.tab_rounding = 0.0

    def _apply_minimal_clean_colors(self, style):
        """Apply comprehensive minimal clean theme colors"""
        # Minimal clean colors
        clean_white = imgui.ImVec4(1.0, 1.0, 1.0, 1.0)
        clean_bg = imgui.ImVec4(0.98, 0.98, 0.98, 1.0)
        clean_frame = imgui.ImVec4(0.95, 0.95, 0.95, 1.0)
        clean_hover = imgui.ImVec4(0.92, 0.92, 0.92, 1.0)
        clean_active = imgui.ImVec4(0.88, 0.88, 0.88, 1.0)
        clean_text = imgui.ImVec4(0.2, 0.2, 0.2, 1.0)
        clean_border = imgui.ImVec4(0.8, 0.8, 0.8, 1.0)
        clean_accent = imgui.ImVec4(0.0, 0.5, 1.0, 1.0)
        
        imgui.style_colors_light()  # Start with light theme
        
        # Apply minimal clean colors
        style.set_color_(imgui.Col_.text.value, clean_text)
        style.set_color_(imgui.Col_.window_bg.value, clean_bg)
        style.set_color_(imgui.Col_.child_bg.value, clean_white)
        style.set_color_(imgui.Col_.popup_bg.value, clean_white)
        style.set_color_(imgui.Col_.border.value, clean_border)
        style.set_color_(imgui.Col_.frame_bg.value, clean_frame)
        style.set_color_(imgui.Col_.frame_bg_hovered.value, clean_hover)
        style.set_color_(imgui.Col_.frame_bg_active.value, clean_active)
        style.set_color_(imgui.Col_.title_bg.value, clean_frame)
        style.set_color_(imgui.Col_.title_bg_active.value, clean_hover)
        style.set_color_(imgui.Col_.button.value, clean_frame)
        style.set_color_(imgui.Col_.button_hovered.value, clean_hover)
        style.set_color_(imgui.Col_.button_active.value, clean_active)
        style.set_color_(imgui.Col_.header.value, clean_frame)
        style.set_color_(imgui.Col_.header_hovered.value, clean_hover)
        style.set_color_(imgui.Col_.header_active.value, clean_accent)
        style.set_color_(imgui.Col_.tab.value, clean_frame)
        style.set_color_(imgui.Col_.tab_hovered.value, clean_hover)
        style.set_color_(imgui.Col_.tab_selected.value, clean_white)
        style.set_color_(imgui.Col_.table_header_bg.value, clean_frame)
        
        # Minimal clean styling
        style.frame_rounding = 2.0
        style.window_rounding = 4.0
        style.child_rounding = 2.0
        style.frame_padding = imgui.ImVec2(8, 4)
        style.item_spacing = imgui.ImVec2(8, 4)
        style.window_padding = imgui.ImVec2(12, 12)
        style.grab_rounding = 2.0
        style.tab_rounding = 2.0

    def _open_settings_window(self):
        """Open the settings window through the GUI system"""
        try:
            
            settings_window = None            
            
            if hasattr(self.context, 'imgui') and hasattr(self.context.imgui, 'settings_window'):
                settings_window = self.context.imgui.settings_window                
            
            if settings_window and hasattr(settings_window, 'open'):
                settings_window.open()
                logger.info("Settings window opened successfully")
            else:
                logger.warning("Settings window not available - no valid settings window found")
                logger.debug(f"Context has gui: {hasattr(self.context, 'gui')}")
                if hasattr(self.context, 'imgui'):
                    logger.debug(f"GUI has settings_window: {hasattr(self.context.imgui, 'settings_window')}")
                    
        except Exception as e:
            logger.error(f"Error opening settings window: {e}")
            import traceback
            logger.debug(f"Full traceback: {traceback.format_exc()}")
