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
    """WebSocket-based client for TTRPG server with session-based architecture"""
    
    def __init__(self, server_url: str = "http://localhost:8000"):
        self.server_url = server_url.rstrip('/')
        # Store base WebSocket URL without specific endpoint
        if self.server_url.startswith('http://'):
            self.base_websocket_url = self.server_url.replace('http://', 'ws://')
        elif self.server_url.startswith('https://'):
            self.base_websocket_url = self.server_url.replace('https://', 'wss://')
        elif self.server_url.startswith('ws://') or self.server_url.startswith('wss://'):
            self.base_websocket_url = self.server_url
        else:
            # Plain hostname:port, assume WebSocket
            self.base_websocket_url = f"ws://{self.server_url}"
            
        # Remove any existing /ws path for clean base URL
        if '/ws' in self.base_websocket_url:
            self.base_websocket_url = self.base_websocket_url.split('/ws')[0]
            
        self.client_id = hashlib.md5(f"{time.time()}_{os.getpid()}".encode()).hexdigest()[:8]
        
        # Authentication state
        self.jwt_token = None
        self.session_code = None
        self.current_websocket_url = None
        
        self.message_buffer = WebSocketMessageBuffer()
        self.websocket = None
        self.connection_task = None
        self.sender_task = None
        self.is_connected = False
        self.last_ping = time.time()
        self._stop_event = threading.Event()

    def set_auth_token(self, jwt_token: str):
        """Set JWT authentication token"""
        self.jwt_token = jwt_token

    def build_websocket_url(self, session_code: str) -> str:
        """Build WebSocket URL for game session with authentication"""
        url = f"{self.base_websocket_url}/ws/game/{session_code}"
        if self.jwt_token:
            url += f"?token={self.jwt_token}"
        return url

    def connect_to_session(self, session_code: str) -> bool:
        """Connect to a specific game session"""
        if not self.jwt_token:
            logger.error("Cannot connect to session without authentication token")
            return False
            
        self.session_code = session_code
        self.current_websocket_url = self.build_websocket_url(session_code)
        
        # Start connection in background thread
        self.start_connection_thread()
        return True

    async def connect_websocket(self):
        """Establish WebSocket connection and handle messages"""
        if not self.current_websocket_url:
            logger.error("No WebSocket URL set - call connect_to_session first")
            return
            
        try:
            logger.info(f"Connecting to WebSocket at {self.current_websocket_url}")
            
            async with websockets.connect(self.current_websocket_url) as websocket:
                self.websocket = websocket
                self.is_connected = True
                logger.info(f"WebSocket connected to session {self.session_code}")
                
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

    async def receive_messages(self):
        """Receive messages from WebSocket"""
        try:
            if self.websocket:
                async for message in self.websocket:
                    message_str = message if isinstance(message, str) else message.decode('utf-8')
                    logger.debug(f"Received WebSocket message: {message_str[:100]}...")
                    self.message_buffer.add_incoming(message_str)
                
        except websockets.exceptions.ConnectionClosed:
            logger.info("WebSocket receive connection closed")
        except Exception as e:
            logger.error(f"WebSocket receive error: {e}")

    async def send_messages(self):
        """Send queued messages via WebSocket"""
        try:
            while self.is_connected and not self._stop_event.is_set():
                message = self.message_buffer.get_outgoing()
                if message and self.websocket:
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
                if self.is_connected and self.websocket:
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
            
            logger.info("WebSocket client disconnected")
            
        except Exception as e:
            logger.error(f"WebSocket disconnect error: {e}")


def init_connection(server_url: str = "http://localhost:8000") -> Optional[WebSocketClient]:
    """Initialize WebSocket client (connection happens later via connect_to_session)"""
    try:
        client = WebSocketClient(server_url)
        logger.info("WebSocket client initialized (ready for session connection)")
        return client
            
    except Exception as e:
        logger.error(f"WebSocket init error: {e}")
        return None

def send_data(client: WebSocketClient, data: str):
    """Send data via WebSocket client"""
    if client:
        client.send_data(data)

def receive_data(client: WebSocketClient) -> Optional[str]:
    """Receive data via WebSocket client"""
    if not client:
        return None
    
    return client.receive_data()

def close_connection(client: WebSocketClient):
    """Close WebSocket connection"""
    if client:
        client.close_connection()

if __name__ == "__main__":
    # Test WebSocket client
    import sys
    
    server_url = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8000"
    session_code = sys.argv[2] if len(sys.argv) > 2 else "TEST123"
    
    client = init_connection(server_url)
    if client:
        logger.info("WebSocket client started. Testing connection...")

        # Set a dummy token for testing
        client.set_auth_token("dummy_token_for_testing")
        
        # Connect to session
        if client.connect_to_session(session_code):
            # Wait for connection
            for i in range(10):
                if client.is_connected:
                    break
                logger.info(f"Waiting for connection... ({i+1}/10)")
                time.sleep(1)
            
            if client.is_connected:
                # Test sending a message
                send_data(client, '{"type": "ping", "data": {}}')
                
                # Test receiving messages
                for i in range(5):
                    message = receive_data(client)
                    if message:
                        logger.info(f"Received: {message}")
                    time.sleep(1)
            else:
                logger.error("Failed to establish WebSocket connection")
        else:
            logger.error("Failed to connect to session")

        close_connection(client)
    else:
        logger.error("Failed to start WebSocket client")
