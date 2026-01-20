"""
Test WebSocket broadcasting functionality
Tests that table updates are properly shared between connected clients
"""
import pytest
import asyncio
import json
import logging
import websockets
from typing import Dict, List
import uuid

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

pytestmark = pytest.mark.asyncio

class TestClient:
    """Test WebSocket client that can send and receive messages"""
    
    def __init__(self, client_id: str):
        self.client_id = client_id
        self.websocket = None
        self.received_messages = []
        self.connected = False
        
    async def connect(self, uri: str):
        """Connect to WebSocket server"""
        try:
            self.websocket = await websockets.connect(uri)
            self.connected = True
            logger.info(f"Client {self.client_id} connected to {uri}")
            
            # Send initial connection message
            await self.send_message({
                "type": "connection",
                "data": {"client_type": "test_client"},
                "client_id": self.client_id
            })
            
            return True
        except Exception as e:
            logger.error(f"Client {self.client_id} failed to connect: {e}")
            return False
            
    async def disconnect(self):
        """Disconnect from WebSocket server"""
        if self.websocket:
            await self.websocket.close()
            self.connected = False
            logger.info(f"Client {self.client_id} disconnected")
            
    async def send_message(self, message_data: Dict):
        """Send message to server"""
        if not self.websocket:
            logger.error(f"Client {self.client_id} not connected")
            return
            
        try:
            message_json = json.dumps(message_data)
            await self.websocket.send(message_json)
            logger.info(f"Client {self.client_id} sent: {message_data['type']}")
        except Exception as e:
            logger.error(f"Client {self.client_id} send error: {e}")
            
    async def receive_message(self, timeout: float = 2.0):
        """Receive message from server with timeout"""
        if not self.websocket:
            return None
            
        try:
            message_str = await asyncio.wait_for(
                self.websocket.recv(),
                timeout=timeout
            )
            message_data = json.loads(message_str)
            self.received_messages.append(message_data)
            logger.info(f"Client {self.client_id} received: {message_data.get('type', 'unknown')}")
            return message_data
        except asyncio.TimeoutError:
            logger.warning(f"Client {self.client_id} receive timeout")
            return None
        except Exception as e:
            logger.error(f"Client {self.client_id} receive error: {e}")
            return None
            
    async def listen_for_messages(self, duration: float = 5.0):
        """Listen for messages for a specific duration"""
        logger.info(f"Client {self.client_id} listening for {duration} seconds...")
        end_time = asyncio.get_event_loop().time() + duration
        
        while asyncio.get_event_loop().time() < end_time and self.connected:
            message = await self.receive_message(timeout=1.0)
            if message:
                logger.info(f"Client {self.client_id} got message: {message.get('type')}")

async def test_sprite_movement_broadcasting():
    """Test that sprite movements are broadcast to all connected clients"""
    logger.info("=== Testing Sprite Movement Broadcasting ===")
    
    # Create two test clients
    client1 = TestClient("test_client_1")
    client2 = TestClient("test_client_2")
    
    # Connect both clients
    uri = "ws://localhost:8001/ws"
    
    if not await client1.connect(uri):
        logger.error("Failed to connect client 1")
        return False
        
    if not await client2.connect(uri):
        logger.error("Failed to connect client 2")
        await client1.disconnect()
        return False
    
    try:
        # Wait for connection messages to be processed
        await asyncio.sleep(1.0)
        
        # Client 1 requests the default table
        await client1.send_message({
            "type": "new_table_request",
            "data": {"table_name": "default"},
            "client_id": client1.client_id
        })
        
        # Client 2 also requests the default table
        await client2.send_message({
            "type": "new_table_request", 
            "data": {"table_name": "default"},
            "client_id": client2.client_id
        })
        
        # Wait for table data responses
        await asyncio.sleep(2.0)
        
        # Client 1 sends a sprite movement update
        sprite_id = str(uuid.uuid4())
        await client1.send_message({
            "type": "table_update",
            "data": {
                "table_name": "default",
                "sprite_id": sprite_id,
                "position": [5, 7],
                "name": "Test Hero",
                "layer": "tokens"
            },
            "client_id": client1.client_id
        })
        
        logger.info("Client 1 sent sprite movement update")
        
        # Wait for broadcast to propagate
        await asyncio.sleep(2.0)
        
        # Check if client 2 received the update
        client2_updates = [msg for msg in client2.received_messages 
                          if msg.get('type') == 'table_update']
        
        if client2_updates:
            logger.info("✅ SUCCESS: Client 2 received sprite movement update!")
            logger.info(f"Update data: {client2_updates[-1].get('data', {})}")
            return True
        else:
            logger.error("❌ FAILURE: Client 2 did not receive sprite movement update")
            logger.info(f"Client 2 received messages: {[msg.get('type') for msg in client2.received_messages]}")
            return False
            
    finally:
        # Clean up connections
        await client1.disconnect()
        await client2.disconnect()

