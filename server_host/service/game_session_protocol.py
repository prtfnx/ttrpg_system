#TODO - proper use of server protocol. Mock for now
"""
Game Session Protocol Service for TTRPG Web Server
Integrates table protocol with game session management
"""
import json
import logging
import time
from datetime import datetime
from typing import Dict, Set, Optional, Any, List
from fastapi import WebSocket, WebSocketDisconnect
from dataclasses import asdict
import os
import sys
from datetime import datetime

# Add parent directory to path to import protocol
parent_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.append(parent_dir)

from net.protocol import Message, MessageType, ProtocolHandler
from core_table.server_protocol import ServerProtocol
from core_table.server import TableManager
from .asset_manager import get_server_asset_manager
from server_host.utils.logger import setup_logger
logger = setup_logger(__name__)



class GameSessionProtocolService:
    """Manages table protocol within a game session with database persistence"""
    def __init__(self, session_code: str, db_session=None, game_session_db_id: int = None):
        logger.info(f"Creating GameSessionProtocolService for session {session_code}")
        self.session_code = session_code
        self.db_session = db_session
        self.game_session_db_id = game_session_db_id
        
        self.table_manager = TableManager(db_session)
        logger.info(f"TableManager initialized for session {session_code}")
        
        self.server_protocol = ServerProtocol(self.table_manager, session_manager=self)
        logger.info(f"ServerProtocol initialized for session {session_code}")
        self.server_protocol.send_to_client = self.send_to_client  # For compatibility with server protocol
        
        # Client connections within this game session
        logger.info(f"Initializing GameSessionProtocolService for session {session_code}")
        self.clients: Dict[str, WebSocket] = {}  # client_id -> websocket
        self.client_info: Dict[str, dict] = {}   # client_id -> user info
        self.websocket_to_client: Dict[WebSocket, str] = {}  # websocket -> client_id     
       
        # Load existing tables from database or create test tables        
        if db_session and game_session_db_id:
            self._load_tables_from_database()
            logger.debug(f"GameSessionProtocolService initialized with existing tables for session {session_code}")
        else:
            logger.warning(f"No database session provided for {session_code}, creating test tables")
            self._create_test_tables()
        
        
        self.asset_manager = get_server_asset_manager()
        
        logger.info(f"GameSessionProtocolService created for session {session_code}")
    
    def _load_tables_from_database(self):
        """Load tables from database for this game session"""
        try:
            if self.table_manager.load_from_database(self.game_session_db_id):
                logger.info(f"Session {self.session_code} - Loaded tables from database")
                logger.info(f"Session {self.session_code} - Available tables: {list(self.table_manager.tables.keys())}")
                  # Ensure test tables exist for client compatibility
                if 'large_table' not in self.table_manager.tables:
                    logger.info(f"Session {self.session_code} - large_table not found in database, creating test tables")
                    self._create_test_tables()
            else:
                logger.warning(f"Session {self.session_code} - Failed to load tables, creating test tables")
                self._create_test_tables()
        except Exception as e:
            logger.error(f"Session {self.session_code} - Error loading from database: {e}")
            self._create_test_tables()
    
    def save_to_database(self) -> bool:
        """Save current state to database - delegates to to_db()"""
        return self.to_db()
    
    def auto_save(self):
        """Auto-save session data (call this periodically or on important events)"""
        try:
            # Check if enough time has passed since last save to avoid excessive database writes
            current_time = time.time()
            if not hasattr(self, '_last_save_time'):
                self._last_save_time = 0
            
            # Allow saving if it's been at least 5 seconds since last save, or force save on important events
            time_since_last_save = current_time - self._last_save_time
            if time_since_last_save < 5.0:
                logger.debug(f"Session {self.session_code} - Skipping auto-save, only {time_since_last_save:.1f}s since last save")
                return
                
            success = self.save_to_database()
            if success:
                self._last_save_time = current_time
                logger.info(f"Session {self.session_code} - Auto-save successful")
            else:
                logger.warning(f"Session {self.session_code} - Auto-save failed")
        except Exception as e:
            logger.error(f"Session {self.session_code} - Auto-save failed: {e}")

    def force_save(self):
        """Force immediate save to database regardless of timing"""
        try:
            success = self.save_to_database()
            if success:
                self._last_save_time = time.time()
                logger.info(f"Session {self.session_code} - Force save successful")
            return success
        except Exception as e:
            logger.error(f"Session {self.session_code} - Force save failed: {e}")
            return False

    def _create_test_tables(self):
        """Create test tables with entities for testing"""
        try:
            # Import VirtualTable here to avoid circular imports
            from core_table.table import VirtualTable
            
            # Create small test table
            test_table = VirtualTable('test_table', 20, 20)
            self.table_manager.add_table(test_table)
            
            # Add some test entities
            hero = test_table.add_entity("Hero", (2, 3), layer='tokens', path_to_texture='resources/hero.png')
            goblin = test_table.add_entity("Goblin", (5, 6), layer='tokens', path_to_texture='resources/goblin.png')
            treasure = test_table.add_entity("Treasure", (8, 9), layer='tokens', path_to_texture='resources/treasure.png')
            
            logger.info(f"Created test_table with entities:")
            logger.info(f"Hero (ID: {hero.entity_id}, Sprite: {hero.sprite_id}) at {hero.position}")
            logger.info(f"Goblin1 (ID: {goblin.entity_id}, Sprite: {goblin.sprite_id}) at {goblin.position}")
            logger.info(f" Treasure (ID: {treasure.entity_id}, Sprite: {treasure.sprite_id}) at {treasure.position}")
            
            # Create large table for testing with multiple entities in different layers
            large_table = VirtualTable('large_table', 1080, 1920)
            self.table_manager.add_table(large_table)
            
            # Add entities across different layers
            map_bg = large_table.add_entity("Map Background1", (0, 0), layer='map', path_to_texture='resources/map.jpg', asset_id='1aeb5857b9cd3b50')
            player1 = large_table.add_entity("Player 1", (400, 300), layer='tokens', path_to_texture='server_host/res/player1.png', asset_id='e7f80bafaaf67027')
            player2 = large_table.add_entity("Player 2", (12, 10), layer='tokens', path_to_texture='server_host/res/player2.png')
            dm_note = large_table.add_entity("DM Note", (25, 25), layer='dungeon_master', path_to_texture='server_host/res/note.png')
            light_source = large_table.add_entity("Light Source", (15, 15), layer='light', path_to_texture='server_host/res/torch.png')

            # Add some more entities to make it feel populated
            orc1 = large_table.add_entity("Orc Warrior", (20, 15), layer='tokens', path_to_texture='resources/orc.png')
            orc2 = large_table.add_entity("Orc Archer", (22, 17), layer='tokens', path_to_texture='resources/orc_archer.png')
            chest = large_table.add_entity("Treasure Chest", (30, 30), layer='tokens', path_to_texture='resources/chest.png')
            trap = large_table.add_entity("Hidden Trap", (18, 18), layer='dungeon_master', path_to_texture='resources/trap.png')
            
            logger.info(f"Created large_table (1080x1920) with {len(large_table.entities)} entities:")
            for entity in large_table.entities.values():
                logger.info(f"  {entity.name} (ID: {entity.entity_id}, Sprite: {entity.sprite_id}) at {entity.position} [Layer: {entity.layer}]")
            
            logger.info(f"Session {self.session_code} - Available tables: {list(self.table_manager.tables.keys())}")
            
        except Exception as e:
            logger.error(f"Failed to create test tables: {e}")
            # Create a minimal fallback table
            try:
                from core_table.table import VirtualTable
                fallback_table = VirtualTable('fallback_table', 10, 10)
                self.table_manager.add_table(fallback_table)
                logger.info(f"Created fallback table for session {self.session_code}")
            except Exception as fallback_error:
                logger.error(f"Failed to create fallback table: {fallback_error}")

    async def add_client(self, websocket: WebSocket, client_id: str, user_info: dict):
        """Add a client to this game session"""
        self.clients[client_id] = websocket
        self.client_info[client_id] = {
            **user_info,
            "connected_at": time.time(),
            "last_ping": time.time()
        }
        self.websocket_to_client[websocket] = client_id
        
        logger.info(f"Client {client_id} ({user_info.get('username', 'unknown')}) added to session {self.session_code}")
          # Send welcome message with protocol support
        await self._send_message(websocket, Message(
            MessageType.WELCOME,
            {
                "message": f"Welcome to game session {self.session_code}",
                "client_id": client_id,
                "user_id": user_info.get('user_id', 0),
                "username": user_info.get('username', 'unknown'),
                "session_code": self.session_code,
                "tables": list(self.table_manager.tables.keys())
            }
        ))

    async def remove_client(self, websocket: WebSocket):
        """Remove a client from this game session"""
        if websocket not in self.websocket_to_client:
            return
        
        client_id = self.websocket_to_client[websocket]
        username = self.client_info.get(client_id, {}).get('username', 'unknown')
        
        # Clean up
        del self.clients[client_id]
        del self.client_info[client_id]
        del self.websocket_to_client[websocket]
        # Notify server protocol
        #self.server_protocol.disconnect_client(client_id)
        
        logger.info(f"Client {client_id} ({username}) removed from session {self.session_code}")

    async def handle_protocol_message(self, websocket: WebSocket, message_str: str):
        """Handle incoming protocol message from a client"""
        try:
            message = Message.from_json(message_str)
            logger.debug(f"Handling protocol message in session {self.session_code}: {message}")
            
            client_id = self.websocket_to_client.get(websocket)
            
            if not client_id:
                await self._send_error(websocket, "Client not registered in session")
                return
            
            # Update last activity
            if client_id in self.client_info:
                self.client_info[client_id]["last_ping"] = time.time()
            logger.debug(f"Received {message.type.value} from {client_id} in session {self.session_code}")
            #logger.debug(f"Available handlers: {list(self.message_handlers.keys())}")
            logger.debug(f"Message type object: {message.type}")            # Handle message by type
            try:
                message_type = MessageType(message.type)
                logger.debug(f"Successfully converted message type: {message_type}")
            except ValueError as e:
                logger.error(f"Failed to convert message type '{message.type}': {e}")
                logger.error(f"Available message types: {[mt.value for mt in MessageType]}")
                await self._send_error(websocket, f"Invalid message type: {message.type}")
                return                 
            
            if message_type in self.server_protocol.handlers.keys():
                await self.server_protocol.handle_client(message, client_id)
                
                # Auto-save after sprite/entity movement or updates to persist changes immediately
                if message_type in [MessageType.SPRITE_UPDATE, MessageType.TABLE_UPDATE]:
                    logger.debug(f"Auto-saving after {message_type.value} in session {self.session_code}")
                    self.auto_save()
                
                # NOTE: Broadcasting is now handled by individual handlers in ServerProtocol
                # Each handler (move_sprite, scale_sprite, etc.) broadcasts SPRITE_UPDATE messages
                # to other clients after successful operations
            else:
                logger.warning(f"Unknown message type: {message_type}, available handlers: {list(self.server_protocol.handlers.keys())}")
                logger.info(f"message: {message}, client_id: {client_id}")
                await self._send_error(websocket, f"Unknown message type: {message.type.value}")
        
        except json.JSONDecodeError as e:
            logger.error(f"Invalid JSON from WebSocket in session {self.session_code}: {e}")
            await self._send_error(websocket, "Invalid JSON format")
        except Exception as e:
            logger.error(f"Error handling protocol message in session {self.session_code}: {e}")
            await self._send_error(websocket, "Internal server error")

    async def broadcast_to_session(self, message: Message, exclude_client: Optional[str] = None):
        """Broadcast message to all clients in this game session"""
        disconnected_clients = []
        broadcast_count = 0
        
        logger.info(f"BROADCAST: Broadcasting {message.type.value} to session {self.session_code}")
        logger.info(f"BROADCAST: Available clients: {list(self.clients.keys())}")
        logger.info(f"BROADCAST: Excluding client: {exclude_client}")
        
        for client_id, websocket in self.clients.items():
            if client_id != exclude_client:
                try:
                    await self._send_message(websocket, message)
                    broadcast_count += 1
                    logger.info(f"BROADCAST: Successfully sent {message.type.value} to client {client_id}")
                except Exception as e:
                    logger.error(f"BROADCAST: Failed to send to {client_id}: {e}")
                    disconnected_clients.append(websocket)
            else:
                logger.info(f"BROADCAST: Skipping sender client {client_id}")
        
        logger.info(f"BROADCAST: Broadcasted {message.type.value} to {broadcast_count} clients in session {self.session_code}")
        
        # Clean up disconnected clients
        for websocket in disconnected_clients:
            await self.remove_client(websocket)

    async def send_to_client(self, message: Message, client_id: str):
        """Send message to specific client"""
        if client_id in self.clients:
            websocket = self.clients[client_id]
            try:
                await self._send_message(websocket, message)
            except Exception as e:
                logger.error(f"Failed to send to {client_id}: {e}")
                await self.remove_client(websocket)
        else:
            logger.warning(f"Client {client_id} not found in session {self.session_code}")

    # Protocol Message Handlers
    

    # Utility Methods
    
    async def _send_message(self, websocket: WebSocket, message: Message):
        """Send message to WebSocket"""
        await websocket.send_text(message.to_json())

    async def _send_error(self, websocket: WebSocket, error_message: str):
        """Send error message to WebSocket"""
        error_msg = Message(MessageType.ERROR, {
            "error": error_message,
            "session_code": self.session_code
        })
        await self._send_message(websocket, error_msg)

    def get_session_stats(self) -> dict:
        """Get session statistics"""
        return {
            "session_code": self.session_code,
            "connected_clients": len(self.clients),
            "client_ids": list(self.clients.keys()),
            "tables": list(self.table_manager.tables.keys()),
            "clients": [
                {
                    "client_id": client_id,
                    "username": info.get('username', 'unknown'),
                    "connected_at": info.get('connected_at', 0),
                    "last_ping": info.get('last_ping', 0)
                }                for client_id, info in self.client_info.items()
            ]
        }

    def has_clients(self) -> bool:
        """Check if session has any connected clients"""
        return len(self.clients) > 0
    
    def cleanup(self):
        """Cleanup resources when session is closed"""
        logger.info(f"Cleaning up GameSessionProtocolService for session {self.session_code}")
          # Save to database before clearing data
        if self.db_session and self.game_session_db_id:
            try:
                success = self.force_save()
                if success:
                    logger.info(f"Session {self.session_code} - Data saved to database before cleanup")
                else:
                    logger.warning(f"Session {self.session_code} - Failed to save data before cleanup")
            except Exception as e:
                logger.error(f"Session {self.session_code} - Error saving to database during cleanup: {e}")
        else:
            logger.warning(f"Session {self.session_code} - No database session available for saving during cleanup")
        self.clients.clear()
        self.client_info.clear()
        self.websocket_to_client.clear()
        self.table_manager.clear_tables()

    def to_db(self) -> bool:
        """Save GameSessionProtocolService state to database"""
        try:
            if not self.db_session or not self.game_session_db_id:
                logger.warning(f"No database session for {self.session_code}")
                return False
            
            # Update GameSession metadata
            from server_host.database.models import GameSession
            game_session = self.db_session.query(GameSession).filter_by(id=self.game_session_db_id).first()
            if game_session:
                game_session.game_data = json.dumps({
                    'client_count': len(self.clients),
                    'table_count': len(self.table_manager.tables)
                })
            
            # Save all tables using table_manager's existing method
            success = self.table_manager.save_to_database(self.game_session_db_id)
            if success:
                self.db_session.commit()
                logger.info(f"Saved session {self.session_code} to database")
            
            return success
        except Exception as e:
            logger.error(f"Error saving to database: {e}")
            if self.db_session:
                self.db_session.rollback()
            return False

    async def kick_player(self, target_player_id: str, target_username: str, reason: str, kicked_by_client_id: str) -> bool:
        """Kick a player from the session"""
        try:
            target_client_id = None
            target_websocket = None
            
            # Find target client by player_id or username
            for client_id, info in self.client_info.items():
                if (str(info.get('user_id')) == str(target_player_id) or 
                    info.get('username') == target_username):
                    target_client_id = client_id
                    target_websocket = self.clients.get(client_id)
                    break
            
            if not target_client_id or not target_websocket:
                logger.warning(f"Player not found for kick: {target_username}/{target_player_id}")
                return False
            
            kicked_username = self.client_info[target_client_id].get('username', 'unknown')
            kicker_username = self.client_info.get(kicked_by_client_id, {}).get('username', 'unknown')
            
            # Notify the kicked player
            kick_message = Message(MessageType.ERROR, {
                'error': f'You have been kicked from the session',
                'reason': reason,
                'kicked_by': kicker_username
            })
            await self._send_message(target_websocket, kick_message)
            
            # Broadcast kick notification to other players
            kick_notification = Message(MessageType.PLAYER_LEFT, {
                'username': kicked_username,
                'reason': f'Kicked by {kicker_username}: {reason}',
                'timestamp': datetime.now().isoformat(),
                'kicked': True
            })
            await self.broadcast_to_session(kick_notification, exclude_client=target_client_id)
            
            # Remove the player
            await self.remove_client(target_websocket)
            
            # Close the WebSocket connection
            try:
                await target_websocket.close()
            except Exception as e:
                logger.error(f"Error closing WebSocket for kicked player: {e}")
            
            logger.info(f"Player {kicked_username} kicked by {kicker_username}: {reason}")
            return True
            
        except Exception as e:
            logger.error(f"Error kicking player: {e}")
            return False

    async def ban_player(self, target_player_id: str, target_username: str, reason: str, duration: str, banned_by_client_id: str) -> bool:
        """Ban a player from the session"""
        try:
            # First kick the player
            kick_success = await self.kick_player(target_player_id, target_username, f"Banned: {reason}", banned_by_client_id)
            
            if kick_success:
                # TODO: Implement ban list storage in database
                # For now, just log the ban
                banner_username = self.client_info.get(banned_by_client_id, {}).get('username', 'unknown')
                logger.info(f"Player {target_username} banned by {banner_username} for {duration}: {reason}")
                
                # Broadcast ban notification
                ban_notification = Message(MessageType.PLAYER_LEFT, {
                    'username': target_username,
                    'reason': f'Banned by {banner_username} for {duration}: {reason}',
                    'timestamp': datetime.now().isoformat(),
                    'banned': True,
                    'duration': duration
                })
                await self.broadcast_to_session(ban_notification)
                
                return True
            else:
                return False
                
        except Exception as e:
            logger.error(f"Error banning player: {e}")
            return False

    def get_connection_status(self, client_id: str) -> dict:
        """Get connection status for a client"""
        if client_id in self.client_info:
            info = self.client_info[client_id]
            return {
                'connected': True,
                'username': info.get('username', 'unknown'),
                'connected_at': info.get('connected_at', 0),
                'last_ping': info.get('last_ping', 0),
                'session_code': self.session_code
            }
        else:
            return {
                'connected': False,
                'session_code': self.session_code
            }

    def get_session_players(self) -> List[dict]:
        """Get list of connected players in this session"""
        players = []
        for client_id, info in self.client_info.items():
            players.append({
                'client_id': client_id,
                'username': info.get('username', 'unknown'),
                'user_id': info.get('user_id', 0),
                'connected_at': info.get('connected_at', 0),
                'last_ping': info.get('last_ping', 0)
            })
        return players



