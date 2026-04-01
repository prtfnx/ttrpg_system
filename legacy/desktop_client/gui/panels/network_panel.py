"""
Network Panel - Network connectivity and multiplayer features
"""

from imgui_bundle import imgui
from typing import Dict, Any, List

import socket


from logger import setup_logger
logger = setup_logger(__name__)


class NetworkPanel:
    """Network panel for multiplayer connectivity and session sharing"""
    def __init__(self, context, actions_bridge):
        self.context = context
        self.actions_bridge = actions_bridge
        self.server_ip = "127.0.0.1"
        self.server_port = 8080
        self.player_name = "Player"
        
        # UI settings (not connection state)
        self.auto_reconnect = False
        self.connection_timeout = 30.0
        self.max_players = 6
        self.session_password = ""
        self.use_password = False
        
        # Network stats tracking
        self.messages_sent = 0
        self.messages_received = 0
        self.bytes_sent = 0
        self.bytes_received = 0
        
        # Connection and player management
        self.connected_players = []
        
        # Connection history for troubleshooting
        self.connection_log = []
        self.max_log_entries = 50
    
    def _safe_str(self, value, default=""):
        """Safely convert a value to string for ImGui text functions"""
        if value is None:
            return default
        if isinstance(value, dict):
            # If it's a dict, try to get a 'message' or 'text' field, otherwise convert to string
            return value.get('message', value.get('text', str(value)))
        return str(value)
    
    def _get_network_status(self) -> Dict[str, Any]:
        """Get current network status from actions bridge"""
        try:
            return self.actions_bridge.get_network_state()
        except Exception as e:
            logger.error(f"Failed to get network status: {e}")
            return {
                'connected': False,
                'players': [],
                'player_count': 0,
                'connection_status': {},
                'last_updated': 0,
                'error': str(e)
            }
    
    def render(self):
        """Render the network panel content"""
        # Always use collapsing header but don't return early to avoid Begin/End mismatches
        header_expanded = imgui.collapsing_header("Network & Multiplayer")
        
        if header_expanded:
            # Get current network status from context
            network_status = self._get_network_status()
            is_connected = network_status.get('is_connected', False)
            is_hosting = network_status.get('is_hosting', False)
            
            # Connection status
            self._render_status_section()
            
            # Host section
            self._render_host_section()
            
            # Join section  
            self._render_join_section()
            
            # Player management (if hosting)
            if is_hosting:
                self._render_player_management()
            
            # Network statistics (if connected or hosting)
            if is_connected or is_hosting:
                self._render_network_stats()
            
            # Connection log
            self._render_connection_log()
    
    def _render_status_section(self):
        """Render connection status section with enhanced indicators"""
        # Get current network status from context
        network_status = self._get_network_status()
        is_connected = network_status.get('is_connected', False)
        is_hosting = network_status.get('is_hosting', False)
        connection_quality = network_status.get('connection_quality', 'Unknown')
        ping_ms = network_status.get('ping_ms', 0)
        player_count = network_status.get('player_count', 0)
        max_players = network_status.get('max_players', self.max_players)
        
        # Ensure values are proper types for imgui
        connection_quality = self._safe_str(network_status.get('connection_quality'), 'Unknown')
        ping_ms = network_status.get('ping_ms', 0)
        if not isinstance(ping_ms, (int, float)):
            ping_ms = 0
        player_count = network_status.get('player_count', 0)
        if not isinstance(player_count, (int, float)):
            player_count = 0
        max_players = network_status.get('max_players', self.max_players)
        if not isinstance(max_players, (int, float)):
            max_players = self.max_players
        
        imgui.text("Status:")
        imgui.same_line()
        
        # Enhanced color-coded status with connection quality
        if is_hosting:
            imgui.text_colored((0.2, 0.8, 0.2, 1.0), f"Hosting on port {self.server_port}")
            imgui.same_line()
            imgui.text_colored((0.6, 0.6, 0.6, 1.0), f"({player_count}/{max_players} players)")
        elif is_connected:
            # Connection quality color coding
            quality_colors = {
                "Good": (0.2, 0.8, 0.2, 1.0),    # Green
                "Fair": (0.8, 0.8, 0.2, 1.0),    # Yellow  
                "Poor": (0.8, 0.3, 0.2, 1.0),    # Orange
                "Unknown": (0.6, 0.6, 0.6, 1.0)  # Gray
            }
            color = quality_colors.get(connection_quality, quality_colors["Unknown"])
            imgui.text_colored(color, f"Connected to {self.server_ip}:{self.server_port}")
            
            # Connection details on same line
            imgui.same_line()
            imgui.text_colored((0.6, 0.6, 0.6, 1.0), f"(Ping: {ping_ms}ms, {connection_quality})")
        else:
            imgui.text_colored((0.8, 0.4, 0.4, 1.0), "Not connected")
            if self.auto_reconnect:
                imgui.same_line()
                imgui.text_colored((0.8, 0.8, 0.2, 1.0), "(Auto-reconnect enabled)")
        
        # Player name input with validation
        imgui.text("Player Name:")
        imgui.same_line()
        changed, new_name = imgui.input_text("##player_name", self.player_name, 32)
        if changed:
            # Validate player name (no empty, no special chars for network safety)
            if new_name.strip() and len(new_name) <= 20 and new_name.replace(' ', '').replace('-', '').replace('_', '').isalnum():
                self.player_name = new_name.strip()
        
        # Auto-reconnect checkbox
        clicked, self.auto_reconnect = imgui.checkbox("Auto-reconnect", self.auto_reconnect)
        
        imgui.separator()
    
    def _render_host_section(self):
        """Render hosting controls section with enhanced options"""
        if imgui.collapsing_header("Host Session"):
            # Get current network status from context
            network_status = self._get_network_status()
            is_connected = network_status.get('is_connected', False)
            is_hosting = network_status.get('is_hosting', False)
            
            # Port input with validation
            imgui.text("Port:")
            imgui.same_line()
            changed, port_str = imgui.input_text("##host_port", str(self.server_port), 16)
            if changed:
                try:
                    new_port = int(port_str)
                    if 1024 <= new_port <= 65535:  # Valid port range
                        self.server_port = new_port
                except ValueError:
                    pass  # Keep old value if invalid
            
            # Max players setting
            imgui.text("Max Players:")
            imgui.same_line()
            imgui.set_next_item_width(100)
            changed, new_max = imgui.slider_int("##max_players", self.max_players, 2, 12)
            if changed:
                self.max_players = new_max
            
            # Password protection
            clicked, self.use_password = imgui.checkbox("Use Password", self.use_password)
            if self.use_password:
                imgui.text("Password:")
                imgui.same_line()
                # Use password input field if available, otherwise regular input
                if hasattr(imgui, 'input_text_with_hint'):
                    changed, self.session_password = imgui.input_text_with_hint("##session_password", "Enter password...", self.session_password, 64)
                else:
                    changed, self.session_password = imgui.input_text("##session_password", self.session_password, 64)
            
            # Connection timeout setting
            imgui.text("Timeout (sec):")
            imgui.same_line()
            imgui.set_next_item_width(100)
            changed, self.connection_timeout = imgui.slider_float("##timeout", self.connection_timeout, 10.0, 120.0, "%.0f")
            
            # Host button with enhanced logic
            if not is_hosting and not is_connected:
                if imgui.button("Start Hosting", (-1, 30)):
                    self.start_hosting()
            elif is_hosting:
                if imgui.button("Stop Hosting", (-1, 30)):
                    self.disconnect_from_session()
            else:
                imgui.text_colored((0.8, 0.6, 0.2, 1.0), "Disconnect from current session first")
            
            # Show local IP with copy functionality
            if is_hosting or imgui.button("Show Local IP"):
                local_ip = self._get_local_ip()
                imgui.text(f"Local IP: {local_ip}")
                
                imgui.same_line()
                if imgui.small_button("Copy##ip"):
                    self._copy_to_clipboard_safe(local_ip)
                    self._add_to_connection_log(f"Copied IP {local_ip} to clipboard")
    
    def _render_join_section(self):
        """Render join session controls section"""
        if imgui.collapsing_header("Join Session"):
            # Get current network status from context
            network_status = self._get_network_status()
            is_connected = network_status.get('is_connected', False)
            is_hosting = network_status.get('is_hosting', False)
            
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
            if not is_connected and not is_hosting:
                if imgui.button("Connect", (-1, 30)):
                    self.connect_to_server()
            elif is_connected:
                if imgui.button("Disconnect", (-1, 30)):
                    self.disconnect_from_session()
            else:
                imgui.text("Stop hosting first")
    
    def _render_player_management(self):
        """Render player management section (for hosts)"""
        if imgui.collapsing_header("Connected Players"):
            # Get current network status from actions bridge
            network_status = self._get_network_status()
            players = network_status.get('players', [])
            player_count = network_status.get('player_count', 0)
            
            # Refresh button for player list
            if imgui.small_button("Refresh##players"):
                self.actions_bridge.request_player_list()
            
            imgui.same_line()
            imgui.text(f"Players Online: {player_count}")
            
            if not players:
                imgui.text("No players connected")
            else:
                # Player list with management options
                for i, player in enumerate(players):
                    player_id = player.get('user_id', str(i))
                    player_name = player.get('username', f'Player {i+1}')
                    player_status = player.get('status', 'Online')
                    connection_time = player.get('connection_time', '')
                    
                    # Ensure values are strings for imgui
                    player_name = self._safe_str(player.get('username'), f'Player {i+1}')
                    player_status = self._safe_str(player.get('status'), 'Online')
                    connection_time = self._safe_str(player.get('connection_time'), '')
                    
                    # Player info row
                    imgui.text(f"• {player_name}")
                    imgui.same_line(150)
                    
                    # Status indicator with color
                    status_color = (0.2, 0.8, 0.2, 1.0) if player_status == 'Online' else (0.8, 0.8, 0.2, 1.0)
                    imgui.text_colored(status_color, player_status)
                    
                    imgui.same_line(220)
                    
                    # Action buttons
                    if imgui.small_button(f"Kick##{i}"):
                        self._kick_player_dialog(player_id, player_name)
                    
                    imgui.same_line()
                    if imgui.small_button(f"Ban##{i}"):
                        self._ban_player_dialog(player_id, player_name)
                    
                    # Show connection time if available
                    if connection_time:
                        imgui.same_line()
                        imgui.text_colored((0.6, 0.6, 0.6, 1.0), f"({connection_time})")
            
            imgui.separator()
            
            # Broadcast message section
            imgui.text("Broadcast Message:")
            static_message = getattr(self, '_broadcast_message', "")
            changed, message = imgui.input_text("##broadcast", static_message, 256)
            self._broadcast_message = message
            
            if imgui.button("Send to All") and message.strip():
                self._broadcast_message_to_all(message.strip())
                self._broadcast_message = ""
    
    def start_hosting(self):
        """Start hosting a session using actions bridge"""
        try:
            result = self.actions_bridge.host_session(
                port=self.server_port,
                max_players=self.max_players,
                password=self.session_password if self.use_password else None
            )
            
            if result.success:
                self._add_to_connection_log(f"Started hosting on port {self.server_port}")
                logger.info("Hosting started successfully")
            else:
                self._add_to_connection_log(f"Failed to start hosting: {result.message}")
                logger.error(f"Failed to start hosting: {result.message}")
                
        except Exception as e:
            error_msg = f"Error starting host: {str(e)}"
            self._add_to_connection_log(error_msg)
            logger.error(error_msg)

    def connect_to_server(self):
        """Connect to a remote session using actions bridge"""
        try:
            result = self.actions_bridge.join_session(
                server_ip=self.server_ip,
                port=self.server_port,
                username=self.player_name,
                password=self.session_password if self.use_password else None
            )
            
            if result.success:
                self._add_to_connection_log(f"Connected to {self.server_ip}:{self.server_port}")
                logger.info("Connected successfully")
                # Request initial player list
                self.actions_bridge.request_player_list()
            else:
                self._add_to_connection_log(f"Failed to connect: {result.message}")
                logger.error(f"Failed to connect: {result.message}")
                
        except Exception as e:
            error_msg = f"Error connecting: {str(e)}"
            self._add_to_connection_log(error_msg)
            logger.error(error_msg)

    def disconnect_from_session(self):
        """Disconnect from session using actions bridge"""
        try:
            result = self.actions_bridge.leave_session()
            
            if result.success:
                self._add_to_connection_log("Disconnected from session")
                logger.info("Disconnected successfully")
            else:
                self._add_to_connection_log(f"Disconnect error: {result.message}")
                logger.error(f"Failed to disconnect: {result.message}")
                
        except Exception as e:
            error_msg = f"Error disconnecting: {str(e)}"
            self._add_to_connection_log(error_msg)
            logger.error(error_msg)

    def _kick_player_dialog(self, player_id: str, player_name: str):
        """Show kick player confirmation dialog"""
        # For now, kick immediately with default reason
        # TODO: Add proper dialog with reason input
        try:
            result = self.actions_bridge.kick_player(player_id, player_name, "Kicked by host")
            
            if result.success:
                self._add_to_connection_log(f"Kicked player: {player_name}")
                logger.info(f"Kicked player: {player_name}")
                # Refresh player list
                self.actions_bridge.request_player_list()
            else:
                self._add_to_connection_log(f"Failed to kick {player_name}: {result.message}")
                logger.error(f"Failed to kick player: {result.message}")
                
        except Exception as e:
            error_msg = f"Error kicking player: {str(e)}"
            self._add_to_connection_log(error_msg)
            logger.error(error_msg)

    def _ban_player_dialog(self, player_id: str, player_name: str):
        """Show ban player confirmation dialog"""
        # For now, ban immediately with default reason
        # TODO: Add proper dialog with reason and duration input
        try:
            result = self.actions_bridge.ban_player(player_id, player_name, "Banned by host", "permanent")
            
            if result.success:
                self._add_to_connection_log(f"Banned player: {player_name}")
                logger.info(f"Banned player: {player_name}")
                # Refresh player list
                self.actions_bridge.request_player_list()
            else:
                self._add_to_connection_log(f"Failed to ban {player_name}: {result.message}")
                logger.error(f"Failed to ban player: {result.message}")
                
        except Exception as e:
            error_msg = f"Error banning player: {str(e)}"
            self._add_to_connection_log(error_msg)
            logger.error(error_msg)
    
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

    def _copy_to_clipboard_safe(self, text):
        """Safely copy text to clipboard using pyperclip"""
        try:
            import pyperclip
            pyperclip.copy(text)
            logger.info(f"Copied to clipboard: {text}")
            return True
        except ImportError:
            logger.warning("pyperclip not available for clipboard operations")
            return False
        except Exception as e:
            logger.error(f"Clipboard operation failed: {e}")
            return False

    def _add_to_connection_log(self, message):
        """Add a message to the connection log with timestamp"""
        import time
        timestamp = time.strftime("%H:%M:%S")
        log_entry = f"[{timestamp}] {message}"
        
        self.connection_log.append(log_entry)
        
        # Keep log size manageable
        if len(self.connection_log) > self.max_log_entries:
            self.connection_log.pop(0)
        
        logger.debug(f"Connection log: {log_entry}")

    def _render_network_stats(self):
        """Render network statistics section"""
        if imgui.collapsing_header("Network Statistics"):
            # Get current network status from context
            network_status = self._get_network_status()
            connection_quality = network_status.get('connection_quality', 'Unknown')
            ping_ms = network_status.get('ping_ms', 0)
            
            # Ensure values are proper types for imgui
            connection_quality = self._safe_str(network_status.get('connection_quality'), 'Unknown')
            ping_ms = network_status.get('ping_ms', 0)
            if not isinstance(ping_ms, (int, float)):
                ping_ms = 0
            
            # Connection statistics
            imgui.columns(2, "stats_columns", False)
            
            # Left column
            imgui.text("Messages:")
            imgui.text(f"  Sent: {self.messages_sent}")
            imgui.text(f"  Received: {self.messages_received}")
            imgui.spacing()
            imgui.text("Connection Quality:")
            imgui.text(f"  Status: {connection_quality}")
            imgui.text(f"  Ping: {ping_ms}ms")
            
            imgui.next_column()
            
            # Right column
            imgui.text("Data Transfer:")
            imgui.text(f"  Sent: {self._format_bytes(self.bytes_sent)}")
            imgui.text(f"  Received: {self._format_bytes(self.bytes_received)}")
            imgui.spacing()
            imgui.text("Performance:")
            if hasattr(self.context, 'queue_to_send') and hasattr(self.context, 'queue_to_read'):
                send_queue_size = self.context.queue_to_send.qsize()
                read_queue_size = self.context.queue_to_read.qsize()
                imgui.text(f"  Send Queue: {send_queue_size}")
                imgui.text(f"  Read Queue: {read_queue_size}")
            
            imgui.columns(1)
            
            # Reset stats button
            if imgui.button("Reset Statistics"):
                self._reset_network_stats()

    def _render_connection_log(self):
        """Render connection log section"""
        if imgui.collapsing_header("Connection Log"):
            # Log display area
            if imgui.begin_child("log_area", (0, 150), True):
                for log_entry in self.connection_log:
                    # Ensure log_entry is a string for imgui.text()
                    log_str = self._safe_str(log_entry)
                    imgui.text(log_str)
                
                # Auto-scroll to bottom
                if imgui.get_scroll_y() >= imgui.get_scroll_max_y():
                    imgui.set_scroll_here_y(1.0)
                    
                imgui.end_child()
            
            # Clear log button
            if imgui.button("Clear Log"):
                self.connection_log.clear()
                self._add_to_connection_log("Log cleared")

    def _format_bytes(self, bytes_count):
        """Format bytes into human readable string"""
        if bytes_count < 1024:
            return f"{bytes_count} B"
        elif bytes_count < 1024 * 1024:
            return f"{bytes_count / 1024:.1f} KB"
        else:
            return f"{bytes_count / (1024 * 1024):.1f} MB"

    def _format_time_ago(self, timestamp):
        """Format timestamp as time ago string"""
        if timestamp == 0:
            return "Never"
        
        import time
        seconds_ago = time.time() - timestamp
        
        if seconds_ago < 60:
            return f"{int(seconds_ago)}s ago"
        elif seconds_ago < 3600:
            return f"{int(seconds_ago / 60)}m ago"
        else:
            return f"{int(seconds_ago / 3600)}h ago"

    def _reset_network_stats(self):
        """Reset all network statistics"""
        self.messages_sent = 0
        self.messages_received = 0
        self.bytes_sent = 0
        self.bytes_received = 0
        self.packet_loss = 0.0
        self.bandwidth_usage = 0.0
        self._add_to_connection_log("Network statistics reset")

    def update_connection_quality(self, ping_ms, packet_loss_percent=0.0):
        """Update connection quality metrics"""
        self.ping_ms = ping_ms
        self.packet_loss = packet_loss_percent
        
        # Determine connection quality based on ping and packet loss
        if ping_ms < 50 and packet_loss_percent < 1.0:
            self.connection_quality = "Good"
        elif ping_ms < 150 and packet_loss_percent < 3.0:
            self.connection_quality = "Fair"
        elif ping_ms < 500 and packet_loss_percent < 10.0:
            self.connection_quality = "Poor"
        else:
            self.connection_quality = "Bad"

    def update_network_stats(self, bytes_sent=0, bytes_received=0, messages_sent=0, messages_received=0):
        """Update network transfer statistics"""
        self.bytes_sent += bytes_sent
        self.bytes_received += bytes_received
        self.messages_sent += messages_sent
        self.messages_received += messages_received
        
        # Update last sync time
        import time
        self.last_sync_time = time.time()
        
        # Calculate bandwidth (rough estimate)
        # This is a simple moving average - in practice you'd want a proper sliding window
        if hasattr(self, '_last_bandwidth_update'):
            time_delta = self.last_sync_time - self._last_bandwidth_update
            if time_delta > 0:
                total_bytes = bytes_sent + bytes_received
                self.bandwidth_usage = (total_bytes / time_delta) / 1024  # KB/s
        
        self._last_bandwidth_update = self.last_sync_time

    def _broadcast_message_to_all(self, message: str):
        """Broadcast a message to all connected players using actions bridge"""
        try:
            # Use actions bridge to send message to all players
            result = self.actions_bridge.add_chat_message(f"[Broadcast] {message}")
            
            if result.success:
                self._add_to_connection_log(f"Broadcast sent: {message}")
                logger.info(f"Broadcast message sent: {message}")
            else:
                self._add_to_connection_log(f"Failed to broadcast: {result.message}")
                logger.error(f"Failed to broadcast message: {result.message}")
                
        except Exception as e:
            error_msg = f"Error broadcasting message: {str(e)}"
            self._add_to_connection_log(error_msg)
            logger.error(error_msg)

    def get_network_status_for_gui(self) -> Dict[str, Any]:
        """Get network status for other GUI panels"""
        network_status = self._get_network_status()
        return {
            'is_connected': network_status.get('is_connected', False),
            'is_hosting': network_status.get('is_hosting', False),
            'connection_quality': network_status.get('connection_quality', 'Unknown'),
            'ping_ms': network_status.get('ping_ms', 0),
            'player_count': network_status.get('player_count', 0),
            'max_players': self.max_players,
            'server_ip': self.server_ip,
            'server_port': self.server_port,
            'connection_status': network_status.get('connection_status', 'Disconnected'),
            'has_password': self.use_password,
            'auto_reconnect': self.auto_reconnect,
            'players': network_status.get('players', [])
        }

    def update_from_protocol(self):
        """Update network panel state from protocol - called periodically by GUI"""
        try:
            # Get latest network state from actions bridge
            network_status = self._get_network_status()
            
            # Update local connection log if there are new messages
            if network_status.get('connection_messages'):
                for msg in network_status['connection_messages']:
                    # Ensure message is a string
                    msg_str = self._safe_str(msg)
                    self._add_to_connection_log(msg_str)
            
            # Update network statistics if available
            if 'network_stats' in network_status:
                stats = network_status['network_stats']
                self.update_network_stats(
                    bytes_sent=stats.get('bytes_sent', 0),
                    bytes_received=stats.get('bytes_received', 0),
                    messages_sent=stats.get('messages_sent', 0),
                    messages_received=stats.get('messages_received', 0)
                )
            
            # Update connection quality
            ping_ms = network_status.get('ping_ms', 0)
            packet_loss = network_status.get('packet_loss', 0.0)
            if ping_ms > 0:
                self.update_connection_quality(ping_ms, packet_loss)
                
        except Exception as e:
            logger.error(f"Error updating from protocol: {e}")
