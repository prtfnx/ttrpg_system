"""
Chat Panel - Bottom panel for chat functionality
"""

from imgui_bundle import imgui


from logger import setup_logger
logger = setup_logger(__name__)


class ChatPanel:
    """Chat panel for player and DM communication"""
    def __init__(self, context, actions_bridge):
        self.context = context
        self.actions_bridge = actions_bridge
        self.chat_input = ""
        self.chat_messages = []
        
    def render(self):
        """Render the chat panel content"""
        # Chat header
        imgui.text("Chat Messages")
        imgui.same_line()
        if imgui.small_button("Clear"):
            self.chat_messages.clear()
        
        # Chat history with scrolling
        imgui.begin_child("chat_history", (0, -35))
        
        try:
            # Get chat messages from context if available, otherwise use local
            messages = getattr(self.context, 'chat_messages', self.chat_messages)
            
            if not messages:
                imgui.text_colored((0.7, 0.7, 0.7, 1.0), "No messages yet...")
            else:
                for i, message in enumerate(messages):
                    # Alternate colors for readability
                    if isinstance(message, dict):
                        message = message.get('message', str(message))
                    if i % 2 == 0:
                        
                        imgui.text(str(message))
                    else:
                        imgui.text_colored((0.9, 0.9, 0.9, 1.0), str(message))
                
                # Auto-scroll to bottom
                if imgui.get_scroll_y() >= imgui.get_scroll_max_y():
                    imgui.set_scroll_here_y(1.0)
        finally:
            imgui.end_child()
        
        # Chat input area
        imgui.separator()
        
        # Input field and send button
        imgui.set_next_item_width(-80)  # Leave space for send button
        changed, self.chat_input = imgui.input_text("##chat_input", self.chat_input)
        
        imgui.same_line()
        send_clicked = imgui.button("Send", (70, 0))
        
        # Handle sending message
        if (send_clicked or (changed and imgui.is_key_pressed(imgui.Key.enter))) and self.chat_input.strip():
            self._send_message(self.chat_input.strip())
            self.chat_input = ""
            
        # Quick message buttons
        imgui.separator()
        imgui.text("Quick:")
        
        quick_messages = [
            "Yes", "No", "Maybe", "Ready", "Wait", "Help!"
        ]
        
        for i, msg in enumerate(quick_messages):
            if imgui.small_button(msg):
                self._send_message(msg)
            
            # Create 3 columns
            if (i + 1) % 3 != 0:
                imgui.same_line()
    
    def _send_message(self, message: str):
        """Send a chat message"""
        timestamp = self._get_timestamp()
        formatted_message = f"[{timestamp}] You: {message}"
        
        # Add to local messages
        self.chat_messages.append(formatted_message)
        
        # Try to send through context
        if hasattr(self.context, 'send_chat_message'):
            try:
                self.context.send_chat_message(message)
            except Exception as e:
                logger.error(f"Failed to send chat message: {e}")
                # Add error message to chat
                self.chat_messages.append(f"[{timestamp}] Error: Failed to send message")
        
        # If context has its own chat messages, add there too
        if hasattr(self.context, 'chat_messages'):
            if isinstance(self.context.chat_messages, list):
                self.context.chat_messages.append(formatted_message)
        
        logger.info(f"Chat message sent: {message}")
        
        # Keep only last 100 messages to prevent memory issues
        if len(self.chat_messages) > 100:
            self.chat_messages = self.chat_messages[-100:]
    
    def _get_timestamp(self):
        """Get formatted timestamp for messages"""
        import datetime
        return datetime.datetime.now().strftime("%H:%M")
    
    def add_system_message(self, message: str):
        """Add a system message to the chat"""
        timestamp = self._get_timestamp()
        formatted_message = f"[{timestamp}] System: {message}"
        self.chat_messages.append(formatted_message)
        
        # Also add to context if available
        if hasattr(self.context, 'chat_messages') and isinstance(self.context.chat_messages, list):
            self.context.chat_messages.append(formatted_message)
    
    def add_message(self, sender: str, message: str):
        """Add a message from another player or the DM"""
        timestamp = self._get_timestamp()
        formatted_message = f"[{timestamp}] {sender}: {message}"
        self.chat_messages.append(formatted_message)
        
        # Also add to context if available
        if hasattr(self.context, 'chat_messages') and isinstance(self.context.chat_messages, list):
            self.context.chat_messages.append(formatted_message)
