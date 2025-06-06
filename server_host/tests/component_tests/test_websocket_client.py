"""
WebSocket Test Client for TTRPG Server
Tests the WebSocket functionality of the converted server
"""
import asyncio
import json
import logging
import websockets
from typing import Dict, Any

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class WebSocketTestClient:
    def __init__(self, server_url="ws://localhost:8000/ws", client_id="test_client_1"):
        self.server_url = server_url
        self.client_id = client_id
        self.websocket = None
        self.running = False
        
    async def connect(self):
        """Connect to WebSocket server"""
        try:
            logger.info(f"Connecting to {self.server_url}")
            self.websocket = await websockets.connect(self.server_url)
            self.running = True
            logger.info("Connected successfully")
            
            # Send initial registration message
            await self.register()
            
            return True
        except Exception as e:
            logger.error(f"Connection failed: {e}")
            return False
    
    async def register(self):
        """Register with the server"""
        registration_message = {
            "type": "register",
            "client_id": self.client_id,
            "client_type": "test_client"
        }
        await self.send_message(registration_message)
        logger.info(f"Sent registration for client {self.client_id}")
    
    async def send_message(self, message: Dict[str, Any]):
        """Send a message to the server"""
        if self.websocket:
            message_str = json.dumps(message)
            await self.websocket.send(message_str)
            logger.info(f"Sent message: {message}")
    
    async def listen_for_messages(self):
        """Listen for incoming messages"""
        try:
            while self.running and self.websocket:
                message = await self.websocket.recv()
                try:
                    data = json.loads(message)
                    logger.info(f"Received message: {data}")
                    await self.handle_message(data)
                except json.JSONDecodeError:
                    logger.warning(f"Received non-JSON message: {message}")
        except websockets.exceptions.ConnectionClosed:
            logger.info("WebSocket connection closed")
        except Exception as e:
            logger.error(f"Error listening for messages: {e}")
    
    async def handle_message(self, message: Dict[str, Any]):
        """Handle received messages"""
        message_type = message.get("type")
        
        if message_type == "ping":
            # Respond to ping with pong
            pong_message = {
                "type": "pong",
                "client_id": self.client_id,
                "timestamp": message.get("timestamp")
            }
            await self.send_message(pong_message)
        elif message_type == "registration_response":
            success = message.get("success", False)
            if success:
                logger.info("Successfully registered with server")
            else:
                logger.error(f"Registration failed: {message.get('error', 'Unknown error')}")
        else:
            logger.info(f"Received message of type: {message_type}")
    
    async def send_test_messages(self):
        """Send some test messages"""
        test_messages = [
            {
                "type": "game_message",
                "client_id": self.client_id,
                "content": "Hello from WebSocket client!"
            },
            {
                "type": "table_join",
                "client_id": self.client_id,
                "table_name": "test_table"
            },
            {
                "type": "move_token",
                "client_id": self.client_id,
                "token_id": "player1",
                "x": 50,
                "y": 75
            }
        ]
        
        for i, message in enumerate(test_messages, 1):
            logger.info(f"Sending test message {i}/{len(test_messages)}")
            await self.send_message(message)
            await asyncio.sleep(2)  # Wait 2 seconds between messages
    
    async def disconnect(self):
        """Disconnect from server"""
        self.running = False
        if self.websocket:
            await self.websocket.close()
            logger.info("Disconnected from server")

async def run_test_client():
    """Run the test client"""
    client = WebSocketTestClient()
    
    # Connect to server
    if not await client.connect():
        logger.error("Failed to connect to server")
        return
    
    # Start listening for messages in background
    listen_task = asyncio.create_task(client.listen_for_messages())
    
    # Send test messages
    await asyncio.sleep(1)  # Give time for registration
    await client.send_test_messages()
    
    # Run for a while to receive any responses
    logger.info("Waiting for server responses...")
    await asyncio.sleep(10)
    
    # Cleanup
    await client.disconnect()
    listen_task.cancel()
    
    logger.info("Test completed")

if __name__ == "__main__":
    logger.info("Starting WebSocket test client...")
    asyncio.run(run_test_client())
