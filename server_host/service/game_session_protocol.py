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
        
        logger.info(f"GameSessionProtocolService created for session {session_code}")

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
            client_id = self.websocket_to_client.get(websocket)
            
            if not client_id:
                await self._send_error(websocket, "Client not registered in session")
                return
            
            # Update last activity
            if client_id in self.client_info:
                self.client_info[client_id]["last_ping"] = time.time()
            
            logger.debug(f"Received {message.type.value} from {client_id} in session {self.session_code}")
            
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
        
        for client_id, websocket in self.clients.items():
            if client_id != exclude_client:
                try:
                    await self._send_message(websocket, message)
                except Exception as e:
                    logger.error(f"Failed to send to {client_id}: {e}")
                    disconnected_clients.append(websocket)
        
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
            table_name = message.data.get('name') if message.data else "default"
            if table_name is None:
                table_name = "default"
            table = self.table_manager.get_table(table_name)
            
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
            
            await self._send_message(websocket, Message(MessageType.TABLE_DATA, table_data))
            
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
            # Add session info
            update_data = message.data.copy()
            update_data['session_code'] = self.session_code
            
            # Broadcast sprite update to other clients in the session
            await self.broadcast_to_session(
                Message(message.type, update_data),
                exclude_client=client_id
            )
            
        except Exception as e:
            logger.error(f"Error handling sprite update: {e}")
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
