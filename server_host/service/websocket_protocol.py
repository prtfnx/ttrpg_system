"""
WebSocket Protocol Service for TTRPG Web Server
Implements the table protocol over WebSocket integrated with game sessions
"""
import json
import logging
import asyncio
import hashlib
import time
from typing import Dict, Set, Optional, Any, List
from fastapi import WebSocket, WebSocketDisconnect
from dataclasses import asdict
import os
import sys

# Add parent directory to path to import protocol
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

try:
    from net.protocol import Message, MessageType, ProtocolHandler
    from core_table.server_protocol import ServerProtocol
    from core_table.server import TableManager
except ImportError:
    # Fallback for when running from different directory
    import sys
    import os
    parent_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    sys.path.append(parent_dir)
    from net.protocol import Message, MessageType, ProtocolHandler
    from core_table.server_protocol import ServerProtocol
    from core_table.server import TableManager

logger = logging.getLogger(__name__)

class GameSessionProtocolService:
    """WebSocket service implementing table protocol within game sessions"""
    
    def __init__(self, session_code: str, table_manager: TableManager = None):
        self.session_code = session_code
        self.table_manager = table_manager or TableManager()
        self.server_protocol = ServerProtocol(self.table_manager)
        
        # Connections specific to this game session
        self.connections: Dict[str, WebSocket] = {}  # client_id -> websocket
        self.connection_info: Dict[WebSocket, dict] = {}  # websocket -> info
        
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
    
    async def connect(self, websocket: WebSocket, client_id: str = None) -> str:
        """Connect a WebSocket client"""
        await websocket.accept()
        
        if not client_id:
            client_id = self._generate_client_id()
        
        self.connections[client_id] = websocket
        self.connection_info[websocket] = {
            "client_id": client_id,
            "connected_at": time.time(),
            "last_ping": time.time()
        }
        
        logger.info(f"WebSocket client {client_id} connected")
        
        # Send welcome message
        await self._send_message(websocket, Message(
            MessageType.PING, 
            {"message": "Welcome to TTRPG WebSocket Server", "client_id": client_id}
        ))
        
        return client_id
    
    async def disconnect(self, websocket: WebSocket):
        """Disconnect a WebSocket client"""
        if websocket in self.connection_info:
            client_id = self.connection_info[websocket]["client_id"]
            
            # Clean up
            if client_id in self.connections:
                del self.connections[client_id]
            del self.connection_info[websocket]
            
            # Notify server protocol if available
            if self.server_protocol:
                self.server_protocol.disconnect_client(client_id)
            
            logger.info(f"WebSocket client {client_id} disconnected")
    
    async def handle_message(self, websocket: WebSocket, message_str: str):
        """Handle incoming WebSocket message"""
        try:
            # Parse message
            message = Message.from_json(message_str)
            client_info = self.connection_info.get(websocket, {})
            client_id = client_info.get("client_id", "unknown")
            
            logger.debug(f"Received {message.type.value} from {client_id}")
            
            # Update last activity
            if websocket in self.connection_info:
                self.connection_info[websocket]["last_ping"] = time.time()
            
            # Handle message by type
            if message.type in self.message_handlers:
                await self.message_handlers[message.type](websocket, message, client_id)
            else:
                logger.warning(f"Unknown message type: {message.type.value}")
                await self._send_error(websocket, f"Unknown message type: {message.type.value}")
                
        except json.JSONDecodeError as e:
            logger.error(f"Invalid JSON from WebSocket: {e}")
            await self._send_error(websocket, "Invalid JSON format")
        except Exception as e:
            logger.error(f"Error handling WebSocket message: {e}")
            await self._send_error(websocket, "Internal server error")
    
    async def broadcast_to_all(self, message: Message, exclude_client: str = None):
        """Broadcast message to all connected clients"""
        disconnected_clients = []
        
        for client_id, websocket in self.connections.items():
            if client_id != exclude_client:
                try:
                    await self._send_message(websocket, message)
                except Exception as e:
                    logger.error(f"Failed to send to {client_id}: {e}")
                    disconnected_clients.append(client_id)
        
        # Clean up disconnected clients
        for client_id in disconnected_clients:
            if client_id in self.connections:
                websocket = self.connections[client_id]
                await self.disconnect(websocket)
    
    async def send_to_client(self, client_id: str, message: Message):
        """Send message to specific client"""
        if client_id in self.connections:
            websocket = self.connections[client_id]
            try:
                await self._send_message(websocket, message)
            except Exception as e:
                logger.error(f"Failed to send to {client_id}: {e}")
                await self.disconnect(websocket)
        else:
            logger.warning(f"Client {client_id} not found for message delivery")
    
    # Message Handlers
    
    async def _handle_ping(self, websocket: WebSocket, message: Message, client_id: str):
        """Handle ping message"""
        await self._send_message(websocket, Message(MessageType.PONG, {"timestamp": time.time()}))
    
    async def _handle_table_request(self, websocket: WebSocket, message: Message, client_id: str):
        """Handle table data request"""
        if not self.server_protocol:
            await self._send_error(websocket, "Table manager not available")
            return
        
        try:
            table_name = message.data.get('name') if message.data else None
            table = self.server_protocol.table_manager.get_table(table_name)
            
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
                'layers': table.table_to_layered_dict() if hasattr(table, 'table_to_layered_dict') else {}
            }
            
            await self._send_message(websocket, Message(MessageType.TABLE_DATA, table_data))
            
        except Exception as e:
            logger.error(f"Error handling table request: {e}")
            await self._send_error(websocket, "Failed to retrieve table data")
    
    async def _handle_new_table_request(self, websocket: WebSocket, message: Message, client_id: str):
        """Handle new table creation request"""
        if not self.server_protocol:
            await self._send_error(websocket, "Table manager not available")
            return
        
        try:
            table_name = message.data.get('table_name', 'default') if message.data else 'default'
            
            # Create or get table
            table = self.server_protocol.table_manager.get_table(table_name)
            if not table:
                # Create new table if it doesn't exist
                table = self.server_protocol.table_manager.create_table(table_name, 30, 30)
            
            table_data = {
                'name': table.name,
                'width': table.width,
                'height': table.height,
                'scale': 1.0,
                'x_moved': 0.0,
                'y_moved': 0.0,
                'show_grid': True,
                'layers': table.table_to_layered_dict() if hasattr(table, 'table_to_layered_dict') else {}
            }
            
            await self._send_message(websocket, Message(MessageType.NEW_TABLE_RESPONSE, table_data))
            
        except Exception as e:
            logger.error(f"Error handling new table request: {e}")
            await self._send_error(websocket, "Failed to create table")
    
    async def _handle_table_update(self, websocket: WebSocket, message: Message, client_id: str):
        """Handle table update with broadcast"""
        if not message.data:
            await self._send_error(websocket, "Missing update data")
            return
        
        try:
            # Process update through server protocol if available
            if self.server_protocol:
                # Use a mock writer for the server protocol
                mock_writer = MockWriter()
                await self.server_protocol.handle_client(client_id, mock_writer, json.dumps(asdict(message)))
            
            # Broadcast update to other clients
            await self.broadcast_to_all(message, exclude_client=client_id)
            
        except Exception as e:
            logger.error(f"Error handling table update: {e}")
            await self._send_error(websocket, "Failed to process table update")
    
    async def _handle_sprite_update(self, websocket: WebSocket, message: Message, client_id: str):
        """Handle sprite update"""
        if not message.data:
            await self._send_error(websocket, "Missing sprite data")
            return
        
        try:
            # Broadcast sprite update to other clients
            await self.broadcast_to_all(message, exclude_client=client_id)
            
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
                    'data': hex_data
                }))
            else:
                await self._send_error(websocket, f"File not found: {filename}")
                
        except Exception as e:
            logger.error(f"Error handling file request: {e}")
            await self._send_error(websocket, "Failed to read file")
    
    async def _handle_compendium_sprite_add(self, websocket: WebSocket, message: Message, client_id: str):
        """Handle compendium sprite addition"""
        try:
            # Broadcast to other clients
            await self.broadcast_to_all(message, exclude_client=client_id)
            
        except Exception as e:
            logger.error(f"Error handling compendium sprite add: {e}")
            await self._send_error(websocket, "Failed to add compendium sprite")
    
    async def _handle_compendium_sprite_update(self, websocket: WebSocket, message: Message, client_id: str):
        """Handle compendium sprite update"""
        try:
            # Broadcast to other clients
            await self.broadcast_to_all(message, exclude_client=client_id)
            
        except Exception as e:
            logger.error(f"Error handling compendium sprite update: {e}")
            await self._send_error(websocket, "Failed to update compendium sprite")
    
    async def _handle_compendium_sprite_remove(self, websocket: WebSocket, message: Message, client_id: str):
        """Handle compendium sprite removal"""
        try:
            # Broadcast to other clients
            await self.broadcast_to_all(message, exclude_client=client_id)
            
        except Exception as e:
            logger.error(f"Error handling compendium sprite remove: {e}")
            await self._send_error(websocket, "Failed to remove compendium sprite")
    
    # Utility Methods
    
    async def _send_message(self, websocket: WebSocket, message: Message):
        """Send message to WebSocket"""
        await websocket.send_text(message.to_json())
    
    async def _send_error(self, websocket: WebSocket, error_message: str):
        """Send error message to WebSocket"""
        error_msg = Message(MessageType.ERROR, {"error": error_message})
        await self._send_message(websocket, error_msg)
    
    def _generate_client_id(self) -> str:
        """Generate unique client ID"""
        return hashlib.md5(f"{time.time()}_{len(self.connections)}".encode()).hexdigest()[:8]
    
    def get_connected_clients(self) -> List[str]:
        """Get list of connected client IDs"""
        return list(self.connections.keys())
    
    def get_connection_count(self) -> int:
        """Get number of connected clients"""
        return len(self.connections)
    
    async def cleanup_stale_connections(self, timeout_seconds: int = 300):
        """Clean up connections that haven't pinged recently"""
        current_time = time.time()
        stale_connections = []
        
        for websocket, info in self.connection_info.items():
            if current_time - info["last_ping"] > timeout_seconds:
                stale_connections.append(websocket)
        
        for websocket in stale_connections:
            logger.info(f"Cleaning up stale connection: {self.connection_info[websocket]['client_id']}")
            await self.disconnect(websocket)


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


