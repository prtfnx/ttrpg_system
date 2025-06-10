"""
Game Session Protocol Service for TTRPG Web Server
Integrates table protocol with game session management
"""
import json
import logging
import time
from typing import Dict, Set, Optional, Any, List
from fastapi import WebSocket, WebSocketDisconnect
from dataclasses import asdict
import os
import sys

# Add parent directory to path to import protocol
parent_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.append(parent_dir)

from net.protocol import Message, MessageType, ProtocolHandler
from core_table.server_protocol import ServerProtocol
from core_table.server import TableManager

logger = logging.getLogger(__name__)

# Enable debug logging for this module
logger.setLevel(logging.DEBUG)
console_handler = logging.StreamHandler()
console_handler.setLevel(logging.DEBUG)
formatter = logging.Formatter('%(asctime)s %(levelname)s:%(name)s: %(message)s')
console_handler.setFormatter(formatter)
logger.addHandler(console_handler)

class GameSessionProtocolService:
    """Manages table protocol within a game session"""
    def __init__(self, session_code: str):
        self.session_code = session_code
        self.table_manager = TableManager()
        self.server_protocol = ServerProtocol(self.table_manager)
        
        # Client connections within this game session
        self.clients: Dict[str, WebSocket] = {}  # client_id -> websocket
        self.client_info: Dict[str, dict] = {}   # client_id -> user info
        self.websocket_to_client: Dict[WebSocket, str] = {}  # websocket -> client_id
        
        # Protocol message handlers
        self.message_handlers = {
            MessageType.PING: self._handle_ping,
            MessageType.TABLE_REQUEST: self._handle_table_request,
            MessageType.NEW_TABLE_REQUEST: self._handle_new_table_request,
            MessageType.TABLE_UPDATE: self._handle_table_update,
            MessageType.FILE_REQUEST: self._handle_file_request,
            MessageType.SPRITE_UPDATE: self._handle_sprite_update,
            MessageType.COMPENDIUM_SPRITE_ADD: self._handle_compendium_sprite_add,
            MessageType.COMPENDIUM_SPRITE_UPDATE: self._handle_compendium_sprite_update,
            MessageType.COMPENDIUM_SPRITE_REMOVE: self._handle_compendium_sprite_remove,
        }
        
        # Initialize test tables with entities
        self._create_test_tables()
        
        logger.info(f"GameSessionProtocolService created for session {session_code}")
        
        # Debug: Log available message handlers
        #logger.debug(f"Available message handlers: {list(self.message_handlers.keys())}")
        #logger.debug(f"Handler keys as strings: {[k.value for k in self.message_handlers.keys()]}")
    
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
            logger.info(f"  Hero (ID: {hero.entity_id}, Sprite: {hero.sprite_id}) at {hero.position}")
            logger.info(f"  Goblin (ID: {goblin.entity_id}, Sprite: {goblin.sprite_id}) at {goblin.position}")
            logger.info(f"  Treasure (ID: {treasure.entity_id}, Sprite: {treasure.sprite_id}) at {treasure.position}")
            
            # Create large table for testing with multiple entities in different layers
            large_table = VirtualTable('large_table', 1080, 1920)
            self.table_manager.add_table(large_table)
            
            # Add entities across different layers
            map_bg = large_table.add_entity("Map Background", (0, 0), layer='map', path_to_texture='resources/map.jpg')
            player1 = large_table.add_entity("Player 1", (10, 10), layer='tokens', path_to_texture='resources/player1.png')
            player2 = large_table.add_entity("Player 2", (12, 10), layer='tokens', path_to_texture='resources/player2.png')
            dm_note = large_table.add_entity("DM Note", (25, 25), layer='dungeon_master', path_to_texture='resources/note.png')
            light_source = large_table.add_entity("Light Source", (15, 15), layer='light', path_to_texture='resources/torch.png')
            
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
            MessageType.PING,
            {
                "message": f"Welcome to game session {self.session_code}",
                "client_id": client_id,
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
        self.server_protocol.disconnect_client(client_id)
        
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
            logger.debug(f"Message type object: {message.type}")
            
            # Handle message by type
            if message.type in self.message_handlers:
                await self.message_handlers[message.type](websocket, message, client_id)
            else:
                logger.warning(f"Unknown message type: {message.type.value}")
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

    async def send_to_client(self, client_id: str, message: Message):
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
    async def _handle_ping(self, websocket: WebSocket, message: Message, client_id: str):
        """Handle ping message"""
        await self._send_message(websocket, Message(MessageType.PONG, {
            "timestamp": time.time(),
            "session_code": self.session_code
        }))    
    async def _handle_table_request(self, websocket: WebSocket, message: Message, client_id: str):
        """Handle table data request"""
        try:
            logger.debug(f"Handling table request from {client_id} with message {message}")
              # Extract table name from message data  
            table_name = None
            if message.data:
                table_name = message.data.get('name') or message.data.get('table_name')
            
            # Use 'default' if no table name specified
            if not table_name:
                table_name = 'default'
                
            logger.debug(f"Table request for '{table_name}' in session {self.session_code}")
            logger.debug(f"Available tables: {list(self.table_manager.tables.keys())}")
            
            table = self.table_manager.get_table(table_name)
            logger.debug(f"Table found: {table is not None}")
            logger.debug(f"Table name returned: {table.name if table else 'None'}")
            
            if not table:
                await self._send_error(websocket, f"Table '{table_name}' not found")
                return

            # Create table data response
            table_data = {
                'name': table.name,
                'width': table.width,
                'height': table.height,
                'scale': 1.0,
                'x_moved': 0.0,
                'y_moved': 0.0,
                'show_grid': True,
                'layers': table.table_to_layered_dict() if hasattr(table, 'table_to_layered_dict') else {},
                'session_code': self.session_code
            }
            
            await self._send_message(websocket, Message(MessageType.TABLE_RESPONSE, table_data))
            
        except Exception as e:
            logger.error(f"Error handling table request: {e}")
            await self._send_error(websocket, "Failed to retrieve table data")

    async def _handle_new_table_request(self, websocket: WebSocket, message: Message, client_id: str):
        """Handle new table creation request"""
        try:
            table_name = message.data.get('table_name', f'table_{int(time.time())}') if message.data else f'table_{int(time.time())}'
            width = message.data.get('width', 30) if message.data else 30
            height = message.data.get('height', 30) if message.data else 30
            
            # Create new table
            table = self.table_manager.create_table(table_name, width, height)
            
            table_data = {
                'name': table.name,
                'width': table.width,
                'height': table.height,
                'scale': 1.0,
                'x_moved': 0.0,
                'y_moved': 0.0,
                'show_grid': True,
                'layers': table.table_to_layered_dict() if hasattr(table, 'table_to_layered_dict') else {},
                'session_code': self.session_code
            }
            
            await self._send_message(websocket, Message(MessageType.NEW_TABLE_RESPONSE, table_data))
            
            # Notify other clients about the new table
            await self.broadcast_to_session(
                Message(MessageType.TABLE_UPDATE, {
                    'type': 'table_created',
                    'table_name': table_name,
                    'session_code': self.session_code
                }),
                exclude_client=client_id
            )
            
        except Exception as e:
            logger.error(f"Error handling new table request: {e}")
            await self._send_error(websocket, "Failed to create table")

    async def _handle_table_update(self, websocket: WebSocket, message: Message, client_id: str):
        """Handle table update with broadcast"""
        if not message.data:
            await self._send_error(websocket, "Missing update data")
            return
        
        try:
            # Process update through server protocol
            mock_writer = MockWriter()
            await self.server_protocol.handle_client(client_id, mock_writer, json.dumps(asdict(message)))
            
            # Add session info to the update
            update_data = message.data.copy()
            update_data['session_code'] = self.session_code
            
            # Broadcast update to other clients in the session
            await self.broadcast_to_session(
                Message(message.type, update_data),
                exclude_client=client_id
            )
        except Exception as e:
            logger.error(f"Error handling table update: {e}")
            await self._send_error(websocket, "Failed to process table update")

    async def _handle_sprite_update(self, websocket: WebSocket, message: Message, client_id: str):
        """Handle sprite update"""
        if not message.data:
            await self._send_error(websocket, "Missing sprite data")
            return
        
        try:
            logger.info(f"SPRITE UPDATE: Handling sprite update from {client_id} in session {self.session_code}")
            logger.info(f"SPRITE UPDATE: Data: {message.data}")
            logger.info(f"SPRITE UPDATE: Connected clients in session: {list(self.clients.keys())}")
            
            # Add session info
            update_data = message.data.copy()
            update_data['session_code'] = self.session_code
            
            # Broadcast sprite update to other clients in the session
            logger.info(f"SPRITE UPDATE: About to broadcast to {len(self.clients) - 1} other clients")
            await self.broadcast_to_session(
                Message(message.type, update_data),
                exclude_client=client_id
            )
            logger.info(f"SPRITE UPDATE: Broadcast completed for session {self.session_code}")
            
        except Exception as e:
            logger.error(f"SPRITE UPDATE ERROR: {e}")
            await self._send_error(websocket, "Failed to process sprite update")

    async def _handle_file_request(self, websocket: WebSocket, message: Message, client_id: str):
        """Handle file request"""
        if not message.data or 'filename' not in message.data:
            await self._send_error(websocket, "Missing filename in file request")
            return
        
        filename = message.data['filename']
        
        try:
            if os.path.exists(filename):
                with open(filename, 'rb') as f:
                    file_data = f.read()
                
                # Convert to hex for JSON transmission
                hex_data = file_data.hex()
                
                await self._send_message(websocket, Message(MessageType.FILE_DATA, {
                    'filename': filename,
                    'data': hex_data,
                    'session_code': self.session_code
                }))
            else:
                await self._send_error(websocket, f"File not found: {filename}")
                
        except Exception as e:
            logger.error(f"Error handling file request: {e}")
            await self._send_error(websocket, "Failed to read file")

    async def _handle_compendium_sprite_add(self, websocket: WebSocket, message: Message, client_id: str):
        """Handle compendium sprite addition"""
        try:
            # Add session info
            update_data = message.data.copy() if message.data else {}
            update_data['session_code'] = self.session_code
            
            # Broadcast to other clients in the session
            await self.broadcast_to_session(
                Message(message.type, update_data),
                exclude_client=client_id
            )
            
        except Exception as e:
            logger.error(f"Error handling compendium sprite add: {e}")
            await self._send_error(websocket, "Failed to add compendium sprite")

    async def _handle_compendium_sprite_update(self, websocket: WebSocket, message: Message, client_id: str):
        """Handle compendium sprite update"""
        try:
            # Add session info
            update_data = message.data.copy() if message.data else {}
            update_data['session_code'] = self.session_code
            
            # Broadcast to other clients in the session
            await self.broadcast_to_session(
                Message(message.type, update_data),
                exclude_client=client_id
            )
            
        except Exception as e:
            logger.error(f"Error handling compendium sprite update: {e}")
            await self._send_error(websocket, "Failed to update compendium sprite")

    async def _handle_compendium_sprite_remove(self, websocket: WebSocket, message: Message, client_id: str):
        """Handle compendium sprite removal"""
        try:
            # Add session info
            update_data = message.data.copy() if message.data else {}
            update_data['session_code'] = self.session_code
            
            # Broadcast to other clients in the session
            await self.broadcast_to_session(
                Message(message.type, update_data),
                exclude_client=client_id
            )
            
        except Exception as e:
            logger.error(f"Error handling compendium sprite remove: {e}")
            await self._send_error(websocket, "Failed to remove compendium sprite")

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
                }
                for client_id, info in self.client_info.items()
            ]
        }

    def has_clients(self) -> bool:
        """Check if session has any connected clients"""
        return len(self.clients) > 0


