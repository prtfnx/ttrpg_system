"""
WebSocket-based TTRPG Game Server
Handles real-time game communication via WebSocket connections
"""
import asyncio
import json
import logging
import time
from typing import Dict, Optional, List
from datetime import datetime

from fastapi import WebSocket
from websocket_protocol import WebSocketServerProtocol
from table_manager import TableManager

# Import message types
import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(__file__)))
from net.protocol import Message, MessageType
from core_table.game import Game
from core_table.server_protocol import ServerProtocol
logger = logging.getLogger(__name__)

class WebSocketClient:
    """Represents a WebSocket client connection"""
    
    def __init__(self, client_id: str, websocket: WebSocket, client_type: str = "unknown"):
        self.client_id = client_id
        self.websocket = websocket
        self.client_type = client_type
        self.connected_at = datetime.now()
        self.last_ping = time.time()
        
    def is_alive(self) -> bool:
        """Check if client connection is alive"""
        # Consider client dead if no ping for 60 seconds
        return time.time() - self.last_ping < 60
        
    def update_ping(self):
        """Update last ping timestamp"""
        self.last_ping = time.time()

class WebSocketGameServer:
    """WebSocket-based game server for TTRPG sessions"""
    
    def __init__(self, game: Game, parent_protocol: Optional[bool] = True):
        self.clients: Dict[str, WebSocketClient] = {}
        self.game = game
        self.table_manager = game.table_manager
        self.protocol = WebSocketServerProtocol(game)
        # Connect the protocol to this server for broadcasting
        self.protocol.set_websocket_server(self)
        self.running = False
        logger.info("WebSocket server initialized")
        self.running = False
        logger.info("WebSocket server initialized")
        
    async def initialize(self):
        """Initialize the server"""
        await self.start_background_tasks()
        
    async def cleanup(self):
        """Cleanup the server"""
        await self.stop()
        
    async def start_background_tasks(self):
        """Start background tasks"""
        self.running = True
        # Start client cleanup task
        asyncio.create_task(self._cleanup_dead_clients())
        # Start ping task
        asyncio.create_task(self._ping_clients())
        
    async def stop(self):
        """Stop the server"""
        self.running = False
        # Close all client connections
        for client in list(self.clients.values()):
            try:
                await client.websocket.close()
            except:
                pass
        self.clients.clear()
        
    async def register_client(self, client_id: str, websocket: WebSocket, client_type: str = "unknown"):
        """Register a new WebSocket client"""
        if client_id in self.clients:
            logger.warning(f"Client {client_id} already registered, replacing connection")
            await self.unregister_client(client_id)
        
        client = WebSocketClient(client_id, websocket, client_type)
        self.clients[client_id] = client
        
        logger.info(f"Registered WebSocket client {client_id} of type {client_type}")
        
        # Send welcome message
        welcome_msg = Message(
            type=MessageType.REGISTRATION_CONFIRM,  # Using PING as a system message type
            data={"content": f"Welcome to TTRPG WebSocket Server, {client_id}!"},
            client_id=client_id
        )
        await self._send_to_client(client_id, welcome_msg)
        
    async def unregister_client(self, client_id: str):
        """Unregister a WebSocket client"""
        if client_id in self.clients:
            client = self.clients.pop(client_id)
            logger.info(f"Unregistered client {client_id}")
            
            # Close WebSocket connection if still open
            try:
                await client.websocket.close()
            except:
                pass
        else:
            logger.warning(f"Attempted to unregister unknown client {client_id}")
            
    async def handle_client_message(self, client_id: str, message_str: str):
        """Handle message from WebSocket client"""
        if client_id not in self.clients:
            logger.warning(f"Message from unknown client {client_id}")
            return
            
        logger.info(f"Received message from {client_id}: {message_str}")
        
        # Update client ping time
        self.clients[client_id].update_ping()
        
        # Handle message through protocol
        try:
            # Create a mock send function for protocol compatibility
            async def mock_send_to_client(target_client_id: str, message: Message):
                await self._send_to_client(target_client_id, message)
            
            # Handle through protocol
            print(f"Handling message for client {client_id}")
            await self.protocol.handle_client(client_id, None, message_str, mock_send_to_client)
        except Exception as e:
            logger.error(f"Error processing message from {client_id}: {e}")
    
    async def handle_client_ping(self, client_id: str):
        """Handle ping from client"""
        if client_id in self.clients:
            self.clients[client_id].update_ping()
            
            # Send pong response
            pong_message = Message(
                type=MessageType.PONG,
                data={"content": "pong"},
                client_id=client_id
            )
            await self._send_to_client(client_id, pong_message)
            logger.debug(f"Sent pong to client {client_id}")
    
    def get_client_count(self) -> int:
        """Get number of connected clients"""
        return len(self.clients)
        
    def get_client_info(self) -> List[Dict]:
        """Get information about connected clients"""
        return [
            {
                "client_id": client.client_id,
                "client_type": client.client_type,
                "connected_at": client.connected_at.isoformat(),
                "last_ping": client.last_ping,
                "is_alive": client.is_alive()
            }
            for client in self.clients.values()
        ]
    
    def get_table_names(self) -> List[str]:
        """Get list of available table names"""
        return self.table_manager.list_tables()
        
    def create_table(self, name: str, width: int = 100, height: int = 100):
        """Create a new table"""
        return self.table_manager.create_table(name, width, height)
        
    async def get_tables_data(self) -> List[Dict]:
        """Get data for all tables"""
        try:
            table_names = self.table_manager.list_tables()
            tables = []
            
            for table_name in table_names:
                table_data = await self.get_table_data(table_name)
                if table_data:
                    tables.append(table_data)
                    
            return tables
        except Exception as e:
            logger.error(f"Error getting tables data: {e}")
            # Return at least basic info
            tables = [{"name": "default", "width": 100, "height": 100, "entity_count": 0, "layers": []}]
        
        return tables
        
    async def get_table_data(self, table_name: str) -> Optional[Dict]:
        """Get specific table data"""
        table = self.table_manager.get_table(table_name)
        if not table:
            return None
            
        # Handle layers safely - could be list or dict
        layers_data = {}
        if hasattr(table, 'layers') and table.layers:
            if isinstance(table.layers, dict):
                layers_data = {layer: {} for layer in table.layers.keys()}
            elif hasattr(table.layers, '__iter__'):
                layers_data = {layer: {} for layer in table.layers}
        else:
            # Default layers if none exist
            layers_data = {layer: {} for layer in ['map', 'tokens', 'dungeon_master', 'light', 'height']}
        
        # Get entity count safely
        entity_count = 0
        if hasattr(table, 'entities') and table.entities:
            entity_count = len(table.entities) if hasattr(table.entities, '__len__') else 0
        
        return {            "name": table_name,
            "width": getattr(table, 'width', 100),
            "height": getattr(table, 'height', 100),
            "entity_count": entity_count,
            "layers": list(layers_data.keys())
        }
        
    async def _send_to_client(self, client_id: str, message: Message):
        """Send message to specific client via WebSocket"""
        if client_id not in self.clients:
            logger.warning(f"Attempted to send to unknown client {client_id}")
            return
            
        client = self.clients[client_id]
        
        try:
            # Send message directly as JSON (don't double-wrap)
            # The message.to_json() already returns a properly formatted JSON string
            await client.websocket.send_text(message.to_json())
            logger.debug(f"Message sent to client {client_id}")
                    
        except Exception as e:
            logger.error(f"Failed to send WebSocket message to client {client_id}: {e}")
            # Remove client if connection is broken
            await self.unregister_client(client_id)
                
    async def _cleanup_dead_clients(self):
        """Background task to remove dead clients"""
        while self.running:
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
        while self.running:
            try:
                await asyncio.sleep(20)  # Ping every 20 seconds
                
                ping_message = Message(
                    type=MessageType.PING,
                    data={"content": "ping"},
                    client_id="server"
                )
                
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

    async def handle_websocket_connection(self, websocket: WebSocket, path: str):
        """Handle new WebSocket connection"""
        client_id = None
        try:
            # Wait for initial registration message
            message = await websocket.receive_text()
            data = json.loads(message)
            
            if data.get("type") == "register":
                client_id = data.get("client_id")
                client_type = data.get("client_type", "unknown")
                
                if client_id:
                    await self.register_client(client_id, websocket, client_type)
                    
                    # Send registration response
                    response = {
                        "type": "registration_response",
                        "success": True,
                        "client_id": client_id
                    }
                    await websocket.send_text(json.dumps(response))
                    
                    # Handle messages from this client
                    while True:
                        try:
                            message = await websocket.receive_text()
                            data = json.loads(message)
                            
                            if data.get("type") == "ping":
                                await self.handle_client_ping(client_id)
                            elif data.get("type") == "pong":
                                # Handle pong response
                                logger.debug(f"Received pong from client {client_id}")
                            else:
                                await self.handle_client_message(client_id, message)
                        except json.JSONDecodeError:
                            logger.warning(f"Invalid JSON from client {client_id}")
                        except Exception as e:
                            logger.error(f"Error handling message from {client_id}: {e}")
                            break
                            
        except Exception as e:
            logger.error(f"WebSocket connection error: {e}")
        finally:
            if client_id:
                await self.unregister_client(client_id)
