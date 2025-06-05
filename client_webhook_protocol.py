import asyncio
import logging
import time
import hashlib
import os
from typing import Callable, Optional, Dict, Any
from protocol import Message, MessageType, ProtocolHandler
from client_protocol import ClientProtocol

logger = logging.getLogger(__name__)

class WebhookClientProtocol(ClientProtocol):
    """Extended ClientProtocol for webhook-based connections"""
    
    def __init__(self, context, send_callback: Callable[[str], None], webhook_client=None):
        super().__init__(context, send_callback)
        self.webhook_client = webhook_client
        self.connection_type = "webhook"
        
    def ping(self):
        """Override ping for webhook-specific implementation"""
        if time.time() - self.last_ping > 30:
            if self.webhook_client:
                self.webhook_client.ping_server()
            else:
                # Fallback to regular ping message
                msg = Message(MessageType.PING, {}, self.client_id)
                self.send(msg.to_json())
            self.last_ping = time.time()
    
    def request_table(self, table_name: Optional[str] = None):
        """Request table with webhook-specific handling"""
        msg = Message(MessageType.TABLE_REQUEST, {
            'name': table_name,
            'connection_type': 'webhook',
            'webhook_url': getattr(self.webhook_client, 'webhook_url', None) if self.webhook_client else None
        }, self.client_id)
        self.send(msg.to_json())
    
    def send_update(self, update_type: str, data: Dict[str, Any]):
        """Send update with webhook metadata"""
        msg = Message(MessageType.TABLE_UPDATE, {
            'type': update_type, 
            'data': data,
            'connection_type': 'webhook'
        }, self.client_id)
        self.send(msg.to_json())
    
    async def handle_webhook_message(self, message_str: str):
        """Handle webhook-specific message processing"""
        try:
            # Add any webhook-specific preprocessing here
            await self.handle_message(message_str)
        except Exception as e:
            logger.error(f"Webhook message handling error: {e}")
    
    def send_sprite_update(self, update_type: str, sprite_data: Dict[str, Any]):
        """Send sprite update with webhook metadata"""
        msg = Message(MessageType.SPRITE_UPDATE, {
            'category': 'sprite',
            'type': update_type, 
            'data': sprite_data,
            'connection_type': 'webhook'
        }, self.client_id)
        self.send(msg.to_json())
    
    def send_compendium_sprite_add(self, table_name: str, entity_data: Dict[str, Any], 
                                 position: Dict[str, float], entity_type: str, layer: str = 'tokens'):
        """Send compendium sprite add with webhook metadata"""
        msg = Message(MessageType.COMPENDIUM_SPRITE_ADD, {
            'table_name': table_name,
            'entity_data': entity_data,
            'position': position,
            'entity_type': entity_type,
            'layer': layer,
            'scale_x': 1.0,
            'scale_y': 1.0,
            'rotation': 0.0,
            'connection_type': 'webhook'
        }, self.client_id)
        self.send(msg.to_json())
        logger.info(f"Sent webhook compendium sprite add: {entity_data.get('name', 'Unknown')} to {table_name}")
    
    def get_connection_info(self) -> Dict[str, Any]:
        """Get connection information for debugging"""
        return {
            'type': 'webhook',
            'client_id': self.client_id,
            'webhook_client': self.webhook_client is not None,
            'connected': getattr(self.webhook_client, 'is_connected', False) if self.webhook_client else False
        }

def setup_webhook_protocol(context, webhook_client) -> WebhookClientProtocol:
    """Setup webhook protocol with proper send callback"""
    def send_to_server(msg: str):
        if hasattr(context, 'queue_to_send'):
            context.queue_to_send.put(msg)
        elif webhook_client:
            webhook_client.send_data(msg)
        else:
            logger.error("No way to send webhook message")
    
    protocol = WebhookClientProtocol(context, send_to_server, webhook_client)
    context.protocol = protocol
    
    logger.info("Webhook protocol setup complete")
    return protocol