class MockWriter:
    """Mock writer for server protocol compatibility"""
    
    def write(self, data: bytes):
        """Mock write method"""
        pass
    
    async def drain(self):
        """Mock drain method"""
        pass
    
    def get_extra_info(self, key: str):
        """Mock get_extra_info method"""
        if key == 'peername':
            return ('127.0.0.1', 0)
        return None


# Global session manager
class SessionProtocolManager:
    """Manages protocol services for all game sessions"""
    
    def __init__(self):
        self.sessions: Dict[str, GameSessionProtocolService] = {}
        
    def get_session_service(self, session_code: str) -> GameSessionProtocolService:
        """Get or create protocol service for a session"""
        if session_code not in self.sessions:
            self.sessions[session_code] = GameSessionProtocolService(session_code)
            logger.info(f"Created protocol service for session {session_code}")
        return self.sessions[session_code]
    
    def remove_session(self, session_code: str):
        """Remove a session protocol service"""
        if session_code in self.sessions:
            del self.sessions[session_code]
            logger.info(f"Removed protocol service for session {session_code}")
    
    def cleanup_empty_sessions(self):
        """Remove sessions with no connected clients"""
        empty_sessions = [
            session_code for session_code, service in self.sessions.items()
            if not service.has_clients()
        ]
        
        for session_code in empty_sessions:
            self.remove_session(session_code)
    
    def get_all_sessions_stats(self) -> List[dict]:
        """Get statistics for all sessions"""
        return [service.get_session_stats() for service in self.sessions.values()]


# Global instance
_session_protocol_manager = SessionProtocolManager()

def get_session_protocol_manager() -> SessionProtocolManager:
    """Get the global session protocol manager"""
    return _session_protocol_manager
