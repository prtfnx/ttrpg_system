"""
Network Panel - Network connectivity and multiplayer features
"""

from imgui_bundle import imgui
import logging
import socket
import threading

logger = logging.getLogger(__name__)


class NetworkPanel:
    """Network panel for multiplayer connectivity and session sharing"""
    def __init__(self, context, actions_bridge):
        self.context = context
        self.actions_bridge = actions_bridge
        self.server_ip = "127.0.0.1"
        self.server_port = 8080
        self.player_name = "Player"
        self.is_hosting = False
        self.is_connected = False
        self.connection_status = "Disconnected"
        self.connected_players = []
    def render(self):
        """Render the network panel content"""
        # Always use collapsing header but don't return early to avoid Begin/End mismatches
        header_expanded = imgui.collapsing_header("Network & Multiplayer")
        
        if header_expanded:
            # Connection status
            self._render_status_section()
            
            # Host section
            self._render_host_section()
            
            # Join section  
            self._render_join_section()
            
            # Player management (if hosting)
            if self.is_hosting:
                self._render_player_management()
    
    def _render_status_section(self):
        """Render connection status section"""
        imgui.text("Status:")
        imgui.same_line()
        
        # Color code status
        if self.is_hosting:
            imgui.text_colored((0.2, 0.8, 0.2, 1.0), f"Hosting on port {self.server_port}")
        elif self.is_connected:
            imgui.text_colored((0.2, 0.8, 0.2, 1.0), f"Connected to {self.server_ip}:{self.server_port}")
        else:
            imgui.text_colored((0.8, 0.8, 0.2, 1.0), "Not connected")
        
        # Player name
        imgui.text("Player Name:")
        imgui.same_line()
        changed, self.player_name = imgui.input_text("##player_name", self.player_name, 32)
        
        imgui.separator()
    
    def _render_host_section(self):
        """Render hosting controls section"""
        if imgui.collapsing_header("Host Session"):
            # Port input
            imgui.text("Port:")
            imgui.same_line()
            changed, port_str = imgui.input_text("##host_port", str(self.server_port), 16)
            if changed:
                try:
                    self.server_port = int(port_str)
                except ValueError:
                    pass  # Keep old value if invalid
            
            # Host button
            if not self.is_hosting and not self.is_connected:
                if imgui.button("Start Hosting", (-1, 30)):
                    self._start_hosting()
            elif self.is_hosting:
                if imgui.button("Stop Hosting", (-1, 30)):
                    self._stop_hosting()
            else:
                imgui.text("Disconnect from current session first")
            
            # Show local IP
            if self.is_hosting or imgui.button("Show Local IP"):
                local_ip = self._get_local_ip()
                imgui.text(f"Local IP: {local_ip}")
                
                if imgui.button("Copy IP"):
                    # Copy to clipboard would require additional setup
                    logger.info(f"Local IP: {local_ip}")
    
    def _render_join_section(self):
        """Render join session controls section"""
        if imgui.collapsing_header("Join Session"):
            # Server IP input
            imgui.text("Server IP:")
            imgui.same_line()
            changed, self.server_ip = imgui.input_text("##server_ip", self.server_ip, 64)
            
            # Port input
            imgui.text("Port:")
            imgui.same_line()
            changed, port_str = imgui.input_text("##join_port", str(self.server_port), 16)
            if changed:
                try:
                    self.server_port = int(port_str)
                except ValueError:
                    pass
            
            # Connect button
            if not self.is_connected and not self.is_hosting:
                if imgui.button("Connect", (-1, 30)):
                    self._connect_to_server()
            elif self.is_connected:
                if imgui.button("Disconnect", (-1, 30)):
                    self._disconnect_from_server()
            else:
                imgui.text("Stop hosting first")
    
    def _render_player_management(self):
        """Render player management section (for hosts)"""
        if imgui.collapsing_header("Connected Players"):
            if not self.connected_players:
                imgui.text("No players connected")
            else:
                for i, player in enumerate(self.connected_players):
                    player_name = player.get('name', f'Player {i+1}')
                    player_ip = player.get('ip', 'Unknown')
                    
                    imgui.text(f"{player_name} ({player_ip})")
                    imgui.same_line()
                    
                    if imgui.small_button(f"Kick##{i}"):
                        self._kick_player(i)
            
            # Broadcast message section
            imgui.separator()
            imgui.text("Broadcast Message:")
            static_message = getattr(self, '_broadcast_message', "")
            changed, message = imgui.input_text("##broadcast", static_message, 256)
            self._broadcast_message = message
            
            if imgui.button("Send to All") and message.strip():
                self._broadcast_message_to_all(message.strip())
                self._broadcast_message = ""
    
    def _start_hosting(self):
        """Start hosting a session"""
        logger.info(f"Starting to host on port {self.server_port}")
        
        try:
            # Here you would start the actual server
            # For now, just simulate hosting
            self.is_hosting = True
            self.connection_status = f"Hosting on port {self.server_port}"
            
            # Update context if it supports hosting
            if hasattr(self.context, 'start_hosting'):
                self.context.start_hosting(self.server_port)
            
            # Add to chat
            if hasattr(self.context, 'add_chat_message'):
                self.context.add_chat_message(f"Started hosting on port {self.server_port}")
                
            logger.info("Hosting started successfully")
            
        except Exception as e:
            logger.error(f"Failed to start hosting: {e}")
            self.is_hosting = False
            if hasattr(self.context, 'add_chat_message'):
                self.context.add_chat_message("Failed to start hosting")
    
    def _stop_hosting(self):
        """Stop hosting the session"""
        logger.info("Stopping hosting")
        
        try:
            self.is_hosting = False
            self.connected_players.clear()
            self.connection_status = "Disconnected"
            
            # Update context
            if hasattr(self.context, 'stop_hosting'):
                self.context.stop_hosting()
            
            # Add to chat
            if hasattr(self.context, 'add_chat_message'):
                self.context.add_chat_message("Stopped hosting")
                
            logger.info("Hosting stopped")
            
        except Exception as e:
            logger.error(f"Error stopping hosting: {e}")
    
    def _connect_to_server(self):
        """Connect to a remote session"""
        logger.info(f"Connecting to {self.server_ip}:{self.server_port}")
        
        try:
            # Here you would establish the actual connection
            # For now, just simulate connection
            self.is_connected = True
            self.connection_status = f"Connected to {self.server_ip}:{self.server_port}"
            
            # Update context
            if hasattr(self.context, 'connect_to_server'):
                self.context.connect_to_server(self.server_ip, self.server_port, self.player_name)
            
            # Add to chat
            if hasattr(self.context, 'add_chat_message'):
                self.context.add_chat_message(f"Connected to {self.server_ip}:{self.server_port}")
                
            logger.info("Connected successfully")
            
        except Exception as e:
            logger.error(f"Failed to connect: {e}")
            self.is_connected = False
            if hasattr(self.context, 'add_chat_message'):
                self.context.add_chat_message("Failed to connect to server")
    
    def _disconnect_from_server(self):
        """Disconnect from the remote session"""
        logger.info("Disconnecting from server")
        
        try:
            self.is_connected = False
            self.connection_status = "Disconnected"
            
            # Update context
            if hasattr(self.context, 'disconnect_from_server'):
                self.context.disconnect_from_server()
            
            # Add to chat
            if hasattr(self.context, 'add_chat_message'):
                self.context.add_chat_message("Disconnected from server")
                
            logger.info("Disconnected successfully")
            
        except Exception as e:
            logger.error(f"Error disconnecting: {e}")
    
    def _kick_player(self, player_index):
        """Kick a player from the session"""
        if 0 <= player_index < len(self.connected_players):
            player = self.connected_players[player_index]
            player_name = player.get('name', f'Player {player_index+1}')
            
            logger.info(f"Kicking player: {player_name}")
            
            # Remove from list
            self.connected_players.pop(player_index)
            
            # Update context
            if hasattr(self.context, 'kick_player'):
                self.context.kick_player(player)
            
            # Add to chat
            if hasattr(self.context, 'add_chat_message'):
                self.context.add_chat_message(f"Kicked player: {player_name}")
    
    def _broadcast_message_to_all(self, message):
        """Broadcast a message to all connected players"""
        logger.info(f"Broadcasting message: {message}")
        
        # Update context
        if hasattr(self.context, 'broadcast_message'):
            self.context.broadcast_message(message)
        
        # Add to local chat
        if hasattr(self.context, 'add_chat_message'):
            self.context.add_chat_message(f"[Broadcast] {message}")
    
    def _get_local_ip(self):
        """Get the local IP address"""
        try:
            # Connect to a remote address to determine local IP
            with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
                s.connect(("8.8.8.8", 80))
                return s.getsockname()[0]
        except Exception:
            return "127.0.0.1"
    
    def add_connected_player(self, player_info):
        """Add a player to the connected players list"""
        self.connected_players.append(player_info)
        
        player_name = player_info.get('name', 'Unknown Player')
        logger.info(f"Player connected: {player_name}")
        
        if hasattr(self.context, 'add_chat_message'):
            self.context.add_chat_message(f"Player joined: {player_name}")
    
    def remove_connected_player(self, player_info):
        """Remove a player from the connected players list"""
        try:
            self.connected_players.remove(player_info)
            
            player_name = player_info.get('name', 'Unknown Player')
            logger.info(f"Player disconnected: {player_name}")
            
            if hasattr(self.context, 'add_chat_message'):
                self.context.add_chat_message(f"Player left: {player_name}")
                
        except ValueError:
            pass  # Player not in list
