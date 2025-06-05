"""
Webhook-based game server implementation
Adapts the original server functionality for HTTP/webhook communication
"""
import asyncio
import logging
import time
import json
import aiohttp
from typing import Dict, Set, Optional, Any, List
import uuid
import os
import sys

# Add parent directory to path for imports
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from core_table.table import VirtualTable
from core_table.entities import Spell
from net.protocol import Message, MessageType
from server_host.webhook_protocol import WebhookServerProtocol

logger = logging.getLogger(__name__)

class WebhookClient:
    """Represents a webhook client connection"""
    def __init__(self, client_id: str, webhook_url: str, client_type: str = "unknown"):
        self.client_id = client_id
        self.webhook_url = webhook_url
        self.client_type = client_type
        self.last_ping = time.time()
        self.connected_at = time.time()
        self.message_count = 0
        
    def update_ping(self):
        """Update last ping time"""
        self.last_ping = time.time()
        
    def is_alive(self, timeout: float = 60.0) -> bool:
        """Check if client is still alive based on ping timeout"""
        return (time.time() - self.last_ping) < timeout
        
    def to_dict(self) -> Dict:
        """Convert to dictionary for API responses"""
        return {
            "client_id": self.client_id,
            "webhook_url": self.webhook_url,
            "client_type": self.client_type,
            "last_ping": self.last_ping,
            "connected_at": self.connected_at,
            "message_count": self.message_count,
            "is_alive": self.is_alive()
        }

