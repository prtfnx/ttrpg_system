"""
Table Panel - Top panel for table management and game state
"""

from imgui_bundle import imgui
import logging

logger = logging.getLogger(__name__)


class TablePanel:
    """Table panel for managing the game table, sessions, and global state"""
    def __init__(self, context, actions_bridge):
        self.context = context
        self.actions_bridge = actions_bridge
        self.session_name = "New Session"
        self.player_count = 4
        self.is_dm_mode = True
        
    def render(self):
        """Render the table panel content"""
        # Session info section
        imgui.text("Session:")
        imgui.same_line()
        changed, self.session_name = imgui.input_text("##session_name", self.session_name, 64)
        #imgui.same_line()
        imgui.text(f"Players: {self.player_count}")
        
        # DM controls section
        imgui.same_line()
        imgui.text(" | ")  # Simple text separator
        imgui.same_line()
        
        # Mode toggle
        clicked, self.is_dm_mode = imgui.checkbox("DM Mode", self.is_dm_mode)
        if clicked:
            self._handle_mode_change()
        
        imgui.same_line()
        
        # Quick actions
        if imgui.button("Save Session"):
            self._handle_save_session()
        
        imgui.same_line()
        if imgui.button("Load Session"):
            self._handle_load_session()
        
        imgui.same_line()
        if imgui.button("New Session"):
            self._handle_new_session()
        
        # Table controls section
        imgui.same_line()
        imgui.text(" | ")  # Simple text separator
        imgui.same_line()
        
        imgui.text("Table:")
        imgui.same_line()
        if imgui.button("Reset View"):
            self._handle_reset_view()
        
        imgui.same_line()
        if imgui.button("Clear All"):
            self._handle_clear_table()
        
        # Network status (if applicable)
        imgui.same_line()
        imgui.text(" | ")  # Simple text separator
        imgui.same_line()
        
        # Show connection status
        is_hosting = getattr(self.context, 'is_hosting', False)
        is_connected = getattr(self.context, 'is_connected', False)
        
        if is_hosting:
            imgui.text_colored((0.2, 0.8, 0.2, 1.0), "Hosting")
        elif is_connected:
            imgui.text_colored((0.2, 0.8, 0.2, 1.0), "Connected")
        else:
            imgui.text_colored((0.8, 0.8, 0.2, 1.0), "Local")
    
    def _handle_mode_change(self):
        """Handle DM/Player mode change"""
        mode = "DM" if self.is_dm_mode else "Player"
        logger.info(f"Mode changed to: {mode}")
        
        if hasattr(self.context, 'set_dm_mode'):
            try:
                self.context.set_dm_mode(self.is_dm_mode)
            except Exception as e:
                logger.error(f"Failed to set mode: {e}")
                
        # Add chat message about mode change
        if hasattr(self.context, 'add_chat_message'):
            self.context.add_chat_message(f"Switched to {mode} mode")
    
    def _handle_save_session(self):
        """Handle saving the current session"""
        logger.info(f"Saving session: {self.session_name}")
        
        if hasattr(self.context, 'save_session'):
            try:
                self.context.save_session(self.session_name)
                if hasattr(self.context, 'add_chat_message'):
                    self.context.add_chat_message(f"Session '{self.session_name}' saved")
            except Exception as e:
                logger.error(f"Failed to save session: {e}")
                if hasattr(self.context, 'add_chat_message'):
                    self.context.add_chat_message("Failed to save session")
        else:
            logger.info("Save functionality not available")
            if hasattr(self.context, 'add_chat_message'):
                self.context.add_chat_message("Save functionality not implemented yet")
    
    def _handle_load_session(self):
        """Handle loading a session"""
        logger.info("Loading session requested")
        
        if hasattr(self.context, 'load_session'):
            try:
                # For now, just simulate loading
                self.context.load_session()
                if hasattr(self.context, 'add_chat_message'):
                    self.context.add_chat_message("Session loaded")
            except Exception as e:
                logger.error(f"Failed to load session: {e}")
                if hasattr(self.context, 'add_chat_message'):
                    self.context.add_chat_message("Failed to load session")
        else:
            logger.info("Load functionality not available")
            if hasattr(self.context, 'add_chat_message'):
                self.context.add_chat_message("Load functionality not implemented yet")
    
    def _handle_new_session(self):
        """Handle creating a new session"""
        logger.info("New session requested")
        
        # Reset session state
        self.session_name = "New Session"
        
        if hasattr(self.context, 'new_session'):
            try:
                self.context.new_session()
                if hasattr(self.context, 'add_chat_message'):
                    self.context.add_chat_message("New session started")
            except Exception as e:
                logger.error(f"Failed to create new session: {e}")
        else:
            if hasattr(self.context, 'add_chat_message'):
                self.context.add_chat_message("New session started")
    
    def _handle_reset_view(self):
        """Handle resetting the table view"""
        logger.info("Reset view requested")
        
        if hasattr(self.context, 'reset_view'):
            try:
                self.context.reset_view()
                if hasattr(self.context, 'add_chat_message'):
                    self.context.add_chat_message("View reset to center")
            except Exception as e:
                logger.error(f"Failed to reset view: {e}")
        else:
            logger.info("Reset view functionality not available")
    
    def _handle_clear_table(self):
        """Handle clearing the table"""
        logger.info("Clear table requested")
        
        if hasattr(self.context, 'clear_table'):
            try:
                self.context.clear_table()
                if hasattr(self.context, 'add_chat_message'):
                    self.context.add_chat_message("Table cleared")
            except Exception as e:
                logger.error(f"Failed to clear table: {e}")
        else:
            # Clear entities if available
            if hasattr(self.context, 'entities') and isinstance(self.context.entities, list):
                self.context.entities.clear()
                if hasattr(self.context, 'add_chat_message'):
                    self.context.add_chat_message("Entities cleared")
