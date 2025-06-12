"""
Table Panel - Top panel for table management and game state
Rewritten from scratch using ImGui best practices
"""

from imgui_bundle import imgui
import logging

logger = logging.getLogger(__name__)


class TablePanel:
    """Table panel for managing the game table, sessions, and global state"""
    
    def __init__(self, context, actions_bridge):
        self.context = context
        self.actions_bridge = actions_bridge
        
        # Session state
        self.session_name = "New Session"
        self.player_count = 4
        self.is_dm_mode = True
        
        # Table creation state
        self.new_table_name = "New Table"
        self.new_table_width = 1920
        self.new_table_height = 1080
        self.show_table_creation = False
        
        # File dialog states
        self.show_save_dialog = False
        self.show_load_dialog = False
        self.save_filename = "table_session"
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
            # === ROW 1: Current Table Status ===
            self._render_table_status()
            
            imgui.separator()
            
            # === ROW 2: Table Management Tabs and Actions ===
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
        
        # Cache connection status every few frames to avoid constant getattr calls
        if (self._cached_connection_status is None or 
            getattr(self, '_connection_cache_frame', 0) % 30 == 0):  # Update every 30 frames (~0.5 seconds)
            self._cached_connection_status = {
                'is_hosting': getattr(self.context, 'is_hosting', False),
                'is_connected': getattr(self.context, 'is_connected', False)
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
        
        # Sync status indicator
        imgui.same_line()
        imgui.text(" | Status:")
        imgui.same_line()
        
        if self._cached_connection_status['is_hosting']:
            imgui.text_colored((0.2, 0.8, 0.2, 1.0), "Hosting")
        elif self._cached_connection_status['is_connected']:
            imgui.text_colored((0.2, 0.8, 0.2, 1.0), "Connected")
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
                    tab_selected = imgui.begin_tab_item(tab_id, None, tab_flags)
                    
                    if tab_selected[0]:  # If tab is visible/active
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
        imgui.text(f"Players: {self.player_count}")
        
        imgui.same_line()
        imgui.text("|")
        imgui.same_line()
        
        # Mode toggle
        clicked, self.is_dm_mode = imgui.checkbox("DM Mode", self.is_dm_mode)
        if clicked:
            self._handle_mode_change()
        
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
        """Handle creating a new table"""
        try:
            if not self.new_table_name.strip():
                logger.warning("Cannot create table with empty name")
                if hasattr(self.context, 'add_chat_message'):
                    self.context.add_chat_message("Error: Table name cannot be empty")
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
        """Handle deleting the current table"""
        current_table = self.context.current_table
        if not current_table:
            return
        
        table_name = getattr(current_table, 'name', 'Unknown')
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
        """Handle saving the current table"""
        if not self.save_filename.strip():
            logger.warning("Cannot save with empty filename")
            if hasattr(self.context, 'add_chat_message'):
                self.context.add_chat_message("Error: Filename cannot be empty")
            return
            
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
                logger.info("Save table functionality not implemented yet")
                if hasattr(self.context, 'add_chat_message'):
                    self.context.add_chat_message("Save functionality not implemented yet")
                    
        except Exception as e:
            logger.error(f"Exception while saving table: {e}")
            if hasattr(self.context, 'add_chat_message'):
                self.context.add_chat_message(f"Error saving table: {str(e)}")

    def _handle_load_table(self):
        """Handle loading a saved table"""
        logger.info("Loading table requested")
        
        try:
            if hasattr(self.actions_bridge, 'load_table'):
                success = self.actions_bridge.load_table()
                
                if success:
                    if hasattr(self.context, 'add_chat_message'):
                        self.context.add_chat_message("Table loaded successfully")
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

    def _handle_mode_change(self):
        """Handle DM/Player mode change"""
        mode = "DM" if self.is_dm_mode else "Player"
        logger.info(f"Mode changed to: {mode}")
        
        try:
            if hasattr(self.context, 'set_dm_mode'):
                self.context.set_dm_mode(self.is_dm_mode)
            
            if hasattr(self.context, 'add_chat_message'):
                self.context.add_chat_message(f"Switched to {mode} mode")
                
        except Exception as e:
            logger.error(f"Failed to set mode: {e}")
            if hasattr(self.context, 'add_chat_message'):
                self.context.add_chat_message("Failed to change mode")

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
        """Handle creating a new session"""
        logger.info("New session requested")
        
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
        """Handle resetting the table view"""
        logger.info("Reset view requested")
        
        try:
            if hasattr(self.context, 'reset_view'):
                self.context.reset_view()
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
        """Handle clearing the table"""
        logger.info("Clear table requested")
        
        try:
            if hasattr(self.context, 'clear_table'):
                self.context.clear_table()
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