class WebhookGameServer:
    """Main webhook-based game server"""
    
    def __init__(self, table_manager):
        self.table_manager = table_manager
        self.protocol = WebhookServerProtocol(table_manager)
        self.clients: Dict[str, WebhookClient] = {}
        
        # HTTP session for sending webhooks
        self.session: Optional[aiohttp.ClientSession] = None
        
        # Background tasks
        self._cleanup_task: Optional[asyncio.Task] = None
        self._ping_task: Optional[asyncio.Task] = None
        
    async def initialize(self):
        """Initialize the webhook server"""
        # Create HTTP session for webhook requests
        self.session = aiohttp.ClientSession(
            timeout=aiohttp.ClientTimeout(total=10)
        )
        
        # Start background tasks
        self._cleanup_task = asyncio.create_task(self._cleanup_dead_clients())
        self._ping_task = asyncio.create_task(self._ping_clients())
        
        logger.info("Webhook server initialized")
        
    async def cleanup(self):
        """Cleanup server resources"""
        # Cancel background tasks
        if self._cleanup_task:
            self._cleanup_task.cancel()
        if self._ping_task:
            self._ping_task.cancel()
            
        # Close HTTP session
        if self.session:
            await self.session.close()
            
        logger.info("Webhook server cleanup complete")
        
    async def register_client(self, client_id: str, webhook_url: str, client_type: str = "unknown") -> bool:
        """Register a new webhook client"""
        try:
            # Test webhook connectivity
            test_success = await self._test_webhook(webhook_url)
            if not test_success:
                logger.warning(f"Webhook test failed for {client_id} at {webhook_url}")
                # Continue anyway - might be temporary network issue
            
            # Create client
            client = WebhookClient(client_id, webhook_url, client_type)
            self.clients[client_id] = client
            
            logger.info(f"Registered client {client_id} ({client_type}) at {webhook_url}")
            
            # Send welcome message
            welcome_msg = Message(MessageType.PING, {'message': 'Welcome to TTRPG Server'})
            await self._send_to_client(client_id, welcome_msg)
            
            return True
            
        except Exception as e:
            logger.error(f"Client registration failed for {client_id}: {e}")
            return False
            
    async def unregister_client(self, client_id: str):
        """Unregister a webhook client"""
        if client_id in self.clients:
            client = self.clients.pop(client_id)
            logger.info(f"Unregistered client {client_id}")
            
            # Notify protocol
            self.protocol.disconnect_client(client_id)
        else:
            logger.warning(f"Attempted to unregister unknown client {client_id}")
            
    async def handle_client_message(self, client_id: str, message_str: str):
        """Handle message from webhook client"""
        if client_id not in self.clients:
            logger.warning(f"Message from unknown client {client_id}")
            return
            
        client = self.clients[client_id]
        client.message_count += 1
        
        # Process message through protocol
        await self.protocol.handle_client(client_id, None, message_str, self._send_to_client)
        
    async def handle_client_ping(self, client_id: str):
        """Handle ping from client"""
        if client_id in self.clients:
            self.clients[client_id].update_ping()
            logger.debug(f"Ping received from client {client_id}")
        else:
            logger.warning(f"Ping from unknown client {client_id}")

    async def get_client_list(self) -> List[Dict]:
        """Get list of connected clients"""
        return [client.to_dict() for client in self.clients.values()]
        
    async def get_table_list(self) -> List[Dict]:
        """Get list of available tables"""
        tables = []
        try:
            for table_name, table in self.table_manager.tables.items():
                # Get entity count safely
                entity_count = 0
                if hasattr(table, 'entities') and table.entities:
                    entity_count = len(table.entities)
                
                # Get layers safely
                layers = []
                if hasattr(table, 'layers') and table.layers:
                    if isinstance(table.layers, dict):
                        layers = list(table.layers.keys())
                    elif hasattr(table.layers, '__iter__'):
                        layers = list(table.layers)
                else:
                    layers = ['map', 'tokens', 'dungeon_master', 'light', 'height']  # Default layers
                
                tables.append({
                    "name": table.name,
                    "width": table.width,
                    "height": table.height,
                    "entity_count": entity_count,
                    "layers": layers
                })
        except Exception as e:
            logger.error(f"Error getting table list: {e}")
            # Return at least basic info
            tables = [{"name": "default", "width": 100, "height": 100, "entity_count": 0, "layers": []}]
        
        return tables


        
        
    async def get_table_data(self, table_name: str) -> Optional[Dict]:
        """Get specific table data"""
        table = self.table_manager.get_table(table_name)
        if not table:
            return None        # Handle layers safely - could be list or dict
        layers_data = {}
        if hasattr(table, 'layers') and table.layers:
            if isinstance(table.layers, dict):
                layers_data = {layer: {} for layer in table.layers.keys()}
            elif hasattr(table.layers, '__iter__'):
                layers_data = {layer: {} for layer in table.layers}
        else:
            # Default layers if none exist
            layers_data = {layer: {} for layer in ['map', 'tokens', 'dungeon_master', 'light', 'height']}
        
        # Handle entities safely
        entities_data = {}
        try:
            if self.protocol and hasattr(self.protocol, '_serialize_entities'):
                entities_data = self.protocol._serialize_entities(table)
        except Exception as e:
            logger.warning(f"Failed to serialize entities: {e}")
            entities_data = {}
        
        return {
            "name": table.name,
            "width": table.width,
            "height": table.height,
            "scale": getattr(table, 'scale', 1.0),
            "x_moved": getattr(table, 'x_moved', 0.0),
            "y_moved": getattr(table, 'y_moved', 0.0),
            "show_grid": getattr(table, 'show_grid', True),
            "entities": entities_data,
            "layers": layers_data,
            "files": list(self.protocol.files) if self.protocol else []        }
        
    async def create_table(self, name: str, width: int, height: int) -> VirtualTable:
        """Create a new table"""
        return self.table_manager.create_table(name, width, height)
        
    async def _send_to_client(self, client_id: str, message: Message):
        """Send message to specific client via webhook"""
        if client_id not in self.clients:
            logger.warning(f"Attempted to send to unknown client {client_id}")
            return
            
        if not self.session:
            logger.error("HTTP session not initialized")
            return
            
        client = self.clients[client_id]
        
        try:
            # Prepare webhook payload
            payload = {
                "message": message.to_json(),
                "timestamp": time.time(),
                "server_id": "ttrpg_webhook_server"
            }
            
            # Send webhook request
            async with self.session.post(
                client.webhook_url,
                json=payload,
                headers={"Content-Type": "application/json"}
            ) as response:
                if response.status == 200:
                    logger.debug(f"Message sent to client {client_id}")
                else:
                    logger.warning(f"Webhook failed for client {client_id}: {response.status}")
                    
        except Exception as e:
            logger.error(f"Failed to send webhook to client {client_id}: {e}")
            
                
    async def _test_webhook(self, webhook_url: str) -> bool:
        """Test webhook connectivity"""
        if not self.session:
            logger.error("HTTP session not initialized")
            return False
            
        try:
            test_payload = {
                "message": json.dumps({"type": "test", "data": {}}),
                "timestamp": time.time(),
                "server_id": "ttrpg_webhook_server"
            }
            
            async with self.session.post(
                webhook_url,
                json=test_payload,
                headers={"Content-Type": "application/json"}
            ) as response:
                return response.status == 200
                
        except Exception as e:
            logger.debug(f"Webhook test failed for {webhook_url}: {e}")
            return False
            
    async def _cleanup_dead_clients(self):
        """Background task to remove dead clients"""
        while True:
            try:
                await asyncio.sleep(30)  # Check every 30 seconds
                
                dead_clients = []
                for client_id, client in self.clients.items():
                    if not client.is_alive():
                        dead_clients.append(client_id)
                        
                for client_id in dead_clients:
                    logger.info(f"Removing dead client {client_id}")
                    await self.unregister_client(client_id)
                    
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Client cleanup error: {e}")
                
    async def _ping_clients(self):
        """Background task to ping clients"""
        while True:
            try:
                await asyncio.sleep(60)  # Ping every minute
                
                ping_message = Message(MessageType.PING, {"server_ping": time.time()})
                
                # Send ping to all clients
                for client_id in list(self.clients.keys()):
                    await self._send_to_client(client_id, ping_message)
                    
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Client ping error: {e}")
                
    async def broadcast_to_all_clients(self, message: Message, exclude_client: Optional[str] = None):
        """Broadcast message to all connected clients"""
        for client_id in list(self.clients.keys()):
            if exclude_client and client_id == exclude_client:
                continue
            await self._send_to_client(client_id, message)
