import asyncio
import logging
import threading
import time
import json
import requests
import websockets
from typing import Optional, Callable, Dict, Any
import hashlib
import os
import queue  # Use regular queue instead of asyncio.Queue for thread safety

logger = logging.getLogger(__name__)

class WebSocketMessageBuffer:
    """Handle WebSocket message queuing and delivery using thread-safe queues"""
    def __init__(self):
        self.incoming_queue = queue.Queue()  # Thread-safe queue
        self.outgoing_queue = queue.Queue()  # Thread-safe queue
        
    def add_incoming(self, message: str):
        """Add incoming WebSocket message to queue"""
        self.incoming_queue.put(message)
        
    def get_incoming(self) -> Optional[str]:
        """Get next incoming message, non-blocking"""
        try:
            return self.incoming_queue.get_nowait()
        except queue.Empty:
            return None
            
    def add_outgoing(self, message: str):
        """Add outgoing message to queue"""
        self.outgoing_queue.put(message)
        
    def get_outgoing(self) -> Optional[str]:
        """Get next outgoing message, non-blocking"""
        try:
            return self.outgoing_queue.get_nowait()
        except queue.Empty:
            return None

class WebSocketClient:
    """WebSocket-based client for TTRPG server"""
    
    def __init__(self, server_url: str = "http://localhost:8000"):
        self.server_url = server_url.rstrip('/')
        # Convert HTTP URLs to WebSocket URLs or handle existing WebSocket URLs
        if self.server_url.startswith('http://'):
            self.websocket_url = self.server_url.replace('http://', 'ws://') + '/ws'
        elif self.server_url.startswith('https://'):
            self.websocket_url = self.server_url.replace('https://', 'wss://') + '/ws'
        elif self.server_url.startswith('ws://') or self.server_url.startswith('wss://'):
            # Already a WebSocket URL, just add /ws if not present
            if '/ws' not in self.server_url:
                self.websocket_url = self.server_url + '/ws'
            else:
                self.websocket_url = self.server_url
        else:
            # Plain hostname:port, assume WebSocket
            self.websocket_url = f"ws://{self.server_url}/ws"
            
        self.client_id = hashlib.md5(f"{time.time()}_{os.getpid()}".encode()).hexdigest()[:8]
        
        self.message_buffer = WebSocketMessageBuffer()
        self.websocket = None
        self.connection_task = None
        self.sender_task = None
        self.is_connected = False
        self.last_ping = time.time()
        self._stop_event = threading.Event()
        
    async def connect_websocket(self):
        """Establish WebSocket connection and handle messages"""
        try:
            logger.info(f"Connecting to WebSocket at {self.websocket_url}")
            
            async with websockets.connect(self.websocket_url) as websocket:
                self.websocket = websocket
                self.is_connected = True
                logger.info(f"WebSocket connected. Client ID: {self.client_id}")
                
                # Send registration message
                await self.register_with_websocket()
                
                # Start message handling tasks
                receive_task = asyncio.create_task(self.receive_messages())
                send_task = asyncio.create_task(self.send_messages())
                ping_task = asyncio.create_task(self.ping_loop())
                
                # Wait for any task to complete (usually when connection is lost)
                done, pending = await asyncio.wait(
                    [receive_task, send_task, ping_task],
                    return_when=asyncio.FIRST_COMPLETED
                )
                
                # Cancel remaining tasks
                for task in pending:
                    task.cancel()
                    
        except websockets.exceptions.ConnectionClosed:
            logger.info("WebSocket connection closed")
        except Exception as e:
            logger.error(f"WebSocket connection error: {e}")
        finally:
            self.is_connected = False
            self.websocket = None

    async def register_with_websocket(self):
        """Send registration message via WebSocket"""
        try:
            registration_message = {
                "type": "register",
                "client_id": self.client_id,
                "client_type": "ttrpg_client"
            }
            
            await self.websocket.send(json.dumps(registration_message))
            logger.info(f"Registration message sent via WebSocket")
            
        except Exception as e:
            logger.error(f"WebSocket registration error: {e}")

    async def register_with_server_http(self) -> bool:
        """Register this client with the server via HTTP (for compatibility)"""
        try:
            response = requests.post(
                f"{self.server_url}/api/client/register",
                json={
                    "client_id": self.client_id,
                    "client_type": "websocket_client",
                    "connection_type": "websocket"
                },
                timeout=10
            )
            
            if response.status_code == 200:
                logger.info(f"Successfully registered with server via HTTP. Client ID: {self.client_id}")
                return True
            else:
                logger.error(f"HTTP registration failed: {response.status_code} - {response.text}")
                return False
                
        except Exception as e:
            logger.error(f"HTTP registration error: {e}")
            return False

    async def receive_messages(self):
        """Receive messages from WebSocket"""
        try:
            async for message in self.websocket:
                logger.debug(f"Received WebSocket message: {message[:100]}...")
                self.message_buffer.add_incoming(message)
                
        except websockets.exceptions.ConnectionClosed:
            logger.info("WebSocket receive connection closed")
        except Exception as e:
            logger.error(f"WebSocket receive error: {e}")

    async def send_messages(self):
        """Send queued messages via WebSocket"""
        try:
            while self.is_connected and not self._stop_event.is_set():
                message = self.message_buffer.get_outgoing()
                if message:
                    await self.websocket.send(message)
                    logger.debug(f"Sent WebSocket message: {message[:100]}...")
                else:
                    await asyncio.sleep(0.1)  # Small delay if no messages
                    
        except websockets.exceptions.ConnectionClosed:
            logger.info("WebSocket send connection closed")
        except Exception as e:
            logger.error(f"WebSocket send error: {e}")

    async def ping_loop(self):
        """Send periodic pings to keep connection alive"""
        try:
            while self.is_connected and not self._stop_event.is_set():
                await asyncio.sleep(30)  # Ping every 30 seconds
                if self.is_connected:
                    ping_message = {
                        "type": "ping",
                        "client_id": self.client_id,
                        "timestamp": time.time()
                    }
                    await self.websocket.send(json.dumps(ping_message))
                    self.last_ping = time.time()
                    logger.debug("Sent WebSocket ping")
                    
        except websockets.exceptions.ConnectionClosed:
            logger.info("WebSocket ping connection closed")
        except Exception as e:
            logger.error(f"WebSocket ping error: {e}")

    def start_connection_thread(self):
        """Start WebSocket connection in a separate thread"""
        def run_connection():
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
            try:
                loop.run_until_complete(self.connect_websocket())
            except Exception as e:
                logger.error(f"WebSocket connection thread error: {e}")
            finally:
                loop.close()
        
        self.connection_task = threading.Thread(target=run_connection, daemon=True)
        self.connection_task.start()
        
        # Give connection time to establish
        time.sleep(2)

    def send_data(self, data: str):
        """Send data via WebSocket (queued)"""
        if self.is_connected:
            self.message_buffer.add_outgoing(data)
            logger.debug(f"Queued message for WebSocket: {data[:100]}...")
        else:
            logger.warning("Cannot send data - WebSocket not connected")    
    def receive_data(self) -> Optional[str]:
        """Receive data from WebSocket queue"""
        return self.message_buffer.get_incoming()

    def ping_server(self):
        """Send ping to server (handled by ping_loop)"""
        # Pinging is handled automatically by ping_loop
        logger.debug("Ping requested (handled by automatic ping loop)")

    def close_connection(self):
        """Close WebSocket connection"""
        try:
            self._stop_event.set()
            self.is_connected = False
            
            # Send unregistration message if possible
            if self.websocket:
                unregister_message = {
                    "type": "unregister",
                    "client_id": self.client_id
                }
                # Note: This is synchronous, but the connection might be closing
                try:
                    asyncio.run(self.websocket.send(json.dumps(unregister_message)))
                except:
                    pass  # Ignore errors during shutdown
            
            logger.info("WebSocket client disconnected")
            
        except Exception as e:
            logger.error(f"WebSocket disconnect error: {e}")