async def test_multiple_clients_broadcasting():
    """Test broadcasting with multiple clients"""
    logger.info("=== Testing Multiple Clients Broadcasting ===")
    
    # Create three test clients
    clients = [TestClient(f"test_client_{i}") for i in range(1, 4)]
    uri = "ws://localhost:8001/ws"
    
    # Connect all clients
    connected_clients = []
    for client in clients:
        if await client.connect(uri):
            connected_clients.append(client)
        else:
            logger.error(f"Failed to connect {client.client_id}")
    
    if len(connected_clients) < 2:
        logger.error("Need at least 2 connected clients for test")
        return False
    
    try:
        # Wait for connections to stabilize
        await asyncio.sleep(1.0)
        
        # All clients request the default table
        for client in connected_clients:
            await client.send_message({
                "type": "new_table_request",
                "data": {"table_name": "default"},
                "client_id": client.client_id
            })
        
        await asyncio.sleep(2.0)
        
        # First client sends an update
        sprite_id = str(uuid.uuid4())
        await connected_clients[0].send_message({
            "type": "table_update",
            "data": {
                "table_name": "default",
                "sprite_id": sprite_id,
                "position": [3, 4],
                "name": "Broadcast Test Sprite",
                "layer": "tokens"
            },
            "client_id": connected_clients[0].client_id
        })
        
        logger.info(f"Client {connected_clients[0].client_id} sent broadcast update")
        
        # Wait for broadcast
        await asyncio.sleep(2.0)
        
        # Check if other clients received the update
        success_count = 0
        for i, client in enumerate(connected_clients[1:], 1):
            updates = [msg for msg in client.received_messages 
                      if msg.get('type') == 'table_update']
            if updates:
                logger.info(f"✅ Client {client.client_id} received update")
                success_count += 1
            else:
                logger.error(f"❌ Client {client.client_id} did not receive update")
        
        if success_count == len(connected_clients) - 1:
            logger.info("✅ SUCCESS: All clients received broadcast update!")
            return True
        else:
            logger.error(f"❌ FAILURE: Only {success_count}/{len(connected_clients)-1} clients received update")
            return False
            
    finally:
        # Clean up all connections
        for client in connected_clients:
            await client.disconnect()

async def run_broadcasting_tests():
    """Run all broadcasting tests"""
    logger.info("Starting WebSocket Broadcasting Tests...")
    
    # Test 1: Basic sprite movement broadcasting
    test1_success = await test_sprite_movement_broadcasting()
    
    # Wait between tests
    await asyncio.sleep(3.0)
    
    # Test 2: Multiple clients broadcasting
    test2_success = await test_multiple_clients_broadcasting()
    
    # Summary
    logger.info("=== Test Results ===")
    logger.info(f"Sprite Movement Broadcasting: {'PASS' if test1_success else 'FAIL'}")
    logger.info(f"Multiple Clients Broadcasting: {'PASS' if test2_success else 'FAIL'}")
    
    if test1_success and test2_success:
        logger.info("🎉 ALL TESTS PASSED - Broadcasting is working correctly!")
        return True
    else:
        logger.error("❌ SOME TESTS FAILED - Broadcasting needs fixing")
        return False

if __name__ == "__main__":
    asyncio.run(run_broadcasting_tests())
