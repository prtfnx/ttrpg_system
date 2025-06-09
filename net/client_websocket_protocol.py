import asyncio
import logging
import time
import hashlib
import os
from typing import Callable, Optional, Dict, Any
from .protocol import Message, MessageType, ProtocolHandler
from .client_protocol import ClientProtocol

logger = logging.getLogger(__name__)

class WebSocketClientProtocol(ClientProtocol):
    """Extended ClientProtocol for WebSocket-based connections with session support"""
    def __init__(self, context, send_callback: Callable[[str], None], websocket_client=None, session_code: Optional[str] = None):
        super().__init__(context, send_callback)
        self.websocket_client = websocket_client
        self.session_code = session_code
        self.connection_type = "websocket"
        
    def set_session_code(self, session_code: str):
        """Set the game session code"""
        self.session_code = session_code
        
    def ping(self):
        """Override ping for WebSocket-specific implementation"""
        if time.time() - self.last_ping > 30:
            if self.websocket_client and self.websocket_client.is_connected:
                # WebSocket client handles pings automatically via ping_loop
                self.websocket_client.ping_server()
            else:
                # Fallback to regular ping message
                msg = Message(MessageType.PING, {
                    'session_code': self.session_code,
                    'connection_type': 'websocket'
                }, self.client_id)
                self.send(msg.to_json())
            self.last_ping = time.time()
    
    def request_table(self, table_name: Optional[str] = None):
        """Request table with session-based WebSocket handling"""
        msg = Message(MessageType.TABLE_REQUEST, {
            'name': table_name,
            'session_code': self.session_code,
            'connection_type': 'websocket',
            'websocket_connected': getattr(self.websocket_client, 'is_connected', False) if self.websocket_client else False
        }, self.client_id)
        self.send(msg.to_json())
        logger.info(f"Requested table '{table_name}' in session {self.session_code}")
    
    def request_new_table(self, table_name: str, table_type: str = "battle"):
        """Request creation of a new table in the session"""
        msg = Message(MessageType.NEW_TABLE_REQUEST, {
            'name': table_name,
            'type': table_type,
            'session_code': self.session_code,
            'connection_type': 'websocket'
        }, self.client_id)
        self.send(msg.to_json())
        logger.info(f"Requested new table '{table_name}' of type '{table_type}' in session {self.session_code}")
    
    def send_update(self, update_type: str, data: Dict[str, Any]):
        """Send update with WebSocket metadata"""
        msg = Message(MessageType.TABLE_UPDATE, {
            'type': update_type, 
            'data': data,
            'session_code': self.session_code,
            'connection_type': 'websocket'
        }, self.client_id)
        self.send(msg.to_json())
    def send_chat_message(self, message: str, target_table: Optional[str] = None):
        """Send chat message to session or specific table"""
        msg = Message(MessageType.CUSTOM, {
            'message': message,
            'session_code': self.session_code,
            'table_name': target_table,
            'connection_type': 'websocket',
            'username': getattr(self, 'username', 'Unknown'),
            'custom_type': 'chat'
        }, self.client_id)
        self.send(msg.to_json())
        logger.info(f"Sent chat message to session {self.session_code}, table: {target_table}")
    
    async def handle_websocket_message(self, message_str: str):
        """Handle WebSocket-specific message processing"""
        try:
            # Add any WebSocket-specific preprocessing here
            await self.handle_message(message_str)
        except Exception as e:
            logger.error(f"WebSocket message handling error: {e}")
    
    def send_sprite_update(self, update_type: str, sprite_data: Dict[str, Any]):
        """Send sprite update with WebSocket metadata"""
        msg = Message(MessageType.SPRITE_UPDATE, {
            'category': 'sprite',
            'type': update_type, 
            'data': sprite_data,
            'session_code': self.session_code,
            'connection_type': 'websocket'
        }, self.client_id)
        self.send(msg.to_json())
    
    def send_compendium_sprite_add(self, table_name: str, entity_data: Dict[str, Any], 
                                 position: Dict[str, float], entity_type: str, layer: str = 'tokens'):
        """Send compendium sprite add with WebSocket metadata"""
        msg = Message(MessageType.COMPENDIUM_SPRITE_ADD, {
            'table_name': table_name,
            'entity_data': entity_data,
            'position': position,
            'entity_type': entity_type,
            'layer': layer,
            'scale_x': 1.0,
            'scale_y': 1.0,
            'rotation': 0.0,
            'session_code': self.session_code,
            'connection_type': 'websocket'
        }, self.client_id)
        self.send(msg.to_json())
        logger.info(f"Sent WebSocket compendium sprite add: {entity_data.get('name', 'Unknown')} to {table_name} in session {self.session_code}")
    def send_test_message(self, test_data: Optional[Dict[str, Any]] = None):
        """Send test message via WebSocket"""
        if test_data is None:
            test_data = {"message": "WebSocket test", "timestamp": time.time()}
            
        msg = Message(MessageType.TEST, {
            'test_data': test_data,
            'session_code': self.session_code,
            'connection_type': 'websocket'
        }, self.client_id)
        self.send(msg.to_json())
        logger.info(f"Sent WebSocket test message to session {self.session_code}: {test_data}")
    
    def handle_session_response(self, response_data: Dict[str, Any]):
        """Handle session-specific server responses"""
        try:
            response_type = response_data.get('type', 'unknown')
            
            if response_type == 'session_joined':
                logger.info(f"Successfully joined session: {response_data.get('session_code')}")
                self.session_code = response_data.get('session_code')
                
            elif response_type == 'table_list':
                tables = response_data.get('tables', [])
                logger.info(f"Received table list for session {self.session_code}: {len(tables)} tables")
                
            elif response_type == 'table_created':
                table_name = response_data.get('table_name')
                logger.info(f"Table '{table_name}' created in session {self.session_code}")
                
            elif response_type == 'error':
                error_msg = response_data.get('message', 'Unknown error')
                logger.error(f"Session error: {error_msg}")
                
            else:
                logger.debug(f"Unhandled session response type: {response_type}")
                
        except Exception as e:
            logger.error(f"Session response handling error: {e}")

    def get_connection_info(self) -> Dict[str, Any]:
        """Get connection information for debugging"""
        websocket_info = {}
        if self.websocket_client:
            websocket_info = {
                'connected': getattr(self.websocket_client, 'is_connected', False),
                'websocket_url': getattr(self.websocket_client, 'websocket_url', None),
                'last_ping': getattr(self.websocket_client, 'last_ping', 0)
            }
            
        return {
            'type': 'websocket',
            'client_id': self.client_id,
            'websocket_client': self.websocket_client is not None,
            'websocket_info': websocket_info
        }

    def handle_connection_status(self, connected: bool):
        """Handle WebSocket connection status changes"""
        if connected:
            logger.info("WebSocket connection established")
            # Optionally send a registration or ready message
            self.send_test_message({"status": "connected"})
        else:
            logger.warning("WebSocket connection lost")

def setup_websocket_protocol(context, websocket_client, session_code=None) -> WebSocketClientProtocol:
    """Setup WebSocket protocol with proper send callback"""
    def send_to_server(msg: str):
        if hasattr(context, 'queue_to_send'):
            context.queue_to_send.put(msg)
        elif websocket_client:
            websocket_client.send_data(msg)
        else:
            logger.error("No way to send WebSocket message")
    
    protocol = WebSocketClientProtocol(context, send_to_server, websocket_client, session_code)
    context.protocol = protocol
    
    logger.info(f"WebSocket protocol setup complete for session: {session_code}")
    return protocol
