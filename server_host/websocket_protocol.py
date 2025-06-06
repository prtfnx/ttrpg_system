"""
WebSocket-adapted server protocol handler
Adapts the original ServerProtocol for WebSocket communication using proper adapter pattern
"""
import asyncio
import logging
import json
import os
import sys
from typing import Dict, Set, Optional, Tuple, Any, Callable

# Add parent directory to path for imports
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from net.protocol import Message, MessageType, ProtocolHandler
from core_table.table import VirtualTable
from core_table.game import Game
from core_table.server import TableManager
from core_table.server_protocol import ServerProtocol
logger = logging.getLogger(__name__)

class WebSocketWriter:
    """Adapter to make WebSocket send_callback look like a writer object"""
    
    def __init__(self, client_id: str, send_callback: Callable):
        self.client_id = client_id
        self.send_callback = send_callback
        
    def write(self, data: bytes):
        """Convert writer.write() calls to send_callback calls"""
        # Store the data to be sent in the next drain() call
        self._pending_data = data
        
    async def drain(self):
        """Send the pending data via WebSocket callback"""
        if hasattr(self, '_pending_data'):
            try:
                message_str = self._pending_data.decode('utf-8').strip()
                if message_str.endswith('\n'):
                    message_str = message_str[:-1]
                
                # Parse and re-create message to ensure proper format
                message_data = json.loads(message_str)
                message = Message(
                    type=MessageType(message_data['type']),
                    data=message_data.get('data', {}),
                    client_id=message_data.get('client_id'),
                    timestamp=message_data.get('timestamp'),
                    version=message_data.get('version', '1.0'),
                    priority=message_data.get('priority', 0),
                    sequence_id=message_data.get('sequence_id')
                )
                await self.send_callback(self.client_id, message)
            except Exception as e:
                logger.error(f"Error in WebSocketWriter.drain: {e}")
            finally:
                self._pending_data = None

class WebSocketServerProtocol:
    """WebSocket-adapted server protocol using proper adapter pattern"""

    def __init__(self, game: Game):
        self.parent_protocol = ServerProtocol(game.table_manager)
        self.table_manager = game.table_manager
        self.clients: Dict[str, Any] = {}
        self.files = self.parent_protocol.files
        
        # Store reference to WebSocket server for broadcasting
        self.websocket_server = None
          # Override parent protocol's client management to use our callbacks
        self._original_send = self.parent_protocol._send
        self.parent_protocol._send = self._websocket_send
        
    def set_websocket_server(self, server):
        """Set reference to WebSocket server for broadcasting"""
        self.websocket_server = server
        
    def register_handler(self, msg_type: MessageType, handler: ProtocolHandler):
        """Extension point for custom message handlers"""
        self.parent_protocol.register_handler(msg_type, handler)

    def _scan_files(self) -> Set[str]:
        """Scan for resource files"""
        return self.parent_protocol._scan_files()
        
    async def _websocket_send(self, writer, message: Message):
        """Intercept parent protocol send calls and route to WebSocket"""
        if hasattr(writer, 'client_id') and hasattr(writer, 'send_callback'):
            # This is our WebSocketWriter adapter - send to specific client
            await writer.send_callback(writer.client_id, message)
        elif self.websocket_server:
            # This is a broadcast operation - we need to find the target client
            # Look through all clients to find the one with this writer
            target_client_id = None
            for client_id, client_data in self.clients.items():
                if client_data.get('writer') == writer:
                    target_client_id = client_id
                    break
            
            if target_client_id:
                await self.websocket_server._send_to_client(target_client_id, message)
            else:
                logger.warning("Could not find target client for WebSocket send")
        else:
            # Fallback to original send method
            await self._original_send(writer, message)
        
    async def handle_client(self, client_id: str, writer, message_str: str, send_callback: Callable):
        """Handle client message - adapted for WebSocket communication"""
        try:
            # Create WebSocket writer adapter
            ws_writer = WebSocketWriter(client_id, send_callback)
            
            # Store the send callback for this client
            self.clients[client_id] = {
                'send_callback': send_callback,
                'writer': ws_writer
            }
            
            # Update parent protocol's client tracking
            self.parent_protocol.clients[client_id] = ws_writer
            
            # Handle through parent protocol with our adapter
            await self.parent_protocol.handle_client(client_id, ws_writer, message_str)
            
        except Exception as e:
            logger.error(f"Error in WebSocket handle_client: {e}")
            # Send error message directly via callback
            error_msg = Message(MessageType.ERROR, {"error": str(e)})
            await send_callback(client_id, error_msg)

    def disconnect_client(self, client_id: str):
        """Handle client disconnection"""
        if client_id in self.clients:
            del self.clients[client_id]
        self.parent_protocol.disconnect_client(client_id)
        logger.info(f"WebSocket client {client_id} disconnected")

    # Delegate all other methods to parent protocol for automatic updates
    def __getattr__(self, name):
        """Delegate unknown method calls to parent protocol"""
        return getattr(self.parent_protocol, name)
