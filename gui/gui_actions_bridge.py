"""
GUI Actions Bridge - Connects GUI panels to the Actions protocol system
Provides a clean interface for GUI panels to interact with game logic
"""

from typing import Dict, Any, Optional, List
import logging
import uuid
from core_table.actions_protocol import ActionResult, Position

logger = logging.getLogger(__name__)

class GuiActionsBridge:
    """
    Bridge between GUI panels and the Actions protocol system.
    Provides simplified methods for common GUI operations.
    """
    
    def __init__(self, context):
        self.context = context
        self.actions = context.Actions
        
    # Table Management
    def get_current_table_info(self) -> Dict[str, Any]:
        """Get current table information for GUI display"""
        if not self.context.current_table:
            return {}
            
        table_id = self.context.current_table.table_id  # Use table_id instead of name
        result = self.actions.get_table_info(table_id)
        
        if result.success:
            return result.data
        else:
            logger.error(f"Failed to get table info: {result.message}")
            return {}
    
    def get_all_tables(self) -> Dict[str, Dict[str, Any]]:
        """Get all available tables for GUI display"""
        result = self.actions.get_all_tables()
        
        if result.success:
            return result.data.get('tables', {})
        else:
            logger.error(f"Failed to get tables: {result.message}")
            return {}
    
    def create_table(self, name: str, width: int, height: int) -> bool:
        """Create a new table"""
        table_id = str(uuid.uuid4())  # Generate unique table ID
        result = self.actions.create_table(table_id, name, width, height)
        
        if result.success:
            logger.info(f"Table created: {result.message}")
            return True
        else:
            logger.error(f"Failed to create table: {result.message}")
            return False
    
    def delete_table(self, table_name: str, to_server: bool = True) -> bool:
        """Delete a table with network awareness"""
        # Find table by name to get its ID
        table = self.context._get_table_by_name(table_name)
        if not table:
            logger.error(f"Table '{table_name}' not found")
            return False
        
        # Check network permissions
        if hasattr(self.context, 'validate_network_permission'):
            if not self.context.validate_network_permission('delete_table'):
                logger.warning(f"Cannot delete table '{table_name}' - insufficient network permissions")
                return False
            
        result = self.actions.delete_table(table.table_id, to_server=to_server)
        
        if result.success:
            # Broadcast table deletion to network
            if to_server and hasattr(self.context, 'broadcast_table_change'):
                self.context.broadcast_table_change(
                    table.table_id,
                    'table_deleted',
                    {'name': table_name}
                )
            
            logger.info(f"Table deleted: {result.message}")
            return True
        else:
            logger.error(f"Failed to delete table: {result.message}")
            return False
    
    # Sprite Management
    def get_table_sprites(self, layer: Optional[str] = None) -> Dict[str, Dict[str, Any]]:
        """Get sprites on current table, optionally filtered by layer"""
        if not self.context.current_table:
            return {}
            
        table_id = self.context.current_table.table_id  # Use table_id instead of name
        result = self.actions.get_table_sprites(table_id, layer)
        
        if result.success:
            return result.data.get('sprites', {})
        else:
            logger.error(f"Failed to get sprites: {result.message}")
            return {}
    
    def get_layer_sprites(self, layer: str) -> Dict[str, Dict[str, Any]]:
        """Get sprites on a specific layer"""
        if not self.context.current_table:
            return {}
            
        table_id = self.context.current_table.table_id  # Use table_id instead of name
        result = self.actions.get_layer_sprites(table_id, layer)
        
        if result.success:
            return result.data.get('sprites', {})
        else:
            logger.error(f"Failed to get layer sprites: {result.message}")
            return {}
    
    def create_sprite(self, sprite_id: str, image_path: str, x: float, y: float, layer: str = "tokens") -> bool:
        """Create a new sprite"""
        if not self.context.current_table:
            logger.error("No current table for sprite creation")
            return False
            
        table_id = self.context.current_table.table_id  # Use table_id instead of name
        position = Position(x, y)
        result = self.actions.create_sprite(table_id, sprite_id, position, image_path, layer)
        
        if result.success:
            logger.info(f"Sprite created: {result.message}")
            return True
        else:
            logger.error(f"Failed to create sprite: {result.message}")
            return False
    
    def delete_sprite(self, sprite_id: str) -> bool:
        """Delete a sprite"""
        if not self.context.current_table:
            logger.error("No current table for sprite deletion")
            return False
            
        table_id = self.context.current_table.table_id  # Use table_id instead of name
        result = self.actions.delete_sprite(table_id, sprite_id)
        
        if result.success:
            logger.info(f"Sprite deleted: {result.message}")
            return True
        else:
            logger.error(f"Failed to delete sprite: {result.message}")
            return False
    
    def move_sprite(self, sprite_id: str, x: float, y: float) -> bool:
        """Move a sprite to new position"""
        if not self.context.current_table:
            logger.error("No current table for sprite movement")
            return False
            
        table_id = self.context.current_table.table_id  # Use table_id instead of name
        position = Position(x, y)
        result = self.actions.move_sprite(table_id, sprite_id, position)
        
        if result.success:
            logger.info(f"Sprite moved: {result.message}")
            return True
        else:
            logger.error(f"Failed to move sprite: {result.message}")
            return False
    
    def scale_sprite(self, sprite_id: str, scale_x: float, scale_y: float) -> bool:
        """Scale a sprite"""
        if not self.context.current_table:
            logger.error("No current table for sprite scaling")
            return False
            
        table_id = self.context.current_table.table_id  # Use table_id instead of name
        result = self.actions.scale_sprite(table_id, sprite_id, scale_x, scale_y)
        
        if result.success:
            logger.info(f"Sprite scaled: {result.message}")
            return True
        else:
            logger.error(f"Failed to scale sprite: {result.message}")
            return False
    
    def rotate_sprite(self, sprite_id: str, angle: float) -> bool:
        """Rotate a sprite"""
        if not self.context.current_table:
            logger.error("No current table for sprite rotation")
            return False
            
        table_id = self.context.current_table.table_id  # Use table_id instead of name
        result = self.actions.rotate_sprite(table_id, sprite_id, angle)
        
        if result.success:
            logger.info(f"Sprite rotated: {result.message}")
            return True
        else:
            logger.error(f"Failed to rotate sprite: {result.message}")
            return False
    
    def move_sprite_to_layer(self, sprite_id: str, layer: str) -> bool:
        """Move sprite to different layer"""
        if not self.context.current_table:
            logger.error("No current table for sprite layer change")
            return False
            
        table_id = self.context.current_table.table_id  # Use table_id instead of name
        result = self.actions.move_sprite_to_layer(table_id, sprite_id, layer)
        
        if result.success:
            logger.info(f"Sprite moved to layer: {result.message}")
            return True
        else:
            logger.error(f"Failed to move sprite to layer: {result.message}")
            return False
    
    # Layer Management
    def set_layer_visibility(self, layer: str, visible: bool) -> bool:
        """Set layer visibility"""
        if not self.context.current_table:
            logger.error("No current table for layer visibility")
            return False
            
        table_id = self.context.current_table.table_id  # Use table_id instead of name
        result = self.actions.set_layer_visibility(table_id, layer, visible)
        
        if result.success:
            logger.info(f"Layer visibility set: {result.message}")
            return True
        else:
            logger.error(f"Failed to set layer visibility: {result.message}")
            return False
    
    def get_layer_visibility(self, layer: str) -> bool:
        """Get layer visibility status"""
        if not self.context.current_table:
            logger.error("No current table for layer visibility check")
            return True  # Default to visible
            
        table_id = self.context.current_table.table_id  # Use table_id instead of name
        result = self.actions.get_layer_visibility(table_id, layer)
        
        if result.success:
            return result.data.get('visible', True)
        else:
            logger.error(f"Failed to get layer visibility: {result.message}")
            return True  # Default to visible
    
    # Utility Methods
    def get_sprite_at_position(self, x: float, y: float, layer: Optional[str] = None) -> Optional[str]:
        """Get sprite ID at position"""
        if not self.context.current_table:
            return None
            
        table_id = self.context.current_table.table_id  # Use table_id instead of name
        position = Position(x, y)
        result = self.actions.get_sprite_at_position(table_id, position, layer)
        
        if result.success:
            return result.data.get('sprite_id')
        else:
            return None
    
    def get_sprite_info(self, sprite_id: str) -> Dict[str, Any]:
        """Get sprite information"""
        if not self.context.current_table:
            return {}
            
        table_id = self.context.current_table.table_id  # Use table_id instead of name
        result = self.actions.get_sprite_info(table_id, sprite_id)
        
        if result.success:
            return result.data
        else:
            logger.error(f"Failed to get sprite info: {result.message}")
            return {}
    
    # Additional utility methods for GUI integration
    def has_current_table(self) -> bool:
        """Check if there is a current table"""
        return self.context.current_table is not None
    
    def get_available_layers(self) -> List[str]:
        """Get list of available layers"""
        if not self.context.current_table:
            return []
        return self.context.current_table.layers
    def add_chat_message(self, message: str) -> bool:
        """Add a chat message (placeholder for future implementation)"""
        # This is a placeholder - actual chat system would be implemented separately
        logger.info(f"Chat message: {message}")
        return True
    
    def get_chat_messages(self) -> List[str]:
        """Get chat messages (placeholder for future implementation)"""
        # This is a placeholder - actual chat system would be implemented separately
        return []
    
    def get_current_table_name(self) -> str:
        """Get current table name"""
        if not self.context.current_table:
            return ""
        return self.context.current_table.table_name
    
    def set_current_tool(self, tool: str) -> bool:
        """Set current tool"""
        try:
            self.context.set_current_tool(tool)
            return True
        except Exception as e:
            logger.error(f"Failed to set current tool: {e}")
            return False
    
    def get_current_tool(self) -> str:
        """Get current tool"""
        return getattr(self.context, 'current_tool', 'Move')
    
    def get_table_by_name(self, name: str):
        """Get table by name (helper method)"""
        return self.context._get_table_by_name(name)
    
    def get_table_by_id(self, table_id: str):
        """Get table by ID (helper method)"""
        return self.context._get_table_by_id(table_id)
    
    # =========================================================================
    # NETWORK-AWARE OPERATIONS
    # =========================================================================
    
    def create_sprite_networked(self, table_id: str, sprite_id: str, position: Position, 
                               image_path: str, layer: str = "tokens", to_server: bool = True) -> bool:
        """Create a sprite with network synchronization"""
        result = self.actions.create_sprite(
            table_id=table_id,
            sprite_id=sprite_id,
            position=position,
            image_path=image_path,
            layer=layer,
            to_server=to_server
        )
        
        if result.success:
            logger.info(f"Sprite created: {result.message}")
            return True
        else:
            logger.error(f"Failed to create sprite: {result.message}")
            return False
    
    def move_sprite_networked(self, table_id: str, sprite_id: str, position: Position, 
                             to_server: bool = True) -> bool:
        """Move a sprite with network synchronization"""
        result = self.actions.move_sprite(
            table_id=table_id,
            sprite_id=sprite_id,
            position=position,
            to_server=to_server
        )
        
        if result.success:
            logger.info(f"Sprite moved: {result.message}")
            return True
        else:
            logger.error(f"Failed to move sprite: {result.message}")
            return False
    
    def delete_sprite_networked(self, table_id: str, sprite_id: str, to_server: bool = True) -> bool:
        """Delete a sprite with network synchronization"""
        result = self.actions.delete_sprite(
            table_id=table_id,
            sprite_id=sprite_id,
            to_server=to_server
        )
        
        if result.success:
            logger.info(f"Sprite deleted: {result.message}")
            return True
        else:
            logger.error(f"Failed to delete sprite: {result.message}")
            return False
    
    def update_sprite_networked(self, table_id: str, sprite_id: str, to_server: bool = True, **kwargs) -> bool:
        """Update sprite properties with network synchronization"""
        result = self.actions.update_sprite(
            table_id=table_id,
            sprite_id=sprite_id,
            to_server=to_server,
            **kwargs
        )
        
        if result.success:
            logger.info(f"Sprite updated: {result.message}")
            return True
        else:
            logger.error(f"Failed to update sprite: {result.message}")
            return False
    
    def scale_sprite_networked(self, table_id: str, sprite_id: str, scale_x: float, scale_y: float, 
                              to_server: bool = True) -> bool:
        """Scale a sprite with network synchronization"""
        result = self.actions.scale_sprite(
            table_id=table_id,
            sprite_id=sprite_id,
            scale_x=scale_x,
            scale_y=scale_y,
            to_server=to_server
        )
        
        if result.success:
            logger.info(f"Sprite scaled: {result.message}")
            return True
        else:
            logger.error(f"Failed to scale sprite: {result.message}")
            return False
    
    def rotate_sprite_networked(self, table_id: str, sprite_id: str, angle: float, 
                               to_server: bool = True) -> bool:
        """Rotate a sprite with network synchronization"""
        result = self.actions.rotate_sprite(
            table_id=table_id,
            sprite_id=sprite_id,
            angle=angle,
            to_server=to_server
        )
        
        if result.success:
            logger.info(f"Sprite rotated: {result.message}")
            return True
        else:
            logger.error(f"Failed to rotate sprite: {result.message}")
            return False
    
    def sync_table_with_network(self, table_id: str) -> bool:
        """Force synchronize table with network"""
        try:
            if hasattr(self.context, 'sync_table_with_network'):
                self.context.sync_table_with_network(table_id)
                logger.info(f"Table {table_id} synchronized with network")
                return True
            else:
                logger.warning("Context does not support table network sync")
                return False
        except Exception as e:
            logger.error(f"Failed to sync table with network: {e}")
            return False
    
    def get_network_status(self) -> Dict[str, Any]:
        """Get current network status"""
        try:
            if hasattr(self.context, 'get_network_status'):
                return self.context.get_network_status()
            else:
                # Fallback if context doesn't have network status
                return {
                    'is_connected': False,
                    'is_hosting': False,
                    'connection_quality': 'Unknown',
                    'ping_ms': 0,
                    'player_count': 0,
                    'max_players': 6,
                    'server_ip': '',
                    'server_port': 0,
                    'session_name': '',
                    'has_password': False
                }
        except Exception as e:
            logger.error(f"Failed to get network status: {e}")
            return {}
    
    def broadcast_message(self, message: str, message_type: str = "info") -> bool:
        """Broadcast a message to all connected players"""
        try:
            if hasattr(self.context, 'notify_network_players'):
                self.context.notify_network_players(message, message_type)
                logger.info(f"Broadcasted message: {message}")
                return True
            else:
                logger.warning("Context does not support network messaging")
                return False
        except Exception as e:
            logger.error(f"Failed to broadcast message: {e}")
            return False
    
    # =========================================================================
    # NETWORK & PLAYER MANAGEMENT
    # =========================================================================
    
    def get_network_state(self) -> Dict[str, Any]:
        """Get current network state for GUI display"""
        try:
            return self.actions.get_network_state()
        except Exception as e:
            logger.error(f"Failed to get network state: {e}")
            return {
                'connected': False,
                'players': [],
                'player_count': 0,
                'connection_status': {},
                'last_updated': 0,
                'error': str(e)
            }
    
    def request_player_list(self) -> bool:
        """Request updated player list from server"""
        try:
            result = self.actions.request_player_list()
            return result.success
        except Exception as e:
            logger.error(f"Failed to request player list: {e}")
            return False
    
    def kick_player(self, player_id: str, username: str, reason: str = "No reason provided") -> bool:
        """Kick a player from the session"""
        try:
            result = self.actions.kick_player(player_id, username, reason)
            if result.success:
                logger.info(f"Kick request sent for {username}: {reason}")
            else:
                logger.error(f"Failed to kick player {username}: {result.message}")
            return result.success
        except Exception as e:
            logger.error(f"Failed to kick player {username}: {e}")
            return False
    
    def ban_player(self, player_id: str, username: str, reason: str = "No reason provided", duration: str = "permanent") -> bool:
        """Ban a player from the session"""
        try:
            result = self.actions.ban_player(player_id, username, reason, duration)
            if result.success:
                logger.info(f"Ban request sent for {username} ({duration}): {reason}")
            else:
                logger.error(f"Failed to ban player {username}: {result.message}")
            return result.success
        except Exception as e:
            logger.error(f"Failed to ban player {username}: {e}")
            return False
    
    def get_connected_players(self) -> List[Dict[str, Any]]:
        """Get list of connected players for GUI display"""
        try:
            network_state = self.actions.get_network_state()
            return network_state.get('players', [])
        except Exception as e:
            logger.error(f"Failed to get connected players: {e}")
            return []
    
    def get_player_count(self) -> int:
        """Get current number of connected players"""
        try:
            network_state = self.actions.get_network_state()
            return network_state.get('player_count', 0)
        except Exception as e:
            logger.error(f"Failed to get player count: {e}")
            return 0
    
    def is_connected_to_server(self) -> bool:
        """Check if connected to server"""
        try:
            network_state = self.actions.get_network_state()
            return network_state.get('connected', False)
        except Exception as e:
            logger.error(f"Failed to check server connection: {e}")
            return False
    
    def request_connection_status(self) -> bool:
        """Request updated connection status from server"""
        try:
            result = self.actions.request_connection_status()
            return result.success
        except Exception as e:
            logger.error(f"Failed to request connection status: {e}")
            return False
    
    def get_connection_quality(self) -> Dict[str, Any]:
        """Get connection quality information"""
        try:
            network_state = self.actions.get_network_state()
            connection_status = network_state.get('connection_status', {})
            last_ping = network_state.get('last_ping', 0)
            
            import time
            ping_age = time.time() - last_ping if last_ping > 0 else float('inf')
            
            return {
                'connected': network_state.get('connected', False),
                'ping_age_seconds': ping_age,
                'status_info': connection_status,
                'last_update': network_state.get('last_updated', 0)
            }
        except Exception as e:
            logger.error(f"Failed to get connection quality: {e}")
            return {
                'connected': False,
                'ping_age_seconds': float('inf'),
                'status_info': {},
                'last_update': 0
            }
    
    def send_chat_message(self, message: str) -> bool:
        """Send a chat message (using existing add_chat_message)"""
        try:
            result = self.actions.add_chat_message(message)
            return result.success
        except Exception as e:
            logger.error(f"Failed to send chat message: {e}")
            return False
    
    def get_user_permissions(self) -> Dict[str, bool]:
        """Get current user's permissions for player management"""
        try:
            # This would normally check the user's role/permissions
            # For now, return basic permissions based on connection status
            network_state = self.actions.get_network_state()
            connected = network_state.get('connected', False)
            
            # Simple permission system - can be enhanced based on user roles
            return {
                'can_kick': connected,  # Only if connected
                'can_ban': connected,   # Only if connected  
                'can_manage_players': connected,
                'can_view_players': True,
                'is_dm': False,  # This should come from actual user role
                'is_admin': False  # This should come from actual user role
            }
        except Exception as e:
            logger.error(f"Failed to get user permissions: {e}")
            return {
                'can_kick': False,
                'can_ban': False,
                'can_manage_players': False,
                'can_view_players': True,
                'is_dm': False,
                'is_admin': False
            }
    
    # =========================================================================
    # SESSION MANAGEMENT
    # =========================================================================
    
    def host_session(self, port: int, max_players: int = 6, password: Optional[str] = None) -> ActionResult:
        """Start hosting a multiplayer session"""
        try:
            # Get ClientProtocol instance from context
            client_protocol = getattr(self.context, 'protocol', None)
            if not client_protocol:
                return ActionResult(False, "No network protocol available")
            
            # For now, return a placeholder - this would connect to the actual hosting system
            # In the full implementation, this would:
            # 1. Start the server/hosting process
            # 2. Update network state
            # 3. Set up player management
            
            logger.info(f"Host session requested on port {port} with max {max_players} players")
            
            # Placeholder implementation - return success for now
            return ActionResult(True, f"Hosting started on port {port}")
            
        except Exception as e:
            logger.error(f"Failed to start hosting: {e}")
            return ActionResult(False, f"Failed to start hosting: {str(e)}")

    def join_session(self, server_ip: str, port: int, username: str, password: Optional[str] = None) -> ActionResult:
        """Join a multiplayer session"""
        try:
            # Get ClientProtocol instance from context
            client_protocol = getattr(self.context, 'protocol', None)
            if not client_protocol:
                return ActionResult(False, "No network protocol available")
            
            # For now, return a placeholder - this would connect to the actual join system
            # In the full implementation, this would:
            # 1. Connect to the specified server
            # 2. Authenticate with username/password
            # 3. Update network state
            # 4. Initialize player list
            
            logger.info(f"Join session requested: {username}@{server_ip}:{port}")
            
            # Placeholder implementation - return success for now
            return ActionResult(True, f"Connected to {server_ip}:{port}")
            
        except Exception as e:
            logger.error(f"Failed to join session: {e}")
            return ActionResult(False, f"Failed to join session: {str(e)}")

    def leave_session(self) -> ActionResult:
        """Leave the current multiplayer session"""
        try:
            # Get ClientProtocol instance from context
            client_protocol = getattr(self.context, 'protocol', None)
            if not client_protocol:
                return ActionResult(False, "No network protocol available")
            
            # For now, return a placeholder - this would disconnect from the session
            # In the full implementation, this would:
            # 1. Disconnect from server/stop hosting
            # 2. Clean up network state
            # 3. Clear player list
            # 4. Reset connection status
            
            logger.info("Leave session requested")
            
            # Placeholder implementation - return success for now
            return ActionResult(True, "Disconnected from session")
            
        except Exception as e:
            logger.error(f"Failed to leave session: {e}")
            return ActionResult(False, f"Failed to leave session: {str(e)}")

    # =========================================================================
    # AUTHENTICATION MANAGEMENT
    # =========================================================================
    
    def register_user(self, server_url: str, username: str, password: str) -> ActionResult:
        """Register a new user on the server"""
        try:
            # Get ClientProtocol instance from context
            client_protocol = getattr(self.context, 'protocol', None)
            if not client_protocol:
                return ActionResult(False, "No network protocol available")
            
            result = client_protocol.register_user(server_url, username, password)
            
            if result['success']:
                return ActionResult(True, result['message'])
            else:
                return ActionResult(False, result['message'])
                
        except Exception as e:
            logger.error(f"Failed to register user: {e}")
            return ActionResult(False, f"Failed to register user: {str(e)}")

    def login_user(self, server_url: str, username: str, password: str) -> ActionResult:
        """Login user and get JWT token"""
        try:
            # Get ClientProtocol instance from context
            client_protocol = getattr(self.context, 'protocol', None)
            if not client_protocol:
                return ActionResult(False, "No network protocol available")
            
            result = client_protocol.login_user(server_url, username, password)
            
            if result['success']:
                # Store authentication info in context for GUI access
                if not hasattr(self.context, 'auth_state'):
                    self.context.auth_state = {}
                
                self.context.auth_state.update({
                    'is_authenticated': True,
                    'username': username,
                    'jwt_token': result['jwt_token'],
                    'server_url': server_url
                })
                
                return ActionResult(True, result['message'], result)
            else:
                return ActionResult(False, result['message'])
                
        except Exception as e:
            logger.error(f"Failed to login user: {e}")
            return ActionResult(False, f"Failed to login user: {str(e)}")

    def logout_user(self) -> ActionResult:
        """Logout user and clear authentication data"""
        try:
            # Get ClientProtocol instance from context
            client_protocol = getattr(self.context, 'protocol', None)
            if not client_protocol:
                return ActionResult(False, "No network protocol available")
            
            result = client_protocol.logout_user()
            
            # Clear authentication info from context
            if hasattr(self.context, 'auth_state'):
                self.context.auth_state = {
                    'is_authenticated': False,
                    'username': '',
                    'jwt_token': '',
                    'server_url': ''
                }
            
            if result['success']:
                return ActionResult(True, result['message'])
            else:
                return ActionResult(False, result['message'])
                
        except Exception as e:
            logger.error(f"Failed to logout user: {e}")
            return ActionResult(False, f"Failed to logout user: {str(e)}")

    def fetch_user_sessions(self, server_url: str, jwt_token: str) -> ActionResult:
        """Fetch user's available game sessions"""
        try:
            # Get ClientProtocol instance from context
            client_protocol = getattr(self.context, 'protocol', None)
            if not client_protocol:
                return ActionResult(False, "No network protocol available")
            
            result = client_protocol.fetch_user_sessions(server_url, jwt_token)
            
            if result['success']:
                # Store sessions in context for GUI access
                if not hasattr(self.context, 'auth_state'):
                    self.context.auth_state = {}
                
                self.context.auth_state['available_sessions'] = result['sessions']
                
                return ActionResult(True, result['message'], {'sessions': result['sessions']})
            else:
                return ActionResult(False, result['message'])
                
        except Exception as e:
            logger.error(f"Failed to fetch user sessions: {e}")
            return ActionResult(False, f"Failed to fetch user sessions: {str(e)}")

    def test_server_connection(self, server_url: str) -> ActionResult:
        """Test if the server URL is reachable"""
        try:
            # Get ClientProtocol instance from context
            client_protocol = getattr(self.context, 'protocol', None)
            if not client_protocol:
                return ActionResult(False, "No network protocol available")
            
            result = client_protocol.test_server_connection(server_url)
            
            if result['success']:
                return ActionResult(True, result['message'], result)
            else:
                return ActionResult(False, result['message'], result)
                
        except Exception as e:
            logger.error(f"Failed to test server connection: {e}")
            return ActionResult(False, f"Failed to test server connection: {str(e)}")

    def parse_server_url(self, server_url: str, fallback_port: str = "12345") -> Dict[str, str]:
        """Parse server URL to extract hostname and port"""
        try:
            # Get ClientProtocol instance from context
            client_protocol = getattr(self.context, 'protocol', None)
            if not client_protocol:
                # Fallback to basic parsing
                return {
                    'hostname': "127.0.0.1",
                    'port': fallback_port,
                    'full_url': server_url
                }
            
            return client_protocol.parse_server_url(server_url, fallback_port)
                
        except Exception as e:
            logger.error(f"Failed to parse server URL: {e}")
            return {
                'hostname': "127.0.0.1",
                'port': fallback_port,
                'full_url': server_url,
                'error': str(e)
            }

    def get_authentication_state(self) -> Dict[str, Any]:
        """Get current authentication state"""
        try:
            # Get ClientProtocol instance from context
            client_protocol = getattr(self.context, 'protocol', None)
            if not client_protocol:
                return {
                    'is_authenticated': False,
                    'username': '',
                    'jwt_token': '',
                    'server_url': '',
                    'available_sessions': []
                }
            
            auth_info = client_protocol.get_authentication_info()
            context_auth = getattr(self.context, 'auth_state', {})
            
            # Merge protocol auth info with context state
            return {
                'is_authenticated': auth_info.get('is_authenticated', False),
                'username': auth_info.get('username', ''),
                'jwt_token': auth_info.get('jwt_token', ''),
                'session_code': auth_info.get('session_code', ''),
                'user_id': auth_info.get('user_id'),
                'server_url': context_auth.get('server_url', ''),
                'available_sessions': context_auth.get('available_sessions', [])
            }
                
        except Exception as e:
            logger.error(f"Failed to get authentication state: {e}")
            return {
                'is_authenticated': False,
                'username': '',
                'jwt_token': '',
                'server_url': '',
                'available_sessions': [],
                'error': str(e)
            }

    def set_session_info(self, session_code: str, user_id: Optional[int] = None) -> ActionResult:
        """Set session information for authenticated user"""
        try:
            # Get ClientProtocol instance from context
            client_protocol = getattr(self.context, 'protocol', None)
            if not client_protocol:
                return ActionResult(False, "No network protocol available")
            
            # Get current auth info
            auth_info = client_protocol.get_authentication_info()
            if not auth_info['is_authenticated']:
                return ActionResult(False, "User not authenticated")
            
            # Update session info
            client_protocol.set_authentication_info(
                username=auth_info['username'],
                jwt_token=auth_info['jwt_token'],
                session_code=session_code,
                user_id=user_id
            )
            
            return ActionResult(True, f"Session set to: {session_code}")
                
        except Exception as e:
            logger.error(f"Failed to set session info: {e}")
            return ActionResult(False, f"Failed to set session info: {str(e)}")

    def add_chat_message(self, message: str) -> ActionResult:
        """Add a chat message to the system"""
        try:
            return self.actions.add_chat_message(message)
        except Exception as e:
            logger.error(f"Failed to add chat message: {e}")
            return ActionResult(False, f"Failed to add chat message: {str(e)}")
