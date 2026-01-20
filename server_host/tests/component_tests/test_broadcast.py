#!/usr/bin/env python3
"""
Test WebSocket broadcasting functionality
Tests that table updates from one client are properly broadcast to other connected clients
"""
import pytest
import asyncio
import json
import logging
import websockets
import sys
import os
from typing import List, Dict

# Add parent directory to path for imports
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from net.protocol import Message, MessageType

logger = logging.getLogger(__name__)

pytestmark = pytest.mark.asyncio

class WebSocketTestClient:
    """Test client for WebSocket connections"""
    
    def __init__(self, name: str):
        self.name = name
        self.websocket = None
        self.received_messages = []
        self.connected = False

    async def connect(self, uri: str = "ws://127.0.0.1:8000/ws"):
        """Connect to WebSocket server"""
        try:
            self.websocket = await websockets.connect(uri)
            logger.info(f"Client {self.name} connected to {uri}")
            
            # Send registration message
            registration_msg = {
                "type": "register",
                "client_id": self.name,
                "client_type": "test_client"
            }
            await self.websocket.send(json.dumps(registration_msg))
            logger.info(f"Client {self.name} sent registration message")
              # Wait for registration response
            response = await self.websocket.recv()
            response_data = json.loads(response)
            logger.info(f"Client {self.name} received registration response: {response_data}")
            
            # Check registration success - server sends a registration_confirm message
            if response_data.get("type") == "registration_confirm" and "Welcome to TTRPG WebSocket Server" in response_data.get("data", {}).get("content", ""):
                self.connected = True
                logger.info(f"Client {self.name} registered successfully")
                
                # Start listening for messages
                asyncio.create_task(self._listen_for_messages())
            else:
                logger.error(f"Client {self.name} registration failed: {response_data}")
                self.connected = False
            
        except Exception as e:
            logger.error(f"Client {self.name} failed to connect: {e}")
            self.connected = False

    async def _listen_for_messages(self):
        """Listen for incoming messages"""
        try:
            if self.websocket:
                async for message in self.websocket:
                    logger.info(f"Client {self.name} received: {message}")
                    self.received_messages.append(message)
                
        except websockets.exceptions.ConnectionClosed:
            logger.info(f"Client {self.name} connection closed")
            self.connected = False
        except Exception as e:
            logger.error(f"Client {self.name} error listening: {e}")
            self.connected = False
            
    async def send_message(self, message: Message):
        """Send message to server"""
        if not self.connected or not self.websocket:
            logger.error(f"Client {self.name} not connected")
            return False
            
        try:
            await self.websocket.send(message.to_json())
            logger.info(f"Client {self.name} sent: {message.type.value}")
            return True
        except Exception as e:
            logger.error(f"Client {self.name} failed to send message: {e}")
            return False
            
    async def request_table(self, table_name: str = "test_table"):
        """Request table data"""
        message = Message(
            type=MessageType.NEW_TABLE_REQUEST,
            data={"table_name": table_name},
            client_id=self.name
        )
        return await self.send_message(message)
        
    async def move_sprite(self, sprite_id: str, new_position: List[float], table_name: str = "test_table"):
        """Send sprite movement update"""
        message = Message(
            type=MessageType.TABLE_UPDATE,
            data={
                "table_name": table_name,
                "type": "sprite_movement",
                "sprite_id": sprite_id,
                "position": new_position,
                "timestamp": asyncio.get_event_loop().time()
            },
            client_id=self.name
        )
        return await self.send_message(message)
        
    async def disconnect(self):
        """Disconnect from server"""
        if self.websocket:
            await self.websocket.close()
        self.connected = False
        logger.info(f"Client {self.name} disconnected")

async def test_broadcasting():
    """Test that table updates are broadcast between clients"""
    logger.info("Starting WebSocket broadcasting test...")
    
    # Create test clients
    client_a = WebSocketTestClient("client_a")
    client_b = WebSocketTestClient("client_b")
    client_c = WebSocketTestClient("client_c")
    
    try:
        # Connect all clients
        logger.info("Connecting clients...")
        await client_a.connect()
        await asyncio.sleep(0.5)  # Small delay between connections
        
        await client_b.connect()
        await asyncio.sleep(0.5)
        
        await client_c.connect()
        await asyncio.sleep(1)  # Wait for all connections to establish
        
        if not all([client_a.connected, client_b.connected, client_c.connected]):
            logger.error("Not all clients connected successfully")
            return False
        
        logger.info("All clients connected successfully")
        
        # Have all clients request the test table
        logger.info("Requesting table data from all clients...")
        await client_a.request_table("test_table")
        await client_b.request_table("test_table")
        await client_c.request_table("test_table")
        
        # Wait for table responses
        await asyncio.sleep(2)
        
        # Clear received messages to focus on broadcast test
        client_a.received_messages.clear()
        client_b.received_messages.clear()
        client_c.received_messages.clear()
        
        # Client A moves a sprite - this should be broadcast to B and C
        logger.info("Client A moving sprite...")
        sprite_id = "e6ea8c92-3ab1-4979-b4f4-628497806d8a"  # Hero sprite from server logs
        await client_a.move_sprite(sprite_id, [5.0, 5.0])
        
        # Wait for broadcasts to propagate
        await asyncio.sleep(2)
        
        # Check if other clients received the update
        logger.info("Checking broadcast results...")
        logger.info(f"Client A received {len(client_a.received_messages)} messages")
        logger.info(f"Client B received {len(client_b.received_messages)} messages")
        logger.info(f"Client C received {len(client_c.received_messages)} messages")
        
        # Test successful if B and C received at least one message
        broadcast_success = (len(client_b.received_messages) > 0 and 
                           len(client_c.received_messages) > 0)
        
        if broadcast_success:
            logger.info("✅ BROADCAST TEST PASSED - Updates were shared between clients")
            
            # Analyze the messages
            for msg in client_b.received_messages:
                logger.info(f"Client B received broadcast: {msg}")
            for msg in client_c.received_messages:
                logger.info(f"Client C received broadcast: {msg}")
        else:
            logger.error("❌ BROADCAST TEST FAILED - Updates were not shared")
            
        return broadcast_success
        
    except Exception as e:
        logger.error(f"Test failed with exception: {e}")
        return False
        
    finally:
        # Clean up connections
        logger.info("Cleaning up connections...")
        await client_a.disconnect()
        await client_b.disconnect()
        await client_c.disconnect()

async def main():
    """Main test function"""
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s:%(name)s: %(message)s"
    )
    
    logger.info("WebSocket Broadcasting Test Starting...")
    
    # Test broadcasting
    success = await test_broadcasting()
    
    if success:
        logger.info("🎉 ALL TESTS PASSED - WebSocket broadcasting is working!")
        return 0
    else:
        logger.error("💥 TESTS FAILED - WebSocket broadcasting needs fixing")
        return 1

if __name__ == "__main__":
    import sys
    sys.exit(asyncio.run(main()))