def init_connection(server_url: str = "http://localhost:8000") -> Optional[WebSocketClient]:
    """Initialize WebSocket connection"""
    try:
        client = WebSocketClient(server_url)
        
        # Start WebSocket connection
        client.start_connection_thread()
        
        # Wait a bit more for WebSocket connection to establish
        time.sleep(3)
        
        if client.is_connected:
            logger.info("WebSocket connection established")
            return client
        else:
            logger.warning("WebSocket connection not established yet, but client created")
            return client  # Return anyway, connection might establish later
            
    except Exception as e:
        logger.error(f"WebSocket init error: {e}")
        return None

def send_data(client: WebSocketClient, data: str):
    """Send data via WebSocket client"""
    if client:
        client.send_data(data)

async def receive_data_async(client: WebSocketClient) -> Optional[str]:
    """Receive data via WebSocket client (async)"""
    if client:
        return client.receive_data()
    return None

def receive_data(client: WebSocketClient) -> Optional[str]:
    """Receive data via WebSocket client (sync wrapper)"""
    if not client:
        return None
    
    return client.receive_data()

def close_connection(client: WebSocketClient):
    """Close WebSocket connection"""
    if client:
        client.close_connection()

async def register_client_async(client: WebSocketClient) -> bool:
    """Register client with server (async version)"""
    if client:
        return await client.register_with_server_http()
    return False

if __name__ == "__main__":
    # Test WebSocket client
    import sys
    
    server_url = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8000"
    
    client = init_connection(server_url)
    if client:
        print("WebSocket client started. Testing connection...")
        
        # Wait for connection
        for i in range(10):
            if client.is_connected:
                break
            print(f"Waiting for connection... ({i+1}/10)")
            time.sleep(1)
        
        if client.is_connected:
            # Test sending a message
            send_data(client, '{"type": "ping", "data": {}}')
            
            # Test receiving messages
            for i in range(5):
                message = receive_data(client)
                if message:
                    print(f"Received: {message}")
                time.sleep(1)
        else:
            print("Failed to establish WebSocket connection")
        
        close_connection(client)
    else:
        print("Failed to start WebSocket client")