# WebSocket Protocol Interface for FastAPI integration
class TTRPGWebSocketHandler:
    """FastAPI WebSocket handler for TTRPG protocol"""
    
    def __init__(self, table_manager=None):
        self.service = WebSocketProtocolService(table_manager)
    
    async def handle_websocket(self, websocket: WebSocket, client_id: str = None):
        """Handle WebSocket connection lifecycle"""
        client_id = await self.service.connect(websocket, client_id)
        
        try:
            while True:
                # Receive message
                data = await websocket.receive_text()
                await self.service.handle_message(websocket, data)
                
        except WebSocketDisconnect:
            logger.info(f"WebSocket client {client_id} disconnected")
        except Exception as e:
            logger.error(f"WebSocket error for {client_id}: {e}")
        finally:
            await self.service.disconnect(websocket)
    
    async def broadcast_message(self, message_type: MessageType, data: dict, exclude_client: str = None):
        """Broadcast message to all connected clients"""
        message = Message(message_type, data)
        await self.service.broadcast_to_all(message, exclude_client)
    
    async def send_to_client(self, client_id: str, message_type: MessageType, data: dict):
        """Send message to specific client"""
        message = Message(message_type, data)
        await self.service.send_to_client(client_id, message)
    
    def get_stats(self) -> dict:
        """Get WebSocket service statistics"""
        return {
            "connected_clients": self.service.get_connection_count(),
            "client_ids": self.service.get_connected_clients()
        }


# Dependency function for FastAPI
_websocket_handler = None

def get_websocket_handler(table_manager=None) -> TTRPGWebSocketHandler:
    """Get or create WebSocket handler instance"""
    global _websocket_handler
    if _websocket_handler is None:
        _websocket_handler = TTRPGWebSocketHandler(table_manager)
    return _websocket_handler
